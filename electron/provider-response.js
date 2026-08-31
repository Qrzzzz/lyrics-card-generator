const INVALID_BASE_URL_ERROR_CODE = "invalid_base_url";
const INSECURE_BASE_URL_ERROR_CODE = "insecure_base_url";
const resourceBudgets = require("./resource-budgets.json");

class ProviderResponseLimitError extends Error {
  constructor(limitBytes) {
    super(`Provider response exceeded the ${limitBytes}-byte limit.`);
    this.name = "ProviderResponseLimitError";
    this.code = "response_too_large";
  }
}

async function readProviderResponseBody(response, signal) {
  const text = await readResponseTextBounded(
    response,
    resourceBudgets.upstreamResponseBytes.aiProviderBody,
    signal
  );
  if (!text.trim()) return { kind: "empty" };
  try {
    return { kind: "json", data: JSON.parse(text) };
  } catch {
    return { kind: "text", text: text.trim() };
  }
}

async function readResponseTextBounded(response, limitBytes, signal) {
  const rawLength = response.headers.get("content-length")?.trim();
  if (rawLength && /^\d+$/.test(rawLength)) {
    const normalized = rawLength.replace(/^0+(?=\d)/, "");
    const limit = String(limitBytes);
    if (normalized.length > limit.length || (normalized.length === limit.length && normalized > limit)) {
      const error = new ProviderResponseLimitError(limitBytes);
      await response.body?.cancel(error).catch(() => {});
      throw error;
    }
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await readWithSignal(reader, signal);
      if (done) break;
      // Node fetch exposes transparently decompressed bytes through this stream.
      total += value.byteLength;
      if (total > limitBytes) {
        const error = new ProviderResponseLimitError(limitBytes);
        await reader.cancel(error).catch(() => {});
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Cancellation already released the response transport.
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function readWithSignal(reader, signal) {
  if (!signal) return reader.read();
  if (signal.aborted) return Promise.reject(abortReason(signal));

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () => {
      const reason = abortReason(signal);
      void reader.cancel(reason).catch(() => {});
      finish(() => reject(reason));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void reader.read().then(
      (result) => finish(() => resolve(result)),
      (error) => finish(() => reject(error))
    );
  });
}

function abortReason(signal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The provider response read was aborted.", "AbortError");
}

function getChatCompletionsUrl(baseUrl) {
  let parsed;
  try {
    parsed = new URL(String(baseUrl || "").trim());
  } catch {
    throw new Error(INVALID_BASE_URL_ERROR_CODE);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(INVALID_BASE_URL_ERROR_CODE);
  }
  if (parsed.protocol === "http:" && !isLoopbackProviderHostname(parsed.hostname)) {
    throw new Error(INSECURE_BASE_URL_ERROR_CODE);
  }

  const normalizedPathname = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = normalizedPathname.endsWith("/chat/completions")
    ? normalizedPathname
    : `${normalizedPathname}/chat/completions`;
  return parsed.toString();
}

function isLoopbackProviderHostname(hostname) {
  let normalized = String(hostname || "").trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  if (normalized.endsWith(".")) {
    normalized = normalized.slice(0, -1);
  }

  if (normalized === "localhost" || normalized === "::1") {
    return true;
  }

  // Keep classification deterministic across validation and fetch. DNS names
  // that happen to resolve to loopback are not safe plaintext provider URLs.
  const octets = normalized.split(".");
  return octets.length === 4
    && octets[0] === "127"
    && octets.every((octet) => /^(?:0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255);
}

function usesDeepSeekThinking(baseUrl, model) {
  const normalizedModel = String(model).toLowerCase();
  try {
    return new URL(baseUrl).hostname.endsWith("deepseek.com") || normalizedModel.startsWith("deepseek-");
  } catch {
    return normalizedModel.startsWith("deepseek-");
  }
}

function buildChatCompletionsRequestBody({ baseUrl, model, prompt, reasoning = false, temperature }) {
  const requestBody = {
    model,
    messages: [{ role: "user", content: prompt }],
    stream: true
  };

  // DeepSeek uses a provider-specific switch; compatible APIs use reasoning_effort instead.
  if (usesDeepSeekThinking(baseUrl, model)) {
    requestBody.thinking = { type: reasoning ? "enabled" : "disabled" };
  } else if (reasoning) {
    requestBody.reasoning_effort = "medium";
  }

  if (!reasoning) {
    requestBody.temperature = temperature;
  }

  return requestBody;
}

function getChatCompletionMessage(body) {
  if (body.kind !== "json" || !body.data || typeof body.data !== "object") {
    return { content: "", reasoningContent: "" };
  }

  const choice = body.data.choices?.[0];
  return {
    content: typeof choice?.message?.content === "string" ? choice.message.content : "",
    reasoningContent: typeof choice?.message?.reasoning_content === "string" ? choice.message.reasoning_content : ""
  };
}

function getProviderErrorMessage(body, status) {
  if (body.kind === "json") {
    const data = body.data;
    if (data && typeof data === "object") {
      const error = data.error;
      const message =
        typeof error === "string"
          ? error
          : error && typeof error === "object" && typeof error.message === "string"
            ? error.message
            : typeof data.message === "string"
              ? data.message
              : "";
      if (message.trim()) {
        return `AI 接口请求失败：${message.trim()}`;
      }
    }
  }

  if (body.kind === "text") {
    return `AI 接口请求失败：${body.text.slice(0, 500)}`;
  }

  return `AI 接口请求失败（HTTP ${status}）。`;
}

async function readProviderError(response, signal) {
  return getProviderErrorMessage(await readProviderResponseBody(response, signal), response.status);
}

module.exports = {
  INVALID_BASE_URL_ERROR_CODE,
  INSECURE_BASE_URL_ERROR_CODE,
  ProviderResponseLimitError,
  buildChatCompletionsRequestBody,
  getChatCompletionMessage,
  getChatCompletionsUrl,
  getProviderErrorMessage,
  isLoopbackProviderHostname,
  readProviderError,
  readProviderResponseBody,
  usesDeepSeekThinking
};
