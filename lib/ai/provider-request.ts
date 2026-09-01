import { getProviderErrorMessage, readProviderResponseBody } from "./provider-response";
import type { AISettings } from "./types";
import resourceBudgets from "@/electron/resource-budgets.json";
import { ResponseBodyLimitExceededError } from "@/lib/bounded-response";

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

export type ConnectionTestRequestBody = {
  model: string;
  messages: [{ role: "user"; content: string }];
  stream: false;
  temperature: 0;
  max_tokens: 1;
};

export type AIProviderConnectionErrorCode =
  | "missing_api_key"
  | "missing_model"
  | "missing_base_url"
  | "invalid_base_url"
  | "insecure_base_url"
  | "provider_error"
  | "timeout"
  | "cancelled"
  | "response_too_large"
  | "network";

export class AIProviderConnectionError extends Error {
  constructor(readonly code: AIProviderConnectionErrorCode, readonly diagnostic?: string) {
    super(code);
    this.name = "AIProviderConnectionError";
  }
}

const CONNECTION_TEST_PROMPT = "Reply with exactly OK.";

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

export function buildConnectionTestRequestBody(model: string): ConnectionTestRequestBody {
  return {
    model: model.trim(),
    messages: [{ role: "user", content: CONNECTION_TEST_PROMPT }],
    stream: false,
    temperature: 0,
    max_tokens: 1
  };
}

export async function testAIProviderConnection({
  baseUrl,
  model,
  apiKey,
  signal,
  fetchImpl = fetch,
  timeoutMs = resourceBudgets.upstreamTimeoutMs.aiConnectionTest
}: Pick<AISettings, "baseUrl" | "model"> & {
  apiKey: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  if (!apiKey.trim()) throw new AIProviderConnectionError("missing_api_key");
  if (!model.trim()) throw new AIProviderConnectionError("missing_model");
  if (!baseUrl.trim()) throw new AIProviderConnectionError("missing_base_url");

  // Resolve the authoritative endpoint before fetch so rejected URLs have zero upstream effects.
  let endpoint: string;
  try {
    endpoint = getChatCompletionsUrl(baseUrl);
  } catch (error) {
    const code = error instanceof Error && error.message === INSECURE_BASE_URL_ERROR_CODE
      ? "insecure_base_url"
      : "invalid_base_url";
    throw new AIProviderConnectionError(code);
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromParent();
  else signal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("timeout"));
  }, timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey.trim()}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(buildConnectionTestRequestBody(model)),
      signal: controller.signal,
      cache: "no-store"
    });
    const body = await readProviderResponseBody(
      response,
      controller.signal,
      resourceBudgets.upstreamResponseBytes.aiConnectionTest
    );
    if (!response.ok) {
      throw new AIProviderConnectionError(
        "provider_error",
        redactConnectionSecret(getProviderErrorMessage(body, response.status), apiKey)
      );
    }
    return true;
  } catch (error) {
    if (error instanceof AIProviderConnectionError) throw error;
    if (timedOut) throw new AIProviderConnectionError("timeout");
    if (signal?.aborted) throw new AIProviderConnectionError("cancelled");
    if (error instanceof ResponseBodyLimitExceededError) {
      throw new AIProviderConnectionError("response_too_large");
    }
    throw new AIProviderConnectionError("network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

function redactConnectionSecret(message: string, apiKey: string) {
  const secret = apiKey.trim();
  return secret ? message.split(secret).join("[redacted]") : message;
}

export async function readProviderError(response: Response, signal?: AbortSignal) {
  return getProviderErrorMessage(await readProviderResponseBody(response, signal), response.status);
}
