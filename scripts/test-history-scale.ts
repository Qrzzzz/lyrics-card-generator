import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { createEditorDraftSnapshot, editorDraftChangeKey } from "../lib/editor-draft";
import { defaultState } from "../components/editor/editor-defaults";
import { EditorAutosave } from "../lib/persistence/editor-autosave";
const require = createRequire(import.meta.url);
const { ImportHistoryStore, withHistoryLimit } = require("../electron/import-history");
const { readHistoryJson, hasRemovedHistoryRecords } = require("../electron/history-budget");

async function main() {
  const root = await fs.mkdtemp(path.join(tmpdir(), "history-scale-"));
  const reports: unknown[] = [];
  const snapshot = createEditorDraftSnapshot(defaultState, { step: 1, exportFormat: "png", exportQuality: "high" });
  try {
    const seedPath = path.join(root, "seed.json");
    const seed = new ImportHistoryStore({ filePath: seedPath });
    const lease = await seed.beginEditorDraft();
    await seed.saveEditorDraft(lease.recordId, lease.token, 1, JSON.stringify(snapshot));
    const document = JSON.parse(await fs.readFile(seedPath, "utf8"));
    const record = document.records[0];
    for (const count of [10, 100, 1000]) {
      const records = Array.from({ length: count }, (_, i) => ({ ...record, id: `scale-${i}` }));
      const filePath = path.join(root, `${count}.json`);
      const stored = { ...document, activeDraftId: records[0].id, records };
      await fs.writeFile(filePath, JSON.stringify(stored, null, 2) + "\n");
      await fs.writeFile(`${filePath}.bak`, JSON.stringify(stored));
      const counters = new Map<string, number>();
      const bytes = new Map<string, number>();
      const observer = ({ name: event, bytes: size }: { name: string; bytes?: number }) => {
        counters.set(event, (counters.get(event) ?? 0) + 1);
        if (size !== undefined) bytes.set(event, (bytes.get(event) ?? 0) + size);
      };
      const store = new ImportHistoryStore({ filePath, performanceObserver: observer });
      const readAt = performance.now();
      await store.list({ limit: 1 });
      const readMs = performance.now() - readAt;
      assert.equal(counters.get("read"), 1);
      assert.equal(counters.get("write") ?? 0, 0, "canonical old schema is read without rewriting");
      const owned = await store.beginEditorDraft(records[0].id);
      const writeAt = performance.now();
      await store.saveEditorDraft(owned.recordId, owned.token, 1, JSON.stringify(snapshot));
      const responseMs = performance.now() - writeAt;
      assert.equal(counters.get("deletion-index"), count);
      assert.equal(counters.get("deletion-check"), count);
      assert.equal(counters.get("write"), 1);
      assert.equal(counters.get("backup-write"), 1);
      assert.equal((await store.list({ limit: 1 })).total, count, "saving never evicts long-lived drafts");
      assert.equal(withHistoryLimit(stored, 5).records.length, count);
      assert.equal((await new ImportHistoryStore({ filePath }).getActiveEditorDraft()).id, records[0].id);
      reports.push({ drafts: count, readMs, saveResponseMs: responseMs, visits: Object.fromEntries(counters), bytes: Object.fromEntries(bytes) });
    }
    let visits = 0;
    const many = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }));
    assert.equal(hasRemovedHistoryRecords(many, many.slice(0, -1), () => visits++), true);
    assert.equal(visits, 1999, "worst-case deletion uses one index and one membership pass");

    // A small injected budget exercises both primary and backup guards without
    // filling disk. No corrupt recovery, migration or cover collection runs.
    const oversizedPath = path.join(root, "oversized.json");
    const oversized = JSON.stringify({ ...document, padding: "x".repeat(8192) });
    await fs.writeFile(oversizedPath, oversized);
    await fs.writeFile(`${oversizedPath}.bak`, JSON.stringify(document));
    const beforeBackup = await fs.readFile(`${oversizedPath}.bak`, "utf8");
    const limited = new ImportHistoryStore({ filePath: oversizedPath, maximumDocumentBytes: 4096 });
    await assert.rejects(limited.list(), { code: "history_storage_limit" });
    await assert.rejects(limited.clear(), { code: "history_storage_limit" });
    assert.equal(await fs.readFile(oversizedPath, "utf8"), oversized);
    assert.equal(await fs.readFile(`${oversizedPath}.bak`, "utf8"), beforeBackup);
    await fs.writeFile(oversizedPath, "broken JSON");
    await fs.writeFile(`${oversizedPath}.bak`, oversized);
    await assert.rejects(new ImportHistoryStore({ filePath: oversizedPath, maximumDocumentBytes: 4096 }).list(), { code: "history_storage_limit" });
    assert.equal(await fs.readFile(oversizedPath, "utf8"), "broken JSON", "oversized backup never moves the primary into corrupt recovery");
    assert.equal(await fs.readFile(`${oversizedPath}.bak`, "utf8"), oversized);

    const writePath = path.join(root, "write-budget.json");
    await fs.writeFile(writePath, JSON.stringify(document));
    await fs.writeFile(`${writePath}.bak`, JSON.stringify(document));
    const store = new ImportHistoryStore({ filePath: writePath, maximumDocumentBytes: Buffer.byteLength(JSON.stringify(document, null, 2)) + 256 });
    const owned = await store.beginEditorDraft(lease.recordId);
    const oldPrimary = await fs.readFile(writePath, "utf8");
    const oldBackup = await fs.readFile(`${writePath}.bak`, "utf8");
    const large = structuredClone(snapshot);
    large.style.watermark = "a".repeat(2000);
    await assert.rejects(store.saveEditorDraft(owned.recordId, owned.token, 1, JSON.stringify(large)), { code: "history_storage_limit" });
    assert.equal(await fs.readFile(writePath, "utf8"), oldPrimary);
    assert.equal(await fs.readFile(`${writePath}.bak`, "utf8"), oldBackup);
    await store.saveEditorDraft(owned.recordId, owned.token, 1, JSON.stringify(snapshot));
    assert.equal((await new ImportHistoryStore({ filePath: writePath }).getActiveEditorDraft()).id, lease.recordId, "failed budget write remains retryable");

    // Catch growth after stat: reading stops at cap + 1, before JSON.parse.
    let reads = 0;
    let closed = false;
    const growingFs = { open: async () => ({ stat: async () => ({ size: 1 }),
      read: async (buffer: Buffer) => { reads++; buffer.fill(120); return { bytesRead: buffer.length }; },
      close: async () => { closed = true; } }) };
    await assert.rejects(readHistoryJson(growingFs, "growing.json", 64), { code: "history_storage_limit" });
    assert.equal(reads, 1);
    assert.equal(closed, true);

    const nativeClone = globalThis.structuredClone;
    let clones = 0;
    globalThis.structuredClone = ((value: unknown) => { clones++; return nativeClone(value); }) as typeof structuredClone;
    try {
      let writes = 0;
      const autosave = new EditorAutosave({ key: editorDraftChangeKey, write: async () => { writes++; }, onStatus: () => {} });
      autosave.reset(snapshot);
      const baseline = clones;
      for (let i = 0; i < 100; i++) autosave.update({ ...snapshot, style: { ...snapshot.style, resolvedTextColor: String(i) } });
      await autosave.flush();
      assert.equal(clones, baseline, "render-only changes do not clone the lyric tree");
      assert.equal(writes, 0);
      autosave.update({ ...snapshot, style: { ...snapshot.style, watermark: "authored" } });
      await autosave.flush();
      assert.equal(clones, baseline + 1);
      assert.equal(writes, 1);
      autosave.dispose();
    } finally { globalThis.structuredClone = nativeClone; }
    await fs.mkdir("output/history-scale", { recursive: true });
    await fs.writeFile("output/history-scale/results.json", JSON.stringify({ format: 1, budgetBytes: 64 * 1024 * 1024, reports }, null, 2));
    console.log("History scale: 10/100/1000 drafts, linear visits, byte reports, bounded growth, retry and no-op clones passed.");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
