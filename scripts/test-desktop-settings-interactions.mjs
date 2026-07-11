import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe");
const reportDirectory = path.join(root, "playwright-report", "desktop");
const userDataDirectory = await mkdtemp(path.join(tmpdir(), "lyrics-card-desktop-test-"));

let electronApp;
let page;
const nativeDialogs = [];
const searchRequests = [];
const resolveRequests = [];

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

async function measureExportCard() {
  return page.evaluate(() => {
    const root = document.querySelector("[data-export-card-host] [data-export-card]");
    const lyrics = root?.querySelector("[data-card-lyrics]");
    const viewport = root?.querySelector("[data-card-lyrics-viewport]");
    if (!(root instanceof HTMLElement)) return null;
    const overflow = (node) => node instanceof HTMLElement && (
      node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2
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

  const firstId = await options.nth(0).getAttribute("id");
  assert.equal(await combobox.getAttribute("aria-activedescendant"), firstId);
  await combobox.press("ArrowDown");
  const secondId = await options.nth(1).getAttribute("id");
  assert.equal(await combobox.getAttribute("aria-activedescendant"), secondId);
  assert.equal(await options.nth(1).getAttribute("aria-selected"), "true");
  assert.equal(await combobox.evaluate((node) => document.activeElement === node), true, "ArrowDown keeps DOM focus on the combobox");
  await combobox.press("ArrowUp");
  assert.equal(await combobox.getAttribute("aria-activedescendant"), firstId);
  await combobox.press("Escape");
  await popup.waitFor({ state: "hidden" });
  assert.equal(await combobox.getAttribute("aria-activedescendant"), null);
  assert.equal(await combobox.evaluate((node) => document.activeElement === node), true, "Escape keeps focus on the combobox");

  await combobox.press("ArrowDown");
  await popup.waitFor({ state: "visible" });
  await combobox.press("Tab");
  await popup.waitFor({ state: "hidden" });
  const tabTarget = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? "",
    role: document.activeElement?.getAttribute("role") ?? "",
    insidePopup: Boolean(document.activeElement?.closest('[data-testid="song-search-popup"]'))
  }));
  assert.equal(tabTarget.insidePopup, false, `Tab skips popup options and footer: ${JSON.stringify(tabTarget)}`);
  assert.notEqual(tabTarget.role, "option", "Tab never focuses an option");

  await combobox.fill("mouse mock");
  await listbox.waitFor({ state: "visible" });
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
  await combobox.press("Enter");
  await page.waitForFunction(() => !document.querySelector('[role="combobox"]')?.hasAttribute("disabled"));
  assert.match(
    await combobox.inputValue(),
    new RegExp(`Resolved result ${activeIndex + 1} - Mock Artist ${activeIndex + 1}`),
    `Enter resolves active descendant ${activeId}`
  );
  assert.ok(searchRequests.length >= 3, "search route mock received keyboard, Tab, and mouse queries");
  assert.equal(resolveRequests.length, 2, "mouse and Enter each resolve exactly one mocked result");
}

async function assertFocusedPresentation(width, height) {
  await setWindowSize(width, height);
  await waitForLayoutStable(page.locator('[data-stepper-presentation="focus"]'));
  const result = await page.evaluate(() => {
    const stepper = document.querySelector('[data-stepper-presentation="focus"]');
    const preview = document.querySelector('[data-testid="lyric-card-preview"]');
    const previewToggle = document.querySelector('[data-testid="preview-pane-toggle"]');
    const exportHost = document.querySelector('[data-export-card-host]');
    const search = document.querySelector('[role="combobox"]');
    const stepperRect = stepper?.getBoundingClientRect();
    const asideRect = document.querySelector('[data-testid="song-import-aside"]')?.getBoundingClientRect();
    const aside = document.querySelector('[data-testid="song-import-aside"]');
    return {
      stepper: stepperRect ? { x: stepperRect.x, width: stepperRect.width } : null,
      aside: asideRect ? { x: asideRect.x, width: asideRect.width } : null,
      hasVisiblePreview: Boolean(preview && preview.getBoundingClientRect().right > 0),
      hasPreviewToggle: Boolean(previewToggle),
      exportHostLeft: exportHost?.getBoundingClientRect().left ?? 0,
      hasSearch: Boolean(search),
      hasLinkEntry: Boolean(aside?.querySelector('.song-import-aside__methods input:not([type="file"])')),
      hasLocalEntry: Boolean(aside?.querySelector('input[type="file"]')),
      hasManualEntry: Boolean(aside?.querySelector('button[aria-controls][aria-expanded]')),
      activeStep: document.querySelector('[aria-current="step"]')?.getAttribute("data-step-id")
    };
  });
  assert.equal(result.activeStep, "link", `${width}x${height} keeps the song step active`);
  assert.ok(result.stepper, `${width}x${height} renders the focused stepper`);
  assert.ok(result.aside, `${width}x${height} renders the compact import aside`);
  assert.equal(result.hasSearch, true, `${width}x${height} renders the primary search entry`);
  assert.equal(result.hasLinkEntry, true, `${width}x${height} preserves link import`);
  assert.equal(result.hasLocalEntry, true, `${width}x${height} preserves local audio import`);
  assert.equal(result.hasManualEntry, true, `${width}x${height} preserves manual metadata entry`);
  assert.ok(
    result.stepper.width > result.aside.width,
    `${width}x${height} keeps search primary over import methods: ${JSON.stringify(result)}`
  );
  assert.equal(result.hasVisiblePreview, false, `${width}x${height} hides the visible preview on step one`);
  assert.equal(result.hasPreviewToggle, false, `${width}x${height} removes the mobile preview toggle on step one`);
  assert.ok(result.exportHostLeft < -90_000, `${width}x${height} keeps the export card off-screen`);
  await assertExportHost(`step one ${width}x${height}`);
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
    const textareas = [...document.querySelectorAll('[data-testid="lyrics-shared-scroll"] textarea')];
    const rect = (element) => {
      const value = element?.getBoundingClientRect();
      return value ? { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom } : null;
    };
    return {
      editor: editor ? { clientHeight: editor.clientHeight, scrollHeight: editor.scrollHeight, overflowY: getComputedStyle(editor).overflowY } : null,
      workspace: rect(workspace),
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
      documentColumn: rect(documentColumn),
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
      activeStep: document.querySelector('[aria-current="step"]')?.getAttribute("data-step-id")
    };
  });
  assert.equal(result.activeStep, "lyrics", `${width}x${height} keeps the lyrics step active`);
  assert.ok(result.workspace && result.shared && result.actions && result.documentColumn, `${width}x${height} renders the bounded lyrics skeleton`);
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
  await page.waitForTimeout(250);
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

  const firstLaunch = page.getByTestId("first-launch-language-dialog");
  await firstLaunch.waitFor({ state: "visible", timeout: 60_000 });
  await page.locator('[data-testid="first-launch-language"][data-locale="zh"]').click();
  await firstLaunch.waitFor({ state: "hidden", timeout: 15_000 });

  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await waitForVisible("settings-surface");

  await selectSettingsSection("ai");
  await (await waitForVisible("ai-open-library")).click();
  await (await waitForVisible("preset-card-lyrical")).click();
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
  await page.locator('[data-testid="editor-surface"] [data-testid="settings-button"]').click();
  await page.locator('[data-testid="settings-surface"][data-surface-state="open"]').waitFor({ state: "visible" });
  await page.getByTestId("settings-close-button").click();
  await page.locator('[data-testid="settings-surface"][data-surface-state="closed"]').waitFor({ state: "attached" });

  const minimumWindowSize = await electronApp.evaluate(({ BrowserWindow }) => (
    BrowserWindow.getAllWindows()[0].getMinimumSize()
  ));
  assert.deepEqual(minimumWindowSize, [1000, 700], "desktop window preserves the 1000px minimum width");
  await assertSongSearchBehavior();

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

  await page.locator('button[data-step-id="lyrics"]').click();
  await page.getByTestId("lyrics-workspace").waitFor({ state: "visible" });
  const originalLyrics = page.getByRole("textbox", { name: "原文", exact: true });
  const translationToggle = page.getByTestId("translation-toggle");
  await translationToggle.click();
  const translationLyrics = page.getByRole("textbox", { name: "译文", exact: true });
  await translationLyrics.waitFor({ state: "visible" });
  const originalEighteen = Array.from(
    { length: 18 },
    (_, index) => `original ${String(index + 1).padStart(2, "0")} keeps the authored cadence`
  ).join("\n");
  const translationEighteen = Array.from(
    { length: 18 },
    (_, index) => `translation ${String(index + 1).padStart(2, "0")} preserves the matching context`
  ).join("\n");
  await originalLyrics.fill(originalEighteen);
  await translationLyrics.fill(translationEighteen);
  for (const size of focusedSizes) {
    await assertLyricsWorkspace(size.width, size.height);
  }

  await setWindowSize(1000, 700);
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  const standardMode = page.getByRole("button", { name: "标准", exact: true });
  const expandedMode = page.getByRole("button", { name: "扩展", exact: true });
  const immersiveMode = page.getByRole("button", { name: "沉浸", exact: true });
  await standardMode.click();
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  const standardHeight = await page.getByTestId("lyrics-workspace").evaluate((element) => element.getBoundingClientRect().height);

  const translationSelectionStart = translationEighteen.indexOf("translation 11") + 2;
  const translationSelectionEnd = translationSelectionStart + 14;
  await translationLyrics.evaluate((node, selection) => {
    node.focus();
    node.setSelectionRange(selection.start, selection.end);
    node.dispatchEvent(new Event("select", { bubbles: true }));
    const scroll = node.closest('[data-testid="lyrics-shared-scroll"]');
    if (scroll instanceof HTMLElement) {
      scroll.scrollTop = Math.min(
        scroll.scrollHeight - scroll.clientHeight,
        Math.max(1, Math.round((scroll.scrollHeight - scroll.clientHeight) * 0.58))
      );
    }
  }, { start: translationSelectionStart, end: translationSelectionEnd });
  const contextBeforeModeChange = await getLyricsContext(translationLyrics);
  assert.equal(contextBeforeModeChange.focused, true, "translation editor owns focus before viewport changes");
  assert.ok(contextBeforeModeChange.scrollTop > 0, "viewport regression starts from a non-zero scroll position");

  await expandedMode.click();
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  const expandedHeight = await page.getByTestId("lyrics-workspace").evaluate((element) => element.getBoundingClientRect().height);
  const contextAfterExpanded = await getLyricsContext(translationLyrics);
  assertSameSelection(contextBeforeModeChange, contextAfterExpanded, "expanded mode");
  assert.ok(
    Math.abs(contextAfterExpanded.anchorOffset - contextBeforeModeChange.anchorOffset) <= 10,
    `expanded mode preserves the authored anchor: ${JSON.stringify({ contextBeforeModeChange, contextAfterExpanded })}`
  );
  assert.equal(await expandedMode.evaluate((node) => document.activeElement === node), true, "mode change does not steal focus from its button");

  await immersiveMode.click();
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  const immersiveHeight = await page.getByTestId("lyrics-workspace").evaluate((element) => element.getBoundingClientRect().height);
  assert.ok(
    standardHeight < expandedHeight && expandedHeight < immersiveHeight,
    `lyrics viewport exposes three distinct stable heights: ${JSON.stringify({ standardHeight, expandedHeight, immersiveHeight })}`
  );
  const resizeHandle = page.getByRole("separator", { name: "调整歌词编辑视口高度" });
  await resizeHandle.press("Escape");
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  assert.equal(await expandedMode.getAttribute("aria-pressed"), "true", "Escape restores the pre-immersive mode");
  assert.equal(await resizeHandle.evaluate((node) => document.activeElement === node), true, "Escape preserves focus on the invoking resize handle");

  await resizeHandle.dblclick();
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  assert.equal(await standardMode.getAttribute("aria-pressed"), "true", "double-click restores standard height");

  const handleBox = await resizeHandle.boundingBox();
  const currentHeight = Number(await resizeHandle.getAttribute("aria-valuenow"));
  const maxHeight = Number(await resizeHandle.getAttribute("aria-valuemax"));
  assert.ok(handleBox && maxHeight > currentHeight, "resize handle exposes a draggable height range");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2 + (maxHeight - currentHeight - 10),
    { steps: 8 }
  );
  await page.mouse.up();
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  assert.equal(await immersiveMode.getAttribute("aria-pressed"), "true", "dragging within the 24px snap zone enters immersive mode");
  const contextAfterDrag = await getLyricsContext(translationLyrics);
  assertSameSelection(contextBeforeModeChange, contextAfterDrag, "immersive drag");

  await resizeHandle.dblclick();
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  await resizeHandle.focus();
  await resizeHandle.press("End");
  assert.equal(await immersiveMode.getAttribute("aria-pressed"), "true", "End selects immersive mode");
  await resizeHandle.press("Escape");
  assert.equal(await standardMode.getAttribute("aria-pressed"), "true", "Escape restores the mode active before keyboard immersive");
  await resizeHandle.press("ArrowDown");
  assert.equal(await expandedMode.getAttribute("aria-pressed"), "true", "ArrowDown selects expanded mode");
  await resizeHandle.press("Home");
  assert.equal(await standardMode.getAttribute("aria-pressed"), "true", "Home selects standard mode");
  await resizeHandle.press("ArrowDown");
  await resizeHandle.press("ArrowDown");
  assert.equal(await immersiveMode.getAttribute("aria-pressed"), "true", "two ArrowDown presses reach immersive mode");
  await resizeHandle.press("Escape");
  assert.equal(await expandedMode.getAttribute("aria-pressed"), "true", "Escape returns to expanded after arrow-key entry");
  await resizeHandle.press("ArrowUp");
  assert.equal(await standardMode.getAttribute("aria-pressed"), "true", "ArrowUp returns to standard mode");

  await translationLyrics.evaluate((node, selection) => {
    node.focus();
    node.setSelectionRange(selection.start, selection.end);
    node.dispatchEvent(new Event("select", { bubbles: true }));
  }, { start: translationSelectionStart, end: translationSelectionEnd });
  const beforeWindowResize = await getLyricsContext(translationLyrics);
  await setWindowSize(1280, 900);
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));
  const afterWindowResize = await getLyricsContext(translationLyrics);
  assertSameSelection(beforeWindowResize, afterWindowResize, "window height change");
  assert.equal(afterWindowResize.focused, true, "window size changes preserve translation focus");
  await setWindowSize(1000, 700);
  await waitForLayoutStable(page.getByTestId("lyrics-workspace"));

  await translationLyrics.evaluate((node, selection) => {
    node.focus();
    node.setSelectionRange(selection.start, selection.end);
    node.dispatchEvent(new Event("select", { bubbles: true }));
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

  assert.match(await page.getByTestId("lyrics-line-budget").innerText(), /18.*18.*36 \/ 36/s);
  await page.locator('button[data-step-id="export"]').click();
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="complete-export-button"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 15_000 });
  assert.equal(await page.getByTestId("complete-export-button").isEnabled(), true, "36 logical lines remain exportable in auto-height mode");
  const autoHeightCard = await measureExportCard();
  assert.ok(autoHeightCard && autoHeightCard.height > 3200 && autoHeightCard.height <= 6400, `auto-height export uses the real measured card height: ${JSON.stringify(autoHeightCard)}`);
  assert.equal(autoHeightCard.hasOverflow, false, `auto-height export contains the real DOM within tolerance: ${JSON.stringify(autoHeightCard)}`);

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
  await originalLyrics.fill(`${originalEighteen}\nline 19`);
  assert.match(await page.getByTestId("lyrics-line-budget").innerText(), /37 \/ 36/);
  await page.locator('button[data-step-id="export"]').click();
  assert.equal(await page.getByTestId("complete-export-button").isDisabled(), true, "37 logical lines disable final export");

  await page.locator('button[data-step-id="lyrics"]').click();
  await originalLyrics.fill("line one\nline two");
  await translationLyrics.fill("translation one\ntranslation two");
  await page.locator('button[data-step-id="layout"]').click();
  await page.getByTestId("lyric-card-preview").waitFor({ state: "visible" });
  await assertExportHost("step three");

  for (const size of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 }
  ]) {
    await assertPreviewFits(size.width, size.height, false);
    await assertPreviewFits(size.width, size.height, true);
  }

  await page.locator('button[data-step-id="lyrics"]').click();
  await originalLyrics.fill(originalEighteen);
  await translationLyrics.fill(translationEighteen);
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

  await page.screenshot({ path: path.join(reportDirectory, "settings-interaction.png"), fullPage: false });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    nativeDialogs,
    searchMock: { searches: searchRequests.length, resolves: resolveRequests.length },
    focusedViewports: focusedSizes.map(({ width, height }) => `${width}x${height}`),
    previewViewports: ["1366x768", "1440x900", "1920x1080"],
    exportCards: {
      autoHeight: autoHeightCard,
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
