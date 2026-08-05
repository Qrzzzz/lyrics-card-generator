const crypto = require("node:crypto");
const defaultFs = require("node:fs/promises");
const defaultPath = require("node:path");
const { types: utilTypes } = require("node:util");

const IMPORT_HISTORY_SCHEMA_VERSION = 2;
const LEGACY_IMPORT_HISTORY_SCHEMA_VERSION = 1;
const DEFAULT_IMPORT_HISTORY_LIMIT = 10;
const IMPORT_HISTORY_LIMITS = new Set([5, 10, "unlimited"]);
const MAX_RECORD_BYTES = 512 * 1024;
const MAX_MANUAL_SAVE_JSON_DEPTH = 128;
const MANUAL_SAVE_ENVELOPE_VERSION = 1;
const MANUAL_SAVE_ENVELOPE_PREFIX = `{"version":${MANUAL_SAVE_ENVELOPE_VERSION},"snapshot":`;
const MAX_MANUAL_SAVE_ENVELOPE_BYTES = MAX_RECORD_BYTES + Buffer.byteLength(`${MANUAL_SAVE_ENVELOPE_PREFIX}}`, "utf8");
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_TIMESTAMP_MS = 8_640_000_000_000_000;
const AUDIO_EXTENSIONS = new Set([".mp3", ".flac"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const HISTORY_KINDS = new Set(["link", "search", "local-audio", "manual-cover", "manual-save"]);
const SONG_SOURCES = new Set(["qq", "netease", "apple", "spotify", "unknown"]);

class ImportHistoryStore {
  constructor({
    filePath,
    fs = defaultFs,
    path = defaultPath,
    now = () => Date.now(),
    createId = () => crypto.randomUUID()
  }) {
    if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
      throw new TypeError("Import history requires an absolute file path.");
    }
    this.filePath = filePath;
    this.fs = fs;
    this.path = path;
    this.now = now;
    this.createId = createId;
    this.document = null;
    this.loadPromise = null;
    this.writeQueue = Promise.resolve();
    this.notice = null;
  }

  list(options = {}) {
    return this.#enqueue(async () => {
      const document = await this.#ensureLoaded();
      const offset = boundedInteger(options.offset, 0, 1_000_000, 0);
      const limit = boundedInteger(options.limit, 1, 50, 24);
      const query = normalizeSearchText(options.query);
      const source = HISTORY_KINDS.has(options.source) ? options.source : "all";
      const filtered = document.records.filter((record) => {
        if (source !== "all" && record.kind !== source) return false;
        return !query || historySearchText(record).includes(query);
      });
      const notice = this.notice;
      this.notice = null;
      return {
        records: filtered.slice(offset, offset + limit).map(toPublicImportHistoryRecord),
        total: filtered.length,
        notice
      };
    });
  }

  stats() {
    return this.#enqueue(async () => {
      const document = await this.#ensureLoaded();
      return {
        total: document.records.length,
        version: importHistoryDocumentVersion(document)
      };
    });
  }

  initialize() {
    return this.#enqueue(() => cleanupImportHistoryTemporaryFiles({
      filePath: this.filePath,
      fs: this.fs,
      path: this.path
    }));
  }

  get(recordId) {
    return this.#enqueue(async () => {
      const document = await this.#ensureLoaded();
      const id = normalizeId(recordId);
      if (!id) return null;
      return document.records.find((record) => record.id === id) ?? null;
    });
  }

  upsert(candidate, limit = DEFAULT_IMPORT_HISTORY_LIMIT) {
    return this.#mutate((document) => {
      if (candidate?.kind === "manual-save") {
        throw historyError("invalid_kind");
      }
      const timestamp = this.now();
      const normalized = normalizeImportHistoryRecord({
        ...candidate,
        id: this.createId(),
        createdAt: timestamp,
        lastUsedAt: timestamp
      }, this.path);
      if (!normalized) {
        throw historyError("invalid_record");
      }
      const key = importHistoryDedupeKey(normalized, this.path);
      const duplicate = document.records.find((record) => importHistoryDedupeKey(record, this.path) === key);
      const record = duplicate
        ? { ...normalized, id: duplicate.id, createdAt: duplicate.createdAt, lastUsedAt: timestamp }
        : normalized;
      const records = [
        record,
        ...document.records.filter((existing) => existing.id !== record.id && importHistoryDedupeKey(existing, this.path) !== key)
      ];
      return {
        document: withHistoryLimit({ schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION, records }, limit),
        result: toPublicImportHistoryRecord(record)
      };
    });
  }

  createManualSave(envelope, limit = DEFAULT_IMPORT_HISTORY_LIMIT) {
    const snapshot = parseManualSaveEnvelope(envelope);
    if (!snapshot) return Promise.reject(historyError("invalid_snapshot"));
    return this.#mutate((document) => {
      const timestamp = this.now();
      const record = normalizeManualSaveWriteRecord(snapshot, {
        id: this.createId(),
        createdAt: timestamp,
        lastUsedAt: timestamp
      }, this.path);
      if (!record) throw historyError("invalid_snapshot");
      const records = [record, ...document.records];
      return {
        document: withHistoryLimit({ schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION, records }, limit),
        result: toPublicImportHistoryRecord(record)
      };
    });
  }

  updateManualSave(recordId, envelope, limit = DEFAULT_IMPORT_HISTORY_LIMIT) {
    const snapshot = parseManualSaveEnvelope(envelope);
    if (!snapshot) return Promise.reject(historyError("invalid_snapshot"));
    return this.#mutate((document) => {
      const id = normalizeId(recordId);
      const existing = id ? document.records.find((record) => record.id === id) : null;
      if (!existing) throw historyError("not_found");
      if (existing.kind !== "manual-save") throw historyError("invalid_kind");

      const record = normalizeManualSaveWriteRecord(snapshot, {
        id: existing.id,
        createdAt: existing.createdAt,
        lastUsedAt: this.now()
      }, this.path);
      if (!record) throw historyError("invalid_snapshot");
      const records = [record, ...document.records.filter((current) => current.id !== existing.id)];
      return {
        document: withHistoryLimit({ schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION, records }, limit),
        result: toPublicImportHistoryRecord(record)
      };
    });
  }

  touch(recordId, limit = DEFAULT_IMPORT_HISTORY_LIMIT) {
    return this.#mutate((document) => {
      const id = normalizeId(recordId);
      const existing = id ? document.records.find((record) => record.id === id) : null;
      if (!existing) {
        return { document, result: false, write: false };
      }
      const touched = { ...existing, lastUsedAt: this.now() };
      const records = [touched, ...document.records.filter((record) => record.id !== id)];
      return {
        document: withHistoryLimit({ schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION, records }, limit),
        result: true
      };
    });
  }

  remove(recordId) {
    return this.#mutate((document) => {
      const id = normalizeId(recordId);
      const records = id ? document.records.filter((record) => record.id !== id) : document.records;
      if (records.length === document.records.length) {
        return { document, result: false, write: false };
      }
      return {
        document: { schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION, records },
        result: true
      };
    });
  }

  clear() {
    return this.#mutate((document) => {
      if (document.records.length === 0) {
        return { document, result: 0, write: false };
      }
      return {
        document: { schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION, records: [] },
        result: document.records.length
      };
    });
  }

  trim(limit) {
    return this.#mutate((document) => {
      const next = withHistoryLimit(document, limit);
      const trimmed = document.records.length - next.records.length;
      return { document: next, result: trimmed, write: trimmed > 0 };
    });
  }

  commitReplay(recordId, { limit = DEFAULT_IMPORT_HISTORY_LIMIT, file } = {}) {
    return this.#mutate((document) => {
      const id = normalizeId(recordId);
      const existing = id ? document.records.find((record) => record.id === id) : null;
      if (!existing) {
        return { document, result: false, write: false };
      }

      let source = existing.source;
      if (file !== undefined) {
        if (existing.kind !== "local-audio" && existing.kind !== "manual-cover") {
          throw historyError("invalid_file");
        }
        source = normalizeFileSource(file, existing.kind, this.path);
        if (!source) throw historyError("invalid_file");
      }

      const updated = normalizeImportHistoryRecord({
        ...existing,
        source,
        lastUsedAt: this.now()
      }, this.path);
      if (!updated) throw historyError("invalid_record");
      const key = importHistoryDedupeKey(updated, this.path);
      const records = [
        updated,
        ...document.records.filter((record) => (
          record.id !== id && importHistoryDedupeKey(record, this.path) !== key
        ))
      ];
      return {
        document: withHistoryLimit({ schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION, records }, limit),
        result: true
      };
    });
  }

  applyLimitTransaction(limit, confirmation, persistPreferences) {
    if (typeof persistPreferences !== "function") {
      throw new TypeError("Import history limit transactions require a preference writer.");
    }
    return this.#enqueue(async () => {
      const current = await this.#ensureLoaded();
      const next = withHistoryLimit(current, limit);
      const trimmed = current.records.length - next.records.length;
      if (trimmed > 0) {
        const expectedVersion = boundedString(confirmation?.expectedVersion, 128);
        const confirmedTrimCount = Number(confirmation?.confirmedTrimCount);
        if (
          expectedVersion !== importHistoryDocumentVersion(current) ||
          !Number.isSafeInteger(confirmedTrimCount) ||
          confirmedTrimCount !== trimmed
        ) {
          throw historyError("history_confirmation_stale");
        }

        await this.#writeDocument(next);
        try {
          const persisted = await persistPreferences();
          this.document = next;
          return { trimmed, persisted };
        } catch (error) {
          try {
            await this.#writeDocument(current);
          } catch (rollbackError) {
            this.document = next;
            if (isObject(error)) error.rollbackError = rollbackError;
          }
          throw error;
        }
      }

      return { trimmed: 0, persisted: await persistPreferences() };
    });
  }

  async flush() {
    await this.writeQueue;
    if (this.loadPromise) await this.loadPromise;
  }

  #enqueue(operation) {
    const result = this.writeQueue
      .catch(() => undefined)
      .then(operation);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  #mutate(mutator) {
    return this.#enqueue(async () => {
      const current = await this.#ensureLoaded();
      const mutation = mutator(current);
      if (mutation.write === false) return mutation.result;
      await this.#writeDocument(mutation.document);
      this.document = mutation.document;
      return mutation.result;
    });
  }

  #ensureLoaded() {
    if (this.document) return Promise.resolve(this.document);
    if (!this.loadPromise) {
      this.loadPromise = this.#readDocument().finally(() => {
        this.loadPromise = null;
      });
    }
    return this.loadPromise;
  }

  async #readDocument() {
    await cleanupImportHistoryTemporaryFiles({
      filePath: this.filePath,
      fs: this.fs,
      path: this.path
    });

    let parsed;
    try {
      parsed = JSON.parse(await this.fs.readFile(this.filePath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") {
        const empty = emptyHistoryDocument();
        this.document = empty;
        return empty;
      }
      if (!(error instanceof SyntaxError)) throw error;
      return this.#recoverCorruptDocument();
    }

    const normalized = normalizeImportHistoryDocument(parsed, this.path);
    if (!normalized) return this.#recoverCorruptDocument();
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      try {
        await this.#writeDocument(normalized);
      } catch (cause) {
        const error = historyError("history_migration_failed");
        error.cause = cause;
        throw error;
      }
    }
    this.document = normalized;
    return normalized;
  }

  async #recoverCorruptDocument() {
    const backupPath = await preserveCorruptHistoryFile({
      filePath: this.filePath,
      fs: this.fs,
      path: this.path,
      now: this.now()
    });
    const empty = emptyHistoryDocument();
    await this.#writeDocument(empty);
    this.notice = {
      code: "corrupt_recovered",
      backupFileName: backupPath ? this.path.basename(backupPath) : ""
    };
    this.document = empty;
    return empty;
  }

  async #writeDocument(document) {
    const directory = this.path.dirname(this.filePath);
    const temporary = `${this.filePath}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
    await this.fs.mkdir(directory, { recursive: true });
    try {
      await this.fs.writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600
      });
      await this.fs.rename(temporary, this.filePath);
      await this.fs.chmod(this.filePath, 0o600).catch(() => undefined);
    } catch (error) {
      await this.fs.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

function emptyHistoryDocument() {
  return { schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION, records: [] };
}

function normalizeImportHistoryDocument(input, path = defaultPath) {
  if (
    !isObject(input) ||
    (input.schemaVersion !== LEGACY_IMPORT_HISTORY_SCHEMA_VERSION && input.schemaVersion !== IMPORT_HISTORY_SCHEMA_VERSION) ||
    !Array.isArray(input.records)
  ) {
    return null;
  }
  const records = [];
  const recordIds = new Set();
  for (const candidate of input.records) {
    if (input.schemaVersion === LEGACY_IMPORT_HISTORY_SCHEMA_VERSION && candidate?.kind === "manual-save") continue;
    const record = normalizeImportHistoryRecord(candidate, path);
    if (!record) continue;
    if (recordIds.has(record.id)) continue;
    recordIds.add(record.id);
    records.push(record);
  }
  return { schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION, records };
}

function normalizeImportHistoryRecord(input, path = defaultPath) {
  if (!isObject(input) || !HISTORY_KINDS.has(input.kind)) return null;
  const id = normalizeId(input.id);
  const createdAt = normalizeTimestamp(input.createdAt);
  const lastUsedAt = normalizeTimestamp(input.lastUsedAt);
  if (!id || createdAt === null || lastUsedAt === null) return null;
  let snapshot;
  const display = input.kind === "manual-save"
    ? (() => {
        snapshot = normalizeManualSnapshot(input.snapshot, "manual-save");
        return snapshot ? normalizeManualSaveDisplay(snapshot) : null;
      })()
    : normalizeDisplay(input.display, input.kind);
  if (!display) return null;

  let source;
  if (input.kind === "link") {
    source = normalizeLinkSource(input.source ?? input);
  } else if (input.kind === "search") {
    source = normalizeSearchSource(input.source ?? input);
  } else if (input.kind !== "manual-save") {
    source = normalizeFileSource(input.source ?? input.file, input.kind, path);
  }
  if (input.kind !== "manual-save" && !source) return null;

  const record = {
    id,
    kind: input.kind,
    createdAt,
    lastUsedAt: Math.max(createdAt, lastUsedAt),
    display,
    ...(source ? { source } : {})
  };
  if (input.kind === "manual-cover") {
    snapshot = normalizeManualSnapshot(input.snapshot, "manual-cover");
    if (!snapshot) return null;
    record.snapshot = snapshot;
  } else if (input.kind === "manual-save") {
    record.snapshot = snapshot;
  }
  return Buffer.byteLength(JSON.stringify(record), "utf8") <= MAX_RECORD_BYTES ? record : null;
}

function normalizeDisplay(input, kind) {
  if (!isObject(input)) return null;
  const title = boundedString(input.title, 512);
  const artist = boundedString(input.artist, 512);
  const album = boundedString(input.album, 512);
  const source = boundedString(input.source, 64).toLowerCase() || "unknown";
  const remoteCoverUrl = normalizeHttpUrl(input.remoteCoverUrl);
  if (!title && !artist && kind !== "manual-cover" && kind !== "manual-save") return null;
  return {
    title,
    artist,
    album,
    source,
    ...(remoteCoverUrl ? { remoteCoverUrl } : {})
  };
}

function normalizeLinkSource(input) {
  if (!isObject(input)) return null;
  const extracted = extractHttpUrl(input.inputUrl);
  const inputUrl = normalizeHttpUrl(extracted);
  const normalizedUrl = normalizeHttpUrl(input.normalizedUrl) || normalizeHttpUrl(extracted);
  const finalUrl = normalizeHttpUrl(input.finalUrl);
  if (!inputUrl && !normalizedUrl && !finalUrl) return null;
  return {
    ...(inputUrl ? { inputUrl } : {}),
    ...(normalizedUrl ? { normalizedUrl } : {}),
    ...(finalUrl ? { finalUrl } : {})
  };
}

function normalizeSearchSource(input) {
  if (!isObject(input)) return null;
  const query = boundedString(input.query, 1024);
  const platform = boundedString(input.platform, 32).toLowerCase();
  const songId = boundedString(input.songId, 256);
  const pageUrl = normalizeHttpUrl(input.pageUrl);
  if (!query || platform !== "netease" || !/^\d{1,32}$/.test(songId)) return null;
  return { query, platform, songId, ...(pageUrl ? { pageUrl } : {}) };
}

function normalizeFileSource(input, kind, path = defaultPath) {
  if (!isObject(input)) return null;
  const filePath = normalizeAbsolutePath(input.path, path);
  if (!filePath) return null;
  const validation = validateImportFileDescriptor(kind, filePath, {
    size: input.size,
    mtimeMs: input.mtimeMs,
    isFile: true
  }, path);
  if (!validation.ok) return null;
  return {
    path: filePath,
    fileName: boundedString(input.fileName, 512) || path.basename(filePath),
    size: validation.size,
    mtimeMs: validation.mtimeMs
  };
}

function normalizeManualSnapshot(input, kind = "manual-cover") {
  if (!isObject(input)) return null;
  const title = boundedString(input.title, 512);
  const artist = boundedString(input.artist, 512);
  const source = SONG_SOURCES.has(input.source) ? input.source : "unknown";
  const snapshot = {
    title,
    artist,
    album: boundedString(input.album, 512),
    source,
    originalUrl: normalizeManualHttpUrl(input.originalUrl),
    finalUrl: normalizeManualHttpUrl(input.finalUrl),
    lyrics: boundedString(input.lyrics, 120_000, false),
    translationText: boundedString(input.translationText, 120_000, false),
    translationEnabled: input.translationEnabled === true
  };
  if (kind === "manual-save") {
    snapshot.explicit = input.explicit === true;
    snapshot.originalCoverUrl = normalizeManualHttpUrl(input.originalCoverUrl);
    snapshot.coverUrl = normalizeManualHttpUrl(input.coverUrl);
    snapshot.parseMethod = normalizeParseMethod(input.parseMethod);
    if (!isMeaningfulManualSaveSnapshot(snapshot)) return null;
  }
  return snapshot;
}

function normalizeManualSaveWriteRecord(snapshot, metadata, path = defaultPath) {
  return normalizeImportHistoryRecord({
    kind: "manual-save",
    id: metadata.id,
    createdAt: metadata.createdAt,
    lastUsedAt: metadata.lastUsedAt,
    snapshot
  }, path);
}

function normalizeManualSaveDisplay(snapshot) {
  return normalizeDisplay({
    title: snapshot.title,
    artist: snapshot.artist,
    album: snapshot.album,
    source: snapshot.source,
    remoteCoverUrl: snapshot.originalCoverUrl || snapshot.coverUrl
  }, "manual-save");
}

function parseManualSaveEnvelope(value) {
  if (
    typeof value !== "string" ||
    value.length > MAX_MANUAL_SAVE_ENVELOPE_BYTES ||
    Buffer.byteLength(value, "utf8") > MAX_MANUAL_SAVE_ENVELOPE_BYTES ||
    !value.startsWith(MANUAL_SAVE_ENVELOPE_PREFIX) ||
    !value.endsWith("}")
  ) {
    return null;
  }

  let envelope;
  try {
    envelope = JSON.parse(value);
  } catch {
    return null;
  }

  if (!isObject(envelope) || Object.getPrototypeOf(envelope) !== Object.prototype) return null;
  const keys = Reflect.ownKeys(envelope);
  if (keys.length !== 2 || keys[0] !== "version" || keys[1] !== "snapshot") return null;
  const version = Object.getOwnPropertyDescriptor(envelope, "version");
  const snapshot = Object.getOwnPropertyDescriptor(envelope, "snapshot");
  if (
    !isEnumerableDataProperty(version) ||
    version.value !== MANUAL_SAVE_ENVELOPE_VERSION ||
    !isEnumerableDataProperty(snapshot) ||
    !manualSaveSnapshotFieldsFit(snapshot.value)
  ) {
    return null;
  }

  try {
    return JSON.stringify(envelope) === value ? snapshot.value : null;
  } catch {
    return null;
  }
}

function manualSaveSnapshotFieldsFit(input) {
  if (
    !jsonLikeTreeFitsWithinByteLimit(input, MAX_RECORD_BYTES, MAX_MANUAL_SAVE_JSON_DEPTH) ||
    !isObject(input)
  ) {
    return false;
  }
  const limits = {
    title: 512,
    artist: 512,
    album: 512,
    originalCoverUrl: 8192,
    coverUrl: 8192,
    originalUrl: 8192,
    finalUrl: 8192,
    parseMethod: 128,
    lyrics: 120_000,
    translationText: 120_000
  };
  const fieldsFit = Object.entries(limits).every(([field, limit]) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    return !descriptor || (
      isEnumerableDataProperty(descriptor) &&
      typeof descriptor.value === "string" &&
      descriptor.value.length <= limit
    );
  });
  if (!fieldsFit) return false;
  const source = Object.getOwnPropertyDescriptor(input, "source");
  const explicit = Object.getOwnPropertyDescriptor(input, "explicit");
  const translationEnabled = Object.getOwnPropertyDescriptor(input, "translationEnabled");
  return (
    (!source || (isEnumerableDataProperty(source) && typeof source.value === "string")) &&
    (!explicit || (isEnumerableDataProperty(explicit) && typeof explicit.value === "boolean")) &&
    (!translationEnabled || (
      isEnumerableDataProperty(translationEnabled) &&
      typeof translationEnabled.value === "boolean"
    ))
  );
}

function jsonLikeTreeFitsWithinByteLimit(root, maximumBytes, maximumDepth) {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 0 ||
    !Number.isSafeInteger(maximumDepth) ||
    maximumDepth < 0
  ) {
    return false;
  }
  let remainingBytes = maximumBytes;
  const pending = [{ value: root, depth: 0 }];
  const seen = new WeakSet();
  const consume = (bytes) => {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > remainingBytes) return false;
    remainingBytes -= bytes;
    return true;
  };

  try {
    while (pending.length > 0) {
      const { value, depth } = pending.pop();
      if (depth > maximumDepth) return false;
      if (value === null) {
        if (!consume(4)) return false;
        continue;
      }

      const valueType = typeof value;
      if (valueType === "string") {
        if (!consumeJsonStringUtf8Bytes(value, consume)) return false;
        continue;
      }
      if (valueType === "boolean") {
        if (!consume(value ? 4 : 5)) return false;
        continue;
      }
      if (valueType === "number") {
        if (!Number.isFinite(value) || !consume(String(value).length)) return false;
        continue;
      }
      if (valueType !== "object" || utilTypes.isProxy(value) || seen.has(value)) return false;
      seen.add(value);

      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) return false;
        const length = value.length;
        if (!consume(2 + Math.max(0, length - 1))) return false;
        const ownKeys = Reflect.ownKeys(value);
        if (ownKeys.length !== length + 1 || !ownKeys.includes("length")) return false;
        for (let index = length - 1; index >= 0; index -= 1) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
          if (!isEnumerableDataProperty(descriptor)) return false;
          pending.push({ value: descriptor.value, depth: depth + 1 });
        }
        continue;
      }

      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return false;
      const ownKeys = Reflect.ownKeys(value);
      if (!consume(2 + Math.max(0, ownKeys.length - 1))) return false;
      for (const key of ownKeys) {
        if (typeof key !== "string") return false;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!isEnumerableDataProperty(descriptor)) return false;
        if (!consumeJsonStringUtf8Bytes(key, consume) || !consume(1)) return false;
        pending.push({ value: descriptor.value, depth: depth + 1 });
      }
    }
  } catch {
    return false;
  }
  return true;
}

function isEnumerableDataProperty(descriptor) {
  return Boolean(
    descriptor?.enumerable &&
    Object.prototype.hasOwnProperty.call(descriptor, "value")
  );
}

function consumeJsonStringUtf8Bytes(value, consume) {
  if (!consume(2)) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    let bytes;
    if (codeUnit === 0x22 || codeUnit === 0x5c) {
      bytes = 2;
    } else if (codeUnit <= 0x1f) {
      bytes = codeUnit === 0x08 || codeUnit === 0x09 || codeUnit === 0x0a || codeUnit === 0x0c || codeUnit === 0x0d
        ? 2
        : 6;
    } else if (codeUnit <= 0x7f) {
      bytes = 1;
    } else if (codeUnit <= 0x7ff) {
      bytes = 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes = 4;
        index += 1;
      } else {
        bytes = 6;
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      bytes = 6;
    } else {
      bytes = 3;
    }
    if (!consume(bytes)) return false;
  }
  return true;
}

function isMeaningfulManualSaveSnapshot(snapshot) {
  return Boolean(
    snapshot.source !== "unknown" ||
    snapshot.explicit ||
    snapshot.title ||
    snapshot.artist ||
    snapshot.album ||
    snapshot.originalCoverUrl ||
    snapshot.coverUrl ||
    snapshot.originalUrl ||
    snapshot.finalUrl ||
    snapshot.parseMethod ||
    snapshot.lyrics.trim() ||
    snapshot.translationText.trim() ||
    snapshot.translationEnabled
  );
}

function normalizeParseMethod(value) {
  const method = boundedString(value, 128);
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(method) ? method : "";
}

function importHistoryDedupeKey(record, path = defaultPath) {
  if (record.kind === "manual-save") return `manual-save:${record.id}`;
  if (record.kind === "search") {
    return `song:${record.source.platform}:${record.source.songId.toLowerCase()}`;
  }
  if (record.kind === "link") {
    const url = record.source.finalUrl || record.source.normalizedUrl;
    return platformSongKey(record.display.source, url) || `url:${normalizeHttpUrl(url).toLowerCase()}`;
  }
  const normalizedPath = normalizeAbsolutePath(record.source.path, path);
  const pathKey = process.platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
  return `${record.kind}:${pathKey}`;
}

function platformSongKey(source, value) {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    if (host === "music.163.com" || host.endsWith(".music.163.com")) {
      const id = url.searchParams.get("id") || url.pathname.match(/\/song\/(\d+)/)?.[1];
      if (id && /^\d+$/.test(id)) return `song:netease:${id}`;
    }
    if (host === "open.spotify.com") {
      const id = url.pathname.match(/^\/track\/([A-Za-z0-9]+)(?:\/|$)/)?.[1];
      if (id) return `song:spotify:${id.toLowerCase()}`;
    }
    if (host === "y.qq.com" || host.endsWith(".y.qq.com")) {
      const id = url.searchParams.get("songmid") || url.pathname.match(/\/songDetail\/([A-Za-z0-9]+)/i)?.[1];
      if (id) return `song:qq:${id.toLowerCase()}`;
    }
    if (host === "music.apple.com" || host.endsWith(".music.apple.com")) {
      const id = url.searchParams.get("i") || url.pathname.match(/\/(\d+)(?:\?|$)/)?.[1];
      if (id && /^\d+$/.test(id)) return `song:apple:${id}`;
    }
    if (SONG_SOURCES.has(source) && source !== "unknown") {
      return `url:${source}:${normalized.toLowerCase()}`;
    }
  } catch {
    return "";
  }
  return "";
}

function withHistoryLimit(document, limit) {
  const normalized = normalizeImportHistoryLimit(limit);
  return {
    schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION,
    records: normalized === "unlimited" ? [...document.records] : document.records.slice(0, normalized)
  };
}

function importHistoryDocumentVersion(document) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(document.records))
    .digest("base64url");
}

function normalizeImportHistoryLimit(value) {
  return IMPORT_HISTORY_LIMITS.has(value) ? value : DEFAULT_IMPORT_HISTORY_LIMIT;
}

function toPublicImportHistoryRecord(record) {
  let detail = "";
  if (record.kind === "link") {
    detail = hostnameForUrl(record.source.finalUrl || record.source.normalizedUrl);
  } else if (record.kind === "search") {
    detail = hostnameForUrl(record.source.pageUrl) || record.source.platform;
  } else if (record.kind !== "manual-save") {
    detail = record.source.fileName;
  }
  return {
    id: record.id,
    kind: record.kind,
    title: record.display.title,
    artist: record.display.artist,
    album: record.display.album,
    source: record.display.source,
    importedAt: record.lastUsedAt,
    detail,
    ...(record.display.remoteCoverUrl ? { remoteCoverUrl: record.display.remoteCoverUrl } : {})
  };
}

function validateImportFileDescriptor(kind, filePath, stat, path = defaultPath) {
  if (kind !== "local-audio" && kind !== "manual-cover") {
    return { ok: false, code: "unsupported_file_kind" };
  }
  const normalizedPath = normalizeAbsolutePath(filePath, path);
  if (!normalizedPath) return { ok: false, code: "invalid_path" };
  const extension = path.extname(normalizedPath).toLowerCase();
  const accepted = kind === "local-audio" ? AUDIO_EXTENSIONS : IMAGE_EXTENSIONS;
  if (!accepted.has(extension)) return { ok: false, code: "unsupported_file_type" };
  const size = Number(stat?.size);
  const mtimeMs = Number(stat?.mtimeMs);
  const isFile = typeof stat?.isFile === "function" ? stat.isFile() : stat?.isFile === true;
  if (!isFile) return { ok: false, code: "invalid_file" };
  if (!Number.isSafeInteger(size) || size < 0) return { ok: false, code: "invalid_file" };
  if (!Number.isFinite(mtimeMs) || mtimeMs < 0 || mtimeMs > MAX_TIMESTAMP_MS) {
    return { ok: false, code: "invalid_file" };
  }
  const maximum = kind === "local-audio" ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
  if (size > maximum) return { ok: false, code: "file_too_large" };
  return { ok: true, path: normalizedPath, extension, size, mtimeMs };
}

async function readValidatedImportFile(kind, filePath, {
  fs = defaultFs,
  path = defaultPath,
  chunkSize = 64 * 1024
} = {}) {
  const normalizedPath = normalizeAbsolutePath(filePath, path);
  if (!normalizedPath) return { ok: false, code: "invalid_path" };

  let handle;
  try {
    handle = await fs.open(normalizedPath, "r");
    const before = await handle.stat();
    const validated = validateImportFileDescriptor(kind, normalizedPath, before, path);
    if (!validated.ok) return validated;

    const maximum = kind === "local-audio" ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
    const safeChunkSize = boundedInteger(chunkSize, 4 * 1024, 1024 * 1024, 64 * 1024);
    const chunks = [];
    let total = 0;
    while (total <= maximum) {
      const buffer = Buffer.allocUnsafe(Math.min(safeChunkSize, maximum + 1 - total));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, total);
      if (bytesRead === 0) break;
      chunks.push(buffer.subarray(0, bytesRead));
      total += bytesRead;
    }
    if (total > maximum) return { ok: false, code: "file_too_large" };

    const after = await handle.stat();
    const revalidated = validateImportFileDescriptor(kind, normalizedPath, after, path);
    if (!revalidated.ok) return revalidated;
    const beforeCtimeMs = Number(before.ctimeMs);
    const afterCtimeMs = Number(after.ctimeMs);
    const ctimeChanged = Number.isFinite(beforeCtimeMs) && Number.isFinite(afterCtimeMs) &&
      Math.abs(beforeCtimeMs - afterCtimeMs) > 1;
    if (
      validated.size !== revalidated.size ||
      Math.abs(validated.mtimeMs - revalidated.mtimeMs) > 1 ||
      ctimeChanged ||
      total !== revalidated.size
    ) {
      return { ok: false, code: "file_changed_during_read" };
    }

    return {
      ok: true,
      bytes: Buffer.concat(chunks, total),
      path: revalidated.path,
      extension: revalidated.extension,
      size: revalidated.size,
      mtimeMs: revalidated.mtimeMs
    };
  } catch (error) {
    return {
      ok: false,
      code: error?.code === "ENOENT" ? "file_missing" : "file_invalid"
    };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function cleanupImportHistoryTemporaryFiles({ filePath, fs = defaultFs, path = defaultPath }) {
  const directory = path.dirname(filePath);
  const prefix = `${path.basename(filePath)}.tmp-`;
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    // Cleanup is best effort and must not make an otherwise readable history unavailable.
    return 0;
  }

  let removed = 0;
  for (const entry of entries) {
    const name = typeof entry === "string" ? entry : entry.name;
    const isFile = typeof entry === "string" || entry.isFile();
    if (!isFile || !name.startsWith(prefix) || !/^.+\.tmp-\d+-[a-f0-9]{12}$/i.test(name)) continue;
    try {
      await fs.rm(path.join(directory, name), { force: true });
      removed += 1;
    } catch {
      // Cleanup is best effort; an unreadable stale file must not block history loading.
    }
  }
  return removed;
}

async function preserveCorruptHistoryFile({ filePath, fs = defaultFs, path = defaultPath, now = Date.now() }) {
  const timestamp = new Date(now).toISOString().replaceAll(":", "-");
  const extension = path.extname(filePath);
  const stem = path.basename(filePath, extension);
  const directory = path.dirname(filePath);
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? "" : `-${index}`;
    const backupPath = path.join(directory, `${stem}.corrupt-${timestamp}${suffix}${extension || ".json"}`);
    try {
      await fs.rename(filePath, backupPath);
      return backupPath;
    } catch (error) {
      if (error?.code === "ENOENT") return "";
      if (error?.code === "EEXIST") continue;
      throw error;
    }
  }
  throw historyError("corrupt_backup_failed");
}

function normalizeHttpUrl(value) {
  const text = boundedString(value, 8192);
  if (!text || text.startsWith("blob:") || text.startsWith("data:")) return "";
  try {
    const url = new URL(text);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return "";
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeManualHttpUrl(value) {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return "";
  const url = new URL(normalized);
  const identity = manualUrlIdentity(value, url);
  url.search = "";
  for (const [key, identityValue] of identity.parameters) {
    url.searchParams.set(key, identityValue);
  }
  if (identity.pathname) url.pathname = identity.pathname;
  return url.toString();
}

function manualUrlIdentity(value, normalizedUrl) {
  let original;
  try {
    original = new URL(boundedString(value, 8192));
  } catch {
    return { parameters: [], pathname: "" };
  }

  const host = normalizedUrl.hostname.toLowerCase();
  const originalPath = original.pathname;
  const hashRoute = original.hash.startsWith("#/") ? original.hash.slice(1) : "";
  const hashQueryIndex = hashRoute.indexOf("?");
  const hashPath = hashQueryIndex >= 0 ? hashRoute.slice(0, hashQueryIndex) : hashRoute;
  const hashParameters = new URLSearchParams(hashQueryIndex >= 0 ? hashRoute.slice(hashQueryIndex + 1) : "");
  const parameter = (name) => original.searchParams.get(name) || hashParameters.get(name) || "";

  if (
    (host === "music.163.com" || host.endsWith(".music.163.com")) &&
    (/\/(?:song)(?:\/|$)/i.test(originalPath) || /\/(?:song)(?:\/|$)/i.test(hashPath))
  ) {
    const id = parameter("id");
    if (/^\d{1,32}$/.test(id)) {
      return {
        parameters: [["id", id]],
        pathname: /\/(?:song)(?:\/|$)/i.test(originalPath) ? "" : "/song"
      };
    }
  }

  if (
    (host === "music.apple.com" || host.endsWith(".music.apple.com")) &&
    /\/album\//i.test(originalPath)
  ) {
    const id = parameter("i");
    if (/^\d{1,32}$/.test(id)) return { parameters: [["i", id]], pathname: "" };
  }

  if (
    (host === "y.qq.com" || host.endsWith(".y.qq.com")) &&
    [originalPath, hashPath].some((candidatePath) => (
      /(?:^|\/)(?:song|songdetail|player)(?:\/|\.html$|$)/i.test(candidatePath)
    ))
  ) {
    const songId = parameter("songid");
    if (/^\d{1,32}$/.test(songId)) return { parameters: [["songid", songId]], pathname: "" };
    const songMid = parameter("songmid");
    if (/^[A-Za-z0-9]{1,64}$/.test(songMid)) return { parameters: [["songmid", songMid]], pathname: "" };
  }

  return { parameters: [], pathname: "" };
}

function extractHttpUrl(value) {
  return boundedString(value, 8192).match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? "";
}

function hostnameForUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeAbsolutePath(value, path = defaultPath) {
  const text = boundedString(value, 32_768);
  if (!text || !path.isAbsolute(text)) return "";
  return path.normalize(text);
}

function historySearchText(record) {
  const source = record.source ?? {};
  const snapshot = record.snapshot ?? {};
  return normalizeSearchText([
    record.display.title,
    record.display.artist,
    record.display.album,
    record.display.source,
    record.kind,
    source.fileName,
    source.inputUrl,
    source.normalizedUrl,
    source.finalUrl,
    source.query,
    source.platform,
    source.songId,
    source.pageUrl,
    snapshot.parseMethod
  ].filter(Boolean).join("\n"));
}

function normalizeSearchText(value) {
  return boundedString(value, 4096).toLocaleLowerCase();
}

function boundedString(value, maximum, trim = true) {
  if (typeof value !== "string") return "";
  const text = trim ? value.trim() : value;
  return text.slice(0, maximum);
}

function normalizeId(value) {
  const id = boundedString(value, 128);
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : "";
}

function normalizeTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= MAX_TIMESTAMP_MS
    ? Math.floor(number)
    : null;
}

function boundedInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function historyError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = {
  AUDIO_EXTENSIONS,
  DEFAULT_IMPORT_HISTORY_LIMIT,
  IMAGE_EXTENSIONS,
  IMPORT_HISTORY_SCHEMA_VERSION,
  ImportHistoryStore,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  cleanupImportHistoryTemporaryFiles,
  importHistoryDedupeKey,
  importHistoryDocumentVersion,
  normalizeHttpUrl,
  normalizeImportHistoryDocument,
  normalizeImportHistoryLimit,
  normalizeImportHistoryRecord,
  platformSongKey,
  preserveCorruptHistoryFile,
  readValidatedImportFile,
  toPublicImportHistoryRecord,
  validateImportFileDescriptor,
  withHistoryLimit
};
