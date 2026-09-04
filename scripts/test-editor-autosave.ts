import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { EditorAutosave } from "../lib/persistence/editor-autosave";
import { createEditorDraftSnapshot, editorDraftChangeKey, restoreEditorDraft } from "../lib/editor-draft";
import { defaultState } from "../components/editor/editor-defaults";
import { withLyricPlainText } from "../lib/lyrics-document-state";

const require = createRequire(import.meta.url);
const { ImportHistoryStore } = require("../electron/import-history");
const { EditorDraftAssets } = require("../electron/editor-draft");
const settle = async () => { for (let index = 0; index < 15; index++) await Promise.resolve(); };

async function main() {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { run: () => void; at: number }>();
  const writes: string[] = [];
  let fail = false;
  const controller = new EditorAutosave({
    write: async (text: string) => { if (fail) throw new Error("disk_failed"); writes.push(text); },
    onStatus: () => undefined, now: () => now,
    schedule: ((run: () => void, delay: number) => { timers.set(++id, { run, at: now + delay }); return id; }) as unknown as typeof setTimeout,
    cancel: ((key: number) => timers.delete(key)) as unknown as typeof clearTimeout
  });
  const advance = async (ms: number) => {
    now += ms;
    for (const [key, timer] of [...timers]) if (timer.at <= now) { timers.delete(key); timer.run(); }
    await settle();
  };
  controller.reset("initial");
  controller.update("first edit");
  await advance(4999);
  assert.deepEqual(writes, []);
  controller.update("last edit");
  await advance(4999);
  assert.deepEqual(writes, []);
  await advance(1);
  assert.deepEqual(writes, ["last edit"]);
  assert.equal(controller.getStatus(), "saved");
  controller.markUnsaved();
  assert.equal(controller.getStatus(), "pending");
  await controller.flush();
  assert.equal(writes.at(-1), "last edit", "failed active-pointer persistence remains retryable without a new edit");
  controller.update("close before 5 seconds");
  await controller.flush();
  assert.equal(writes.at(-1), "close before 5 seconds");
  fail = true;
  controller.update("retryable initial write");
  await advance(5000);
  assert.equal(controller.getStatus(), "error");
  fail = false;
  await controller.flush();
  assert.equal(writes.at(-1), "retryable initial write");
  controller.update("deleted");
  controller.suspend();
  await controller.flush();
  await advance(5000);
  assert.notEqual(writes.at(-1), "deleted");
  controller.reset("new document");
  controller.update("new edit");
  controller.setEnabled(false);
  await controller.flush();
  assert.notEqual(writes.at(-1), "new edit");
  controller.setEnabled(true);
  await controller.flush();
  assert.equal(writes.at(-1), "new edit");
  controller.dispose();

  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const slowWrites: string[] = [];
  const slow = new EditorAutosave({ write: async (text: string) => { slowWrites.push(text); await gate; }, onStatus: () => undefined });
  slow.reset("initial");
  slow.update("old");
  const closing = slow.flush();
  slow.update("newest while saving");
  release();
  await closing;
  assert.deepEqual(slowWrites, ["old", "newest while saving"]);
  assert.equal(slow.getStatus(), "saved");
  slow.dispose();

  let rejectOld!: (error: Error) => void;
  const oldGate = new Promise<void>((_resolve, reject) => { rejectOld = reject; });
  const replacementWrites: string[] = [];
  const replaced = new EditorAutosave({ write: async (value: string) => {
    if (value === "old") await oldGate;
    else replacementWrites.push(value);
  }, onStatus: () => undefined });
  replaced.reset("old");
  replaced.update("old", true);
  const oldFlush = replaced.flush().catch(() => undefined);
  replaced.reset("replacement");
  replaced.update("latest replacement");
  const replacementFlush = replaced.flush();
  rejectOld(new Error("old session failed"));
  await Promise.all([oldFlush, replacementFlush]);
  assert.deepEqual(replacementWrites, ["latest replacement"]);
  assert.equal(replaced.getStatus(), "saved");
  replaced.dispose();

  const blank = createEditorDraftSnapshot(defaultState, { step: 0, exportFormat: "png", exportQuality: "high" });
  const measured = structuredClone(blank);
  measured.style.height += 300;
  measured.style.resolvedTextColor = "#fff";
  measured.style.instrumentalText = "Instrumental Track";
  assert.equal(editorDraftChangeKey(blank), editorDraftChangeKey(measured), "automatic measurement must not create an empty draft");
  measured.style.lyricFontSize += 1;
  assert.notEqual(editorDraftChangeKey(blank), editorDraftChangeKey(measured), "authored style changes are saved");

  const directory = await mkdtemp(path.join(tmpdir(), "lyrics-autosave-test-"));
  try {
    const filePath = path.join(directory, "history.json");
    const store = new ImportHistoryStore({ filePath });
    const state = withLyricPlainText({ ...defaultState, song: { ...defaultState.song, title: "  Draft title  ", album: "  Authored album  " },
      style: { ...defaultState.style, lyricFontSize: 77, layoutMode: "landscape", customTextColor: "#112233" } }, "\n  line one\n\n尾行🙂\n", "translation\n", true);
    const snapshot = createEditorDraftSnapshot(state, { step: 3, exportFormat: "webp", exportQuality: "medium",
      songInfoDraft: { source: "unknown", title: "unfinished form", artist: "artist" } });
    const lease = await store.beginEditorDraft();
    await store.saveEditorDraft(lease.recordId, lease.token, 1, JSON.stringify(snapshot));
    assert.equal((await store.list()).records[0].hasEditorDraft, true);
    assert.equal((await store.stats()).manualTotal, 1);
    await store.trim(5);
    const restarted = new ImportHistoryStore({ filePath });
    const active = await restarted.getActiveEditorDraft();
    assert.equal(active.id, lease.recordId);
    assert.equal(active.editorDraft.content.lyrics, state.lyrics);
    assert.equal(active.editorDraft.content.title, "  Draft title  ");
    assert.equal(active.editorDraft.content.album, "  Authored album  ");
    assert.equal(active.editorDraft.style.lyricFontSize, 77);
    assert.equal(active.editorDraft.view.songInfoDraft.title, "unfinished form");
    const restored = restoreEditorDraft(defaultState, { recordId: active.id, snapshot: active.editorDraft });
    assert.equal(restored.lyrics, state.lyrics);
    assert.equal(restored.style.lyricFontSize, 77);
    assert.equal(restored.style.layoutMode, "landscape");

    const remoteStore = new ImportHistoryStore({ filePath: path.join(directory, "remote.json") });
    const imported = await remoteStore.upsert({ kind: "search", query: "draft", platform: "netease", songId: "81234",
      display: { title: "draft", artist: "artist", source: "netease" } });
    const remoteLease = await remoteStore.beginEditorDraft(imported.id);
    await remoteStore.saveEditorDraft(imported.id, remoteLease.token, 1, JSON.stringify(snapshot));
    const exported = await remoteStore.exportRemoteHistory();
    const preview = await remoteStore.previewRemoteHistory(exported.json);
    assert.equal(preview.duplicates, 1, "remote JSON copy/paste deduplicates a local full draft");
    assert.equal(preview.added, 0);

    let failDelete = false;
    const failingStore = new ImportHistoryStore({ filePath: path.join(directory, "delete-failure.json"), fs: {
      ...fs, writeFile: async (...args: Parameters<typeof fs.writeFile>) => {
        if (failDelete) throw Object.assign(new Error("disk failure"), { code: "EIO" });
        return fs.writeFile(...args);
      }
    } });
    const durableLease = await failingStore.beginEditorDraft();
    await failingStore.saveEditorDraft(durableLease.recordId, durableLease.token, 1, JSON.stringify(snapshot));
    failDelete = true;
    await assert.rejects(failingStore.remove(durableLease.recordId));
    await assert.rejects(failingStore.clear());
    failDelete = false;
    await failingStore.saveEditorDraft(durableLease.recordId, durableLease.token, 2, JSON.stringify(snapshot));
    assert.equal((await failingStore.list()).total, 1, "failed deletion must not revoke the still-durable draft lease");

    const replacementLease = await store.beginEditorDraft(lease.recordId);
    await assert.rejects(store.saveEditorDraft(lease.recordId, lease.token, 2, JSON.stringify(snapshot)), { code: "stale_draft" });
    await store.saveEditorDraft(replacementLease.recordId, replacementLease.token, 1, JSON.stringify(snapshot));
    await assert.rejects(store.saveEditorDraft(replacementLease.recordId, replacementLease.token, 0, JSON.stringify(snapshot)), { code: "stale_draft" });
    await assert.rejects(store.saveEditorDraft(replacementLease.recordId, replacementLease.token, 2, JSON.stringify({ ...snapshot, coverAsset: "../private" })), { code: "invalid_snapshot" });
    await assert.rejects(store.saveEditorDraft(replacementLease.recordId, replacementLease.token, 2, JSON.stringify({ ...snapshot, style: { ...snapshot.style, lyricFontSize: "bad" } })), { code: "invalid_snapshot" });
    const savedBytes = await readFile(filePath, "utf8");
    assert.ok(!savedBytes.includes("extractedPalette"));
    assert.ok(!savedBytes.includes("landscapePlan"));
    await writeFile(filePath, "{broken");
    const recovered = new ImportHistoryStore({ filePath });
    assert.equal((await recovered.getActiveEditorDraft()).editorDraft.content.lyrics, state.lyrics);

    const covers = new EditorDraftAssets(path.join(directory, "covers"));
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const asset = await covers.save(png);
    assert.equal(await covers.read(asset), png);
    assert.equal(await covers.save(png), asset);
    await assert.rejects(covers.read("../../private"));
    await assert.rejects(covers.save("data:image/svg+xml;base64,PHN2Zz4="));
    const hydrated = await covers.hydrate(active.id, { ...snapshot, coverAsset: asset });
    assert.equal(hydrated.coverDataUrl, png);
    const removeLease = await recovered.beginEditorDraft(active.id);
    await recovered.remove(active.id);
    await assert.rejects(recovered.saveEditorDraft(active.id, removeLease.token, 1, JSON.stringify(snapshot)), { code: "stale_draft" });
    assert.equal(await recovered.getActiveEditorDraft(), null);
    assert.equal((await new ImportHistoryStore({ filePath }).list()).total, 0);
  } finally {
    assert.equal(path.dirname(directory), tmpdir());
    await rm(directory, { recursive: true, force: true });
  }
  console.log("editor autosave: 5s debounce, close flush, retries, in-flight edits, disabled/deleted states, full restart, stale leases, cover assets and corrupt recovery passed");
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
