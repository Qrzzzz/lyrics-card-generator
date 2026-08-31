import { NextResponse } from "next/server";
import {
  buildChatCompletionsRequestBody,
  getChatCompletionsUrl,
  INSECURE_BASE_URL_ERROR_CODE,
  INVALID_BASE_URL_ERROR_CODE,
  readProviderError
} from "@/lib/ai/provider-request";
import {
  getChatCompletionMessage,
  getProviderErrorMessage,
  readProviderResponseBody
} from "@/lib/ai/provider-response";
import { validateAppMutationRequest } from "@/lib/app-request";
import { readLimitedJson } from "@/lib/json-request";
import { ResponseBodyLimitExceededError } from "@/lib/bounded-response";
import {
  AIStreamError,
  assertAICompletionBudgets,
  createAIStreamDeadline,
  resourceBudgets
} from "@/electron/ai-stream";
import type { SaveAISettingsInput } from "@/lib/ai/types";

export const runtime = "nodejs";

type TranslateBody = {
  prompt?: string;
  reasoning?: boolean;
  settings?: SaveAISettingsInput & { apiKey?: string };
};

/**
 * Browser-preview transport boundary for provider requests. The renderer must
 * pass the same-app mutation checks, and client cancellation is forwarded to
 * the provider through the original request signal.
 */
export async function POST(request: Request) {
  const rejection = validateAppMutationRequest(request, "application/json");
  if (rejection) {
    return errorResponse(rejection.code, rejection.status);
  }

  const bodyResult = await readLimitedJson<TranslateBody>(
    request,
    resourceBudgets.jsonRequestBytes.aiTranslate
  );
  if (!bodyResult.ok) {
    const code = bodyResult.reason === "too_large"
      ? "request_too_large"
      : bodyResult.reason === "cancelled"
        ? "cancelled"
        : "invalid_request";
    return errorResponse(code, code === "request_too_large" ? 413 : code === "cancelled" ? 499 : 400);
  }
  const body = bodyResult.value;

  const prompt = body.prompt?.trim() ?? "";
  const settings = body.settings;
  const apiKey = settings?.apiKey?.trim() ?? "";

  if (!prompt) {
    return errorResponse("empty_prompt", 400);
  }
  if (!apiKey) {
    return errorResponse("missing_api_key", 400);
  }
  if (!settings?.model?.trim()) {
    return errorResponse("missing_model", 400);
  }

  let endpoint: string;
  try {
    endpoint = getChatCompletionsUrl(settings.baseUrl);
  } catch (error) {
    const code = error instanceof Error && error.message === INSECURE_BASE_URL_ERROR_CODE
      ? INSECURE_BASE_URL_ERROR_CODE
      : INVALID_BASE_URL_ERROR_CODE;
    return errorResponse(code, 400);
  }

  const requestBody = buildChatCompletionsRequestBody({
    baseUrl: settings.baseUrl,
    model: settings.model.trim(),
    prompt,
    reasoning: body.reasoning,
    temperature: settings.temperature
  });

  const deadline = createAIStreamDeadline(request.signal);
  let streamOwnsDeadline = false;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: deadline.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      return errorResponse(
        "provider_error",
        response.status,
        await readProviderError(response, deadline.signal)
      );
    }
    const contentType = response.headers.get("content-type") || "";
    if (!response.body) {
      return errorResponse("empty_stream", 502);
    }

    if (!contentType.includes("text/event-stream")) {
      const providerBody = await readProviderResponseBody(response, deadline.signal);
      if (providerBody.kind === "json") {
        const { content, reasoningContent } = getChatCompletionMessage(providerBody);
        assertAICompletionBudgets(content, reasoningContent);
        return NextResponse.json(providerBody.data, { status: 200 });
      }

      return errorResponse("invalid_response", 502, getProviderErrorMessage(providerBody, 502));
    }

    // Relay one upstream chunk per downstream pull. The renderer owns the SSE
    // event/output budgets; this route preserves byte framing and backpressure
    // while keeping cancellation and the end-to-end deadline attached upstream.
    streamOwnsDeadline = true;
    return new Response(relayProviderStream(response.body, deadline), {
      status: 200,
      headers: {
        "content-type": contentType || "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform"
      }
    });
  } catch (error) {
    if (request.signal.aborted) {
      return errorResponse("cancelled", 499);
    }
    if (error instanceof ResponseBodyLimitExceededError) {
      return errorResponse("response_too_large", 502);
    }
    const deadlineError = deadline.signal.reason;
    if (deadlineError instanceof AIStreamError) {
      return errorResponse(deadlineError.code, deadlineError.code === "cancelled" ? 499 : 504);
    }
    if (error instanceof AIStreamError) {
      return errorResponse(error.code, 502);
    }
    return errorResponse("network", 502);
  } finally {
    if (!streamOwnsDeadline) deadline.dispose();
  }
}

function relayProviderStream(
  body: ReadableStream<Uint8Array>,
  deadline: ReturnType<typeof createAIStreamDeadline>
) {
  const reader = body.getReader();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    deadline.dispose();
    try { reader.releaseLock(); } catch {}
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          finish();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        finish();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        finish();
      }
    }
  }, { highWaterMark: 0 });
}

function errorResponse(code: string, status: number, diagnostic?: string) {
  return NextResponse.json({ error: { code, diagnostic } }, { status });
}
