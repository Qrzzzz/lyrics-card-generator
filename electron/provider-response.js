async function readProviderResponseBody(response) {
  try {
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
  const normalized = String(baseUrl || "").trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("Base URL 无效，请检查设置。");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Base URL 无效，请检查设置。");
  }
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
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
  buildChatCompletionsRequestBody,
  getChatCompletionMessage,
  getChatCompletionsUrl,
  getProviderErrorMessage,
  readProviderError,
  readProviderResponseBody,
  usesDeepSeekThinking
};
