import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, utimes, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { defaultState } from "../components/editor/editor-defaults";
import { createEditorDraftSnapshot } from "../lib/editor-draft";

const require = createRequire(import.meta.url);
const { ImportHistoryStore } = require("../electron/import-history");
const { EditorDraftAssets, ORPHAN_RETENTION_MS } = require("../electron/editor-draft");

async function main() {
  const root = await mkdtemp(path.join(tmpdir(), "draft-lifecycle-"));
  const snapshot = createEditorDraftSnapshot(defaultState, { step: 1, exportFormat: "png", exportQuality: "high" });
  try {
    for (const limit of [5, 10, "none", "unlimited"]) {
      const filePath = path.join(root, `limit-${limit}.json`);
      const store = new ImportHistoryStore({ filePath });
      for (let i = 0; i < 12; i++) await store.upsert({ kind: "search", query: `song ${i}`, platform: "netease",
        songId: String(10000 + i), display: { title: `song ${i}`, artist: "artist", source: "netease" } }, "unlimited");
      const lease = await store.beginEditorDraft();
      await store.saveEditorDraft(lease.recordId, lease.token, 1, JSON.stringify(snapshot));
      const before = await readFile(filePath, "utf8");
      const confirmation = { expectedVersion: (await store.stats()).version,
        confirmedTrimCount: limit === "unlimited" ? 0 : 12 - (limit === "none" ? 0 : Number(limit)) };
      await assert.rejects(store.applyLimitTransaction(limit, confirmation, async () => { throw new Error("preferences failed"); }));
      assert.equal(await readFile(filePath, "utf8"), before, "failed settings transaction restores the entire document");
      assert.equal((await new ImportHistoryStore({ filePath }).getActiveEditorDraft()).id, lease.recordId);
      const result = await store.applyLimitTransaction(limit, confirmation, async () => ({ limit }));
      assert.equal(result.trimmed, confirmation.confirmedTrimCount);
      assert.equal((await new ImportHistoryStore({ filePath }).getActiveEditorDraft()).id, lease.recordId);
      await store.remove(lease.recordId);
      assert.equal(await new ImportHistoryStore({ filePath }).getActiveEditorDraft(), null);
    }

    const directory = path.join(root, "draft-covers");
    const assets = new EditorDraftAssets(directory);
    const filePath = path.join(root, "assets.json");
    const store = new ImportHistoryStore({ filePath, draftAssets: assets });
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const old = new Date(Date.now() - ORPHAN_RETENTION_MS - 60000);
    const age = (id: string) => utimes(path.join(directory, id), old, old);
    const asset = await store.saveEditorDraftCover(png);
    const first = await store.beginEditorDraft();
    const second = await store.beginEditorDraft();
    for (const lease of [first, second]) await store.saveEditorDraft(lease.recordId, lease.token, 1,
      JSON.stringify({ ...snapshot, coverAsset: asset, formCoverAsset: asset }));
    await age(asset);
    await store.remove(first.recordId);
    assert.equal(await assets.read(asset), png, "shared reference survives deletion");
    await store.saveEditorDraft(second.recordId, second.token, 2, JSON.stringify(snapshot));
    assert.equal(await assets.read(asset), png, "previous draft in recovery backup retains its cover");
    await store.saveEditorDraft(second.recordId, second.token, 3, JSON.stringify(snapshot));
    await assert.rejects(assets.read(asset), { code: "ENOENT" }, "replacement retires old cover after backup rotates");

    await store.saveEditorDraftCover(png);
    await store.clear();
    assert.equal(await assets.read(asset), png, "in-flight image gets a bounded grace period");
    await age(asset);
    // Re-saving a still-open local cover renews the grace period even if the ID is identical.
    await store.saveEditorDraftCover(png);
    await store.collectDraftAssets();
    assert.equal(await assets.read(asset), png);
    await age(asset);
    const partial = `${asset}.tmp-12345678-1234-1234-1234-123456789abc`;
    await writeFile(path.join(directory, partial), "interrupted");
    await age(partial);
    await writeFile(path.join(directory, "unrelated.txt"), "keep");
    await new ImportHistoryStore({ filePath, draftAssets: assets }).initialize();
    assert.deepEqual(await readdir(directory), ["unrelated.txt"], "restart clears expired orphans and interrupted writes only");
    const suspended = await store.beginEditorDraft();
    await assert.rejects(store.saveEditorDraft(suspended.recordId, suspended.token, 1,
      JSON.stringify({ ...snapshot, coverAsset: asset })), { code: "ENOENT" }, "suspended writers cannot commit a collected image");
    assert.equal((await store.stats()).total, 0);
    await store.saveEditorDraftCover(png);
    await store.saveEditorDraft(suspended.recordId, suspended.token, 1, JSON.stringify({ ...snapshot, coverAsset: asset }));
    assert.equal((await store.getActiveEditorDraft()).editorDraft.coverAsset, asset, "same revision retries after recreating its asset");
    await age(asset);
    await store.clear();
    await assert.rejects(assets.read(asset), { code: "ENOENT" }, "clear releases both primary and recovery references");

    await store.saveEditorDraftCover(png);
    await age(asset);
    await writeFile(`${filePath}.bak`, "{broken");
    await store.collectDraftAssets();
    assert.equal(await assets.read(asset), png, "unreadable recovery evidence fails closed");
  } finally {
    assert.equal(path.dirname(root), tmpdir());
    await rm(root, { recursive: true, force: true });
  }
  console.log("draft lifecycle: settings trim/restart/rollback, shared covers, recovery rotation, grace renewal and orphan cleanup passed");
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
