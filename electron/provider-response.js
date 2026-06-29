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

module.exports = {
  getChatCompletionMessage,
  getProviderErrorMessage,
  readProviderResponseBody
};
