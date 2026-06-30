import { getProviderErrorMessage, readProviderResponseBody } from "./provider-response";
import type { AISettings } from "./types";

const INVALID_BASE_URL_MESSAGE = "Base URL \u65e0\u6548\uff0c\u8bf7\u68c0\u67e5\u8bbe\u7f6e\u3002";

type BuildChatCompletionsRequestBodyOptions = Pick<AISettings, "baseUrl" | "model" | "temperature"> & {
  prompt: string;
  reasoning?: boolean;
};

type ChatCompletionsMessage = {
  role: "user";
  content: string;
};

export type ChatCompletionsRequestBody = {
  model: string;
  messages: [ChatCompletionsMessage];
  stream: true;
  thinking?: { type: "enabled" | "disabled" };
  reasoning_effort?: "medium";
  temperature?: number;
};

export function getChatCompletionsUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(INVALID_BASE_URL_MESSAGE);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(INVALID_BASE_URL_MESSAGE);
  }
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

export function usesDeepSeekThinking(baseUrl: string, model: string) {
  const normalizedModel = model.toLowerCase();
  try {
    return new URL(baseUrl).hostname.endsWith("deepseek.com") || normalizedModel.startsWith("deepseek-");
  } catch {
    return normalizedModel.startsWith("deepseek-");
  }
}

export function buildChatCompletionsRequestBody({
  baseUrl,
  model,
  prompt,
  reasoning = false,
  temperature
}: BuildChatCompletionsRequestBodyOptions): ChatCompletionsRequestBody {
  const requestBody: ChatCompletionsRequestBody = {
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

export async function readProviderError(response: Response) {
  return getProviderErrorMessage(await readProviderResponseBody(response), response.status);
}
