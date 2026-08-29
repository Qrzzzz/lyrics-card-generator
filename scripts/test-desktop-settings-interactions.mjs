import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = process.env.LYRICS_CARD_TEST_EXECUTABLE?.trim()
  ? path.resolve(process.env.LYRICS_CARD_TEST_EXECUTABLE)
  : path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe");
const reportDirectory = path.join(root, "playwright-report", "desktop");
const userDataDirectory = await mkdtemp(path.join(tmpdir(), "lyrics-card-desktop-test-"));
const exportOverflowTolerance = 4;
const activeSongInfoToggleSelector = '[data-stepper-presentation="focus"] [data-testid="song-info-toggle"]';
const activeCompleteExportButtonSelector = '[data-testid="export-settings-panel"][data-active="true"] [data-testid="complete-export-button"]';
// Visual metrics are diagnostic-only unless explicitly requested; behavioral
// assertions remain deterministic in the default regression run.
const runVisualDiagnostics = process.argv.includes("--visual-diagnostics");
const builtInAutoWidthCases = [
  { id: "opalite", lyricLines: 4, translationLines: 4, min: 1360, max: 1400 },
  { id: "opposite", lyricLines: 4, translationLines: 4, min: 820, max: 860 },
  { id: "yuusha", lyricLines: 3, translationLines: 3, min: 1080, max: 1120 },
  { id: "glorious-years", lyricLines: 6, translationLines: 0, min: 780, max: 820 },
  { id: "honeybee", lyricLines: 4, translationLines: 4, min: 860, max: 900 },
  { id: "lies", lyricLines: 3, translationLines: 3, min: 900, max: 940 }
];

let electronApp;
let page;
const rendererDialogs = [];
const searchRequests = [];
const resolveRequests = [];
const titlebarVisualMetrics = [];
let titlebarPerformanceComparison = null;

async function setNativeDialogDecision(decision) {
  await electronApp.evaluate((_electron, nextDecision) => {
    globalThis.__lyricsCardNativeDialogTest.nextDecision = nextDecision;
  }, decision);
}

async function readNativeDialogs() {
  return electronApp.evaluate(() => globalThis.__lyricsCardNativeDialogTest.calls);
}

// This suite deliberately reuses one packaged application so navigation,
// persistence, focus, and layout transitions are exercised as a continuous flow.
async function waitForVisible(testId) {
  const locator = page.getByTestId(testId);
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  return locator;
}

async function selectSettingsSection(section) {
  await page.getByTestId(`settings-tab-${section}`).click();
  await page.locator(`[data-settings-panel="${section}"]:not([hidden])`).waitFor({ state: "visible" });
}

async function setAppReducedMotion(enabled) {
  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await waitForVisible("settings-surface");
  await selectSettingsSection("general");
  const toggle = page.getByTestId("reduce-motion-toggle");
  if (await toggle.getAttribute("aria-checked") !== String(enabled)) {
    await toggle.click();
  }
  await page.waitForFunction(
    (expected) => document.body.getAttribute("data-reduce-motion") === String(expected),
    enabled
  );
  await page.getByTestId("settings-close-button").click();
  await page.locator('[data-testid="settings-surface"][data-surface-state="closed"]').waitFor({ state: "attached" });
}

async function setWindowSize(width, height) {
  await electronApp.evaluate(({ BrowserWindow }, size) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.unmaximize();
    window.setContentSize(size.width, size.height, false);
  }, { width, height });
  await page.waitForFunction(
    (size) => Math.abs(window.innerWidth - size.width) <= 2 && Math.abs(window.innerHeight - size.height) <= 2,
    { width, height },
    { timeout: 10_000 }
  );
  await page.waitForTimeout(260);
}

async function assertSettingsHistoryBarChrome() {
  const back = page.getByTestId("settings-history-back");
  const forward = page.getByTestId("settings-history-forward");
  await page.locator(".settings-history-bar__link").first().focus();
  await page.keyboard.press("Shift+Tab");

  const chrome = await page.getByTestId("settings-history-bar").evaluate((bar) => {
    const buttons = bar.querySelector(".settings-history-bar__buttons");
    const path = bar.querySelector(".settings-history-bar__path");
    const backButton = bar.querySelector('[data-testid="settings-history-back"]');
    const forwardButton = bar.querySelector('[data-testid="settings-history-forward"]');
    if (!(buttons instanceof HTMLElement) || !(path instanceof HTMLElement) ||
        !(backButton instanceof HTMLButtonElement) || !(forwardButton instanceof HTMLButtonElement)) {
      return null;
    }

    const buttonsStyle = getComputedStyle(buttons);
    const pathStyle = getComputedStyle(path);
    const backStyle = getComputedStyle(backButton);
    const forwardStyle = getComputedStyle(forwardButton);
    const backRect = backButton.getBoundingClientRect();
    const forwardRect = forwardButton.getBoundingClientRect();
    const pathRect = path.getBoundingClientRect();
    return {
      groupBorderWidths: [
        buttonsStyle.borderTopWidth,
        buttonsStyle.borderRightWidth,
        buttonsStyle.borderBottomWidth,
        buttonsStyle.borderLeftWidth
      ],
      groupBackground: buttonsStyle.backgroundColor,
      groupGap: Number.parseFloat(buttonsStyle.columnGap),
      renderedButtonGap: forwardRect.left - backRect.right,
      backSize: { width: backRect.width, height: backRect.height },
      forwardSize: { width: forwardRect.width, height: forwardRect.height },
      buttonBorderWidths: [Number.parseFloat(backStyle.borderTopWidth), Number.parseFloat(forwardStyle.borderTopWidth)],
      buttonBorderStyles: [backStyle.borderTopStyle, forwardStyle.borderTopStyle],
      pathHeight: pathRect.height,
      pathMinHeight: Number.parseFloat(pathStyle.minHeight),
      pathBorderWidth: Number.parseFloat(pathStyle.borderTopWidth),
      pathBorderStyle: pathStyle.borderTopStyle,
      pathFlexGrow: Number.parseFloat(pathStyle.flexGrow),
      backLabel: backButton.getAttribute("aria-label"),
      forwardLabel: forwardButton.getAttribute("aria-label"),
      focused: document.activeElement === backButton,
      focusVisible: backButton.matches(":focus-visible"),
      focusOutlineWidth: Number.parseFloat(backStyle.outlineWidth),
      focusOutlineStyle: backStyle.outlineStyle
    };
  });

  assert.ok(chrome, "settings history chrome is mounted");
  assert.deepEqual(chrome.groupBorderWidths, ["0px", "0px", "0px", "0px"], "history buttons have no outer group border");
  assert.equal(chrome.groupBackground, "rgba(0, 0, 0, 0)", "history buttons have no outer group fill");
  assert.ok(Math.abs(chrome.groupGap - 8) <= 0.25, `history button CSS gap is 8px: ${chrome.groupGap}`);
  assert.ok(Math.abs(chrome.renderedButtonGap - 8) <= 0.5, `history buttons render 8px apart: ${chrome.renderedButtonGap}`);
  assert.deepEqual(chrome.backSize, { width: 36, height: 36 }, "back button keeps its clickable area");
  assert.deepEqual(chrome.forwardSize, { width: 36, height: 36 }, "forward button keeps its clickable area");
  assert.ok(chrome.buttonBorderWidths.every((width) => width > 0.5), `history buttons retain independent border widths: ${chrome.buttonBorderWidths}`);
  assert.deepEqual(chrome.buttonBorderStyles, ["solid", "solid"], "history buttons retain independent solid borders");
  assert.ok(Math.abs(chrome.pathHeight - 40) <= 0.5, `breadcrumb path renders at 40px: ${chrome.pathHeight}`);
  assert.ok(Math.abs(chrome.pathMinHeight - 40) <= 0.25, `breadcrumb path minimum height is 40px: ${chrome.pathMinHeight}`);
  assert.ok(chrome.pathBorderWidth > 0.5, `breadcrumb path retains its own border width: ${chrome.pathBorderWidth}`);
  assert.equal(chrome.pathBorderStyle, "solid", "breadcrumb path retains its own solid border");
  assert.equal(chrome.pathFlexGrow, 1, "breadcrumb path keeps the remaining horizontal space");
  assert.ok(chrome.backLabel && chrome.forwardLabel, "history buttons keep accessible names");
  assert.equal(chrome.focused, true, "back button accepts focus");
  assert.equal(chrome.focusVisible, true, "keyboard focus remains visibly exposed");
  assert.ok(
    chrome.focusOutlineWidth > 1 && chrome.focusOutlineStyle !== "none",
    `back button keeps a visible focus ring: ${chrome.focusOutlineWidth}px ${chrome.focusOutlineStyle}`
  );
}

async function waitForLayoutStable(locator, timeout = 5_000) {
  await locator.waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const signature = `${rect.x.toFixed(2)}:${rect.y.toFixed(2)}:${rect.width.toFixed(2)}:${rect.height.toFixed(2)}`;
      const previous = element.getAttribute("data-test-layout-signature");
      const stableSamples = previous === signature
        ? Number(element.getAttribute("data-test-layout-stable-samples") ?? "0") + 1
        : 0;
      element.setAttribute("data-test-layout-signature", signature);
      element.setAttribute("data-test-layout-stable-samples", String(stableSamples));
      return stableSamples >= 3;
    },
    await locator.evaluate((element) => {
      const marker = `layout-${Math.random().toString(36).slice(2)}`;
      element.setAttribute("data-test-layout-marker", marker);
      element.removeAttribute("data-test-layout-signature");
      element.removeAttribute("data-test-layout-stable-samples");
      return `[data-test-layout-marker="${marker}"]`;
    }),
    { polling: 80, timeout }
  );
}

async function waitForLyricsLineBudget(expected, timeout = 5_000) {
  const panel = page.getByTestId("lyrics-review-panel");
  if (!(await panel.isVisible().catch(() => false))) {
    await page.getByTestId("lyrics-command-review").click();
    await panel.waitFor({ state: "visible", timeout });
  }
  await page.waitForFunction(
    (text) => document.querySelector('[data-testid="lyrics-line-budget"]')?.textContent?.includes(text),
    expected,
    { timeout }
  );
  const text = await page.getByTestId("lyrics-line-budget").textContent() ?? "";
  await page.getByTestId("lyrics-review-close").click();
  await panel.waitFor({ state: "detached", timeout });
  return text;
}

async function waitForCompleteExportEnabled(timeout = 15_000) {
  try {
    await page.waitForFunction((buttonSelector) => {
      const button = document.querySelector(buttonSelector);
      return button instanceof HTMLButtonElement && !button.disabled;
    }, activeCompleteExportButtonSelector, { timeout });
  } catch (error) {
    const diagnostics = await page.evaluate((buttonSelector) => {
      const button = document.querySelector(buttonSelector);
      const activePanel = button?.closest('[data-testid="export-settings-panel"][data-active="true"]');
      const alert = activePanel?.querySelector('[role="alert"]') ?? document.querySelector('[role="alert"]');
      const root = document.querySelector('[data-export-card]');
      const lyrics = root?.querySelector('[data-card-lyrics]');
      const viewport = root?.querySelector('[data-card-lyrics-viewport]');
      return {
        fontsStatus: document.fonts.status,
        buttonMounted: button instanceof HTMLButtonElement,
        buttonDisabled: button instanceof HTMLButtonElement ? button.disabled : null,
        blockingMessage: alert?.textContent?.trim() ?? null,
        card: root instanceof HTMLElement ? {
          width: root.offsetWidth,
          height: root.offsetHeight
        } : null,
        lyrics: lyrics instanceof HTMLElement ? {
          clientHeight: lyrics.clientHeight,
          scrollHeight: lyrics.scrollHeight,
          clientWidth: lyrics.clientWidth,
          scrollWidth: lyrics.scrollWidth
        } : null,
        viewport: viewport instanceof HTMLElement ? {
          clientHeight: viewport.clientHeight,
          scrollHeight: viewport.scrollHeight,
          clientWidth: viewport.clientWidth,
          scrollWidth: viewport.scrollWidth
        } : null
      };
    }, activeCompleteExportButtonSelector);
    throw new Error(`complete export did not become ready: ${JSON.stringify(diagnostics)}`, { cause: error });
  }
}

async function waitForActiveDescendant(expected, timeout = 5_000) {
  await page.waitForFunction(
    (id) => document.querySelector('[role="combobox"]')?.getAttribute("aria-activedescendant") === id,
    expected,
    { timeout }
  );
}

async function fillExact(locator, value, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  let actual = "";
  do {
    await locator.fill(value);
    await page.waitForTimeout(100);
    actual = await locator.inputValue();
    if (actual === value) {
      await page.waitForTimeout(100);
      if (await locator.inputValue() === value) return;
    }
  } while (Date.now() < deadline);
  assert.equal(actual, value, "controlled textarea settles on the exact fixture value");
}

async function assertExportHost(stepLabel) {
  const state = await page.evaluate(() => {
    const host = document.querySelector("[data-export-card-host]");
    const focusable = host?.querySelectorAll(
      'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])'
    ) ?? [];
    return {
      mounted: Boolean(host),
      ariaHidden: host?.getAttribute("aria-hidden"),
      inert: host instanceof HTMLElement ? host.inert : false,
      focusableCount: focusable.length,
      left: host?.getBoundingClientRect().left ?? 0
    };
  });
  assert.equal(state.mounted, true, `${stepLabel} keeps ExportCardHost mounted`);
  assert.equal(state.ariaHidden, "true", `${stepLabel} hides ExportCardHost from accessibility`);
  assert.equal(state.inert, true, `${stepLabel} makes ExportCardHost inert`);
  assert.equal(state.focusableCount, 0, `${stepLabel} keeps ExportCardHost out of Tab order`);
  assert.ok(state.left < -90_000, `${stepLabel} keeps ExportCardHost off-screen`);
}

async function getLyricsContext(editor) {
  return editor.evaluate((node) => {
    const scroll = node.closest('[data-testid="lyrics-shared-scroll"]');
    if (!(scroll instanceof HTMLElement)) throw new Error("shared lyrics scroll missing");
    const value = node.value;
    const start = node.selectionStart;
    const end = node.selectionEnd;
    const lineCount = Math.max(1, value.split(/\r?\n/).length);
    const lineIndex = value.slice(0, start).split(/\r?\n/).length - 1;
    const scrollRect = scroll.getBoundingClientRect();
    const editorRect = node.getBoundingClientRect();
    const editorContentTop = editorRect.top - scrollRect.top + scroll.scrollTop;
    const lineRatio = lineCount > 1 ? lineIndex / (lineCount - 1) : 0;
    return {
      start,
      end,
      selectedText: value.slice(start, end),
      lineIndex,
      lineCount,
      scrollTop: scroll.scrollTop,
      maxScroll: Math.max(0, scroll.scrollHeight - scroll.clientHeight),
      anchorOffset: editorContentTop + node.scrollHeight * lineRatio - scroll.scrollTop,
      focused: document.activeElement === node,
      activeTestId: document.activeElement?.getAttribute("data-testid") ?? "",
      activeRole: document.activeElement?.getAttribute("role") ?? ""
    };
  });
}

function assertSameSelection(before, after, label) {
  assert.deepEqual(
    { start: after.start, end: after.end, selectedText: after.selectedText, lineIndex: after.lineIndex },
    { start: before.start, end: before.end, selectedText: before.selectedText, lineIndex: before.lineIndex },
    `${label} preserves selection and logical line`
  );
}

async function waitForSameSelection(editor, expected, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  let current = await getLyricsContext(editor);
  while (
    Date.now() < deadline &&
    (
      current.start !== expected.start ||
      current.end !== expected.end ||
      current.selectedText !== expected.selectedText ||
      current.lineIndex !== expected.lineIndex
    )
  ) {
    await page.waitForTimeout(50);
    current = await getLyricsContext(editor);
  }
  return current;
}

async function selectLyricsRange(editor, start, end, scrollRatio = null) {
  await editor.evaluate((node, selection) => {
    node.focus();
    node.setSelectionRange(selection.start, selection.end);
    node.dispatchEvent(new Event("select", { bubbles: true }));
    node.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Shift" }));
    const scroll = node.closest('[data-testid="lyrics-shared-scroll"]');
    if (scroll instanceof HTMLElement && selection.scrollRatio !== null) {
      scroll.scrollTop = Math.max(
        0,
        Math.round((scroll.scrollHeight - scroll.clientHeight) * selection.scrollRatio)
      );
    }
  }, { start, end, scrollRatio });
}

async function measureLyricsInputChangeStructure(editor) {
  return editor.evaluate(async (node) => {
    const scroll = node.closest('[data-testid="lyrics-shared-scroll"]');
    const workspace = node.closest('[data-testid="lyrics-workspace"]');
    if (!(scroll instanceof HTMLElement) || !(workspace instanceof HTMLElement)) {
      throw new Error("lyrics input performance fixture is unavailable");
    }

    const editors = Array.from(workspace.querySelectorAll('[data-testid^="lyrics-editor-"]'))
      .filter((candidate) => candidate instanceof HTMLTextAreaElement);
    const mirrors = Array.from(workspace.querySelectorAll('[data-lyrics-editor-measure="true"]'))
      .filter((candidate) => candidate instanceof HTMLTextAreaElement);
    const heightParity = mirrors.length === editors.length
      ? (() => {
          const referenceContentHeights = editors.map((textarea) => {
            const clone = textarea.cloneNode(false);
            clone.removeAttribute("id");
            clone.removeAttribute("data-testid");
            clone.setAttribute("aria-hidden", "true");
            clone.tabIndex = -1;
            clone.value = textarea.value;
            Object.assign(clone.style, {
              position: "absolute",
              inset: "0 auto auto 0",
              width: "100%",
              height: "auto",
              maxHeight: "none",
              visibility: "hidden",
              pointerEvents: "none"
            });
            textarea.parentElement?.append(clone);
            const height = clone.scrollHeight;
            clone.remove();
            return height;
          });
          const viewportFloor = Math.max(280, scroll.clientHeight - 24);
          return {
            referenceCommonHeight: Math.max(viewportFloor, ...referenceContentHeights),
            mirrorCommonHeight: Math.max(viewportFloor, ...mirrors.map((mirror) => mirror.scrollHeight)),
            liveStyleHeights: editors.map((textarea) => Number.parseFloat(textarea.style.height))
          };
        })()
      : null;
    const counts = {
      sharedScrollRectReads: 0,
      editorRectReads: 0,
      editorScrollHeightReads: 0,
      mirrorScrollHeightReads: 0,
      liveEditorHeightWrites: 0
    };
    const restorers = [];
    const patchMethod = (target, property, counter) => {
      const ownDescriptor = Object.getOwnPropertyDescriptor(target, property);
      const original = target[property].bind(target);
      Object.defineProperty(target, property, {
        configurable: true,
        value: (...args) => {
          counts[counter] += 1;
          return original(...args);
        }
      });
      restorers.push(() => {
        if (ownDescriptor) Object.defineProperty(target, property, ownDescriptor);
        else delete target[property];
      });
    };
    const patchGetter = (target, property, counter) => {
      let prototype = target;
      let descriptor;
      while (prototype && !descriptor) {
        descriptor = Object.getOwnPropertyDescriptor(prototype, property);
        prototype = Object.getPrototypeOf(prototype);
      }
      if (!descriptor?.get) throw new Error(`${property} getter is unavailable`);
      const ownDescriptor = Object.getOwnPropertyDescriptor(target, property);
      Object.defineProperty(target, property, {
        configurable: true,
        get: () => {
          counts[counter] += 1;
          return descriptor.get.call(target);
        }
      });
      restorers.push(() => {
        if (ownDescriptor) Object.defineProperty(target, property, ownDescriptor);
        else delete target[property];
      });
    };
    const readAnchorContext = () => {
      const value = node.value;
      const lineCount = Math.max(1, value.split(/\r?\n/).length);
      const lineIndex = value.slice(0, node.selectionStart).split(/\r?\n/).length - 1;
      const scrollRect = HTMLElement.prototype.getBoundingClientRect.call(scroll);
      const editorRect = HTMLElement.prototype.getBoundingClientRect.call(node);
      const editorContentTop = editorRect.top - scrollRect.top + scroll.scrollTop;
      const lineRatio = lineCount > 1 ? lineIndex / (lineCount - 1) : 0;
      const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight");
      const editorScrollHeight = scrollHeightDescriptor?.get?.call(node) ?? node.scrollHeight;
      return {
        selectionStart: node.selectionStart,
        selectionEnd: node.selectionEnd,
        lineIndex,
        scrollTop: scroll.scrollTop,
        anchorOffset: editorContentTop + editorScrollHeight * lineRatio - scroll.scrollTop,
        focused: document.activeElement === node
      };
    };

    const insertionPoint = node.value.indexOf("performance line 41");
    if (insertionPoint < 0) throw new Error("80-line performance fixture is missing");
    node.focus();
    node.setSelectionRange(insertionPoint, insertionPoint);
    scroll.scrollTop = Math.round((scroll.scrollHeight - scroll.clientHeight) * 0.5);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    patchMethod(scroll, "getBoundingClientRect", "sharedScrollRectReads");
    for (const textarea of editors) {
      patchMethod(textarea, "getBoundingClientRect", "editorRectReads");
      patchGetter(textarea, "scrollHeight", "editorScrollHeightReads");
    }
    for (const mirror of mirrors) patchGetter(mirror, "scrollHeight", "mirrorScrollHeightReads");

    const heightObserver = new MutationObserver((records) => {
      counts.liveEditorHeightWrites += records.filter((record) => (
        record.type === "attributes" &&
        record.attributeName === "style" &&
        editors.includes(record.target)
      )).length;
    });
    for (const textarea of editors) {
      heightObserver.observe(textarea, { attributes: true, attributeFilter: ["style"] });
    }

    try {
      const insertedText = "inserted performance line\n";
      const nextValue = `${node.value.slice(0, insertionPoint)}${insertedText}${node.value.slice(insertionPoint)}`;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (!valueSetter) throw new Error("textarea value setter is unavailable");
      valueSetter.call(node, nextValue);
      const nextCaret = insertionPoint + insertedText.length;
      node.setSelectionRange(nextCaret, nextCaret);
      const beforeDispatch = readAnchorContext();
      node.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        data: insertedText,
        inputType: "insertText"
      }));
      counts.liveEditorHeightWrites += heightObserver.takeRecords().length;
      const synchronous = { ...counts };
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      counts.liveEditorHeightWrites += heightObserver.takeRecords().length;
      const settled = readAnchorContext();
      return {
        editorCount: editors.length,
        mirrorCount: mirrors.length,
        heightParity,
        synchronous,
        settled: { ...counts },
        behavior: {
          beforeDispatch,
          settled,
          valueApplied: node.value === nextValue
        }
      };
    } finally {
      heightObserver.disconnect();
      for (const restore of restorers.reverse()) restore();
    }
  });
}

async function assertLyricsInputEditingSemantics(originalLyrics, translationLyrics) {
  const originalFixture = Array.from(
    { length: 80 },
    (_, index) => `input line ${String(index + 1).padStart(2, "0")} original cadence`
  ).join("\n");
  const translationFixture = Array.from(
    { length: 80 },
    (_, index) => `input line ${String(index + 1).padStart(2, "0")} translated cadence`
  ).join("\n");
  await fillExact(originalLyrics, originalFixture);
  await fillExact(translationLyrics, translationFixture);
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));

  const scrollCases = [
    { label: "top", line: 1, ratio: 0 },
    { label: "middle", line: 41, ratio: 0.5 },
    { label: "bottom", line: 80, ratio: 1 }
  ];
  for (const testCase of scrollCases) {
    await fillExact(originalLyrics, originalFixture);
    const marker = `input line ${String(testCase.line).padStart(2, "0")}`;
    const caret = originalFixture.indexOf(marker) + marker.length;
    await selectLyricsRange(originalLyrics, caret, caret, testCase.ratio);
    await page.waitForTimeout(80);
    const before = await getLyricsContext(originalLyrics);
    await originalLyrics.pressSequentially("x");
    await page.waitForFunction(
      ({ expected, testId }) => document.querySelector(`[data-testid="${testId}"]`)?.value === expected,
      {
        expected: `${originalFixture.slice(0, caret)}x${originalFixture.slice(caret)}`,
        testId: "lyrics-editor-original"
      }
    );
    const after = await getLyricsContext(originalLyrics);
    assert.equal(after.start, caret + 1, `${testCase.label} typing advances the caret once`);
    assert.equal(after.end, caret + 1, `${testCase.label} typing keeps a collapsed caret`);
    assert.equal(after.focused, true, `${testCase.label} typing preserves focus`);
    assert.ok(
      Math.abs(after.scrollTop - before.scrollTop) <= 1,
      `${testCase.label} typing preserves shared scroll: ${JSON.stringify({ before, after })}`
    );

    if (testCase.label === "middle") {
      await originalLyrics.press("ArrowLeft");
      let directional = await getLyricsContext(originalLyrics);
      assert.deepEqual(
        { start: directional.start, end: directional.end },
        { start: caret, end: caret },
        "ArrowLeft moves the controlled caret without changing text"
      );
      await originalLyrics.press("Shift+ArrowRight");
      directional = await getLyricsContext(originalLyrics);
      assert.deepEqual(
        { start: directional.start, end: directional.end, selectedText: directional.selectedText },
        { start: caret, end: caret + 1, selectedText: "x" },
        "Shift+ArrowRight preserves the native selection range"
      );
      await originalLyrics.evaluate((node) => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const clicked = await getLyricsContext(originalLyrics);
      assert.deepEqual(
        { start: clicked.start, end: clicked.end, selectedText: clicked.selectedText },
        { start: caret, end: caret + 1, selectedText: "x" },
        "click notification does not stale or collapse the current selection"
      );
    }
  }

  await fillExact(originalLyrics, originalFixture);
  const imeMarker = "input line 41";
  const imeCaret = originalFixture.indexOf(imeMarker) + imeMarker.length;
  const imeResult = await originalLyrics.evaluate(async (node, caret) => {
    const lifecycle = [];
    const onCompositionStart = () => lifecycle.push("compositionstart");
    const onCompositionUpdate = () => lifecycle.push("compositionupdate");
    const onCompositionEnd = () => lifecycle.push("compositionend");
    const onInput = (event) => lifecycle.push(`input:${event.isComposing ? "composing" : "committed"}`);
    node.addEventListener("compositionstart", onCompositionStart);
    node.addEventListener("compositionupdate", onCompositionUpdate);
    node.addEventListener("compositionend", onCompositionEnd);
    node.addEventListener("input", onInput);
    try {
      node.focus();
      node.setSelectionRange(caret, caret);
      node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
      const insertedText = "中文";
      const expected = `${node.value.slice(0, caret)}${insertedText}${node.value.slice(caret)}`;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (!valueSetter) throw new Error("textarea value setter is unavailable");
      valueSetter.call(node, expected);
      node.setSelectionRange(caret + insertedText.length, caret + insertedText.length);
      node.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: insertedText }));
      node.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        data: insertedText,
        inputType: "insertCompositionText",
        isComposing: true
      }));
      node.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: insertedText }));
      node.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        data: insertedText,
        inputType: "insertText",
        isComposing: false
      }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        lifecycle,
        valueApplied: node.value === expected,
        selectionStart: node.selectionStart,
        selectionEnd: node.selectionEnd,
        focused: document.activeElement === node,
        expectedCaret: caret + insertedText.length
      };
    } finally {
      node.removeEventListener("compositionstart", onCompositionStart);
      node.removeEventListener("compositionupdate", onCompositionUpdate);
      node.removeEventListener("compositionend", onCompositionEnd);
      node.removeEventListener("input", onInput);
    }
  }, imeCaret);
  assert.deepEqual(
    imeResult.lifecycle,
    ["compositionstart", "compositionupdate", "input:composing", "compositionend", "input:committed"],
    "Chinese IME keeps its native composition lifecycle"
  );
  assert.equal(imeResult.valueApplied, true, "Chinese IME commits its controlled value");
  assert.deepEqual(
    { start: imeResult.selectionStart, end: imeResult.selectionEnd, focused: imeResult.focused },
    { start: imeResult.expectedCaret, end: imeResult.expectedCaret, focused: true },
    "Chinese IME preserves the committed caret and focus"
  );

  const undoFixture = "undo alpha\nundo beta";
  await fillExact(originalLyrics, undoFixture);
  const undoCaret = "undo alpha".length;
  await selectLyricsRange(originalLyrics, undoCaret, undoCaret);
  await page.keyboard.insertText("Z");
  const redoValue = "undo alphaZ\nundo beta";
  await page.waitForFunction(
    (expected) => document.querySelector('[data-testid="lyrics-editor-original"]')?.value === expected,
    redoValue
  );
  await page.keyboard.press("Control+Z");
  await page.waitForFunction(
    (expected) => document.querySelector('[data-testid="lyrics-editor-original"]')?.value === expected,
    undoFixture
  );
  await page.keyboard.press("Control+Y");
  await page.waitForFunction(
    (expected) => document.querySelector('[data-testid="lyrics-editor-original"]')?.value === expected,
    redoValue
  );
  assert.equal(await originalLyrics.evaluate((node) => document.activeElement === node), true, "native undo and redo preserve editor focus");

  await fillExact(originalLyrics, originalFixture);
  await fillExact(translationLyrics, translationFixture);
  const translationMarker = "input line 41";
  const translationCaret = translationFixture.indexOf(translationMarker) + translationMarker.length;
  await selectLyricsRange(translationLyrics, translationCaret, translationCaret, 0.5);
  await page.keyboard.insertText("T");
  assert.equal(
    await translationLyrics.inputValue(),
    `${translationFixture.slice(0, translationCaret)}T${translationFixture.slice(translationCaret)}`,
    "translation-column typing updates only the active translated document"
  );
  assert.equal(await originalLyrics.inputValue(), originalFixture, "translation-column typing leaves original lyrics unchanged");
  assert.equal(await translationLyrics.evaluate((node) => document.activeElement === node), true, "translation-column typing preserves focus");

  const replacementFixture = "alpha  \nbeta";
  await fillExact(originalLyrics, replacementFixture);
  await selectLyricsRange(originalLyrics, 0, "alpha  ".length, 0);
  await page.waitForFunction(() => /原文第 1.*1 行/.test(
    document.querySelector('[data-testid="lyrics-cleanup-scope-summary"]')?.textContent ?? ""
  ));
  await page.getByTestId("lyrics-command-clean-paste").click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="lyrics-editor-original"]')?.value === "alpha\nbeta"
  );
  const replacementContext = await getLyricsContext(originalLyrics);
  assert.equal(replacementContext.focused, true, "programmatic document replacement restores editor focus");
  assert.deepEqual(
    { start: replacementContext.start, end: replacementContext.end, selectedText: replacementContext.selectedText },
    { start: 0, end: "alpha".length, selectedText: "alpha" },
    "programmatic document replacement restores the transformed selection"
  );
}

async function measureExportCard() {
  return page.evaluate((overflowTolerance) => {
    const root = document.querySelector("[data-export-card-host] [data-export-card]");
    const lyrics = root?.querySelector("[data-card-lyrics]");
    const viewport = root?.querySelector("[data-card-lyrics-viewport]");
    if (!(root instanceof HTMLElement)) return null;
    const overflow = (node) => node instanceof HTMLElement && (
      node.scrollHeight > node.clientHeight + overflowTolerance ||
      node.scrollWidth > node.clientWidth + overflowTolerance
    );
    return {
      width: root.offsetWidth,
      height: root.offsetHeight,
      lyricsClientHeight: lyrics?.clientHeight ?? 0,
      lyricsScrollHeight: lyrics?.scrollHeight ?? 0,
      viewportClientHeight: viewport?.clientHeight ?? 0,
      viewportScrollHeight: viewport?.scrollHeight ?? 0,
      hasOverflow: overflow(lyrics) || overflow(viewport)
    };
  }, exportOverflowTolerance);
}

async function measureExportCardOrphans() {
  return page.evaluate(() => {
    const root = document.querySelector("[data-export-card-host] [data-export-card]");
    if (!(root instanceof HTMLElement)) return null;
    const details = Array.from(root.querySelectorAll("[data-auto-width-line]")).map((element) => {
      const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (!(element instanceof HTMLElement) || !(textNode instanceof Text)) return null;
      const graphemes = Array.from(new Intl.Segmenter("und", { granularity: "grapheme" }).segment(textNode.data));
      const units = [];
      let word = null;
      const flushWord = () => {
        if (word) units.push(word);
        word = null;
      };
      for (const grapheme of graphemes) {
        const end = grapheme.index + grapheme.segment.length;
        if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(grapheme.segment)) {
          flushWord();
          units.push({ start: grapheme.index, end, kind: "cjk", text: grapheme.segment });
        } else if (/[\p{L}\p{N}]/u.test(grapheme.segment)) {
          if (word) {
            word.end = end;
            word.text += grapheme.segment;
          } else {
            word = { start: grapheme.index, end, kind: "word", text: grapheme.segment };
          }
        } else {
          flushWord();
        }
      }
      flushWord();
      const range = document.createRange();
      const fragments = [];
      for (const unit of units) {
        range.setStart(textNode, unit.start);
        range.setEnd(textNode, unit.end);
        for (const rect of range.getClientRects()) {
          if (rect.width > 0) fragments.push({ ...unit, top: rect.top, left: rect.left, right: rect.right });
        }
      }
      const lines = [];
      for (const fragment of fragments.sort((left, right) => left.top - right.top || left.left - right.left)) {
        const line = lines.find((candidate) => Math.abs(candidate.top - fragment.top) <= 2);
        if (line) {
          line.left = Math.min(line.left, fragment.left);
          line.right = Math.max(line.right, fragment.right);
          line.fragments.push(fragment);
        } else {
          lines.push({ top: fragment.top, left: fragment.left, right: fragment.right, fragments: [fragment] });
        }
      }
      const last = lines.at(-1);
      if (!last) return null;
      const unique = Array.from(new Map(last.fragments.map((unit) => [`${unit.start}:${unit.end}`, unit])).values());
      const cjkCount = unique.filter((unit) => unit.kind === "cjk").length;
      const words = unique.filter((unit) => unit.kind === "word");
      const wordCharacters = words.reduce((total, unit) => total + unit.text.length, 0);
      const fill = (last.right - last.left) / Math.max(1, element.clientWidth);
      const severe = lines.length > 1 && fill <= 0.3 && (
        (cjkCount > 0 && unique.length <= 2) ||
        (cjkCount === 0 && words.length > 0 && words.length <= 2 && wordCharacters <= 14)
      );
      return {
        kind: element.getAttribute("data-auto-width-line"),
        index: Number(element.getAttribute("data-auto-width-line-index")),
        visualLines: lines.length,
        lastUnits: unique.length,
        lastFill: Number(fill.toFixed(3)),
        severe
      };
    }).filter(Boolean);
    return {
      measuredLines: details.length,
      lyricLines: details.filter((line) => line.kind === "lyric").length,
      translationLines: details.filter((line) => line.kind === "translation").length,
      wrappedLines: details.filter((line) => line.visualLines > 1).length,
      severeOrphans: details.filter((line) => line.severe).length,
      details: details.filter((line) => line.severe)
    };
  });
}

function mockSearchResults(keyword, limit = 8) {
  return Array.from({ length: limit }, (_, index) => ({
    source: "netease",
    id: String(10_000 + index),
    title: `${keyword} result ${index + 1}`,
    artist: `Mock Artist ${index + 1}`,
    artists: [`Mock Artist ${index + 1}`],
    album: `Mock Album ${index + 1}`,
    durationMs: 180_000 + index * 1_000,
    pageUrl: `https://music.163.com/song?id=${10_000 + index}`
  }));
}

async function assertSongSearchBehavior() {
  const combobox = page.getByRole("combobox", { name: "歌曲搜索" });
  await combobox.fill("keyboard mock");
  const listbox = page.getByTestId("song-search-listbox");
  await listbox.waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForFunction(() => (
    document.querySelector('[role="listbox"] [role="option"]')?.textContent?.includes("keyboard mock")
  ));
  const popup = page.getByTestId("song-search-popup");
  const options = listbox.getByRole("option");
  assert.equal(await options.count(), 8, "mock search renders eight options");
  assert.deepEqual(
    await options.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("tabindex"))),
    Array(8).fill("-1"),
    "active-descendant options never enter the Tab sequence"
  );
  assert.equal(
    await combobox.evaluate((node) => {
      const controlledId = node.getAttribute("aria-controls");
      return Boolean(
        controlledId
        && document.getElementById(controlledId)?.getAttribute("data-testid") === "song-search-listbox"
      );
    }),
    true,
    "combobox aria-controls resolves to its current listbox in one DOM snapshot"
  );
  assert.equal(await listbox.locator('[data-testid="song-search-more"]').count(), 0, "footer action is not a listbox child");
  assert.equal(await popup.getByTestId("song-search-more").count(), 1, "popup shell owns an independent footer action");
  assert.equal(
    await popup.evaluate((node) => getComputedStyle(node).position),
    "static",
    "search results participate in document flow instead of floating over later controls"
  );
  assert.equal(
    await page.getByTestId("song-search-primary").getByText(/方向键|Enter|Esc/).count(),
    0,
    "the mouse-first search UI does not display keyboard instructions"
  );

  const firstId = await options.nth(0).getAttribute("id");
  await waitForActiveDescendant(firstId);
  await combobox.press("ArrowDown");
  const secondId = await options.nth(1).getAttribute("id");
  await waitForActiveDescendant(secondId);
  await page.waitForFunction(() => document.querySelector('[role="option"][aria-selected="true"]')?.id.endsWith("option-1"));
  assert.equal(await combobox.evaluate((node) => document.activeElement === node), true, "ArrowDown keeps DOM focus on the combobox");
  await combobox.press("ArrowUp");
  await waitForActiveDescendant(firstId);
  await combobox.press("Escape");
  await popup.waitFor({ state: "hidden" });
  assert.equal(await combobox.getAttribute("aria-activedescendant"), null);
  assert.equal(await combobox.evaluate((node) => document.activeElement === node), true, "Escape keeps focus on the combobox");

  await combobox.press("ArrowDown");
  await popup.waitFor({ state: "visible" });
  await combobox.press("Tab");
  await page.getByTestId("song-search-more").waitFor({ state: "visible" });
  const tabTarget = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? "",
    role: document.activeElement?.getAttribute("role") ?? "",
    insidePopup: Boolean(document.activeElement?.closest('[data-testid="song-search-popup"]'))
  }));
  assert.equal(tabTarget.insidePopup, true, `Tab reaches the explicit popup footer action: ${JSON.stringify(tabTarget)}`);
  assert.notEqual(tabTarget.role, "option", "Tab never focuses an option");
  assert.equal(tabTarget.tag, "BUTTON", "Tab reaches the more-results button");
  await page.keyboard.press("Tab");
  await popup.waitFor({ state: "hidden" });

  await combobox.fill("mouse mock");
  await listbox.waitFor({ state: "visible" });
  await page.waitForFunction(() => (
    document.querySelector('[role="listbox"] [role="option"]')?.textContent?.includes("mouse mock")
  ));
  await options.nth(2).click();
  await page.waitForFunction(() => document.querySelector('[role="combobox"]')?.hasAttribute("disabled"));
  assert.equal(await options.nth(0).isDisabled(), true, "options disable during resolve");
  await combobox.waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector('[role="combobox"]')?.hasAttribute("disabled"));
  assert.match(await combobox.inputValue(), /result 3 - Mock Artist 3/, "mouse selection resolves the clicked option");
  await popup.waitFor({ state: "hidden" });

  await combobox.fill("enter mock");
  await listbox.waitFor({ state: "visible" });
  await page.waitForFunction(() => (
    document.querySelector('[role="listbox"] [role="option"]')?.textContent?.includes("enter mock")
  ));
  await combobox.press("ArrowDown");
  const activeId = await combobox.getAttribute("aria-activedescendant");
  const activeIndex = Number(activeId?.match(/option-(\d+)$/)?.[1]);
  assert.ok(Number.isInteger(activeIndex), `active descendant exposes an option index: ${activeId}`);
  await setNativeDialogDecision("accept");
  await combobox.press("Enter");
  await page.waitForFunction((expectedIndex) => (
    document.querySelector('[role="combobox"]')?.value === `Resolved result ${expectedIndex + 1} - Mock Artist ${expectedIndex + 1}`
  ), activeIndex);
  assert.match(
    await combobox.inputValue(),
    new RegExp(`Resolved result ${activeIndex + 1} - Mock Artist ${activeIndex + 1}`),
    `Enter resolves active descendant ${activeId}`
  );
  assert.ok(searchRequests.length >= 3, "search route mock received keyboard, Tab, and mouse queries");
  assert.equal(resolveRequests.length, 2, "mouse and Enter each resolve exactly one mocked result");
  assert.match(
    await page.getByTestId("song-import-aside").textContent(),
    new RegExp(`Resolved result ${activeIndex + 1}.*Mock Artist ${activeIndex + 1}`, "s"),
    "resolved song state is reflected in the combined import panel"
  );
}

async function assertSongImportAsideBehavior() {
  const aside = page.getByTestId("song-import-aside");
  const stepper = page.locator('[data-stepper-presentation="focus"]');
  const manualToggle = stepper.getByTestId("song-info-toggle");
  const nextButton = stepper.getByTestId("stepper-next-button");
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  await page.evaluate(() => {
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    const audit = { created: [], revoked: [] };
    window.__songCoverObjectUrlAudit = audit;
    window.__restoreSongCoverObjectUrlAudit = () => {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
    };
    URL.createObjectURL = (blob) => {
      const url = originalCreateObjectUrl(blob);
      audit.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      audit.revoked.push(url);
      originalRevokeObjectUrl(url);
    };
  });
  assert.deepEqual(
    await stepper.locator('.lyrics-stepper-actions button').evaluateAll((buttons) => (
      buttons.map((button) => button.getAttribute('data-testid'))
    )),
    ["song-info-toggle", "stepper-next-button"],
    "manual adjustment stays immediately before Next"
  );
  assert.equal(await manualToggle.getAttribute("aria-expanded"), "false", "manual song details start collapsed");
  const originalTitle = (await aside.getByTestId("song-info-summary").locator("dd").first().textContent())?.trim() ?? "";

  await manualToggle.focus();
  await manualToggle.press("Enter");
  const manualEditor = aside.getByTestId("song-info-editor");
  await manualEditor.waitFor({ state: "visible" });
  await page.waitForFunction(() => Boolean(document.activeElement?.closest('[data-testid="song-info-editor"]')));
  assert.equal(await manualToggle.getAttribute("aria-expanded"), "true", "manual song details open from the keyboard");
  assert.equal(
    await manualEditor.evaluate((node) => node.contains(document.activeElement)),
    true,
    "opening manual song details moves focus into the incoming editor"
  );

  const manualRegionId = await manualToggle.getAttribute("aria-controls");
  assert.ok(manualRegionId, "manual song details expose a controlled region id");
  const manualRegion = page.locator(`#${manualRegionId}`);
  assert.equal(await manualRegion.getAttribute("data-song-info-view"), "editor", "the controlled panel swaps to the editor view");
  const titleInput = manualEditor.locator('input:not([type="file"])').first();
  await titleInput.fill("Discarded manual title");
  const draftCoverInput = manualEditor.locator('input[type="file"]');
  await draftCoverInput.setInputFiles({ name: "draft-one.png", mimeType: "image/png", buffer: tinyPng });
  await page.waitForFunction(() => window.__songCoverObjectUrlAudit?.created.length === 1);
  await draftCoverInput.setInputFiles({ name: "draft-two.png", mimeType: "image/png", buffer: tinyPng });
  await page.waitForFunction(() => {
    const audit = window.__songCoverObjectUrlAudit;
    return Boolean(audit && audit.revoked.includes(audit.created[0]));
  });
  await manualEditor.getByTestId("song-info-cancel").click();
  await page.waitForFunction(() => {
    const audit = window.__songCoverObjectUrlAudit;
    return Boolean(audit && audit.revoked.includes(audit.created[1]));
  });
  const restoredSummary = aside.getByTestId("song-info-summary");
  await restoredSummary.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "song-info-toggle");
  assert.equal(await manualRegion.getAttribute("data-song-info-view"), "summary", "cancel reverses back to the summary view");
  assert.equal(
    (await restoredSummary.locator("dd").first().textContent())?.trim(),
    originalTitle,
    "cancel discards the uncommitted metadata draft"
  );
  assert.equal(
    await manualToggle.evaluate((node) => document.activeElement === node),
    true,
    "cancel returns focus to the manual adjustment entry"
  );

  await manualToggle.click();
  const saveEditor = aside.getByTestId("song-info-editor");
  await saveEditor.waitFor({ state: "visible" });
  await saveEditor.locator('input:not([type="file"])').first().fill("Saved manual title");
  await saveEditor.locator('input[type="file"]').setInputFiles({
    name: "committed-one.png",
    mimeType: "image/png",
    buffer: tinyPng
  });
  await saveEditor.getByTestId("song-info-save").click();
  const savedSummary = aside.getByTestId("song-info-summary");
  await savedSummary.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "song-info-toggle");
  assert.equal(
    (await savedSummary.locator("dd").first().textContent())?.trim(),
    "Saved manual title",
    "save commits the metadata draft before the reverse animation restores the summary"
  );
  assert.equal(await manualToggle.getAttribute("aria-expanded"), "false", "save closes the manual editor");
  assert.equal(
    await manualToggle.evaluate((node) => document.activeElement === node),
    true,
    "save returns focus to the manual adjustment entry"
  );

  await manualToggle.click();
  const replacementEditor = aside.getByTestId("song-info-editor");
  await replacementEditor.waitFor({ state: "visible" });
  await replacementEditor.locator('input[type="file"]').setInputFiles({
    name: "committed-two.png",
    mimeType: "image/png",
    buffer: tinyPng
  });
  await replacementEditor.getByTestId("song-info-save").click();
  await aside.getByTestId("song-info-summary").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const audit = window.__songCoverObjectUrlAudit;
    return Boolean(audit && audit.created.length === 4 && audit.revoked.includes(audit.created[2]));
  });
  const objectUrlAudit = await page.evaluate(() => window.__songCoverObjectUrlAudit);
  assert.deepEqual(
    objectUrlAudit.revoked,
    objectUrlAudit.created.slice(0, 3),
    "replaced drafts, cancelled drafts, and replaced committed covers each release their object URL once"
  );
  assert.equal(
    objectUrlAudit.revoked.includes(objectUrlAudit.created[3]),
    false,
    "the currently committed local cover remains usable"
  );

  await manualToggle.click();
  const guardedEditor = aside.getByTestId("song-info-editor");
  await guardedEditor.waitFor({ state: "visible" });
  await guardedEditor.locator('input:not([type="file"])').first().fill("Stale manual title");
  const linkInput = page.locator('[data-testid="song-import-alternates"] input:not([type="file"])').first();
  await linkInput.fill("https://example.com/revision-guard");
  await page.waitForFunction((toggleSelector) => {
    const toggle = document.querySelector(toggleSelector);
    const regionId = toggle?.getAttribute("aria-controls");
    const region = regionId ? document.getElementById(regionId) : null;
    return toggle?.getAttribute("aria-expanded") === "false" &&
      region?.getAttribute("data-song-info-view") === "summary";
  }, activeSongInfoToggleSelector);
  const guardedSummary = aside.getByTestId("song-info-summary");
  await guardedSummary.waitFor({ state: "visible" });
  assert.equal(
    (await guardedSummary.locator("dd").first().textContent())?.trim(),
    "Saved manual title",
    "an external document revision closes the editor without overwriting newer document state"
  );
  assert.equal(await manualToggle.getAttribute("aria-expanded"), "false", "an external document revision resets the editor state");
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "song-info-toggle");
  await linkInput.fill("");
  await manualToggle.focus();

  await manualToggle.press("Tab");
  assert.equal(
    await nextButton.evaluate((node) => document.activeElement === node),
    true,
    "the collapsed action row keeps manual adjustment immediately before Next"
  );
  await page.evaluate(() => {
    window.__restoreSongCoverObjectUrlAudit?.();
    delete window.__restoreSongCoverObjectUrlAudit;
    delete window.__songCoverObjectUrlAudit;
  });
}

async function assertExamplesSurfaceBehavior() {
  await setWindowSize(1000, 700);
  const entry = page.locator('[data-testid="editor-surface"] [data-testid="examples-button"]');
  await entry.click();
  const surface = page.getByTestId("examples-surface");
  await page.locator('[data-testid="examples-surface"][data-surface-state="open"]').waitFor({ state: "visible" });
  const close = page.getByTestId("examples-close-button");
  await close.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "examples-close-button");

  const geometry = await surface.evaluate((node) => {
    const header = node.querySelector(".examples-wing__header");
    const closeButton = node.querySelector('[data-testid="examples-close-button"]');
    const scroller = node.querySelector(".examples-floor__content-scroll");
    const lastCard = node.querySelector(".example-song-card:last-child");
    if (!(node instanceof HTMLElement) || !(header instanceof HTMLElement) ||
        !(closeButton instanceof HTMLElement) ||
        !(scroller instanceof HTMLElement) || !(lastCard instanceof HTMLElement)) return null;
    scroller.scrollTop = scroller.scrollHeight;
    const toRect = (element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    };
    return {
      surface: toRect(node),
      header: toRect(header),
      close: toRect(closeButton),
      scroller: toRect(scroller),
      lastCard: toRect(lastCard),
      bottomBlurCount: node.querySelectorAll('[data-testid="examples-bottom-gradual-blur"]').length,
      legacyHeaderCount: node.querySelectorAll(".editor-header").length
    };
  });
  assert.ok(geometry, "examples surface exposes measurable header, scroller, and cards");
  assert.ok(geometry.close.right <= geometry.surface.right + 0.5, `examples close stays inside the right edge: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.close.top >= geometry.header.top && geometry.close.bottom <= geometry.header.bottom, "examples close sits in the top header");
  assert.equal(geometry.bottomBlurCount, 0, "examples no longer render a bottom blur layer");
  assert.equal(geometry.legacyHeaderCount, 0, "examples no longer render the legacy bottom app header");
  assert.ok(geometry.lastCard.bottom <= geometry.scroller.bottom + 1, `the final card scrolls fully into the clear viewport: ${JSON.stringify(geometry)}`);

  await page.keyboard.press("Escape");
  await page.locator('[data-testid="examples-surface"][data-surface-state="closed"]').waitFor({ state: "attached" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "examples-button");
  assert.equal(await entry.evaluate((node) => document.activeElement === node), true, "Escape restores focus to the examples entry");

  await entry.click();
  await close.waitFor({ state: "visible" });
  await close.click();
  await page.locator('[data-testid="examples-surface"][data-surface-state="closed"]').waitFor({ state: "attached" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "examples-button");
  assert.equal(await entry.evaluate((node) => document.activeElement === node), true, "the top-right X restores focus to the examples entry");
}

async function selectVisualTheme(mode, acrylicEnabled) {
  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await waitForVisible("settings-surface");
  await selectSettingsSection("appearance");
  const panel = page.locator('[data-settings-panel="appearance"]:not([hidden])');
  await panel.locator(`[data-segment-value="${mode}"]`).click();
  const acrylicToggle = panel.getByRole("switch").first();
  if ((await acrylicToggle.getAttribute("aria-checked") === "true") !== acrylicEnabled) {
    await acrylicToggle.click();
  }
  const expectedTheme = acrylicEnabled ? `${mode}-acrylic` : mode;
  await page.waitForFunction(
    (theme) => document.querySelector('.app-shell')?.getAttribute('data-ui-theme') === theme,
    expectedTheme
  );
  await page.getByTestId("settings-close-button").click();
  await page.locator('[data-testid="settings-surface"][data-surface-state="closed"]').waitFor({ state: "attached" });
  await page.waitForFunction(() => {
    const surface = document.querySelector('[data-testid="settings-surface"][data-surface-state="closed"]');
    if (!(surface instanceof HTMLElement)) return false;
    const transform = new DOMMatrixReadOnly(getComputedStyle(surface).transform);
    return transform.m41 >= surface.getBoundingClientRect().width - 1;
  }, undefined, { timeout: 5_000 });
}

async function analyzeTitlebarVisualEffect(theme) {
  const effect = page.getByTestId("titlebar-gradual-blur");
  await effect.waitFor({ state: "visible" });
  const geometry = await page.evaluate(() => {
    const toRect = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right };
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      titlebar: toRect(document.querySelector(".desktop-titlebar")),
      effect: toRect(document.querySelector('[data-testid="titlebar-gradual-blur"]')),
      rail: toRect(document.querySelector(".lyrics-stepper-rail")),
      content: toRect(document.querySelector(".lyrics-stepper-content"))
    };
  });
  assert.ok(geometry.titlebar && geometry.effect && geometry.rail && geometry.content, `${theme} exposes measurable titlebar and content geometry`);
  assert.ok(Math.abs(geometry.titlebar.bottom - 48) <= 0.5, `${theme} keeps the measured 48px titlebar edge`);
  assert.ok(geometry.rail.top > geometry.titlebar.bottom, `${theme} places the Stepper rail below the titlebar edge`);
  assert.ok(geometry.effect.bottom >= geometry.titlebar.bottom + 20, `${theme} keeps a short progressive fade below the titlebar`);
  assert.ok(geometry.effect.bottom <= geometry.titlebar.bottom + 24.5, `${theme} releases normal content within 24px below the titlebar`);

  const clip = {
    x: 0,
    y: 0,
    width: Math.floor(geometry.viewport.width),
    height: Math.min(Math.ceil(geometry.effect.bottom + 36), Math.floor(geometry.viewport.height))
  };
  const prefix = `titlebar-${theme}`;
  await effect.evaluate((element) => {
    element.style.visibility = "hidden";
  });
  await page.waitForTimeout(180);
  const offBuffer = await page.screenshot({
    path: path.join(reportDirectory, `${prefix}-effect-off.png`),
    clip
  });
  const originalBackdropFilter = await effect.evaluate((element) => {
    element.style.removeProperty("visibility");
    const original = {
      backdropFilter: element.style.getPropertyValue("backdrop-filter"),
      webkitBackdropFilter: element.style.getPropertyValue("-webkit-backdrop-filter")
    };
    element.style.setProperty("backdrop-filter", "none");
    element.style.setProperty("-webkit-backdrop-filter", "none");
    return original;
  });
  await page.waitForTimeout(180);
  const blurOffBuffer = await page.screenshot({
    path: path.join(reportDirectory, `${prefix}-blur-off.png`),
    clip
  });
  await effect.evaluate((element, original) => {
    element.style.setProperty("backdrop-filter", original.backdropFilter);
    element.style.setProperty("-webkit-backdrop-filter", original.webkitBackdropFilter);
  }, originalBackdropFilter);
  await page.waitForTimeout(180);
  const onBuffer = await page.screenshot({
    path: path.join(reportDirectory, `${prefix}-effect-on.png`),
    clip
  });
  await page.screenshot({ path: path.join(reportDirectory, `${prefix}-final.png`), fullPage: false });

  const images = {
    off: offBuffer.toString("base64"),
    blurOff: blurOffBuffer.toString("base64"),
    on: onBuffer.toString("base64")
  };
  const metrics = await page.evaluate(async ({ images: encoded, geometry: measured, clip: crop }) => {
    const loadImage = (base64) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not decode titlebar comparison screenshot"));
      image.src = `data:image/png;base64,${base64}`;
    });
    const [offImage, blurOffImage, onImage] = await Promise.all([
      loadImage(encoded.off),
      loadImage(encoded.blurOff),
      loadImage(encoded.on)
    ]);
    if (
      offImage.width !== onImage.width || offImage.height !== onImage.height ||
      blurOffImage.width !== onImage.width || blurOffImage.height !== onImage.height
    ) {
      throw new Error("Titlebar comparison screenshots have different dimensions");
    }
    const canvas = document.createElement("canvas");
    canvas.width = onImage.width;
    canvas.height = onImage.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is unavailable for titlebar comparison");
    context.drawImage(offImage, 0, 0);
    const offPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(blurOffImage, 0, 0);
    const blurOffPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(onImage, 0, 0);
    const onPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const scaleX = canvas.width / crop.width;
    const scaleY = canvas.height / crop.height;
    const luma = (pixels, offset) => 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
    const stripWidth = Math.max(2, Math.round(24 * scaleX));
    const rowLuma = (pixels, y) => {
      let total = 0;
      let count = 0;
      for (const [start, end] of [[0, stripWidth], [canvas.width - stripWidth, canvas.width]]) {
        for (let x = start; x < end; x += 1) {
          total += luma(pixels, (y * canvas.width + x) * 4);
          count += 1;
        }
      }
      return total / count;
    };
    const offRows = Array.from({ length: canvas.height }, (_, y) => rowLuma(offPixels, y));
    const onRows = Array.from({ length: canvas.height }, (_, y) => rowLuma(onPixels, y));
    const effectRows = onRows.map((value, y) => Math.abs(value - offRows[y]));
    const cssRow = (value) => Math.max(0, Math.min(canvas.height - 1, Math.round((value - crop.y) * scaleY)));
    const startY = cssRow(measured.titlebar.bottom - 4);
    const endY = cssRow(measured.effect.bottom);
    let rgbDifference = 0;
    let blurRgbDifference = 0;
    let rgbSamples = 0;
    for (let y = startY; y <= endY; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        rgbDifference += Math.abs(onPixels[offset] - offPixels[offset]);
        rgbDifference += Math.abs(onPixels[offset + 1] - offPixels[offset + 1]);
        rgbDifference += Math.abs(onPixels[offset + 2] - offPixels[offset + 2]);
        blurRgbDifference += Math.abs(onPixels[offset] - blurOffPixels[offset]);
        blurRgbDifference += Math.abs(onPixels[offset + 1] - blurOffPixels[offset + 1]);
        blurRgbDifference += Math.abs(onPixels[offset + 2] - blurOffPixels[offset + 2]);
        rgbSamples += 3;
      }
    }
    const adjacentSteps = [];
    for (let y = startY + 1; y <= endY; y += 1) adjacentSteps.push(Math.abs(effectRows[y] - effectRows[y - 1]));
    const boundaryCenter = cssRow(measured.titlebar.bottom);
    const boundaryGradients = [];
    for (let y = Math.max(1, boundaryCenter - Math.ceil(3 * scaleY)); y <= Math.min(canvas.height - 1, boundaryCenter + Math.ceil(3 * scaleY)); y += 1) {
      boundaryGradients.push(Math.abs(onRows[y] - onRows[y - 1]));
    }
    const terminalStart = Math.max(startY, endY - Math.ceil(8 * scaleY));
    const terminalRows = effectRows.slice(terminalStart, endY + 1);
    const sampleDifference = (cssY) => effectRows[cssRow(cssY)];
    return {
      image: { width: canvas.width, height: canvas.height, scaleX, scaleY },
      meanRgbDifference: rgbDifference / rgbSamples,
      blurMeanRgbDifference: blurRgbDifference / rgbSamples,
      peakRowDifference: Math.max(...effectRows.slice(startY, endY + 1)),
      transitionRowDifference: sampleDifference(
        Math.min(measured.effect.bottom - 10, measured.titlebar.bottom + 8)
      ),
      terminalRowDifference: terminalRows.reduce((sum, value) => sum + value, 0) / terminalRows.length,
      maxAdjacentEffectStep: Math.max(...adjacentSteps),
      maxBoundaryLumaGradient: Math.max(...boundaryGradients)
    };
  }, { images, geometry, clip });

  const comparisonDataUrl = await page.evaluate(async ({ images: encoded }) => {
    const loadImage = (base64) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `data:image/png;base64,${base64}`;
    });
    const [offImage, onImage] = await Promise.all([loadImage(encoded.off), loadImage(encoded.on)]);
    const labelHeight = 36;
    const canvas = document.createElement("canvas");
    canvas.width = offImage.width + onImage.width;
    canvas.height = Math.max(offImage.height, onImage.height) + labelHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable for titlebar comparison board");
    context.fillStyle = "#111827";
    context.fillRect(0, 0, canvas.width, labelHeight);
    context.fillStyle = "#ffffff";
    context.font = "600 20px sans-serif";
    context.fillText("EFFECT OFF", 16, 25);
    context.fillText("EFFECT ON", offImage.width + 16, 25);
    context.drawImage(offImage, 0, labelHeight);
    context.drawImage(onImage, offImage.width, labelHeight);
    return canvas.toDataURL("image/png");
  }, { images });
  await writeFile(
    path.join(reportDirectory, `${prefix}-comparison.png`),
    Buffer.from(comparisonDataUrl.replace(/^data:image\/png;base64,/, ""), "base64")
  );

  if (theme.endsWith("-acrylic")) {
    assert.ok(
      metrics.meanRgbDifference >= 0.4,
      `${theme} short enabled effect differs measurably from disabled: ${JSON.stringify(metrics)}`
    );
    assert.ok(
      metrics.blurMeanRgbDifference >= 0.05,
      `${theme} wrapper backdrop-filter measurably changes pixels beyond the unchanged veil: ${JSON.stringify(metrics)}`
    );
    const minimumTransitionRowDifference = 0.15 * Math.min(2, metrics.image.scaleY);
    assert.ok(
      metrics.transitionRowDifference >= minimumTransitionRowDifference,
      `${theme} effect remains measurable inside the short edge transition at ${metrics.image.scaleY}x: ${JSON.stringify(metrics)}`
    );
  }
  assert.ok(
    metrics.terminalRowDifference <= Math.max(1.2, metrics.peakRowDifference * 0.32),
    `${theme} effect decays near its lower edge instead of ending as a hard band: ${JSON.stringify(metrics)}`
  );
  assert.ok(
    metrics.maxAdjacentEffectStep <= Math.max(4.5, metrics.peakRowDifference * 0.38),
    `${theme} effect contribution has no single-row luminance jump: ${JSON.stringify(metrics)}`
  );
  assert.ok(metrics.maxBoundaryLumaGradient <= 7, `${theme} titlebar edge has no visible one-line luminance seam: ${JSON.stringify(metrics)}`);
  titlebarVisualMetrics.push({ theme, geometry, metrics });
}

async function assertTitlebarWindowInteractions() {
  await setWindowSize(1000, 700);
  const titlebar = page.locator(".desktop-titlebar");
  const effect = page.getByTestId("titlebar-gradual-blur");
  const buttons = [
    page.locator(".traffic-light--close"),
    page.locator(".traffic-light--minimize"),
    page.locator(".traffic-light--maximize")
  ];
  const stacking = await page.evaluate(() => {
    const bar = document.querySelector(".desktop-titlebar");
    const visualEffect = document.querySelector('[data-testid="titlebar-gradual-blur"]');
    const brand = document.querySelector(".desktop-titlebar__brand");
    if (!(bar instanceof HTMLElement) || !(visualEffect instanceof HTMLElement) || !(brand instanceof HTMLElement)) return null;
    return {
      dragRegion: getComputedStyle(bar).getPropertyValue("-webkit-app-region"),
      effectPointerEvents: getComputedStyle(visualEffect).pointerEvents,
      effectZIndex: Number(getComputedStyle(visualEffect).zIndex),
      brandZIndex: Number(getComputedStyle(brand).zIndex)
    };
  });
  assert.deepEqual(
    stacking,
    { dragRegion: "drag", effectPointerEvents: "none", effectZIndex: 0, brandZIndex: 2 },
    "titlebar effect stays below sharp brand content and does not intercept the drag region"
  );
  for (const button of buttons) {
    await button.click({ trial: true });
    assert.equal(
      await button.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === node;
      }),
      true,
      "each traffic-light center remains the topmost clickable hit target"
    );
  }

  await buttons[2].click();
  await page.waitForFunction(() => document.body.dataset.windowMaximized === "true");
  assert.equal(
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized()),
    true,
    "maximize traffic light maximizes the native window"
  );
  await buttons[2].click();
  await page.waitForFunction(() => document.body.dataset.windowMaximized === "false");
  assert.equal(
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized()),
    false,
    "restore traffic light returns the native window to windowed mode"
  );

  await buttons[1].click();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())) break;
    await page.waitForTimeout(50);
  }
  assert.equal(
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()),
    true,
    "minimize traffic light minimizes the native window"
  );
  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.restore();
    window.show();
    window.focus();
  });
  await page.waitForFunction(() => document.visibilityState === "visible");

  await setWindowSize(1000, 700);
  assert.equal(
    await page.evaluate(() => {
      const hit = document.elementFromPoint(500, 24);
      return Boolean(hit?.closest(".desktop-titlebar") && !hit.closest("button"));
    }),
    true,
    "an empty titlebar point reaches the native drag region instead of an effect or control"
  );
  await titlebar.waitFor({ state: "visible" });
  await effect.waitFor({ state: "visible" });
}

async function assertTitlebarScrollPerformance() {
  await setWindowSize(1000, 700);
  const effect = page.getByTestId("titlebar-gradual-blur");
  const runPass = async (enabled) => {
    await effect.evaluate((element, shouldEnable) => {
      if (shouldEnable) element.style.removeProperty("visibility");
      else element.style.visibility = "hidden";
    }, enabled);
    await page.waitForTimeout(120);
    return page.evaluate(async () => {
      const scroller = document.querySelector('[data-testid="lyrics-shared-scroll"]');
      if (!(scroller instanceof HTMLElement)) throw new Error("Lyrics scroller is unavailable for performance comparison");
      const maximum = scroller.scrollHeight - scroller.clientHeight;
      if (maximum <= 0) throw new Error("Lyrics scroller does not have enough overflow for performance comparison");
      const intervals = [];
      await new Promise((resolve) => {
        let frame = 0;
        let previous = performance.now();
        const tick = (now) => {
          if (frame > 0) intervals.push(now - previous);
          previous = now;
          scroller.scrollTop = maximum * (0.5 + 0.45 * Math.sin(frame / 8));
          frame += 1;
          if (frame <= 96) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      scroller.scrollTop = 0;
      const sorted = [...intervals].sort((a, b) => a - b);
      return {
        frames: intervals.length,
        meanMs: intervals.reduce((sum, value) => sum + value, 0) / intervals.length,
        p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
        over34Ms: intervals.filter((value) => value > 34).length
      };
    });
  };
  const disabled = await runPass(false);
  const enabled = await runPass(true);
  assert.equal(enabled.frames, disabled.frames, "scroll comparison samples the same number of frames");
  assert.ok(enabled.p95Ms <= Math.max(50, disabled.p95Ms * 2.5 + 8), `titlebar blur keeps reasonable p95 scroll pacing: ${JSON.stringify({ disabled, enabled })}`);
  assert.ok(enabled.meanMs <= Math.max(30, disabled.meanMs * 2 + 6), `titlebar blur keeps reasonable mean scroll pacing: ${JSON.stringify({ disabled, enabled })}`);
  assert.ok(enabled.over34Ms <= disabled.over34Ms + 12, `titlebar effect does not add sustained long frames: ${JSON.stringify({ disabled, enabled })}`);
  titlebarPerformanceComparison = { disabled, enabled };
}

async function assertAcrylicVisuals() {
  await setWindowSize(1440, 900);
  await page.locator('button[data-step-id="link"]').click();
  await selectVisualTheme("light", true);

  const lightTokens = await page.evaluate(() => {
    const shell = document.querySelector('.app-shell');
    const primary = document.querySelector('[data-testid="song-search-primary"]');
    const panel = primary?.querySelector('.glass-panel');
    const input = primary?.querySelector('.field-shell');
    const button = document.querySelector('[data-testid="song-info-toggle"]');
    const subtle = primary?.querySelector('.app-text-subtle');
    if (!(shell instanceof HTMLElement) || !(panel instanceof HTMLElement) ||
        !(input instanceof HTMLElement) || !(button instanceof HTMLElement) ||
        !(subtle instanceof HTMLElement)) return null;
    const shellStyle = getComputedStyle(shell);
    return {
      theme: shell.dataset.uiTheme,
      muted: shellStyle.getPropertyValue('--app-muted').trim(),
      subtle: shellStyle.getPropertyValue('--app-subtle').trim(),
      panelBackground: getComputedStyle(panel).backgroundColor,
      inputBackground: getComputedStyle(input).backgroundColor,
      inputBorder: getComputedStyle(input).borderTopColor,
      buttonBackground: getComputedStyle(button).backgroundColor,
      subtleColor: getComputedStyle(subtle).color
    };
  });
  assert.deepEqual(
    lightTokens && { theme: lightTokens.theme, muted: lightTokens.muted, subtle: lightTokens.subtle },
    { theme: "light-acrylic", muted: "51 65 85", subtle: "71 85 105" },
    "light acrylic exposes opaque muted and subtle text tokens"
  );
  assert.match(lightTokens?.panelBackground ?? "", /rgba\(255, 255, 255, 0\.7\)/, "light acrylic panels keep a 70% white surface");
  assert.match(lightTokens?.inputBackground ?? "", /rgba\(255, 255, 255, 0\.76\)/, "light acrylic inputs keep a 76% white surface");
  assert.match(lightTokens?.buttonBackground ?? "", /rgba\(255, 255, 255, 0\.6\)/, "light acrylic buttons keep a 60% white surface");
  assert.equal(lightTokens?.subtleColor, "rgb(71, 85, 105)", "light acrylic subtle copy is fully opaque");
  await page.screenshot({ path: path.join(reportDirectory, "light-acrylic-step-one.png"), fullPage: false });
  if (runVisualDiagnostics) await analyzeTitlebarVisualEffect("light-acrylic");

  await selectVisualTheme("dark", true);
  const darkTokens = await page.evaluate(() => {
    const shell = document.querySelector('.app-shell');
    if (!(shell instanceof HTMLElement)) return null;
    const style = getComputedStyle(shell);
    return {
      theme: shell.dataset.uiTheme,
      foreground: style.getPropertyValue('--app-fg').trim(),
      panel: style.getPropertyValue('--panel-bg').trim()
    };
  });
  assert.deepEqual(
    darkTokens,
    { theme: "dark-acrylic", foreground: "255 255 255", panel: "15 23 42/0.34" },
    "dark acrylic keeps its existing foreground and transparent panel tokens"
  );
  await page.screenshot({ path: path.join(reportDirectory, "dark-acrylic-step-one.png"), fullPage: false });
  if (runVisualDiagnostics) await analyzeTitlebarVisualEffect("dark-acrylic");

  await selectVisualTheme("light", false);
  assert.equal(
    await page.locator(".app-shell").getAttribute("data-ui-theme"),
    "light",
    "ordinary light theme remains selectable without Acrylic"
  );
  if (runVisualDiagnostics) await analyzeTitlebarVisualEffect("light");

  await selectVisualTheme("dark", false);
  assert.equal(
    await page.locator(".app-shell").getAttribute("data-ui-theme"),
    "dark",
    "ordinary dark theme remains selectable without Acrylic"
  );
  if (runVisualDiagnostics) await analyzeTitlebarVisualEffect("dark");
}

async function assertFontPickerBehavior() {
  await page.locator('button[data-step-id="font"]').click();
  await page.getByTestId("font-scheme-panel").waitFor({ state: "visible" });

  const presetFontFamilies = await page.locator('[data-testid^="apply-font-preset-"]').evaluateAll((buttons) => (
    buttons.map((button) => ({
      testId: button.getAttribute("data-testid"),
      fontFamily: getComputedStyle(button).fontFamily
    }))
  ));
  assert.match(
    presetFontFamilies.find((item) => item.testId === "apply-font-preset-source-han-sans")?.fontFamily ?? "",
    /Source Han Sans SC.*sans-serif/i,
    "the Source Han Sans card renders the entire button in its own font stack"
  );
  assert.match(
    presetFontFamilies.find((item) => item.testId === "apply-font-preset-source-han-serif")?.fontFamily ?? "",
    /Source Han Serif SC.*serif/i,
    "the Source Han Serif card renders the entire button in its own font stack"
  );

  const overview = page.getByTestId("font-scheme-overview");
  const customTrigger = page.getByTestId("edit-custom-font-scheme");
  const picker = page.getByTestId("font-picker-scheme");
  const cjkRole = page.getByTestId("font-picker-category-cjk");
  const latinRole = page.getByTestId("font-picker-category-latin");
  const historicalPreview = page.getByTestId("font-scheme-preview-panel");
  const realPreview = page.locator('[data-testid="lyric-card-preview"] article[data-export-card="true"]');
  assert.equal(await overview.count(), 1, "the font page starts in its compact overview");
  assert.equal(await customTrigger.count(), 1, "custom font editing has one overview entry point");
  assert.equal(await cjkRole.count(), 0, "role selection is not duplicated outside the editor subview");
  assert.equal(await latinRole.count(), 0, "the Latin role selector is also absent from the overview");
  assert.equal(await picker.count(), 0, "the inline workbench stays collapsed before custom editing starts");
  assert.equal(await historicalPreview.count(), 0, "the historical sample card is absent outside custom editing");
  assert.equal(await page.getByTestId("apply-font-preset-source-han-sans").getAttribute("aria-pressed"), "true", "the fresh font page marks the saved preset in place");

  await customTrigger.click();
  await picker.waitFor({ state: "visible" });
  await overview.waitFor({ state: "detached" });
  await historicalPreview.waitFor({ state: "visible" });
  await realPreview.waitFor({ state: "detached" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "font-picker-search");
  assert.equal(await cjkRole.count(), 1, "the editor subview exposes one CJK role selector");
  assert.equal(await latinRole.count(), 1, "the editor subview exposes one Latin role selector");
  const windowsDuringEdit = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  assert.equal(windowsDuringEdit, 1, "font editing remains inside the main application window");
  assert.equal(await historicalPreview.count(), 1, "the font specimen replaces the real lyric card in the right pane");

  const firstCjkOption = picker.locator('[data-font-family="Microsoft YaHei"]').first();
  await firstCjkOption.hover();
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="font-lyric-preview"] p')?.getAttribute("style")?.includes("Microsoft YaHei")
  ));
  assert.equal(await picker.getAttribute("data-dirty"), "false", "hover preview does not mutate the font draft");
  await firstCjkOption.click();
  assert.equal(await page.getByTestId("save-custom-font-scheme").isEnabled(), true, "changing either role enables atomic apply");
  assert.match(
    await page.getByTestId("font-lyric-preview").locator("p").first().evaluate((node) => node.style.fontFamily),
    /Microsoft YaHei/,
    "the restored sample card follows the CJK draft"
  );
  await page.getByTestId("cancel-custom-font-scheme").click();
  await picker.waitFor({ state: "detached" });
  await overview.waitFor({ state: "visible" });
  await realPreview.waitFor({ state: "visible" });
  await historicalPreview.waitFor({ state: "detached" });
  assert.equal(await historicalPreview.count(), 0, "cancelling custom editing hides the historical sample card");
  assert.doesNotMatch(await customTrigger.textContent() ?? "", /Microsoft YaHei/, "cancelling discards the entire two-font draft");
  assert.equal(await customTrigger.evaluate((node) => document.activeElement === node), true, "cancelling restores focus to the single custom-scheme entry");

  await customTrigger.click();
  await picker.waitFor({ state: "visible" });
  await picker.locator('[data-font-family="Microsoft YaHei"]').first().click();
  await latinRole.click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "font-picker-search");
  await picker.locator('[data-font-family="Arial"]').first().click();
  assert.match(await cjkRole.textContent() ?? "", /Microsoft YaHei/, "the sole CJK role selector reflects its draft selection");
  assert.match(await latinRole.textContent() ?? "", /Arial/, "the sole Latin role selector reflects its draft selection");
  assert.equal(await picker.getAttribute("data-dirty"), "true", "selected draft fonts remain explicitly unapplied");
  assert.match(await page.getByTestId("font-scheme-draft-status").textContent() ?? "", /尚未应用|not yet applied/i, "the editor distinguishes its draft from the applied scheme");
  assert.equal(await realPreview.count(), 0, "the real lyric card stays offstage while the draft specimen is active");
  assert.match(
    await page.getByTestId("font-lyric-preview").locator("p").nth(1).evaluate((node) => node.style.fontFamily),
    /Arial/,
    "the restored sample card follows the Latin draft"
  );
  await picker.screenshot({ path: path.join(reportDirectory, "inline-font-picker-panel.png") });
  await historicalPreview.screenshot({ path: path.join(reportDirectory, "font-scheme-sample-card.png") });
  await page.screenshot({ path: path.join(reportDirectory, "inline-font-picker-with-sample-card.png"), fullPage: false });
  await page.getByTestId("save-custom-font-scheme").click();
  await picker.waitFor({ state: "detached" });
  await overview.waitFor({ state: "visible" });
  await realPreview.waitFor({ state: "visible" });
  await historicalPreview.waitFor({ state: "detached" });
  assert.match(await customTrigger.textContent() ?? "", /Microsoft YaHei/, "applying commits the selected CJK font");
  assert.match(await customTrigger.textContent() ?? "", /Arial/, "the same apply action commits the selected Latin font");
  const appliedPreviewFamily = await realPreview.evaluate((card) => getComputedStyle(card).fontFamily);
  assert.match(appliedPreviewFamily, /Microsoft YaHei/, "the committed pair reaches the real lyric-card preview");
  assert.match(appliedPreviewFamily, /Arial/, "the real lyric-card preview receives the Latin family too");
  assert.equal(await historicalPreview.count(), 0, "applying custom fonts hides the editing-only sample card");
  assert.equal(await customTrigger.evaluate((node) => document.activeElement === node), true, "apply restores focus to the single custom-scheme entry");

  await page.locator('button[data-step-id="link"]').click();
  await page.locator('button[data-step-id="font"]').click();
  await page.getByTestId("font-scheme-panel").waitFor({ state: "visible" });
  assert.match(await page.getByTestId("edit-custom-font-scheme").textContent() ?? "", /Microsoft YaHei/, "reopening the font page preserves the saved CJK selection");
  assert.match(await page.getByTestId("edit-custom-font-scheme").textContent() ?? "", /Arial/, "reopening the font page preserves the saved Latin selection");

  await page.getByTestId("apply-font-preset-source-han-sans").click();
  await page.waitForFunction(() => {
    const preset = document.querySelector('[data-testid="apply-font-preset-source-han-sans"]');
    const custom = document.querySelector('[data-testid="edit-custom-font-scheme"]')?.textContent ?? "";
    return preset?.getAttribute("aria-pressed") === "true" && !custom.includes("Microsoft YaHei") && !custom.includes("Arial");
  });

  await page.locator('button[data-step-id="link"]').click();
}

async function assertFocusedPresentation(width, height) {
  await setWindowSize(width, height);
  await waitForLayoutStable(page.locator('[data-stepper-presentation="focus"]'));
  const result = await page.evaluate(() => {
    const editor = document.querySelector('[data-testid="editor-surface"]');
    const stepper = editor?.querySelector('[data-stepper-presentation="focus"]');
    const rail = stepper?.querySelector('.lyrics-stepper-rail');
    const heading = rail?.querySelector('[data-stepper-heading-row="true"]');
    const headerActions = heading?.querySelector('[data-testid="editor-header-actions"]');
    const content = stepper?.querySelector('.lyrics-stepper-content');
    const companion = stepper?.querySelector('[data-stepper-companion="true"]');
    const preview = document.querySelector('[data-testid="lyric-card-preview"]');
    const previewToggle = document.querySelector('[data-testid="preview-pane-toggle"]');
    const exportHost = document.querySelector('[data-export-card-host]');
    const search = document.querySelector('[role="combobox"]');
    const primary = document.querySelector('[data-testid="song-search-primary"]');
    const alternates = document.querySelector('[data-testid="song-import-alternates"]');
    const linkEntry = alternates?.querySelector('input:not([type="file"])');
    const localEntry = alternates?.querySelector('input[type="file"]');
    const stepperRect = stepper?.getBoundingClientRect();
    const asideRect = document.querySelector('[data-testid="song-import-aside"]')?.getBoundingClientRect();
    const aside = document.querySelector('[data-testid="song-import-aside"]');
    const railRect = rail?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    const companionRect = companion?.getBoundingClientRect();
    const actionsRect = headerActions?.getBoundingClientRect();
    const geometryTolerance = 1;
    const expectedAsideWidth = window.innerWidth >= 1440 ? 400 : window.innerWidth >= 1180 ? 360 : 320;
    return {
      stepper: stepperRect ? { x: stepperRect.x, width: stepperRect.width } : null,
      aside: asideRect ? { x: asideRect.x, width: asideRect.width } : null,
      content: contentRect ? { x: contentRect.x, width: contentRect.width } : null,
      expectedAsideWidth,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      railOverflow: rail ? rail.scrollWidth - rail.clientWidth : null,
      hasVisiblePreview: Boolean(preview && preview.getBoundingClientRect().right > 0),
      hasPreviewToggle: Boolean(previewToggle),
      exportHostLeft: exportHost?.getBoundingClientRect().left ?? 0,
      hasSearch: Boolean(search),
      hasLinkEntry: Boolean(primary?.contains(linkEntry ?? null)),
      hasLocalEntry: Boolean(primary?.contains(localEntry ?? null)),
      alternatesShareRow: Boolean(
        linkEntry && localEntry &&
        Math.abs(linkEntry.closest('section')?.getBoundingClientRect().top - localEntry.closest('section')?.getBoundingClientRect().top) <= 1
      ),
      hasManualEntry: Boolean(stepper?.querySelector('[data-testid="song-info-toggle"][aria-controls][aria-expanded]')),
      hasDuplicateManualEntry: Boolean(aside?.querySelector('button[aria-controls][aria-expanded]')),
      navigationButtonIds: stepper
        ? [...stepper.querySelectorAll('.lyrics-stepper-actions button')].map((button) => button.getAttribute('data-testid'))
        : [],
      navigationOverflow: (() => {
        const navigation = stepper?.querySelector('.lyrics-stepper-actions');
        return navigation instanceof HTMLElement ? navigation.scrollWidth - navigation.clientWidth : null;
      })(),
      hasLargeCover: Boolean(aside?.querySelector('[data-testid="song-import-cover"]')),
      hasBackButton: Boolean(stepper?.querySelector('[data-testid="stepper-back-button"]')),
      songImportPanelCount: aside?.querySelectorAll('[data-song-import-panel="true"]').length ?? -1,
      legacyHeaderCount: editor?.querySelectorAll('.editor-header').length ?? -1,
      headerActionPlacement: headerActions?.getAttribute('data-placement'),
      headerActionIds: headerActions
        ? [...headerActions.querySelectorAll('button')].map((button) => button.getAttribute('data-testid'))
        : [],
      hasStepperHeaderActions: Boolean(stepper?.querySelector('[data-stepper-header-actions="true"]')),
      actionsFitRail: Boolean(actionsRect && railRect && actionsRect.left >= railRect.left && actionsRect.right <= railRect.right),
      railSpansFocusWorkbench: Boolean(
        railRect && contentRect && companionRect &&
        Math.abs(railRect.left - contentRect.left) <= geometryTolerance &&
        Math.abs(railRect.right - companionRect.right) <= geometryTolerance &&
        contentRect.top + geometryTolerance >= railRect.bottom &&
        companionRect.top + geometryTolerance >= railRect.bottom
      ),
      compactChrome: stepper?.getAttribute('data-stepper-compact-chrome'),
      activeStep: document.querySelector('[aria-current="step"]')?.getAttribute("data-step-id")
    };
  });
  assert.equal(result.activeStep, "link", `${width}x${height} keeps the song step active`);
  assert.ok(result.stepper, `${width}x${height} renders the focused stepper`);
  assert.ok(result.aside, `${width}x${height} renders the compact import aside`);
  assert.equal(result.hasSearch, true, `${width}x${height} renders the primary search entry`);
  assert.equal(result.hasLinkEntry, true, `${width}x${height} preserves link import`);
  assert.equal(result.hasLocalEntry, true, `${width}x${height} preserves local audio import`);
  assert.equal(
    result.alternatesShareRow,
    width >= 1180,
    `${width}x${height} places alternate imports side by side when the left column is wide enough`
  );
  assert.equal(result.hasManualEntry, true, `${width}x${height} preserves manual metadata entry`);
  assert.equal(result.hasDuplicateManualEntry, false, `${width}x${height} has no duplicate manual metadata button in the aside`);
  assert.deepEqual(
    result.navigationButtonIds,
    ["song-info-toggle", "stepper-next-button"],
    `${width}x${height} keeps manual adjustment before Next`
  );
  assert.ok(result.navigationOverflow !== null && result.navigationOverflow <= 1, `${width}x${height} keeps navigation actions inside their row`);
  assert.equal(result.hasLargeCover, true, `${width}x${height} keeps the album cover in the metadata column`);
  assert.equal(result.hasBackButton, false, `${width}x${height} removes the inapplicable Back button from step one`);
  assert.equal(result.songImportPanelCount, 1, `${width}x${height} combines cover, song metadata, and manual editing`);
  assert.equal(result.legacyHeaderCount, 0, `${width}x${height} removes step one's legacy app header`);
  assert.equal(result.headerActionPlacement, "stepper", `${width}x${height} moves step-one actions into the Stepper`);
  assert.deepEqual(
    result.headerActionIds,
    ["examples-button", "history-button", "manual-save-button", "clear-all-button", "settings-button"],
    `${width}x${height} preserves every step-one header action`
  );
  assert.equal(result.hasStepperHeaderActions, true, `${width}x${height} keeps step-one actions inside the Stepper`);
  assert.equal(result.actionsFitRail, true, `${width}x${height} keeps step-one actions within the Stepper rail`);
  assert.equal(result.railSpansFocusWorkbench, true, `${width}x${height} spans the Stepper rail across search and import columns`);
  assert.ok(
    Math.abs(result.aside.width - result.expectedAsideWidth) <= 1,
    `${width}x${height} uses the intended ${result.expectedAsideWidth}px import column: ${JSON.stringify(result)}`
  );
  assert.ok(result.content.width >= 500, `${width}x${height} preserves a usable primary search column: ${JSON.stringify(result)}`);
  assert.ok(result.horizontalOverflow <= 1, `${width}x${height} avoids document-level horizontal overflow: ${JSON.stringify(result)}`);
  assert.ok(result.railOverflow <= 1, `${width}x${height} keeps the compact rail contents inside its panel: ${JSON.stringify(result)}`);
  assert.equal(result.compactChrome, "true", `${width}x${height} uses the shared compact Stepper on step one`);
  assert.ok(
    result.stepper.width > result.aside.width,
    `${width}x${height} keeps search primary over import methods: ${JSON.stringify(result)}`
  );
  assert.equal(result.hasVisiblePreview, false, `${width}x${height} hides the visible preview on step one`);
  assert.equal(result.hasPreviewToggle, false, `${width}x${height} removes the mobile preview toggle on step one`);
  assert.ok(result.exportHostLeft < -90_000, `${width}x${height} keeps the export card off-screen`);
  await assertExportHost(`step one ${width}x${height}`);
}

async function assertUnifiedPreviewChrome(stepId) {
  await page.locator(`button[data-step-id="${stepId}"]`).click();
  await waitForLayoutStable(page.locator('[data-stepper-presentation="preview-workbench"]'));
  const result = await page.evaluate(() => {
    const editor = document.querySelector('[data-testid="editor-surface"]');
    const stepper = editor?.querySelector('[data-stepper-presentation="preview-workbench"]');
    const rail = stepper?.querySelector('.lyrics-stepper-rail');
    const heading = rail?.querySelector('[data-stepper-heading-row="true"]');
    const actions = heading?.querySelector('[data-testid="editor-header-actions"]');
    const workbench = stepper?.querySelector('[data-testid="preview-workbench-viewport"]');
    const preview = stepper?.querySelector('[data-testid="lyric-card-preview"]');
    const titlebarRect = document.querySelector('.desktop-titlebar')?.getBoundingClientRect();
    const titlebarBrand = document.querySelector('.desktop-titlebar__brand');
    const titlebarName = titlebarBrand?.querySelector('span');
    const iconRect = document.querySelector('.desktop-titlebar__icon')?.getBoundingClientRect();
    const titlebarNameRect = titlebarName?.getBoundingClientRect();
    const gradualBlur = document.querySelector('[data-testid="titlebar-gradual-blur"]');
    const gradualBlurRect = gradualBlur?.getBoundingClientRect();
    const blurLayers = gradualBlur?.querySelectorAll('.desktop-titlebar__blur-layer') ?? [];
    const gradualBlurStyle = gradualBlur ? getComputedStyle(gradualBlur) : null;
    const actionsRect = actions?.getBoundingClientRect();
    const railRect = rail?.getBoundingClientRect();
    const workbenchRect = workbench?.getBoundingClientRect();
    const previewRect = preview?.getBoundingClientRect();
    return {
      activeStep: document.querySelector('[aria-current="step"]')?.getAttribute('data-step-id'),
      compactChrome: stepper?.getAttribute('data-stepper-compact-chrome'),
      legacyHeaderCount: editor?.querySelectorAll('.editor-header').length ?? -1,
      actionPlacement: actions?.getAttribute('data-placement'),
      actionIds: actions ? [...actions.querySelectorAll('button')].map((button) => button.getAttribute('data-testid')) : [],
      actionsInsideRail: Boolean(actions && rail?.contains(actions)),
      actionsFitRail: Boolean(actionsRect && railRect && actionsRect.left >= railRect.left && actionsRect.right <= railRect.right),
      railSpansWorkbench: Boolean(
        railRect && workbenchRect && previewRect &&
        railRect.left <= workbenchRect.left && railRect.right >= workbenchRect.right &&
        workbenchRect.top >= railRect.bottom && previewRect.top >= railRect.bottom
      ),
      titlebarIcon: iconRect ? { width: iconRect.width, height: iconRect.height } : null,
      titlebarIconBeforeName: Boolean(iconRect && titlebarNameRect && iconRect.right <= titlebarNameRect.left),
      titlebarGeometry: titlebarRect ? { top: titlebarRect.top, bottom: titlebarRect.bottom } : null,
      railGeometry: railRect ? { top: railRect.top, bottom: railRect.bottom } : null,
      workbenchGeometry: workbenchRect ? { top: workbenchRect.top, bottom: workbenchRect.bottom } : null,
      titlebarBlur: gradualBlurRect ? {
        top: gradualBlurRect.top,
        bottom: gradualBlurRect.bottom,
        height: gradualBlurRect.height,
        pointerEvents: gradualBlurStyle?.pointerEvents,
        layerCount: blurLayers.length,
        backdropFilter: gradualBlurStyle?.backdropFilter
      } : null
    };
  });
  assert.equal(result.activeStep, stepId, `${stepId} remains active after the chrome settles`);
  assert.equal(result.compactChrome, "true", `${stepId} uses the shared compact stepper chrome`);
  assert.equal(result.legacyHeaderCount, 0, `${stepId} removes the legacy editor header`);
  assert.equal(result.actionPlacement, "stepper", `${stepId} places the shared actions in the stepper`);
  assert.deepEqual(
    result.actionIds,
    ["examples-button", "history-button", "manual-save-button", "clear-all-button", "settings-button"],
    `${stepId} preserves all editor actions`
  );
  assert.equal(result.actionsInsideRail, true, `${stepId} keeps the actions inside the stepper rail`);
  assert.equal(result.actionsFitRail, true, `${stepId} keeps the actions within the stepper bounds`);
  assert.equal(result.railSpansWorkbench, true, `${stepId} spans the shared rail across the preview workbench`);
  assert.ok(result.titlebarIcon && result.titlebarIcon.width === 18 && result.titlebarIcon.height === 18, `${stepId} renders the small titlebar app icon`);
  assert.equal(result.titlebarIconBeforeName, true, `${stepId} places the titlebar app icon before the app name`);
  assert.deepEqual(
    result.titlebarBlur && {
      height: result.titlebarBlur.height,
      pointerEvents: result.titlebarBlur.pointerEvents,
      layerCount: result.titlebarBlur.layerCount
    },
    { height: 72, pointerEvents: "none", layerCount: 0 },
    `${stepId} keeps the measured gradual titlebar effect without intercepting input`
  );
  assert.ok(
    result.titlebarGeometry && result.titlebarBlur && result.railGeometry && result.workbenchGeometry &&
      Math.abs(result.titlebarGeometry.bottom - 48) <= 0.5 &&
      result.titlebarBlur.bottom >= result.titlebarGeometry.bottom + 20 &&
      result.titlebarBlur.bottom <= result.titlebarGeometry.bottom + 24.5,
    `${stepId} titlebar effect fades shortly after reaching the Stepper rail: ${JSON.stringify(result)}`
  );
  assert.ok(
    result.titlebarBlur?.backdropFilter.includes("blur("),
    `${stepId} applies backdrop blur directly to the masked edge wrapper`
  );
}

async function readPreviewWorkbenchGeometry() {
  return page.evaluate(() => {
    const viewport = document.querySelector('[data-testid="preview-workbench-viewport"]');
    const track = document.querySelector('[data-testid="preview-workbench-track"]');
    const editor = document.querySelector('[data-workbench-panel="editor-settings"]');
    const preview = document.querySelector('[data-workbench-panel="preview"]');
    const exportPanel = document.querySelector('[data-workbench-panel="export-settings"]');
    const resizer = document.querySelector('[data-testid="preview-workbench-resizer"]');
    const rect = (element) => {
      const value = element?.getBoundingClientRect();
      return value ? { left: value.left, right: value.right, width: value.width } : null;
    };
    const columnCount = (testId) => {
      const element = document.querySelector(`[data-testid="${testId}"]`);
      const columns = element ? getComputedStyle(element).gridTemplateColumns : "";
      return columns ? columns.trim().split(/\s+/).length : 0;
    };
    const state = (element) => ({
      active: element?.getAttribute('data-active') ?? null,
      ariaHidden: element?.getAttribute('aria-hidden') ?? null,
      inert: Boolean(element?.inert)
    });
    return {
      exportActive: viewport?.getAttribute('data-export-active'),
      viewport: rect(viewport),
      track: rect(track),
      editor: rect(editor),
      preview: rect(preview),
      exportPanel: rect(exportPanel),
      resizer: rect(resizer),
      settingsRatio: Number(viewport?.getAttribute('data-settings-ratio') ?? 0),
      resizerValue: Number(resizer?.getAttribute('aria-valuenow') ?? 0),
      resizerMinimum: Number(resizer?.getAttribute('aria-valuemin') ?? 0),
      resizerMaximum: Number(resizer?.getAttribute('aria-valuemax') ?? 0),
      resizerDragging: resizer?.getAttribute('data-dragging') ?? null,
      visualColumns: columnCount('visual-toggle-grid'),
      layoutColumns: columnCount('layout-settings-grid'),
      editorState: state(editor),
      exportState: state(exportPanel),
      transform: track ? getComputedStyle(track).transform : null
    };
  });
}

async function assertDirectionalWorkbenchTransitions() {
  async function switchAndRead(stepId) {
    await page.locator(`button[data-step-id="${stepId}"]`).click();
    await page.waitForFunction((expectedStepId) => {
      const container = document.querySelector('[data-testid="preview-workbench-settings-transition"]');
      if (!(container instanceof HTMLElement) || container.children.length !== 1) return false;
      const panel = container.firstElementChild;
      if (!(panel instanceof HTMLElement) || panel.getAttribute("data-settings-step-id") !== expectedStepId) return false;
      const style = getComputedStyle(panel);
      return style.opacity === "1" && style.transform === "none";
    }, stepId, { timeout: 5_000 });

    return page.getByTestId("preview-workbench-settings-transition").evaluate((container) => {
      const panel = container.firstElementChild;
      const preview = document.querySelector('[data-testid="lyric-card-preview"]');
      const previewRect = preview?.getBoundingClientRect();
      return {
        stepId: panel?.getAttribute("data-settings-step-id"),
        direction: panel?.getAttribute("data-step-direction"),
        overflow: getComputedStyle(container).overflow,
        previewProbe: preview?.getAttribute("data-motion-probe"),
        previewLeft: previewRect?.left ?? 0,
        previewWidth: previewRect?.width ?? 0
      };
    });
  }

  await page.locator('button[data-step-id="layout"]').click();
  await waitForLayoutStable(page.getByTestId("preview-workbench-track"));
  await page.waitForFunction(() => document.querySelector('[data-testid="preview-workbench-settings-transition"]')?.children.length === 1);
  await page.getByTestId("lyric-card-preview").evaluate((preview) => preview.setAttribute("data-motion-probe", "stable"));
  const baseline = await switchAndRead("layout");
  const checks = [
    ["font", "forward"],
    ["visual", "forward"],
    ["font", "backward"],
    ["layout", "backward"]
  ];

  for (const [stepId, direction] of checks) {
    const result = await switchAndRead(stepId);
    assert.equal(result.stepId, stepId, `${stepId} settles as the only active settings panel`);
    assert.equal(result.direction, direction, `${stepId} uses the expected ${direction} transition`);
    assert.equal(result.overflow, "hidden", `${stepId} clips the moving settings panels inside the left workbench`);
    assert.equal(result.previewProbe, "stable", `${stepId} keeps the same lyric preview mounted while settings move`);
    assert.ok(
      Math.abs(result.previewLeft - baseline.previewLeft) <= 1 && Math.abs(result.previewWidth - baseline.previewWidth) <= 1,
      `${stepId} leaves preview geometry stable: ${JSON.stringify({ baseline, result })}`
    );
  }
}

async function assertPreviewWorkbenchPan() {
  await setWindowSize(1280, 900);
  await page.locator('button[data-step-id="visual"]').click();
  await waitForLayoutStable(page.getByTestId('preview-workbench-track'));

  const initial = await readPreviewWorkbenchGeometry();
  assert.ok(Math.abs(initial.settingsRatio - 0.5) <= 0.005, `step five starts at an equal split: ${JSON.stringify(initial)}`);
  assert.equal(initial.resizerValue, 50, "the resize separator exposes the default percentage");
  assert.equal(initial.resizerMinimum, 50, "the resize separator does not shrink settings below half");
  assert.ok(initial.resizerMaximum >= 66, "a 1280-wide window exposes the full two-thirds setting range");
  assert.equal(initial.visualColumns, 2, "the default-width visual settings use two compact columns");

  const resizer = page.getByTestId('preview-workbench-resizer');
  const idleResizerLine = await resizer.evaluate((element) => {
    const line = getComputedStyle(element, '::before');
    return { backgroundColor: line.backgroundColor, width: line.width };
  });
  assert.equal(idleResizerLine.width, '1px', "the resize separator renders as one thin line without a wider visual handle");
  await resizer.hover();
  await page.waitForFunction((idleColor) => {
    const element = document.querySelector('[data-testid="preview-workbench-resizer"]');
    return element && getComputedStyle(element, '::before').backgroundColor !== idleColor;
  }, idleResizerLine.backgroundColor);
  const hoveredResizerLine = await resizer.evaluate((element) => {
    const line = getComputedStyle(element, '::before');
    return { backgroundColor: line.backgroundColor, width: line.width };
  });
  assert.equal(hoveredResizerLine.width, '1px', "hover feedback keeps the separator at one-pixel width");
  assert.notEqual(hoveredResizerLine.backgroundColor, idleResizerLine.backgroundColor, "hover changes only the separator line color");
  await resizer.focus();
  await page.keyboard.press('End');
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="preview-workbench-viewport"]')?.getAttribute('data-settings-ratio')) > 0.65);
  await waitForLayoutStable(page.getByTestId('preview-workbench-track'));
  const expanded = await readPreviewWorkbenchGeometry();
  assert.ok(
    expanded.editor && expanded.preview && initial.editor && initial.preview &&
      expanded.editor.width > initial.editor.width + 150 &&
      expanded.preview.width < initial.preview.width - 150 &&
      expanded.preview.width >= 360,
    `End expands settings while preserving the preview minimum: ${JSON.stringify({ initial, expanded })}`
  );
  assert.equal(expanded.visualColumns, 3, "the wider visual settings reflow eight toggles into three columns");
  await page.screenshot({ path: path.join(reportDirectory, "step-five-expanded.png"), fullPage: false });

  await page.locator('button[data-step-id="layout"]').click();
  await waitForLayoutStable(page.getByTestId('layout-settings-grid'));
  const expandedLayout = await readPreviewWorkbenchGeometry();
  assert.equal(expandedLayout.layoutColumns, 2, "the wider layout settings compact ordinary rows into two columns");

  await page.locator('button[data-step-id="visual"]').click();
  await waitForLayoutStable(page.getByTestId('visual-toggle-grid'));
  await page.getByTestId('preview-workbench-resizer').focus();
  await page.keyboard.press('Home');
  await page.waitForFunction(() => Math.abs(Number(document.querySelector('[data-testid="preview-workbench-viewport"]')?.getAttribute('data-settings-ratio')) - 0.5) < 0.005);
  await waitForLayoutStable(page.getByTestId('preview-workbench-track'));
  assert.equal((await readPreviewWorkbenchGeometry()).visualColumns, 2, "Home restores the equal split and two-column toggles");

  const viewportBox = await page.getByTestId('preview-workbench-viewport').boundingBox();
  const resizerBox = await page.getByTestId('preview-workbench-resizer').boundingBox();
  assert.ok(viewportBox && resizerBox, "the adjustable workbench exposes draggable geometry");
  await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + Math.min(80, resizerBox.height / 2));
  await page.mouse.down();
  await page.mouse.move(viewportBox.x + 10 + (viewportBox.width - 20) * 0.62, resizerBox.y + Math.min(80, resizerBox.height / 2), { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const ratio = Number(document.querySelector('[data-testid="preview-workbench-viewport"]')?.getAttribute('data-settings-ratio'));
    return ratio > 0.60 && ratio < 0.64;
  });
  await waitForLayoutStable(page.getByTestId('preview-workbench-track'));
  const dragged = await readPreviewWorkbenchGeometry();
  assert.equal(dragged.resizerDragging, "false", "pointer release ends the resize interaction");
  assert.ok(dragged.settingsRatio > 0.60 && dragged.settingsRatio < 0.64, `pointer drag sets a continuous ratio: ${JSON.stringify(dragged)}`);

  await page.getByTestId('preview-workbench-resizer').dblclick();
  await page.waitForFunction(() => Math.abs(Number(document.querySelector('[data-testid="preview-workbench-viewport"]')?.getAttribute('data-settings-ratio')) - 0.5) < 0.005);
  await waitForLayoutStable(page.getByTestId('preview-workbench-track'));
  await page.getByTestId('preview-workbench-resizer').focus();
  await page.keyboard.press('End');
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="preview-workbench-viewport"]')?.getAttribute('data-settings-ratio')) > 0.65);
  await waitForLayoutStable(page.getByTestId('preview-workbench-track'));
  const before = await readPreviewWorkbenchGeometry();
  assert.equal(before.exportActive, "false", "step five keeps the editor side of the workbench active");
  assert.deepEqual(before.editorState, { active: "true", ariaHidden: "false", inert: false }, "step five editor settings remain interactive");
  assert.deepEqual(before.exportState, { active: "false", ariaHidden: "true", inert: true }, "step six export settings stay inert off-screen");
  assert.ok(
    before.viewport && before.editor && before.preview && before.exportPanel &&
      Math.abs(before.editor.left - before.viewport.left) <= 1.5 &&
      Math.abs(before.preview.right - before.viewport.right) <= 1.5 &&
      before.exportPanel.left > before.viewport.right,
    `step five shows settings then preview while export remains off-screen: ${JSON.stringify(before)}`
  );

  const pressureStage = page.getByTestId('lyric-card-preview-pressure');
  const pressureBox = await pressureStage.boundingBox();
  assert.ok(pressureBox, "step five preview pressure target is visible");
  await page.mouse.move(pressureBox.x + pressureBox.width * 0.18, pressureBox.y + pressureBox.height * 0.2);
  await page.waitForTimeout(120);
  const pressureState = await pressureStage.evaluate((element) => {
    const card = element.querySelector('.preview-pressure-card');
    const style = card ? getComputedStyle(card) : null;
    return {
      enabled: element.getAttribute('data-pressure-enabled'),
      transform: style?.transform ?? null,
      filter: style?.filter ?? null
    };
  });
  assert.equal(pressureState.enabled, "true", "step five enables preview pressure feedback");
  assert.ok(pressureState.transform?.startsWith("matrix3d("), `preview hover produces a 3D transform: ${JSON.stringify(pressureState)}`);
  assert.ok(pressureState.filter?.includes("drop-shadow"), `preview hover keeps the raised card shadow: ${JSON.stringify(pressureState)}`);

  const expectedStepSixPanelWidth = (before.viewport.width - before.resizer.width) / 2;
  await page.locator('button[data-step-id="export"]').click();
  await page.waitForFunction(({ initialWidth, targetWidth }) => {
    const preview = document.querySelector('[data-workbench-panel="preview"]');
    const width = preview?.getBoundingClientRect().width ?? 0;
    return width > initialWidth + 1 && width < targetWidth - 1;
  }, { initialWidth: before.preview.width, targetWidth: expectedStepSixPanelWidth });
  const during = await readPreviewWorkbenchGeometry();
  await waitForLayoutStable(page.getByTestId('preview-workbench-track'));
  const after = await readPreviewWorkbenchGeometry();

  assert.ok(
    during.track && before.track && during.preview &&
      during.track.left < before.track.left - 1 &&
      during.preview.width > before.preview.width + 1 &&
      during.preview.width < expectedStepSixPanelWidth - 1,
    `step five to six synchronizes the left pan with a smooth preview expansion: ${JSON.stringify({ before, during })}`
  );
  assert.equal(after.exportActive, "true", "step six activates the export side of the workbench");
  assert.equal(await page.getByTestId('preview-workbench-resizer').count(), 0, "step six hides the step-three-to-five resize separator");
  assert.deepEqual(after.editorState, { active: "false", ariaHidden: "true", inert: true }, "step five settings become inert off-screen left");
  assert.deepEqual(after.exportState, { active: "true", ariaHidden: "false", inert: false }, "step six export settings become interactive on the right");
  const exportFormatState = await page.locator('[data-workbench-panel="export-settings"] [data-segment-value="png"], [data-workbench-panel="export-settings"] [data-segment-value="webp"], [data-workbench-panel="export-settings"] [data-segment-value="jpg"]').evaluateAll((buttons) => (
    buttons.map((button) => ({
      value: button.getAttribute('data-segment-value'),
      checked: button.getAttribute('aria-checked')
    }))
  ));
  assert.deepEqual(
    exportFormatState,
    [
      { value: "png", checked: "false" },
      { value: "webp", checked: "true" },
      { value: "jpg", checked: "false" }
    ],
    "step six inherits the WebP default selected in settings"
  );
  assert.ok(
    after.viewport && after.editor && after.preview && after.exportPanel && before.viewport &&
      after.editor.right <= after.viewport.left + 1.5 &&
      Math.abs(after.preview.left - after.viewport.left) <= 1.5 &&
      Math.abs(after.exportPanel.right - after.viewport.right) <= 1.5 &&
      Math.abs(after.preview.width - expectedStepSixPanelWidth) <= 1.5 &&
      Math.abs(after.preview.width - after.exportPanel.width) <= 1.5 &&
      after.preview.left < before.preview.left - before.viewport.width * 0.4 &&
      after.exportPanel.left < before.exportPanel.left - before.viewport.width * 0.4,
    `step six lands with an equal half-width preview and export panel after a synchronized left pan: ${JSON.stringify({ before, after })}`
  );
  assert.ok(after.transform && after.transform !== "none", `step six retains the translated workbench transform: ${after.transform}`);

  await page.locator('button[data-step-id="visual"]').click();
  await page.waitForFunction(
    ({ expectedPreviewLeft, tolerance }) => {
      const viewport = document.querySelector('[data-testid="preview-workbench-viewport"]');
      const editor = document.querySelector('[data-workbench-panel="editor-settings"]');
      const preview = document.querySelector('[data-workbench-panel="preview"]');
      const exportPanel = document.querySelector('[data-workbench-panel="export-settings"]');
      if (!viewport || !editor || !preview || !exportPanel) return false;

      const viewportRect = viewport.getBoundingClientRect();
      const editorRect = editor.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const exportRect = exportPanel.getBoundingClientRect();
      return viewport.getAttribute("data-export-active") === "false"
        && Math.abs(editorRect.left - viewportRect.left) <= tolerance
        && Math.abs(previewRect.right - viewportRect.right) <= tolerance
        && Math.abs(previewRect.left - expectedPreviewLeft) <= tolerance
        && exportRect.left > viewportRect.right;
    },
    { expectedPreviewLeft: before.preview.left, tolerance: 1.5 },
    { polling: 80, timeout: 10_000 }
  );
  await waitForLayoutStable(page.getByTestId('preview-workbench-track'));
  const reversed = await readPreviewWorkbenchGeometry();
  assert.equal(reversed.exportActive, "false", "reverse navigation restores the editor side of the workbench");
  assert.deepEqual(reversed.editorState, { active: "true", ariaHidden: "false", inert: false }, "reverse navigation re-enables visual settings");
  assert.deepEqual(reversed.exportState, { active: "false", ariaHidden: "true", inert: true }, "reverse navigation makes export settings inert again");
  assert.ok(
    reversed.viewport && reversed.editor && reversed.preview && reversed.exportPanel && before.viewport &&
      Math.abs(reversed.editor.left - reversed.viewport.left) <= 1.5 &&
      Math.abs(reversed.preview.right - reversed.viewport.right) <= 1.5 &&
      reversed.exportPanel.left > reversed.viewport.right &&
      Math.abs(reversed.preview.left - before.preview.left) <= 1.5,
    `step six to five returns the same track to settings-left and preview-right: ${JSON.stringify({ before, reversed })}`
  );

  await setWindowSize(1000, 700);
  await page.locator('button[data-step-id="export"]').click();
  await waitForLayoutStable(page.getByTestId('preview-workbench-track'));
  const narrow = await page.evaluate(() => {
    const preview = document.querySelector('[data-workbench-panel="preview"]');
    const editor = document.querySelector('[data-workbench-panel="editor-settings"]');
    const exportPanel = document.querySelector('[data-workbench-panel="export-settings"]');
    const track = document.querySelector('[data-testid="preview-workbench-track"]');
    const previewRect = preview?.getBoundingClientRect();
    const exportRect = exportPanel?.getBoundingClientRect();
    return {
      preview: previewRect ? { top: previewRect.top, bottom: previewRect.bottom } : null,
      exportPanel: exportRect ? { top: exportRect.top, bottom: exportRect.bottom } : null,
      editorDisplay: editor ? getComputedStyle(editor).display : null,
      exportDisplay: exportPanel ? getComputedStyle(exportPanel).display : null,
      transform: track ? getComputedStyle(track).transform : null,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  assert.equal(narrow.editorDisplay, "none", `the minimum-width export view removes inert old settings: ${JSON.stringify(narrow)}`);
  assert.notEqual(narrow.exportDisplay, "none", `the minimum-width export settings remain visible: ${JSON.stringify(narrow)}`);
  assert.equal(narrow.transform, "none", `the minimum-width layout uses the stacked reduced transform: ${JSON.stringify(narrow)}`);
  assert.ok(
    narrow.preview && narrow.exportPanel && narrow.preview.top < narrow.exportPanel.top,
    `the minimum-width layout stacks preview before export settings: ${JSON.stringify(narrow)}`
  );
  assert.ok(narrow.horizontalOverflow <= 1, `the minimum-width workbench avoids horizontal overflow: ${JSON.stringify(narrow)}`);
}

async function assertLyricsWorkspace(width, height) {
  await setWindowSize(width, height);
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  await waitForLayoutStable(page.getByTestId("lyrics-sidebar"));
  await page.waitForFunction(() => {
    const split = document.querySelector('[data-testid="lyrics-workspace-split"]');
    if (!(split instanceof HTMLElement)) return false;
    return Math.abs(Number.parseFloat(getComputedStyle(split).columnGap) - 8) <= 0.05;
  }, undefined, { polling: 80, timeout: 5_000 });
  const result = await page.evaluate(() => {
    const editor = document.querySelector('[data-testid="editor-surface"]');
    const workspace = document.querySelector('[data-testid="lyrics-workspace"]');
    const split = document.querySelector('[data-testid="lyrics-workspace-split"]');
    const shared = document.querySelector('[data-testid="lyrics-shared-scroll"]');
    const documentColumn = document.querySelector('#lyrics-workspace-editor');
    const tools = document.querySelector('[data-testid="lyrics-sidebar"]');
    const pageViewport = tools?.querySelector('[data-testid="lyrics-translation-page-viewport"]');
    const toolsPanel = tools?.querySelector('[role="tabpanel"]:not([hidden])');
    const translationPage = toolsPanel?.matches('[data-testid="lyrics-translation-home-page"]')
      ? toolsPanel
      : toolsPanel?.querySelector('[data-testid="lyrics-translation-home-page"]');
    const firstToolsSection = toolsPanel?.querySelector('.lyrics-sidebar-section');
    const commandBar = document.querySelector('[data-testid="lyrics-command-bar"]');
    const statusBar = document.querySelector('[data-testid="lyrics-status-bar"]');
    const editorColumns = document.querySelector('[data-testid="lyrics-editor-columns"]');
    const actions = document.querySelector('.lyrics-stepper-actions');
    const main = document.querySelector('.lyric-editor-main');
    const stepContent = document.querySelector('.lyrics-stepper-content');
    const stepper = editor?.querySelector('[data-stepper-presentation="lyrics-workspace"]');
    const rail = stepper?.querySelector('.lyrics-stepper-rail');
    const heading = rail?.querySelector('[data-stepper-heading-row="true"]');
    const headerActions = heading?.querySelector('[data-testid="editor-header-actions"]');
    const railRect = rail?.getBoundingClientRect();
    const headerActionsRect = headerActions?.getBoundingClientRect();
    const textareas = [...document.querySelectorAll('[data-testid="lyrics-shared-scroll"] textarea:not([data-lyrics-editor-measure="true"])')];
    const rect = (element) => {
      const value = element?.getBoundingClientRect();
      return value ? { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom } : null;
    };
    const frame = (element) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        top: Number.parseFloat(style.borderTopWidth),
        right: Number.parseFloat(style.borderRightWidth),
        bottom: Number.parseFloat(style.borderBottomWidth),
        left: Number.parseFloat(style.borderLeftWidth),
        radius: style.borderRadius
      };
    };
    const background = (element) => element ? getComputedStyle(element).backgroundColor : null;
    const documentScrollers = documentColumn
      ? [...documentColumn.querySelectorAll('*')].filter((node) => {
          const style = getComputedStyle(node);
          return style.overflowY === 'auto' || style.overflowY === 'scroll';
        })
      : [];
    return {
      editor: editor ? { clientHeight: editor.clientHeight, scrollHeight: editor.scrollHeight, overflowY: getComputedStyle(editor).overflowY } : null,
      workspace: rect(workspace),
      workspaceFrame: frame(workspace),
      workspaceBackground: background(workspace),
      split: split ? {
        ...rect(split),
        sideBySide: split.getAttribute('data-side-by-side'),
        ratio: Number(split.getAttribute('data-editor-ratio')),
        columnGap: Number.parseFloat(getComputedStyle(split).columnGap)
      } : null,
      shared: shared ? { ...rect(shared), overflowX: getComputedStyle(shared).overflowX, overflowY: getComputedStyle(shared).overflowY } : null,
      documentColumn: rect(documentColumn),
      documentFrame: frame(documentColumn),
      documentBackground: background(documentColumn),
      tools: tools ? {
        ...rect(tools),
        clientHeight: tools.clientHeight,
        scrollHeight: tools.scrollHeight,
        activeTab: tools.getAttribute('data-active-tab')
      } : null,
      pageViewport: pageViewport ? {
        ...rect(pageViewport),
        overflowX: getComputedStyle(pageViewport).overflowX,
        overflowY: getComputedStyle(pageViewport).overflowY
      } : null,
      toolsPanel: toolsPanel ? {
        ...rect(toolsPanel),
        clientHeight: toolsPanel.clientHeight,
        scrollHeight: toolsPanel.scrollHeight,
        overflowY: getComputedStyle(toolsPanel).overflowY,
        firstSectionPosition: firstToolsSection ? getComputedStyle(firstToolsSection).position : null
      } : null,
      translationPage: translationPage ? {
        ...rect(translationPage),
        clientHeight: translationPage.clientHeight,
        scrollHeight: translationPage.scrollHeight,
        overflowY: getComputedStyle(translationPage).overflowY
      } : null,
      toolsFrame: frame(tools),
      toolsBackground: background(tools),
      resizerCount: document.querySelectorAll('[data-testid="lyrics-workspace-resizer"]').length,
      sidebarToggleCount: document.querySelectorAll('[data-testid="lyrics-command-sidebar-toggle"]').length,
      commandBar: rect(commandBar),
      commandBarBackground: background(commandBar),
      statusBarBackground: background(statusBar),
      statusInsideCommandBar: Boolean(commandBar && statusBar && commandBar.contains(statusBar)),
      editorColumns: rect(editorColumns),
      documentScrollerCount: documentScrollers.length,
      documentScrollerIsShared: documentScrollers.length === 1 && documentScrollers[0] === shared,
      actions: rect(actions),
      documentRoot: {
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight,
        scrollY: window.scrollY,
        scrollX: window.scrollX
      },
      main: main ? { clientHeight: main.clientHeight, scrollHeight: main.scrollHeight, overflowY: getComputedStyle(main).overflowY } : null,
      stepContent: stepContent ? { clientHeight: stepContent.clientHeight, scrollHeight: stepContent.scrollHeight, overflowY: getComputedStyle(stepContent).overflowY } : null,
      textareaCount: textareas.length,
      textareaHeights: textareas.map((area) => area.getBoundingClientRect().height),
      textareaWidths: textareas.map((area) => area.getBoundingClientRect().width),
      textareaStyles: textareas.map((area) => ({
        overflowX: getComputedStyle(area).overflowX,
        overflowY: getComputedStyle(area).overflowY,
        resize: getComputedStyle(area).resize,
        backgroundColor: getComputedStyle(area).backgroundColor,
        scrollWidth: area.scrollWidth,
        clientWidth: area.clientWidth
      })),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hasPreview: Boolean(document.querySelector('[data-testid="lyric-card-preview"]')),
      hasPreviewToggle: Boolean(document.querySelector('[data-testid="preview-pane-toggle"]')),
      compactChrome: stepper?.getAttribute('data-stepper-compact-chrome'),
      legacyHeaderCount: editor?.querySelectorAll('.editor-header').length ?? -1,
      actionPlacement: headerActions?.getAttribute('data-placement'),
      actionIds: headerActions
        ? [...headerActions.querySelectorAll('button')].map((button) => button.getAttribute('data-testid'))
        : [],
      actionsInsideRail: Boolean(headerActions && rail?.contains(headerActions)),
      actionsFitRail: Boolean(
        headerActionsRect && railRect &&
        headerActionsRect.left >= railRect.left && headerActionsRect.right <= railRect.right
      ),
      railSpansWorkspace: Boolean(
        railRect && workspace &&
        railRect.left <= workspace.getBoundingClientRect().left &&
        railRect.right >= workspace.getBoundingClientRect().right
      ),
      activeStep: document.querySelector('[aria-current="step"]')?.getAttribute("data-step-id")
    };
  });
  const expandedGap = 8;
  const expectedFixedRatio = 2 / 3;
  assert.equal(result.activeStep, "lyrics", `${width}x${height} keeps the lyrics step active`);
  assert.ok(
    result.workspace && result.split && result.shared && result.actions && result.documentColumn && result.tools && result.toolsPanel && result.commandBar,
    `${width}x${height} renders the bounded lyrics split skeleton`
  );
  assert.deepEqual(
    result.workspaceFrame,
    { top: 0, right: 0, bottom: 0, left: 0, radius: "0px" },
    `${width}x${height} removes the outer lyrics-workspace frame`
  );
  assert.deepEqual(
    result.documentFrame,
    { top: 0, right: 0, bottom: 0, left: 0, radius: "0px" },
    `${width}x${height} keeps the editor as an unframed primary surface`
  );
  assert.deepEqual(
    result.toolsFrame,
    { top: 0, right: 0, bottom: 0, left: 0, radius: "0px" },
    `${width}x${height} leaves the expanded utility column unframed`
  );
  assert.deepEqual(
    {
      workspace: result.workspaceBackground,
      commandBar: result.commandBarBackground,
      document: result.documentBackground,
      tools: result.toolsBackground,
      status: result.statusBarBackground
    },
    {
      workspace: "rgba(0, 0, 0, 0)",
      commandBar: "rgba(0, 0, 0, 0)",
      document: "rgba(0, 0, 0, 0)",
      tools: "rgba(0, 0, 0, 0)",
      status: "rgba(0, 0, 0, 0)"
    },
    `${width}x${height} presents the workspace chrome directly on the app canvas`
  );
  assert.ok(result.workspace.x >= -1 && result.workspace.right <= width + 1, `${width}x${height} keeps the workspace inside the viewport`);
  assert.equal(result.split.sideBySide, "true", `${width}x${height} uses the desktop two-column workspace`);
  assert.ok(
    Math.abs(result.split.ratio - expectedFixedRatio) <= 0.002,
    `${width}x${height} gives the always-open inspector its maximum one-third width: ${JSON.stringify(result.split)}`
  );
  assert.ok(
    Math.abs(result.split.columnGap - expandedGap) <= 0.5,
    `${width}x${height} keeps the compact 8px fixed gap: ${JSON.stringify(result.split)}`
  );
  assert.ok(result.documentColumn.width >= 599, `${width}x${height} preserves the minimum editor width: ${result.documentColumn.width}`);
  assert.ok(result.tools.width >= 299, `${width}x${height} preserves the 300px minimum tools width: ${result.tools.width}`);
  assert.ok(
    Math.abs(result.tools.x - result.documentColumn.right - expandedGap) <= 1,
    `${width}x${height} places the tools after one fixed 8px gutter: ${JSON.stringify({ document: result.documentColumn, tools: result.tools })}`
  );
  assert.equal(result.resizerCount, 0, `${width}x${height} exposes no adjustable column separator`);
  assert.equal(result.sidebarToggleCount, 0, `${width}x${height} exposes no desktop collapse control`);
  assert.equal(result.statusInsideCommandBar, true, `${width}x${height} keeps cursor and scope status inside the top command bar`);
  assert.equal(result.editor.scrollHeight, result.editor.clientHeight, `${width}x${height} prevents editor-root scrolling`);
  assert.equal(result.editor.overflowY, "hidden", `${width}x${height} hides editor-root overflow`);
  assert.equal(result.shared.overflowX, "hidden", `${width}x${height} prevents a second horizontal document scroll`);
  assert.equal(result.shared.overflowY, "auto", `${width}x${height} gives the document the main scrollbar`);
  assert.ok(result.documentColumn.right <= result.tools.x + 1, `${width}x${height} editor does not overlap tools`);
  assert.ok(
    result.tools.bottom < result.actions.y,
    `${width}x${height} keeps the sidebar above the step navigation: ${JSON.stringify({ tools: result.tools, actions: result.actions })}`
  );
  if (result.tools.activeTab === "translation") {
    assert.equal(result.pageViewport.overflowY, "hidden", `${width}x${height} clips the shared sidebar page deck`);
    assert.equal(result.toolsPanel.overflowY, "auto", `${width}x${height} gives the active Translation page one bounded scroller`);
    assert.equal(result.translationPage?.overflowY, "auto", `${width}x${height} keeps Translation home as that bounded scroller`);
    assert.ok(
      result.translationPage.y >= result.toolsPanel.y - 1 && result.translationPage.bottom <= result.toolsPanel.bottom + 1,
      `${width}x${height} contains Translation home inside the page viewport`
    );
  } else {
    assert.equal(result.toolsPanel.overflowY, "auto", `${width}x${height} gives the cleanup sidebar one bounded scroller`);
  }
  assert.ok(
    result.toolsPanel.y >= result.tools.y - 1 && result.toolsPanel.bottom <= result.tools.bottom + 1,
    `${width}x${height} clips sidebar content inside the tool column: ${JSON.stringify({ tools: result.tools, panel: result.toolsPanel })}`
  );
  assert.equal(
    result.toolsPanel.firstSectionPosition,
    "static",
    `${width}x${height} keeps the scope section in document flow instead of overlapping scrolled tools`
  );
  assert.equal(result.documentRoot.scrollY, 0, `${width}x${height} keeps the document viewport at the top`);
  assert.equal(result.documentRoot.scrollX, 0, `${width}x${height} prevents focus from horizontally scrolling the stage`);
  assert.ok(result.documentRoot.scrollHeight <= result.documentRoot.clientHeight + 1, `${width}x${height} prevents document-root scrolling`);
  assert.ok(result.main.scrollHeight <= result.main.clientHeight + 1, `${width}x${height} prevents main-root scrolling`);
  assert.equal(result.stepContent.overflowY, "hidden", `${width}x${height} gives the step content no second scrollbar`);
  assert.ok(result.actions.bottom <= height + 1, `${width}x${height} keeps navigation visible`);
  assert.equal(result.hasPreview, false, `${width}x${height} hides the visible preview on step two`);
  assert.equal(result.hasPreviewToggle, false, `${width}x${height} removes the preview toggle on step two`);
  assert.equal(result.compactChrome, "true", `${width}x${height} gives step two the shared compact Stepper chrome`);
  assert.equal(result.legacyHeaderCount, 0, `${width}x${height} removes the separate step-two app header`);
  assert.equal(result.actionPlacement, "stepper", `${width}x${height} places step-two actions in the Stepper heading`);
  assert.deepEqual(
    result.actionIds,
    ["examples-button", "history-button", "manual-save-button", "clear-all-button", "settings-button"],
    `${width}x${height} preserves every step-two editor action`
  );
  assert.equal(result.actionsInsideRail, true, `${width}x${height} keeps step-two actions inside the shared rail`);
  assert.equal(result.actionsFitRail, true, `${width}x${height} keeps step-two actions within the rail bounds`);
  assert.equal(result.railSpansWorkspace, true, `${width}x${height} spans the step-two rail across the lyrics workspace`);
  assert.ok(result.commandBar.height >= 40 && result.commandBar.height <= 44.5, `${width}x${height} keeps the semantic command bar compact: ${result.commandBar.height}`);
  assert.ok(
    result.split.y >= result.commandBar.bottom - 1 && result.shared.y >= result.split.y - 1,
    `${width}x${height} reserves the command bar above the shared editor viewport: ${JSON.stringify({ commandBar: result.commandBar, split: result.split, shared: result.shared })}`
  );
  assert.equal(result.documentScrollerCount, 1, `${width}x${height} exposes exactly one editor scroller`);
  assert.equal(result.documentScrollerIsShared, true, `${width}x${height} makes the shared viewport the only editor scroller`);
  assert.ok(result.textareaCount >= 1, `${width}x${height} renders the document editor`);
  if (result.textareaHeights.length === 2) {
    assert.ok(Math.abs(result.textareaHeights[0] - result.textareaHeights[1]) <= 1, `${width}x${height} keeps original and translation equal height`);
  }
  for (const style of result.textareaStyles) {
    assert.equal(style.overflowX, "hidden", `${width}x${height} textarea wraps long lines without horizontal scrolling`);
    assert.equal(style.overflowY, "hidden", `${width}x${height} textarea delegates scrolling to the shared viewport`);
    assert.equal(style.resize, "none", `${width}x${height} textarea disables native resize`);
    assert.notEqual(style.backgroundColor, "rgba(0, 0, 0, 0)", `${width}x${height} keeps the lyric editor as the one readable content surface`);
    assert.ok(style.scrollWidth <= style.clientWidth + 1, `${width}x${height} textarea has no horizontal overflow: ${JSON.stringify(style)}`);
  }
  assert.ok(result.textareaWidths.every((value) => value >= 260), `${width}x${height} keeps both bilingual editors usable: ${result.textareaWidths}`);
  assert.ok(result.horizontalOverflow <= 1, `${width}x${height} avoids document horizontal overflow: ${result.horizontalOverflow}`);
  if (runVisualDiagnostics) {
    await page.screenshot({ path: path.join(reportDirectory, `step-two-${width}x${height}.png`), fullPage: false });
  }
  await assertExportHost(`step two ${width}x${height}`);
}

async function assertLyricsWorkbenchOperations(originalLyrics, translationLyrics, originalFixture, translationFixture) {
  // Operate through real selections and keyboard events so undo history and
  // sidebar commands are validated at the same boundary users exercise.
  await setWindowSize(1280, 900);
  await page.getByTestId("lyrics-sidebar").waitFor({ state: "visible" });
  await page.getByTestId("lyrics-sidebar-tab-cleanup").click();
  const firstCommand = page.getByTestId("lyrics-command-bar").locator("button").first();
  assert.equal(
    await firstCommand.getAttribute("data-testid"),
    "lyrics-command-keep-selection",
    "keep-selection is the first command in the top toolbar"
  );
  assert.match(
    await firstCommand.getAttribute("class") ?? "",
    /lyrics-command-button--accent/u,
    "keep-selection uses the lightweight accent treatment"
  );

  const keepFixture = "before line\nkeep this exact text\nafter line";
  await fillExact(originalLyrics, keepFixture);
  await selectLyricsRange(originalLyrics, 0, 0);
  assert.equal(
    await page.getByTestId("lyrics-command-keep-selection").isDisabled(),
    true,
    "keep-selection is unavailable without an explicit selection"
  );
  const keepStart = keepFixture.indexOf("this exact");
  await selectLyricsRange(originalLyrics, keepStart, keepStart + "this exact".length);
  assert.equal(
    await page.getByTestId("lyrics-command-keep-selection").isEnabled(),
    true,
    "an explicit selection enables keep-selection"
  );
  await page.getByTestId("lyrics-command-keep-selection").click();
  assert.equal(
    await originalLyrics.inputValue(),
    "this exact",
    "keep-selection removes every character outside the exact browser selection"
  );
  assert.deepEqual(
    await originalLyrics.evaluate((node) => ({ start: node.selectionStart, end: node.selectionEnd })),
    { start: 0, end: "this exact".length },
    "keep-selection restores the retained range as the active selection"
  );
  await page.getByTestId("lyrics-command-undo").click();
  assert.equal(await originalLyrics.inputValue(), keepFixture, "keep-selection participates in operation-level undo");
  await page.getByTestId("lyrics-command-redo").click();
  assert.equal(await originalLyrics.inputValue(), "this exact", "redo reapplies keep-selection");
  await page.getByTestId("lyrics-command-undo").click();

  const translationKeepFixture = "avant\ngarder exactement ceci\naprès";
  await fillExact(translationLyrics, translationKeepFixture);
  const translationKeepStart = translationKeepFixture.indexOf("exactement");
  await selectLyricsRange(
    translationLyrics,
    translationKeepStart,
    translationKeepStart + "exactement".length
  );
  await page.getByTestId("lyrics-command-keep-selection").click();
  assert.equal(
    await translationLyrics.inputValue(),
    "exactement",
    "keep-selection applies to the active translation column"
  );
  assert.equal(
    await originalLyrics.inputValue(),
    keepFixture,
    "keeping a translation selection leaves the original column untouched"
  );
  await page.getByTestId("lyrics-command-undo").click();

  const scopedFixture = "alpha  \nkeep\u200B\nomega  ";
  await fillExact(originalLyrics, scopedFixture);
  await selectLyricsRange(originalLyrics, 0, "alpha  ".length);
  await page.waitForFunction(() => /原文第 1.*1 行/.test(
    document.querySelector('[data-testid="lyrics-cleanup-scope-summary"]')?.textContent ?? ""
  ));
  const scopeContext = page.getByTestId("lyrics-cleanup-context");
  assert.equal(await scopeContext.locator("h2").count(), 0, "scope is presented as a compact context bar instead of a full Section");
  assert.equal(
    await scopeContext.getByRole("group").count(),
    1,
    "the compact context bar contains the current-column / aligned-columns choice"
  );
  await page.getByTestId("lyrics-command-clean-paste").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="lyrics-operation-feedback"]')?.textContent?.includes("粘贴"));
  assert.equal(
    await page.getByTestId("lyrics-sidebar").getAttribute("data-active-tab"),
    "cleanup",
    "direct cleanup commands do not disturb the active inspector tab"
  );
  assert.equal(
    await originalLyrics.inputValue(),
    "alpha\nkeep\u200B\nomega  ",
    "paste cleanup affects only the selected line and leaves out-of-range text untouched"
  );
  assert.equal(await page.getByTestId("lyrics-command-undo").isEnabled(), true, "a programmatic cleanup enables immediate undo");
  await page.getByTestId("lyrics-command-undo").click();
  assert.equal(await originalLyrics.inputValue(), scopedFixture, "undo restores the exact pre-cleanup document");
  assert.equal(await page.getByTestId("lyrics-command-redo").isEnabled(), true, "undo exposes operation-level redo");
  await page.getByTestId("lyrics-command-redo").click();
  assert.equal(await originalLyrics.inputValue(), "alpha\nkeep\u200B\nomega  ", "redo reapplies the scoped cleanup");
  await page.getByTestId("lyrics-command-undo").click();

  const blankFixture = "alpha\n\n\nomega";
  await fillExact(originalLyrics, blankFixture);
  await selectLyricsRange(originalLyrics, 0, 0);
  await page.getByTestId("lyrics-command-collapse-blanks").click();
  assert.equal(await originalLyrics.inputValue(), "alpha\n\nomega", "blank-line shortcut collapses consecutive blanks in the active scope");
  await page.getByTestId("lyrics-command-undo").click();
  assert.equal(await originalLyrics.inputValue(), blankFixture, "blank-line shortcut participates in operation-level undo");

  const previewFixture = "[Verse 1]\n[00:01.00]World\nEnd";
  await fillExact(originalLyrics, previewFixture);
  await selectLyricsRange(originalLyrics, 0, 0);
  await page.getByTestId("lyrics-command-strip-lrc").click();
  assert.equal(await originalLyrics.inputValue(), "[Verse 1]\nWorld\nEnd", "LRC shortcut applies the high-frequency cleanup directly");
  await page.getByTestId("lyrics-command-undo").click();
  assert.equal(await originalLyrics.inputValue(), previewFixture, "LRC shortcut participates in operation-level undo");
  const moreCleanup = page.getByTestId("lyrics-cleanup-more");
  assert.equal(await moreCleanup.getAttribute("open"), null, "low-frequency cleanup starts inside one closed More cleanup disclosure");
  assert.equal(await page.getByTestId("lyrics-cleanup-lrc-preview").isHidden(), true, "LRC preview stays out of the first cleanup view");
  await page.getByTestId("lyrics-cleanup-more-summary").focus();
  await page.getByTestId("lyrics-cleanup-more-summary").press("Enter");
  assert.equal(await moreCleanup.getAttribute("open"), "", "the More cleanup disclosure opens from the keyboard");
  await page.getByTestId("lyrics-cleanup-lrc-preview").click();
  await page.getByTestId("lyrics-cleanup-lrc-preview-result").waitFor({ state: "visible" });
  assert.equal(
    await page.getByTestId("lyrics-cleanup-lrc-preview-result").evaluate((node) => Boolean(node.closest(".lyrics-sidebar-operation"))),
    true,
    "LRC preview expands inline beneath its operation"
  );
  assert.equal(await originalLyrics.inputValue(), previewFixture, "LRC preview is non-mutating");
  await page.getByTestId("lyrics-cleanup-lrc-apply").click();
  assert.equal(await originalLyrics.inputValue(), "[Verse 1]\nWorld\nEnd", "LRC cleanup applies only after preview confirmation");
  await page.getByTestId("lyrics-command-undo").click();
  await page.getByTestId("lyrics-tags-preview").click();
  await page.getByTestId("lyrics-tags-preview-result").waitFor({ state: "visible" });
  assert.equal(await originalLyrics.inputValue(), previewFixture, "paragraph-label preview is non-mutating");
  await page.getByTestId("lyrics-tags-apply").click();
  assert.equal(await originalLyrics.inputValue(), "[00:01.00]World\nEnd", "paragraph-label cleanup applies only after explicit confirmation");
  await page.getByTestId("lyrics-command-undo").click();

  const nonAlignedLyrics = "one\n\nkeep\ntwo";
  const nonAlignedTranslation = "uno\ntranslated content\nmantener\ndos";
  await fillExact(originalLyrics, nonAlignedLyrics);
  await fillExact(translationLyrics, nonAlignedTranslation);
  await selectLyricsRange(originalLyrics, 0, 0);
  await page.getByTestId("lyrics-cleanup-scope-synchronized").click();
  assert.match(
    await page.getByTestId("lyrics-cleanup-scope-summary").textContent(),
    /原文\/译文全栏/,
    "the synchronized whole-document context explicitly names both columns"
  );
  await page.getByTestId("lyrics-cleanup-blank-all-preview").click();
  await page.getByTestId("lyrics-cleanup-blank-all-preview-result").waitFor({ state: "visible" });
  assert.match(await page.getByTestId("lyrics-cleanup-blank-all-preview-result").textContent(), /0 个空行/, "zero-change synchronized cleanup reports an explicit preview");
  assert.equal(await page.getByTestId("lyrics-cleanup-blank-all").isDisabled(), true, "zero-change synchronized cleanup cannot silently mutate either column");
  assert.equal(await originalLyrics.inputValue(), nonAlignedLyrics, "synchronized cleanup preserves an original-only blank row");
  assert.equal(await translationLyrics.inputValue(), nonAlignedTranslation, "synchronized cleanup preserves the translated content aligned to that row");

  const alignedLyrics = "one\n\nkeep\ntwo";
  const alignedTranslation = "uno\n\nmantener\ndos";
  await fillExact(originalLyrics, alignedLyrics);
  await fillExact(translationLyrics, alignedTranslation);
  await selectLyricsRange(originalLyrics, 0, 0);
  assert.equal(await page.getByTestId("lyrics-cleanup-blank-all").isEnabled(), true, "mutually blank rows enable the explicit synchronized confirmation");
  await page.getByTestId("lyrics-cleanup-blank-all").click();
  assert.equal(await originalLyrics.inputValue(), "one\nkeep\ntwo", "synchronized cleanup removes a mutually blank row from the original");
  assert.equal(await translationLyrics.inputValue(), "uno\nmantener\ndos", "synchronized cleanup removes the same row from the translation");
  await page.getByTestId("lyrics-command-undo").click();
  assert.equal(await originalLyrics.inputValue(), alignedLyrics, "undo restores synchronized original rows");
  assert.equal(await translationLyrics.inputValue(), alignedTranslation, "undo restores synchronized translation rows");

  const navigationFixture = Array.from({ length: 60 }, (_, index) => (
    index === 19 || index === 20
      ? "repeat chorus"
      : index === 41
        ? "hidden\u200Bcharacter"
        : `navigation line ${index + 1}`
  )).join("\n");
  const navigationTranslation = Array.from({ length: 60 }, (_, index) => `译文行 ${index + 1}`).join("\n");
  await fillExact(originalLyrics, navigationFixture);
  await fillExact(translationLyrics, navigationTranslation);
  const anchorStart = navigationFixture.indexOf("hidden\u200Bcharacter");
  await selectLyricsRange(originalLyrics, anchorStart, anchorStart + "hidden\u200Bcharacter".length, 0.62);
  const beforeTabChange = await getLyricsContext(originalLyrics);
  assert.ok(beforeTabChange.scrollTop > 0, "tab-state regression starts from a scrolled editor anchor");
  const sidebarTabBeforeReview = await page.getByTestId("lyrics-sidebar").getAttribute("data-active-tab");
  await page.getByTestId("lyrics-command-review").click();
  await page.getByTestId("lyrics-review-panel").waitFor({ state: "visible" });
  const afterTabChange = await getLyricsContext(originalLyrics);
  assertSameSelection(beforeTabChange, afterTabChange, "opening the toolbar review");
  assert.ok(Math.abs(afterTabChange.scrollTop - beforeTabChange.scrollTop) <= 1, "opening toolbar review preserves shared scroll position");
  assert.equal(
    await page.getByTestId("lyrics-sidebar").getAttribute("data-active-tab"),
    sidebarTabBeforeReview,
    "toolbar review does not replace the active editing inspector"
  );
  assert.ok(await page.getByTestId("lyrics-review-issue").count() >= 2, "Review reports repeated and invisible-character diagnostics without deleting lyrics");
  assert.equal(await originalLyrics.inputValue(), navigationFixture, "Review diagnostics never silently remove repeated choruses");
  const invisibleIssue = page.getByTestId("lyrics-review-issue").filter({ hasText: "不可见" }).first();
  await invisibleIssue.click();
  assert.match(await page.getByTestId("lyrics-command-position").textContent(), /第 42 \/ 60 行/, "clicking an issue locates the affected editor line");

  await page.getByTestId("lyrics-command-review").click();
  await page.getByTestId("lyrics-line-budget").waitFor({ state: "visible" });
  assert.equal(await page.getByTestId("lyrics-sidebar-tab-review").count(), 0, "Review is removed from the sidebar tabs");
  assert.equal(await page.getByTestId("lyrics-sidebar-tab-source").count(), 0, "Source is removed from the sidebar tabs");
  await page.getByTestId("lyrics-review-close").click();

  await page.getByTestId("lyrics-command-fetch").click();
  await page.getByTestId("lyrics-fetch-panel-boundary").waitFor({ state: "visible" });
  assert.equal(
    await page.getByTestId("lyrics-sidebar").getAttribute("data-active-tab"),
    sidebarTabBeforeReview,
    "independent fetch action does not replace the active editing inspector"
  );
  await page.getByTestId("lyrics-fetch-close").click();

  await fillExact(originalLyrics, originalFixture);
  await fillExact(translationLyrics, translationFixture);
  await page.getByTestId("lyrics-sidebar-tab-translation").click();

  const hiddenEditorFixture = `${originalFixture}\noriginal tail  `;
  await fillExact(originalLyrics, hiddenEditorFixture);
  await fillExact(translationLyrics, translationFixture);
  await selectLyricsRange(originalLyrics, 0, 0);
  await selectLyricsRange(translationLyrics, 0, 0);
  const translationToggle = page.getByTestId("translation-toggle");
  await translationToggle.click();
  await translationLyrics.waitFor({ state: "detached" });
  assert.match(
    await page.getByTestId("lyrics-command-position").textContent(),
    /原文/,
    "disabling the active translation editor transfers command scope to the visible original"
  );
  await page.getByTestId("lyrics-sidebar-tab-cleanup").click();
  assert.equal(
    await page.getByTestId("lyrics-cleanup-scope-active").getAttribute("aria-pressed"),
    "true",
    "disabling translation resets cleanup to the explicit active-column scope"
  );
  assert.equal(
    await page.getByTestId("lyrics-cleanup-scope-synchronized").getAttribute("aria-pressed"),
    "false",
    "a hidden translation column cannot leave synchronized cleanup selected"
  );
  await page.getByTestId("lyrics-command-clean-paste").click();
  assert.equal(
    await originalLyrics.inputValue(),
    `${originalFixture}\noriginal tail`,
    "cleanup after hiding translation edits the visible original instead of the detached translation"
  );
  await page.getByTestId("lyrics-command-undo").click();
  assert.equal(await originalLyrics.inputValue(), hiddenEditorFixture, "hidden-editor scope cleanup remains undoable");
  await page.getByTestId("lyrics-sidebar-tab-translation").click();
  await translationToggle.click();
  await translationLyrics.waitFor({ state: "visible" });
  assert.equal(
    await translationLyrics.inputValue(),
    translationFixture,
    "hiding translation and cleaning the original leaves hidden translation text untouched"
  );
  await fillExact(originalLyrics, originalFixture);
  await fillExact(translationLyrics, translationFixture);
}

async function assertLyricsWorkspaceSplitInteractions() {
  await setWindowSize(1280, 900);
  await waitForLayoutStable(page.getByTestId("lyrics-workspace-split"));
  const fixedLayout = await page.getByTestId("lyrics-workspace-split").evaluate((split) => ({
    ratio: Number(split.getAttribute("data-editor-ratio")),
    splitWidth: split.getBoundingClientRect().width,
    toolsWidth: document.querySelector('[data-testid="lyrics-sidebar"]')?.getBoundingClientRect().width ?? 0,
    statusInsideToolbar: Boolean(document.querySelector('[data-testid="lyrics-command-bar"]')?.contains(
      document.querySelector('[data-testid="lyrics-status-bar"]')
    ))
  }));
  assert.ok(Math.abs(fixedLayout.ratio - 2 / 3) <= 0.002, `desktop lyrics use the fixed maximum sidebar ratio: ${JSON.stringify(fixedLayout)}`);
  assert.ok(Math.abs(fixedLayout.toolsWidth / (fixedLayout.splitWidth - 8) - 1 / 3) <= 0.01, `the sidebar occupies one third of usable width: ${JSON.stringify(fixedLayout)}`);
  assert.equal(fixedLayout.statusInsideToolbar, true, "cursor and scope status live inside the command toolbar");
  assert.equal(await page.getByTestId("lyrics-workspace-resizer").count(), 0, "step two exposes no width adjustment separator");
  assert.equal(await page.getByTestId("lyrics-command-sidebar-toggle").count(), 0, "desktop step two exposes no collapse button");
  assert.equal(await page.getByTestId("lyrics-sidebar").getAttribute("data-collapsed"), null, "the sidebar has no collapsed state");
  assert.equal(await page.getByTestId("lyrics-sidebar-collapsed-layer").count(), 0, "the collapsed motion layer is removed");

  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await waitForVisible("settings-surface");
  await selectSettingsSection("ai");
  await (await waitForVisible("ai-open-api")).click();
  await page.getByTestId("ai-api-key-input").fill("sk-desktop-panel-regression");
  await page.waitForFunction(async () => Boolean((await window.lyricsCardDesktop?.loadAISettings())?.hasApiKey));
  await page.getByTestId("settings-close-button").click();
  await page.locator('[data-testid="settings-surface"][data-surface-state="closed"]').waitFor({ state: "attached" });

  await page.getByTestId("lyrics-sidebar-tab-cleanup").click();
  const pasteSection = page.getByTestId("lyrics-cleanup-section-paste");
  assert.equal(await pasteSection.locator("summary").count(), 0, "single-action cleanup section has no redundant disclosure");
  await page.getByTestId("lyrics-cleanup-paste").waitFor({ state: "visible" });
  for (const tab of ["cleanup", "translation"]) {
    await page.getByTestId(`lyrics-sidebar-tab-${tab}`).waitFor({ state: "visible" });
  }
  // Observe the transient overlap before triggering it so fast animation completion cannot hide the outgoing page first.
  const [tabSlide] = await Promise.all([
    page.waitForFunction(() => {
      const viewport = document.querySelector('[data-testid="lyrics-translation-page-viewport"]');
      const cleanup = document.querySelector('[data-testid="lyrics-sidebar-panel-cleanup"]');
      const translation = document.querySelector('[data-testid="lyrics-translation-home-page"]');
      if (
        viewport?.getAttribute("data-sidebar-page") !== "translation" ||
        !(cleanup instanceof HTMLElement) ||
        !(translation instanceof HTMLElement) ||
        cleanup.hidden ||
        translation.hidden
      ) {
        return false;
      }
      return {
        cleanupAriaHidden: cleanup.getAttribute("aria-hidden"),
        cleanupInert: cleanup.hasAttribute("inert"),
        cleanupPointerEvents: getComputedStyle(cleanup).pointerEvents,
        translationAriaHidden: translation.getAttribute("aria-hidden"),
        translationInert: translation.hasAttribute("inert")
      };
    }),
    page.getByTestId("lyrics-sidebar-tab-translation").click()
  ]);
  assert.deepEqual(
    await tabSlide.jsonValue(),
    {
      cleanupAriaHidden: "true",
      cleanupInert: true,
      cleanupPointerEvents: "none",
      translationAriaHidden: null,
      translationInert: false
    },
    "Cleanup and Translation slide concurrently while the outgoing page immediately leaves the interaction tree"
  );
  await page.waitForFunction(() => {
    const viewport = document.querySelector('[data-testid="lyrics-translation-page-viewport"]');
    const translation = document.querySelector('[data-testid="lyrics-translation-home-page"]');
    const viewportRect = viewport?.getBoundingClientRect();
    const translationRect = translation?.getBoundingClientRect();
    return Boolean(
      viewportRect &&
      translationRect &&
      Math.abs(translationRect.left - viewportRect.left) <= 1
    );
  });
  await page.getByTestId("lyrics-sidebar-tab-cleanup").click();
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="lyrics-translation-page-viewport"]')?.getAttribute("data-sidebar-page") === "cleanup" &&
    !document.querySelector('[data-testid="lyrics-sidebar-panel-cleanup"]')?.hasAttribute("hidden")
  ));
  await page.getByTestId("lyrics-status-bar").waitFor({ state: "visible" });
  assert.equal(await page.getByTestId("lyrics-cleanup-paste").isVisible(), true, "the always-open inspector exposes direct cleanup actions");

  const persistedAiSettings = await page.evaluate(() => window.lyricsCardDesktop?.loadAISettings());
  assert.equal(persistedAiSettings?.hasApiKey, true, `AI regression has configured settings: ${JSON.stringify(persistedAiSettings)}`);
  const fixedBeforeAI = await page.evaluate(() => {
    const editor = document.querySelector("#lyrics-workspace-editor")?.getBoundingClientRect();
    const sidebar = document.querySelector('[data-testid="lyrics-sidebar"]')?.getBoundingClientRect();
    const tabs = document.querySelector('[data-testid="lyrics-sidebar-tab-translation"]')?.getBoundingClientRect();
    return {
      editor: editor ? { left: editor.left, width: editor.width } : null,
      sidebar: sidebar ? { left: sidebar.left, width: sidebar.width } : null,
      tabs: tabs ? { left: tabs.left, top: tabs.top, width: tabs.width } : null
    };
  });
  const [concurrentPages] = await Promise.all([
    page.waitForFunction(() => {
      const viewport = document.querySelector('[data-testid="lyrics-translation-page-viewport"]');
      const cleanup = document.querySelector('[data-testid="lyrics-sidebar-panel-cleanup"]');
      const home = document.querySelector('[data-testid="lyrics-translation-home-page"]');
      const ai = document.querySelector('[data-testid="lyrics-translation-ai-page"]');
      if (
        viewport?.getAttribute("data-sidebar-page") !== "ai" ||
        !(cleanup instanceof HTMLElement) ||
        !(home instanceof HTMLElement) ||
        !(ai instanceof HTMLElement) ||
        cleanup.hidden ||
        ai.hidden
      ) {
        return false;
      }
      return {
        cleanupAriaHidden: cleanup.getAttribute("aria-hidden"),
        cleanupInert: cleanup.hasAttribute("inert"),
        cleanupPointerEvents: getComputedStyle(cleanup).pointerEvents,
        intermediateHomeHidden: home.hidden,
        aiAriaHidden: ai.getAttribute("aria-hidden")
      };
    }),
    page.getByTestId("lyrics-command-ai").click()
  ]);
  assert.deepEqual(
    await concurrentPages.jsonValue(),
    {
      cleanupAriaHidden: "true",
      cleanupInert: true,
      cleanupPointerEvents: "none",
      intermediateHomeHidden: true,
      aiAriaHidden: null
    },
    "the top AI command performs one direct Cleanup-to-AI slide without exposing the intermediate Translation home"
  );
  await page.getByTestId("lyrics-translation-ai-page").waitFor({ state: "visible" });
  await page.getByTestId("ai-translate-panel").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-testid") === "lyrics-ai-page-back",
    undefined,
    { timeout: 5_000 }
  );
  assert.equal(await page.getByTestId("lyrics-sidebar").getAttribute("data-active-tab"), "translation", "AI command selects the Translation tab");
  assert.equal(await page.getByTestId("lyrics-ai-panel-boundary").count(), 0, "AI translation is no longer an inline child of the home page");
  assert.equal(await page.getByTestId("ai-translate-panel").getAttribute("data-presentation"), "sidebar-page", "AI uses the dedicated sidebar-page presentation");
  assert.equal(
    await page.getByTestId("lyrics-ai-page-back").evaluate((node) => document.activeElement === node),
    true,
    "the top command transfers focus to the AI page back control after the slide completes"
  );
  const fixedDuringAI = await page.evaluate(() => {
    const editor = document.querySelector("#lyrics-workspace-editor")?.getBoundingClientRect();
    const sidebar = document.querySelector('[data-testid="lyrics-sidebar"]')?.getBoundingClientRect();
    const tabs = document.querySelector('[data-testid="lyrics-sidebar-tab-translation"]')?.getBoundingClientRect();
    return {
      editor: editor ? { left: editor.left, width: editor.width } : null,
      sidebar: sidebar ? { left: sidebar.left, width: sidebar.width } : null,
      tabs: tabs ? { left: tabs.left, top: tabs.top, width: tabs.width } : null
    };
  });
  for (const area of ["editor", "sidebar", "tabs"]) {
    assert.ok(fixedBeforeAI[area] && fixedDuringAI[area], `${area} geometry is measurable`);
    for (const key of Object.keys(fixedBeforeAI[area])) {
      assert.ok(
        Math.abs(fixedBeforeAI[area][key] - fixedDuringAI[area][key]) <= 1,
        `${area}.${key} stays fixed while only the Translation content page slides`
      );
    }
  }

  assert.equal(
    await page.getByTestId("ai-translate-stage-viewport").getAttribute("data-ai-stage"),
    "setup",
    "AI opens on the preset and reasoning setup page"
  );
  await setNativeDialogDecision("accept");
  await page.getByTestId("confirm-ai-translate").click();
  const runPageTransition = await page.waitForFunction(() => {
    const viewport = document.querySelector('[data-testid="ai-translate-stage-viewport"]');
    const setup = document.querySelector('[data-testid="ai-translate-setup-page"]');
    const run = document.querySelector('[data-testid="ai-translate-run-page"]');
    if (
      viewport?.getAttribute("data-ai-stage") !== "run" ||
      !(setup instanceof HTMLElement) ||
      !(run instanceof HTMLElement)
    ) {
      return false;
    }
    return {
      setupAriaHidden: setup.getAttribute("aria-hidden"),
      setupInert: setup.hasAttribute("inert"),
      setupPointerEvents: getComputedStyle(setup).pointerEvents,
      runAriaHidden: run.getAttribute("aria-hidden"),
      runInert: run.hasAttribute("inert")
    };
  });
  assert.deepEqual(
    await runPageTransition.jsonValue(),
    {
      setupAriaHidden: "true",
      setupInert: true,
      setupPointerEvents: "none",
      runAriaHidden: null,
      runInert: false
    },
    "starting AI translation slides to a dedicated runtime page and immediately isolates the setup page"
  );
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-testid") === "lyrics-ai-run-page-back",
    undefined,
    { timeout: 5_000 }
  );
  assert.equal(
    await page.getByTestId("lyrics-translation-page-viewport").getAttribute("data-sidebar-page"),
    "ai",
    "the runtime transition stays inside the fixed AI sidebar route"
  );
  await page.evaluate(() => {
    const cancel = document.querySelector('[data-testid="cancel-ai-translate"]');
    if (cancel instanceof HTMLButtonElement) cancel.click();
  });
  await page.waitForFunction(() => {
    const command = document.querySelector('[data-testid="lyrics-command-ai"]');
    return command instanceof HTMLButtonElement && !command.disabled;
  });
  await page.getByTestId("lyrics-sidebar-tab-cleanup").click();
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="lyrics-translation-page-viewport"]')?.getAttribute("data-sidebar-page") === "cleanup"
  ));
  await page.getByTestId("lyrics-command-ai").click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="lyrics-translation-page-viewport"]')?.getAttribute("data-sidebar-page") === "ai"
      && document.activeElement?.getAttribute("data-testid") === "lyrics-ai-run-page-back",
    undefined,
    { timeout: 5_000 }
  );
  assert.equal(
    await page.getByTestId("ai-translate-stage-viewport").getAttribute("data-ai-stage"),
    "run",
    "the AI command restores a retained run/results page and focuses its active back control"
  );
  await page.getByTestId("lyrics-ai-run-page-back").click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="ai-translate-stage-viewport"]')?.getAttribute("data-ai-stage") === "setup"
      && document.activeElement?.getAttribute("data-testid") === "confirm-ai-translate",
    undefined,
    { timeout: 5_000 }
  );
  assert.equal(
    await page.getByTestId("ai-translate-run-page").count(),
    0,
    "returning from the runtime page completes its exit before restoring setup focus"
  );

  await page.getByTestId("lyrics-ai-page-back").click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="lyrics-translation-page-viewport"]')?.getAttribute("data-translation-page") === "home"
      && document.activeElement?.getAttribute("data-testid") === "ai-translate-button",
    undefined,
    { timeout: 5_000 }
  );
  await page.getByTestId("lyrics-translation-home-page").waitFor({ state: "visible" });
  const translationHierarchy = await page.evaluate(() => {
    const primary = document.querySelector('[data-testid="lyrics-translation-primary"]');
    const tools = document.querySelector('[data-testid="lyrics-translation-column-tools"]');
    const primaryRect = primary?.getBoundingClientRect();
    const toolsRect = tools?.getBoundingClientRect();
    return {
      primaryBeforeTools: Boolean(primaryRect && toolsRect && primaryRect.top < toolsRect.top),
      toggleInPrimary: Boolean(primary?.contains(document.querySelector('[data-testid="translation-toggle"]'))),
      aiInPrimary: Boolean(primary?.contains(document.querySelector('[data-testid="lyrics-ai-entry"]'))),
      splitInTools: Boolean(tools?.contains(document.querySelector('[data-testid="lyrics-translation-section-split"]'))),
      formatInTools: Boolean(tools?.contains(document.querySelector('[data-testid="lyrics-translation-section-format"]'))),
      swapInTools: Boolean(tools?.contains(document.querySelector('[data-testid="lyrics-translation-section-swap"]')))
    };
  });
  assert.deepEqual(
    translationHierarchy,
    {
      primaryBeforeTools: true,
      toggleInPrimary: true,
      aiInPrimary: true,
      splitInTools: true,
      formatInTools: true,
      swapInTools: true
    },
    `translation first view prioritizes enablement and AI before one column-tools group: ${JSON.stringify(translationHierarchy)}`
  );
  assert.equal(
    await page.getByTestId("ai-translate-button").evaluate((node) => document.activeElement === node),
    true,
    "returning from the AI page restores focus to the home-page AI trigger"
  );

  await setAppReducedMotion(true);
  await page.waitForFunction(
    () => document.querySelector('[data-testid="lyrics-translation-page-viewport"]')?.getAttribute("data-reduced-motion") === "true"
  );
  await page.getByTestId("ai-translate-button").click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="lyrics-translation-page-viewport"]')?.getAttribute("data-translation-page") === "ai"
      && document.activeElement?.getAttribute("data-testid") === "lyrics-ai-page-back",
    undefined,
    { timeout: 5_000 }
  );
  const reducedMotionAIPage = await page.evaluate(() => {
    const viewport = document.querySelector('[data-testid="lyrics-translation-page-viewport"]');
    const aiPage = document.querySelector('[data-testid="lyrics-translation-ai-page"]');
    const viewportRect = viewport?.getBoundingClientRect();
    const pageRect = aiPage?.getBoundingClientRect();
    return {
      reducedMotion: viewport?.getAttribute("data-reduced-motion"),
      horizontalOffset: viewportRect && pageRect ? pageRect.left - viewportRect.left : null,
      transform: aiPage ? getComputedStyle(aiPage).transform : null
    };
  });
  assert.equal(reducedMotionAIPage.reducedMotion, "true", "the Translation viewport follows the shared reduced-motion preference");
  assert.ok(
    reducedMotionAIPage.horizontalOffset !== null && Math.abs(reducedMotionAIPage.horizontalOffset) <= 1,
    `reduced motion enters the AI page without horizontal travel: ${JSON.stringify(reducedMotionAIPage)}`
  );
  await page.getByTestId("lyrics-ai-page-back").click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="lyrics-translation-page-viewport"]')?.getAttribute("data-translation-page") === "home"
      && document.activeElement?.getAttribute("data-testid") === "ai-translate-button",
    undefined,
    { timeout: 5_000 }
  );
  await setAppReducedMotion(false);
  await page.waitForFunction(
    () => document.querySelector('[data-testid="lyrics-translation-page-viewport"]')?.getAttribute("data-reduced-motion") === "false"
  );
  const homeOffsetAfterReducedMotion = await page.evaluate(() => {
    const viewport = document.querySelector('[data-testid="lyrics-translation-page-viewport"]');
    const home = document.querySelector('[data-testid="lyrics-translation-home-page"]');
    const viewportRect = viewport?.getBoundingClientRect();
    const homeRect = home?.getBoundingClientRect();
    return viewportRect && homeRect ? homeRect.left - viewportRect.left : null;
  });
  assert.ok(
    homeOffsetAfterReducedMotion !== null && Math.abs(homeOffsetAfterReducedMotion) <= 1,
    `restoring regular motion keeps the active Translation home page anchored: ${homeOffsetAfterReducedMotion}`
  );

  await page.getByTestId("ai-translate-button").click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="lyrics-translation-page-viewport"]')?.getAttribute("data-translation-page") === "ai"
      && document.activeElement?.getAttribute("data-testid") === "lyrics-ai-page-back",
    undefined,
    { timeout: 5_000 }
  );
  await page.locator('button[data-step-id="layout"]').click();
  await page.locator('button[data-step-id="lyrics"]').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="lyrics-translation-page-viewport"]')?.getAttribute("data-translation-page") === "home",
    undefined,
    { timeout: 5_000 }
  );
  assert.equal(await page.getByTestId("lyrics-translation-ai-page").count(), 0, "unmounting step two clears the AI child page before the workspace is reopened");
  const homeOffsetAfterStepReopen = await page.evaluate(() => {
    const viewport = document.querySelector('[data-testid="lyrics-translation-page-viewport"]');
    const home = document.querySelector('[data-testid="lyrics-translation-home-page"]');
    const viewportRect = viewport?.getBoundingClientRect();
    const homeRect = home?.getBoundingClientRect();
    return viewportRect && homeRect ? homeRect.left - viewportRect.left : null;
  });
  assert.ok(
    homeOffsetAfterStepReopen !== null && Math.abs(homeOffsetAfterStepReopen) <= 1,
    `reopening Step 2 anchors the Translation home page inside its viewport: ${homeOffsetAfterStepReopen}`
  );

  await page.getByTestId("lyrics-swap-preview").click();
  await page.getByTestId("lyrics-swap-preview-result").waitFor({ state: "visible" });
  assert.equal(
    await page.getByTestId("lyrics-swap-preview-result").evaluate((node) => Boolean(
      node.closest(".lyrics-sidebar-operation")?.querySelector('[data-testid="lyrics-swap-preview"]')
    )),
    true,
    "the dangerous column swap keeps its preview and confirmation inline with the invoking operation"
  );
  await page.getByTestId("lyrics-swap-preview").click();
  await page.getByTestId("lyrics-swap-preview-result").waitFor({ state: "hidden" });

  await page.locator('button[data-step-id="layout"]').click();
  await page.locator('button[data-step-id="lyrics"]').click();
  await page.getByTestId("lyrics-sidebar").waitFor({ state: "visible" });
  assert.equal(await page.getByTestId("lyrics-sidebar").getAttribute("data-active-tab"), "translation", "step switching preserves the active sidebar tab");
  assert.equal(await page.getByTestId("lyrics-command-sidebar-toggle").count(), 0, "step switching does not restore a desktop collapse control");
  assert.ok(Math.abs(Number(await page.getByTestId("lyrics-workspace-split").getAttribute("data-editor-ratio")) - 2 / 3) <= 0.002, "step switching preserves the fixed maximum sidebar width");
}

async function assertLyricsWorkspaceContentPressure(originalLyrics, translationLyrics, translationToggle) {
  await setWindowSize(1920, 1080);
  await translationToggle.click();
  await translationLyrics.waitFor({ state: "detached" });

  const shortThirtySix = Array.from({ length: 36 }, (_, index) => `short phrase ${String(index + 1).padStart(2, "0")}`).join("\n");
  await originalLyrics.fill(shortThirtySix);
  await waitForLyricsLineBudget("36 / 36");
  const singleColumn = await page.getByTestId("lyrics-editor-columns").evaluate((columns) => {
    const editor = columns.querySelector("textarea");
    const viewport = columns.parentElement;
    const columnsRect = columns.getBoundingClientRect();
    const viewportRect = viewport?.getBoundingClientRect();
    const editorRect = editor?.getBoundingClientRect();
    return {
      bilingual: columns.getAttribute("data-bilingual"),
      columnsWidth: columnsRect.width,
      editorWidth: editorRect?.width ?? 0,
      leftGap: viewportRect ? columnsRect.left - viewportRect.left : 0,
      rightGap: viewportRect ? viewportRect.right - columnsRect.right : 0,
      textareaCount: columns.querySelectorAll('textarea:not([data-lyrics-editor-measure="true"])').length
    };
  });
  assert.equal(singleColumn.bilingual, "false", "single-language editing uses one canvas");
  assert.equal(singleColumn.textareaCount, 1, "single-language editing renders one textarea");
  assert.ok(singleColumn.columnsWidth >= 720 && singleColumn.columnsWidth <= 840, `single-language paper stays in the comfortable width range: ${JSON.stringify(singleColumn)}`);
  assert.ok(Math.abs(singleColumn.leftGap - singleColumn.rightGap) <= 2, `single-language paper stays centered: ${JSON.stringify(singleColumn)}`);

  await setWindowSize(1000, 700);
  const ninetySixLines = Array.from({ length: 96 }, (_, index) => `pressure line ${String(index + 1).padStart(2, "0")}`).join("\n");
  await originalLyrics.fill(ninetySixLines);
  await waitForLyricsLineBudget("96 / 36");
  await page.getByTestId("lyrics-shared-scroll").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const longLine = "a deliberately long lyric fragment ".repeat(28).trim();
  const trimmedThirtySix = [longLine, ...Array.from({ length: 35 }, (_, index) => `trimmed line ${index + 2}`)].join("\n");
  await originalLyrics.fill(trimmedThirtySix);
  await waitForLyricsLineBudget("36 / 36");
  const pressureResult = await page.getByTestId("lyrics-workspace").evaluate((workspace) => {
    const textarea = workspace.querySelector("textarea");
    const shared = workspace.querySelector('[data-testid="lyrics-shared-scroll"]');
    return {
      textareaCount: workspace.querySelectorAll('textarea:not([data-lyrics-editor-measure="true"])').length,
      textareaScrollWidth: textarea?.scrollWidth ?? 0,
      textareaClientWidth: textarea?.clientWidth ?? 0,
      sharedOverflowX: shared ? getComputedStyle(shared).overflowX : null,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  assert.equal(pressureResult.textareaCount, 1, "96-line trimming pressure stays in the single editor");
  assert.ok(pressureResult.textareaScrollWidth <= pressureResult.textareaClientWidth + 1, `long lines wrap without textarea overflow: ${JSON.stringify(pressureResult)}`);
  assert.equal(pressureResult.sharedOverflowX, "hidden", "long lines do not add a shared horizontal scrollbar");
  assert.ok(pressureResult.pageOverflow <= 1, `pressure content does not overflow the window: ${JSON.stringify(pressureResult)}`);

  await translationToggle.click();
  await translationLyrics.waitFor({ state: "visible" });
}

async function assertLyricsWorkspaceNarrowBehavior(originalLyrics, translationLyrics) {
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setMinimumSize(600, 600);
  });
  try {
    await setWindowSize(760, 720);
    await page.waitForFunction(() => document.querySelector('[data-testid="lyrics-workspace-split"]')?.getAttribute("data-side-by-side") === "false");
    assert.equal(await page.getByTestId("lyrics-sidebar").count(), 1, "narrow layout keeps one stable drawer lifecycle");
    await page.getByTestId("lyrics-sidebar").waitFor({ state: "hidden" });
    assert.equal(await page.getByTestId("lyrics-workspace-resizer").count(), 0, "narrow layout removes the desktop separator");
    const editorWidthBefore = await page.locator("#lyrics-workspace-editor").evaluate((node) => node.getBoundingClientRect().width);
    await page.getByTestId("lyrics-command-sidebar-toggle").click();
    await page.getByTestId("lyrics-sidebar").waitFor({ state: "visible" });
    await waitForLayoutStable(page.getByTestId("lyrics-sidebar"));
    assert.equal(
      await page.getByTestId("lyrics-sidebar-close-drawer").evaluate((node) => document.activeElement === node),
      true,
      "opening the narrow drawer moves keyboard focus to its close control"
    );
    const drawerGeometry = await page.evaluate(() => {
      const editor = document.querySelector('#lyrics-workspace-editor');
      const sidebar = document.querySelector('[data-testid="lyrics-sidebar"]');
      const split = document.querySelector('[data-testid="lyrics-workspace-split"]');
      const editorRect = editor?.getBoundingClientRect();
      const sidebarRect = sidebar?.getBoundingClientRect();
      const splitRect = split?.getBoundingClientRect();
      return {
        editorWidth: editorRect?.width ?? 0,
        sidebarWidth: sidebarRect?.width ?? 0,
        sidebarBottom: sidebarRect?.bottom ?? 0,
        splitBottom: splitRect?.bottom ?? 0,
        mobileDrawer: sidebar?.getAttribute("data-mobile-drawer"),
        backdrop: Boolean(document.querySelector('[data-testid="lyrics-sidebar-backdrop"]')),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    assert.ok(Math.abs(drawerGeometry.editorWidth - editorWidthBefore) <= 1, `opening the drawer does not squeeze the lyric editor: ${JSON.stringify(drawerGeometry)}`);
    assert.equal(drawerGeometry.mobileDrawer, "true", "narrow sidebar identifies itself as an overlay drawer");
    assert.equal(drawerGeometry.backdrop, true, "narrow drawer includes a dismissible backdrop");
    assert.ok(Math.abs(drawerGeometry.sidebarBottom - drawerGeometry.splitBottom) <= 1, `drawer anchors to the workspace bottom: ${JSON.stringify(drawerGeometry)}`);
    assert.ok(drawerGeometry.sidebarWidth >= editorWidthBefore - 1, `drawer uses the workspace width without shrinking the editor: ${JSON.stringify(drawerGeometry)}`);
    assert.ok(drawerGeometry.horizontalOverflow <= 1, `760px drawer avoids horizontal page overflow: ${JSON.stringify(drawerGeometry)}`);
    assert.equal(await page.getByTestId("lyrics-sidebar").getAttribute("role"), "dialog", "narrow drawer exposes dialog semantics");
    assert.equal(await page.getByTestId("lyrics-sidebar").getAttribute("aria-modal"), "true", "narrow drawer identifies its modal focus boundary");
    if (runVisualDiagnostics) {
      await page.screenshot({ path: path.join(reportDirectory, "step-two-drawer-760x720.png"), fullPage: false });
    }

    await page.getByTestId("lyrics-sidebar-close-drawer").click();
    await page.getByTestId("lyrics-sidebar").waitFor({ state: "hidden" });
    assert.equal(await page.getByTestId("lyrics-command-find").count(), 0, "narrow command bar does not expose low-value find/replace");
    for (const command of ["keep-selection", "clean-paste", "collapse-blanks", "strip-lrc", "ai"]) {
      await page.getByTestId(`lyrics-command-${command}`).waitFor({ state: "visible" });
    }
    for (const command of ["fetch", "review"]) {
      await page.getByTestId(`lyrics-command-${command}`).waitFor({ state: "visible" });
    }
    await page.getByTestId("lyrics-command-clean-paste").click();
    assert.equal(await page.getByTestId("lyrics-sidebar").isHidden(), true, "direct cleanup command does not open the inspector drawer");
    await page.getByTestId("lyrics-command-sidebar-toggle").click();
    await page.getByTestId("lyrics-sidebar").waitFor({ state: "visible" });
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("data-testid") === "lyrics-sidebar-close-drawer",
      undefined,
      { timeout: 5_000 }
    );
    assert.equal(
      await page.getByTestId("lyrics-sidebar-close-drawer").evaluate((node) => document.activeElement === node),
      true,
      "plain drawer disclosure focuses the close control"
    );
    await page.getByTestId("lyrics-sidebar-close-drawer").press("Shift+Tab");
    assert.equal(
      await page.getByTestId("lyrics-sidebar").evaluate((node) => node.contains(document.activeElement)),
      true,
      "reverse Tab remains inside the modal drawer"
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page.getByTestId("lyrics-sidebar-close-drawer").evaluate((node) => document.activeElement === node),
      true,
      "forward Tab wraps from the drawer's final control to its close control"
    );
    await page.getByTestId("lyrics-sidebar-tab-translation").click();
    await page.getByTestId("translation-toggle").waitFor({ state: "visible" });
    await page.getByTestId("ai-translate-button").click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="lyrics-translation-page-viewport"]')?.getAttribute("data-translation-page") === "ai"
        && document.activeElement?.getAttribute("data-testid") === "lyrics-ai-page-back",
      undefined,
      { timeout: 5_000 }
    );
    const setupScrollBeforeRun = await page.getByTestId("ai-translate-setup-page").evaluate((node) => {
      const target = Math.min(96, Math.max(0, node.scrollHeight - node.clientHeight));
      node.scrollTop = target;
      return { target, actual: node.scrollTop };
    });
    assert.ok(
      setupScrollBeforeRun.target > 0 &&
        Math.abs(setupScrollBeforeRun.actual - setupScrollBeforeRun.target) <= 1,
      `the narrow AI setup page has an independently scrollable position: ${JSON.stringify(setupScrollBeforeRun)}`
    );
    await setNativeDialogDecision("accept");
    await page.getByTestId("confirm-ai-translate").evaluate((node) => {
      if (!(node instanceof HTMLButtonElement)) throw new Error("AI confirm control is not a button");
      node.click();
    });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="ai-translate-stage-viewport"]')?.getAttribute("data-ai-stage") === "run"
        && document.activeElement?.getAttribute("data-testid") === "lyrics-ai-run-page-back",
      undefined,
      { timeout: 5_000 }
    );
    await page.getByTestId("lyrics-sidebar-tab-translation").focus();
    assert.equal(
      await page.getByTestId("lyrics-sidebar-tab-translation").evaluate((node) => document.activeElement === node),
      true,
      "the fixed Translation tab can hold focus while the runtime page is active"
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.querySelector('[data-testid="ai-translate-stage-viewport"]')?.getAttribute("data-ai-stage") === "setup"
        && document.activeElement?.getAttribute("data-testid") === "confirm-ai-translate",
      undefined,
      { timeout: 5_000 }
    );
    const setupScrollAfterRun = await page.getByTestId("ai-translate-setup-page").evaluate((node) => node.scrollTop);
    assert.ok(
      Math.abs(setupScrollAfterRun - setupScrollBeforeRun.target) <= 1,
      `returning from runtime restores the setup page scroll position: ${JSON.stringify({
        before: setupScrollBeforeRun,
        after: setupScrollAfterRun
      })}`
    );
    assert.equal(
      await page.getByTestId("lyrics-translation-page-viewport").getAttribute("data-sidebar-page"),
      "ai",
      "the first narrow Escape cancels runtime and returns to AI setup without leaving the AI route"
    );
    assert.equal(
      await page.getByTestId("lyrics-sidebar").isVisible(),
      true,
      "the first narrow Escape keeps the modal drawer open even when focus started on its fixed tabs"
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.querySelector('[data-testid="lyrics-translation-page-viewport"]')?.getAttribute("data-translation-page") === "home",
      undefined,
      { timeout: 5_000 }
    );
    const exitFocusTrap = await page.evaluate(() => {
      const exitingPage = document.querySelector('[data-testid="lyrics-translation-ai-page"][inert]');
      const lastHomeControl = document.querySelector('[data-testid="lyrics-swap-preview"]');
      if (!(exitingPage instanceof HTMLElement) || !(lastHomeControl instanceof HTMLElement)) {
        return null;
      }

      lastHomeControl.focus({ preventScroll: true });
      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true
      });
      lastHomeControl.dispatchEvent(event);
      return {
        defaultPrevented: event.defaultPrevented,
        activeTestId: document.activeElement?.getAttribute("data-testid"),
        exitingPageInert: exitingPage.hasAttribute("inert")
      };
    });
    assert.deepEqual(
      exitFocusTrap,
      {
        defaultPrevented: true,
        activeTestId: "lyrics-sidebar-tab-translation",
        exitingPageInert: true
      },
      "the narrow focus trap ignores inert exit controls and wraps to the active Translation tab"
    );
    await page.waitForTimeout(400);
    const focusAfterAiEscape = await page.evaluate(() => ({
      testId: document.activeElement?.getAttribute("data-testid"),
      tag: document.activeElement?.tagName,
      drawerOpen: !document.querySelector('[data-testid="lyrics-sidebar"]')?.hasAttribute("hidden"),
      homeActive: document.querySelector('[data-testid="lyrics-translation-home-page"]')?.getAttribute("data-page-active"),
      reducedMotion: document.querySelector('[data-testid="lyrics-translation-page-viewport"]')?.getAttribute("data-reduced-motion"),
      homeOffset: (() => {
        const viewportRect = document.querySelector('[data-testid="lyrics-translation-page-viewport"]')?.getBoundingClientRect();
        const homeRect = document.querySelector('[data-testid="lyrics-translation-home-page"]')?.getBoundingClientRect();
        return viewportRect && homeRect ? homeRect.left - viewportRect.left : null;
      })(),
      homeTransform: (() => {
        const home = document.querySelector('[data-testid="lyrics-translation-home-page"]');
        return home ? getComputedStyle(home).transform : null;
      })()
    }));
    assert.ok(
      focusAfterAiEscape.homeOffset !== null && Math.abs(focusAfterAiEscape.homeOffset) <= 1,
      `the second narrow Escape completes the Translation home entry before drawer dismissal: ${JSON.stringify(focusAfterAiEscape)}`
    );
    assert.equal(
      focusAfterAiEscape.testId,
      "ai-translate-button",
      `the second narrow Escape restores focus after returning home: ${JSON.stringify(focusAfterAiEscape)}`
    );
    assert.equal(await page.getByTestId("lyrics-sidebar").isVisible(), true, "the second narrow Escape returns to Translation home without closing the drawer");
    await page.keyboard.press("Escape");
    await page.getByTestId("lyrics-sidebar").waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "lyrics-command-sidebar-toggle");
    assert.equal(
      await page.getByTestId("lyrics-command-sidebar-toggle").evaluate((node) => document.activeElement === node),
      true,
      "the drawer close control restores focus to its disclosure"
    );

    await setWindowSize(610, 720);
    await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
    const stacked = await page.getByTestId("lyrics-editor-columns").evaluate((columns) => {
      const editors = [...columns.querySelectorAll('textarea:not([data-lyrics-editor-measure="true"])')]
        .map((node) => node.getBoundingClientRect());
      return {
        count: editors.length,
        original: editors[0] ? { top: editors[0].top, bottom: editors[0].bottom, width: editors[0].width } : null,
        translation: editors[1] ? { top: editors[1].top, bottom: editors[1].bottom, width: editors[1].width } : null,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    assert.equal(stacked.count, 2, "narrow bilingual mode retains both editors");
    assert.ok(
      stacked.original && stacked.translation && stacked.translation.top >= stacked.original.bottom,
      `610px bilingual mode stacks editors instead of squeezing two columns: ${JSON.stringify(stacked)}`
    );
    assert.ok(stacked.horizontalOverflow <= 1, `610px bilingual editor avoids horizontal page overflow: ${JSON.stringify(stacked)}`);
    assert.equal(await originalLyrics.isVisible(), true, "narrow mode keeps the original editor usable");
    assert.equal(await translationLyrics.isVisible(), true, "narrow mode keeps the translation editor usable");
    if (runVisualDiagnostics) {
      await page.screenshot({ path: path.join(reportDirectory, "step-two-stacked-610x720.png"), fullPage: false });
    }
  } finally {
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setMinimumSize(1000, 700);
    });
    await setWindowSize(1000, 700);
  }
}

async function assertPreviewFits(width, height, scrolled) {
  await setWindowSize(width, height);
  await page.locator('[data-testid="editor-surface"]').evaluate((element, shouldScroll) => {
    element.scrollTop = shouldScroll ? element.scrollHeight : 0;
  }, scrolled);
  try {
    await page.waitForFunction(() => {
      const preview = document.querySelector('[data-testid="lyric-card-preview"]');
      if (!(preview instanceof HTMLElement)) return false;
      const rect = preview.getBoundingClientRect();
      return rect.top >= -1 && rect.bottom <= window.innerHeight + 1;
    }, undefined, { timeout: 5_000 });
  } catch (error) {
    const geometry = await page.evaluate(() => {
      const preview = document.querySelector('[data-testid="lyric-card-preview"]');
      const previewPanel = document.querySelector('[data-workbench-panel="preview"]');
      const track = document.querySelector('[data-testid="preview-workbench-track"]');
      const editor = document.querySelector('[data-testid="editor-surface"]');
      const rect = (element) => {
        const value = element?.getBoundingClientRect();
        return value ? { top: value.top, bottom: value.bottom, height: value.height } : null;
      };
      return {
        preview: rect(preview),
        previewPanel: rect(previewPanel),
        track: rect(track),
        editor: rect(editor),
        editorScrollTop: editor instanceof HTMLElement ? editor.scrollTop : null,
        viewportHeight: window.innerHeight
      };
    });
    throw new Error(`${width}x${height} preview did not settle inside the viewport: ${JSON.stringify(geometry)}`, { cause: error });
  }
  const bounds = await page.getByTestId("lyric-card-preview").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const shell = element.querySelector('[data-testid="lyric-card-preview-shell"]');
    return {
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
      shellClientHeight: shell?.clientHeight ?? 0,
      shellScrollHeight: shell?.scrollHeight ?? 0,
      scale: shell?.getAttribute("data-preview-scale") ?? ""
    };
  });
  assert.ok(bounds.top >= -1, `${width}x${height} preview begins above the viewport: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.bottom <= bounds.viewportHeight + 1, `${width}x${height} preview exceeds the viewport: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.shellScrollHeight <= bounds.shellClientHeight + 1, `${width}x${height} preview card is clipped: ${JSON.stringify(bounds)}`);
  assert.ok(Number(bounds.scale) > 0, `${width}x${height} preview scale is invalid: ${JSON.stringify(bounds)}`);
}

async function assertExampleImportRemeasuresPreview() {
  await setWindowSize(1440, 900);
  await waitForLayoutStable(page.getByTestId("preview-workbench-track"), 10_000);
  await waitForLayoutStable(page.getByTestId("lyric-card-preview-shell"), 10_000);
  await page.waitForFunction(() => {
    const shell = document.querySelector('[data-testid="lyric-card-preview-shell"]');
    const card = shell?.querySelector('[data-export-card="true"]');
    if (!(shell instanceof HTMLElement) || !(card instanceof HTMLElement)) return false;
    const rect = shell.getBoundingClientRect();
    const styles = getComputedStyle(shell);
    const availableWidth = shell.clientWidth - Number.parseFloat(styles.paddingLeft) - Number.parseFloat(styles.paddingRight);
    const availableHeight = window.innerHeight - rect.top - Number.parseFloat(styles.paddingTop) - Number.parseFloat(styles.paddingBottom) - 16;
    const expectedScale = Math.min(
      Math.max(availableWidth, 120) / card.offsetWidth,
      Math.max(availableHeight, 120) / card.offsetHeight,
      0.52
    );
    const scale = Number(shell.getAttribute("data-preview-scale"));
    return Number.isFinite(scale) && Math.abs(scale - expectedScale) <= 0.005;
  }, undefined, { timeout: 10_000 });
  const beforeMeasurement = await page.getByTestId("lyric-card-preview-shell").evaluate((shell) => {
    const card = shell.querySelector('[data-export-card="true"]');
    if (!(shell instanceof HTMLElement) || !(card instanceof HTMLElement)) return null;
    const rect = shell.getBoundingClientRect();
    const styles = getComputedStyle(shell);
    const availableWidth = shell.clientWidth - Number.parseFloat(styles.paddingLeft) - Number.parseFloat(styles.paddingRight);
    const availableHeight = window.innerHeight - rect.top - Number.parseFloat(styles.paddingTop) - Number.parseFloat(styles.paddingBottom) - 16;
    const expected = Math.min(
      Math.max(availableWidth, 120) / card.offsetWidth,
      Math.max(availableHeight, 120) / card.offsetHeight,
      0.52
    );
    return {
      actual: Number(shell.getAttribute("data-preview-scale")),
      expected,
      cardWidth: card.offsetWidth,
      cardHeight: card.offsetHeight,
      availableWidth,
      availableHeight
    };
  });
  assert.ok(beforeMeasurement, "precondition exposes preview geometry");
  assert.ok(
    Math.abs(beforeMeasurement.actual - beforeMeasurement.expected) <= 0.005,
    `precondition uses the calculated preview scale: ${JSON.stringify(beforeMeasurement)}`
  );
  assert.equal(await page.locator('button[data-step-id="layout"]').getAttribute("aria-current"), "step", "example import starts on step three");

  await page.getByTestId("editor-surface").getByTestId("examples-button").click();
  await page.getByTestId("load-example-opalite").waitFor({ state: "visible" });
  await setNativeDialogDecision("accept");
  await page.getByTestId("load-example-opalite").click();

  await waitForLayoutStable(page.getByTestId("editor-surface"), 10_000);
  await waitForLayoutStable(page.getByTestId("preview-workbench-track"), 10_000);
  await waitForLayoutStable(page.getByTestId("lyric-card-preview-shell"), 10_000);
  await page.waitForFunction(() => {
    const surface = document.querySelector('[data-testid="editor-surface"]');
    const shell = document.querySelector('[data-testid="lyric-card-preview-shell"]');
    const card = shell?.querySelector('[data-export-card="true"]');
    if (!(surface instanceof HTMLElement) || !(shell instanceof HTMLElement) || !(card instanceof HTMLElement)) return false;
    const transform = getComputedStyle(surface).transform;
    const matrix = transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
    const rect = shell.getBoundingClientRect();
    const styles = getComputedStyle(shell);
    const availableWidth = shell.clientWidth - Number.parseFloat(styles.paddingLeft) - Number.parseFloat(styles.paddingRight);
    const availableHeight = window.innerHeight - rect.top - Number.parseFloat(styles.paddingTop) - Number.parseFloat(styles.paddingBottom) - 16;
    const expectedScale = Math.min(
      Math.max(availableWidth, 120) / card.offsetWidth,
      Math.max(availableHeight, 120) / card.offsetHeight,
      0.52
    );
    const scale = Number(shell.getAttribute("data-preview-scale"));
    return surface.getAttribute("aria-hidden") === "false" &&
      Math.abs(matrix.m41) <= 1 &&
      Math.abs(matrix.m42) <= 1 &&
      Number.isFinite(scale) &&
      Math.abs(scale - expectedScale) <= 0.005;
  }, undefined, { timeout: 10_000 });

  const afterMeasurement = await page.getByTestId("lyric-card-preview-shell").evaluate((shell) => {
    const card = shell.querySelector('[data-export-card="true"]');
    if (!(shell instanceof HTMLElement) || !(card instanceof HTMLElement)) return null;
    const rect = shell.getBoundingClientRect();
    const styles = getComputedStyle(shell);
    const availableWidth = shell.clientWidth - Number.parseFloat(styles.paddingLeft) - Number.parseFloat(styles.paddingRight);
    const availableHeight = window.innerHeight - rect.top - Number.parseFloat(styles.paddingTop) - Number.parseFloat(styles.paddingBottom) - 16;
    const expected = Math.min(
      Math.max(availableWidth, 120) / card.offsetWidth,
      Math.max(availableHeight, 120) / card.offsetHeight,
      0.52
    );
    return {
      actual: Number(shell.getAttribute("data-preview-scale")),
      expected,
      cardWidth: card.offsetWidth,
      cardHeight: card.offsetHeight,
      availableWidth,
      availableHeight
    };
  });
  assert.ok(afterMeasurement, "example import exposes returned preview geometry");
  assert.ok(
    Math.abs(afterMeasurement.actual - afterMeasurement.expected) <= 0.005,
    `example import restores the calculated preview scale: ${JSON.stringify(afterMeasurement)}`
  );
  assert.equal(await page.locator('button[data-step-id="layout"]').getAttribute("aria-current"), "step", "example import returns directly to step three");
}

async function assertBuiltInExamplesAutoWidth() {
  await page.locator('button[data-step-id="layout"]').click();
  const lineHeight = page.getByRole("slider", { name: "行高", exact: true });
  assert.equal(await lineHeight.getAttribute("min"), "1.5", "desktop exposes the new line-height minimum");
  assert.equal(await lineHeight.getAttribute("max"), "2.1", "desktop exposes the new line-height maximum");
  assert.equal(await lineHeight.getAttribute("step"), "0.05", "desktop preserves 0.05 line-height steps");
  assert.equal(await lineHeight.inputValue(), "1.8", "desktop starts at the new 1.8 line height");

  const autoWidth = page.getByRole("switch", { name: "自动宽度", exact: true });
  const width = page.getByRole("slider", { name: "宽度", exact: true });
  const results = {};

  for (const [caseIndex, example] of builtInAutoWidthCases.entries()) {
    await page.locator('button[data-step-id="layout"]').click();
    if (await autoWidth.getAttribute("aria-checked") === "true") {
      await autoWidth.click();
    }

    await page.getByTestId("editor-surface").getByTestId("examples-button").click();
    await page.getByTestId(`load-example-${example.id}`).waitFor({ state: "visible" });
    if (caseIndex === 0) {
      const actualIds = await page.locator('[data-testid^="load-example-"]').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-testid")?.replace("load-example-", "")).filter(Boolean)
      );
      assert.deepEqual(
        actualIds.sort(),
        builtInAutoWidthCases.map((item) => item.id).sort(),
        "desktop auto-width fixtures cover every built-in example"
      );
    }

    await setNativeDialogDecision("accept");
    await page.getByTestId(`load-example-${example.id}`).click();
    await page.locator('button[data-step-id="layout"][aria-current="step"]').waitFor({ state: "visible" });

    await page.locator('button[data-step-id="lyrics"]').click();
    const original = page.getByRole("textbox", { name: "原文", exact: true });
    assert.equal(
      (await original.inputValue()).split(/\r?\n/).filter((line) => line.trim()).length,
      example.lyricLines,
      `${example.id} loads its original lyric lines`
    );
    const translationToggle = page.getByTestId("translation-toggle");
    assert.equal(
      await translationToggle.getAttribute("aria-checked"),
      example.translationLines > 0 ? "true" : "false",
      `${example.id} resolves the zh translation state`
    );
    if (example.translationLines > 0) {
      const translation = page.getByRole("textbox", { name: "译文", exact: true });
      assert.equal(
        (await translation.inputValue()).split(/\r?\n/).filter((line) => line.trim()).length,
        example.translationLines,
        `${example.id} loads its translated lyric lines`
      );
    }

    await page.locator('button[data-step-id="layout"]').click();
    const settledWidths = [];
    for (const key of ["Home", "End"]) {
      if (await autoWidth.getAttribute("aria-checked") === "true") {
        await autoWidth.click();
      }
      await width.focus();
      await width.press(key);
      await page.evaluate(async () => { await document.fonts.ready; });
      await autoWidth.click();
      const settled = await waitForSliderValueInRange(
        width,
        example.min,
        example.max,
        `${example.id} settles inside its calibrated range after ${key}`
      );
      settledWidths.push(settled);
    }

    assert.equal(settledWidths[0], settledWidths[1], `${example.id} ignores the enabling width`);
    assert.ok(
      settledWidths[0] >= example.min && settledWidths[0] <= example.max,
      `${example.id} width ${settledWidths[0]} is outside ${example.min}-${example.max}`
    );
    assert.equal(settledWidths[0] % 20, 0, `${example.id} uses a candidate width`);
    const wrapMetrics = await measureExportCardOrphans();
    assert.ok(wrapMetrics, `${example.id} exposes auto-width wrap metrics`);
    assert.equal(wrapMetrics.lyricLines, example.lyricLines, `${example.id} measures every lyric line`);
    assert.equal(wrapMetrics.translationLines, example.translationLines, `${example.id} measures every translation line`);
    assert.equal(wrapMetrics.severeOrphans, 0, `${example.id} leaves no severe orphan: ${JSON.stringify(wrapMetrics)}`);
    results[example.id] = settledWidths[0];
  }

  if (await autoWidth.getAttribute("aria-checked") === "true") {
    await autoWidth.click();
  }
  return results;
}

async function waitForSliderValueInRange(locator, min, max, message, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let latest = Number.NaN;
  while (Date.now() < deadline) {
    latest = Number(await locator.inputValue());
    if (latest >= min && latest <= max) return latest;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`${message}: last value ${latest}, expected ${min}-${max}`);
}

async function waitForStableSliderValue(locator, stableMs = 500, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let latest = Number.NaN;
  let stableSince = Date.now();

  while (Date.now() < deadline) {
    const value = Number(await locator.inputValue());
    if (value !== latest) {
      latest = value;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= stableMs) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.fail(`Slider value did not settle within ${timeoutMs}ms; last value: ${latest}`);
}

try {
  await mkdir(reportDirectory, { recursive: true });
  electronApp = await electron.launch({
    executablePath,
    env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: userDataDirectory },
    timeout: 60_000
  });
  await electronApp.evaluate(({ dialog }) => {
    globalThis.__lyricsCardNativeDialogTest = { defaultDecision: "dismiss", nextDecision: null, calls: [] };
    dialog.showMessageBox = async (_browserWindow, options) => {
      const state = globalThis.__lyricsCardNativeDialogTest;
      const decision = state.nextDecision ?? state.defaultDecision;
      state.nextDecision = null;
      state.calls.push({
        type: options.type,
        title: options.title,
        message: options.message,
        detail: options.detail,
        buttons: options.buttons,
        defaultId: options.defaultId,
        cancelId: options.cancelId,
        noLink: options.noLink
      });
      return {
        response: decision === "accept" ? 0 : (options.cancelId ?? 0),
        checkboxChecked: false
      };
    };
  });
  page = await electronApp.firstWindow({ timeout: 60_000 });
  page.on("dialog", async (dialog) => {
    rendererDialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.dismiss();
  });
  page.on("pageerror", (error) => process.stderr.write(`[renderer] ${error.stack || error.message}\n`));
  await page.route("**/api/search-song", async (route) => {
    const body = route.request().postDataJSON();
    searchRequests.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: mockSearchResults(body.keyword, body.limit ?? 8) })
    });
  });
  await page.route("**/api/resolve-searched-song", async (route) => {
    const body = route.request().postDataJSON();
    resolveRequests.push(body);
    await new Promise((resolve) => setTimeout(resolve, 220));
    const index = Number(body.id) - 10_000;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          song: {
            title: `Resolved result ${index + 1}`,
            artist: `Mock Artist ${index + 1}`,
            album: `Mock Album ${index + 1}`,
            source: "netease",
            originalUrl: `https://music.163.com/song?id=${body.id}`
          },
          lyrics: "resolved line one\nresolved line two",
          lyricSource: "netease"
        }
      })
    });
  });
  await page.route("**/api/parse-song", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "desktop example enrichment fixture" })
    });
  });

  const firstLaunch = page.getByTestId("first-launch-language-dialog");
  await firstLaunch.waitFor({ state: "visible", timeout: 60_000 });
  const firstLanguageButton = page.locator('[data-testid="first-launch-language"]').first();
  const lastLanguageButton = page.locator('[data-testid="first-launch-language"]').last();
  await page.waitForFunction(() => document.activeElement === document.querySelector('[data-testid="first-launch-language"]'));
  assert.equal(await firstLanguageButton.evaluate((node) => document.activeElement === node), true, "language dialog sets initial focus");
  assert.equal(await page.getByTestId("editor-surface").evaluate((node) => Boolean(node.closest('[inert]'))), true, "dialog makes the app background inert");
  await firstLanguageButton.press("Shift+Tab");
  assert.equal(await lastLanguageButton.evaluate((node) => document.activeElement === node), true, "Shift+Tab wraps inside the language dialog");
  await page.locator('[data-testid="first-launch-language"][data-locale="zh"]').click();
  await firstLaunch.waitFor({ state: "hidden", timeout: 15_000 });
  assert.equal(await page.getByRole("combobox").first().evaluate((node) => document.activeElement === node), true, "language selection moves focus to song search");
  assert.equal(await page.getByTestId("editor-surface").evaluate((node) => Boolean(node.closest('[inert]'))), false, "background inertness ends after dialog exit");
  await assertTitlebarWindowInteractions();

  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await waitForVisible("settings-surface");

  await selectSettingsSection("ai");
  await (await waitForVisible("ai-open-library")).click();
  await (await waitForVisible("preset-card-lyrical")).click();
  await assertSettingsHistoryBarChrome();
  const presetTitle = await waitForVisible("preset-title-input");
  const presetPrompt = await waitForVisible("preset-prompt-input");
  const initialTitle = await presetTitle.inputValue();
  const initialPrompt = await presetPrompt.inputValue();
  await presetTitle.fill("Desktop single reset regression");
  await presetPrompt.fill("Desktop single reset prompt regression");
  await page.getByTestId("preset-reset").click();
  assert.equal(await presetTitle.inputValue(), initialTitle, "single reset restores the preset title");
  assert.equal(await presetPrompt.inputValue(), initialPrompt, "single reset restores the preset prompt");

  await presetTitle.fill("Desktop reset-all regression");
  await page.getByTestId("settings-history-back").click();
  const resetAll = await waitForVisible("prompt-reset-all");
  assert.equal(await resetAll.isEnabled(), true, "reset-all becomes available after a preset edit");
  await resetAll.click();
  assert.equal(await resetAll.isDisabled(), true, "reset-all becomes disabled after restoring initial content");

  for (const section of ["general", "appearance", "export", "ai", "about"]) {
    await selectSettingsSection(section);
    const heading = page.getByTestId(`settings-page-heading-${section}`);
    await heading.waitFor({ state: "visible" });
    assert.ok((await heading.textContent())?.trim(), `${section} settings home includes a concise heading and description`);
  }
  await selectSettingsSection("ai");
  await (await waitForVisible("ai-open-api")).click();
  await page.getByTestId("ai-base-url-input").fill("https://example.invalid/v1");
  await page.getByTestId("ai-model-input").fill("desktop-regression-model");
  await page.getByTestId("ai-temperature-input").fill("0.4");
  await page.getByTestId("ai-default-style-select").selectOption("lyrical");
  await page.getByTestId("ai-api-key-input").fill("sk-desktop-regression");
  await page.getByTestId("clear-api-key").click();
  await waitForVisible("settings-confirm-overlay");
  const cancelConfirmation = page.getByTestId("settings-confirm-cancel");
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "settings-confirm-cancel");
  assert.equal(await cancelConfirmation.evaluate((node) => document.activeElement === node), true, "confirm dialog focuses the safe action");
  await cancelConfirmation.press("Shift+Tab");
  assert.equal(await page.getByTestId("confirm-clear-api-key").evaluate((node) => document.activeElement === node), true, "confirm dialog traps reverse Tab");
  await page.getByTestId("confirm-clear-api-key").click();
  await page.getByTestId("ai-api-key-input").waitFor({ state: "visible" });
  await page.getByTestId("settings-history-back").click();
  await waitForVisible("ai-open-library");
  await page.getByTestId("settings-history-forward").click();
  await waitForVisible("ai-base-url-input");

  await selectSettingsSection("ai");
  await (await waitForVisible("ai-open-library")).click();
  await page.getByTestId("preset-create").click();
  await page.getByTestId("preset-title-input").fill("Desktop custom preset");
  await page.getByTestId("preset-prompt-input").fill("Translate the lyrics for the packaged desktop regression test.");
  await page.getByTestId("preset-save").click();
  await waitForVisible("preset-delete");
  await page.getByTestId("preset-delete").click();
  await waitForVisible("settings-confirm-overlay");
  await page.getByTestId("confirm-delete-preset").click();
  await waitForVisible("preset-create");
  assert.deepEqual(rendererDialogs, [], `settings interactions must not open renderer dialogs: ${JSON.stringify(rendererDialogs)}`);

  await selectSettingsSection("export");
  const settingsExportPanel = page.locator('[data-settings-panel="export"]:not([hidden])');
  const defaultFormatOptions = settingsExportPanel.locator('[data-segment-value="png"], [data-segment-value="webp"], [data-segment-value="jpg"]');
  assert.deepEqual(await defaultFormatOptions.allTextContents(), ["PNG", "WebP", "JPG"], "settings exposes PNG, WebP, and JPG defaults");
  assert.equal(await defaultFormatOptions.nth(0).getAttribute("aria-checked"), "true", "PNG remains the initial default export format");
  await settingsExportPanel.locator('[data-segment-value="webp"]').click();
  await page.waitForFunction(() => (
    document.querySelector('[data-settings-panel="export"]:not([hidden]) [data-segment-value="webp"]')?.getAttribute('aria-checked') === 'true'
  ));

  await selectSettingsSection("general");
  await selectSettingsSection("ai");
  await page.getByTestId("settings-close-button").click();
  await page.locator('[data-testid="settings-surface"][data-surface-state="closed"]').waitFor({ state: "attached" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "settings-button");
  assert.equal(
    await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').evaluate((node) => document.activeElement === node),
    true,
    "closing settings restores focus to the step-one settings button"
  );
  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await page.locator('[data-testid="settings-surface"][data-surface-state="open"]').waitFor({ state: "visible" });
  await page.getByTestId("settings-close-button").click();
  await page.locator('[data-testid="settings-surface"][data-surface-state="closed"]').waitFor({ state: "attached" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "settings-button");

  const minimumWindowSize = await electronApp.evaluate(({ BrowserWindow }) => (
    BrowserWindow.getAllWindows()[0].getMinimumSize()
  ));
  assert.deepEqual(minimumWindowSize, [1000, 700], "desktop window preserves the 1000px minimum width");
  await assertExamplesSurfaceBehavior();
  await assertSongSearchBehavior();
  await assertSongImportAsideBehavior();
  await assertFontPickerBehavior();

  const focusedSizes = [
    { width: 1000, height: 700 },
    { width: 1023, height: 700 },
    { width: 1024, height: 700 },
    { width: 1280, height: 900 },
    { width: 1440, height: 900 }
  ];
  const lyricsWorkspaceSizes = [
    { width: 1000, height: 700 },
    { width: 1280, height: 900 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 }
  ];
  for (const size of focusedSizes) {
    await assertFocusedPresentation(size.width, size.height);
  }
  await page.screenshot({ path: path.join(reportDirectory, "step-one-unified.png"), fullPage: false });

  await setWindowSize(1000, 700);
  await assertUnifiedPreviewChrome("layout");
  for (const size of [
    { width: 1023, height: 700 },
    { width: 1024, height: 700 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 }
  ]) {
    await setWindowSize(size.width, size.height);
    await assertUnifiedPreviewChrome("layout");
  }
  await setWindowSize(1280, 900);
  for (const stepId of ["layout", "font", "visual", "export"]) {
    await assertUnifiedPreviewChrome(stepId);
  }
  await assertDirectionalWorkbenchTransitions();
  await assertPreviewWorkbenchPan();

  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await waitForVisible("settings-surface");
  await page.getByTestId("settings-close-button").click();
  await page.locator('[data-testid="settings-surface"][data-surface-state="closed"]').waitFor({ state: "attached" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "settings-button");
  assert.equal(
    await page.locator('[data-testid="editor-surface"] [data-stepper-header-actions="true"] [data-testid="settings-button"]').evaluate((node) => document.activeElement === node),
    true,
    "closing settings restores focus to the unified Stepper settings button"
  );

  await setWindowSize(1000, 700);
  const lyricsTabLabels = {
    en: ["Cleanup", "Translation"],
    fr: ["Nettoyer", "Traduction"],
    ja: ["整理", "翻訳"],
    es: ["Limpiar", "Traducción"],
    "zh-TW": ["整理", "翻譯"],
    zh: ["整理", "翻译"]
  };
  for (const locale of ["en", "fr", "ja", "es", "zh-TW", "zh"]) {
    await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
    await waitForVisible("settings-surface");
    await selectSettingsSection("general");
    await page.locator(`[data-testid="language-option"][data-locale="${locale}"]`).click();
    await page.getByTestId("settings-close-button").click();
    await page.locator('[data-testid="settings-surface"][data-surface-state="closed"]').waitFor({ state: "attached" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "settings-button");
    await page.locator('button[data-step-id="link"]').click();
    await assertFocusedPresentation(1000, 700);
    await assertUnifiedPreviewChrome("layout");
    await page.locator('button[data-step-id="lyrics"]').click();
    await page.getByTestId("lyrics-sidebar").waitFor({ state: "visible" });
    const localizedTabs = await page.locator('[role="tab"][data-testid^="lyrics-sidebar-tab-"]').allTextContents();
    assert.deepEqual(
      localizedTabs.map((label) => label.trim()),
      lyricsTabLabels[locale],
      `${locale} localizes both visible lyrics sidebar tabs`
    );
    await page.getByTestId("lyrics-command-review").waitFor({ state: "visible" });
    await page.getByTestId("lyrics-command-fetch").waitFor({ state: "visible" });
  }

  await page.locator('button[data-step-id="lyrics"]').click();
  await page.getByTestId("lyrics-workspace").waitFor({ state: "visible" });
  const originalLyrics = page.getByRole("textbox", { name: "原文", exact: true });
  await page.getByTestId("lyrics-sidebar-tab-translation").click();
  const translationToggle = page.getByTestId("translation-toggle");
  await translationToggle.click();
  const translationLyrics = page.getByRole("textbox", { name: "译文", exact: true });
  await translationLyrics.waitFor({ state: "visible" });
  const originalEighteen = Array.from(
    { length: 18 },
    (_, index) => `original ${String(index + 1).padStart(2, "0")} cadence`
  ).join("\n");
  const translationEighteen = Array.from(
    { length: 18 },
    (_, index) => `translation ${String(index + 1).padStart(2, "0")} context`
  ).join("\n");
  await originalLyrics.fill(originalEighteen);
  await translationLyrics.fill(translationEighteen);
  await assertLyricsWorkbenchOperations(
    originalLyrics,
    translationLyrics,
    originalEighteen,
    translationEighteen
  );
  await assertLyricsInputEditingSemantics(originalLyrics, translationLyrics);
  const performanceEightyOriginal = Array.from(
    { length: 80 },
    (_, index) => `performance line ${String(index + 1).padStart(2, "0")} original cadence`
  ).join("\n");
  const performanceEightyTranslation = Array.from(
    { length: 80 },
    (_, index) => `performance line ${String(index + 1).padStart(2, "0")} translated cadence`
  ).join("\n");
  await fillExact(originalLyrics, performanceEightyOriginal);
  await fillExact(translationLyrics, performanceEightyTranslation);
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  const lyricsInputPerformance = await measureLyricsInputChangeStructure(originalLyrics);
  assert.equal(lyricsInputPerformance.editorCount, 2, "the 80-line input metric runs with both lyric columns mounted");
  assert.equal(lyricsInputPerformance.mirrorCount, 2, "each visible lyric column has one isolated measurement mirror");
  assert.ok(lyricsInputPerformance.heightParity, "the 80-line fixture exposes resize parity metrics");
  assert.equal(
    lyricsInputPerformance.heightParity.mirrorCommonHeight,
    lyricsInputPerformance.heightParity.referenceCommonHeight,
    "isolated mirrors match the former height:auto scrollHeight reference pixel-for-pixel"
  );
  assert.ok(
    lyricsInputPerformance.heightParity.liveStyleHeights.every((height) => (
      Math.abs(height - lyricsInputPerformance.heightParity.referenceCommonHeight) <= 0.5
    )),
    `both live columns use the reference common height: ${JSON.stringify(lyricsInputPerformance.heightParity)}`
  );
  assert.deepEqual(
    lyricsInputPerformance.synchronous,
    {
      sharedScrollRectReads: 1,
      editorRectReads: 1,
      editorScrollHeightReads: 2,
      mirrorScrollHeightReads: 2,
      liveEditorHeightWrites: 2
    },
    "one 80-line change captures one active anchor and applies only final live heights"
  );
  assert.ok(
    lyricsInputPerformance.settled.sharedScrollRectReads <= 3 &&
      lyricsInputPerformance.settled.editorRectReads <= 3 &&
      lyricsInputPerformance.settled.editorScrollHeightReads <= 5 &&
      lyricsInputPerformance.settled.mirrorScrollHeightReads === 2 &&
      lyricsInputPerformance.settled.liveEditorHeightWrites <= 2,
    `the settled 80-line change stays within the structural read/write budget: ${JSON.stringify(lyricsInputPerformance.settled)}`
  );
  assert.equal(lyricsInputPerformance.behavior.valueApplied, true, "the instrumented 80-line change reaches controlled state");
  assert.equal(lyricsInputPerformance.behavior.settled.focused, true, "the instrumented change preserves editor focus");
  assert.deepEqual(
    {
      start: lyricsInputPerformance.behavior.settled.selectionStart,
      end: lyricsInputPerformance.behavior.settled.selectionEnd,
      line: lyricsInputPerformance.behavior.settled.lineIndex
    },
    {
      start: lyricsInputPerformance.behavior.beforeDispatch.selectionStart,
      end: lyricsInputPerformance.behavior.beforeDispatch.selectionEnd,
      line: lyricsInputPerformance.behavior.beforeDispatch.lineIndex
    },
    "the instrumented change preserves the post-input caret and logical line"
  );
  assert.ok(
    Math.abs(
      lyricsInputPerformance.behavior.settled.anchorOffset -
      lyricsInputPerformance.behavior.beforeDispatch.anchorOffset
    ) <= 0.5,
    `the instrumented height change preserves its visual anchor: ${JSON.stringify(lyricsInputPerformance.behavior)}`
  );
  assert.equal(
    await page.locator('[data-lyrics-editor-measure="true"][aria-hidden="true"][tabindex="-1"]').count(),
    2,
    "measurement mirrors stay outside the accessibility and keyboard interaction tree"
  );
  await fillExact(originalLyrics, originalEighteen);
  await fillExact(translationLyrics, translationEighteen);
  for (const size of lyricsWorkspaceSizes) {
    await assertLyricsWorkspace(size.width, size.height);
  }
  await assertLyricsWorkspaceSplitInteractions();
  await assertLyricsWorkspaceContentPressure(originalLyrics, translationLyrics, translationToggle);
  const homeOffsetAfterContentPressure = await page.evaluate(() => {
    const viewport = document.querySelector('[data-testid="lyrics-translation-page-viewport"]');
    const home = document.querySelector('[data-testid="lyrics-translation-home-page"]');
    const viewportRect = viewport?.getBoundingClientRect();
    const homeRect = home?.getBoundingClientRect();
    return viewportRect && homeRect ? homeRect.left - viewportRect.left : null;
  });
  assert.ok(
    homeOffsetAfterContentPressure !== null && Math.abs(homeOffsetAfterContentPressure) <= 1,
    `content-pressure resizing leaves the active Translation home page anchored: ${homeOffsetAfterContentPressure}`
  );
  await assertLyricsWorkspaceNarrowBehavior(originalLyrics, translationLyrics);
  const homeOffsetAfterNarrowDrawer = await page.evaluate(() => {
    const viewport = document.querySelector('[data-testid="lyrics-translation-page-viewport"]');
    const home = document.querySelector('[data-testid="lyrics-translation-home-page"]');
    const viewportRect = viewport?.getBoundingClientRect();
    const homeRect = home?.getBoundingClientRect();
    return viewportRect && homeRect ? homeRect.left - viewportRect.left : null;
  });
  assert.ok(
    homeOffsetAfterNarrowDrawer !== null && Math.abs(homeOffsetAfterNarrowDrawer) <= 1,
    `closing the narrow drawer leaves the active Translation home page anchored: ${homeOffsetAfterNarrowDrawer}`
  );
  await fillExact(originalLyrics, originalEighteen);
  await fillExact(translationLyrics, translationEighteen);
  if (runVisualDiagnostics) await assertTitlebarScrollPerformance();

  await setWindowSize(1000, 700);
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  const workspace = page.getByTestId("lyrics-workspace");
  assert.equal(await page.getByRole("button", { name: "标准", exact: true }).count(), 0, "standard viewport control is removed");
  assert.equal(await page.getByRole("button", { name: "扩展", exact: true }).count(), 0, "expanded viewport control is removed");
  assert.equal(await page.getByRole("button", { name: "沉浸", exact: true }).count(), 0, "immersive viewport control is removed");
  assert.equal(await page.getByTestId("lyrics-viewport-resize-handle").count(), 0, "lyrics resize handle is removed");
  assert.equal(await workspace.getAttribute("data-lyrics-viewport-mode"), "immersive", "lyrics workspace always uses the maximum-height presentation");
  const compactHeight = await workspace.evaluate((element) => element.getBoundingClientRect().height);

  const translationSelectionStart = translationEighteen.indexOf("translation 11") + 2;
  const translationSelectionEnd = translationSelectionStart + 14;
  await translationLyrics.evaluate((node, selection) => {
    node.focus();
    node.setSelectionRange(selection.start, selection.end);
    node.dispatchEvent(new Event("select", { bubbles: true }));
    node.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Shift" }));
    const scroll = node.closest('[data-testid="lyrics-shared-scroll"]');
    if (scroll instanceof HTMLElement) {
      scroll.scrollTop = Math.min(
        scroll.scrollHeight - scroll.clientHeight,
        Math.max(1, Math.round((scroll.scrollHeight - scroll.clientHeight) * 0.58))
      );
    }
  }, { start: translationSelectionStart, end: translationSelectionEnd });
  const contextBeforeWindowResize = await getLyricsContext(translationLyrics);
  assert.equal(contextBeforeWindowResize.focused, true, "translation editor owns focus before viewport resizing");
  assert.ok(contextBeforeWindowResize.scrollTop > 0, "viewport regression starts from a non-zero scroll position");

  await setWindowSize(1280, 900);
  await waitForLayoutStable(workspace);
  const expandedWindowHeight = await workspace.evaluate((element) => element.getBoundingClientRect().height);
  assert.ok(expandedWindowHeight > compactHeight, `maximum workspace height follows available window space: ${JSON.stringify({ compactHeight, expandedWindowHeight })}`);
  const afterWindowResize = await waitForSameSelection(translationLyrics, contextBeforeWindowResize);
  assertSameSelection(contextBeforeWindowResize, afterWindowResize, "window height change");
  assert.equal(afterWindowResize.focused, true, "window size changes preserve translation focus");
  await setWindowSize(1000, 700);
  await waitForLayoutStable(workspace);

  await translationLyrics.evaluate((node, selection) => {
    node.focus();
    node.setSelectionRange(selection.start, selection.end);
    node.dispatchEvent(new Event("select", { bubbles: true }));
    node.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Shift" }));
    const scroll = node.closest('[data-testid="lyrics-shared-scroll"]');
    if (scroll instanceof HTMLElement) scroll.scrollTop = Math.min(155.4286, scroll.scrollHeight - scroll.clientHeight);
  }, { start: translationSelectionStart, end: translationSelectionEnd });
  const beforeTranslationToggle = await getLyricsContext(translationLyrics);
  const translationToggleHitTest = await page.evaluate(() => {
    const toggle = document.querySelector('[data-testid="translation-toggle"]');
    const editor = document.querySelector('#lyrics-workspace-editor');
    const sidebar = document.querySelector('[data-testid="lyrics-sidebar"]');
    const split = document.querySelector('[data-testid="lyrics-workspace-split"]');
    const viewport = document.querySelector('[data-testid="lyrics-translation-page-viewport"]');
    const home = document.querySelector('[data-testid="lyrics-translation-home-page"]');
    const toRect = (node) => {
      const rect = node?.getBoundingClientRect();
      return rect
        ? {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
          }
        : null;
    };
    const toggleRect = toggle?.getBoundingClientRect();
    const hit = toggleRect
      ? document.elementFromPoint(
          toggleRect.left + toggleRect.width / 2,
          toggleRect.top + toggleRect.height / 2
        )
      : null;

    return {
      toggleCount: document.querySelectorAll('[data-testid="translation-toggle"]').length,
      toggle: toRect(toggle),
      editor: toRect(editor),
      sidebar: toRect(sidebar),
      split: toRect(split),
      viewport: toRect(viewport),
      home: toRect(home),
      hitTestId: hit?.getAttribute("data-testid"),
      hitTag: hit?.tagName,
      hitInsideToggle: Boolean(toggle && hit && toggle.contains(hit)),
      sideBySide: split?.getAttribute("data-side-by-side"),
      mobileSidebarOpen: split?.getAttribute("data-mobile-sidebar-open"),
      translationPage: viewport?.getAttribute("data-translation-page"),
      homeTransform: home ? getComputedStyle(home).transform : null,
      homePointerEvents: home ? getComputedStyle(home).pointerEvents : null
    };
  });
  assert.equal(
    translationToggleHitTest.hitInsideToggle,
    true,
    `the restored desktop translation toggle remains above the editor hit target: ${JSON.stringify(translationToggleHitTest)}`
  );
  await translationToggle.click();
  await translationLyrics.waitFor({ state: "detached" });
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  const hiddenTranslationState = await getLyricsContext(originalLyrics);
  assert.ok(hiddenTranslationState.scrollTop > 0, `hiding active translation keeps mapped original context: ${JSON.stringify(hiddenTranslationState)}`);
  assert.equal(await translationToggle.evaluate((node) => document.activeElement === node), true, "closing translation leaves focus on the switch");
  await translationToggle.click();
  await translationLyrics.waitFor({ state: "visible" });
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  const afterTranslationToggle = await getLyricsContext(translationLyrics);
  assertSameSelection(beforeTranslationToggle, afterTranslationToggle, "translation close and reopen");
  assert.ok(afterTranslationToggle.scrollTop > 0, `reopening translation does not reset shared scroll: ${JSON.stringify(afterTranslationToggle)}`);
  assert.equal(afterTranslationToggle.activeTestId, "translation-toggle", "reopening translation does not steal focus from the switch");

  // Start the export-limit scenario from an explicit fixture instead of
  // inheriting content from the preceding viewport interaction sequence.
  await fillExact(originalLyrics, originalEighteen);
  await fillExact(translationLyrics, translationEighteen);
  assert.equal(await originalLyrics.inputValue(), originalEighteen, "export fixture restores exactly 18 original lines");
  assert.equal(await translationLyrics.inputValue(), translationEighteen, "export fixture restores exactly 18 translated lines");
  const autoHeightLineBudget = await waitForLyricsLineBudget("18 + 18 = 36 / 36");
  assert.match(autoHeightLineBudget, /18.*18.*36 \/ 36/s);
  await page.locator('button[data-step-id="layout"]').click();
  const autoWidthToggle = page.getByRole("switch", { name: "自动宽度", exact: true });
  const autoWidthSlider = page.getByRole("slider", { name: "宽度", exact: true });
  assert.equal(await autoWidthToggle.getAttribute("aria-checked"), "true", "desktop defaults portrait auto width to enabled");
  assert.equal(await autoWidthSlider.isDisabled(), true, "automatic width disables manual width input");
  const settledAutoWidth = await waitForStableSliderValue(autoWidthSlider);
  assert.ok(settledAutoWidth >= 720 && settledAutoWidth <= 1440, `desktop auto width selects a valid measured candidate: ${settledAutoWidth}`);
  await page.locator('button[data-step-id="export"]').click();
  await waitForCompleteExportEnabled();
  assert.equal(await page.getByTestId("complete-export-button").isEnabled(), true, "36 logical lines remain exportable in auto-height mode");
  const autoHeightCard = await measureExportCard();
  assert.ok(autoHeightCard && autoHeightCard.height > 3200 && autoHeightCard.height <= 6400, `auto-height export uses the real measured card height: ${JSON.stringify(autoHeightCard)}`);
  assert.equal(autoHeightCard.hasOverflow, false, `auto-height export contains the real DOM within tolerance: ${JSON.stringify(autoHeightCard)}`);
  const autoWidthWrapMetrics = await measureExportCardOrphans();
  assert.ok(autoWidthWrapMetrics && autoWidthWrapMetrics.measuredLines === 36, `auto-width metrics cover original and translated lines: ${JSON.stringify(autoWidthWrapMetrics)}`);
  assert.equal(autoWidthWrapMetrics.severeOrphans, 0, `auto width leaves no severe body or translation orphan: ${JSON.stringify(autoWidthWrapMetrics)}`);

  const fontOverrideHandle = await page.waitForFunction((buttonSelector) => {
    const button = document.querySelector(buttonSelector);
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;

    const toastAudit = [];
    const recordToast = () => {
      for (const toast of document.querySelectorAll('[data-testid="app-toast"]')) {
        const text = toast.textContent?.trim();
        if (text && !toastAudit.includes(text)) toastAudit.push(text);
      }
    };
    const toastObserver = new MutationObserver(recordToast);
    toastObserver.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true
    });
    window.__desktopExportToastAudit = toastAudit;
    window.__desktopExportToastObserver = toastObserver;
    recordToast();

    try {
      Object.defineProperty(document.fonts, "status", { configurable: true, get: () => "loading" });
      const status = document.fonts.status;
      button.click();
      return { supported: status === "loading", status, buttonDisabled: button.disabled };
    } catch {
      delete document.fonts.status;
      toastObserver.disconnect();
      delete window.__desktopExportToastAudit;
      delete window.__desktopExportToastObserver;
      return { supported: false, status: document.fonts.status, buttonDisabled: button.disabled };
    }
  }, activeCompleteExportButtonSelector, { timeout: 15_000 });
  const fontOverride = await fontOverrideHandle.jsonValue();
  await fontOverrideHandle.dispose();
  assert.deepEqual(
    fontOverride,
    { supported: true, status: "loading", buttonDisabled: false },
    "test shell can simulate fonts-loading readiness on the real enabled React control"
  );
  try {
    await page.waitForFunction(
      () => window.__desktopExportToastAudit?.some((text) => /字体.*加载|加载.*字体/.test(text)),
      undefined,
      { timeout: 10_000 }
    );
    const exportToastAudit = await page.evaluate(() => window.__desktopExportToastAudit ?? []);
    assert.ok(
      exportToastAudit.some((text) => /字体.*加载|加载.*字体/.test(text)),
      `live export defense rejects fonts that are not ready: ${JSON.stringify(exportToastAudit)}`
    );
  } finally {
    await page.evaluate(() => {
      delete document.fonts.status;
      window.__desktopExportToastObserver?.disconnect();
      delete window.__desktopExportToastAudit;
      delete window.__desktopExportToastObserver;
    });
  }

  const liveMeasurementGuardHandle = await page.waitForFunction((buttonSelector) => {
    const root = document.querySelector('[data-export-card-host] [data-export-card]');
    const button = document.querySelector(buttonSelector);
    if (!(root instanceof HTMLElement) || !(button instanceof HTMLButtonElement) || button.disabled) return false;
    const previousWidth = root.style.width;
    root.style.width = "1px";
    try {
      button.click();
      return { clicked: true, measuredWidth: root.getBoundingClientRect().width };
    } finally {
      root.style.width = previousWidth;
    }
  }, activeCompleteExportButtonSelector, { timeout: 15_000 });
  const liveMeasurementGuard = await liveMeasurementGuardHandle.jsonValue();
  await liveMeasurementGuardHandle.dispose();
  assert.deepEqual(liveMeasurementGuard, { clicked: true, measuredWidth: 1 }, "live measurement guard uses the active enabled export control");
  await page.waitForFunction(() => /计算|高度|稍候/.test(document.querySelector('[data-testid="app-toast"]')?.textContent ?? ""));

  await page.locator('button[data-step-id="lyrics"]').click();
  await fillExact(originalLyrics, `${originalEighteen}\nline 19`);
  const exceededLineBudget = await waitForLyricsLineBudget("37 / 36");
  assert.match(exceededLineBudget, /37 \/ 36/);
  await page.locator('button[data-step-id="export"]').click();
  assert.equal(await page.getByTestId("complete-export-button").isDisabled(), true, "37 logical lines disable final export");

  await page.locator('button[data-step-id="lyrics"]').click();
  await originalLyrics.fill("line one\nline two");
  await translationLyrics.fill("translation one\ntranslation two");
  await page.locator('button[data-step-id="layout"]').click();
  await page.getByTestId("lyric-card-preview").waitFor({ state: "visible" });
  const positionalCompletion = await page.locator('button[data-step-id]').evaluateAll((steps) =>
    steps.map((step) => ({ id: step.getAttribute("data-step-id"), complete: step.getAttribute("data-complete") }))
  );
  assert.deepEqual(
    positionalCompletion,
    [
      { id: "link", complete: "true" },
      { id: "lyrics", complete: "true" },
      { id: "layout", complete: "false" },
      { id: "font", complete: "false" },
      { id: "visual", complete: "false" },
      { id: "export", complete: "false" }
    ],
    "stepper checkmarks stop at the active step"
  );
  await assertExportHost("step three");

  for (const size of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 }
  ]) {
    await assertPreviewFits(size.width, size.height, false);
    await assertPreviewFits(size.width, size.height, true);
  }
  await assertExampleImportRemeasuresPreview();
  const builtInExampleAutoWidths = await assertBuiltInExamplesAutoWidth();

  await page.locator('button[data-step-id="lyrics"]').click();
  await fillExact(originalLyrics, originalEighteen);
  await fillExact(translationLyrics, translationEighteen);
  assert.equal(await originalLyrics.inputValue(), originalEighteen, "fixed-ratio fixture restores exactly 18 original lines");
  assert.equal(await translationLyrics.inputValue(), translationEighteen, "fixed-ratio fixture restores exactly 18 translated lines");
  const fixedRatioLineBudget = await waitForLyricsLineBudget("18 + 18 = 36 / 36");
  assert.match(fixedRatioLineBudget, /18.*18.*36 \/ 36/s);
  await page.locator('button[data-step-id="layout"]').click();
  await page.locator('[role="radiogroup"][aria-label="尺寸模式"] [data-segment-value="1:1"]').click();
  await page.waitForFunction(() => document.querySelector('[data-export-card-host] [data-export-card]')?.getBoundingClientRect().height === 1080);
  const squareCard = await measureExportCard();
  assert.equal(squareCard?.hasOverflow, true, `1:1 fixed ratio exposes real overflow: ${JSON.stringify(squareCard)}`);
  await page.locator('button[data-step-id="export"]').click();
  assert.equal(await page.getByTestId("complete-export-button").isDisabled(), true, "1:1 overflow disables export");
  const squareAlert = page.getByRole("alert").filter({ hasText: "当前版式无法容纳全部歌词" });
  await squareAlert.waitFor({ state: "visible" });
  assert.match(await squareAlert.innerText(), /无法容纳|自动高度|调整排版/, "1:1 overflow shows an explicit alert");

  await page.locator('button[data-step-id="layout"]').click();
  const landscapeMode = page.locator('[role="radiogroup"][aria-label="布局模式"] [data-segment-value="landscape"]');
  await landscapeMode.click();
  await page.waitForFunction(() => document.querySelector('button[data-step-id="lyrics"]')?.getAttribute("aria-current") === "step");
  assert.equal(
    await page.locator('[data-segment-value="landscape"][aria-checked="true"]').count(),
    0,
    "36 logical lines cannot switch into landscape"
  );
  assert.equal(await originalLyrics.evaluate((node) => document.activeElement === node), true, "blocked landscape switch restores lyric focus");
  const landscapeLimitToast = page.getByTestId("app-toast");
  await landscapeLimitToast.waitFor({ state: "visible" });
  assert.match(await landscapeLimitToast.innerText(), /横版最多容纳 12 个非空逻辑行.*当前为 36 行/s);

  const originalSix = originalEighteen.split("\n").slice(0, 6).join("\n");
  const translationSix = translationEighteen.split("\n").slice(0, 6).join("\n");
  await fillExact(originalLyrics, originalSix);
  await fillExact(translationLyrics, translationSix);
  await waitForLyricsLineBudget("6 + 6 = 12 / 36");
  await page.locator('button[data-step-id="layout"]').click();
  await landscapeMode.click();
  await page.waitForFunction(() => document.querySelector('[data-segment-value="landscape"]')?.getAttribute("aria-checked") === "true");
  assert.equal(
    await page.locator('[role="radiogroup"][aria-label="尺寸模式"]').count(),
    0,
    "free landscape exposes no obsolete ratio presets"
  );
  await page.locator('[data-export-card-host] [data-export-card][data-landscape-plan="ready"]').waitFor({ state: "attached" });
  const landscapeCard = await measureExportCard();
  assert.ok(landscapeCard?.width > landscapeCard?.height, `free landscape composes a horizontal canvas: ${JSON.stringify(landscapeCard)}`);
  assert.equal(landscapeCard?.hasOverflow, false, `content-measured landscape remains overflow-free: ${JSON.stringify(landscapeCard)}`);
  await page.locator('button[data-step-id="export"]').click();
  assert.equal(await page.getByTestId("complete-export-button").isDisabled(), false, "12-line free landscape can export");

  await assertAcrylicVisuals();

  await page.screenshot({ path: path.join(reportDirectory, "settings-interaction.png"), fullPage: false });
  const nativeDialogs = await readNativeDialogs();
  assert.ok(nativeDialogs.length >= 1, "document replacement and translation use Electron native dialogs");
  assert.ok(
    nativeDialogs.every((entry) => entry.type === "warning" && entry.defaultId === 1 && entry.cancelId === 1 && entry.noLink === true),
    `native confirmations retain warning icons and safe defaults: ${JSON.stringify(nativeDialogs)}`
  );
  process.stdout.write(`${JSON.stringify({
    ok: true,
    nativeDialogs,
    rendererDialogs,
    searchMock: { searches: searchRequests.length, resolves: resolveRequests.length },
    focusedViewports: focusedSizes.map(({ width, height }) => `${width}x${height}`),
    lyricsWorkspaceViewports: lyricsWorkspaceSizes.map(({ width, height }) => `${width}x${height}`),
    previewViewports: ["1366x768", "1440x900", "1920x1080"],
    visualDiagnostics: runVisualDiagnostics,
    titlebarVisualMetrics,
    titlebarPerformanceComparison,
    lyricsInputPerformance,
    exportCards: {
      autoHeight: autoHeightCard,
      autoWidth: { width: settledAutoWidth, wrapMetrics: autoWidthWrapMetrics },
      builtInExampleAutoWidths,
      square: squareCard,
      landscape: landscapeCard
    }
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`[desktop-regression] ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  if (page) {
    await page.screenshot({ path: path.join(reportDirectory, "settings-interaction-failure.png"), fullPage: false }).catch(() => {});
  }
  throw error;
} finally {
  await closeElectronApplication(electronApp, { label: "desktop-regression" });
  await rm(userDataDirectory, { recursive: true, force: true }).catch(() => {});
}
