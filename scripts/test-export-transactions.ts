import assert from "node:assert/strict";
import { defaultState } from "../components/editor/editor-defaults";
import { evaluateMinimumExportSafety, type ExportDomSafety } from "../lib/export-safety";
import {
  copyNodeAsPng,
  exportNodeAsImage,
  exportNodeAsPng,
  type CopyImageDependencies,
  type ExportImageDependencies
} from "../lib/export-image";
import {
  CLIPBOARD_IMAGE_PIXEL_LIMIT,
  EXPORT_CANVAS_DIMENSION_LIMIT,
  ClipboardRasterSizeLimitError,
  ExportRasterSizeLimitError,
  ExportRasterSizeMismatchError,
  getClipboardRasterSizeIssue,
  getExpectedExportRasterSize,
  getExportRasterSizeIssue
} from "../lib/export-dimensions";
import { createExportSnapshot } from "../lib/export-snapshot";
import {
  ImageClipboardUnavailableError,
  getPngDataUrlEncodedByteLength,
  writePngDataUrlToClipboard
} from "../lib/image-clipboard";
import { ExportTransactionMutex, runExportTransaction, waitForExportSnapshotNode } from "../lib/export-transaction";
import {
  createBlobUrlRetirementState,
  reconcileBlobUrlRetirement
} from "../lib/object-url-lifecycle";
import type { AppState } from "../lib/types";
import { withLyricSource } from "../lib/lyrics-document-state";

const readyDom: ExportDomSafety = {
  isCardMounted: true,
  areFontsReady: true,
  isCardSizeStable: true,
  isArtworkReady: true,
  isAutoWidthStable: true,
  isAutoHeightStable: true,
  hasContentOverflow: false
};

// Snapshots must detach export work from every subsequent live-editor mutation.
{
  let live: AppState = withLyricSource({
    ...defaultState,
    song: { ...defaultState.song, title: "Snapshot Song", artist: "Before" },
    style: { ...defaultState.style, width: 1200, height: 1800 }
  }, "old lyrics");
  const snapshot = createExportSnapshot(live, 2, 42);
  live.song.title = "Mutated Song";
  live = withLyricSource(live, "new lyrics");
  live.style.width = 640;
  assert.equal(snapshot.song.title, "Snapshot Song");
  assert.equal(snapshot.lyrics, "old lyrics");
  assert.equal(snapshot.width, 1200);
  assert.equal(snapshot.format, "png");
  assert.equal(snapshot.fileName, "lyric-card-Snapshot-Song.png");
  assert.equal(snapshot.revision, 42);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.song), true);
  assert.equal(Object.isFrozen(snapshot.style), true);
  assert.equal(Object.isFrozen(snapshot.lyricDocument), true);

  const webpSnapshot = createExportSnapshot(live, 1.4, 43, "webp");
  const jpgSnapshot = createExportSnapshot(live, 1, 44, "jpg");
  assert.equal(webpSnapshot.format, "webp");
  assert.equal(webpSnapshot.fileName, "lyric-card-Mutated-Song.webp");
  assert.equal(jpgSnapshot.format, "jpg");
  assert.equal(jpgSnapshot.fileName, "lyric-card-Mutated-Song.jpg");
}

{
  const lines = (count: number) => Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n");
  const state36 = withLyricSource({ ...defaultState, style: { ...defaultState.style } }, lines(36));
  const state37 = withLyricSource(state36, lines(37));
  assert.equal(evaluateMinimumExportSafety(state36, readyDom).blockingReason, null);
  assert.equal(evaluateMinimumExportSafety(state37, readyDom).blockingReason, "lyrics-limit");
  assert.equal(evaluateMinimumExportSafety(state36, { ...readyDom, areFontsReady: false }).blockingReason, "fonts-loading");
  assert.equal(evaluateMinimumExportSafety(state36, { ...readyDom, isCardSizeStable: false }).blockingReason, "card-measuring");
  assert.equal(evaluateMinimumExportSafety(state36, { ...readyDom, isArtworkReady: false }).blockingReason, "card-measuring");
  assert.equal(evaluateMinimumExportSafety(state36, { ...readyDom, hasContentOverflow: true }).blockingReason, "content-overflow");
}

async function concurrencyTest() {
  // Same-turn attempts contend for one mutex before either operation can await.
  const mutex = new ExportTransactionMutex();
  const snapshot = createExportSnapshot(defaultState, 1, 1);
  let releaseCapture!: () => void;
  const captureGate = new Promise<void>((resolve) => { releaseCapture = resolve; });
  let markCaptureStarted!: () => void;
  const captureStarted = new Promise<void>((resolve) => { markCaptureStarted = resolve; });
  let captureCount = 0;
  let unmountCount = 0;
  const options = {
    mutex,
    snapshot,
    mountSnapshot: async () => ({ node: true }),
    validateSnapshot: () => null,
    captureSnapshot: async () => {
      captureCount += 1;
      markCaptureStarted();
      await captureGate;
    },
    unmountSnapshot: () => { unmountCount += 1; }
  };

  const first = runExportTransaction(options);
  const second = runExportTransaction(options);
  assert.deepEqual(await second, { ok: false, kind: "busy" });
  await captureStarted;
  assert.equal(captureCount, 1, "same-turn calls must start only one capture");
  releaseCapture();
  assert.deepEqual(await first, { ok: true });
  assert.equal(unmountCount, 1);
}

function exportSnapshotProtectsBlobUrlTest() {
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const revokedUrls: string[] = [];
  URL.revokeObjectURL = (url) => {
    revokedUrls.push(url);
  };

  try {
    const snapshotCoverUrl = "blob:export-snapshot";
    const live: AppState = {
      ...defaultState,
      song: { ...defaultState.song, coverUrl: snapshotCoverUrl }
    };
    const snapshot = createExportSnapshot(live, 1, 9);
    const retirement = createBlobUrlRetirementState(live.song.coverUrl);

    assert.deepEqual(
      reconcileBlobUrlRetirement(retirement, "blob:live-next", snapshot.song.coverUrl),
      [],
      "an active export snapshot keeps its old local cover alive after the document changes"
    );
    assert.deepEqual(
      reconcileBlobUrlRetirement(retirement, "blob:live-latest", snapshot.song.coverUrl),
      ["blob:live-next"],
      "superseded live covers that are not in the snapshot can retire immediately"
    );
    assert.deepEqual(revokedUrls, ["blob:live-next"]);
    assert.deepEqual(
      reconcileBlobUrlRetirement(retirement, "blob:live-latest"),
      [snapshotCoverUrl],
      "the frozen cover retires only after the export snapshot unmounts"
    );
    assert.deepEqual(revokedUrls, ["blob:live-next", snapshotCoverUrl]);
    assert.equal(revokedUrls.includes("blob:live-latest"), false, "the current live cover remains usable");
  } finally {
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
}

async function timeoutReleasesMutexTest() {
  const mutex = new ExportTransactionMutex();
  const snapshot = createExportSnapshot(defaultState, 1, 2);
  let unmountCount = 0;
  const timedOut = await runExportTransaction({
    mutex,
    snapshot,
    mountSnapshot: async () => new Promise<never>(() => {}),
    validateSnapshot: () => null,
    captureSnapshot: async () => {},
    unmountSnapshot: () => { unmountCount += 1; },
    timeoutMs: 20
  });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.ok ? null : timedOut.kind, "error");
  assert.equal(unmountCount, 1, "a timed-out export must unmount its snapshot");

  let captureCount = 0;
  const retry = await runExportTransaction({
    mutex,
    snapshot,
    mountSnapshot: async () => ({ node: true }),
    validateSnapshot: () => null,
    captureSnapshot: async () => { captureCount += 1; },
    unmountSnapshot: () => { unmountCount += 1; }
  });
  assert.deepEqual(retry, { ok: true });
  assert.equal(captureCount, 1, "the mutex must be reusable after a timeout");
}

async function postSettleRevalidationTest() {
  const mutex = new ExportTransactionMutex();
  const snapshot = createExportSnapshot(defaultState, 1, 3);
  const dom = { overflow: false };
  let captureCount = 0;
  const result = await runExportTransaction({
    mutex,
    snapshot,
    mountSnapshot: async () => {
      // Simulate fonts/layout settling after the caller's initial live check.
      dom.overflow = true;
      return dom;
    },
    validateSnapshot: (_snapshot, node) => node.overflow ? "content-overflow" as const : null,
    captureSnapshot: async () => { captureCount += 1; },
    unmountSnapshot: () => {}
  });
  assert.deepEqual(result, { ok: false, kind: "blocked", reason: "content-overflow" });
  assert.equal(captureCount, 0, "a snapshot that destabilizes while settling must not download");
}

async function fontReadinessTimeoutTest() {
  const previousDocument = globalThis.document;
  const previousAnimationFrame = globalThis.requestAnimationFrame;
  const neverReady = new Promise<FontFaceSet>(() => {});
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { fonts: { ready: neverReady } }
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0)
  });

  try {
    const mutex = new ExportTransactionMutex();
    const snapshot = createExportSnapshot(defaultState, 1, 4);
    const node = { dataset: { exportSnapshotId: snapshot.id } } as unknown as HTMLElement;
    const result = await runExportTransaction({
      mutex,
      snapshot,
      mountSnapshot: (_snapshot, signal) => waitForExportSnapshotNode(() => node, snapshot.id, signal, 1000),
      validateSnapshot: () => null,
      captureSnapshot: async () => assert.fail("font timeout must prevent capture"),
      unmountSnapshot: () => {},
      timeoutMs: 20
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok ? null : result.kind, "error", "fonts.ready must share the transaction deadline");
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
    Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: previousAnimationFrame });
  }
}

function deferredRender() {
  let resolve!: (value: { dataUrl: string; width: number; height: number }) => void;
  let startedResolve!: () => void;
  const started = new Promise<void>((resolvePromise) => { startedResolve = resolvePromise; });
  const promise = new Promise<{ dataUrl: string; width: number; height: number }>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {
    renderNode: async () => {
      startedResolve();
      return promise;
    },
    started,
    resolve
  };
}

async function exportImageAbortGuardTest() {
  const render = deferredRender();
  const commits: Array<{ dataUrl: string; fileName: string }> = [];
  const dependencies: ExportImageDependencies = {
    renderNode: render.renderNode,
    commitDownload: (dataUrl, fileName) => { commits.push({ dataUrl, fileName }); }
  };
  const controller = new AbortController();
  const exporting = exportNodeAsPng(
    {} as HTMLElement,
    "cancelled.png",
    1200,
    1800,
    2,
    controller.signal,
    dependencies
  );
  await render.started;
  controller.abort(new Error("cancelled during render"));
  render.resolve({ dataUrl: "data:image/png;base64,LATE", width: 2400, height: 3600 });
  await assert.rejects(exporting, /cancelled during render/);
  assert.equal(commits.length, 0, "an aborted production export must never reach link.click/commit");

  let normalRenderCount = 0;
  await exportNodeAsPng(
    {} as HTMLElement,
    "normal.png",
    640,
    960,
    1,
    undefined,
    {
      renderNode: async (_node, format, options) => {
        normalRenderCount += 1;
        assert.equal(format, "png");
        assert.equal(options.width, 640);
        assert.equal(options.height, 960);
        return { dataUrl: "data:image/png;base64,OK", width: 640, height: 960 };
      },
      commitDownload: (dataUrl, fileName) => { commits.push({ dataUrl, fileName }); }
    }
  );
  assert.equal(normalRenderCount, 1);
  assert.deepEqual(commits, [{ dataUrl: "data:image/png;base64,OK", fileName: "normal.png" }]);

  const clipboardCommits: string[] = [];
  const clipboardDependencies: CopyImageDependencies = {
    renderNode: async (_node, format, options) => {
      assert.equal(format, "png", "clipboard capture always renders the interoperable PNG format");
      assert.equal(options.pixelRatio, 1.4, "clipboard capture keeps the selected export quality");
      return { dataUrl: "data:image/png;base64,CLIPBOARD", width: 896, height: 1344 };
    },
    commitClipboard: (dataUrl) => { clipboardCommits.push(dataUrl); }
  };
  await copyNodeAsPng(
    {} as HTMLElement,
    640,
    960,
    1.4,
    undefined,
    clipboardDependencies
  );
  assert.deepEqual(clipboardCommits, ["data:image/png;base64,CLIPBOARD"]);

  const lateClipboardRender = deferredRender();
  const lateClipboardController = new AbortController();
  const lateClipboardCopy = copyNodeAsPng(
    {} as HTMLElement,
    640,
    960,
    1,
    lateClipboardController.signal,
    {
      renderNode: lateClipboardRender.renderNode,
      commitClipboard: (dataUrl) => { clipboardCommits.push(dataUrl); }
    }
  );
  await lateClipboardRender.started;
  lateClipboardController.abort(new Error("cancelled before clipboard commit"));
  lateClipboardRender.resolve({ dataUrl: "data:image/png;base64,LATE", width: 640, height: 960 });
  await assert.rejects(lateClipboardCopy, /cancelled before clipboard commit/);
  assert.deepEqual(
    clipboardCommits,
    ["data:image/png;base64,CLIPBOARD"],
    "a cancelled render must never replace the clipboard"
  );

  await exportNodeAsImage(
    {} as HTMLElement,
    "normal.webp",
    "webp",
    640,
    960,
    1.4,
    undefined,
    {
      renderNode: async (_node, format, options) => {
        assert.equal(format, "webp");
        assert.equal(options.pixelRatio, 1.4);
        return { dataUrl: "data:image/webp;base64,OK", width: 896, height: 1344 };
      },
      commitDownload: (dataUrl, fileName) => { commits.push({ dataUrl, fileName }); }
    }
  );
  assert.deepEqual(commits[1], { dataUrl: "data:image/webp;base64,OK", fileName: "normal.webp" });

  await exportNodeAsImage(
    {} as HTMLElement,
    "normal.jpg",
    "jpg",
    640,
    960,
    2,
    undefined,
    {
      renderNode: async (_node, format) => {
        assert.equal(format, "jpg");
        return { dataUrl: "data:image/jpeg;base64,OK", width: 1280, height: 1920 };
      },
      commitDownload: (dataUrl, fileName) => { commits.push({ dataUrl, fileName }); }
    }
  );
  assert.deepEqual(commits[2], { dataUrl: "data:image/jpeg;base64,OK", fileName: "normal.jpg" });

  const blobImageNode = {
    querySelectorAll: () => [{ currentSrc: "blob:https://example.test/local-cover", src: "blob:https://example.test/local-cover" }]
  } as unknown as HTMLElement;
  await exportNodeAsPng(
    blobImageNode,
    "local-cover.png",
    640,
    960,
    1,
    undefined,
    {
      renderNode: async (_node, _format, options) => {
        assert.equal(options.cacheBust, false, "blob artwork must retain its exact local URL");
        return { dataUrl: "data:image/png;base64,LOCAL", width: 640, height: 960 };
      },
      commitDownload: (dataUrl, fileName) => { commits.push({ dataUrl, fileName }); }
    }
  );
  assert.deepEqual(commits[3], { dataUrl: "data:image/png;base64,LOCAL", fileName: "local-cover.png" });

  await assert.rejects(
    exportNodeAsImage(
      {} as HTMLElement,
      "mismatch.jpg",
      "jpg",
      640,
      960,
      1,
      undefined,
      {
        renderNode: async () => ({ dataUrl: "data:image/png;base64,WRONG", width: 640, height: 960 }),
        commitDownload: () => assert.fail("a MIME mismatch must not commit a download")
      }
    ),
    /does not match the requested JPG format/
  );

  for (const collision of [
    { format: "png" as const, mimeType: "image/png-fake" },
    { format: "webp" as const, mimeType: "image/webp-fake" },
    { format: "jpg" as const, mimeType: "image/jpeg-fake" }
  ]) {
    await assert.rejects(
      exportNodeAsImage(
        {} as HTMLElement,
        `prefix-collision.${collision.format}`,
        collision.format,
        640,
        960,
        1,
        undefined,
        {
          renderNode: async () => ({
            dataUrl: `data:${collision.mimeType};base64,WRONG`,
            width: 640,
            height: 960
          }),
          commitDownload: () => assert.fail("a MIME prefix collision must not commit a download")
        }
      ),
      new RegExp(`does not match the requested ${collision.format.toUpperCase()} format`)
    );
  }

  assert.deepEqual(getExpectedExportRasterSize(1387, 9399, 1.4), { width: 1941, height: 13158 });
  assert.equal(getClipboardRasterSizeIssue(1440, 6400, 2), null);
  assert.deepEqual(getClipboardRasterSizeIssue(7000, 7000, 1), {
    expected: { width: 7000, height: 7000 },
    dimensionLimit: EXPORT_CANVAS_DIMENSION_LIMIT,
    pixelLimit: CLIPBOARD_IMAGE_PIXEL_LIMIT,
    reason: "area"
  });
  assert.equal(getExportRasterSizeIssue(1387, 8191, 2), null);
  assert.equal(getExportRasterSizeIssue(1387, 8192, 2), null);
  assert.notEqual(getExportRasterSizeIssue(1387, 8192, Number.NaN), null);
  for (const [width, height, pixelRatio] of [
    [-640, -960, -1],
    [0, 960, 1],
    [640, 0, 1],
    [640, 960, 0],
    [Number.NaN, 960, 1],
    [640, Number.POSITIVE_INFINITY, 1],
    [640, 960, Number.NEGATIVE_INFINITY]
  ]) {
    assert.notEqual(
      getExportRasterSizeIssue(width, height, pixelRatio),
      null,
      `invalid raster inputs must be rejected: ${width} x ${height} @ ${pixelRatio}`
    );
  }
  assert.deepEqual(getExportRasterSizeIssue(1387, 8193, 2), {
    expected: { width: 2774, height: 16386 },
    limit: EXPORT_CANVAS_DIMENSION_LIMIT
  });

  await assert.rejects(
    exportNodeAsPng(
      {} as HTMLElement,
      "too-tall.png",
      1387,
      8193,
      2,
      undefined,
      {
        renderNode: async () => assert.fail("an oversized export must fail before rendering"),
        commitDownload: () => assert.fail("an oversized export must not commit a download")
      }
    ),
    ExportRasterSizeLimitError
  );

  let boundaryClipboardCommits = 0;
  await copyNodeAsPng(
    {} as HTMLElement,
    1440,
    6400,
    2,
    undefined,
    {
      renderNode: async () => ({
        dataUrl: "data:image/png;base64,CONTROLLED_BOUNDARY_FIXTURE",
        width: 2880,
        height: 12800
      }),
      commitClipboard: () => { boundaryClipboardCommits += 1; }
    }
  );
  assert.equal(boundaryClipboardCommits, 1, "the legal 2880 x 12800 clipboard path remains reachable");

  await assert.rejects(
    copyNodeAsPng(
      {} as HTMLElement,
      7000,
      7000,
      1,
      undefined,
      {
        renderNode: async () => assert.fail("an over-area clipboard image must fail before rendering"),
        commitClipboard: () => assert.fail("an over-area clipboard image must not commit")
      }
    ),
    ClipboardRasterSizeLimitError
  );

  await assert.rejects(
    exportNodeAsPng(
      {} as HTMLElement,
      "silently-scaled.png",
      1387,
      8192,
      2,
      undefined,
      {
        renderNode: async () => ({
          dataUrl: "data:image/png;base64,SCALED",
          width: 1387,
          height: 8192
        }),
        commitDownload: () => assert.fail("a silently scaled image must not commit a download")
      }
    ),
    ExportRasterSizeMismatchError
  );
}

async function transactionTimeoutBlocksLateExportCommitTest() {
  const mutex = new ExportTransactionMutex();
  const snapshot = createExportSnapshot(defaultState, 1, 5);
  const render = deferredRender();
  let commitCount = 0;
  const resultPromise = runExportTransaction({
    mutex,
    snapshot,
    mountSnapshot: async () => ({} as HTMLElement),
    validateSnapshot: () => null,
    captureSnapshot: (current, node, signal) => exportNodeAsPng(
      node,
      current.fileName,
      current.width,
      current.height,
      current.pixelRatio,
      signal,
      {
        renderNode: render.renderNode,
        commitDownload: () => { commitCount += 1; }
      }
    ),
    unmountSnapshot: () => undefined,
    timeoutMs: 20
  });
  await render.started;
  const result = await resultPromise;
  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.kind, "error");
  render.resolve({ dataUrl: "data:image/png;base64,LATE", width: 2080, height: 2912 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(commitCount, 0, "a transaction timeout must block a late html-to-image result from downloading");
}

async function clipboardIpcErrorPropagationTest() {
  const testWindow = {
    lyricsCardDesktopBridge: {
      copyImageToClipboard: async () => false
    }
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: testWindow });
  try {
    assert.equal(getPngDataUrlEncodedByteLength("data:image/png;base64,AAAA"), 3);
    await assert.rejects(
      writePngDataUrlToClipboard("data:image/png;base64,AAAA"),
      ImageClipboardUnavailableError,
      "a stable false IPC result propagates as the renderer clipboard failure"
    );
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
}

void (async () => {
  exportSnapshotProtectsBlobUrlTest();
  await concurrencyTest();
  await timeoutReleasesMutexTest();
  await postSettleRevalidationTest();
  await fontReadinessTimeoutTest();
  await exportImageAbortGuardTest();
  await clipboardIpcErrorPropagationTest();
  await transactionTimeoutBlocksLateExportCommitTest();
})().then(() => {
  console.log("export snapshot and concurrency tests passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
