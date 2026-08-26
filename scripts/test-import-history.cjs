const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const {
  DEFAULT_IMPORT_FILE_STREAM_CHUNK_BYTES,
  IMPORT_HISTORY_SCHEMA_VERSION,
  ImportHistoryFileStreamRegistry,
  ImportHistoryStore,
  importHistoryDedupeKey,
  normalizeImportHistoryDocument,
  normalizeImportHistoryLimit,
  normalizeImportHistoryRecord,
  readValidatedImportFile,
  validateImportFileDescriptor,
  withHistoryLimit
} = require("../electron/import-history");

const MAX_MANUAL_SNAPSHOT_BYTES = 512 * 1024;

async function main() {
  // Begin with normalization and deduplication contracts before exercising the
  // same records through the asynchronous on-disk store.
  assert.equal(normalizeImportHistoryLimit(undefined), 10);
  assert.equal(normalizeImportHistoryLimit(5), 5);
  assert.equal(normalizeImportHistoryLimit(10), 10);
  assert.equal(normalizeImportHistoryLimit("unlimited"), "unlimited");
  assert.equal(normalizeImportHistoryLimit(50), 10);

  const timestamp = 1_700_000_000_000;
  const link = normalizeImportHistoryRecord({
    id: "link-1",
    kind: "link",
    createdAt: timestamp,
    lastUsedAt: timestamp,
    display: {
      title: "Test song",
      artist: "Test artist",
      album: "Test album",
      source: "netease",
      remoteCoverUrl: "data:image/png;base64,not-stored",
      ignoredStyle: { background: "red" }
    },
    source: {
      inputUrl: "https://music.163.com/#/song?id=12345",
      normalizedUrl: "https://music.163.com/song?id=12345#fragment",
      finalUrl: "https://music.163.com/song?id=12345"
    },
    exportedImage: "data:image/png;base64,not-stored"
  });
  const search = normalizeImportHistoryRecord({
    id: "search-1",
    kind: "search",
    createdAt: timestamp,
    lastUsedAt: timestamp,
    display: {
      title: "Test song",
      artist: "Test artist",
      album: "Test album",
      source: "netease",
      remoteCoverUrl: "https://example.com/cover.jpg"
    },
    source: {
      query: "Test song Test artist",
      platform: "netease",
      songId: "12345",
      pageUrl: "https://music.163.com/song?id=12345"
    }
  });
  assert.ok(link);
  assert.ok(search);
  assert.equal(normalizeImportHistoryRecord({
    ...link,
    id: "invalid-time",
    lastUsedAt: Number.MAX_VALUE
  }), null, "timestamps outside the JavaScript date range are rejected");
  assert.equal(link.display.remoteCoverUrl, undefined, "binary/data cover values are not persisted");
  assert.equal("exportedImage" in link, false, "unknown export fields are dropped");
  assert.equal(importHistoryDedupeKey(link), importHistoryDedupeKey(search), "normalized platform songs share a dedupe key");

  const sanitizedLink = normalizeImportHistoryRecord({
    ...link,
    id: "sanitized-link",
    source: {
      inputUrl: "data:image/png;base64,SECRET_PAYLOAD https://music.163.com/song?id=42#private",
      normalizedUrl: "https://music.163.com/song?id=42"
    }
  });
  assert.equal(
    sanitizedLink.source.inputUrl,
    "https://music.163.com/song?id=42",
    "link history persists only the sanitized replayable HTTP URL"
  );
  assert.doesNotMatch(JSON.stringify(sanitizedLink), /SECRET_PAYLOAD|base64|data:image/);

  const coverOnly = normalizeImportHistoryRecord({
    id: "cover-only",
    kind: "manual-cover",
    createdAt: timestamp,
    lastUsedAt: timestamp,
    display: { title: "", artist: "", album: "", source: "unknown" },
    source: {
      path: path.resolve("cover-only.png"),
      fileName: "cover-only.png",
      size: 3,
      mtimeMs: 1
    },
    snapshot: {
      title: "",
      artist: "",
      album: "",
      source: "unknown",
      lyrics: "",
      translationText: "",
      translationEnabled: false,
      lyricDocument: {
        schemaVersion: 2,
        id: "document-cover-only",
        revision: 0,
        blocks: [],
        formatting: { sourcePrefix: "", translationPrefix: "" }
      }
    }
  });
  assert.ok(coverOnly, "a successfully saved cover-only document is valid history");
  assert.equal(coverOnly.snapshot.lyricDocument.id, "document-cover-only");

  assert.deepEqual(validateImportFileDescriptor(
    "local-audio",
    path.resolve("C:\\Music\\song.mp3"),
    { size: 1024, mtimeMs: 123, isFile: true }
  ).ok, true);
  assert.deepEqual(validateImportFileDescriptor(
    "local-audio",
    path.resolve("C:\\Music\\song.m4a"),
    { size: 1024, mtimeMs: 123, isFile: true }
  ).ok, true);
  assert.equal(validateImportFileDescriptor(
    "local-audio",
    path.resolve("C:\\Music\\song.exe"),
    { size: 1024, mtimeMs: 123, isFile: true }
  ).code, "unsupported_file_type");
  assert.equal(validateImportFileDescriptor(
    "manual-cover",
    path.resolve("C:\\Music\\cover.png"),
    { size: 21 * 1024 * 1024, mtimeMs: 123, isFile: true }
  ).code, "file_too_large");
  assert.equal(validateImportFileDescriptor(
    "manual-cover",
    "relative.png",
    { size: 10, mtimeMs: 123, isFile: true }
  ).code, "invalid_path");
  assert.equal(validateImportFileDescriptor(
    "manual-cover",
    path.resolve("C:\\Music\\cover.png"),
    { size: 10, mtimeMs: Number.MAX_VALUE, isFile: true }
  ).code, "invalid_file");

  const normalizedDocument = normalizeImportHistoryDocument({
    schemaVersion: 1,
    records: [link, search, { invalid: true }]
  });
  assert.deepEqual(
    normalizedDocument.records.map((record) => record.id),
    [link.id, search.id],
    "migration drops invalid entries without merging distinct legacy records that share a semantic key"
  );
  assert.equal(normalizedDocument.schemaVersion, 2);
  assert.equal(normalizeImportHistoryDocument({ schemaVersion: 99, records: [] }), null);
  assert.equal(withHistoryLimit({ schemaVersion: 1, records: Array(12).fill(link) }, 5).records.length, 5);
  assert.equal(withHistoryLimit({ schemaVersion: 1, records: Array(12).fill(link) }, 10).records.length, 10);
  assert.equal(withHistoryLimit({ schemaVersion: 1, records: Array(12).fill(link) }, "unlimited").records.length, 12);

  const legacySecond = normalizeImportHistoryRecord({
    ...search,
    id: "legacy-search",
    createdAt: timestamp + 1,
    lastUsedAt: timestamp + 2,
    source: {
      ...search.source,
      songId: "54321",
      pageUrl: "https://music.163.com/song?id=54321"
    }
  });
  const legacyDocument = { schemaVersion: 1, records: [link, legacySecond] };
  const migrated = normalizeImportHistoryDocument(legacyDocument);
  assert.equal(migrated.schemaVersion, IMPORT_HISTORY_SCHEMA_VERSION);
  assert.deepEqual(
    migrated.records,
    [link, legacySecond],
    "v1 to v2 migration preserves the four legacy kinds, IDs, order, timestamps, and normalized content"
  );
  assert.deepEqual(normalizeImportHistoryDocument(migrated), migrated, "v1 to v2 migration is idempotent");

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lyrics-card-history-test-"));
  try {
    const target = path.join(root, "app-data", "import-history.json");
    let nextId = 0;
    let now = timestamp;
    const store = new ImportHistoryStore({
      filePath: target,
      now: () => ++now,
      createId: () => `record-${++nextId}`
    });

    for (let index = 0; index < 12; index += 1) {
      await store.upsert(linkCandidate(index), "unlimited");
    }
    assert.equal((await store.stats()).total, 12, "unlimited retains every bounded record");
    assert.equal((await store.list({ offset: 0, limit: 5 })).records.length, 5, "list results are paged");

    assert.equal(await store.trim(10), 2);
    assert.equal((await store.stats()).total, 10);
    assert.equal(await store.trim(5), 5);
    assert.equal((await store.stats()).total, 5);

    const duplicate = await store.upsert({
      kind: "search",
      query: "same platform song",
      platform: "netease",
      songId: "9",
      pageUrl: "https://music.163.com/song?id=9",
      display: { title: "Updated title", artist: "Artist", album: "", source: "netease" }
    }, 10);
    const afterUpsert = await store.list({ offset: 0, limit: 20 });
    assert.equal(afterUpsert.total, 5, "upsert does not create a duplicate card");
    assert.equal(afterUpsert.records[0].id, duplicate.id);
    assert.equal(afterUpsert.records[0].title, "Updated title");

    assert.equal(await store.touch(duplicate.id, 10), true);
    assert.equal((await store.list({ offset: 0, limit: 20 })).records[0].id, duplicate.id);
    assert.equal(await store.remove(duplicate.id), true);
    assert.equal((await store.stats()).total, 4);
    assert.equal(await store.clear(), 4);
    assert.equal((await store.stats()).total, 0);
    await store.flush();

    const persisted = JSON.parse(await fs.readFile(target, "utf8"));
    assert.deepEqual(persisted, { schemaVersion: 2, records: [] }, "store persists schema-versioned UTF-8 JSON");

    const manualTarget = path.join(root, "app-data", "manual-save-history.json");
    let manualId = 0;
    let manualNow = timestamp + 100;
    const manualStore = new ImportHistoryStore({
      filePath: manualTarget,
      now: () => ++manualNow,
      createId: () => `manual-${++manualId}`
    });

    const shapeBoundaryTarget = path.join(root, "app-data", "manual-save-shape-boundary.json");
    let shapeBoundaryNowCalls = 0;
    let shapeBoundaryIdCalls = 0;
    const shapeBoundaryStore = new ImportHistoryStore({
      filePath: shapeBoundaryTarget,
      now: () => {
        shapeBoundaryNowCalls += 1;
        return timestamp;
      },
      createId: () => {
        shapeBoundaryIdCalls += 1;
        return "must-not-be-created";
      }
    });
    let outerGetterCalls = 0;
    const accessorCandidate = {};
    Object.defineProperty(accessorCandidate, "snapshot", {
      enumerable: true,
      get() {
        outerGetterCalls += 1;
        return manualSaveCandidate("Accessor must be rejected", "Safe lyrics").snapshot;
      }
    });
    await assert.rejects(
      shapeBoundaryStore.createManualSave(accessorCandidate, "unlimited"),
      (error) => error?.code === "invalid_snapshot",
      "the Store boundary rejects an accessor-bearing outer request"
    );
    assert.equal(outerGetterCalls, 0, "the Store boundary never executes an outer snapshot getter");

    let proxyGets = 0;
    let proxyOwnKeys = 0;
    const proxyCandidate = new Proxy(manualSaveCandidate("Proxy must be rejected", "Safe lyrics"), {
      get(target, key, receiver) {
        proxyGets += 1;
        return Reflect.get(target, key, receiver);
      },
      ownKeys(target) {
        proxyOwnKeys += 1;
        return Reflect.ownKeys(target);
      }
    });
    await assert.rejects(
      shapeBoundaryStore.createManualSave(proxyCandidate, "unlimited"),
      (error) => error?.code === "invalid_snapshot",
      "the Store boundary rejects a Proxy request"
    );
    assert.deepEqual(
      { proxyGets, proxyOwnKeys },
      { proxyGets: 0, proxyOwnKeys: 0 },
      "the Store boundary rejects a Proxy without executing any trap"
    );

    let nestedGetterCalls = 0;
    const nestedAccessorCandidate = manualSaveCandidate("Nested accessor", "Safe lyrics");
    Object.defineProperty(nestedAccessorCandidate.snapshot, "unknownAccessor", {
      enumerable: true,
      get() {
        nestedGetterCalls += 1;
        return "secret";
      }
    });
    const symbolCandidate = manualSaveCandidate("Symbol property", "Safe lyrics");
    symbolCandidate.snapshot[Symbol("secret")] = "secret";
    const nonEnumerableCandidate = manualSaveCandidate("Non-enumerable property", "Safe lyrics");
    Object.defineProperty(nonEnumerableCandidate.snapshot, "hidden", { value: "secret", enumerable: false });
    const extendedArray = ["safe"];
    extendedArray.extra = "secret";
    const sparseArray = new Array(2);
    sparseArray[1] = "safe";
    const sharedValue = { safe: true };
    const cycle = {};
    cycle.self = cycle;
    const rawStructuredCloneCases = [
      ["nested accessor", nestedAccessorCandidate],
      ["symbol property", symbolCandidate],
      ["non-enumerable property", nonEnumerableCandidate],
      ["extended array", manualSaveCandidateWithUnknown(extendedArray)],
      ["sparse array", manualSaveCandidateWithUnknown(sparseArray)],
      ["shared object", manualSaveCandidateWithUnknown({ first: sharedValue, second: sharedValue })],
      ["ArrayBuffer", manualSaveCandidateWithUnknown(new ArrayBuffer(16))],
      ["Uint8Array", manualSaveCandidateWithUnknown(new Uint8Array([1, 2, 3]))],
      ["DataView", manualSaveCandidateWithUnknown(new DataView(new ArrayBuffer(8)))],
      ["Map", manualSaveCandidateWithUnknown(new Map([["secret", "value"]]))],
      ["Set", manualSaveCandidateWithUnknown(new Set(["secret"]))],
      ["Date", manualSaveCandidateWithUnknown(new Date(0))],
      ["RegExp", manualSaveCandidateWithUnknown(/secret/u)],
      ["Error", manualSaveCandidateWithUnknown(new Error("secret"))],
      ["cycle", manualSaveCandidateWithUnknown(cycle)]
    ];
    if (typeof SharedArrayBuffer === "function") {
      rawStructuredCloneCases.push([
        "SharedArrayBuffer",
        manualSaveCandidateWithUnknown(new SharedArrayBuffer(16))
      ]);
    }
    for (const [label, candidate] of rawStructuredCloneCases) {
      await assert.rejects(
        shapeBoundaryStore.createManualSave(candidate, "unlimited"),
        (error) => error?.code === "invalid_snapshot",
        `the Store rejects raw ${label} input with the stable domain error`
      );
    }
    assert.equal(nestedGetterCalls, 0, "the Store never executes a nested accessor");

    const canonicalSnapshot = manualSaveCandidate("Canonical schema", "Safe lyrics").snapshot;
    const unknownFieldSnapshot = { ...canonicalSnapshot, unsupported: "must reject" };
    const missingArtistSnapshot = { ...canonicalSnapshot };
    delete missingArtistSnapshot.artist;
    const invalidSourceSnapshot = { ...canonicalSnapshot, source: "attacker-source" };
    const oversizedUnknownFieldSnapshot = { ...canonicalSnapshot, unknownPadding: "x".repeat(600_000) };
    const reversedSnapshot = Object.fromEntries(Object.entries(canonicalSnapshot).reverse());
    const swappedSnapshotEntries = Object.entries(canonicalSnapshot);
    [swappedSnapshotEntries[1], swappedSnapshotEntries[2]] = [
      swappedSnapshotEntries[2],
      swappedSnapshotEntries[1]
    ];
    const swappedSnapshot = Object.fromEntries(swappedSnapshotEntries);
    for (const [label, invalidEnvelope] of [
      ["missing envelope version", JSON.stringify({ snapshot: canonicalSnapshot })],
      ["unknown outer field", JSON.stringify({ version: 1, snapshot: canonicalSnapshot, extra: true })],
      ["wrong envelope version", JSON.stringify({ version: 2, snapshot: canonicalSnapshot })],
      ["reordered outer fields", JSON.stringify({ snapshot: canonicalSnapshot, version: 1 })],
      ["unknown snapshot field", manualSaveEnvelope({ snapshot: unknownFieldSnapshot })],
      ["missing required artist", manualSaveEnvelope({ snapshot: missingArtistSnapshot })],
      ["unsupported source enum", manualSaveEnvelope({ snapshot: invalidSourceSnapshot })],
      ["reversed canonical snapshot fields", manualSaveEnvelope({ snapshot: reversedSnapshot })],
      ["one swapped canonical snapshot field pair", manualSaveEnvelope({ snapshot: swappedSnapshot })],
      ["oversized unknown string", manualSaveEnvelope({ snapshot: oversizedUnknownFieldSnapshot })],
      ["non-canonical whitespace", ` ${manualSaveEnvelope({ snapshot: canonicalSnapshot })}`],
      ["malformed JSON", '{"version":1,"snapshot":']
    ]) {
      await assert.rejects(
        shapeBoundaryStore.createManualSave(invalidEnvelope, "unlimited"),
        (error) => error?.code === "invalid_snapshot",
        `${label} is rejected before Store mutation`
      );
    }

    const deepValue = `${'{"next":'.repeat(25_000)}null${"}".repeat(25_000)}`;
    const deepEnvelope = `{"version":1,"snapshot":{"source":"unknown","title":"Deep input","artist":"","album":"","explicit":false,"originalCoverUrl":"","coverUrl":"","originalUrl":"","finalUrl":"","parseMethod":"","lyrics":"Safe lyrics","translationText":"","translationEnabled":false,"unknownDeep":${deepValue}}}`;
    await assert.rejects(
      shapeBoundaryStore.createManualSave(deepEnvelope, "unlimited"),
      (error) => error?.code === "invalid_snapshot",
      "a canonical but excessively deep envelope is rejected without recursion failure"
    );
    assert.equal(shapeBoundaryStore.document, null, "invalid requests never initialize Store memory state");
    assert.deepEqual(
      { shapeBoundaryNowCalls, shapeBoundaryIdCalls },
      { shapeBoundaryNowCalls: 0, shapeBoundaryIdCalls: 0 },
      "invalid requests never allocate metadata"
    );
    await assert.rejects(
      fs.readFile(shapeBoundaryTarget, "utf8"),
      (error) => error?.code === "ENOENT",
      "an invalid request creates no history file"
    );

    const firstManual = await manualStore.createManualSave(
      manualSaveEnvelope(manualSaveCandidate("Same title", "First lyrics")),
      "unlimited"
    );
    let updateGetterCalls = 0;
    const updateAccessorCandidate = {};
    Object.defineProperty(updateAccessorCandidate, "snapshot", {
      enumerable: true,
      get() {
        updateGetterCalls += 1;
        return manualSaveCandidate("Accessor update", "Unsafe update").snapshot;
      }
    });
    await assert.rejects(
      manualStore.updateManualSave(firstManual.id, updateAccessorCandidate, "unlimited"),
      (error) => error?.code === "invalid_snapshot",
      "Store update rejects an accessor envelope before record lookup or mutation"
    );
    assert.equal(updateGetterCalls, 0, "Store update never executes the accessor getter");
    assert.equal((await manualStore.get(firstManual.id)).snapshot.title, "Same title");
    const firstCreatedAt = (await manualStore.get(firstManual.id)).createdAt;
    const secondManual = await manualStore.createManualSave(
      manualSaveEnvelope(manualSaveCandidate("Same title", "Second lyrics")),
      "unlimited"
    );
    assert.notEqual(firstManual.id, secondManual.id);
    assert.equal((await manualStore.stats()).total, 2, "same-title manual saves coexist without dedupe");

    const updatedManual = await manualStore.updateManualSave(
      firstManual.id,
      manualSaveEnvelope(manualSaveCandidate("Updated title", "Updated lyrics")),
      "unlimited"
    );
    const updatedInternal = await manualStore.get(firstManual.id);
    const updatedList = await manualStore.list({ offset: 0, limit: 10 });
    assert.equal(updatedManual.id, firstManual.id);
    assert.equal(updatedInternal.createdAt, firstCreatedAt, "manual save updates retain createdAt");
    assert.ok(updatedInternal.lastUsedAt > firstCreatedAt, "manual save updates advance lastUsedAt");
    assert.equal(updatedList.records[0].id, firstManual.id, "updated manual saves move to the top");
    assert.equal(updatedList.total, 2, "manual save updates do not change the total");

    const invalidUpdate = manualSaveCandidate("Must not project", "Unsafe update");
    invalidUpdate.snapshot.unsupported = "must reject";
    const beforeInvalidUpdateDisk = await fs.readFile(manualTarget, "utf8");
    await assert.rejects(
      manualStore.updateManualSave(firstManual.id, manualSaveEnvelope(invalidUpdate), "unlimited"),
      (error) => error?.code === "invalid_snapshot",
      "update enforces the same exact canonical snapshot contract as create"
    );
    assert.equal((await manualStore.get(firstManual.id)).snapshot.title, "Updated title");
    assert.equal(await fs.readFile(manualTarget, "utf8"), beforeInvalidUpdateDisk);

    await assert.rejects(
      manualStore.updateManualSave(
        "missing-record",
        manualSaveEnvelope(manualSaveCandidate("Missing", "lyrics")),
        10
      ),
      (error) => error?.code === "not_found"
    );
    const ordinary = await manualStore.upsert(linkCandidate(777), "unlimited");
    await assert.rejects(
      manualStore.updateManualSave(
        ordinary.id,
        manualSaveEnvelope(manualSaveCandidate("Wrong kind", "lyrics")),
        10
      ),
      (error) => error?.code === "invalid_kind"
    );
    await assert.rejects(
      manualStore.upsert({ kind: "manual-save", ...manualSaveCandidate("Bypass", "lyrics") }, 10),
      (error) => error?.code === "invalid_kind"
    );
    await assert.rejects(
      manualStore.createManualSave(manualSaveEnvelope({ snapshot: emptyManualSnapshot() }), 10),
      (error) => error?.code === "invalid_snapshot"
    );
    await assert.rejects(
      manualStore.createManualSave(
        manualSaveEnvelope(manualSaveCandidate("Oversized", "x".repeat(120_001))),
        10
      ),
      (error) => error?.code === "invalid_snapshot"
    );
    await assert.rejects(
      manualStore.createManualSave(manualSaveEnvelope({
        snapshot: {
          ...emptyManualSnapshot(),
          title: "Record byte ceiling",
          lyrics: "界".repeat(120_000),
          translationText: "界".repeat(120_000)
        }
      }), 10),
      (error) => error?.code === "invalid_snapshot"
    );
    await assert.rejects(
      manualStore.createManualSave(manualSaveEnvelope({
        snapshot: {
          ...emptyManualSnapshot(),
          title: "Oversized unknown object",
          lyrics: "Safe lyrics",
          style: { embeddedImage: `data:image/png;base64,${"A".repeat(600_000)}` }
        }
      }), 10),
      (error) => error?.code === "invalid_snapshot",
      "large unknown snapshot objects are rejected before whitelist projection"
    );

    const cyclicValue = {};
    cyclicValue.self = cyclicValue;
    const rejectedStructuredCloneValues = [
      ["ArrayBuffer", new ArrayBuffer(2 * 1024 * 1024)],
      ["Uint8Array", new Uint8Array([1, 2, 3, 4])],
      ["DataView", new DataView(new ArrayBuffer(8))],
      ["Map", new Map([["secret", "value"]])],
      ["Set", new Set(["secret"])],
      ["Date", new Date(0)],
      ["RegExp", /secret/u],
      ["Error", new Error("secret")],
      ["cycle", cyclicValue]
    ];
    if (typeof SharedArrayBuffer === "function") {
      rejectedStructuredCloneValues.push(["SharedArrayBuffer", new SharedArrayBuffer(16)]);
    }
    for (const [label, value] of rejectedStructuredCloneValues) {
      const candidate = manualSaveCandidate(`Reject ${label}`, "Safe lyrics");
      candidate.snapshot.unknownValue = value;
      await assert.rejects(
        manualStore.createManualSave(candidate, "unlimited"),
        (error) => error?.code === "invalid_snapshot",
        `${label} is rejected before snapshot field projection`
      );
    }

    const boundaryCandidate = { snapshot: manualSnapshotAtUtf8Bytes(MAX_MANUAL_SNAPSHOT_BYTES) };
    assert.equal(
      Buffer.byteLength(JSON.stringify(boundaryCandidate.snapshot), "utf8"),
      MAX_MANUAL_SNAPSHOT_BYTES,
      "the complete legal snapshot is exactly the pre-normalization byte ceiling"
    );
    const boundaryRecord = await manualStore.createManualSave(manualSaveEnvelope(boundaryCandidate), "unlimited");
    assert.equal((await manualStore.get(boundaryRecord.id)).snapshot.lyrics.length, 120_000);

    const oversizedLegalSnapshot = structuredClone(boundaryCandidate.snapshot);
    oversizedLegalSnapshot.translationText += "x";
    await assert.rejects(
      manualStore.createManualSave(manualSaveEnvelope({ snapshot: oversizedLegalSnapshot }), "unlimited"),
      (error) => error?.code === "invalid_snapshot",
      "a complete legal-field snapshot one byte over the ceiling is rejected"
    );

    const sanitizedManual = await manualStore.createManualSave(manualSaveEnvelope({
      snapshot: {
        ...emptyManualSnapshot(),
        title: "Sanitized manual save",
        lyrics: "Safe semantic content",
        originalCoverUrl: "https://covers.example/manual.jpg?token=SECRET_TOKEN#private",
        coverUrl: "https://covers.example/fallback.jpg?api_key=SECRET_API_KEY",
        originalUrl: "https://music.163.com/song?id=42&token=SECRET_TOKEN",
        finalUrl: "https://user:password@example.com/private",
        parseMethod: "C:/Users/private/parser"
      }
    }), "unlimited");
    const sanitizedSnapshot = (await manualStore.get(sanitizedManual.id)).snapshot;
    assert.equal(sanitizedSnapshot.originalCoverUrl, "https://covers.example/manual.jpg");
    assert.equal(sanitizedSnapshot.coverUrl, "https://covers.example/fallback.jpg");
    assert.equal(sanitizedSnapshot.originalUrl, "https://music.163.com/song?id=42");
    assert.equal(sanitizedSnapshot.finalUrl, "https://music.163.com/song?id=42");
    assert.equal(sanitizedSnapshot.parseMethod, "");
    assert.doesNotMatch(
      JSON.stringify(await manualStore.get(sanitizedManual.id)),
      /SECRET_|blob:|data:image|file:\/\/|C:\\\\Users/
    );
    const backslashMethod = await manualStore.createManualSave(manualSaveEnvelope({
      snapshot: {
        ...emptyManualSnapshot(),
        title: "Backslash parse method",
        lyrics: "Safe semantic content",
        parseMethod: "C:\\Users\\private\\parser"
      }
    }), "unlimited");
    assert.equal((await manualStore.get(backslashMethod.id)).snapshot.parseMethod, "");
    const validMethod = await manualStore.createManualSave(manualSaveEnvelope({
      snapshot: {
        ...emptyManualSnapshot(),
        title: "Valid parse method",
        lyrics: "Safe semantic content",
        parseMethod: "manual-save_test.v2"
      }
    }), "unlimited");
    assert.equal((await manualStore.get(validMethod.id)).snapshot.parseMethod, "manual-save_test.v2");

    const identityUrlCases = [
      {
        label: "NetEase query identity",
        input: "https://music.163.com/song?id=70001&token=SECRET&api_key=SECRET&utm_source=tracker#private",
        expected: "https://music.163.com/song?id=70001"
      },
      {
        label: "NetEase hash-route identity",
        input: "https://music.163.com/#/song?id=70002&auth=SECRET",
        expected: "https://music.163.com/song?id=70002"
      },
      {
        label: "Apple Music track identity",
        input: "https://music.apple.com/us/album/example/123456?i=654321&token=SECRET&signature=SECRET#private",
        expected: "https://music.apple.com/us/album/example/123456?i=654321"
      },
      {
        label: "Apple Music song path identity",
        input: "https://music.apple.com/us/song/example/654322?token=SECRET#private",
        expected: "https://music.apple.com/us/song/example/654322"
      },
      {
        label: "QQ Music songmid identity",
        input: "https://y.qq.com/portal/player.html?songmid=003OUlho2HcRHC&auth=SECRET&utm_campaign=tracker#private",
        expected: "https://y.qq.com/portal/player.html?songmid=003OUlho2HcRHC"
      },
      {
        label: "QQ Music path identity",
        input: "https://y.qq.com/n/ryqq/songDetail/003OUlho2HcRHC?auth=SECRET#private",
        expected: "https://y.qq.com/n/ryqq/songDetail/003OUlho2HcRHC"
      },
      {
        label: "QQ Music non-song path",
        input: "https://y.qq.com/account/settings?songmid=003OUlho2HcRHC&token=SECRET#private",
        expected: "https://y.qq.com/account/settings"
      },
      {
        label: "Spotify path identity",
        input: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=SECRET&utm_source=tracker#private",
        expected: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"
      },
      {
        label: "unsupported host has no identity query",
        input: "https://example.com/song?id=70001&i=654321&token=SECRET#private",
        expected: "https://example.com/song"
      }
    ];
    for (const { label, input, expected } of identityUrlCases) {
      const candidate = manualSaveCandidate(label, "Safe lyrics");
      candidate.snapshot.originalUrl = input;
      candidate.snapshot.finalUrl = input;
      const saved = await manualStore.createManualSave(manualSaveEnvelope(candidate), "unlimited");
      const stored = (await manualStore.get(saved.id)).snapshot;
      assert.equal(stored.originalUrl, expected, `${label} keeps only its allowlisted identity`);
      assert.equal(stored.finalUrl, expected, `${label} has identical original/final URL semantics`);
      assert.doesNotMatch(
        `${stored.originalUrl}\n${stored.finalUrl}`,
        /SECRET|token=|api_key=|auth=|signature=|utm_|#|\bsi=/i,
        `${label} removes credentials, fragments, signatures, and tracking`
      );
    }

    const noIdentityUrlCases = [
      {
        label: "non-canonical NetEase identity spelling",
        input: "https://music.163.com/song?ID=70001",
        expected: "https://music.163.com/song"
      },
      {
        label: "NetEase alternate HTTPS port",
        input: "https://music.163.com:8443/song?id=70001",
        expected: "https://music.163.com:8443/song"
      },
      {
        label: "unlisted NetEase subdomain",
        input: "https://unexpected.music.163.com/song?id=70001",
        expected: "https://unexpected.music.163.com/song"
      }
    ];
    for (const { label, input, expected } of noIdentityUrlCases) {
      const candidate = manualSaveCandidate(label, "Safe lyrics");
      candidate.snapshot.originalUrl = input;
      candidate.snapshot.finalUrl = input;
      const saved = await manualStore.createManualSave(manualSaveEnvelope(candidate), "unlimited");
      const stored = (await manualStore.get(saved.id)).snapshot;
      assert.equal(stored.originalUrl, expected, `${label} strips non-allowlisted identity data`);
      assert.equal(stored.finalUrl, expected, `${label} retains one privacy-sanitized URL`);
    }

    const ambiguousIdentityUrlCases = [
      {
        label: "duplicate NetEase identity",
        input: "https://music.163.com/song?id=70001&id=70002"
      },
      {
        label: "encoded duplicate NetEase identity",
        input: "https://music.163.com/song?id=70001&%69d=70002"
      },
      {
        label: "case-equivalent duplicate NetEase identity with the same value",
        input: "https://music.163.com/song?id=70001&ID=70001"
      },
      {
        label: "case-equivalent duplicate NetEase identity with a conflicting value",
        input: "https://music.163.com/song?id=70001&ID=70002"
      },
      {
        label: "percent-decoded case-equivalent NetEase identity",
        input: "https://music.163.com/song?id=70001&%49%44=70002"
      },
      {
        label: "case-equivalent duplicate QQ songmid identity",
        input: "https://y.qq.com/portal/player.html?songmid=003OUlho2HcRHC&SongMid=003OUlho2HcRHC"
      },
      {
        label: "case-equivalent conflicting QQ songid identity",
        input: "https://y.qq.com/player?songid=70001&SONGID=70002"
      },
      {
        label: "case-equivalent duplicate Apple identity",
        input: "https://music.apple.com/us/album/example/123456?i=654321&I=654321"
      },
      {
        label: "QQ path and parameter ambiguity",
        input: "https://y.qq.com/n/ryqq/songDetail/003OUlho2HcRHC?songmid=OTHERID"
      },
      {
        label: "Apple song path and parameter ambiguity",
        input: "https://music.apple.com/us/song/example/654322?i=654323"
      },
      {
        label: "ambiguous original URL cannot fall back to a canonical final URL",
        originalUrl: "https://music.163.com/song?id=70001&ID=70002",
        finalUrl: "https://music.163.com/song?id=70002"
      },
      {
        label: "ambiguous final URL cannot fall back to a canonical original URL",
        originalUrl: "https://music.163.com/song?id=70001",
        finalUrl: "https://music.163.com/song?id=70001&%69d=70002"
      }
    ];
    const beforeAmbiguousTotal = (await manualStore.stats()).total;
    const beforeAmbiguousDisk = await fs.readFile(manualTarget, "utf8");
    const beforeAmbiguousMetadata = { manualId, manualNow };
    for (const { label, input, originalUrl = input, finalUrl = input } of ambiguousIdentityUrlCases) {
      const candidate = manualSaveCandidate(label, "Safe lyrics");
      candidate.snapshot.originalUrl = originalUrl;
      candidate.snapshot.finalUrl = finalUrl;
      await assert.rejects(
        manualStore.createManualSave(manualSaveEnvelope(candidate), "unlimited"),
        (error) => error?.code === "invalid_snapshot",
        `${label} rejects the entire ambiguous manual snapshot`
      );
      await assert.rejects(
        manualStore.updateManualSave(validMethod.id, manualSaveEnvelope(candidate), "unlimited"),
        (error) => error?.code === "invalid_snapshot",
        `${label} rejects update before touching the bound record`
      );
      assert.equal((await manualStore.stats()).total, beforeAmbiguousTotal, `${label} never mutates Store memory`);
      assert.equal(await fs.readFile(manualTarget, "utf8"), beforeAmbiguousDisk, `${label} never writes history`);
    }
    assert.deepEqual(
      { manualId, manualNow },
      beforeAmbiguousMetadata,
      "ambiguous identities are rejected before ID/time allocation"
    );

    const sameIdentityRepresentations = manualSaveCandidate("Same identity representations", "Safe lyrics");
    sameIdentityRepresentations.snapshot.originalUrl = "https://music.163.com/#/song?id=70001&token=SECRET";
    sameIdentityRepresentations.snapshot.finalUrl = "https://music.163.com/song?id=70001&utm_source=tracker";
    const sameIdentityRecord = await manualStore.createManualSave(
      manualSaveEnvelope(sameIdentityRepresentations),
      "unlimited"
    );
    const sameIdentitySnapshot = (await manualStore.get(sameIdentityRecord.id)).snapshot;
    assert.deepEqual(
      [sameIdentitySnapshot.originalUrl, sameIdentitySnapshot.finalUrl],
      ["https://music.163.com/song?id=70001", "https://music.163.com/song?id=70001"],
      "equivalent URL representations collapse to one normalized replay provenance"
    );

    const conflictingIdentity = manualSaveCandidate("Conflicting identity", "Safe lyrics");
    conflictingIdentity.snapshot.originalUrl = "https://music.163.com/song?id=70001";
    conflictingIdentity.snapshot.finalUrl = "https://music.163.com/song?id=70002";
    const beforeConflictTotal = (await manualStore.stats()).total;
    const beforeConflictDisk = await fs.readFile(manualTarget, "utf8");
    await assert.rejects(
      manualStore.createManualSave(manualSaveEnvelope(conflictingIdentity), "unlimited"),
      (error) => error?.code === "invalid_snapshot",
      "different original/final song identities are rejected"
    );
    assert.equal((await manualStore.stats()).total, beforeConflictTotal);
    assert.equal(await fs.readFile(manualTarget, "utf8"), beforeConflictDisk);

    for (const limit of [5, 10, "unlimited"]) {
      const limitTarget = path.join(root, "app-data", `manual-limit-${limit}.json`);
      let limitId = 0;
      let limitNow = timestamp + 1_000;
      const limitStore = new ImportHistoryStore({
        filePath: limitTarget,
        now: () => ++limitNow,
        createId: () => `limit-${limit}-${++limitId}`
      });
      const expectedTotal = limit === "unlimited" ? 12 : limit;
      const created = [];
      for (let index = 0; index < 12; index += 1) {
        created.push(await limitStore.createManualSave(
          manualSaveEnvelope(manualSaveCandidate(`Limit ${index}`, `Lyrics ${index}`)),
          limit
        ));
      }
      assert.equal((await limitStore.stats()).total, expectedTotal, `${limit} trims manual save creates correctly`);
      const retained = (await limitStore.list({ offset: 0, limit: 50 })).records.at(-1);
      const beforeUpdateTotal = (await limitStore.stats()).total;
      await limitStore.updateManualSave(
        retained.id,
        manualSaveEnvelope(manualSaveCandidate("Moved to top", "updated")),
        limit
      );
      const afterUpdate = await limitStore.list({ offset: 0, limit: 50 });
      assert.equal(afterUpdate.total, beforeUpdateTotal, `${limit} update does not delete the updated record`);
      assert.equal(afterUpdate.records[0].id, retained.id, `${limit} update retains and promotes the selected ID`);
    }

    const concurrentTarget = path.join(root, "app-data", "concurrent-import-history.json");
    const concurrentStore = new ImportHistoryStore({
      filePath: concurrentTarget,
      now: () => ++now,
      createId: () => `concurrent-${++nextId}`
    });
    await Promise.all(Array.from({ length: 16 }, (_, index) => (
      concurrentStore.upsert(linkCandidate(200 + index), "unlimited")
    )));
    await concurrentStore.flush();
    assert.equal((await concurrentStore.stats()).total, 16, "serialized concurrent writes do not lose records");
    assert.equal(
      JSON.parse(await fs.readFile(concurrentTarget, "utf8")).records.length,
      16,
      "the serialized queue leaves a complete atomic document on disk"
    );

    const privacyMigrationTarget = path.join(root, "app-data", "privacy-migration-history.json");
    await fs.writeFile(privacyMigrationTarget, JSON.stringify({
      schemaVersion: 1,
      records: [{
        ...link,
        id: "legacy-raw-input",
        source: {
          inputUrl: "data:image/png;base64,LEGACY_SECRET https://music.163.com/song?id=42#private",
          normalizedUrl: "https://music.163.com/song?id=42",
          finalUrl: "https://music.163.com/song?id=42"
        }
      }]
    }), "utf8");
    const privacyMigrationStore = new ImportHistoryStore({ filePath: privacyMigrationTarget });
    assert.equal((await privacyMigrationStore.list({ offset: 0, limit: 10 })).total, 1);
    const scrubbedHistory = await fs.readFile(privacyMigrationTarget, "utf8");
    assert.doesNotMatch(scrubbedHistory, /LEGACY_SECRET|base64|data:image/);
    assert.equal(
      JSON.parse(scrubbedHistory).records[0].source.inputUrl,
      "https://music.163.com/song?id=42",
      "loading an older history file scrubs already-persisted raw input"
    );

    const migrationFailureTarget = path.join(root, "app-data", "migration-write-failure-history.json");
    await fs.writeFile(migrationFailureTarget, JSON.stringify({
      schemaVersion: 1,
      records: [{ ...link, id: "migration-write-failure" }]
    }), "utf8");
    let migrationRenameAttempts = 0;
    const migrationFailureStore = new ImportHistoryStore({
      filePath: migrationFailureTarget,
      fs: {
        ...fs,
        rename: async () => {
          migrationRenameAttempts += 1;
          const error = new Error("simulated migration permission failure");
          error.code = "EACCES";
          throw error;
        }
      }
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await assert.rejects(
        migrationFailureStore.list({ offset: 0, limit: 10 }),
        (error) => error?.code === "history_migration_failed",
        "a failed v1 migration is observable instead of returning an in-memory v2 success"
      );
      assert.equal(
        JSON.parse(await fs.readFile(migrationFailureTarget, "utf8")).schemaVersion,
        1,
        "a failed migration leaves the durable v1 source intact"
      );
    }
    assert.equal(migrationRenameAttempts, 2, "the same process retries a migration that never became durable");
    const restartedMigrationStore = new ImportHistoryStore({ filePath: migrationFailureTarget });
    assert.equal((await restartedMigrationStore.list({ offset: 0, limit: 10 })).total, 1);
    assert.equal(
      JSON.parse(await fs.readFile(migrationFailureTarget, "utf8")).schemaVersion,
      2,
      "a clean restart observes v1 and durably completes the migration"
    );

    await fs.writeFile(target, '{"schemaVersion":2,"records":[', "utf8");
    const recovered = new ImportHistoryStore({ filePath: target, now: () => timestamp });
    const recoveredList = await recovered.list({ offset: 0, limit: 24 });
    assert.equal(recoveredList.total, 0);
    assert.equal(recoveredList.notice?.code, "corrupt_recovered");
    assert.match(recoveredList.notice?.backupFileName ?? "", /^import-history\.corrupt-.*\.json$/);
    const files = await fs.readdir(path.dirname(target));
    assert.ok(files.some((file) => /^import-history\.corrupt-.*\.json$/.test(file)), "corrupt source is retained as a timestamped backup");
    assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), { schemaVersion: 2, records: [] });

    const schemaInvalidTarget = path.join(root, "app-data", "schema-invalid-history.json");
    await fs.writeFile(schemaInvalidTarget, JSON.stringify({ schemaVersion: 2, records: "not-an-array" }), "utf8");
    const schemaInvalidStore = new ImportHistoryStore({ filePath: schemaInvalidTarget, now: () => timestamp + 1 });
    const schemaInvalidList = await schemaInvalidStore.list({ offset: 0, limit: 24 });
    assert.equal(schemaInvalidList.total, 0);
    assert.equal(schemaInvalidList.notice?.code, "corrupt_recovered");
    assert.deepEqual(
      JSON.parse(await fs.readFile(schemaInvalidTarget, "utf8")),
      { schemaVersion: 2, records: [] },
      "schema-invalid JSON remains covered separately from JSON.parse failures"
    );

    const cleanupTarget = path.join(root, "cleanup", "import-history.json");
    await fs.mkdir(path.dirname(cleanupTarget), { recursive: true });
    const staleTemporary = `${cleanupTarget}.tmp-999-${"ab".repeat(6)}`;
    const unrelatedTemporary = `${cleanupTarget}.tmp-not-ours`;
    await fs.writeFile(staleTemporary, "stale history copy", "utf8");
    await fs.writeFile(unrelatedTemporary, "keep", "utf8");
    const cleanupStore = new ImportHistoryStore({ filePath: cleanupTarget });
    await cleanupStore.initialize();
    await assert.rejects(fs.stat(staleTemporary), (error) => error?.code === "ENOENT");
    assert.equal((await fs.stat(unrelatedTemporary)).isFile(), true, "startup cleanup only removes owned temp files");

    const streamedAudioPath = path.join(root, "streamed-large.mp3");
    const streamedAudioBytes = Buffer.alloc(32 * 1024 * 1024);
    for (let index = 0; index < streamedAudioBytes.length; index += 1) {
      streamedAudioBytes[index] = index % 251;
    }
    await fs.writeFile(streamedAudioPath, streamedAudioBytes);
    let streamTokenId = 0;
    const streamRegistry = new ImportHistoryFileStreamRegistry({
      createToken: () => `stream-token-${String(++streamTokenId).padStart(4, "0")}`
    });
    const openedStream = await streamRegistry.open(41, "local-audio", streamedAudioPath);
    assert.equal(openedStream.ok, true);
    assert.equal("bytes" in openedStream, false, "opening a replay never returns the whole file payload");
    assert.equal(openedStream.size, streamedAudioBytes.length);
    assert.deepEqual(
      await streamRegistry.read(42, openedStream.streamToken),
      { ok: false, code: "file_reference_expired" },
      "a stream token is bound to its originating renderer"
    );
    const streamedHash = crypto.createHash("sha256");
    let streamedTotal = 0;
    let streamedChunks = 0;
    let maximumPayload = 0;
    const firstChunkPromise = streamRegistry.read(41, openedStream.streamToken);
    assert.deepEqual(
      await streamRegistry.read(41, openedStream.streamToken),
      { ok: false, code: "read_in_progress" },
      "one capability cannot queue unbounded concurrent IPC payloads"
    );
    let nextChunk = await firstChunkPromise;
    while (true) {
      const chunk = nextChunk;
      assert.equal(chunk.ok, true);
      assert.ok(chunk.bytes.byteLength <= DEFAULT_IMPORT_FILE_STREAM_CHUNK_BYTES);
      maximumPayload = Math.max(maximumPayload, chunk.bytes.byteLength);
      streamedTotal += chunk.bytes.byteLength;
      streamedChunks += 1;
      streamedHash.update(chunk.bytes);
      if (chunk.done) break;
      nextChunk = await streamRegistry.read(41, openedStream.streamToken);
    }
    assert.equal(streamedTotal, streamedAudioBytes.length);
    assert.equal(streamedChunks, 32);
    assert.equal(maximumPayload, DEFAULT_IMPORT_FILE_STREAM_CHUNK_BYTES);
    assert.equal(streamedHash.digest("hex"), crypto.createHash("sha256").update(streamedAudioBytes).digest("hex"));
    assert.equal(streamRegistry.activeCount, 0, "successful completion closes and removes the stable handle");
    assert.equal(await streamRegistry.release(41, openedStream.streamToken), false);
    console.log(JSON.stringify({
      localAudioStreamPerformance: {
        fileBytes: streamedAudioBytes.length,
        totalIpcBytes: streamedTotal,
        maximumIpcPayloadBytes: maximumPayload,
        mainWholeFileBuffers: 0,
        mainActiveReadBufferUpperBoundBytes: DEFAULT_IMPORT_FILE_STREAM_CHUNK_BYTES
      }
    }));

    const cancelledStream = await streamRegistry.open(41, "local-audio", streamedAudioPath);
    assert.equal(cancelledStream.ok, true);
    assert.equal((await streamRegistry.read(41, cancelledStream.streamToken)).ok, true);
    assert.equal(await streamRegistry.release(41, cancelledStream.streamToken), true);
    assert.equal(streamRegistry.activeCount, 0, "cancel or parse failure cleanup releases a partial stream");
    assert.deepEqual(
      await streamRegistry.read(41, cancelledStream.streamToken),
      { ok: false, code: "file_reference_expired" }
    );

    const changingAudioPath = path.join(root, "changing.mp3");
    await fs.writeFile(changingAudioPath, Buffer.alloc(DEFAULT_IMPORT_FILE_STREAM_CHUNK_BYTES + 1, 7));
    const changingStream = await streamRegistry.open(41, "local-audio", changingAudioPath);
    assert.equal(changingStream.ok, true);
    assert.equal((await streamRegistry.read(41, changingStream.streamToken)).ok, true);
    await fs.appendFile(changingAudioPath, Buffer.from([8]));
    assert.deepEqual(
      await streamRegistry.read(41, changingStream.streamToken),
      { ok: false, code: "file_changed_during_read" },
      "metadata changes on the stable handle fail before renderer parsing"
    );
    assert.equal(streamRegistry.activeCount, 0);

    assert.deepEqual(
      await streamRegistry.open(41, "local-audio", "relative.mp3"),
      { ok: false, code: "invalid_path" },
      "renderer input can never turn a relative or traversal path into a stream"
    );
    assert.deepEqual(
      await streamRegistry.open(41, "manual-cover", streamedAudioPath),
      { ok: false, code: "unsupported_file_kind" },
      "the bounded stream surface is restricted to local audio"
    );

    const senderStreamOne = await streamRegistry.open(41, "local-audio", streamedAudioPath);
    const senderStreamTwo = await streamRegistry.open(41, "local-audio", streamedAudioPath);
    assert.equal(senderStreamOne.ok && senderStreamTwo.ok, true);
    assert.equal(await streamRegistry.releaseSender(41), 2);
    assert.equal(streamRegistry.activeCount, 0, "renderer destruction cleans every sender-owned handle");

    let boundedTokenId = 0;
    const boundedRegistry = new ImportHistoryFileStreamRegistry({
      maxStreamsPerSender: 1,
      createToken: () => `bounded-stream-${++boundedTokenId}`
    });
    assert.equal((await boundedRegistry.open(9, "local-audio", streamedAudioPath)).ok, true);
    assert.deepEqual(
      await boundedRegistry.open(9, "local-audio", streamedAudioPath),
      { ok: false, code: "too_many_open_files" }
    );
    assert.equal(await boundedRegistry.releaseSender(9), 1);

    let expiryNow = 1_000;
    const expiringRegistry = new ImportHistoryFileStreamRegistry({
      now: () => expiryNow,
      ttlMs: 10,
      createToken: () => "expiring-stream-token",
      scheduleExpiry: () => () => undefined
    });
    const expiringStream = await expiringRegistry.open(7, "local-audio", streamedAudioPath);
    assert.equal(expiringStream.ok, true);
    expiryNow += 11;
    assert.equal(await expiringRegistry.pruneExpired(), 1);
    assert.equal(expiringRegistry.activeCount, 0, "abandoned stream capabilities expire and close their handles");

    const stableAudioPath = path.join(root, "stable.mp3");
    await fs.writeFile(stableAudioPath, Buffer.from([1, 2, 3, 4]));
    const stableRead = await readValidatedImportFile("local-audio", stableAudioPath);
    assert.equal(stableRead.ok, true);
    assert.deepEqual([...stableRead.bytes], [1, 2, 3, 4], "replay reads bytes through the validated file handle");

    let statCall = 0;
    const racedRead = await readValidatedImportFile("local-audio", path.resolve("raced.mp3"), {
      fs: {
        open: async () => ({
          stat: async () => statCall++ === 0
            ? { size: 3, mtimeMs: 1, isFile: () => true }
            : { size: 4, mtimeMs: 2, isFile: () => true },
          read: async (buffer, _offset, _length, position) => {
            if (position >= 3) return { bytesRead: 0, buffer };
            Buffer.from("abc").copy(buffer);
            return { bytesRead: 3, buffer };
          },
          close: async () => undefined
        })
      }
    });
    assert.deepEqual(racedRead, { ok: false, code: "file_changed_during_read" });

    const replayTarget = path.join(root, "app-data", "replay-commit-history.json");
    let replayId = 0;
    const replayStore = new ImportHistoryStore({
      filePath: replayTarget,
      now: () => ++now,
      createId: () => `replay-${++replayId}`
    });
    const oldPath = path.join(root, "old.mp3");
    const replacementPath = path.join(root, "replacement.mp3");
    const oldRecord = await replayStore.upsert(localCandidate(oldPath, "Old"), 10);
    await replayStore.upsert(localCandidate(replacementPath, "Replacement"), 10);
    assert.equal((await replayStore.stats()).total, 2);
    assert.equal((await replayStore.get(oldRecord.id)).source.path, oldPath, "relocation is not persisted before replay commit");
    assert.equal(await replayStore.commitReplay(oldRecord.id, {
      limit: 10,
      file: { path: replacementPath, fileName: "replacement.mp3", size: 4, mtimeMs: 2 }
    }), true);
    const replayCommitted = await replayStore.list({ offset: 0, limit: 10 });
    assert.equal(replayCommitted.total, 1, "relocation dedupe occurs atomically at replay commit");
    assert.equal(replayCommitted.records[0].id, oldRecord.id);
    assert.equal((await replayStore.get(oldRecord.id)).source.path, replacementPath);

    const transactionTarget = path.join(root, "app-data", "limit-transaction-history.json");
    const transactionStore = new ImportHistoryStore({
      filePath: transactionTarget,
      now: () => ++now,
      createId: () => `transaction-${++nextId}`
    });
    for (let index = 0; index < 6; index += 1) {
      await transactionStore.upsert(linkCandidate(500 + index), "unlimited");
    }
    let preferenceWrites = 0;
    const initialStats = await transactionStore.stats();
    await assert.rejects(
      transactionStore.applyLimitTransaction(5, {
        expectedVersion: "stale-version",
        confirmedTrimCount: 1
      }, async () => { preferenceWrites += 1; }),
      /history_confirmation_stale/
    );
    assert.equal(preferenceWrites, 0, "stale confirmation cannot write preferences or trim history");
    assert.equal((await transactionStore.stats()).total, 6);

    await assert.rejects(
      transactionStore.applyLimitTransaction(5, {
        expectedVersion: initialStats.version,
        confirmedTrimCount: 1
      }, async () => {
        preferenceWrites += 1;
        throw new Error("simulated preference failure");
      }),
      /simulated preference failure/
    );
    assert.equal((await transactionStore.stats()).total, 6, "preference failure restores the pre-trim history");
    assert.equal(JSON.parse(await fs.readFile(transactionTarget, "utf8")).records.length, 6);

    const restoredStats = await transactionStore.stats();
    const committedLimit = await transactionStore.applyLimitTransaction(5, {
      expectedVersion: restoredStats.version,
      confirmedTrimCount: 1
    }, async () => {
      preferenceWrites += 1;
      return "preferences-saved";
    });
    assert.deepEqual(committedLimit, { trimmed: 1, persisted: "preferences-saved" });
    assert.equal((await transactionStore.stats()).total, 5);

    const failingTransactionTarget = path.join(root, "app-data", "failing-limit-history.json");
    const sourceStore = new ImportHistoryStore({
      filePath: failingTransactionTarget,
      now: () => ++now,
      createId: () => `failing-transaction-${++nextId}`
    });
    for (let index = 0; index < 6; index += 1) {
      await sourceStore.upsert(linkCandidate(600 + index), "unlimited");
    }
    const historyWriteFailureFs = {
      ...fs,
      rename: async () => {
        const error = new Error("simulated history trim failure");
        error.code = "EACCES";
        throw error;
      }
    };
    const failingTransactionStore = new ImportHistoryStore({
      filePath: failingTransactionTarget,
      fs: historyWriteFailureFs
    });
    const failingStats = await failingTransactionStore.stats();
    let wrotePreferencesAfterHistoryFailure = false;
    await assert.rejects(
      failingTransactionStore.applyLimitTransaction(5, {
        expectedVersion: failingStats.version,
        confirmedTrimCount: 1
      }, async () => { wrotePreferencesAfterHistoryFailure = true; }),
      /simulated history trim failure/
    );
    assert.equal(wrotePreferencesAfterHistoryFailure, false, "preferences are not saved when history trim fails");
    assert.equal(JSON.parse(await fs.readFile(failingTransactionTarget, "utf8")).records.length, 6);

    const largeHistoryTarget = path.join(root, "app-data", "large-performance-history.json");
    const largeRecordCount = 20_000;
    const largeRecords = Array.from({ length: largeRecordCount }, (_, index) => normalizeImportHistoryRecord({
      ...linkCandidate(20_000 + index),
      id: `large-${index}`,
      createdAt: timestamp + index,
      lastUsedAt: timestamp + index
    }));
    assert.equal(largeRecords.every(Boolean), true);
    await fs.writeFile(
      largeHistoryTarget,
      `${JSON.stringify({ schemaVersion: IMPORT_HISTORY_SCHEMA_VERSION, records: largeRecords }, null, 2)}\n`,
      "utf8"
    );
    const performanceCounts = new Map();
    const observePerformance = ({ name }) => {
      performanceCounts.set(name, (performanceCounts.get(name) ?? 0) + 1);
    };
    let largeNow = timestamp + largeRecordCount;
    let largeId = 0;
    const largeStore = new ImportHistoryStore({
      filePath: largeHistoryTarget,
      now: () => ++largeNow,
      createId: () => `large-new-${++largeId}`,
      performanceObserver: observePerformance
    });
    const firstSearchStartedAt = performance.now();
    const firstLargeSearch = await largeStore.list({ offset: 0, limit: 24, query: "Song 39999" });
    const firstSearchMs = performance.now() - firstSearchStartedAt;
    const searchBuildsAfterFirst = performanceCounts.get("search-index-build") ?? 0;
    const repeatSearchStartedAt = performance.now();
    const repeatedLargeSearch = await largeStore.list({ offset: 0, limit: 24, query: "Song 39999" });
    const repeatSearchMs = performance.now() - repeatSearchStartedAt;
    assert.deepEqual(repeatedLargeSearch, firstLargeSearch, "cached search indexes preserve byte-equivalent public results");
    assert.equal(firstLargeSearch.total, 1);
    assert.equal(searchBuildsAfterFirst, largeRecordCount);
    assert.equal(
      performanceCounts.get("search-index-build"),
      searchBuildsAfterFirst,
      "repeated search performs zero duplicate per-record serialization"
    );
    assert.equal(performanceCounts.get("read"), 1, "concurrent store use shares one history read");
    assert.equal(performanceCounts.get("write") ?? 0, 0);
    assert.equal(performanceCounts.get("serialize") ?? 0, 0);

    const largeCrudStartedAt = performance.now();
    const insertedLargeRecords = await Promise.all([
      largeStore.upsert(linkCandidate(90_001), "unlimited"),
      largeStore.upsert(linkCandidate(90_002), "unlimited"),
      largeStore.upsert(linkCandidate(90_003), "unlimited")
    ]);
    assert.equal(await largeStore.remove(insertedLargeRecords[1].id), true);
    const largeCrudMs = performance.now() - largeCrudStartedAt;
    assert.equal((await largeStore.stats()).total, largeRecordCount + 2);
    assert.equal(performanceCounts.get("serialize"), 4, "each awaited mutation retains one durable serialization");
    assert.equal(performanceCounts.get("write"), 4, "each awaited mutation retains one atomic temp-file write");
    assert.equal(performanceCounts.get("dedupe-index-build"), largeRecordCount + 3);
    const durableLargeHistory = await fs.readFile(largeHistoryTarget, "utf8");
    const restartedLargeStore = new ImportHistoryStore({ filePath: largeHistoryTarget });
    const restartedLargeSearch = await restartedLargeStore.list({ offset: 0, limit: 24, query: "Song 39999" });
    assert.deepEqual(restartedLargeSearch, firstLargeSearch, "large-history search and order survive restart");
    assert.equal((await restartedLargeStore.stats()).total, largeRecordCount + 2);
    assert.equal(
      await fs.readFile(largeHistoryTarget, "utf8"),
      durableLargeHistory,
      "read-only restart does not rewrite or reformat the compatible JSON document"
    );
    console.log(JSON.stringify({
      importHistoryPerformance: {
        records: largeRecordCount,
        reads: performanceCounts.get("read"),
        serializations: performanceCounts.get("serialize"),
        writes: performanceCounts.get("write"),
        crudMs: Number(largeCrudMs.toFixed(2)),
        firstSearchMs: Number(firstSearchMs.toFixed(2)),
        repeatSearchMs: Number(repeatSearchMs.toFixed(2)),
        repeatedSearchIndexBuildsBefore: largeRecordCount,
        repeatedSearchIndexBuildsAfter: 0,
        threeUpsertDedupeBuildsBefore: 6 * largeRecordCount + 9,
        threeUpsertDedupeBuildsAfter: performanceCounts.get("dedupe-index-build")
      }
    }));

    const stable = new ImportHistoryStore({ filePath: target, now: () => ++now, createId: () => `stable-${++nextId}` });
    const stableRecord = await stable.upsert(linkCandidate(99), 10);
    const failingFs = {
      ...fs,
      rename: async () => {
        const error = new Error("simulated disk failure");
        error.code = "EACCES";
        throw error;
      }
    };
    const failing = new ImportHistoryStore({
      filePath: target,
      fs: failingFs,
      now: () => ++now,
      createId: () => `failed-${++nextId}`
    });
    await assert.rejects(failing.upsert(linkCandidate(100), 10), /simulated disk failure/);
    const afterFailure = await failing.list({ offset: 0, limit: 20 });
    assert.deepEqual(afterFailure.records.map((record) => record.id), [stableRecord.id], "failed writes do not mutate the in-memory committed store");

    const stableManual = await stable.createManualSave(
      manualSaveEnvelope(manualSaveCandidate("Stable manual", "before")),
      10
    );
    const failedManualUpdate = new ImportHistoryStore({
      filePath: target,
      fs: failingFs,
      now: () => ++now,
      createId: () => `failed-manual-${++nextId}`
    });
    await assert.rejects(
      failedManualUpdate.updateManualSave(
        stableManual.id,
        manualSaveEnvelope(manualSaveCandidate("Failed manual", "after")),
        10
      ),
      /simulated disk failure/
    );
    assert.equal((await failedManualUpdate.get(stableManual.id)).snapshot.lyrics, "before");
    assert.equal(
      JSON.parse(await fs.readFile(target, "utf8")).records.find((record) => record.id === stableManual.id).snapshot.lyrics,
      "before",
      "failed manual save updates do not pollute memory or disk"
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }

  console.log("import history schema v2, manual saves, normalization, limits, paths, and corrupt recovery tests passed");
}

function linkCandidate(index) {
  return {
    kind: "link",
    inputUrl: `https://music.163.com/song?id=${index}`,
    normalizedUrl: `https://music.163.com/song?id=${index}`,
    finalUrl: `https://music.163.com/song?id=${index}`,
    display: {
      title: `Song ${index}`,
      artist: "Artist",
      album: "Album",
      source: "netease",
      remoteCoverUrl: "https://example.com/cover.jpg"
    }
  };
}

function localCandidate(filePath, title) {
  return {
    kind: "local-audio",
    file: { path: filePath, fileName: path.basename(filePath), size: 4, mtimeMs: 1 },
    display: { title, artist: "Artist", album: "", source: "unknown" }
  };
}

function emptyManualSnapshot() {
  return {
    source: "unknown",
    title: "",
    artist: "",
    album: "",
    explicit: false,
    originalCoverUrl: "",
    coverUrl: "",
    originalUrl: "",
    finalUrl: "",
    parseMethod: "",
    lyrics: "",
    translationText: "",
    translationEnabled: false
  };
}

function manualSaveCandidate(title, lyrics) {
  return {
    snapshot: {
      ...emptyManualSnapshot(),
      source: "netease",
      title,
      artist: "Archive artist",
      album: "Archive album",
      explicit: true,
      originalCoverUrl: "https://example.com/original-cover.jpg#ignored",
      coverUrl: "https://example.com/cover.jpg",
      originalUrl: "https://music.163.com/song?id=123",
      finalUrl: "https://music.163.com/song?id=123#ignored",
      parseMethod: "manual-save-test",
      lyrics,
      translationText: "Translated lyrics",
      translationEnabled: true
    }
  };
}

function manualSnapshotAtUtf8Bytes(targetBytes) {
  const snapshot = {
    ...emptyManualSnapshot(),
    title: "Exact legal byte boundary",
    artist: "Boundary fixture"
  };
  let remaining = targetBytes - Buffer.byteLength(JSON.stringify(snapshot), "utf8");
  for (const field of ["lyrics", "translationText"]) {
    const threeByteCharacters = Math.min(120_000, Math.floor(remaining / 3));
    snapshot[field] = "界".repeat(threeByteCharacters);
    remaining -= threeByteCharacters * 3;
  }
  if (remaining > 0 && snapshot.translationText.length + remaining <= 120_000) {
    snapshot.translationText += "x".repeat(remaining);
    remaining = 0;
  }
  assert.equal(remaining, 0, "the legal string fields can represent the requested UTF-8 boundary");
  assert.equal(Buffer.byteLength(JSON.stringify(snapshot), "utf8"), targetBytes);
  return snapshot;
}

function manualSaveEnvelope(candidate) {
  return JSON.stringify({ version: 1, snapshot: candidate.snapshot });
}

function manualSaveCandidateWithUnknown(value) {
  const candidate = manualSaveCandidate("Rejected raw shape", "Safe lyrics");
  candidate.snapshot.unknownValue = value;
  return candidate;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
