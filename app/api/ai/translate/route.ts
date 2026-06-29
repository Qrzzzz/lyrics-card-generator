import { NextResponse } from "next/server";
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
    return NextResponse.json({ error: "请求格式无效。" }, { status: 400 });
  }

  const prompt = body.prompt?.trim() ?? "";
  const settings = body.settings;
  const apiKey = settings?.apiKey?.trim() ?? "";

  if (!prompt) {
    return NextResponse.json({ error: "歌词为空，请先输入歌词。" }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "未配置 API Key，请先前往设置页配置。" }, { status: 400 });
  }
  if (!settings?.model?.trim()) {
    return NextResponse.json({ error: "未配置模型，请先前往设置页填写模型名称。" }, { status: 400 });
  }

  let endpoint: string;
  try {
    endpoint = getChatCompletionsUrl(settings.baseUrl);
  } catch {
    return NextResponse.json({ error: "Base URL 无效，请检查设置。" }, { status: 400 });
  }

  const requestBody: Record<string, unknown> = {
    model: settings.model.trim(),
    messages: [{ role: "user", content: prompt }],
    stream: true
  };
  if (usesDeepSeekThinking(settings.baseUrl, settings.model)) {
    requestBody.thinking = { type: body.reasoning ? "enabled" : "disabled" };
  } else if (body.reasoning) {
    requestBody.reasoning_effort = "medium";
  }
  if (!body.reasoning) {
    requestBody.temperature = settings.temperature;
  }

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
      return NextResponse.json(
        { error: await readProviderError(response) },
        { status: response.status }
      );
    }
    const contentType = response.headers.get("content-type") || "";
    if (!response.body) {
      return NextResponse.json({ error: "接口返回为空，请重试或更换模型。" }, { status: 502 });
    }

    if (!contentType.includes("text/event-stream")) {
      const body = await readProviderResponseBody(response);
      if (body.kind === "json") {
        return NextResponse.json(body.data, { status: 200 });
      }

      return NextResponse.json({ error: getProviderErrorMessage(body, 502) }, { status: 502 });
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
      return NextResponse.json({ error: "AI 翻译已取消。" }, { status: 499 });
    }
    return NextResponse.json(
      { error: "网络请求失败，请检查 Base URL、网络连接和接口可用性。" },
      { status: 502 }
    );
  }
}

function getChatCompletionsUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  const parsed = new URL(normalized);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Unsupported protocol");
  }
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

function usesDeepSeekThinking(baseUrl: string, model: string) {
  try {
    return new URL(baseUrl).hostname.endsWith("deepseek.com") || model.toLowerCase().startsWith("deepseek-");
  } catch {
    return model.toLowerCase().startsWith("deepseek-");
  }
}

async function readProviderError(response: Response) {
  return getProviderErrorMessage(await readProviderResponseBody(response), response.status);
}
