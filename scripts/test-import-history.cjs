const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  ImportHistoryStore,
  importHistoryDedupeKey,
  normalizeImportHistoryDocument,
  normalizeImportHistoryLimit,
  normalizeImportHistoryRecord,
  validateImportFileDescriptor,
  withHistoryLimit
} = require("../electron/import-history");

async function main() {
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

  assert.deepEqual(validateImportFileDescriptor(
    "local-audio",
    path.resolve("C:\\Music\\song.mp3"),
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
  assert.equal(normalizedDocument.records.length, 1, "normalization drops invalid and duplicate records");
  assert.equal(normalizeImportHistoryDocument({ schemaVersion: 99, records: [] }), null);
  assert.equal(withHistoryLimit({ schemaVersion: 1, records: Array(12).fill(link) }, 5).records.length, 5);
  assert.equal(withHistoryLimit({ schemaVersion: 1, records: Array(12).fill(link) }, 10).records.length, 10);
  assert.equal(withHistoryLimit({ schemaVersion: 1, records: Array(12).fill(link) }, "unlimited").records.length, 12);

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
    assert.deepEqual(persisted, { schemaVersion: 1, records: [] }, "store persists schema-versioned UTF-8 JSON");

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

    await fs.writeFile(target, "{ definitely not JSON", "utf8");
    const recovered = new ImportHistoryStore({ filePath: target, now: () => timestamp });
    const recoveredList = await recovered.list({ offset: 0, limit: 24 });
    assert.equal(recoveredList.total, 0);
    assert.equal(recoveredList.notice?.code, "corrupt_recovered");
    assert.match(recoveredList.notice?.backupFileName ?? "", /^import-history\.corrupt-.*\.json$/);
    const files = await fs.readdir(path.dirname(target));
    assert.ok(files.some((file) => /^import-history\.corrupt-.*\.json$/.test(file)), "corrupt source is retained as a timestamped backup");
    assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), { schemaVersion: 1, records: [] });

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
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }

  console.log("import history store, normalization, dedupe, limits, paths, and corrupt recovery tests passed");
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
