const crypto = require("node:crypto");
const nodeFs = require("node:fs/promises");
const nodePath = require("node:path");

const WINDOWS_REPLACE_ERROR_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);
const DEFAULT_REPLACE_RETRY_DELAYS_MS = [10, 40, 100, 250];

class AISettingsStore {
  constructor({
    filePath,
    defaultSettings,
    normalizeStored,
    fs = nodeFs,
    path = nodePath,
    platform = process.platform,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    createNonce = () => `${process.pid}-${crypto.randomBytes(6).toString("hex")}`,
    replaceRetryDelaysMs = DEFAULT_REPLACE_RETRY_DELAYS_MS,
    onDiagnostic
  }) {
    if (typeof filePath !== "string" || !filePath) throw new TypeError("AI settings filePath is required.");
    if (typeof normalizeStored !== "function") throw new TypeError("AI settings normalizer is required.");
    this.filePath = filePath;
    this.backupPath = `${filePath}.bak`;
    this.defaultSettings = Object.freeze({ ...defaultSettings, encryptedApiKey: "" });
    this.normalizeStored = normalizeStored;
    this.fs = fs;
    this.path = path;
    this.platform = platform;
    this.sleep = sleep;
    this.createNonce = createNonce;
    this.replaceRetryDelaysMs = [...replaceRetryDelaysMs];
    this.onDiagnostic = onDiagnostic;
    this.writeQueue = Promise.resolve();
    this.lastKnownGood = null;
  }

  read() {
    return this.#enqueue(async () => {
      // Reads share the mutation lane because recovery may atomically repair
      // the primary. A delayed repair must never overwrite a later save.
      const current = await this.#loadCurrent();
      return current.settings;
    });
  }

  /**
   * @param {Record<string, unknown> | null} settings
   * @param {{ credentialAction?: "preserve" | "set" | "clear", encryptedApiKey?: string }} [options]
   */
  save(settings, { credentialAction = "preserve", encryptedApiKey } = {}) {
    return this.#enqueue(async () => {
      const current = await this.#loadCurrent();
      let nextEncryptedApiKey;
      if (credentialAction === "preserve") {
        if (!current.credentialKnown) {
          throw settingsStoreError("ai_settings_credential_recovery_failed");
        }
        nextEncryptedApiKey = current.settings.encryptedApiKey;
      } else if (credentialAction === "set") {
        if (typeof encryptedApiKey !== "string" || !encryptedApiKey) {
          throw settingsStoreError("ai_settings_invalid_encrypted_key");
        }
        nextEncryptedApiKey = encryptedApiKey;
      } else if (credentialAction === "clear") {
        nextEncryptedApiKey = "";
      } else {
        throw settingsStoreError("ai_settings_invalid_credential_action");
      }

      const nonCredentialSettings = settings ?? current.settings;
      const next = this.normalizeStored({ ...nonCredentialSettings, encryptedApiKey: nextEncryptedApiKey });
      if (!next) throw settingsStoreError("ai_settings_invalid_document");
      await this.#commit(current.credentialKnown ? current.settings : null, next);
      return next;
    });
  }

  async flush() {
    await this.writeQueue;
  }

  #enqueue(operation) {
    const result = this.writeQueue
      .catch(() => undefined)
      .then(operation);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async #loadCurrent() {
    await this.#cleanupTemporaryFiles();
    const primary = await this.#readCandidate(this.filePath, "primary");
    if (primary.status === "valid") {
      this.lastKnownGood = primary.settings;
      return { settings: primary.settings, credentialKnown: true };
    }

    const backup = await this.#readCandidate(this.backupPath, "backup");
    if (backup.status === "valid") {
      this.lastKnownGood = backup.settings;
      await this.#restorePrimary(backup.settings, "backup_recovery_failed");
      return { settings: backup.settings, credentialKnown: true };
    }

    if (this.lastKnownGood) {
      await this.#restorePrimary(this.lastKnownGood, "memory_recovery_failed");
      return { settings: this.lastKnownGood, credentialKnown: true };
    }

    if (primary.status === "missing" && backup.status === "missing") {
      const fresh = { ...this.defaultSettings };
      this.lastKnownGood = fresh;
      return { settings: fresh, credentialKnown: true };
    }

    this.#diagnostic("credential_recovery_failed");
    return { settings: { ...this.defaultSettings }, credentialKnown: false };
  }

  async #readCandidate(candidatePath, kind) {
    try {
      const parsed = JSON.parse(await this.fs.readFile(candidatePath, "utf8"));
      const settings = this.normalizeStored(parsed);
      if (!settings) {
        this.#diagnostic(`${kind}_invalid`);
        return { status: "invalid" };
      }
      return { status: "valid", settings };
    } catch (error) {
      if (error?.code === "ENOENT") return { status: "missing" };
      this.#diagnostic(`${kind}_read_failed`, error);
      return { status: "invalid" };
    }
  }

  async #restorePrimary(settings, diagnostic) {
    try {
      await this.#writeAtomic(this.filePath, settings);
    } catch (error) {
      // A validated backup or in-memory value remains usable even if repairing
      // the primary is temporarily blocked by the filesystem.
      this.#diagnostic(diagnostic, error);
    }
  }

  async #commit(current, next) {
    const directory = this.path.dirname(this.filePath);
    await this.fs.mkdir(directory, { recursive: true });

    // Preserve a validated prior document before publishing the new primary.
    // No step removes the only valid credential-bearing file.
    if (current) await this.#writeAtomic(this.backupPath, current);
    await this.#writeAtomic(this.filePath, next);
    this.lastKnownGood = next;

    try {
      await this.#writeAtomic(this.backupPath, next);
    } catch (error) {
      // The primary is already durable and either the prior backup or memory is
      // still a verified recovery source. Report the degraded redundancy only.
      this.#diagnostic("backup_refresh_failed", error);
    }
  }

  async #writeAtomic(target, settings) {
    const directory = this.path.dirname(target);
    const temporary = `${target}.tmp-${this.createNonce()}`;
    const serialized = `${JSON.stringify(settings, null, 2)}\n`;
    let handle;
    await this.fs.mkdir(directory, { recursive: true });
    try {
      handle = await this.fs.open(temporary, "wx", 0o600);
      await handle.writeFile(serialized, { encoding: "utf8" });
      await handle.sync();
      await handle.close();
      handle = undefined;
      await this.#replace(temporary, target);
      await this.fs.chmod(target, 0o600).catch(() => undefined);
      await this.#syncDirectory(directory);
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await this.fs.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async #replace(temporary, target) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.fs.rename(temporary, target);
        return;
      } catch (error) {
        const retry = this.platform === "win32"
          && WINDOWS_REPLACE_ERROR_CODES.has(error?.code)
          && attempt < this.replaceRetryDelaysMs.length;
        if (!retry) throw error;
        await this.sleep(this.replaceRetryDelaysMs[attempt]);
      }
    }
  }

  async #syncDirectory(directory) {
    if (this.platform === "win32") return;
    let handle;
    try {
      handle = await this.fs.open(directory, "r");
      await handle.sync();
    } catch (error) {
      this.#diagnostic("directory_sync_failed", error);
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  async #cleanupTemporaryFiles() {
    const directory = this.path.dirname(this.filePath);
    const prefixes = [this.path.basename(this.filePath), this.path.basename(this.backupPath)]
      .map((name) => `${name}.tmp-`);
    let entries;
    try {
      entries = await this.fs.readdir(directory);
    } catch (error) {
      if (error?.code !== "ENOENT") this.#diagnostic("temporary_cleanup_scan_failed", error);
      return;
    }
    await Promise.all(entries
      .filter((name) => prefixes.some((prefix) => name.startsWith(prefix)))
      .map((name) => this.fs.rm(this.path.join(directory, name), { force: true }).catch((error) => {
        this.#diagnostic("temporary_cleanup_failed", error);
      })));
  }

  #diagnostic(event, error) {
    try {
      this.onDiagnostic?.({ event, errorCode: typeof error?.code === "string" ? error.code : undefined });
    } catch {
      // Diagnostics must never affect credential durability.
    }
  }
}

function settingsStoreError(code) {
  /** @type {NodeJS.ErrnoException} */
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = {
  AISettingsStore,
  DEFAULT_REPLACE_RETRY_DELAYS_MS,
  WINDOWS_REPLACE_ERROR_CODES
};
