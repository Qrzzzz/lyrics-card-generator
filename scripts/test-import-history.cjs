const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  IMPORT_HISTORY_SCHEMA_VERSION,
  ImportHistoryStore,
  importHistoryDedupeKey,
  normalizeImportHistoryDocument,
  normalizeImportHistoryLimit,
  normalizeImportHistoryRecord,
  readValidatedImportFile,
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
      translationEnabled: false
    }
  });
  assert.ok(coverOnly, "a successfully saved cover-only document is valid history");

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
    const firstManual = await manualStore.createManualSave(manualSaveCandidate("Same title", "First lyrics"), "unlimited");
    const firstCreatedAt = (await manualStore.get(firstManual.id)).createdAt;
    const secondManual = await manualStore.createManualSave(manualSaveCandidate("Same title", "Second lyrics"), "unlimited");
    assert.notEqual(firstManual.id, secondManual.id);
    assert.equal((await manualStore.stats()).total, 2, "same-title manual saves coexist without dedupe");

    const updatedManual = await manualStore.updateManualSave(
      firstManual.id,
      manualSaveCandidate("Updated title", "Updated lyrics"),
      "unlimited"
    );
    const updatedInternal = await manualStore.get(firstManual.id);
    const updatedList = await manualStore.list({ offset: 0, limit: 10 });
    assert.equal(updatedManual.id, firstManual.id);
    assert.equal(updatedInternal.createdAt, firstCreatedAt, "manual save updates retain createdAt");
    assert.ok(updatedInternal.lastUsedAt > firstCreatedAt, "manual save updates advance lastUsedAt");
    assert.equal(updatedList.records[0].id, firstManual.id, "updated manual saves move to the top");
    assert.equal(updatedList.total, 2, "manual save updates do not change the total");

    await assert.rejects(
      manualStore.updateManualSave("missing-record", manualSaveCandidate("Missing", "lyrics"), 10),
      (error) => error?.code === "not_found"
    );
    const ordinary = await manualStore.upsert(linkCandidate(777), "unlimited");
    await assert.rejects(
      manualStore.updateManualSave(ordinary.id, manualSaveCandidate("Wrong kind", "lyrics"), 10),
      (error) => error?.code === "invalid_kind"
    );
    await assert.rejects(
      manualStore.upsert({ kind: "manual-save", ...manualSaveCandidate("Bypass", "lyrics") }, 10),
      (error) => error?.code === "invalid_kind"
    );
    await assert.rejects(
      manualStore.createManualSave({ snapshot: emptyManualSnapshot() }, 10),
      (error) => error?.code === "invalid_snapshot"
    );
    await assert.rejects(
      manualStore.createManualSave(manualSaveCandidate("Oversized", "x".repeat(120_001)), 10),
      (error) => error?.code === "invalid_snapshot"
    );
    await assert.rejects(
      manualStore.createManualSave({
        snapshot: {
          ...emptyManualSnapshot(),
          title: "Record byte ceiling",
          lyrics: "界".repeat(120_000),
          translationText: "界".repeat(120_000)
        }
      }, 10),
      (error) => error?.code === "invalid_snapshot"
    );
    await assert.rejects(
      manualStore.createManualSave({
        snapshot: {
          ...emptyManualSnapshot(),
          title: "Oversized unknown object",
          lyrics: "Safe lyrics",
          style: { embeddedImage: `data:image/png;base64,${"A".repeat(600_000)}` }
        }
      }, 10),
      (error) => error?.code === "invalid_snapshot",
      "large unknown snapshot objects are rejected before whitelist projection"
    );

    const sanitizedManual = await manualStore.createManualSave({
      snapshot: {
        ...emptyManualSnapshot(),
        title: "Sanitized manual save",
        lyrics: "Safe semantic content",
        originalCoverUrl: "https://covers.example/manual.jpg?token=SECRET_TOKEN#private",
        coverUrl: "https://covers.example/fallback.jpg?api_key=SECRET_API_KEY",
        originalUrl: "https://music.163.com/song?id=42&token=SECRET_TOKEN",
        finalUrl: "https://user:password@example.com/private",
        parseMethod: "C:/Users/private/parser",
        proxiedCoverUrl: "https://proxy.invalid/private",
        apiKey: "SECRET_API_KEY",
        localPath: "C:\\Users\\private\\song.mp3",
        style: { backgroundImage: "data:image/png;base64,SECRET_STYLE" }
      }
    }, "unlimited");
    const sanitizedSnapshot = (await manualStore.get(sanitizedManual.id)).snapshot;
    assert.equal(sanitizedSnapshot.originalCoverUrl, "https://covers.example/manual.jpg");
    assert.equal(sanitizedSnapshot.coverUrl, "https://covers.example/fallback.jpg");
    assert.equal(sanitizedSnapshot.originalUrl, "https://music.163.com/song");
    assert.equal(sanitizedSnapshot.finalUrl, "");
    assert.equal(sanitizedSnapshot.parseMethod, "");
    assert.doesNotMatch(
      JSON.stringify(await manualStore.get(sanitizedManual.id)),
      /SECRET_|blob:|data:image|file:\/\/|C:\\\\Users|proxiedCoverUrl|apiKey|localPath|backgroundImage/
    );
    const backslashMethod = await manualStore.createManualSave({
      snapshot: {
        ...emptyManualSnapshot(),
        title: "Backslash parse method",
        lyrics: "Safe semantic content",
        parseMethod: "C:\\Users\\private\\parser"
      }
    }, "unlimited");
    assert.equal((await manualStore.get(backslashMethod.id)).snapshot.parseMethod, "");
    const validMethod = await manualStore.createManualSave({
      snapshot: {
        ...emptyManualSnapshot(),
        title: "Valid parse method",
        lyrics: "Safe semantic content",
        parseMethod: "manual-save_test.v2"
      }
    }, "unlimited");
    assert.equal((await manualStore.get(validMethod.id)).snapshot.parseMethod, "manual-save_test.v2");

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
        created.push(await limitStore.createManualSave(manualSaveCandidate(`Limit ${index}`, `Lyrics ${index}`), limit));
      }
      assert.equal((await limitStore.stats()).total, expectedTotal, `${limit} trims manual save creates correctly`);
      const retained = (await limitStore.list({ offset: 0, limit: 50 })).records.at(-1);
      const beforeUpdateTotal = (await limitStore.stats()).total;
      await limitStore.updateManualSave(retained.id, manualSaveCandidate("Moved to top", "updated"), limit);
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

    const stableManual = await stable.createManualSave(manualSaveCandidate("Stable manual", "before"), 10);
    const failedManualUpdate = new ImportHistoryStore({
      filePath: target,
      fs: failingFs,
      now: () => ++now,
      createId: () => `failed-manual-${++nextId}`
    });
    await assert.rejects(
      failedManualUpdate.updateManualSave(stableManual.id, manualSaveCandidate("Failed manual", "after"), 10),
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
