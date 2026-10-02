const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { createAIService } = require("../electron/ai-service");
const { createAppPreferencesService } = require("../electron/app-preferences-service");
const { createHistoryReplayGateway } = require("../electron/history-replay");
const { normalizeStoredPreferences } = require("../electron/user-preferences");

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "domain-services-"));
  try {
    const handlers = new Map();
    let calls = 0;
    let finish;
    let transport;
    const service = createAIService({ filePath: path.join(root, "ai.json"),
      safeStorage: { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (value) => value.toString() },
      connectionTest: async () => { calls++; },
      translation: async (options) => { calls++; transport = options; await new Promise((resolve) => { finish = resolve; }); return "finished"; }
    });
    service.register((channel, handler) => handlers.set(channel, handler));
    class Sender extends EventEmitter { id = 1; sent = []; isDestroyed() { return false; } send(...value) { this.sent.push(value); } }
    const sender = new Sender();
    const event = { sender };
    const invoke = (channel, ...args) => handlers.get(`lyrics-card:${channel}`)(event, ...args);
    const summary = await invoke("ai-settings-save", { model: "test", apiKey: "fake-fixture-key", temperature: 9 });
    assert.equal(summary.hasApiKey, true);
    assert.equal(summary.temperature, 2);
    assert.equal("encryptedApiKey" in summary, false);
    await invoke("ai-settings-save", { model: "preserved" });
    assert.equal((await invoke("ai-settings-load")).hasApiKey, true);
    for (const request of [null, [], { prompt: 7 }, { prompt: "" }, { prompt: "text", reasoning: "true" }]) {
      await assert.rejects(invoke("ai-translate", "request-001", request), /AI_ERROR:invalid_request/);
    }
    assert.equal(calls, 0, "invalid IPC shapes never reach provider transports");
    const run = invoke("ai-translate", "request-001", { prompt: "text", reasoning: true });
    while (!transport) await new Promise((resolve) => setImmediate(resolve));
    transport.onDelta("first");
    assert.equal(sender.sent.length, 1);
    assert.deepEqual(invoke("ai-translate-cancel", "request-001"), { cancelled: true, active: true });
    assert.equal(transport.signal.aborted, true);
    transport.onDelta("late");
    transport.onReasoningDelta("late");
    transport.onStatus("translating");
    assert.equal(sender.sent.length, 1, "cancelled sender generations suppress every late stream event");
    finish();
    await run;
    assert.equal(invoke("ai-translate-cancel", "request-001").active, false, "settled request releases registry ownership");
    await invoke("ai-settings-api-key-clear");
    assert.equal((await invoke("ai-settings-load")).hasApiKey, false);
    await service.flush();

    const filePath = path.join(root, "preferences.json");
    const preferences = normalizeStoredPreferences({ schemaVersion: 1, revision: 1, updatedAt: 1, locale: "en", userSettings: { importHistoryLimit: "unlimited" } });
    assert.ok(preferences);
    let fail = false;
    const store = createAppPreferencesService({ getTargetPath: () => filePath, filesystem: { ...fs,
      readFile: (...args) => { if (fail) throw Object.assign(new Error("locked"), { code: "EACCES" }); return fs.readFile(...args); }
    }, onDiagnostic: () => {} });
    await store.write(preferences);
    fail = true;
    assert.equal((await store.read()).userSettings.importHistoryLimit, "unlimited", "transient read failure keeps validated history retention");
    fail = false;
    await store.write({ ...preferences, revision: 3, updatedAt: 3 });
    await store.write({ ...preferences, revision: 2, updatedAt: 2 });
    assert.equal((await store.read()).revision, 3);
    await store.flush();

    let hydrated = false;
    const gateway = createHistoryReplayGateway({ draftAssets: { hydrate: async () => { hydrated = true; return { snapshot: "fixture" }; } },
      fileStreams: { open: async () => ({ ok: false, code: "file_missing" }) }
    });
    const base = { id: "record", display: { title: "Saved", artist: "Artist", album: "", source: "unknown" }, createdAt: 1, lastUsedAt: 1 };
    const replay = await gateway.createPayload({ ...base, kind: "draft", editorDraft: {} }, undefined, 1);
    assert.equal(replay.kind, "draft");
    assert.equal(hydrated, true);
    const missing = await gateway.createPayload({ ...base, kind: "local-audio", source: { path: "/fixture.mp3" } }, undefined, 1);
    assert.deepEqual(missing, { ok: false, code: "file_missing", canRelocate: true });
    console.log("Domain services: credential preservation, IPC rejection, cancellation ownership, preferences fallback and replay boundaries passed.");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
