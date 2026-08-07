import { getProviderErrorMessage, readProviderResponseBody } from "./provider-response";
import type { AISettings } from "./types";

const INVALID_BASE_URL_MESSAGE = "invalid_base_url";

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

  // Providers expose incompatible reasoning switches. DeepSeek uses thinking,
  // while other compatible endpoints conventionally accept reasoning_effort.
  if (usesDeepSeekThinking(baseUrl, model)) {
    requestBody.thinking = { type: reasoning ? "enabled" : "disabled" };
  } else if (reasoning) {
    requestBody.reasoning_effort = "medium";
  }

  // Some reasoning models reject or ignore temperature, so omit it entirely
  // instead of sending a potentially conflicting generation parameter.
  if (!reasoning) {
    requestBody.temperature = temperature;
  }

  return requestBody;
}

export async function readProviderError(response: Response) {
  return getProviderErrorMessage(await readProviderResponseBody(response), response.status);
}
