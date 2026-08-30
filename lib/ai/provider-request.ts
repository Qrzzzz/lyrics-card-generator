import { getProviderErrorMessage, readProviderResponseBody } from "./provider-response";
import type { AISettings } from "./types";

export const INVALID_BASE_URL_ERROR_CODE = "invalid_base_url";
export const INSECURE_BASE_URL_ERROR_CODE = "insecure_base_url";

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
  let parsed: URL;
  try {
    parsed = new URL(baseUrl.trim());
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

export function isLoopbackProviderHostname(hostname: string) {
  let normalized = hostname.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  if (normalized.endsWith(".")) {
    normalized = normalized.slice(0, -1);
  }

  if (normalized === "localhost" || normalized === "::1") {
    return true;
  }

  // Classify only canonical IP literals from the URL parser. Resolving an
  // arbitrary hostname here would create a validation/fetch DNS race and would
  // still allow plaintext provider traffic to leave the machine.
  const octets = normalized.split(".");
  return octets.length === 4
    && octets[0] === "127"
    && octets.every((octet) => /^(?:0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255);
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
