export type ProviderResponseBody =
  | { kind: "json"; data: unknown }
  | { kind: "text"; text: string }
  | { kind: "empty" };

export async function readProviderResponseBody(response: Response): Promise<ProviderResponseBody> {
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

export function getChatCompletionMessage(body: ProviderResponseBody) {
  if (body.kind !== "json" || !body.data || typeof body.data !== "object") {
    return { content: "", reasoningContent: "" };
  }

  const choices = (body.data as { choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown } }> }).choices;
  const message = choices?.[0]?.message;
  return {
    content: typeof message?.content === "string" ? message.content : "",
    reasoningContent: typeof message?.reasoning_content === "string" ? message.reasoning_content : ""
  };
}

export function getProviderErrorMessage(body: ProviderResponseBody, status: number) {
  if (body.kind === "json" && body.data && typeof body.data === "object") {
    const data = body.data as { error?: string | { message?: unknown }; message?: unknown };
    const message =
      typeof data.error === "string"
        ? data.error
        : data.error && typeof data.error === "object" && typeof data.error.message === "string"
          ? data.error.message
          : typeof data.message === "string"
            ? data.message
            : "";
    if (message.trim()) {
      return `AI 接口请求失败：${message.trim()}`;
    }
  }

  if (body.kind === "text") {
    return `AI 接口请求失败：${body.text.slice(0, 500)}`;
  }

  return `AI 接口请求失败（HTTP ${status}）。`;
}
