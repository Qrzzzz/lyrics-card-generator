const crypto = require("node:crypto");
const defaultFs = require("node:fs/promises");
const defaultPath = require("node:path");
const { types: utilTypes } = require("node:util");

const IMPORT_HISTORY_SCHEMA_VERSION = 2;
const LEGACY_IMPORT_HISTORY_SCHEMA_VERSION = 1;
const DEFAULT_IMPORT_HISTORY_LIMIT = 10;
const IMPORT_HISTORY_LIMITS = new Set(["none", 5, 10, "unlimited"]);
const MAX_RECORD_BYTES = 512 * 1024;
const MAX_MANUAL_SAVE_V2_BYTES = 2 * 1024 * 1024;
const MAX_MANUAL_SAVE_JSON_DEPTH = 128;
const LEGACY_MANUAL_SAVE_ENVELOPE_VERSION = 1;
const MANUAL_SAVE_ENVELOPE_VERSION = 2;
const MANUAL_SAVE_ENVELOPE_PREFIX = `{"version":${MANUAL_SAVE_ENVELOPE_VERSION},"snapshot":`;
const LEGACY_MANUAL_SAVE_ENVELOPE_PREFIX = `{"version":${LEGACY_MANUAL_SAVE_ENVELOPE_VERSION},"snapshot":`;
const MAX_MANUAL_SAVE_ENVELOPE_BYTES = MAX_MANUAL_SAVE_V2_BYTES + Buffer.byteLength(`${MANUAL_SAVE_ENVELOPE_PREFIX}}`, "utf8");
// Structured v2 snapshots may repeat text alongside stable IDs, so they use a
// separate 2 MiB cap. Stored records additionally repeat bounded display metadata.
const MAX_MANUAL_SAVE_RECORD_BYTES = MAX_MANUAL_SAVE_V2_BYTES + (32 * 1024);
const LEGACY_MANUAL_SAVE_SNAPSHOT_FIELDS = Object.freeze([
  "source",
  "title",
  "artist",
  "album",
  "explicit",
  "originalCoverUrl",
  "coverUrl",
  "originalUrl",
  "finalUrl",
  "parseMethod",
  "lyrics",
  "translationText",
  "translationEnabled"
]);
const MANUAL_SAVE_SNAPSHOT_FIELDS = Object.freeze([
  ...LEGACY_MANUAL_SAVE_SNAPSHOT_FIELDS,
  "lyricDocument"
]);
const MANUAL_SAVE_STRING_LIMITS = Object.freeze({
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
});
const NETEASE_MANUAL_IDENTITY_HOSTS = new Set(["music.163.com", "y.music.163.com"]);
const APPLE_MANUAL_IDENTITY_HOSTS = new Set(["music.apple.com"]);
const QQ_MANUAL_IDENTITY_HOSTS = new Set(["y.qq.com"]);
const SPOTIFY_MANUAL_IDENTITY_HOSTS = new Set(["open.spotify.com", "play.spotify.com"]);
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_IMPORT_FILE_STREAM_CHUNK_BYTES = 1024 * 1024;
const DEFAULT_IMPORT_FILE_STREAM_TTL_MS = 2 * 60 * 1000;
const DEFAULT_IMPORT_FILE_STREAMS_PER_SENDER = 4;
const MAX_TIMESTAMP_MS = 8_640_000_000_000_000;
const AUDIO_EXTENSIONS = new Set([".mp3", ".flac", ".m4a"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const HISTORY_KINDS = new Set(["link", "search", "local-audio", "manual-cover", "manual-save"]);
const SONG_SOURCES = new Set(["qq", "netease", "apple", "spotify", "unknown"]);

/**
 * Persists import history behind a single serialized queue.
 * Reads and mutations therefore observe one ordered document, while each write uses
 * a restricted temporary file plus rename before the in-memory document is advanced.
 */
class ImportHistoryStore {
  constructor({
    filePath,
    fs = defaultFs,
    path = defaultPath,
    now = () => Date.now(),
    createId = () => crypto.randomUUID(),
    performanceObserver = null
  }) {
    if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
      throw new TypeError("Import history requires an absolute file path.");
    }
    this.filePath = filePath;
    this.fs = fs;
    this.path = path;
    this.now = now;
    this.createId = createId;
    this.performanceObserver = typeof performanceObserver === "function" ? performanceObserver : null;
    this.document = null;
    this.loadPromise = null;
    this.writeQueue = Promise.resolve();
    this.notice = null;
    // Normalized records are immutable within a document snapshot. Derived
    // search and identity strings can therefore be retained without changing
    // ordering, pagination, filtering, or dedupe semantics.
    this.searchTextCache = new WeakMap();
    this.dedupeKeyCache = new WeakMap();
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
        return !query || this.#searchText(record).includes(query);
      });
      // Recovery is surfaced once, after the replacement document is safe to read.
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
      const manualTotal = document.records.filter((record) => record.kind === "manual-save").length;
      return {
        total: document.records.length,
        automaticTotal: document.records.length - manualTotal,
        manualTotal,
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
      if (normalizeImportHistoryLimit(limit) === "none") {
        return { document, result: toPublicImportHistoryRecord(normalized), write: false };
      }
      const key = this.#dedupeKey(normalized);
      const duplicate = document.records.find((record) => this.#dedupeKey(record) === key);
      // Reimports retain stable identity and creation time while refreshing content and recency.
      const record = duplicate
        ? { ...normalized, id: duplicate.id, createdAt: duplicate.createdAt, lastUsedAt: timestamp }
        : normalized;
      const records = [
        record,
        ...document.records.filter((existing) => existing.id !== record.id && this.#dedupeKey(existing) !== key)
      ];
      return {
        document: withHistoryLimit({ schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION, records }, limit),
        result: toPublicImportHistoryRecord(record)
      };
    });
  }

  // Parse outside the queue so an invalid transport envelope cannot trigger load or persistence side effects.
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

  /**
   * @param {string} recordId
   * @param {{ limit?: number, file?: unknown }} [options]
   */
  commitReplay(recordId, { limit = DEFAULT_IMPORT_HISTORY_LIMIT, file } = {}) {
    // The renderer calls this only after document commit, making relocation, touch, and dedupe one mutation.
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
      const key = this.#dedupeKey(updated);
      const records = [
        updated,
        ...document.records.filter((record) => (
          record.id !== id && this.#dedupeKey(record) !== key
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
        // Bind destructive confirmation to the exact document and trim count the user reviewed.
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
          // Preference persistence and history trimming form one logical transaction.
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

  #observePerformance(name, detail = {}) {
    try {
      this.performanceObserver?.({ name, ...detail });
    } catch {
      // Diagnostics must never affect history durability or user operations.
    }
  }

  #searchText(record) {
    const cached = this.searchTextCache.get(record);
    if (cached !== undefined) return cached;
    const value = historySearchText(record);
    this.searchTextCache.set(record, value);
    this.#observePerformance("search-index-build");
    return value;
  }

  #dedupeKey(record) {
    const cached = this.dedupeKeyCache.get(record);
    if (cached !== undefined) return cached;
    const value = importHistoryDedupeKey(record, this.path);
    this.dedupeKeyCache.set(record, value);
    this.#observePerformance("dedupe-index-build");
    return value;
  }

  #enqueue(operation) {
    // Continue the same chain after failures so a rejected operation never opens a parallel mutation lane.
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
    // Concurrent first-use operations share migration/recovery instead of racing independent reads.
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
      this.#observePerformance("read");
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
    // Persist schema migration and privacy normalization before exposing the document to callers.
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
      const serialized = `${JSON.stringify(document, null, 2)}\n`;
      const serializedBytes = Buffer.byteLength(serialized, "utf8");
      this.#observePerformance("serialize", { bytes: serializedBytes });
      // Rename publishes a complete restricted file; a failed write leaves the previous document intact.
      this.#observePerformance("write", { bytes: serializedBytes });
      await this.fs.writeFile(temporary, serialized, {
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
    // Schema 1 predates trusted manual snapshots, so such records are never migrated forward.
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

  if (input.kind === "manual-cover") {
    snapshot = normalizeManualSnapshot(input.snapshot, "manual-cover");
    if (!snapshot) return null;
  }
  const record = {
    id,
    kind: input.kind,
    createdAt,
    lastUsedAt: Math.max(createdAt, lastUsedAt),
    display,
    ...(source ? { source } : {}),
    ...(snapshot ? { snapshot } : {})
  };
  const maximumRecordBytes = input.kind === "manual-save" || snapshot?.lyricDocument
    ? MAX_MANUAL_SAVE_RECORD_BYTES
    : MAX_RECORD_BYTES;
  return Buffer.byteLength(JSON.stringify(record), "utf8") <= maximumRecordBytes ? record : null;
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
  const originalUrl = normalizeManualHttpUrlDetails(input.originalUrl);
  const finalUrl = normalizeManualHttpUrlDetails(input.finalUrl);
  const songUrls = kind === "manual-save"
    ? normalizeManualSongUrls(originalUrl, finalUrl)
    : { originalUrl: originalUrl.url, finalUrl: finalUrl.url };
  if (!songUrls) return null;
  const snapshot = {
    title,
    artist,
    album: boundedString(input.album, 512),
    source,
    originalUrl: songUrls.originalUrl,
    finalUrl: songUrls.finalUrl,
    lyrics: boundedString(input.lyrics, 120_000, false),
    translationText: boundedString(input.translationText, 120_000, false),
    translationEnabled: input.translationEnabled === true
  };
  const lyricDocument = normalizeManualLyricDocument(
    input.lyricDocument,
    snapshot.lyrics,
    snapshot.translationText
  );
  if (lyricDocument) snapshot.lyricDocument = lyricDocument;
  else if (input.lyricDocument !== undefined) return null;
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

// Require one canonical JSON representation so preload and main validate the same bounded data protocol.
function parseManualSaveEnvelope(value) {
  if (
    typeof value !== "string" ||
    value.length > MAX_MANUAL_SAVE_ENVELOPE_BYTES ||
    Buffer.byteLength(value, "utf8") > MAX_MANUAL_SAVE_ENVELOPE_BYTES ||
    (!value.startsWith(MANUAL_SAVE_ENVELOPE_PREFIX) &&
      !value.startsWith(LEGACY_MANUAL_SAVE_ENVELOPE_PREFIX)) ||
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
    (version.value !== MANUAL_SAVE_ENVELOPE_VERSION &&
      version.value !== LEGACY_MANUAL_SAVE_ENVELOPE_VERSION) ||
    !isEnumerableDataProperty(snapshot) ||
    !manualSaveSnapshotFieldsFit(snapshot.value, version.value)
  ) {
    return null;
  }

  try {
    return JSON.stringify(envelope) === value
      ? normalizeManualSnapshot(snapshot.value, "manual-save")
      : null;
  } catch {
    return null;
  }
}

function isCanonicalManualSaveEnvelope(value) {
  return parseManualSaveEnvelope(value) !== null;
}

function manualSaveSnapshotFieldsFit(input, version = MANUAL_SAVE_ENVELOPE_VERSION) {
  const maximumBytes = version === LEGACY_MANUAL_SAVE_ENVELOPE_VERSION
    ? MAX_RECORD_BYTES
    : MAX_MANUAL_SAVE_V2_BYTES;
  const expectedFields = version === LEGACY_MANUAL_SAVE_ENVELOPE_VERSION
    ? LEGACY_MANUAL_SAVE_SNAPSHOT_FIELDS
    : MANUAL_SAVE_SNAPSHOT_FIELDS;
  if (
    !jsonLikeTreeFitsWithinByteLimit(input, maximumBytes, MAX_MANUAL_SAVE_JSON_DEPTH) ||
    !isObject(input)
  ) {
    return false;
  }
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== expectedFields.length ||
    keys.some((key, index) => key !== expectedFields[index])
  ) {
    return false;
  }
  const fieldsFit = Object.entries(MANUAL_SAVE_STRING_LIMITS).every(([field, limit]) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    return (
      isEnumerableDataProperty(descriptor) &&
      typeof descriptor.value === "string" &&
      descriptor.value.length <= limit
    );
  });
  if (!fieldsFit) return false;
  const source = Object.getOwnPropertyDescriptor(input, "source");
  const explicit = Object.getOwnPropertyDescriptor(input, "explicit");
  const translationEnabled = Object.getOwnPropertyDescriptor(input, "translationEnabled");
  const scalarFieldsFit = (
    isEnumerableDataProperty(source) &&
    SONG_SOURCES.has(source.value) &&
    isEnumerableDataProperty(explicit) &&
    typeof explicit.value === "boolean" &&
    (
      isEnumerableDataProperty(translationEnabled) &&
      typeof translationEnabled.value === "boolean"
    )
  );
  if (!scalarFieldsFit) return false;
  if (version === LEGACY_MANUAL_SAVE_ENVELOPE_VERSION) return true;
  const lyricDocument = Object.getOwnPropertyDescriptor(input, "lyricDocument");
  return isEnumerableDataProperty(lyricDocument) &&
    lyricDocumentV2FieldsFit(lyricDocument.value) &&
    serializeManualLyricDocumentTrack(lyricDocument.value, "source") === input.lyrics &&
    serializeManualLyricDocumentTrack(lyricDocument.value, "translation") === input.translationText;
}

function lyricDocumentV2FieldsFit(input) {
  if (!isObject(input) || Object.getPrototypeOf(input) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(input);
  const hasFormatting = keys.includes("formatting");
  const validKeyOrder = hasFormatting
    ? [
        ["schemaVersion", "id", "revision", "formatting", "blocks"],
        ["schemaVersion", "id", "revision", "blocks", "formatting"]
      ].some((expected) => keys.length === expected.length && keys.every((key, index) => key === expected[index]))
    : keys.length === 4 && keys.every((key, index) => key === ["schemaVersion", "id", "revision", "blocks"][index]);
  if (!validKeyOrder) return false;
  if (input.schemaVersion !== 2 || !boundedLyricId(input.id) || !Number.isSafeInteger(input.revision) || input.revision < 0) return false;
  if (hasFormatting && !lyricDocumentFormattingFits(input.formatting)) return false;
  if (!Array.isArray(input.blocks) || input.blocks.length > 20_000) return false;
  const ids = new Set([input.id]);
  for (const block of input.blocks) {
    if (!lyricBlockV2FieldsFit(block, ids)) return false;
  }
  return true;
}

function lyricBlockV2FieldsFit(block, ids) {
  if (!isObject(block) || Object.getPrototypeOf(block) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(block);
  const hasFormatting = keys.includes("formatting");
  const expectedKeys = hasFormatting ? ["id", "formatting", "units"] : ["id", "units"];
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) return false;
  if (!boundedLyricId(block.id) || ids.has(block.id)) return false;
  ids.add(block.id);
  if (hasFormatting && !lyricBlockFormattingFits(block.formatting)) return false;
  if (!Array.isArray(block.units) || block.units.length === 0 || block.units.length > 20_000) return false;
  return block.units.every((unit) => lyricUnitV2FieldsFit(unit, ids));
}

function lyricUnitV2FieldsFit(unit, ids) {
  if (!isObject(unit) || Object.getPrototypeOf(unit) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(unit);
  const hasTranslation = keys.includes("translation");
  const expectedKeys = hasTranslation ? ["id", "source", "translation"] : ["id", "source"];
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) return false;
  if (!boundedLyricId(unit.id) || ids.has(unit.id)) return false;
  ids.add(unit.id);
  return lyricLineArrayFits(unit.source) && (!hasTranslation || lyricLineArrayFits(unit.translation));
}

function lyricDocumentFormattingFits(formatting) {
  return exactPlainObjectKeys(formatting, ["sourcePrefix", "translationPrefix"]) &&
    blankFormattingTextFits(formatting.sourcePrefix) &&
    blankFormattingTextFits(formatting.translationPrefix);
}

function lyricBlockFormattingFits(formatting) {
  return exactPlainObjectKeys(formatting, [
    "sourcePresent",
    "translationPresent",
    "sourceSeparatorAfter",
    "translationSeparatorAfter"
  ]) &&
    typeof formatting.sourcePresent === "boolean" &&
    typeof formatting.translationPresent === "boolean" &&
    blankFormattingTextFits(formatting.sourceSeparatorAfter) &&
    blankFormattingTextFits(formatting.translationSeparatorAfter);
}

function exactPlainObjectKeys(value, expectedKeys) {
  if (!isObject(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

function boundedLyricId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function lyricLineArrayFits(value) {
  return Array.isArray(value) && value.length <= 20_000 && value.every((line) => (
    typeof line === "string" && line.length <= 120_000 && !line.includes("\n") && !line.includes("\r")
  ));
}

function blankFormattingTextFits(value) {
  return typeof value === "string" && value.length <= 120_000 && !/[^\t \n]/u.test(value);
}

function serializeManualLyricDocumentTrack(document, track) {
  let value = track === "source"
    ? document.formatting?.sourcePrefix ?? ""
    : document.formatting?.translationPrefix ?? "";
  for (const block of document.blocks) {
    const formatting = block.formatting ?? {
      sourcePresent: block.units.some((unit) => unit.source.length > 0),
      translationPresent: block.units.some((unit) => (unit.translation?.length ?? 0) > 0),
      sourceSeparatorAfter: "",
      translationSeparatorAfter: ""
    };
    const present = track === "source" ? formatting.sourcePresent : formatting.translationPresent;
    if (!present) continue;
    const lines = track === "source"
      ? block.units.flatMap((unit) => unit.source)
      : block.units.flatMap((unit) => unit.translation ?? []);
    value += lines.join("\n");
    value += track === "source" ? formatting.sourceSeparatorAfter : formatting.translationSeparatorAfter;
  }
  return value;
}

function normalizeManualLyricDocument(value, lyrics, translationText) {
  if (value === undefined) return null;
  if (
    !jsonLikeTreeFitsWithinByteLimit(value, MAX_MANUAL_SAVE_V2_BYTES, MAX_MANUAL_SAVE_JSON_DEPTH) ||
    !lyricDocumentV2FieldsFit(value) ||
    serializeManualLyricDocumentTrack(value, "source") !== lyrics ||
    serializeManualLyricDocumentTrack(value, "translation") !== translationText
  ) return null;
  return {
    schemaVersion: 2,
    id: value.id,
    revision: value.revision,
    ...(value.formatting ? { formatting: { ...value.formatting } } : {}),
    blocks: value.blocks.map((block) => ({
      id: block.id,
      ...(block.formatting ? { formatting: { ...block.formatting } } : {}),
      units: block.units.map((unit) => ({
        id: unit.id,
        source: [...unit.source],
        ...(unit.translation ? { translation: [...unit.translation] } : {})
      }))
    }))
  };
}

/**
 * Measures JSON-like input without invoking accessors or JSON serialization hooks.
 * Iterative descriptor checks reject proxies, cycles, sparse arrays, exotic prototypes,
 * symbol keys, and over-deep structures before any untrusted tree can be persisted.
 */
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
    // Prefer a platform song identity so tracking/query variants collapse to the same history record.
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
  if (normalized === "unlimited") {
    return { schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION, records: [...document.records] };
  }
  const automaticLimit = normalized === "none" ? 0 : normalized;
  let automaticCount = 0;
  return {
    schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION,
    records: document.records.filter((record) => {
      if (record.kind === "manual-save") return true;
      automaticCount += 1;
      return automaticCount <= automaticLimit;
    })
  };
}

function importHistoryDocumentVersion(document) {
  // The digest binds destructive trim confirmation to record content and ordering without exposing it.
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

/**
 * Reads through one file handle and validates metadata both before and after the byte stream.
 * This closes the path-replacement race and rejects files that change during replay preparation.
 */
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

/**
 * Sender-bound sequential file capabilities keep native paths in main while
 * bounding every renderer IPC payload. A single stable handle is validated
 * before and after streaming, and every terminal path closes it.
 */
class ImportHistoryFileStreamRegistry {
  constructor({
    fs = defaultFs,
    path = defaultPath,
    now = () => Date.now(),
    createToken = () => crypto.randomUUID(),
    chunkSize = DEFAULT_IMPORT_FILE_STREAM_CHUNK_BYTES,
    ttlMs = DEFAULT_IMPORT_FILE_STREAM_TTL_MS,
    maxStreamsPerSender = DEFAULT_IMPORT_FILE_STREAMS_PER_SENDER,
    scheduleExpiry = defaultStreamExpiryScheduler
  } = {}) {
    this.fs = fs;
    this.path = path;
    this.now = now;
    this.createToken = createToken;
    this.chunkSize = boundedInteger(chunkSize, 64 * 1024, DEFAULT_IMPORT_FILE_STREAM_CHUNK_BYTES, DEFAULT_IMPORT_FILE_STREAM_CHUNK_BYTES);
    this.ttlMs = boundedInteger(ttlMs, 10, 30 * 60 * 1000, DEFAULT_IMPORT_FILE_STREAM_TTL_MS);
    this.maxStreamsPerSender = boundedInteger(maxStreamsPerSender, 1, 16, DEFAULT_IMPORT_FILE_STREAMS_PER_SENDER);
    this.scheduleExpiry = scheduleExpiry;
    this.entries = new Map();
  }

  get activeCount() {
    return this.entries.size;
  }

  async open(senderId, kind, filePath) {
    if (!isValidStreamSender(senderId) || kind !== "local-audio") {
      return { ok: false, code: "unsupported_file_kind" };
    }
    const normalizedPath = normalizeAbsolutePath(filePath, this.path);
    if (!normalizedPath) return { ok: false, code: "invalid_path" };
    await this.pruneExpired();
    let senderStreams = 0;
    for (const entry of this.entries.values()) {
      if (entry.senderId === senderId) senderStreams += 1;
    }
    if (senderStreams >= this.maxStreamsPerSender) {
      return { ok: false, code: "too_many_open_files" };
    }

    let handle;
    let retained = false;
    try {
      handle = await this.fs.open(normalizedPath, "r");
      const before = await handle.stat();
      const validated = validateImportFileDescriptor(kind, normalizedPath, before, this.path);
      if (!validated.ok) return validated;
      let token = "";
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = this.createToken();
        if (isValidStreamToken(candidate) && !this.entries.has(candidate)) {
          token = candidate;
          break;
        }
      }
      if (!token) return { ok: false, code: "file_invalid" };
      senderStreams = 0;
      for (const current of this.entries.values()) {
        if (current.senderId === senderId) senderStreams += 1;
      }
      if (senderStreams >= this.maxStreamsPerSender) {
        return { ok: false, code: "too_many_open_files" };
      }
      const entry = {
        token,
        senderId,
        handle,
        path: validated.path,
        extension: validated.extension,
        size: validated.size,
        mtimeMs: validated.mtimeMs,
        ctimeMs: Number(before.ctimeMs),
        position: 0,
        queue: Promise.resolve(),
        readPending: false,
        cancelled: false,
        closed: false,
        cancelExpiry: null,
        expiresAt: 0
      };
      this.entries.set(token, entry);
      this.#refreshExpiry(entry);
      retained = true;
      return {
        ok: true,
        streamToken: token,
        path: validated.path,
        extension: validated.extension,
        size: validated.size,
        mtimeMs: validated.mtimeMs
      };
    } catch (error) {
      return {
        ok: false,
        code: error?.code === "ENOENT" ? "file_missing" : "file_invalid"
      };
    } finally {
      if (!retained) await handle?.close().catch(() => undefined);
    }
  }

  read(senderId, token) {
    const entry = isValidStreamToken(token) ? this.entries.get(token) : null;
    if (!entry || entry.senderId !== senderId || entry.cancelled) {
      return Promise.resolve({ ok: false, code: "file_reference_expired" });
    }
    if (entry.readPending) return Promise.resolve({ ok: false, code: "read_in_progress" });
    entry.readPending = true;
    this.#refreshExpiry(entry);
    const operation = entry.queue.then(() => this.#readEntry(entry));
    entry.queue = operation.then(
      () => { entry.readPending = false; },
      () => { entry.readPending = false; }
    );
    return operation;
  }

  async release(senderId, token) {
    const entry = isValidStreamToken(token) ? this.entries.get(token) : null;
    if (!entry || entry.senderId !== senderId) return false;
    entry.cancelled = true;
    this.#detach(entry);
    await entry.queue;
    await this.#close(entry);
    return true;
  }

  async releaseSender(senderId) {
    const matching = [...this.entries.values()].filter((entry) => entry.senderId === senderId);
    await Promise.all(matching.map((entry) => this.release(senderId, entry.token)));
    return matching.length;
  }

  async closeAll() {
    const entries = [...this.entries.values()];
    for (const entry of entries) {
      entry.cancelled = true;
      this.#detach(entry);
    }
    await Promise.all(entries.map(async (entry) => {
      await entry.queue;
      await this.#close(entry);
    }));
  }

  async pruneExpired() {
    const expired = [...this.entries.values()].filter((entry) => entry.expiresAt <= this.now());
    await Promise.all(expired.map((entry) => this.release(entry.senderId, entry.token)));
    return expired.length;
  }

  async #readEntry(entry) {
    if (entry.cancelled || this.entries.get(entry.token) !== entry) {
      return { ok: false, code: "cancelled" };
    }
    try {
      const remaining = entry.size - entry.position;
      const expected = Math.min(this.chunkSize, Math.max(0, remaining));
      const buffer = Buffer.allocUnsafe(expected);
      let total = 0;
      while (total < expected) {
        const { bytesRead } = await entry.handle.read(
          buffer,
          total,
          expected - total,
          entry.position + total
        );
        if (bytesRead === 0) break;
        total += bytesRead;
      }
      if (entry.cancelled) return { ok: false, code: "cancelled" };
      entry.position += total;
      const done = entry.position >= entry.size;
      if (total !== expected || done) {
        const after = await entry.handle.stat();
        const revalidated = validateImportFileDescriptor("local-audio", entry.path, after, this.path);
        const afterCtimeMs = Number(after.ctimeMs);
        const ctimeChanged = Number.isFinite(entry.ctimeMs) && Number.isFinite(afterCtimeMs) &&
          Math.abs(entry.ctimeMs - afterCtimeMs) > 1;
        if (
          !revalidated.ok ||
          revalidated.size !== entry.size ||
          Math.abs(revalidated.mtimeMs - entry.mtimeMs) > 1 ||
          ctimeChanged ||
          total !== expected
        ) {
          await this.#finishWithError(entry);
          return { ok: false, code: "file_changed_during_read" };
        }
      }
      if (done) {
        this.#detach(entry);
        await this.#close(entry);
      }
      return { ok: true, bytes: buffer.subarray(0, total), done };
    } catch (error) {
      await this.#finishWithError(entry);
      return {
        ok: false,
        code: error?.code === "ENOENT" ? "file_missing" : "file_invalid"
      };
    }
  }

  #refreshExpiry(entry) {
    entry.cancelExpiry?.();
    entry.expiresAt = this.now() + this.ttlMs;
    entry.cancelExpiry = this.scheduleExpiry(() => {
      if (this.entries.get(entry.token) !== entry) return;
      if (entry.expiresAt > this.now()) {
        this.#refreshExpiry(entry);
        return;
      }
      void this.release(entry.senderId, entry.token);
    }, this.ttlMs);
  }

  #detach(entry) {
    if (this.entries.get(entry.token) === entry) this.entries.delete(entry.token);
    entry.cancelExpiry?.();
    entry.cancelExpiry = null;
  }

  async #finishWithError(entry) {
    entry.cancelled = true;
    this.#detach(entry);
    await this.#close(entry);
  }

  async #close(entry) {
    if (entry.closed) return;
    entry.closed = true;
    await entry.handle.close().catch(() => undefined);
  }
}

function defaultStreamExpiryScheduler(callback, delayMs) {
  const timer = setTimeout(callback, delayMs);
  timer.unref?.();
  return () => clearTimeout(timer);
}

function isValidStreamSender(senderId) {
  return Number.isSafeInteger(senderId) && senderId > 0;
}

function isValidStreamToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9][A-Za-z0-9-]{7,127}$/.test(token);
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
  return normalizeManualHttpUrlDetails(value).url;
}

function normalizeManualHttpUrlDetails(value) {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return { url: "", identityKey: "", identityState: "absent" };
  const url = new URL(normalized);
  const identity = manualUrlIdentity(value, url);
  if (identity.state === "ambiguous") {
    return { url: "", identityKey: "", identityState: "ambiguous" };
  }
  // Drop arbitrary query/hash data, then restore only provider-specific identity fields.
  url.search = "";
  for (const [key, identityValue] of identity.parameters) {
    url.searchParams.set(key, identityValue);
  }
  if (identity.pathname) url.pathname = identity.pathname;
  const sanitized = url.toString();
  return sanitized.length <= MANUAL_SAVE_STRING_LIMITS.originalUrl
    ? { url: sanitized, identityKey: identity.key, identityState: identity.state }
    : { url: "", identityKey: "", identityState: "absent" };
}

function normalizeManualSongUrls(original, final) {
  if (original.identityState === "ambiguous" || final.identityState === "ambiguous") {
    return null;
  }
  if (original.identityKey && final.identityKey && original.identityKey !== final.identityKey) {
    return null;
  }
  // Store one sanitized provenance URL; conflicting original/final song identities are rejected above.
  const selected = original.identityState === "unique"
    ? original
    : final.identityState === "unique"
      ? final
      : original.url
        ? original
        : final;
  const provenanceUrl = selected.url;
  return { originalUrl: provenanceUrl, finalUrl: provenanceUrl };
}

// Recognize identities only on exact provider hosts/routes and canonical, non-duplicated parameters.
function manualUrlIdentity(value, normalizedUrl) {
  const absentIdentity = { state: "absent", key: "", parameters: [], pathname: "" };
  const ambiguousIdentity = { state: "ambiguous", key: "", parameters: [], pathname: "" };
  let original;
  try {
    original = new URL(boundedString(value, 8192));
  } catch {
    return absentIdentity;
  }

  if (
    original.protocol !== "https:" ||
    original.port ||
    normalizedUrl.protocol !== "https:" ||
    normalizedUrl.port
  ) {
    return absentIdentity;
  }

  const host = normalizedUrl.hostname.toLowerCase();
  const originalPath = original.pathname;
  const hashRoute = original.hash.startsWith("#/") ? original.hash.slice(1) : "";
  const hashQueryIndex = hashRoute.indexOf("?");
  const hashPath = hashQueryIndex >= 0 ? hashRoute.slice(0, hashQueryIndex) : hashRoute;
  const hashParameters = new URLSearchParams(hashQueryIndex >= 0 ? hashRoute.slice(hashQueryIndex + 1) : "");
  const parameters = (names) => {
    const canonicalNames = new Set(names);
    const foldedNames = new Set(names.map(asciiLowercase));
    return [original.searchParams, hashParameters].flatMap((searchParameters) => (
      Array.from(searchParameters.entries())
        .filter(([name]) => foldedNames.has(asciiLowercase(name)))
        .map(([name, parameterValue]) => ({
          name,
          value: parameterValue,
          canonical: canonicalNames.has(name)
        }))
    ));
  };
  const exactPath = (candidate, expected) => candidate.replace(/\/+$/u, "") === expected;

  if (
    NETEASE_MANUAL_IDENTITY_HOSTS.has(host) &&
    (exactPath(originalPath, "/song") || exactPath(hashPath, "/song"))
  ) {
    const identityParameters = parameters(["id"]);
    if (identityParameters.length > 1) return ambiguousIdentity;
    if (
      identityParameters.length === 1 &&
      identityParameters[0].canonical &&
      /^\d{1,32}$/.test(identityParameters[0].value)
    ) {
      const id = identityParameters[0].value;
      return {
        state: "unique",
        key: `netease:${id}`,
        parameters: [["id", id]],
        pathname: exactPath(originalPath, "/song") ? "" : "/song"
      };
    }
    return absentIdentity;
  }

  if (APPLE_MANUAL_IDENTITY_HOSTS.has(host)) {
    const trackParameters = parameters(["i"]);
    const albumMatch = originalPath.match(/^\/[a-z]{2}\/album\/[^/]+\/\d+\/?$/iu);
    if (albumMatch) {
      if (trackParameters.length > 1) return ambiguousIdentity;
      if (
        trackParameters.length === 1 &&
        trackParameters[0].canonical &&
        /^\d{1,32}$/.test(trackParameters[0].value)
      ) {
        const id = trackParameters[0].value;
        return { state: "unique", key: `apple:${id}`, parameters: [["i", id]], pathname: "" };
      }
      return absentIdentity;
    }
    const songMatch = originalPath.match(/^\/[a-z]{2}\/song\/[^/]+\/(\d{1,32})\/?$/iu);
    if (songMatch) {
      return trackParameters.length === 0
        ? { state: "unique", key: `apple:${songMatch[1]}`, parameters: [], pathname: "" }
        : ambiguousIdentity;
    }
  }

  if (QQ_MANUAL_IDENTITY_HOSTS.has(host)) {
    const identityParameters = parameters(["songid", "songmid"]);
    const pathCandidate = hashPath || originalPath;
    const pathMatch = pathCandidate.match(/^\/(?:n\/ryqq\/)?songDetail\/([A-Za-z0-9]{1,64})\/?$/iu);
    if (pathMatch) {
      if (identityParameters.length !== 0) return ambiguousIdentity;
      const id = pathMatch[1];
      const kind = /^\d+$/u.test(id) ? "songid" : "songmid";
      return {
        state: "unique",
        key: `qq:${kind}:${id}`,
        parameters: [],
        pathname: hashPath ? pathCandidate : ""
      };
    }
    const permitsQueryIdentity = ["/song", "/portal/player.html", "/player"].some((candidate) => (
      exactPath(originalPath, candidate) || exactPath(hashPath, candidate)
    ));
    if (permitsQueryIdentity && identityParameters.length > 1) return ambiguousIdentity;
    if (permitsQueryIdentity && identityParameters.length === 1 && identityParameters[0].canonical) {
      const { name, value: id } = identityParameters[0];
      const valid = name === "songid" ? /^\d{1,32}$/u.test(id) : /^[A-Za-z0-9]{1,64}$/u.test(id);
      if (valid) {
        return {
          state: "unique",
          key: `qq:${name}:${id}`,
          parameters: [[name, id]],
          pathname: !exactPath(originalPath, pathCandidate) && hashPath ? pathCandidate : ""
        };
      }
    }
    if (permitsQueryIdentity) return absentIdentity;
  }

  if (SPOTIFY_MANUAL_IDENTITY_HOSTS.has(host)) {
    const track = originalPath.match(/^\/track\/([A-Za-z0-9]{1,64})\/?$/u)?.[1];
    if (track) return { state: "unique", key: `spotify:${track}`, parameters: [], pathname: "" };
  }

  return absentIdentity;
}

function extractHttpUrl(value) {
  return boundedString(value, 8192).match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? "";
}

function asciiLowercase(value) {
  return value.replace(/[A-Z]/gu, (character) => (
    String.fromCharCode(character.charCodeAt(0) + 0x20)
  ));
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
  /** @type {NodeJS.ErrnoException} */
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = {
  AUDIO_EXTENSIONS,
  DEFAULT_IMPORT_FILE_STREAM_CHUNK_BYTES,
  DEFAULT_IMPORT_HISTORY_LIMIT,
  IMAGE_EXTENSIONS,
  IMPORT_HISTORY_SCHEMA_VERSION,
  ImportHistoryFileStreamRegistry,
  ImportHistoryStore,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  cleanupImportHistoryTemporaryFiles,
  importHistoryDedupeKey,
  importHistoryDocumentVersion,
  isCanonicalManualSaveEnvelope,
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
