import { NextResponse } from "next/server";
import {
  buildChatCompletionsRequestBody,
  getChatCompletionsUrl,
  readProviderError
} from "@/lib/ai/provider-request";
import { getProviderErrorMessage, readProviderResponseBody } from "@/lib/ai/provider-response";
import type { SaveAISettingsInput } from "@/lib/ai/types";

export const runtime = "nodejs";

type TranslateBody = {
  prompt?: string;
  reasoning?: boolean;
  settings?: SaveAISettingsInput & { apiKey?: string };
};

export async function POST(request: Request) {
  let body: TranslateBody;
  try {
    body = (await request.json()) as TranslateBody;
  } catch {
    return errorResponse("invalid_request", 400);
  }

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
  } catch {
    return errorResponse("invalid_base_url", 400);
  }

  const requestBody = buildChatCompletionsRequestBody({
    baseUrl: settings.baseUrl,
    model: settings.model.trim(),
    prompt,
    reasoning: body.reasoning,
    temperature: settings.temperature
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: request.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      return errorResponse("provider_error", response.status, await readProviderError(response));
    }
    const contentType = response.headers.get("content-type") || "";
    if (!response.body) {
      return errorResponse("empty_stream", 502);
    }

    if (!contentType.includes("text/event-stream")) {
      const body = await readProviderResponseBody(response);
      if (body.kind === "json") {
        return NextResponse.json(body.data, { status: 200 });
      }

      return errorResponse("invalid_response", 502, getProviderErrorMessage(body, 502));
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "content-type": contentType || "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform"
      }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return errorResponse("cancelled", 499);
    }
    return errorResponse("network", 502);
  }
}

function errorResponse(code: string, status: number, diagnostic?: string) {
  return NextResponse.json({ error: { code, diagnostic } }, { status });
}
