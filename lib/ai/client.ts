import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/types";
import { isTranslationStyle } from "@/lib/ai/styles";
import type {
  AISettings,
  AISettingsSummary,
  AITranslationStreamParams,
  SaveAISettingsInput
} from "@/lib/ai/types";

const BROWSER_SETTINGS_KEY = "lyric-card-generator-ai-settings";

type BrowserStoredSettings = AISettings;
let browserSessionApiKey = "";

export class AITranslationError extends Error {
  constructor(message: string, readonly code: string = "unknown") {
    super(message);
    this.name = "AITranslationError";
  }
}

export async function loadAISettings(): Promise<AISettingsSummary> {
  const desktop = getLyricsCardDesktopApi();
  if (desktop) {
    return desktop.loadAISettings();
  }

  const stored = readBrowserSettings();
  return {
    baseUrl: stored.baseUrl,
    model: stored.model,
    temperature: stored.temperature,
    defaultStyle: stored.defaultStyle,
    reasoningEnabled: stored.reasoningEnabled,
    hasApiKey: Boolean(browserSessionApiKey)
  };
}

export async function saveAISettings(input: SaveAISettingsInput): Promise<AISettingsSummary> {
  const normalized = normalizeSettings(input);
  const desktop = getLyricsCardDesktopApi();
  if (desktop) {
    return desktop.saveAISettings({ ...normalized, apiKey: input.apiKey?.trim() || undefined });
  }

  browserSessionApiKey = input.apiKey?.trim() || browserSessionApiKey;
  window.localStorage.setItem(BROWSER_SETTINGS_KEY, JSON.stringify(normalized));
  return { ...normalized, hasApiKey: Boolean(browserSessionApiKey) };
}

export async function clearAISettingsApiKey(): Promise<AISettingsSummary> {
  const desktop = getLyricsCardDesktopApi();
  if (desktop) {
    return desktop.clearAISettingsApiKey();
  }

  browserSessionApiKey = "";
  const settings = readBrowserSettings();
  return { ...settings, hasApiKey: false };
}

export async function streamAITranslation(params: AITranslationStreamParams) {
  const desktop = getLyricsCardDesktopApi();
  if (desktop) {
    return streamFromDesktop(desktop, params);
  }

  const settings = readBrowserSettings();
  validateConfiguredSettings({ ...settings, hasApiKey: Boolean(browserSessionApiKey) });

  const response = await fetch("/api/ai/translate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: params.prompt,
      reasoning: params.reasoning,
      settings: { ...settings, apiKey: browserSessionApiKey }
    }),
    signal: params.signal
  });

  if (!response.ok) {
    throw new AITranslationError(await readErrorMessage(response), "request_failed");
  }

  params.onStatus?.("connected");
  return consumeOpenAIStream(response, params);
}

export function validateConfiguredSettings(settings: AISettingsSummary) {
  if (!settings.hasApiKey) {
    throw new AITranslationError("未配置 API Key，请先前往设置页配置。", "missing_api_key");
  }
  if (!settings.model.trim()) {
    throw new AITranslationError("未配置模型，请先前往设置页填写模型名称。", "missing_model");
  }
  if (!settings.baseUrl.trim()) {
    throw new AITranslationError("未配置 Base URL，请先前往设置页配置。", "missing_base_url");
  }
}

async function streamFromDesktop(
  desktop: NonNullable<ReturnType<typeof getLyricsCardDesktopApi>>,
  params: AITranslationStreamParams
) {
  const requestId = crypto.randomUUID();
  let accumulated = "";
  let accumulatedReasoning = "";
  const unsubscribe = desktop.onAITranslationChunk((event) => {
    if (event.requestId !== requestId) {
      return;
    }
    if (event.kind === "status" && event.phase) {
      params.onStatus?.(event.phase);
      return;
    }
    if (!event.delta) {
      return;
    }
    if (event.kind === "reasoning") {
      accumulatedReasoning += event.delta;
      params.onReasoningDelta?.(event.delta, accumulatedReasoning);
      return;
    }
    accumulated += event.delta;
    params.onDelta?.(event.delta, accumulated);
  });
  const abort = () => desktop.cancelAITranslation(requestId);
  params.signal?.addEventListener("abort", abort, { once: true });

  try {
    const finalContent = await desktop.startAITranslation(requestId, {
      prompt: params.prompt,
      reasoning: params.reasoning
    });
    return finalContent || accumulated;
  } catch (error) {
    throw normalizeError(error);
  } finally {
    params.signal?.removeEventListener("abort", abort);
    unsubscribe();
  }
}

async function consumeOpenAIStream(
  response: Response,
  params: Pick<AITranslationStreamParams, "onDelta" | "onReasoningDelta" | "onStatus">
) {
  if (!(response.headers.get("content-type") || "").includes("text/event-stream")) {
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const reasoningContent = data.choices?.[0]?.message?.reasoning_content ?? "";
    if (reasoningContent) {
      params.onStatus?.("reasoning");
      params.onReasoningDelta?.(reasoningContent, reasoningContent);
    }
    if (content) {
      params.onStatus?.("translating");
      params.onDelta?.(content, content);
    }
    return content;
  }

  if (!response.body) {
    throw new AITranslationError("接口未返回可读取的数据流。", "empty_stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let accumulatedReasoning = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith("data:")) {
          continue;
        }
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") {
          continue;
        }
        let parsed: { choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }> };
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        const reasoningDelta = parsed.choices?.[0]?.delta?.reasoning_content;
        if (reasoningDelta) {
          accumulatedReasoning += reasoningDelta;
          params.onStatus?.("reasoning");
          params.onReasoningDelta?.(reasoningDelta, accumulatedReasoning);
        }
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          accumulated += delta;
          params.onStatus?.("translating");
          params.onDelta?.(delta, accumulated);
        }
      }
    }

    if (done) {
      break;
    }
  }

  return accumulated;
}

function readBrowserSettings(): BrowserStoredSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_AI_SETTINGS };
  }

  try {
    const raw = window.localStorage.getItem(BROWSER_SETTINGS_KEY) || "{}";
    const parsed = JSON.parse(raw) as Partial<BrowserStoredSettings> & { apiKey?: unknown };
    const { apiKey: _legacyApiKey, ...settingsWithoutSecret } = parsed;
    const normalized = normalizeSettings(settingsWithoutSecret);
    // Migrate old development builds that persisted a plaintext key. Never copy it into memory.
    if (Object.prototype.hasOwnProperty.call(parsed, "apiKey")) {
      window.localStorage.setItem(BROWSER_SETTINGS_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    // Corrupt or legacy data may contain a secret; remove the complete record instead of logging it.
    window.localStorage.removeItem(BROWSER_SETTINGS_KEY);
    return { ...DEFAULT_AI_SETTINGS };
  }
}

function normalizeSettings(input: Partial<SaveAISettingsInput>): AISettings {
  const temperature = Number(input.temperature);
  return {
    baseUrl: typeof input.baseUrl === "string" && input.baseUrl.trim() ? input.baseUrl.trim() : DEFAULT_AI_SETTINGS.baseUrl,
    model: typeof input.model === "string" ? input.model.trim() : "",
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : DEFAULT_AI_SETTINGS.temperature,
    defaultStyle: isTranslationStyle(input.defaultStyle) ? input.defaultStyle : DEFAULT_AI_SETTINGS.defaultStyle,
    reasoningEnabled: Boolean(input.reasoningEnabled)
  };
}

function normalizeError(error: unknown) {
  if (error instanceof AITranslationError || (error instanceof DOMException && error.name === "AbortError")) {
    return error;
  }
  const message = error instanceof Error ? error.message : "AI 翻译请求失败。";
  return new AITranslationError(message || "AI 翻译请求失败。", "request_failed");
}

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || `AI 请求失败（HTTP ${response.status}）。`;
  } catch {
    return `AI 请求失败（HTTP ${response.status}）。`;
  }
}
