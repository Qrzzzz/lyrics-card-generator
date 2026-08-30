const INVALID_BASE_URL_ERROR_CODE = "invalid_base_url";
const INSECURE_BASE_URL_ERROR_CODE = "insecure_base_url";

async function readProviderResponseBody(response) {
  try {
    // Parse a clone so the original body remains available for a useful text fallback.
    return { kind: "json", data: await response.clone().json() };
  } catch {
    try {
      const text = await response.text();
      return text.trim() ? { kind: "text", text: text.trim() } : { kind: "empty" };
    } catch {
      return { kind: "empty" };
    }
  }
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

async function readProviderError(response) {
  return getProviderErrorMessage(await readProviderResponseBody(response), response.status);
}

module.exports = {
  INVALID_BASE_URL_ERROR_CODE,
  INSECURE_BASE_URL_ERROR_CODE,
  buildChatCompletionsRequestBody,
  getChatCompletionMessage,
  getChatCompletionsUrl,
  getProviderErrorMessage,
  isLoopbackProviderHostname,
  readProviderError,
  readProviderResponseBody,
  usesDeepSeekThinking
};
