const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { AISettingsStore } = require("../electron/ai-settings-store");

const DEFAULTS = {
  baseUrl: "https://api.openai.com/v1",
  model: "",
  temperature: 0.7,
  defaultStyle: "recommended",
  reasoningEnabled: false,
  promptLibrary: { localeOverrides: {}, hiddenStyleIds: [], customPresets: [] }
};

function settings(model, encryptedApiKey = "encrypted:key-one") {
  return { ...DEFAULTS, model, encryptedApiKey };
}

function normalizeStored(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (typeof input.encryptedApiKey !== "string") return null;
  if (typeof input.baseUrl !== "string" || typeof input.model !== "string") return null;
  return {
    ...DEFAULTS,
    ...input,
    baseUrl: input.baseUrl.trim() || DEFAULTS.baseUrl,
    model: input.model.trim(),
    encryptedApiKey: input.encryptedApiKey
  };
}

function injectedFs(overrides = {}) {
  return new Proxy(fs, {
    get(target, property) {
      return overrides[property] ?? target[property];
    }
  });
}

async function readDocument(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeDocument(filePath, document) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

async function listTemporaryFiles(directory) {
  return (await fs.readdir(directory)).filter((name) => name.includes(".tmp-"));
}

function createStore(filePath, options = {}) {
  let nonce = 0;
  return new AISettingsStore({
    filePath,
    defaultSettings: DEFAULTS,
    normalizeStored,
    createNonce: () => `fixture-${++nonce}`,
    ...options
  });
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error?.code === code);
}

async function testAtomicNewKeyAndBackup(root) {
  const filePath = path.join(root, "atomic-new-key", "ai-settings.json");
  const store = createStore(filePath);
  const saved = await store.save(settings("gpt-new", ""), {
    credentialAction: "set",
    encryptedApiKey: "encrypted:new-key"
  });
  assert.equal(saved.encryptedApiKey, "encrypted:new-key");
  assert.deepEqual(await readDocument(filePath), saved);
  assert.deepEqual(await readDocument(`${filePath}.bak`), saved);
}

async function testPartialWritePreservesPrimaryAndCleans(root) {
  const directory = path.join(root, "partial-write");
  const filePath = path.join(directory, "ai-settings.json");
  const original = settings("original");
  await writeDocument(filePath, original);
  await writeDocument(`${filePath}.bak`, original);

  const faulted = injectedFs({
    open: async (candidate, ...args) => {
      const handle = await fs.open(candidate, ...args);
      if (!String(candidate).startsWith(`${filePath}.tmp-`)) return handle;
      return {
        writeFile: async (value) => {
          await handle.writeFile(String(value).slice(0, 12), "utf8");
          const error = new Error("injected partial write");
          error.code = "EIO";
          throw error;
        },
        sync: (...syncArgs) => handle.sync(...syncArgs),
        close: (...closeArgs) => handle.close(...closeArgs)
      };
    }
  });
  const store = createStore(filePath, { fs: faulted });
  await expectCode(store.save(settings("partial")), "EIO");
  assert.deepEqual(await readDocument(filePath), original);
  assert.deepEqual(await listTemporaryFiles(directory), []);
}

async function testRenameFailurePreservesPrimaryAndCleans(root) {
  const directory = path.join(root, "rename-failure");
  const filePath = path.join(directory, "ai-settings.json");
  const original = settings("original");
  await writeDocument(filePath, original);
  await writeDocument(`${filePath}.bak`, original);
  const faulted = injectedFs({
    rename: async (source, target) => {
      if (target === filePath) {
        const error = new Error("injected pre-rename crash");
        error.code = "EIO";
        throw error;
      }
      return fs.rename(source, target);
    }
  });
  const store = createStore(filePath, { fs: faulted });
  await expectCode(store.save(settings("not-published")), "EIO");
  assert.deepEqual(await readDocument(filePath), original);
  assert.deepEqual(await listTemporaryFiles(directory), []);
}

async function testTruncatedPrimaryRecoversEncryptedKey(root) {
  const directory = path.join(root, "truncated-primary");
  const filePath = path.join(directory, "ai-settings.json");
  const backup = settings("recovered", "encrypted:recovered-key");
  await writeDocument(filePath, backup);
  await writeDocument(`${filePath}.bak`, backup);
  await fs.writeFile(filePath, '{"model":"truncated', "utf8");

  const diagnostics = [];
  const store = createStore(filePath, { onDiagnostic: (entry) => diagnostics.push(entry) });
  const recovered = await store.read();
  assert.equal(recovered.encryptedApiKey, "encrypted:recovered-key");
  assert.deepEqual(await readDocument(filePath), backup);
  assert.ok(diagnostics.some(({ event }) => event === "primary_read_failed"));
}

async function testRecoveredKeySurvivesNonKeySave(root) {
  const filePath = path.join(root, "recovery-save", "ai-settings.json");
  const backup = settings("before", "encrypted:preserved-key");
  await writeDocument(filePath, backup);
  await writeDocument(`${filePath}.bak`, backup);
  await fs.writeFile(filePath, "{}", "utf8");

  const store = createStore(filePath);
  const saved = await store.save(settings("after", ""), { credentialAction: "preserve" });
  assert.equal(saved.model, "after");
  assert.equal(saved.encryptedApiKey, "encrypted:preserved-key");
  assert.equal((await readDocument(filePath)).encryptedApiKey, "encrypted:preserved-key");
}

async function testInvalidRecoveryDoesNotSolidifyFallback(root) {
  const filePath = path.join(root, "invalid-recovery", "ai-settings.json");
  await writeDocument(filePath, { model: "partial-without-key" });
  await fs.writeFile(`${filePath}.bak`, "not json", "utf8");
  const store = createStore(filePath);

  await expectCode(
    store.save(settings("must-not-persist", ""), { credentialAction: "preserve" }),
    "ai_settings_credential_recovery_failed"
  );
  assert.deepEqual(await readDocument(filePath), { model: "partial-without-key" });

  const cleared = await store.save(null, { credentialAction: "clear" });
  assert.equal(cleared.encryptedApiKey, "");
  assert.equal((await readDocument(filePath)).encryptedApiKey, "");
}

async function testNewKeyRepairsInvalidRecovery(root) {
  const filePath = path.join(root, "new-key-repair", "ai-settings.json");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, "{", "utf8");
  await fs.writeFile(`${filePath}.bak`, "[]", "utf8");
  const store = createStore(filePath);
  const repaired = await store.save(settings("repaired", ""), {
    credentialAction: "set",
    encryptedApiKey: "encrypted:replacement-key"
  });
  assert.equal(repaired.encryptedApiKey, "encrypted:replacement-key");
  assert.deepEqual(await readDocument(`${filePath}.bak`), repaired);
}

async function testMemoryLastKnownGoodRecovery(root) {
  const filePath = path.join(root, "memory-recovery", "ai-settings.json");
  const original = settings("memory", "encrypted:memory-key");
  await writeDocument(filePath, original);
  await writeDocument(`${filePath}.bak`, original);
  const store = createStore(filePath);
  assert.equal((await store.read()).encryptedApiKey, "encrypted:memory-key");
  await fs.writeFile(filePath, "{", "utf8");
  await fs.writeFile(`${filePath}.bak`, "{", "utf8");
  const recovered = await store.read();
  assert.equal(recovered.encryptedApiKey, "encrypted:memory-key");
  assert.deepEqual(await readDocument(filePath), original);
}

async function testOverlappingSavePreservesNewestKey(root) {
  const filePath = path.join(root, "overlap", "ai-settings.json");
  const original = settings("original", "encrypted:old-key");
  await writeDocument(filePath, original);
  await writeDocument(`${filePath}.bak`, original);
  let releaseRename;
  const renameBlocked = new Promise((resolve) => { releaseRename = resolve; });
  let observeRename;
  const renameObserved = new Promise((resolve) => { observeRename = resolve; });
  let blocked = false;
  const delayed = injectedFs({
    rename: async (source, target) => {
      if (target === filePath && !blocked) {
        blocked = true;
        observeRename();
        await renameBlocked;
      }
      return fs.rename(source, target);
    }
  });
  const store = createStore(filePath, { fs: delayed });
  const newKeySave = store.save(settings("first", ""), {
    credentialAction: "set",
    encryptedApiKey: "encrypted:newest-key"
  });
  await renameObserved;
  const laterNonKeySave = store.save(settings("second", ""), { credentialAction: "preserve" });
  releaseRename();
  await Promise.all([newKeySave, laterNonKeySave]);
  const persisted = await readDocument(filePath);
  assert.equal(persisted.model, "second");
  assert.equal(persisted.encryptedApiKey, "encrypted:newest-key");
}

async function testRecoveryReadCannotOverwriteLaterSave(root) {
  const filePath = path.join(root, "read-save-overlap", "ai-settings.json");
  const backup = settings("backup", "encrypted:backup-key");
  await writeDocument(filePath, backup);
  await writeDocument(`${filePath}.bak`, backup);
  await fs.writeFile(filePath, "{", "utf8");
  let releaseRecovery;
  const recoveryBlocked = new Promise((resolve) => { releaseRecovery = resolve; });
  let observeRecovery;
  const recoveryObserved = new Promise((resolve) => { observeRecovery = resolve; });
  let blocked = false;
  const delayed = injectedFs({
    rename: async (source, target) => {
      if (target === filePath && !blocked) {
        blocked = true;
        observeRecovery();
        await recoveryBlocked;
      }
      return fs.rename(source, target);
    }
  });
  const store = createStore(filePath, { fs: delayed });
  const recoveryRead = store.read();
  await recoveryObserved;
  const newKeySave = store.save(settings("newer", ""), {
    credentialAction: "set",
    encryptedApiKey: "encrypted:newer-key"
  });
  releaseRecovery();
  await Promise.all([recoveryRead, newKeySave]);
  const persisted = await readDocument(filePath);
  assert.equal(persisted.model, "newer");
  assert.equal(persisted.encryptedApiKey, "encrypted:newer-key");
}

async function testWindowsReplaceRetriesAndBoundary(root) {
  const successPath = path.join(root, "windows-retry", "success", "ai-settings.json");
  const original = settings("original");
  await writeDocument(successPath, original);
  await writeDocument(`${successPath}.bak`, original);
  let primaryAttempts = 0;
  const delays = [];
  const retrying = injectedFs({
    rename: async (source, target) => {
      if (target === successPath && primaryAttempts++ < 2) {
        const error = new Error("injected Windows sharing violation");
        error.code = "EBUSY";
        throw error;
      }
      return fs.rename(source, target);
    }
  });
  const successStore = createStore(successPath, {
    fs: retrying,
    platform: "win32",
    replaceRetryDelaysMs: [1, 2],
    sleep: async (delay) => { delays.push(delay); }
  });
  await successStore.save(settings("retried"));
  assert.equal(primaryAttempts, 3);
  assert.deepEqual(delays, [1, 2]);
  assert.equal((await readDocument(successPath)).model, "retried");

  const failurePath = path.join(root, "windows-retry", "failure", "ai-settings.json");
  await writeDocument(failurePath, original);
  await writeDocument(`${failurePath}.bak`, original);
  let failedAttempts = 0;
  const exhausted = injectedFs({
    rename: async (source, target) => {
      if (target === failurePath) {
        failedAttempts += 1;
        const error = new Error("persistent Windows sharing violation");
        error.code = "EPERM";
        throw error;
      }
      return fs.rename(source, target);
    }
  });
  const failureStore = createStore(failurePath, {
    fs: exhausted,
    platform: "win32",
    replaceRetryDelaysMs: [1, 2],
    sleep: async () => undefined
  });
  await expectCode(failureStore.save(settings("never-published")), "EPERM");
  assert.equal(failedAttempts, 3);
  assert.deepEqual(await readDocument(failurePath), original);
  assert.deepEqual(await listTemporaryFiles(path.dirname(failurePath)), []);
}

async function testStaleCrashTemporaryCleanup(root) {
  const directory = path.join(root, "stale-cleanup");
  const filePath = path.join(directory, "ai-settings.json");
  const original = settings("clean");
  await writeDocument(filePath, original);
  await writeDocument(`${filePath}.tmp-crashed`, { encryptedApiKey: "encrypted:stale" });
  await writeDocument(`${filePath}.bak.tmp-crashed`, { encryptedApiKey: "encrypted:stale" });
  const store = createStore(filePath);
  assert.equal((await store.read()).model, "clean");
  assert.deepEqual(await listTemporaryFiles(directory), []);
}

function testMainProcessIntegrationContracts() {
  const mainSource = readFileSync(path.resolve("electron/main.js"), "utf8");
  const prepareSource = readFileSync(path.resolve("scripts/prepare-electron-dist.mjs"), "utf8");
  assert.match(mainSource, /new AISettingsStore\(\{/);
  assert.match(mainSource, /await aiSettingsStore\.flush\(\)/);
  assert.match(mainSource, /credentialAction: nextApiKey \? "set" : "preserve"/);
  assert.match(mainSource, /aiSettingsStore\.save\(null, \{ credentialAction: "clear" \}\)/);
  assert.match(prepareSource, /electron[\\/]ai-settings-store\.js/);
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lyrics-card-ai-settings-"));
  try {
    await testAtomicNewKeyAndBackup(root);
    await testPartialWritePreservesPrimaryAndCleans(root);
    await testRenameFailurePreservesPrimaryAndCleans(root);
    await testTruncatedPrimaryRecoversEncryptedKey(root);
    await testRecoveredKeySurvivesNonKeySave(root);
    await testInvalidRecoveryDoesNotSolidifyFallback(root);
    await testNewKeyRepairsInvalidRecovery(root);
    await testMemoryLastKnownGoodRecovery(root);
    await testOverlappingSavePreservesNewestKey(root);
    await testRecoveryReadCannotOverwriteLaterSave(root);
    await testWindowsReplaceRetriesAndBoundary(root);
    await testStaleCrashTemporaryCleanup(root);
    testMainProcessIntegrationContracts();
    console.log(JSON.stringify({ ok: true, aiSettingsStoreTests: 13 }, null, 2));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
