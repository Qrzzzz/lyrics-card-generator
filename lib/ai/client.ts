import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import { createAppRequestHeaders } from "@/lib/app-request";
import { getChatCompletionMessage, getProviderErrorMessage, readProviderResponseBody } from "@/lib/ai/provider-response";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/types";
import { normalizeAISettings } from "@/lib/ai/settings-normalize";
import { parseSerializedAIError, type AIErrorCode } from "@/lib/ai/error-copy";
import { ResponseBodyLimitExceededError } from "@/lib/bounded-response";
import {
  AIStreamError,
  assertAICompletionBudgets,
  consumeOpenAICompatibleSSE,
  createAIStreamDeadline
} from "@/electron/ai-stream";
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

export async function testAIConnection({ signal }: { signal?: AbortSignal } = {}) {
  const desktop = getLyricsCardDesktopApi();
  if (desktop) {
    const requestId = crypto.randomUUID();
    const abort = () => { void desktop.cancelAIConnectionTest(requestId); };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    try {
      if (signal?.aborted) throw createAbortError();
      const result = await desktop.startAIConnectionTest(requestId);
      if (signal?.aborted) throw createAbortError();
      return result;
    } catch (error) {
      throw normalizeError(error);
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  const settings = readBrowserSettings();
  validateConfiguredSettings({ ...settings, hasApiKey: Boolean(browserSessionApiKey) });
  try {
    const response = await fetch("/api/ai/test-connection", {
      method: "POST",
      headers: createAppRequestHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ settings: { ...settings, apiKey: browserSessionApiKey } }),
      signal
    });
    if (!response.ok) throw await readAIError(response, signal);
    return true;
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function streamAITranslation(params: AITranslationStreamParams) {
  const desktop = getLyricsCardDesktopApi();
  if (desktop) {
    return streamFromDesktop(desktop, params);
  }

  const settings = readBrowserSettings();
  validateConfiguredSettings({ ...settings, hasApiKey: Boolean(browserSessionApiKey) });

  const deadline = createAIStreamDeadline(params.signal);
  try {
    const response = await fetch("/api/ai/translate", {
      method: "POST",
      headers: createAppRequestHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        prompt: params.prompt,
        reasoning: params.reasoning,
        settings: { ...settings, apiKey: browserSessionApiKey }
      }),
      signal: deadline.signal
    });

    if (!response.ok) {
      throw await readAIError(response, deadline.signal);
    }

    params.onStatus?.("connected");
    return await consumeOpenAIStream(response, params, deadline);
  } catch (error) {
    if (deadline.signal.reason instanceof AIStreamError) {
      throw new AITranslationError("AI stream budget ended the request.", deadline.signal.reason.code);
    }
    throw normalizeError(error);
  } finally {
    deadline.dispose();
  }
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
  params: Pick<AITranslationStreamParams, "onDelta" | "onReasoningDelta" | "onStatus">,
  deadline: ReturnType<typeof createAIStreamDeadline>
) {
  if (!(response.headers.get("content-type") || "").includes("text/event-stream")) {
    const body = await readProviderResponseBody(response, deadline.signal);
    const { content, reasoningContent } = getChatCompletionMessage(body);
    assertAICompletionBudgets(content, reasoningContent);
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

  const result = await consumeOpenAICompatibleSSE(
    response,
    {
      onReasoningDelta(delta, accumulated) {
        params.onStatus?.("reasoning");
        params.onReasoningDelta?.(delta, accumulated);
      },
      onDelta(delta, accumulated) {
        params.onStatus?.("translating");
        params.onDelta?.(delta, accumulated);
      }
    },
    { signal: deadline.signal, deadlineAt: deadline.deadlineAt }
  );
  return result.content;
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
  if (error instanceof AIStreamError) {
    return new AITranslationError(error.message, error.code);
  }
  if (error instanceof ResponseBodyLimitExceededError) {
    return new AITranslationError(error.message, "response_too_large");
  }
  const message = error instanceof Error ? error.message : "AI translation request failed.";
  const serialized = parseSerializedAIError(message);
  if (serialized.code === "insecure_base_url") {
    return new AITranslationError(message, serialized.code);
  }
  if (/timeout/i.test(message)) return new AITranslationError(message, "timeout");
  if (/network|fetch/i.test(message)) return new AITranslationError(message, "network");
  return new AITranslationError(message, "request_failed");
}

async function readAIError(response: Response, signal?: AbortSignal) {
  const body = await readProviderResponseBody(response, signal);
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
