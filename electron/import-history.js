const crypto = require("node:crypto");
const defaultFs = require("node:fs/promises");
const defaultPath = require("node:path");

const IMPORT_HISTORY_SCHEMA_VERSION = 1;
const DEFAULT_IMPORT_HISTORY_LIMIT = 10;
const IMPORT_HISTORY_LIMITS = new Set([5, 10, "unlimited"]);
const MAX_RECORD_BYTES = 512 * 1024;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_TIMESTAMP_MS = 8_640_000_000_000_000;
const AUDIO_EXTENSIONS = new Set([".mp3", ".flac"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const HISTORY_KINDS = new Set(["link", "search", "local-audio", "manual-cover"]);
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
    try {
      const parsed = JSON.parse(await this.fs.readFile(this.filePath, "utf8"));
      const normalized = normalizeImportHistoryDocument(parsed, this.path);
      if (!normalized) throw historyError("corrupt_history");
      this.document = normalized;
      if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
        await this.#writeDocument(normalized).catch(() => undefined);
      }
      return normalized;
    } catch (error) {
      if (error?.code === "ENOENT") {
        const empty = emptyHistoryDocument();
        this.document = empty;
        return empty;
      }
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
  if (!isObject(input) || input.schemaVersion !== IMPORT_HISTORY_SCHEMA_VERSION || !Array.isArray(input.records)) {
    return null;
  }
  const records = [];
  const dedupe = new Set();
  for (const candidate of input.records) {
    const record = normalizeImportHistoryRecord(candidate, path);
    if (!record) continue;
    const key = importHistoryDedupeKey(record, path);
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    records.push(record);
  }
  records.sort((left, right) => right.lastUsedAt - left.lastUsedAt);
  return { schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION, records };
}

function normalizeImportHistoryRecord(input, path = defaultPath) {
  if (!isObject(input) || !HISTORY_KINDS.has(input.kind)) return null;
  const id = normalizeId(input.id);
  const createdAt = normalizeTimestamp(input.createdAt);
  const lastUsedAt = normalizeTimestamp(input.lastUsedAt);
  if (!id || createdAt === null || lastUsedAt === null) return null;
  const display = normalizeDisplay(input.display, input.kind);
  if (!display) return null;

  let source;
  if (input.kind === "link") {
    source = normalizeLinkSource(input.source ?? input);
  } else if (input.kind === "search") {
    source = normalizeSearchSource(input.source ?? input);
  } else {
    source = normalizeFileSource(input.source ?? input.file, input.kind, path);
  }
  if (!source) return null;

  const record = {
    id,
    kind: input.kind,
    createdAt,
    lastUsedAt: Math.max(createdAt, lastUsedAt),
    display,
    source
  };
  if (input.kind === "manual-cover") {
    const snapshot = normalizeManualSnapshot(input.snapshot);
    if (!snapshot) return null;
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
  if (!title && !artist && kind !== "manual-cover") return null;
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

function normalizeManualSnapshot(input) {
  if (!isObject(input)) return null;
  const title = boundedString(input.title, 512);
  const artist = boundedString(input.artist, 512);
  const source = SONG_SOURCES.has(input.source) ? input.source : "unknown";
  return {
    title,
    artist,
    album: boundedString(input.album, 512),
    source,
    originalUrl: normalizeHttpUrl(input.originalUrl),
    finalUrl: normalizeHttpUrl(input.finalUrl),
    lyrics: boundedString(input.lyrics, 120_000, false),
    translationText: boundedString(input.translationText, 120_000, false),
    translationEnabled: input.translationEnabled === true
  };
}

function importHistoryDedupeKey(record, path = defaultPath) {
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
  } else {
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
  const source = record.source;
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
    source.pageUrl
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
