import assert from "node:assert/strict";
import { defaultState } from "../components/editor/editor-defaults";
import { evaluateMinimumExportSafety, type ExportDomSafety } from "../lib/export-safety";
import { createExportSnapshot } from "../lib/export-snapshot";
import { ExportTransactionMutex, runExportTransaction } from "../lib/export-transaction";
import type { AppState } from "../lib/types";

const readyDom: ExportDomSafety = {
  isCardMounted: true,
  areFontsReady: true,
  isCardSizeStable: true,
  isAutoHeightStable: true,
  hasContentOverflow: false
};

{
  const live: AppState = {
    ...defaultState,
    song: { ...defaultState.song, title: "Snapshot Song", artist: "Before" },
    lyrics: "old lyrics",
    style: { ...defaultState.style, width: 1200, height: 1800 }
  };
  const snapshot = createExportSnapshot(live, 2, 42);
  live.song.title = "Mutated Song";
  live.lyrics = "new lyrics";
  live.style.width = 640;
  assert.equal(snapshot.song.title, "Snapshot Song");
  assert.equal(snapshot.lyrics, "old lyrics");
  assert.equal(snapshot.width, 1200);
  assert.equal(snapshot.fileName, "lyric-card-Snapshot-Song.png");
  assert.equal(snapshot.revision, 42);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.song), true);
  assert.equal(Object.isFrozen(snapshot.style), true);
}

{
  const lines = (count: number) => Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n");
  const state36 = { ...defaultState, lyrics: lines(36), style: { ...defaultState.style } };
  const state37 = { ...state36, lyrics: lines(37) };
  assert.equal(evaluateMinimumExportSafety(state36, readyDom).blockingReason, null);
  assert.equal(evaluateMinimumExportSafety(state37, readyDom).blockingReason, "lyrics-limit");
  assert.equal(evaluateMinimumExportSafety(state36, { ...readyDom, areFontsReady: false }).blockingReason, "fonts-loading");
  assert.equal(evaluateMinimumExportSafety(state36, { ...readyDom, isCardSizeStable: false }).blockingReason, "card-measuring");
  assert.equal(evaluateMinimumExportSafety(state36, { ...readyDom, hasContentOverflow: true }).blockingReason, "content-overflow");
}

async function concurrencyTest() {
  const mutex = new ExportTransactionMutex();
  const snapshot = createExportSnapshot(defaultState, 1, 1);
  let releaseCapture!: () => void;
  const captureGate = new Promise<void>((resolve) => { releaseCapture = resolve; });
  let captureCount = 0;
  let unmountCount = 0;
  const options = {
    mutex,
    snapshot,
    mountSnapshot: async () => ({ node: true }),
    validateSnapshot: () => null,
    captureSnapshot: async () => {
      captureCount += 1;
      await captureGate;
    },
    unmountSnapshot: () => { unmountCount += 1; }
  };

  const first = runExportTransaction(options);
  const second = runExportTransaction(options);
  assert.deepEqual(await second, { ok: false, kind: "busy" });
  assert.equal(captureCount, 1, "same-turn calls must start only one capture");
  releaseCapture();
  assert.deepEqual(await first, { ok: true });
  assert.equal(unmountCount, 1);
}

void concurrencyTest().then(() => {
  console.log("export snapshot and concurrency tests passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
