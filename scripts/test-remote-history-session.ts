import assert from "node:assert/strict";
import { RemoteHistorySession } from "../lib/remote-history-session";
import { createLyricDocumentV2, isLyricDocumentV2, serializeLyricDocument } from "../lib/lyrics-document-v2";
import type { ImportHistoryWriteResult, RemoteLyricsSnapshot } from "../lib/import-history";

function snapshot(lyrics: string): RemoteLyricsSnapshot {
  return { lyrics, translationText: "", translationEnabled: false, lyricDocument: createLyricDocumentV2(lyrics) };
}
function success(id: string): ImportHistoryWriteResult {
  return { ok: true, record: { id, kind: "link", title: "Song", artist: "Artist", album: "", source: "netease", importedAt: 1, detail: "" } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function main() {
  const unicodeText = "\u00a0\noriginal\n\u3000\n";
  const unicodeDocument = createLyricDocumentV2(unicodeText);
  assert.equal(isLyricDocumentV2(unicodeDocument), true, "the formatter accepts Unicode blank lines produced by the parser");
  assert.equal(serializeLyricDocument(unicodeDocument).source, unicodeText);
  const writes: Array<{ id: string; snapshot: RemoteLyricsSnapshot }> = [];
  let warnings = 0;
  let fail = false;
  const session = new RemoteHistorySession(async (id, value) => {
    if (fail) return { ok: false, code: "history_write_failed" };
    writes.push({ id, snapshot: value });
    return success(id);
  }, () => { warnings++; });
  const firstWrite = deferred<ImportHistoryWriteResult>();
  session.bind(firstWrite.promise, snapshot("Original A"), "https://example.com/a");
  const edited = snapshot("\n  Edited A\n\nlast\n");
  session.update(edited);
  edited.lyrics = "mutated caller object";
  session.bind(Promise.resolve(success("b")), snapshot("Original B"), "https://example.com/b");
  session.update(snapshot("Edited B"));
  firstWrite.resolve(success("a"));
  await session.flush();
  assert.equal(writes.find((item) => item.id === "a")?.snapshot.lyrics, "\n  Edited A\n\nlast\n");
  assert.equal(writes.find((item) => item.id === "b")?.snapshot.lyrics, "Edited B");
  assert.equal(session.ownsUrl("https://example.com/a"), false);
  assert.equal(session.ownsUrl("https://example.com/b"), true);
  const unchangedCount = writes.length;
  await session.flush();
  assert.equal(writes.length, unchangedCount);

  fail = true;
  session.update(snapshot("Retry me"));
  await assert.rejects(session.flush(), /history_write_failed/);
  assert.equal(warnings, 1);
  fail = false;
  await session.flush();
  assert.equal(writes.at(-1)?.snapshot.lyrics, "Retry me");
  session.remove("b");
  const removedCount = writes.length;
  session.update(snapshot("must not recreate"));
  await session.flush();
  assert.equal(writes.length, removedCount);

  const pending = deferred<ImportHistoryWriteResult>();
  session.bind(pending.promise, snapshot("New"), "https://example.com/c");
  session.update(snapshot("changed"));
  session.remove();
  pending.resolve(success("c"));
  await session.flush();
  assert.equal(writes.length, removedCount, "clear during a pending initial write does not resurrect history");

  const gate = deferred<void>();
  const slowWrites: string[] = [];
  const slow = new RemoteHistorySession(async (_id, value) => {
    slowWrites.push(value.lyrics);
    await gate.promise;
    return success("slow");
  }, () => { throw new Error("unexpected warning"); });
  slow.bind(Promise.resolve(success("slow")), snapshot("initial"), "url");
  slow.update(snapshot("first edit"));
  await Promise.resolve();
  await Promise.resolve();
  slow.update(snapshot("latest edit"));
  slow.detach();
  gate.resolve();
  await slow.flush();
  assert.equal(slowWrites.at(-1), "latest edit");
  const recovered = new RemoteHistorySession(async (id) => success(id), () => undefined);
  recovered.bind(Promise.resolve({ ok: false, code: "history_write_failed" }), snapshot("failed automatic import"), "failed-url");
  await assert.rejects(recovered.flush(), /history_write_failed/);
  await recovered.flush({ ignoreUnrecordedFailures: true });
  recovered.bind(Promise.resolve(success("recovered")), snapshot("recovered import"), "recovered-url");
  recovered.update(snapshot("recovered edit"));
  await recovered.flush();
  console.log("remote history session: pending bindings, immutable edits, song switches, flush/retry and deletion passed");
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
