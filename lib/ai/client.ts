import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import { createAppRequestHeaders } from "@/lib/app-request";
import { getChatCompletionMessage, getProviderErrorMessage, readProviderResponseBody } from "@/lib/ai/provider-response";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/types";
import { normalizeAISettings } from "@/lib/ai/settings-normalize";
import type { AIErrorCode } from "@/lib/ai/error-copy";
import type {
  AISettings,
  AISettingsSummary,
  AITranslationStreamParams,
  SaveAISettingsInput
} from "@/lib/ai/types";

const BROWSER_SETTINGS_KEY = "lyric-card-generator-ai-settings";

type BrowserStoredSettings = AISettings;
// Browser preview keys are session-only; persistent settings never contain the secret.
let browserSessionApiKey = "";

export class AITranslationError extends Error {
  constructor(message: string, readonly code: AIErrorCode = "unknown", readonly diagnostic?: string) {
    const detail = diagnostic ?? (code === "provider_error" ? message : undefined);
    super(`AI_ERROR:${code}${detail ? `:${detail}` : ""}`);
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
    promptLibrary: stored.promptLibrary,
    hasApiKey: Boolean(browserSessionApiKey)
  };
}

export async function saveAISettings(input: SaveAISettingsInput): Promise<AISettingsSummary> {
  const normalized = normalizeAISettings(input);
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
    headers: createAppRequestHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      prompt: params.prompt,
      reasoning: params.reasoning,
      settings: { ...settings, apiKey: browserSessionApiKey }
    }),
    signal: params.signal
  });

  if (!response.ok) {
    throw await readAIError(response);
  }

  params.onStatus?.("connected");
  return consumeOpenAIStream(response, params);
}

export function validateConfiguredSettings(settings: AISettingsSummary) {
  if (!settings.hasApiKey) {
    throw new AITranslationError("Missing API key.", "missing_api_key");
  }
  if (!settings.model.trim()) {
    throw new AITranslationError("Missing model.", "missing_model");
  }
  if (!settings.baseUrl.trim()) {
    throw new AITranslationError("Missing Base URL.", "missing_base_url");
  }
}

async function streamFromDesktop(
  desktop: NonNullable<ReturnType<typeof getLyricsCardDesktopApi>>,
  params: AITranslationStreamParams
) {
  // The request id correlates shared IPC events and prevents chunks from an
  // older or concurrently cancelled request from entering this generation.
  const requestId = crypto.randomUUID();
  let aborted = Boolean(params.signal?.aborted);
  let accumulated = "";
  let accumulatedReasoning = "";
  const unsubscribe = desktop.onAITranslationChunk((event) => {
    if (aborted || event.requestId !== requestId) {
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
  const abort = () => {
    aborted = true;
    void desktop.cancelAITranslation(requestId);
  };
  if (params.signal?.aborted) abort();
  else params.signal?.addEventListener("abort", abort, { once: true });

  try {
    if (aborted) throw createAbortError();
    const finalContent = await desktop.startAITranslation(requestId, {
      prompt: params.prompt,
      reasoning: params.reasoning
    });
    if (aborted) throw createAbortError();
    return finalContent || accumulated;
  } catch (error) {
    throw normalizeError(error);
  } finally {
    params.signal?.removeEventListener("abort", abort);
    unsubscribe();
  }
}

function createAbortError() {
  return new DOMException("The AI translation request was aborted.", "AbortError");
}

async function consumeOpenAIStream(
  response: Response,
  params: Pick<AITranslationStreamParams, "onDelta" | "onReasoningDelta" | "onStatus">
) {
  if (!(response.headers.get("content-type") || "").includes("text/event-stream")) {
    const body = await readProviderResponseBody(response);
    const { content, reasoningContent } = getChatCompletionMessage(body);
    if (reasoningContent) {
      params.onStatus?.("reasoning");
      params.onReasoningDelta?.(reasoningContent, reasoningContent);
    }
    if (content) {
      params.onStatus?.("translating");
      params.onDelta?.(content, content);
    }
    if (!content && body.kind !== "json") {
      throw new AITranslationError("Invalid provider response.", "invalid_response");
    }
    return content;
  }

  if (!response.body) {
    throw new AITranslationError("Empty provider stream.", "empty_stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // Network chunks do not align with SSE event boundaries, so retain the final
  // incomplete event until a later read supplies its blank-line delimiter.
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
    const settingsWithoutSecret = { ...parsed };
    delete settingsWithoutSecret.apiKey;
    const normalized = normalizeAISettings(settingsWithoutSecret as Partial<SaveAISettingsInput>);
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

function normalizeError(error: unknown) {
  if (error instanceof AITranslationError || (error instanceof DOMException && error.name === "AbortError")) {
    return error;
  }
  const message = error instanceof Error ? error.message : "AI translation request failed.";
  if (/timeout/i.test(message)) return new AITranslationError(message, "timeout");
  if (/network|fetch/i.test(message)) return new AITranslationError(message, "network");
  return new AITranslationError(message, "request_failed");
}

async function readAIError(response: Response) {
  const body = await readProviderResponseBody(response);
  if (body.kind === "json" && body.data && typeof body.data === "object") {
    const error = (body.data as { error?: { code?: unknown; diagnostic?: unknown } }).error;
    if (error && typeof error.code === "string") {
      return new AITranslationError(
        "AI request failed.",
        error.code as AIErrorCode,
        typeof error.diagnostic === "string" ? error.diagnostic : undefined
      );
    }
  }
  return new AITranslationError(
    "Provider request failed.",
    "provider_error",
    getProviderErrorMessage(body, response.status)
  );
}
