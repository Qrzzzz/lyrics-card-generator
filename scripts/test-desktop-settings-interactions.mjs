import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe");
const reportDirectory = path.join(root, "playwright-report", "desktop");
const userDataDirectory = await mkdtemp(path.join(tmpdir(), "lyrics-card-desktop-test-"));
const exportOverflowTolerance = 4;
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
const nativeDialogs = [];
let acceptDocumentReplacementDialogs = false;
const searchRequests = [];
const resolveRequests = [];
const titlebarVisualMetrics = [];
let titlebarPerformanceComparison = null;

async function waitForVisible(testId) {
  const locator = page.getByTestId(testId);
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  return locator;
}

async function selectSettingsSection(section) {
  await page.getByTestId(`settings-tab-${section}`).click();
  await page.locator(`[data-settings-panel="${section}"]:not([hidden])`).waitFor({ state: "visible" });
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
      element.setAttribute("data-test-layout-signature", signature);
      return previous === signature;
    },
    await locator.evaluate((element) => {
      const marker = `layout-${Math.random().toString(36).slice(2)}`;
      element.setAttribute("data-test-layout-marker", marker);
      element.removeAttribute("data-test-layout-signature");
      return `[data-test-layout-marker="${marker}"]`;
    }),
    { polling: 80, timeout }
  );
}

async function waitForLyricsLineBudget(expected, timeout = 5_000) {
  await page.waitForFunction(
    (text) => document.querySelector('[data-testid="lyrics-line-budget"]')?.textContent?.includes(text),
    expected,
    { timeout }
  );
}

async function waitForCompleteExportEnabled(timeout = 15_000) {
  try {
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="complete-export-button"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    }, undefined, { timeout });
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="complete-export-button"]');
      const alert = document.querySelector('[role="alert"]');
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
    });
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
  assert.equal(await combobox.getAttribute("aria-controls"), await listbox.getAttribute("id"));
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
  acceptDocumentReplacementDialogs = true;
  await combobox.press("Enter");
  acceptDocumentReplacementDialogs = false;
  await page.waitForFunction(() => !document.querySelector('[role="combobox"]')?.hasAttribute("disabled"));
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
  assert.equal(
    await aside.locator('button[aria-controls][aria-expanded]').count(),
    0,
    "manual song details no longer render a duplicate disclosure inside the metadata panel"
  );
  assert.deepEqual(
    await stepper.locator('.lyrics-stepper-actions button').evaluateAll((buttons) => (
      buttons.map((button) => button.getAttribute('data-testid'))
    )),
    ["song-info-toggle", "stepper-next-button"],
    "manual adjustment stays immediately before Next"
  );
  assert.equal(await manualToggle.getAttribute("aria-expanded"), "false", "manual song details start collapsed");

  await manualToggle.focus();
  await manualToggle.press("Enter");
  assert.equal(await manualToggle.getAttribute("aria-expanded"), "true", "manual song details expand from the keyboard");
  assert.equal(
    await manualToggle.evaluate((node) => document.activeElement === node),
    true,
    "expanding manual song details preserves focus on the disclosure button"
  );

  const manualRegionId = await manualToggle.getAttribute("aria-controls");
  assert.ok(manualRegionId, "manual song details expose a controlled region id");
  const manualRegion = page.locator(`#${manualRegionId}`);
  await manualRegion.waitFor({ state: "visible" });
  await manualToggle.press("Tab");
  assert.equal(
    await nextButton.evaluate((node) => document.activeElement === node),
    true,
    "Tab follows the visible action order from manual adjustment to Next"
  );
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await manualToggle.evaluate((node) => document.activeElement === node),
    true,
    "reverse Tab returns to the manual song disclosure"
  );
  await manualToggle.press("Enter");
  assert.equal(await manualToggle.getAttribute("aria-expanded"), "false", "manual song details collapse from the keyboard");
  await manualRegion.waitFor({ state: "hidden" });

  await manualToggle.click();
  await manualRegion.waitFor({ state: "visible" });
  await page.locator('button[data-step-id="lyrics"]').click();
  await page.locator('button[data-step-id="link"]').click();
  assert.equal(await manualToggle.getAttribute("aria-expanded"), "true", "manual song details remain expanded after returning to step one");
  await manualToggle.click();
  await manualRegion.waitFor({ state: "hidden" });
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
  assert.ok(geometry.effect.bottom >= geometry.rail.top + 72, `${theme} effect reaches at least 72px into the real Stepper rail`);
  assert.ok(geometry.effect.bottom < geometry.content.top, `${theme} effect fades before the main content panel begins`);

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
  await effect.evaluate((element) => {
    element.style.removeProperty("visibility");
  });
  await page.waitForTimeout(180);
  const onBuffer = await page.screenshot({
    path: path.join(reportDirectory, `${prefix}-effect-on.png`),
    clip
  });
  await page.screenshot({ path: path.join(reportDirectory, `${prefix}-final.png`), fullPage: false });

  const images = { off: offBuffer.toString("base64"), on: onBuffer.toString("base64") };
  const metrics = await page.evaluate(async ({ images: encoded, geometry: measured, clip: crop }) => {
    const loadImage = (base64) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not decode titlebar comparison screenshot"));
      image.src = `data:image/png;base64,${base64}`;
    });
    const [offImage, onImage] = await Promise.all([loadImage(encoded.off), loadImage(encoded.on)]);
    if (offImage.width !== onImage.width || offImage.height !== onImage.height) {
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
    let rgbSamples = 0;
    for (let y = startY; y <= endY; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        rgbDifference += Math.abs(onPixels[offset] - offPixels[offset]);
        rgbDifference += Math.abs(onPixels[offset + 1] - offPixels[offset + 1]);
        rgbDifference += Math.abs(onPixels[offset + 2] - offPixels[offset + 2]);
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
      peakRowDifference: Math.max(...effectRows.slice(startY, endY + 1)),
      contentRowDifference: sampleDifference(measured.rail.top + 28),
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

  assert.ok(metrics.meanRgbDifference >= 1, `${theme} enabled effect differs measurably from disabled: ${JSON.stringify(metrics)}`);
  const minimumContentRowDifference = 0.25 * Math.min(2, metrics.image.scaleY);
  assert.ok(
    metrics.contentRowDifference >= minimumContentRowDifference,
    `${theme} effect remains measurable inside the real Stepper rail at ${metrics.image.scaleY}x: ${JSON.stringify(metrics)}`
  );
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

  const cjkTrigger = page.getByTestId("choose-cjk-font");
  const latinTrigger = page.getByTestId("choose-latin-font");
  await cjkTrigger.click();

  const cjkDialog = page.getByTestId("font-picker-cjk");
  await cjkDialog.waitFor({ state: "visible" });
  const search = page.getByTestId("font-picker-search");
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "font-picker-search");
  assert.equal(await search.inputValue(), "", "font picker starts with an empty query");
  assert.equal(await cjkDialog.getByRole("listbox").count(), 0, "font groups do not claim an incomplete listbox interaction model");
  assert.equal(await cjkDialog.getByRole("option").count(), 0, "native font buttons do not claim option semantics");
  assert.ok(await cjkDialog.locator('section[aria-labelledby] button[aria-pressed]').count() > 0, "font groups expose labelled native selection buttons");

  await search.fill("Microsoft YaHei");
  await cjkDialog.getByRole("button", { name: /Microsoft YaHei/ }).waitFor({ state: "visible" });
  await cjkDialog.getByRole("button", { name: "关闭", exact: true }).click();
  await cjkDialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "choose-cjk-font");

  await cjkTrigger.click();
  await cjkDialog.waitFor({ state: "visible" });
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="font-picker-search"]')?.value === ""
  ));
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "font-picker-search");
  assert.equal(await search.inputValue(), "", "reopening the same font category clears the previous query");

  const closeButton = cjkDialog.getByRole("button", { name: "关闭", exact: true });
  await closeButton.focus();
  await closeButton.press("Shift+Tab");
  const reverseTabFocus = await cjkDialog.evaluate((dialog) => {
    const expected = dialog.querySelectorAll('section[aria-labelledby] button[aria-pressed]');
    const active = document.activeElement;
    return {
      matchesExpected: active === expected.item(expected.length - 1),
      activeTag: active?.tagName ?? null,
      activeTestId: active?.getAttribute("data-testid") ?? null,
      activeText: active?.textContent?.trim().slice(0, 120) ?? null,
      expectedText: expected.item(expected.length - 1)?.textContent?.trim().slice(0, 120) ?? null,
      expectedCount: expected.length
    };
  });
  assert.equal(
    reverseTabFocus.matchesExpected,
    true,
    `font dialog traps reverse Tab on the native button list: ${JSON.stringify(reverseTabFocus)}`
  );
  await closeButton.click();
  await cjkDialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "choose-cjk-font");

  await latinTrigger.click();
  const latinDialog = page.getByTestId("font-picker-latin");
  await latinDialog.waitFor({ state: "visible" });
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="font-picker-search"]')?.value === ""
  ));
  assert.equal(await page.getByTestId("font-picker-search").inputValue(), "", "switching font categories does not retain the previous query");
  assert.equal(await latinDialog.getByRole("listbox").count(), 0, "Latin font groups also use native button semantics");
  await latinDialog.getByRole("button", { name: "关闭", exact: true }).click();
  await latinDialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "choose-latin-font");

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
    ["examples-button", "clear-all-button", "settings-button"],
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
    const content = stepper?.querySelector('.lyrics-stepper-content');
    const preview = stepper?.querySelector('[data-testid="lyric-card-preview"]');
    const titlebarRect = document.querySelector('.desktop-titlebar')?.getBoundingClientRect();
    const titlebarBrand = document.querySelector('.desktop-titlebar__brand');
    const titlebarName = titlebarBrand?.querySelector('span');
    const iconRect = document.querySelector('.desktop-titlebar__icon')?.getBoundingClientRect();
    const titlebarNameRect = titlebarName?.getBoundingClientRect();
    const gradualBlur = document.querySelector('[data-testid="titlebar-gradual-blur"]');
    const gradualBlurRect = gradualBlur?.getBoundingClientRect();
    const blurLayers = gradualBlur?.querySelectorAll('.desktop-titlebar__blur-layer') ?? [];
    const actionsRect = actions?.getBoundingClientRect();
    const railRect = rail?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
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
        railRect && contentRect && previewRect &&
        railRect.left <= contentRect.left && railRect.right >= previewRect.right &&
        contentRect.top >= railRect.bottom && previewRect.top >= railRect.bottom
      ),
      titlebarIcon: iconRect ? { width: iconRect.width, height: iconRect.height } : null,
      titlebarIconBeforeName: Boolean(iconRect && titlebarNameRect && iconRect.right <= titlebarNameRect.left),
      titlebarGeometry: titlebarRect ? { top: titlebarRect.top, bottom: titlebarRect.bottom } : null,
      railGeometry: railRect ? { top: railRect.top, bottom: railRect.bottom } : null,
      contentGeometry: contentRect ? { top: contentRect.top, bottom: contentRect.bottom } : null,
      titlebarBlur: gradualBlurRect ? {
        top: gradualBlurRect.top,
        bottom: gradualBlurRect.bottom,
        height: gradualBlurRect.height,
        pointerEvents: getComputedStyle(gradualBlur).pointerEvents,
        layerCount: blurLayers.length,
        backdropFilters: [...blurLayers].map((layer) => getComputedStyle(layer).backdropFilter)
      } : null
    };
  });
  assert.equal(result.activeStep, stepId, `${stepId} remains active after the chrome settles`);
  assert.equal(result.compactChrome, "true", `${stepId} uses the shared compact stepper chrome`);
  assert.equal(result.legacyHeaderCount, 0, `${stepId} removes the legacy editor header`);
  assert.equal(result.actionPlacement, "stepper", `${stepId} places the shared actions in the stepper`);
  assert.deepEqual(result.actionIds, ["examples-button", "clear-all-button", "settings-button"], `${stepId} preserves all editor actions`);
  assert.equal(result.actionsInsideRail, true, `${stepId} keeps the actions inside the stepper rail`);
  assert.equal(result.actionsFitRail, true, `${stepId} keeps the actions within the stepper bounds`);
  assert.equal(result.railSpansWorkbench, true, `${stepId} spans the shared rail across settings and preview`);
  assert.ok(result.titlebarIcon && result.titlebarIcon.width === 18 && result.titlebarIcon.height === 18, `${stepId} renders the small titlebar app icon`);
  assert.equal(result.titlebarIconBeforeName, true, `${stepId} places the titlebar app icon before the app name`);
  assert.deepEqual(
    result.titlebarBlur && {
      height: result.titlebarBlur.height,
      pointerEvents: result.titlebarBlur.pointerEvents,
      layerCount: result.titlebarBlur.layerCount
    },
    { height: 144, pointerEvents: "none", layerCount: 1 },
    `${stepId} keeps the measured gradual titlebar effect without intercepting input`
  );
  assert.ok(
    result.titlebarGeometry && result.titlebarBlur && result.railGeometry && result.contentGeometry &&
      Math.abs(result.titlebarGeometry.bottom - 48) <= 0.5 &&
      result.titlebarBlur.bottom >= result.railGeometry.top + 72 &&
      result.titlebarBlur.bottom < result.contentGeometry.top,
    `${stepId} titlebar effect crosses the real rail boundary and fades before the content panel`
  );
  assert.ok(
    result.titlebarBlur?.backdropFilters.every((filter) => filter.includes("blur(")),
    `${stepId} applies backdrop blur to every gradual layer`
  );
}

async function assertLyricsWorkspace(width, height) {
  await setWindowSize(width, height);
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  const result = await page.evaluate(() => {
    const editor = document.querySelector('[data-testid="editor-surface"]');
    const workspace = document.querySelector('[data-testid="lyrics-workspace"]');
    const shared = document.querySelector('[data-testid="lyrics-shared-scroll"]');
    const summary = document.querySelector('.lyrics-summary-aside');
    const documentColumn = document.querySelector('.lyrics-workspace-grid > section');
    const tools = document.querySelector('.lyrics-tools-aside');
    const actions = document.querySelector('.lyrics-stepper-actions');
    const main = document.querySelector('.lyric-editor-main');
    const stepContent = document.querySelector('.lyrics-stepper-content');
    const fetchBoundary = document.querySelector('[data-testid="lyrics-fetch-panel-boundary"]');
    const stepper = editor?.querySelector('[data-stepper-presentation="lyrics-workspace"]');
    const rail = stepper?.querySelector('.lyrics-stepper-rail');
    const heading = rail?.querySelector('[data-stepper-heading-row="true"]');
    const headerActions = heading?.querySelector('[data-testid="editor-header-actions"]');
    const railRect = rail?.getBoundingClientRect();
    const headerActionsRect = headerActions?.getBoundingClientRect();
    const textareas = [...document.querySelectorAll('[data-testid="lyrics-shared-scroll"] textarea')];
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
    return {
      editor: editor ? { clientHeight: editor.clientHeight, scrollHeight: editor.scrollHeight, overflowY: getComputedStyle(editor).overflowY } : null,
      workspace: rect(workspace),
      workspaceFrame: frame(workspace),
      shared: shared ? { ...rect(shared), overflowX: getComputedStyle(shared).overflowX, overflowY: getComputedStyle(shared).overflowY } : null,
      summary: summary ? {
        ...rect(summary),
        clientHeight: summary.clientHeight,
        scrollHeight: summary.scrollHeight,
        contentBottom: Math.max(
          summary.getBoundingClientRect().top,
          ...[...summary.children].map((child) => child.getBoundingClientRect().bottom)
        )
      } : null,
      summaryFrame: frame(summary),
      documentColumn: rect(documentColumn),
      documentFrame: frame(documentColumn),
      tools: tools ? {
        ...rect(tools),
        clientHeight: tools.clientHeight,
        scrollHeight: tools.scrollHeight,
        fixedControlsVisible: [...tools.querySelectorAll('.lyrics-tools-aside__modes button, .lyrics-tools-aside__actions button')]
          .every((control) => {
            const controlRect = control.getBoundingClientRect();
            const toolsRect = tools.getBoundingClientRect();
            return controlRect.top >= toolsRect.top - 1 && controlRect.bottom <= toolsRect.bottom + 1;
          })
      } : null,
      toolsFrame: frame(tools),
      actions: rect(actions),
      documentRoot: {
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight,
        scrollY: window.scrollY,
        scrollX: window.scrollX
      },
      main: main ? { clientHeight: main.clientHeight, scrollHeight: main.scrollHeight, overflowY: getComputedStyle(main).overflowY } : null,
      stepContent: stepContent ? { clientHeight: stepContent.clientHeight, scrollHeight: stepContent.scrollHeight, overflowY: getComputedStyle(stepContent).overflowY } : null,
      fetchBoundary: fetchBoundary ? { ...rect(fetchBoundary), overflowY: getComputedStyle(fetchBoundary).overflowY } : null,
      textareaCount: textareas.length,
      textareaHeights: textareas.map((area) => area.getBoundingClientRect().height),
      textareaStyles: textareas.map((area) => ({ overflowY: getComputedStyle(area).overflowY, resize: getComputedStyle(area).resize })),
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
  assert.equal(result.activeStep, "lyrics", `${width}x${height} keeps the lyrics step active`);
  assert.ok(result.workspace && result.shared && result.actions && result.documentColumn, `${width}x${height} renders the bounded lyrics skeleton`);
  assert.deepEqual(
    result.workspaceFrame,
    { top: 0, right: 0, bottom: 0, left: 0, radius: "0px" },
    `${width}x${height} removes the outer lyrics-workspace frame`
  );
  assert.deepEqual(
    result.summaryFrame,
    { top: 0, right: 0, bottom: 0, left: 0, radius: "0px" },
    `${width}x${height} removes the summary-column frame`
  );
  assert.deepEqual(
    { ...result.documentFrame, left: 0 },
    { top: 0, right: 0, bottom: 0, left: 0, radius: "0px" },
    `${width}x${height} removes every document-column edge except its left divider`
  );
  assert.ok(
    result.documentFrame.left > 0 && result.documentFrame.left <= 1,
    `${width}x${height} gives the document only one device-scaled thin left divider: ${result.documentFrame.left}`
  );
  assert.deepEqual(
    { ...result.toolsFrame, left: 0 },
    { top: 0, right: 0, bottom: 0, left: 0, radius: "0px" },
    `${width}x${height} removes every tools-column edge except its left divider`
  );
  assert.ok(
    result.toolsFrame.left > 0 && result.toolsFrame.left <= 1,
    `${width}x${height} gives the tools only one device-scaled thin left divider: ${result.toolsFrame.left}`
  );
  assert.ok(result.workspace.x >= -1 && result.workspace.right <= width + 1, `${width}x${height} keeps the workspace inside the viewport`);
  assert.equal(result.editor.scrollHeight, result.editor.clientHeight, `${width}x${height} prevents editor-root scrolling`);
  assert.equal(result.editor.overflowY, "hidden", `${width}x${height} hides editor-root overflow`);
  assert.equal(result.shared.overflowX, "hidden", `${width}x${height} prevents a second horizontal document scroll`);
  assert.equal(result.shared.overflowY, "auto", `${width}x${height} gives the document the main scrollbar`);
  assert.ok(result.summary.right <= result.documentColumn.x + 1, `${width}x${height} summary does not overlap document`);
  assert.ok(result.documentColumn.right <= result.tools.x + 1, `${width}x${height} document does not overlap tools`);
  assert.equal(result.documentRoot.scrollY, 0, `${width}x${height} keeps the document viewport at the top`);
  assert.equal(result.documentRoot.scrollX, 0, `${width}x${height} prevents focus from horizontally scrolling the stage`);
  assert.ok(result.documentRoot.scrollHeight <= result.documentRoot.clientHeight + 1, `${width}x${height} prevents document-root scrolling`);
  assert.ok(result.main.scrollHeight <= result.main.clientHeight + 1, `${width}x${height} prevents main-root scrolling`);
  assert.equal(result.stepContent.overflowY, "hidden", `${width}x${height} gives the step content no second scrollbar`);
  assert.ok(
    result.summary.contentBottom <= result.summary.bottom + 1,
    `${width}x${height} keeps visible summary content inside its column: ${JSON.stringify(result.summary)}`
  );
  assert.equal(result.tools.fixedControlsVisible, true, `${width}x${height} keeps every fixed tool inside the aside`);
  if (result.fetchBoundary) {
    assert.equal(result.fetchBoundary.overflowY, "auto", `${width}x${height} confines dynamic lyrics results to their own scroller`);
    assert.ok(
      result.fetchBoundary.bottom <= result.tools.bottom + 1,
      `${width}x${height} keeps the dynamic tools panel inside the aside: ${JSON.stringify({ tools: result.tools, fetchBoundary: result.fetchBoundary })}`
    );
  }
  assert.ok(result.actions.bottom <= height + 1, `${width}x${height} keeps navigation visible`);
  assert.equal(result.hasPreview, false, `${width}x${height} hides the visible preview on step two`);
  assert.equal(result.hasPreviewToggle, false, `${width}x${height} removes the preview toggle on step two`);
  assert.equal(result.compactChrome, "true", `${width}x${height} gives step two the shared compact Stepper chrome`);
  assert.equal(result.legacyHeaderCount, 0, `${width}x${height} removes the separate step-two app header`);
  assert.equal(result.actionPlacement, "stepper", `${width}x${height} places step-two actions in the Stepper heading`);
  assert.deepEqual(
    result.actionIds,
    ["examples-button", "clear-all-button", "settings-button"],
    `${width}x${height} preserves every step-two editor action`
  );
  assert.equal(result.actionsInsideRail, true, `${width}x${height} keeps step-two actions inside the shared rail`);
  assert.equal(result.actionsFitRail, true, `${width}x${height} keeps step-two actions within the rail bounds`);
  assert.equal(result.railSpansWorkspace, true, `${width}x${height} spans the step-two rail across the lyrics workspace`);
  assert.ok(result.textareaCount >= 1, `${width}x${height} renders the document editor`);
  if (result.textareaHeights.length === 2) {
    assert.ok(Math.abs(result.textareaHeights[0] - result.textareaHeights[1]) <= 1, `${width}x${height} keeps original and translation equal height`);
  }
  for (const style of result.textareaStyles) {
    assert.equal(style.overflowY, "hidden", `${width}x${height} textarea delegates scrolling to the shared viewport`);
    assert.equal(style.resize, "none", `${width}x${height} textarea disables native resize`);
  }
  await assertExportHost(`step two ${width}x${height}`);
}

async function assertPreviewFits(width, height, scrolled) {
  await setWindowSize(width, height);
  await page.locator('[data-testid="editor-surface"]').evaluate((element, shouldScroll) => {
    element.scrollTop = shouldScroll ? element.scrollHeight : 0;
  }, scrolled);
  await page.waitForFunction(() => {
    const preview = document.querySelector('[data-testid="lyric-card-preview"]');
    if (!(preview instanceof HTMLElement)) return false;
    const rect = preview.getBoundingClientRect();
    return rect.top >= -1 && rect.bottom <= window.innerHeight + 1;
  }, undefined, { timeout: 5_000 });
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
  acceptDocumentReplacementDialogs = true;
  await page.getByTestId("load-example-opalite").click();
  acceptDocumentReplacementDialogs = false;

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

    acceptDocumentReplacementDialogs = true;
    await page.getByTestId(`load-example-${example.id}`).click();
    acceptDocumentReplacementDialogs = false;
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
  page = await electronApp.firstWindow({ timeout: 60_000 });
  page.on("dialog", async (dialog) => {
    nativeDialogs.push({ type: dialog.type(), message: dialog.message() });
    if (acceptDocumentReplacementDialogs && dialog.type() === "confirm") {
      await dialog.accept();
    } else {
      await dialog.dismiss();
    }
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
  assert.deepEqual(nativeDialogs, [], `settings interactions must not open native dialogs: ${JSON.stringify(nativeDialogs)}`);

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
  }

  await page.locator('button[data-step-id="lyrics"]').click();
  await page.getByTestId("lyrics-workspace").waitFor({ state: "visible" });
  const originalLyrics = page.getByRole("textbox", { name: "原文", exact: true });
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
  for (const size of focusedSizes) {
    await assertLyricsWorkspace(size.width, size.height);
  }
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
  await waitForLyricsLineBudget("原文 18 + 译文 18 = 36 / 36");
  assert.match(await page.getByTestId("lyrics-line-budget").innerText(), /18.*18.*36 \/ 36/s);
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

  const fontOverrideSupported = await page.evaluate(() => {
    try {
      Object.defineProperty(document.fonts, "status", { configurable: true, get: () => "loading" });
      const button = document.querySelector('[data-testid="complete-export-button"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.removeAttribute("disabled");
      button.click();
      delete document.fonts.status;
      return true;
    } catch {
      return false;
    }
  });
  assert.equal(fontOverrideSupported, true, "test shell can simulate fonts-loading readiness");
  await page.getByTestId("app-toast").waitFor({ state: "visible" });
  assert.match(await page.getByTestId("app-toast").innerText(), /字体.*加载|加载.*字体/, "live export defense rejects fonts that are not ready");

  await page.evaluate(() => {
    const root = document.querySelector('[data-export-card-host] [data-export-card]');
    const button = document.querySelector('[data-testid="complete-export-button"]');
    if (!(root instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) throw new Error("export DOM unavailable");
    const previousWidth = root.style.width;
    root.style.width = "1px";
    button.removeAttribute("disabled");
    button.click();
    root.style.width = previousWidth;
  });
  await page.waitForFunction(() => /计算|高度|稍候/.test(document.querySelector('[data-testid="app-toast"]')?.textContent ?? ""));

  await page.locator('button[data-step-id="lyrics"]').click();
  await fillExact(originalLyrics, `${originalEighteen}\nline 19`);
  await waitForLyricsLineBudget("37 / 36");
  assert.match(await page.getByTestId("lyrics-line-budget").innerText(), /37 \/ 36/);
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
  await waitForLyricsLineBudget("原文 18 + 译文 18 = 36 / 36");
  assert.match(await page.getByTestId("lyrics-line-budget").innerText(), /18.*18.*36 \/ 36/s);
  await page.locator('button[data-step-id="layout"]').click();
  await page.locator('[role="radiogroup"][aria-label="尺寸模式"] [data-segment-value="1:1"]').click();
  await page.waitForFunction(() => document.querySelector('[data-export-card-host] [data-export-card]')?.getBoundingClientRect().height === 1080);
  const squareCard = await measureExportCard();
  assert.equal(squareCard?.hasOverflow, true, `1:1 fixed ratio exposes real overflow: ${JSON.stringify(squareCard)}`);
  await page.locator('button[data-step-id="export"]').click();
  assert.equal(await page.getByTestId("complete-export-button").isDisabled(), true, "1:1 overflow disables export");
  const squareAlert = page.getByRole("alert").filter({ hasText: "当前版式无法完整容纳歌词" });
  await squareAlert.waitFor({ state: "visible" });
  assert.match(await squareAlert.innerText(), /无法容纳|自动高度|调整排版/, "1:1 overflow shows an explicit alert");

  await page.locator('button[data-step-id="layout"]').click();
  const landscapeMode = page.locator('[role="radiogroup"][aria-label="布局模式"] [data-segment-value="landscape"]');
  await landscapeMode.click();
  await page.waitForFunction(() => document.querySelector('[data-segment-value="landscape"]')?.getAttribute("aria-checked") === "true");
  const sixteenNine = page.locator('[role="radiogroup"][aria-label="尺寸模式"] [data-segment-value="16:9"]');
  await sixteenNine.click();
  await page.waitForFunction(() => document.querySelector('[data-segment-value="16:9"]')?.getAttribute("aria-checked") === "true");
  await page.waitForTimeout(300);
  const landscapeCard = await measureExportCard();
  assert.deepEqual(
    { width: landscapeCard?.width, height: landscapeCard?.height },
    { width: 1920, height: 1080 },
    `16:9 uses the fixed export pixel size: ${JSON.stringify(landscapeCard)}`
  );
  assert.equal(landscapeCard?.hasOverflow, true, `16:9 fixed ratio exposes real overflow: ${JSON.stringify(landscapeCard)}`);
  await page.locator('button[data-step-id="export"]').click();
  assert.equal(await page.getByTestId("complete-export-button").isDisabled(), true, "16:9 overflow disables export");
  const landscapeAlert = page.getByRole("alert").filter({ hasText: "当前版式无法完整容纳歌词" });
  await landscapeAlert.waitFor({ state: "visible" });
  assert.match(await landscapeAlert.innerText(), /无法容纳|自动高度|调整排版/, "16:9 overflow shows an explicit alert");

  await assertAcrylicVisuals();

  await page.screenshot({ path: path.join(reportDirectory, "settings-interaction.png"), fullPage: false });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    nativeDialogs,
    searchMock: { searches: searchRequests.length, resolves: resolveRequests.length },
    focusedViewports: focusedSizes.map(({ width, height }) => `${width}x${height}`),
    previewViewports: ["1366x768", "1440x900", "1920x1080"],
    visualDiagnostics: runVisualDiagnostics,
    titlebarVisualMetrics,
    titlebarPerformanceComparison,
    exportCards: {
      autoHeight: autoHeightCard,
      autoWidth: { width: settledAutoWidth, wrapMetrics: autoWidthWrapMetrics },
      builtInExampleAutoWidths,
      square: squareCard,
      landscape: landscapeCard
    }
  }, null, 2)}\n`);
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(reportDirectory, "settings-interaction-failure.png"), fullPage: false }).catch(() => {});
  }
  throw error;
} finally {
  await electronApp?.close().catch(() => {});
  await rm(userDataDirectory, { recursive: true, force: true }).catch(() => {});
}
