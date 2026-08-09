import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defaultState } from "../components/editor/editor-defaults";
import {
  AUTO_HEIGHT_SETTLE_TOLERANCE,
  autoCanvasHeightMeasurementSignature,
  measureAutoCanvasHeight
} from "../components/editor/hooks/useMeasuredAutoCanvasHeight";
import {
  EXPORT_CARD_OVERFLOW_TOLERANCE,
  createExportCardMeasurementSignature,
  getLiveExportCardValidation
} from "../components/editor/hooks/useExportCardReadiness";
import {
  ExportCardDomCoordinator,
  type ExportCardCoordinatorEnvironment,
  type ExportCardFontSetLike
} from "../components/editor/hooks/export-card-dom-coordinator";
import {
  ExportCardReadinessStore,
  INITIAL_EXPORT_CARD_READINESS
} from "../components/editor/hooks/export-card-readiness-store";
import { getPortraitLayout } from "../lib/card-layout-engine";
import { getCardSize } from "../lib/card-size";
import type { AppState } from "../lib/types";

type FakeElement = HTMLElement & {
  childrenBySelector: Map<string, HTMLElement | null>;
};

function createElement(
  geometry: Partial<Pick<HTMLElement, "offsetWidth" | "offsetHeight" | "clientWidth" | "clientHeight" | "scrollWidth" | "scrollHeight">> = {},
  childrenBySelector = new Map<string, HTMLElement | null>()
) {
  return {
    offsetWidth: geometry.offsetWidth ?? 0,
    offsetHeight: geometry.offsetHeight ?? 0,
    clientWidth: geometry.clientWidth ?? geometry.offsetWidth ?? 0,
    clientHeight: geometry.clientHeight ?? geometry.offsetHeight ?? 0,
    scrollWidth: geometry.scrollWidth ?? geometry.clientWidth ?? geometry.offsetWidth ?? 0,
    scrollHeight: geometry.scrollHeight ?? geometry.clientHeight ?? geometry.offsetHeight ?? 0,
    childrenBySelector,
    matches: (selector: string) => selector === "[data-export-card]",
    querySelector: (selector: string) => childrenBySelector.get(selector) ?? null
  } as unknown as FakeElement;
}

function fixedState(overrides: Partial<AppState> = {}): AppState {
  return {
    ...defaultState,
    ...overrides,
    song: { ...defaultState.song, ...overrides.song },
    style: {
      ...defaultState.style,
      autoWidth: false,
      autoHeight: false,
      ...overrides.style
    }
  };
}

function createFixedCard(state: AppState, overflow = 0) {
  const size = getCardSize(state.style);
  const lyrics = createElement({
    clientWidth: 500,
    clientHeight: 500,
    scrollWidth: 500,
    scrollHeight: 500 + overflow
  });
  const viewport = createElement({
    clientWidth: 500,
    clientHeight: 500,
    scrollWidth: 500,
    scrollHeight: 500
  });
  return createElement(
    { offsetWidth: size.width, offsetHeight: size.height },
    new Map([
      ["[data-card-lyrics]", lyrics],
      ["[data-card-lyrics-viewport]", viewport]
    ])
  );
}

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
let fontStatus: FontFaceSetLoadStatus = "loaded";

Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: {
    fonts: {
      get status() {
        return fontStatus;
      }
    }
  }
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    getComputedStyle: () => ({
      paddingTop: "0px",
      paddingBottom: "0px"
    })
  }
});

try {
  const readyState = fixedState({ lyrics: "one\ntwo" });
  const readyCard = createFixedCard(readyState);
  assert.equal(getLiveExportCardValidation(readyState, readyCard).blockingReason, null);

  fontStatus = "loading";
  assert.equal(
    getLiveExportCardValidation(readyState, readyCard).blockingReason,
    "fonts-loading",
    "font readiness remains a distinct export gate"
  );
  fontStatus = "loaded";

  const expectedSize = getCardSize(readyState.style);
  const onePixelRoundingCard = createFixedCard(readyState);
  Object.defineProperty(onePixelRoundingCard, "offsetWidth", { value: expectedSize.width + 1 });
  assert.equal(
    getLiveExportCardValidation(readyState, onePixelRoundingCard).blockingReason,
    null,
    "one physical pixel of card-size rounding remains stable"
  );
  const wrongSizeCard = createFixedCard(readyState);
  Object.defineProperty(wrongSizeCard, "offsetWidth", { value: expectedSize.width + 2 });
  assert.equal(getLiveExportCardValidation(readyState, wrongSizeCard).blockingReason, "card-measuring");
  assert.equal(getLiveExportCardValidation(readyState, readyCard, false).blockingReason, "card-measuring");

  assert.equal(
    getLiveExportCardValidation(
      readyState,
      createFixedCard(readyState, EXPORT_CARD_OVERFLOW_TOLERANCE)
    ).blockingReason,
    null,
    "fractional-layout overflow inside the shared tolerance remains exportable"
  );
  assert.equal(
    getLiveExportCardValidation(
      readyState,
      createFixedCard(readyState, EXPORT_CARD_OVERFLOW_TOLERANCE + 1)
    ).blockingReason,
    "content-overflow"
  );

  const overLimit = fixedState({
    lyrics: Array.from({ length: 37 }, (_, index) => `line ${index + 1}`).join("\n")
  });
  fontStatus = "loading";
  assert.equal(
    getLiveExportCardValidation(overLimit, null, false).blockingReason,
    "lyrics-limit",
    "document policy keeps precedence over every physical readiness gate"
  );
  fontStatus = "loaded";
  assert.equal(getLiveExportCardValidation(readyState, null).blockingReason, "card-unavailable");

  const autoHeightState = fixedState({
    lyrics: "auto height",
    song: { ...defaultState.song, title: "", artist: "", album: "" },
    style: {
      ...defaultState.style,
      autoWidth: false,
      autoHeight: true,
      showCover: false,
      showSongInfo: false,
      showGeneratedWatermark: false,
      showPlatformBadge: false,
      showSharedBy: false
    }
  });
  const autoSize = getCardSize(autoHeightState.style);
  const layout = getPortraitLayout(autoSize, autoHeightState.style, autoHeightState.song);
  const autoLyrics = createElement({
    clientWidth: 500,
    clientHeight: layout.safeRect.height,
    scrollWidth: 500,
    scrollHeight: layout.safeRect.height
  });
  const autoViewport = createElement({
    clientWidth: 500,
    clientHeight: layout.safeRect.height,
    scrollWidth: 500,
    scrollHeight: layout.safeRect.height
  });
  const autoContent = createElement();
  const autoFooter = createElement({ scrollHeight: 0 });
  const autoCard = createElement(
    { offsetWidth: autoSize.width, offsetHeight: autoSize.height },
    new Map([
      ["[data-card-content]", autoContent],
      ["[data-card-header]", null],
      ["[data-card-lyrics]", autoLyrics],
      ["[data-card-lyrics-viewport]", autoViewport],
      ["[data-card-footer]", autoFooter]
    ])
  );
  assert.equal(measureAutoCanvasHeight(autoHeightState, autoCard), autoSize.height);
  assert.equal(getLiveExportCardValidation(autoHeightState, autoCard).blockingReason, null);

  Object.defineProperty(autoLyrics, "scrollHeight", {
    configurable: true,
    value: layout.safeRect.height + AUTO_HEIGHT_SETTLE_TOLERANCE + 1
  });
  assert.equal(
    getLiveExportCardValidation(autoHeightState, autoCard).blockingReason,
    "card-measuring",
    "auto-height must settle against the measured DOM before export becomes available"
  );

  const translatedState = fixedState({
    lyrics: Array.from({ length: 18 }, (_, index) => `original ${index + 1}`).join("\n"),
    translationText: Array.from({ length: 19 }, (_, index) => `translation ${index + 1}`).join("\n"),
    translationEnabled: true,
    style: {
      ...defaultState.style,
      autoWidth: false,
      autoHeight: false,
      translationEnabled: true,
      translationText: Array.from({ length: 19 }, (_, index) => `translation ${index + 1}`).join("\n")
    }
  });
  const translatedValidation = getLiveExportCardValidation(
    translatedState,
    createFixedCard(translatedState)
  );
  assert.equal(translatedValidation.lineStatus.totalLineCount, 37);
  assert.equal(translatedValidation.blockingReason, "lyrics-limit");
} finally {
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
}

{
  const base = fixedState({ lyrics: "signature baseline" });
  const signature = createExportCardMeasurementSignature(base, true);
  assert.equal(
    createExportCardMeasurementSignature({ ...base, url: "https://unrelated.example", paletteWarning: "notice" }, true),
    signature,
    "unrendered AppState fields do not invalidate export-card measurements"
  );

  const renderedChanges: Array<[string, AppState]> = [
    ["lyrics", { ...base, lyrics: "changed lyrics" }],
    ["translation", {
      ...base,
      style: { ...base.style, translationEnabled: true, translationText: "translated" }
    }],
    ["song title", { ...base, song: { ...base.song, title: "Changed title" } }],
    ["song artist", { ...base, song: { ...base.song, artist: "Changed artist" } }],
    ["song album", { ...base, song: { ...base.song, album: "Changed album" } }],
    ["cover", { ...base, song: { ...base.song, coverUrl: "blob:changed-cover" } }],
    ["font", { ...base, style: { ...base.style, font: "serif-heavy" } }],
    ["custom font", {
      ...base,
      style: { ...base.style, customFontEnabled: true, customFontFamily: "Fixture Font" }
    }],
    ["font size", { ...base, style: { ...base.style, lyricFontSize: base.style.lyricFontSize + 2 } }],
    ["line height", { ...base, style: { ...base.style, lineHeight: base.style.lineHeight + 0.05 } }],
    ["canvas width", { ...base, style: { ...base.style, width: base.style.width + 20 } }],
    ["canvas height", { ...base, style: { ...base.style, height: base.style.height + 20 } }],
    ["automatic width", { ...base, style: { ...base.style, autoWidth: !base.style.autoWidth } }],
    ["automatic height", { ...base, style: { ...base.style, autoHeight: !base.style.autoHeight } }],
    ["locale", { ...base, locale: "en" }]
  ];
  for (const [label, changedState] of renderedChanges) {
    assert.notEqual(
      createExportCardMeasurementSignature(changedState, true),
      signature,
      `${label} invalidates DOM readiness`
    );
  }
  assert.notEqual(
    createExportCardMeasurementSignature(base, false),
    signature,
    "auto-width pending invalidates DOM readiness even before the card DOM changes"
  );
  assert.notEqual(
    autoCanvasHeightMeasurementSignature(base),
    autoCanvasHeightMeasurementSignature({
      ...base,
      style: { ...base.style, lineHeight: base.style.lineHeight + 0.05 }
    }),
    "auto-height writes carry a semantic stale-measurement guard"
  );
}

{
  const stale = {
    ...INITIAL_EXPORT_CARD_READINESS,
    lineStatus: getLiveExportCardValidation(fixedState(), null).lineStatus
  };
  const ready = {
    ...stale,
    isReady: true,
    blockingReason: null,
    isCardMounted: true,
    areFontsReady: true,
    isCardSizeStable: true,
    isAutoWidthStable: true,
    isAutoHeightStable: true
  };
  const store = new ExportCardReadinessStore(stale);
  let publications = 0;
  store.subscribe(() => { publications += 1; });
  assert.equal(store.prepareInput("document-a", stale), true);
  assert.equal(store.prepareInput("document-a", stale), false, "same semantic input is not invalidated twice");
  assert.equal(store.publish("document-a", ready), true);
  assert.equal(publications, 1);
  assert.equal(store.publish("document-a", { ...ready }), false, "equal readiness does not publish");
  assert.equal(publications, 1);
  assert.equal(store.prepareInput("document-b", stale), true);
  assert.equal(publications, 1, "input invalidation rides the parent render without notifying it again");
  assert.equal(store.publish("document-a", ready), false, "superseded measurements cannot publish");
  assert.equal(store.publish("document-b", ready), true);
  assert.equal(publications, 2);
  store.dispose();
}

class FakeObservedNode {
  readonly childrenBySelector = new Map<string, FakeObservedNode | null>();
  readonly listeners = new Map<string, Set<EventListener>>();

  constructor(private readonly exportCard = false) {}

  matches(selector: string) {
    return this.exportCard && selector === "[data-export-card]";
  }

  querySelector<T extends Element = Element>(selector: string): T | null {
    return (this.childrenBySelector.get(selector) ?? null) as unknown as T | null;
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
  }
}

function createObservedTree() {
  const container = new FakeObservedNode();
  const root = new FakeObservedNode(true);
  container.childrenBySelector.set("[data-export-card]", root);
  for (const selector of [
    "[data-card-content]",
    "[data-card-header]",
    "[data-card-lyrics-viewport]",
    "[data-card-lyrics]",
    "[data-card-footer]"
  ]) {
    root.childrenBySelector.set(selector, new FakeObservedNode());
  }
  return { container, root };
}

function deferredPromise() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

class FakeFontSet implements ExportCardFontSetLike {
  ready: Promise<unknown>;
  readonly listeners = new Map<string, Set<EventListener>>();

  constructor(ready: Promise<unknown>) {
    this.ready = ready;
  }

  addEventListener(type: "loading" | "loadingdone" | "loadingerror", listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: "loading" | "loadingdone" | "loadingerror", listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: "loading" | "loadingdone" | "loadingerror") {
    for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
  }
}

{
  const readinessHookSource = readFileSync(
    resolve("components/editor/hooks/useExportCardReadiness.ts"),
    "utf8"
  );
  const coordinatorSource = readFileSync(
    resolve("components/editor/hooks/export-card-dom-coordinator.ts"),
    "utf8"
  );
  const autoHeightSource = readFileSync(
    resolve("components/editor/hooks/useMeasuredAutoCanvasHeight.ts"),
    "utf8"
  );
  const lyricEditorSource = readFileSync(resolve("components/editor/LyricEditor.tsx"), "utf8");
  const webLiteSource = readFileSync(resolve("web-lite/WebLiteEditor.tsx"), "utf8");
  const stepperSource = readFileSync(resolve("components/editor/SettingsStepper.tsx"), "utf8");
  const exportPanelSource = readFileSync(resolve("components/editor/ExportPanel.tsx"), "utf8");

  assert.equal(
    (coordinatorSource.match(/new ResizeObserver\(/g) ?? []).length,
    1,
    "the live export tree has one ResizeObserver construction site"
  );
  assert.equal(
    (coordinatorSource.match(/new MutationObserver\(/g) ?? []).length,
    1,
    "the live export tree has one MutationObserver construction site"
  );
  assert.doesNotMatch(
    readinessHookSource,
    /useState/,
    "asynchronous readiness does not own LyricEditor hook state"
  );
  assert.equal(
    (readinessHookSource.match(/measureAutoCanvasHeight\(/g) ?? []).length,
    1,
    "one coordinated geometry pass feeds auto-height and readiness"
  );
  assert.doesNotMatch(autoHeightSource, /ResizeObserver|MutationObserver|requestAnimationFrame/);
  assert.doesNotMatch(lyricEditorSource, /useMeasuredAutoCanvasHeight/);
  assert.doesNotMatch(webLiteSource, /useMeasuredAutoCanvasHeight/);
  assert.ok(stepperSource.includes("useOptionalExportCardReadinessSnapshot"));
  assert.ok(exportPanelSource.includes("useOptionalExportCardReadinessSnapshot"));
  assert.ok(
    lyricEditorSource.includes("getLiveExportCardValidation") &&
      webLiteSource.includes("getLiveExportCardValidation"),
    "desktop and Web Lite retain live export-time defense"
  );
}

async function coordinatorLifecycleTest() {
  const firstTree = createObservedTree();
  const secondTree = createObservedTree();
  let currentContainer = firstTree.container as unknown as HTMLElement;
  const resizeObservers: Array<{
    callback: ResizeObserverCallback;
    observed: Set<Element>;
    unobserved: Element[];
    disconnects: number;
  }> = [];
  const mutationObservers: Array<{
    callback: MutationCallback;
    observed: Array<{ target: Node; options: MutationObserverInit }>;
    disconnects: number;
  }> = [];
  const frames = new Map<number, FrameRequestCallback>();
  const cancelledFrames: number[] = [];
  let nextFrame = 1;
  const pendingFonts = deferredPromise();
  const fonts = new FakeFontSet(pendingFonts.promise);
  const environment: ExportCardCoordinatorEnvironment = {
    createResizeObserver: (callback) => {
      const record = { callback, observed: new Set<Element>(), unobserved: [] as Element[], disconnects: 0 };
      resizeObservers.push(record);
      return {
        observe: (target) => record.observed.add(target),
        unobserve: (target) => {
          record.observed.delete(target);
          record.unobserved.push(target);
        },
        disconnect: () => {
          record.observed.clear();
          record.disconnects += 1;
        }
      };
    },
    createMutationObserver: (callback) => {
      const record = {
        callback,
        observed: [] as Array<{ target: Node; options: MutationObserverInit }>,
        disconnects: 0
      };
      mutationObservers.push(record);
      return {
        observe: (target, options) => record.observed.push({ target, options: options ?? {} }),
        disconnect: () => { record.disconnects += 1; }
      };
    },
    requestFrame: (callback) => {
      const frame = nextFrame;
      nextFrame += 1;
      frames.set(frame, callback);
      return frame;
    },
    cancelFrame: (frame) => {
      cancelledFrames.push(frame);
      frames.delete(frame);
    },
    getFontSet: () => fonts
  };
  let evaluations = 0;
  const evaluatedContainers: Array<HTMLElement | null> = [];
  const coordinator = new ExportCardDomCoordinator({
    getContainer: () => currentContainer,
    evaluate: (container) => {
      evaluations += 1;
      evaluatedContainers.push(container);
    },
    environment
  });
  const flushFrame = () => {
    const entry = [...frames.entries()][0];
    assert.ok(entry, "a coordinated animation frame is pending");
    frames.delete(entry[0]);
    entry[1](performance.now());
  };

  coordinator.start();
  assert.equal(resizeObservers.length, 1, "one ResizeObserver owns the export tree");
  assert.equal(mutationObservers.length, 1, "one MutationObserver owns the export tree");
  assert.equal(resizeObservers[0].observed.size, 6, "root and five geometry nodes share one observer");
  assert.deepEqual(
    mutationObservers[0].observed[0].options,
    {
      attributes: true,
      attributeFilter: ["class", "style"],
      childList: true,
      characterData: true,
      subtree: true
    },
    "content, node replacement, and landscape fitting styles retain observation"
  );
  assert.equal(frames.size, 1);
  coordinator.requestEvaluation();
  coordinator.requestEvaluation();
  coordinator.requestEvaluation();
  assert.equal(frames.size, 1, "rapid consecutive input coalesces into one evaluation frame");
  flushFrame();
  assert.equal(evaluations, 1);

  resizeObservers[0].callback([], {} as ResizeObserver);
  resizeObservers[0].callback([], {} as ResizeObserver);
  assert.equal(frames.size, 1, "repeated resize notifications share the pending frame");
  flushFrame();
  assert.equal(evaluations, 2);

  firstTree.container.childrenBySelector.set("[data-export-card]", secondTree.root);
  mutationObservers[0].callback([], {} as MutationObserver);
  assert.equal(resizeObservers[0].unobserved.length, 6, "replaced export nodes are unobserved");
  assert.equal(resizeObservers[0].observed.size, 6, "replacement nodes are observed without a new observer");
  flushFrame();
  assert.equal(evaluations, 3);

  firstTree.container.dispatch("load");
  firstTree.container.dispatch("error");
  assert.equal(frames.size, 1, "cover load and failure settle through the shared scheduler");
  flushFrame();
  assert.equal(evaluations, 4);

  const nextFontCycle = deferredPromise();
  fonts.ready = nextFontCycle.promise;
  fonts.dispatch("loading");
  fonts.dispatch("loadingdone");
  assert.equal(frames.size, 1, "font pending/done events coalesce");
  flushFrame();
  nextFontCycle.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(frames.size, 1, "the current FontFaceSet.ready cycle schedules a settle check");
  flushFrame();

  currentContainer = secondTree.container as unknown as HTMLElement;
  coordinator.requestEvaluation();
  assert.equal(firstTree.container.listeners.get("load")?.size ?? 0, 0, "old container load listener is removed");
  assert.equal(secondTree.container.listeners.get("load")?.size ?? 0, 1, "replacement container is tracked");
  assert.equal(resizeObservers.length, 1, "container replacement still reuses the single ResizeObserver");
  flushFrame();
  assert.equal(evaluatedContainers.at(-1), currentContainer);

  coordinator.requestEvaluation();
  assert.equal(frames.size, 1);
  const evaluationsBeforeStop = evaluations;
  const cancellationsBeforeStop = cancelledFrames.length;
  coordinator.stop();
  assert.equal(frames.size, 0);
  assert.equal(
    cancelledFrames.length,
    cancellationsBeforeStop + 1,
    "unmount cancels the pending coordinated frame"
  );
  assert.equal(secondTree.container.listeners.get("load")?.size ?? 0, 0);
  resizeObservers[0].callback([], {} as ResizeObserver);
  mutationObservers[0].callback([], {} as MutationObserver);
  fonts.dispatch("loadingdone");
  assert.equal(frames.size, 0, "late observer/font notifications cannot revive an unmounted coordinator");
  assert.equal(evaluations, evaluationsBeforeStop);

  // Strict Mode's setup-cleanup-setup sequence owns fresh observers while the
  // stopped instance remains inert.
  const strictCoordinator = new ExportCardDomCoordinator({
    getContainer: () => currentContainer,
    evaluate: () => { evaluations += 1; },
    environment
  });
  strictCoordinator.start();
  assert.equal(resizeObservers.length, 2);
  assert.equal(mutationObservers.length, 2);
  strictCoordinator.stop();
  assert.equal(resizeObservers[0].disconnects, 1);
  assert.equal(resizeObservers[1].disconnects, 1);
  assert.equal(mutationObservers[0].disconnects, 2, "replacement and final cleanup each disconnect once");
  assert.equal(mutationObservers[1].disconnects, 1);
}

void coordinatorLifecycleTest().then(
  () => console.log(JSON.stringify({ ok: true, exportCardReadinessTests: 55 }, null, 2)),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
