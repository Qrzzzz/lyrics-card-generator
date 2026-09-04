const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { ImportHistoryStore } = require("../electron/import-history");

function snapshot(text, translation = "") {
  return {
    lyrics: text, translationText: translation, translationEnabled: Boolean(translation),
    lyricDocument: {
      schemaVersion: 2, id: "doc", revision: 0,
      blocks: [{ id: "block", units: [{ id: "unit", source: text.split("\n"), translation: translation.split("\n") }] }]
    }
  };
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lyrics-remote-history-"));
  const source = new ImportHistoryStore({ filePath: path.join(directory, "source.json") });
  const targetPath = path.join(directory, "target.json");
  const target = new ImportHistoryStore({ filePath: targetPath });
  const original = snapshot("\n  第一行 \t\n\n第二行🙂\n", "\n Translation \n\n最後\n");
  const candidate = {
    kind: "link", inputUrl: "https://music.163.com/song?id=12345",
    display: { title: "Song", artist: "Artist", source: "netease", remoteCoverUrl: "https://example.com/cover.jpg" },
    lyricsSnapshot: original
  };
  try {
    const record = await source.upsert(candidate, "unlimited");
    assert.equal(record.hasLyricsSnapshot, true);
    const first = await source.exportRemoteHistory(record.id);
    assert.equal(first.count, 1);
    assert.deepEqual(JSON.parse(first.json).records[0].lyricsSnapshot, original);
    assert.ok(!first.json.includes("cover.jpg"));
    assert.ok(!first.json.includes("remoteCoverUrl"));
    await source.upsert({ ...candidate, inputUrl: "https://music.163.com/song?id=678", lyricsSnapshot: undefined }, "unlimited");
    await source.upsert({ kind: "local-audio", file: { path: path.join(directory, "local.mp3"), size: 10, mtimeMs: 1 }, display: candidate.display }, "unlimited");
    const all = await source.exportRemoteHistory();
    assert.equal(all.count, 1);
    assert.equal(all.skipped, 1);
    assert.ok(!all.json.includes("local.mp3"));
    const missing = (await source.list({ limit: 10 })).records.find((item) => item.kind === "link" && !item.hasLyricsSnapshot);
    await assert.rejects(source.exportRemoteHistory(missing.id), { code: "missing_lyrics" });
    await assert.rejects(source.exportRemoteHistory("absent"), { code: "no_remote_history" });

    let preview = await target.previewRemoteHistory(first.json, "unlimited");
    assert.deepEqual({ ...preview, version: "" }, { added: 1, duplicates: 0, trimmed: 0, version: "" });
    await target.importRemoteHistory(first.json, preview.version, "unlimited");
    preview = await target.previewRemoteHistory(first.json, "unlimited");
    assert.equal(preview.duplicates, 1);
    assert.equal(preview.added, 0);
    const beforeDuplicate = await fs.readFile(targetPath, "utf8");
    await target.importRemoteHistory(first.json, preview.version, "unlimited");
    assert.equal(await fs.readFile(targetPath, "utf8"), beforeDuplicate);

    const edited = snapshot("Processed\n\n  final  \n", "Translation\n\n  最终  \n");
    await source.updateRemoteLyrics(record.id, edited);
    const changed = await source.exportRemoteHistory(record.id);
    preview = await target.previewRemoteHistory(changed.json, "unlimited");
    assert.equal(preview.added, 1, "different lyrics for the same song are retained separately");
    await target.importRemoteHistory(changed.json, preview.version, "unlimited");
    const restored = new ImportHistoryStore({ filePath: targetPath });
    const records = (await restored.list({ limit: 10 })).records;
    assert.equal(records.length, 2);
    assert.deepEqual((await restored.get(records[0].id)).lyricsSnapshot, edited);
    await restored.commitReplay(records[0].id, { limit: "unlimited" });
    assert.equal((await restored.stats()).total, 2, "replay does not collapse different imported lyric versions");
    const unicodeWhitespace = {
      lyrics: "\u00a0\nsource\n\u3000\n", translationText: "", translationEnabled: false,
      lyricDocument: { schemaVersion: 2, id: "unicode-doc", revision: 0,
        formatting: { sourcePrefix: "\u00a0\n", translationPrefix: "" },
        blocks: [{ id: "unicode-block", formatting: { sourcePresent: true, translationPresent: false,
          sourceSeparatorAfter: "\n\u3000\n", translationSeparatorAfter: "" },
        units: [{ id: "unicode-unit", source: ["source"] }] }] }
    };
    await source.updateRemoteLyrics(record.id, unicodeWhitespace);
    assert.deepEqual(JSON.parse((await source.exportRemoteHistory(record.id)).json).records[0].lyricsSnapshot, unicodeWhitespace);
    await source.updateRemoteLyrics(record.id, snapshot(""));
    assert.equal(JSON.parse((await source.exportRemoteHistory(record.id)).json).records[0].lyricsSnapshot.lyrics, "", "empty edited lyrics are preserved");

    const invalidSnapshot = { ...original, lyrics: original.lyrics + "mismatch" };
    await assert.rejects(source.updateRemoteLyrics(record.id, invalidSnapshot), { code: "invalid_snapshot" });
    await assert.rejects(source.updateRemoteLyrics("absent", original), { code: "not_found" });
    const localId = (await source.list({ source: "local-audio" })).records[0].id;
    await assert.rejects(source.updateRemoteLyrics(localId, original), { code: "invalid_kind" });
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, "lyrics", { enumerable: true, get() { getterCalls++; return "bad"; } });
    await assert.rejects(source.updateRemoteLyrics(record.id, accessor), { code: "invalid_snapshot" });
    assert.equal(getterCalls, 0);

    const baseline = await fs.readFile(targetPath, "utf8");
    const envelope = JSON.parse(first.json);
    const badInputs = ["{", "null", JSON.stringify({ ...envelope, version: 100 }),
      JSON.stringify({ ...envelope, records: [] }),
      JSON.stringify({ ...envelope, records: [...envelope.records, { kind: "local-audio", source: { path: "C:\\secret.mp3" } }] }),
      JSON.stringify({ ...envelope, records: [{ ...envelope.records[0], lyricsSnapshot: invalidSnapshot }] }),
      JSON.stringify({ ...envelope, records: [{ ...envelope.records[0], source: { inputUrl: "file:///C:/secret" } }] })];
    for (const text of badInputs) {
      await assert.rejects(async () => target.previewRemoteHistory(text), { code: "invalid_transfer" });
      await assert.rejects(async () => target.importRemoteHistory(text, "anything"), { code: "invalid_transfer" });
    }
    await assert.rejects(async () => target.previewRemoteHistory("界".repeat(6 * 1024 * 1024)), { code: "transfer_too_large" });
    assert.equal(await fs.readFile(targetPath, "utf8"), baseline, "invalid batch import is atomic");

    const reordered = JSON.parse(first.json);
    function reorder(value) {
      if (Array.isArray(value)) return value.map(reorder);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)]));
    }
    assert.equal((await target.previewRemoteHistory(JSON.stringify(reorder(reordered)), "unlimited")).duplicates, 1);

    const six = JSON.stringify({ ...envelope, records: Array.from({ length: 6 }, (_, index) => ({
      ...envelope.records[0], source: { inputUrl: `https://music.163.com/song?id=${900 + index}` }
    })) });
    preview = await target.previewRemoteHistory(six, 5);
    assert.equal(preview.added, 5);
    assert.equal(preview.trimmed, 3);
    await assert.rejects(target.importRemoteHistory(six, preview.version, 10), { code: "history_confirmation_stale" });
    await target.remove(records[1].id);
    await assert.rejects(target.importRemoteHistory(six, preview.version, 5), { code: "history_confirmation_stale" });
    preview = await target.previewRemoteHistory(six, 5);
    await target.importRemoteHistory(six, preview.version, 5);
    assert.equal((await target.stats()).total, 5);
    const nonePreview = await target.previewRemoteHistory(first.json, "none");
    assert.equal(nonePreview.added, 0);
    await target.importRemoteHistory(first.json, nonePreview.version, "none");
    assert.equal((await target.stats()).total, 5);

    let failWrite = false;
    const failureStore = new ImportHistoryStore({ filePath: path.join(directory, "failure.json"), fs: {
      ...fs, rename: async (...args) => { if (failWrite) throw Object.assign(new Error("disk full"), { code: "ENOSPC" }); return fs.rename(...args); }
    } });
    const saved = await failureStore.upsert(candidate, "unlimited");
    failWrite = true;
    await assert.rejects(failureStore.updateRemoteLyrics(saved.id, edited), { code: "ENOSPC" });
    assert.deepEqual((await failureStore.get(saved.id)).lyricsSnapshot, original);
    await source.remove(record.id);
    await assert.rejects(source.updateRemoteLyrics(record.id, edited), { code: "not_found" });
    console.log("remote history: lossless JSON, scope, variants, limits, stale previews, hostile inputs, disk failures and restart passed");
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
