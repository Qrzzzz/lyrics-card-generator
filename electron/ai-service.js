const { AISettingsStore } = require("./ai-settings-store");
const { AIRequestRegistry } = require("./ai-request-registry");
const { DEFAULT_AI_SETTINGS, normalizeAISettings } = require("../shared/ai-settings");
const { isValidAIRequestId, parseAITranslationRequest } = require("../shared/ai-request-contract");
const { testProviderConnection: defaultConnectionTest } = require("./provider-response");
const { streamAITranslationInMain: defaultTranslation, resolveAIProviderEndpoint, createAIError } = require("./ai-translation");

/** Owns credentials, settings serialization and sender-scoped transport generations. */
function createAIService({ filePath, safeStorage, connectionTest = defaultConnectionTest, translation = defaultTranslation }) {
  const testProviderConnection = connectionTest;
  const streamAITranslationInMain = translation;
  const aiTranslationRequests = new AIRequestRegistry();
  const aiConnectionTests = new AIRequestRegistry();
  const aiSettingsStore = new AISettingsStore({
    filePath: filePath,
    defaultSettings: DEFAULT_AI_SETTINGS,
    normalizeStored: normalizeStoredAISettings,
    onDiagnostic: ({ event, errorCode }) => {
      // Diagnostics deliberately expose neither document contents nor credential material.
      console.error("[ai-settings] persistence diagnostic", event, errorCode ?? "");
    }
  });

  const readAISettings = () => aiSettingsStore.read();
  function register(handle) {
  handle("lyrics-card:ai-settings-load", async () => {
    const settings = await readAISettings();
    return toAISettingsSummary(settings);
  });

  handle("lyrics-card:ai-settings-save", async (_event, input) => {
    const normalized = normalizeAISettings(input);
    const nextApiKey = typeof input?.apiKey === "string" ? input.apiKey.trim() : "";
    let encryptedApiKey;

    if (nextApiKey) {
      // Never persist plaintext credentials; unsupported or plaintext-only OS backends are rejected below.
      ensureSecureStorageAvailable();
      encryptedApiKey = safeStorage.encryptString(nextApiKey).toString("base64");
    }

    // Credential preservation is decided inside the serialized store mutation,
    // after every older save has completed, so an old read cannot drop a newer key.
    const stored = await aiSettingsStore.save(normalized, {
      credentialAction: nextApiKey ? "set" : "preserve",
      encryptedApiKey
    });
    return toAISettingsSummary(stored);
  });

  handle("lyrics-card:ai-settings-api-key-clear", async () => {
    // Clear is an explicit credential action and remains available even when a
    // corrupt primary and backup make preservation unsafe.
    const stored = await aiSettingsStore.save(null, { credentialAction: "clear" });
    return toAISettingsSummary(stored);
  });

  handle("lyrics-card:ai-connection-test", async (event, requestId) => {
    if (!isValidAIRequestId(requestId)) throw createAIError("invalid_request");
    const sender = event.sender;
    const controller = aiConnectionTests.begin(sender, requestId);
    try {
      const settings = await readAISettings();
      if (controller.signal.aborted) throw controller.signal.reason;
      const apiKey = decryptStoredApiKey(settings.encryptedApiKey);
      validateAISettings(settings, apiKey);
      await testProviderConnection({
        baseUrl: settings.baseUrl,
        model: settings.model,
        apiKey,
        signal: controller.signal
      });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("AI_ERROR:")) throw error;
      if (controller.signal.aborted) throw createAIError("cancelled");
      if (error?.code === "response_too_large") throw createAIError("response_too_large");
      if (error?.connectionTestCode) throw createAIError(error.connectionTestCode, error.diagnostic);
      throw createAIError("network");
    } finally {
      aiConnectionTests.finish(sender, requestId, controller);
    }
  });

  handle("lyrics-card:ai-connection-test-cancel", (event, requestId) => {
    if (!isValidAIRequestId(requestId)) return { cancelled: false, active: false };
    return aiConnectionTests.cancel(event.sender, requestId);
  });

  handle("lyrics-card:ai-translate", async (event, requestId, request) => {
    if (!isValidAIRequestId(requestId)) throw createAIError("invalid_request");
    const validated = parseAITranslationRequest(request);
    if (validated.ok === false) throw createAIError(validated.code);

    const sender = event.sender;
    // Registry ownership ties cancellation and streamed output to this exact renderer and request generation.
    const controller = aiTranslationRequests.begin(sender, requestId);

    try {
      const settings = await readAISettings();
      if (controller.signal.aborted) throw controller.signal.reason;
      const apiKey = decryptStoredApiKey(settings.encryptedApiKey);
      validateAISettings(settings, apiKey);
      return await streamAITranslationInMain({
        settings,
        apiKey,
        prompt: validated.prompt,
        reasoning: validated.reasoning,
        signal: controller.signal,
        // Each callback rechecks ownership so replaced, cancelled, or destroyed senders receive no stale chunks.
        onStatus: (phase) => {
          if (aiTranslationRequests.isActive(sender, requestId, controller)) {
            sender.send("lyrics-card:ai-translate-chunk", { requestId, kind: "status", phase });
          }
        },
        onReasoningDelta: (delta) => {
          if (aiTranslationRequests.isActive(sender, requestId, controller)) {
            sender.send("lyrics-card:ai-translate-chunk", { requestId, kind: "reasoning", delta });
          }
        },
        onDelta: (delta) => {
          if (aiTranslationRequests.isActive(sender, requestId, controller)) {
            sender.send("lyrics-card:ai-translate-chunk", { requestId, kind: "content", delta });
          }
        }
      });
    } finally {
      aiTranslationRequests.finish(sender, requestId, controller);
    }
  });

  handle("lyrics-card:ai-translate-cancel", (event, requestId) => {
    if (!isValidAIRequestId(requestId)) return { cancelled: false, active: false };
    return aiTranslationRequests.cancel(event.sender, requestId);
  });
  }
function normalizeStoredAISettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  // Missing credential metadata is not equivalent to an explicit empty key.
  // This is the boundary that prevents a syntactically valid partial JSON
  // document from silently becoming a durable credential clear.
  if (typeof input.encryptedApiKey !== "string") return null;
  return { ...normalizeAISettings(input), encryptedApiKey: input.encryptedApiKey };
}

function toAISettingsSummary(settings) {
  return {
    baseUrl: settings.baseUrl,
    model: settings.model,
    temperature: settings.temperature,
    defaultStyle: settings.defaultStyle,
    reasoningEnabled: settings.reasoningEnabled,
    promptLibrary: settings.promptLibrary,
    hasApiKey: Boolean(settings.encryptedApiKey)
  };
}

function decryptStoredApiKey(encryptedApiKey) {
  if (!encryptedApiKey) {
    return "";
  }
  ensureSecureStorageAvailable();
  try {
    return safeStorage.decryptString(Buffer.from(encryptedApiKey, "base64"));
  } catch {
    throw createAIError("api_key_read_failed");
  }
}

function ensureSecureStorageAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw createAIError("secure_storage_unavailable");
  }
  if (
    process.platform === "linux"
    && typeof safeStorage.getSelectedStorageBackend === "function"
    && safeStorage.getSelectedStorageBackend() === "basic_text"
  ) {
    // Electron's Linux basic_text backend is obfuscation, not acceptable credential encryption.
    throw createAIError("secure_storage_unavailable");
  }
}

function validateAISettings(settings, apiKey) {
  if (!apiKey.trim()) {
    throw createAIError("missing_api_key");
  }
  if (!settings.model.trim()) {
    throw createAIError("missing_model");
  }
  if (!settings.baseUrl?.trim()) throw createAIError("missing_base_url");
  resolveAIProviderEndpoint(settings.baseUrl);
}


  return { register, flush: () => aiSettingsStore.flush() };
}

module.exports = { createAIService };
