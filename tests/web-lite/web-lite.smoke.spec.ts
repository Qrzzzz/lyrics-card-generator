import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Download, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { EXAMPLE_SONGS, resolveExampleTranslation } from "../../lib/examples";

const projectRoot = process.cwd();
const localCoverBytesPromise = readFile(path.join(projectRoot, "public", "app-icon.png"));
const remoteCoverUrl = "https://covers.test/cover.png";
const remoteCoverRequestPattern = /^https:\/\/covers\.test\/cover\.png(?:\?.*)?$/;
const preferencesKey = "lyrics-card-web-lite-preferences-v1";
const stepIds = ["song-info", "lyrics", "layout", "font", "visual", "export"] as const;
const expectedExampleAutoWidths: Record<string, { min: number; max: number }> = {
  opalite: { min: 1360, max: 1400 },
  opposite: { min: 820, max: 860 },
  yuusha: { min: 1080, max: 1120 },
  "glorious-years": { min: 780, max: 820 },
  honeybee: { min: 860, max: 900 },
  lies: { min: 900, max: 940 }
};

type AutoWidthEquivalenceFixture = {
  id: string;
  lyrics: string;
  translationText?: string;
  translationEnabled: boolean;
  fontPreset: "source-han-sans" | "source-han-serif";
  lyricFontSize: number;
  translationScale: number;
  lineHeight: number;
  align: "left" | "center";
  anchorWidth: number;
  expected: { width: number; height: number };
  expectedByPlatform?: Partial<Record<NodeJS.Platform, { width: number; height: number }>>;
};

const autoWidthEquivalenceFixtures: AutoWidthEquivalenceFixture[] = [
  {
    id: "english-punctuation",
    lyrics: [
      "Don't let the morning steal this away.",
      "Stay—just a little longer, won't you?",
      "We re-enter the half-lit room together.",
      "Every comma, pause, and promise remains.",
      "I know now: the ending wasn't ours.",
      "Still, we'll carry on until sunrise."
    ].join("\n"),
    translationEnabled: false,
    fontPreset: "source-han-sans",
    lyricFontSize: 60,
    translationScale: 0.75,
    lineHeight: 1.8,
    align: "left",
    anchorWidth: 720,
    expected: { width: 1300, height: 1620 }
  },
  {
    id: "simplified-chinese-empty-lines",
    lyrics: "今夜的风穿过安静街巷\n灯火把影子慢慢拉长\n\n我们在旧站台等一场雨\n也等一句没有说完的话\n天亮以前请不要遗忘",
    translationEnabled: false,
    fontPreset: "source-han-serif",
    lyricFontSize: 48,
    translationScale: 0.75,
    lineHeight: 1.6,
    align: "center",
    anchorWidth: 1440,
    expected: { width: 920, height: 920 }
  },
  {
    id: "japanese-with-translation",
    lyrics: [
      "夜明け前のホームで待っている",
      "遠い汽笛が静けさをほどく",
      "忘れたはずの名前を呼べば",
      "春の匂いが窓辺に戻る",
      "もう一度だけ同じ空を見よう"
    ].join("\n"),
    translationText: [
      "Waiting on the platform before dawn",
      "A distant whistle loosens the silence",
      "When I call the name I meant to forget",
      "The scent of spring returns to the window",
      "Let us look at the same sky once more"
    ].join("\n"),
    translationEnabled: true,
    fontPreset: "source-han-sans",
    lyricFontSize: 56,
    translationScale: 0.7,
    lineHeight: 1.9,
    align: "center",
    anchorWidth: 920,
    expected: { width: 1320, height: 1420 }
  },
  {
    id: "korean-with-chinese-translation",
    lyrics: [
      "새벽빛이 창문 위로 번져 오면",
      "우리의 오래된 노래를 기억해",
      "멀리 돌아온 계절의 끝에서도",
      "말하지 못한 마음은 남아 있어",
      "오늘만큼은 천천히 걸어가자"
    ].join("\n"),
    translationText: [
      "当晨光漫过窗沿",
      "请记得我们古老的歌",
      "即使走到辗转季节的尽头",
      "未能说出的心意仍在",
      "至少今天让我们慢慢走"
    ].join("\n"),
    translationEnabled: true,
    fontPreset: "source-han-serif",
    lyricFontSize: 64,
    translationScale: 0.82,
    lineHeight: 2.05,
    align: "left",
    anchorWidth: 1280,
    expected: { width: 920, height: 2140 },
    expectedByPlatform: { linux: { width: 940, height: 2140 } }
  },
  {
    id: "long-english-words",
    lyrics: [
      "pneumonoultramicroscopicsilicovolcanoconiosis keeps echoing after midnight",
      "antidisestablishmentarianism refuses every convenient little line break",
      "electroencephalographically written memories circle through the room",
      "counterrevolutionaries whisper incomprehensibilities into the rain"
    ].join("\n"),
    translationEnabled: false,
    fontPreset: "source-han-sans",
    lyricFontSize: 72,
    translationScale: 0.75,
    lineHeight: 1.5,
    align: "left",
    anchorWidth: 1040,
    expected: { width: 1440, height: 1820 }
  },
  {
    id: "mixed-cjk-latin-punctuation",
    lyrics: [
      "今夜 stay with me，直到最後一班 train。",
      "東京の雨、Seoul の灯、都落在眼底。",
      "괜찮아—我们还会再见, someday.",
      "把 unfinished story 写成新的序章。",
      "また明日；明天见；see you tomorrow."
    ].join("\n"),
    translationText: [
      "Stay until the last train tonight.",
      "Tokyo rain and Seoul lights fill our eyes.",
      "It is all right—we will meet again.",
      "Turn the unfinished story into a beginning.",
      "See you again tomorrow."
    ].join("\n"),
    translationEnabled: true,
    fontPreset: "source-han-serif",
    lyricFontSize: 52,
    translationScale: 0.9,
    lineHeight: 1.75,
    align: "center",
    anchorWidth: 1160,
    expected: { width: 960, height: 1900 }
  },
  {
    id: "translation-disabled-but-populated",
    lyrics: "First visible line\n\nSecond visible line\nThird visible line\nFourth visible line",
    translationText: "不会显示的译文一\n不会显示的译文二\n不会显示的译文三\n不会显示的译文四",
    translationEnabled: false,
    fontPreset: "source-han-sans",
    lyricFontSize: 44,
    translationScale: 0.88,
    lineHeight: 2.1,
    align: "left",
    anchorWidth: 1340,
    expected: { width: 740, height: 880 }
  },
  {
    id: "minimum-candidate-boundary",
    lyrics: "Hi\nGo\nNo",
    translationEnabled: false,
    fontPreset: "source-han-sans",
    lyricFontSize: 36,
    translationScale: 0.75,
    lineHeight: 1.5,
    align: "center",
    anchorWidth: 1440,
    expected: { width: 720, height: 640 }
  },
  {
    id: "maximum-candidate-boundary",
    lyrics: [
      "pneumonoultramicroscopicsilicovolcanoconiosispneumonoultramicroscopicsilicovolcanoconiosis",
      "antidisestablishmentarianismantidisestablishmentarianismantidisestablishmentarianism",
      "electroencephalographicallyelectroencephalographicallyelectroencephalographically"
    ].join("\n"),
    translationEnabled: false,
    fontPreset: "source-han-serif",
    lyricFontSize: 72,
    translationScale: 0.75,
    lineHeight: 1.5,
    align: "left",
    anchorWidth: 720,
    expected: { width: 1340, height: 1580 },
    expectedByPlatform: { linux: { width: 1060, height: 1880 } }
  }
];
// Captured from the verified 7d7b3fbc legacy implementation before replacing
// its 37 persistent LyricsBlock trees and per-unit Range sweep.
const legacyAutoWidth80LineCost = {
  candidateDomCount: 37,
  lineDomCount: 2_960,
  rangeQueries: 20_720
} as const;
// Chromium refuses several otherwise valid TCP ports. Retry allocation rather
// than treating a browser policy failure as an application regression.
const unsafeBrowserPorts = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179,
  389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601,
  636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566,
  6665, 6666, 6667, 6668, 6669, 6697, 10080
]);

let staticServer: Server;
let baseUrl = "";

test.beforeAll(async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    staticServer = createStaticServer();
    await new Promise<void>((resolve, reject) => {
      staticServer.once("error", reject);
      staticServer.listen(0, "127.0.0.1", () => resolve());
    });

    const address = staticServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Web Lite smoke server did not expose a TCP port.");
    }
    if (!unsafeBrowserPorts.has(address.port)) {
      baseUrl = `http://127.0.0.1:${address.port}`;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      staticServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
  throw new Error("Web Lite smoke server repeatedly received browser-restricted ports.");
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    staticServer.close((error) => (error ? reject(error) : resolve()));
  });
});

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Count only the 1x1 pixel reads used by export safety validation, leaving
  // normal canvas rendering behavior intact.
  await page.addInitScript(() => {
    const validationWindow = window as typeof window & { __webLiteValidationReads?: number };
    validationWindow.__webLiteValidationReads = 0;
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

    CanvasRenderingContext2D.prototype.getImageData = function (
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      settings?: ImageDataSettings
    ) {
      const result = originalGetImageData.call(this, sx, sy, sw, sh, settings);
      if (this.canvas.width === 1 && this.canvas.height === 1) {
        validationWindow.__webLiteValidationReads = (validationWindow.__webLiteValidationReads ?? 0) + 1;
      }
      return result;
    };
  });
  await page.addInitScript(
    ({ key }) => {
      if (!window.localStorage.getItem(key)) {
        window.localStorage.setItem(
          key,
          JSON.stringify({ version: 1, locale: "en", exportQuality: "high" })
        );
      }
    },
    { key: preferencesKey }
  );
});

test("axe reports no serious accessibility violations", async ({ page }) => {
  await openWebLite(page, { width: 1280, height: 900 });
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
  expect(serious).toEqual([]);
});

test("stays responsive at 360px, 768px, and 1440px", async ({ page }) => {
  const viewports = [
    { width: 360, height: 800 },
    { width: 768, height: 1024 },
    { width: 1440, height: 1000 }
  ];

  for (const viewport of viewports) {
    await test.step(`${viewport.width}px viewport`, async () => {
      await openWebLite(page, viewport);

      const desktopLink = page.getByTestId("web-lite-desktop-link");
      const repositoryLink = page.getByTestId("web-lite-repository-link");
      await expect(desktopLink).toBeVisible();
      await expect(desktopLink).toHaveAttribute(
        "href",
        "https://github.com/Qrzzzz/lyrics-card-generator/releases/latest"
      );
      await expect(desktopLink).toHaveAttribute("target", "_blank");
      await expect(repositoryLink).toBeVisible();
      await expect(repositoryLink).toHaveAttribute(
        "href",
        "https://github.com/Qrzzzz/lyrics-card-generator"
      );
      await expect(repositoryLink).toHaveAttribute("target", "_blank");

      for (const stepId of stepIds) {
        const step = page.locator(`[data-step-id="${stepId}"]`);
        await expect(step).toBeVisible();
        await step.click();
        await expect(step).toHaveAttribute("aria-current", "step");
        await expectNoHorizontalClipping(page);
      }

      if (viewport.width < 1024) {
        const previewPanel = page.locator('[data-workbench-panel="preview"]');
        const exportPanel = page.locator('[data-workbench-panel="export-settings"]');
        const editorPanel = page.locator('[data-workbench-panel="editor-settings"]');
        await expect(previewPanel).toBeVisible();
        await expect(exportPanel).toBeVisible();
        await expect(editorPanel).toBeHidden();
        const [previewBox, exportBox] = await Promise.all([previewPanel.boundingBox(), exportPanel.boundingBox()]);
        expect(previewBox && exportBox && previewBox.y < exportBox.y).toBe(true);
      }

      const previewToggle = page.getByTestId("preview-pane-toggle");
      if (viewport.width < 1024) {
        await expect(previewToggle).toBeVisible();
        await expect(previewToggle).toHaveAttribute("aria-expanded", "true");
        await previewToggle.click();
        await expect(previewToggle).toHaveAttribute("aria-expanded", "false");
        const previewContent = page.getByTestId("preview-pane-content");
        await expect(previewContent).toHaveAttribute("aria-hidden", "true");
        await expect(previewContent).toHaveCSS("height", "0px");
      } else {
        await expect(previewToggle).toBeHidden();
        await expect(page.getByTestId("preview-pane-content")).toHaveAttribute("aria-hidden", "false");
      }
    });
  }
});

test("pans the shared preview workbench in both directions and degrades pressure feedback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openWebLite(page, { width: 1280, height: 900 });

  const pressureStage = page.getByTestId("lyric-card-preview-pressure");
  await expect(pressureStage).toHaveAttribute("data-pressure-enabled", "false");
  await page.locator('[data-step-id="visual"]').click();
  await expect(pressureStage).toHaveAttribute("data-pressure-enabled", "true");

  const pressureBox = await pressureStage.boundingBox();
  if (!pressureBox) throw new Error("Web Lite pressure target is not visible.");
  const transformBeforeTouch = await pressureStage.locator(".preview-pressure-card").evaluate((element) => getComputedStyle(element).transform);
  await pressureStage.dispatchEvent("pointermove", {
    pointerId: 7,
    pointerType: "touch",
    isPrimary: true,
    clientX: pressureBox.x + pressureBox.width * 0.2,
    clientY: pressureBox.y + pressureBox.height * 0.2
  });
  await page.waitForTimeout(80);
  const touchTransform = await pressureStage.locator(".preview-pressure-card").evaluate((element) => getComputedStyle(element).transform);
  expect(touchTransform).toBe(transformBeforeTouch);

  await page.mouse.move(pressureBox.x + pressureBox.width * 0.2, pressureBox.y + pressureBox.height * 0.2);
  await expect.poll(async () => (
    pressureStage.locator(".preview-pressure-card").evaluate((element) => getComputedStyle(element).transform)
  )).toMatch(/^matrix3d\(/);

  const readGeometry = () => page.evaluate(() => {
    const rect = (selector: string) => {
      const value = document.querySelector(selector)?.getBoundingClientRect();
      return value ? { left: value.left, right: value.right, width: value.width } : null;
    };
    return {
      viewport: rect('[data-testid="preview-workbench-viewport"]'),
      editor: rect('[data-workbench-panel="editor-settings"]'),
      preview: rect('[data-workbench-panel="preview"]'),
      exportPanel: rect('[data-workbench-panel="export-settings"]')
    };
  });

  const resizer = page.getByTestId("preview-workbench-resizer");
  await resizer.focus();
  await page.keyboard.press("End");
  await expect.poll(async () => Number(
    await page.getByTestId("preview-workbench-viewport").getAttribute("data-settings-ratio")
  )).toBeGreaterThan(0.65);
  await expect.poll(async () => {
    const geometry = await readGeometry();
    return geometry.editor && geometry.preview ? geometry.editor.width - geometry.preview.width : 0;
  }).toBeGreaterThan(100);
  const resizerBox = await resizer.boundingBox();
  if (!resizerBox) throw new Error("Web Lite resize separator is not visible.");
  const before = await readGeometry();
  expect(before.viewport && before.editor && Math.abs(before.editor.left - before.viewport.left)).toBeLessThanOrEqual(2);
  expect(before.viewport && before.preview && Math.abs(before.preview.right - before.viewport.right)).toBeLessThanOrEqual(2);

  await page.locator('[data-step-id="export"]').click();
  await expect(page.getByTestId("preview-workbench-viewport")).toHaveAttribute("data-export-active", "true");
  await expect.poll(async () => {
    const geometry = await readGeometry();
    return geometry.viewport && geometry.preview ? Math.abs(geometry.preview.left - geometry.viewport.left) : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(2);
  const after = await readGeometry();
  expect(after.viewport && after.exportPanel && Math.abs(after.exportPanel.right - after.viewport.right)).toBeLessThanOrEqual(2);
  expect(after.preview && after.exportPanel && Math.abs(after.preview.width - after.exportPanel.width)).toBeLessThanOrEqual(2);
  expect(
    after.viewport && after.preview
      ? Math.abs(after.preview.width - (after.viewport.width - resizerBox.width) / 2)
      : Number.POSITIVE_INFINITY
  ).toBeLessThanOrEqual(2);

  await page.locator('[data-step-id="visual"]').click();
  await expect(page.getByTestId("preview-workbench-viewport")).toHaveAttribute("data-export-active", "false");
  await expect.poll(async () => {
    const geometry = await readGeometry();
    return geometry.viewport && geometry.editor ? Math.abs(geometry.editor.left - geometry.viewport.left) : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(2);
  const restored = await readGeometry();
  expect(restored.preview && before.preview && Math.abs(restored.preview.width - before.preview.width)).toBeLessThanOrEqual(2);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.locator('[data-step-id="visual"]').click();
  await expect(page.getByTestId("lyric-card-preview-pressure")).toHaveAttribute(
    "data-pressure-enabled",
    "false"
  );
});

test("exposes all four font schemes and persists all six languages, export format, and quality", async ({ page }) => {
  await openWebLite(page, { width: 1280, height: 900 });

  await page.locator('[data-step-id="font"]').click();
  const fontOptions = page.getByTestId("web-lite-font-options").locator("button[data-font-id]");
  await expect(fontOptions).toHaveCount(4);
  const serif = page.locator('[data-font-id="source-han-serif"]');
  await serif.click();
  await expect(serif).toHaveAttribute("aria-pressed", "true");

  const fontFaces = await page.evaluate(async () => {
    const families = ["Source Han Sans Heavy Local", "Source Han Serif Heavy Local"];
    await Promise.all(families.map((family) => document.fonts.load(`16px "${family}"`)));
    await document.fonts.ready;
    return families.map((family) => ({
      family,
      loaded: Array.from(document.fonts).some((face) => face.family === family && face.status === "loaded")
    }));
  });
  expect(fontFaces).toEqual([
    { family: "Source Han Sans Heavy Local", loaded: true },
    { family: "Source Han Serif Heavy Local", loaded: true }
  ]);

  await page.locator('[data-step-id="export"]').click();
  const standardQuality = page.locator('[data-segment-value="medium"]');
  await standardQuality.click();
  await expect(standardQuality).toHaveAttribute("aria-checked", "true");
  const webpFormat = page.locator('[data-segment-value="webp"]');
  await webpFormat.click();
  await expect(webpFormat).toHaveAttribute("aria-checked", "true");

  for (const [name, lang] of [
    ["简体中文", "zh-CN"],
    ["繁體中文", "zh-TW"],
    ["English", "en"],
    ["Français", "fr"],
    ["日本語", "ja"],
    ["Español", "es"]
  ] as const) {
    await page.getByRole("radio", { name, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
  }

  await page.getByRole("radio", { name: "简体中文", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.locator('[data-step-id="export"]').click();
  await expect(page.locator('[data-segment-value="medium"]')).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('[data-segment-value="webp"]')).toHaveAttribute("aria-checked", "true");
});

test("supports bilingual splitting, layout modes, instrumental mode, and visual toggles", async ({ page }) => {
  await openWebLite(page);

  await page.locator('[data-step-id="lyrics"]').click();
  const lyricText = page.getByLabel("Lyric Text", { exact: true });
  await lyricText.fill("君の名は\nI remember your name\n星空\nI love you tonight");
  await page.getByRole("button", { name: "Split Original / English Translation", exact: true }).click();
  await expect(lyricText).toHaveValue("君の名は\n星空");
  await expect(page.getByLabel("Translation", { exact: true })).toHaveValue(
    "I remember your name\nI love you tonight"
  );

  await page.locator('[data-step-id="layout"]').click();
  const landscape = page.locator('[data-segment-value="landscape"]');
  await landscape.click();
  await expect(landscape).toHaveAttribute("aria-checked", "true");
  const sizeMode = page.getByRole("radiogroup", { name: "Size Mode", exact: true });
  await sizeMode.getByRole("radio", { name: "Custom", exact: true }).click();
  const autoHeight = page.getByRole("switch", { name: "Auto Height", exact: true });
  await expect(autoHeight).toHaveAttribute("aria-checked", "true");
  await autoHeight.click();
  await expect(autoHeight).toHaveAttribute("aria-checked", "false");

  const instrumental = page.locator('[data-segment-value="instrumental"]');
  await instrumental.click();
  await expect(instrumental).toHaveAttribute("aria-checked", "true");
  await expect(landscape).toBeDisabled();
  await expect(sizeMode.getByRole("radio", { name: "1:1 Square", exact: true })).toBeDisabled();
  await expect(sizeMode.getByRole("radio", { name: "Custom", exact: true })).toBeDisabled();

  await page.locator('[data-segment-value="lyrics"]').click();
  await page.locator('[data-step-id="visual"]').click();
  const backgroundGrid = page.getByRole("switch", { name: "Background Grid", exact: true });
  await backgroundGrid.click();
  await expect(backgroundGrid).toHaveAttribute("aria-checked", "true");
  await page.locator('[data-segment-value="dense"]').click();
  await expect(page.locator('[data-segment-value="dense"]')).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Show Platform Logo", exact: true })).toHaveCount(0);
});

test("restores portrait custom size and auto height after landscape round trips", async ({ page }) => {
  await openWebLite(page);
  await page.locator('[data-step-id="layout"]').click();

  const portrait = page.locator('[data-segment-value="portrait"]');
  const landscape = page.locator('[data-segment-value="landscape"]');
  const sizeMode = page.getByRole("radiogroup", { name: "Size Mode", exact: true });
  const autoWidth = page.getByRole("switch", { name: "Auto Width", exact: true });
  const autoHeight = page.getByRole("switch", { name: "Auto Height", exact: true });
  const width = page.getByLabel("Width", { exact: true });
  const previewSection = page
    .getByRole("heading", { name: "Export Card Only", exact: true })
    .locator("xpath=ancestor::section[1]");
  const previewSize = previewSection.locator("span").filter({ hasText: /^\d+x\d+$/ }).first();
  const exportCard = page.locator('[data-export-card-host] [data-export-card="true"]');

  await expect(portrait).toHaveAttribute("aria-checked", "true");
  await expect(sizeMode.getByRole("radio", { name: "Custom", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(autoWidth).toHaveAttribute("aria-checked", "true");
  await autoWidth.click();
  await expect(autoWidth).toHaveAttribute("aria-checked", "false");
  await expect(autoHeight).toHaveAttribute("aria-checked", "true");
  await expect(width).toHaveValue("1040");
  await width.focus();
  for (let step = 0; step < 8; step += 1) {
    await width.press("ArrowRight");
  }
  await expect(width).toHaveValue("1200");

  for (const landscapeRatio of ["16:9", "21:9"]) {
    await landscape.click();
    await expect(landscape).toHaveAttribute("aria-checked", "true");
    const ratioLabel = landscapeRatio === "16:9" ? "16:9 Landscape" : "21:9 Ultrawide";
    const ratioOption = sizeMode.getByRole("radio", { name: ratioLabel, exact: true });
    await ratioOption.click();
    await expect(ratioOption).toHaveAttribute("aria-checked", "true");

    await portrait.click();
    await expect(portrait).toHaveAttribute("aria-checked", "true");
    await expect(sizeMode.getByRole("radio", { name: "Custom", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(autoHeight).toHaveAttribute("aria-checked", "true");
    await expect(width).toHaveValue("1200");
    await expect(previewSize).toHaveText(/^1200x\d+$/);
    await expect(previewSize).not.toHaveText("1080x1350");

    const [previewWidth, previewHeight] = (await previewSize.innerText()).split("x").map(Number);
    expect(previewWidth).toBe(1200);
    await expect(exportCard).toHaveCSS("width", `${previewWidth}px`);
    await expect(exportCard).toHaveCSS("height", `${previewHeight}px`);
    await expect(page.getByText(`${previewWidth} x ${previewHeight}`, { exact: true })).toBeVisible();
  }
});

test("auto width measures bilingual wrapping and settles on a comfortable portrait width", async ({ page }) => {
  await openWebLite(page);
  await page.locator('[data-step-id="lyrics"]').click();
  await page.getByLabel("Lyric Text", { exact: true }).fill([
    "Hold on to every little moment tonight",
    "Stay close until the morning finds us",
    "I still remember every word you said",
    "We can leave the lonely past behind"
  ].join("\n"));
  await page.getByRole("switch", { name: "Enable Translation", exact: true }).click();
  await page.getByLabel("Translation", { exact: true }).fill([
    "把今晚每一个细小而珍贵的瞬间都好好留在我们心里",
    "请陪在我身边直到清晨到来",
    "我仍然记得你说过的每一句话",
    "我们终于可以把孤独留在身后"
  ].join("\n"));

  await page.locator('[data-step-id="layout"]').click();
  const autoWidth = page.getByRole("switch", { name: "Auto Width", exact: true });
  const width = page.getByLabel("Width", { exact: true });
  await expect(autoWidth).toHaveAttribute("aria-checked", "true");
  await expect(width).toBeDisabled();
  await expect(page.locator("[data-auto-width-measurement-host]")).toHaveCount(1);

  const settledWidth = await waitForStableSliderValue(width);
  expect(settledWidth).toBeLessThanOrEqual(1200);
  expect(settledWidth % 20).toBe(0);

  const wrapMetrics = await measureAutoWidthWrapMetrics(page);
  expect(wrapMetrics.some((metric) => metric.kind === "lyric" && metric.visualLines > 1)).toBe(true);
  expect(wrapMetrics.some((metric) => metric.kind === "translation" && metric.visualLines > 1)).toBe(true);
  expect(wrapMetrics.filter((metric) => metric.severe)).toEqual([]);

  await page.locator('[data-step-id="export"]').click();
  await expect(page.getByTestId("complete-export-button")).toBeEnabled({ timeout: 5000 });

  await page.locator('[data-step-id="layout"]').click();
  await autoWidth.click();
  await expect(width).toBeEnabled();
  await expect(width).toHaveValue(String(settledWidth));
});

test("auto width calibrates every built-in example independently of the starting width", async ({ page }) => {
  await openWebLite(page);
  await page.getByRole("radio", { name: "简体中文", exact: true }).click();

  const lyricsStep = page.locator('[data-step-id="lyrics"]');
  const layoutStep = page.locator('[data-step-id="layout"]');
  await layoutStep.click();
  const lineHeight = page.getByRole("slider", { name: "行高", exact: true });
  await expect(lineHeight).toHaveAttribute("min", "1.5");
  await expect(lineHeight).toHaveAttribute("max", "2.1");
  await expect(lineHeight).toHaveAttribute("step", "0.05");
  await expect(lineHeight).toHaveValue("1.8");

  const autoWidth = page.getByRole("switch", { name: "自动宽度", exact: true });
  const width = page.getByRole("slider", { name: "宽度", exact: true });

  expect(Object.keys(expectedExampleAutoWidths).sort()).toEqual(EXAMPLE_SONGS.map((example) => example.id).sort());

  for (const example of EXAMPLE_SONGS) {
    await layoutStep.click();
    if (await autoWidth.getAttribute("aria-checked") === "true") {
      await autoWidth.click();
    }

    await lyricsStep.click();
    await page.getByRole("textbox", { name: "歌词文本", exact: true }).fill(example.lyrics);
    const translation = resolveExampleTranslation(example, "zh");
    const translationEnabled = example.translationEnabled && Boolean(translation.text.trim());
    const translationToggle = page.getByRole("switch", { name: "启用翻译", exact: true });
    if ((await translationToggle.getAttribute("aria-checked") === "true") !== translationEnabled) {
      await translationToggle.click();
    }
    if (translationEnabled) {
      await page.getByRole("textbox", { name: "翻译文本", exact: true }).fill(translation.text);
    }

    await layoutStep.click();
    const results: number[] = [];
    for (const key of ["Home", "End"] as const) {
      if (await autoWidth.getAttribute("aria-checked") === "true") {
        await autoWidth.click();
      }
      await width.focus();
      await width.press(key);
      await autoWidth.click();
      const expected = expectedExampleAutoWidths[example.id];
      await expect.poll(
        async () => {
          const value = Number(await width.inputValue());
          return value >= expected.min && value <= expected.max;
        },
        { message: `${example.id} settles inside its calibrated range after ${key}`, timeout: 10_000 }
      ).toBe(true);
      const settled = Number(await width.inputValue());
      results.push(settled);
    }

    expect(results[0], `${example.id} ignores its enabling width`).toBe(results[1]);
    const expected = expectedExampleAutoWidths[example.id];
    expect(results[0], `${example.id} stays inside its calibrated range`).toBeGreaterThanOrEqual(expected.min);
    expect(results[0], `${example.id} stays inside its calibrated range`).toBeLessThanOrEqual(expected.max);
    expect(results[0] % 20, `${example.id} uses a candidate width`).toBe(0);

    const wrapMetrics = await measureAutoWidthWrapMetrics(page);
    expect(wrapMetrics.filter((metric) => metric.kind === "lyric")).toHaveLength(effectiveLineCount(example.lyrics));
    expect(wrapMetrics.filter((metric) => metric.kind === "translation")).toHaveLength(
      translationEnabled ? effectiveLineCount(translation.text) : 0
    );
    expect(wrapMetrics.filter((metric) => metric.severe), `${example.id} leaves no severe orphan`).toEqual([]);
  }
});

test("auto width preserves the legacy choice for multilingual typography fixtures", async ({ browser }) => {
  test.setTimeout(180_000);

  for (const fixture of autoWidthEquivalenceFixtures) {
    await test.step(fixture.id, async () => {
      const context = await browser.newContext({ reducedMotion: "reduce" });
      await context.addInitScript(
        ({ key }) => {
          if (window.location.origin !== "null") {
            window.localStorage.setItem(
              key,
              JSON.stringify({ version: 1, locale: "en", exportQuality: "high" })
            );
          }
        },
        { key: preferencesKey }
      );
      const fixturePage = await context.newPage();
      try {
        await openWebLite(fixturePage);
        const result = await applyAutoWidthEquivalenceFixture(fixturePage, fixture);
        const expected = fixture.expectedByPlatform?.[process.platform] ?? fixture.expected;
        expect(result, `${fixture.id} matches the ${process.platform} legacy width and height`).toEqual(expected);
      } finally {
        await context.close();
      }
    });
  }
});

test("auto width retains the anchor until fonts are ready and then matches the legacy choice", async ({ page }) => {
  await page.addInitScript(() => {
    let releaseFontReady!: () => void;
    const controlledReady = new Promise<void>((resolve) => {
      releaseFontReady = resolve;
    });
    Object.defineProperty(document.fonts, "ready", {
      configurable: true,
      get: () => controlledReady
    });
    (window as typeof window & { __releaseAutoWidthFontReady?: () => void }).__releaseAutoWidthFontReady =
      releaseFontReady;
  });
  await openWebLite(page);

  const fixture = autoWidthEquivalenceFixtures.find(({ id }) => id === "japanese-with-translation");
  if (!fixture) throw new Error("Font readiness fixture is missing.");
  const controls = await prepareAutoWidthEquivalenceFixture(page, fixture);
  await controls.autoWidth.click();
  await page.waitForTimeout(700);
  await expect(controls.width).toHaveValue(String(fixture.anchorWidth));

  await page.evaluate(() => {
    (window as typeof window & { __releaseAutoWidthFontReady?: () => void }).__releaseAutoWidthFontReady?.();
  });
  const result = await readSettledAutoWidthResult(controls.width, controls.height);
  expect(result).toEqual(fixture.expected);
});

test("auto width reuses one candidate DOM and bounds geometry-query cost for 80 lines", async ({ page }) => {
  await page.addInitScript(() => {
    const measuredWindow = window as typeof window & { __autoWidthRangeQueries?: number };
    measuredWindow.__autoWidthRangeQueries = 0;
    const originalGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function () {
      measuredWindow.__autoWidthRangeQueries = (measuredWindow.__autoWidthRangeQueries ?? 0) + 1;
      return originalGetClientRects.call(this);
    };
  });
  await openWebLite(page);

  await page.locator('[data-step-id="lyrics"]').click();
  await page.getByLabel("Lyric Text", { exact: true }).fill(
    Array.from({ length: 80 }, (_, index) => `${index + 1} Stay close until morning finds us`).join("\n")
  );
  const host = page.locator("[data-auto-width-measurement-host]");
  await expect(host.locator("[data-auto-width-candidate]")).toHaveCount(1);
  await expect(host.locator("[data-auto-width-line]")).toHaveCount(80);

  await page.locator('[data-step-id="layout"]').click();
  const autoWidth = page.getByRole("switch", { name: "Auto Width", exact: true });
  if (await autoWidth.getAttribute("aria-checked") === "true") {
    await autoWidth.click();
  }
  await expect(host).toHaveCount(0);
  await page.evaluate(() => {
    (window as typeof window & { __autoWidthRangeQueries?: number }).__autoWidthRangeQueries = 0;
  });

  await autoWidth.click();
  await expect(host).toHaveCount(1);
  await expect(host.locator("[data-auto-width-candidate]")).toHaveCount(1);
  await expect(host.locator("[data-auto-width-line]")).toHaveCount(80);
  const settledWidth = await waitForStableSliderValue(page.getByLabel("Width", { exact: true }), 700, 30_000);
  const rangeQueries = await page.evaluate(
    () => (window as typeof window & { __autoWidthRangeQueries?: number }).__autoWidthRangeQueries ?? 0
  );
  const optimizedCost = {
    candidateDomCount: await host.locator("[data-auto-width-candidate]").count(),
    lineDomCount: await host.locator("[data-auto-width-line]").count(),
    rangeQueries
  };
  console.log(JSON.stringify({
    autoWidthPerformance: { legacy: legacyAutoWidth80LineCost, optimized: optimizedCost, settledWidth }
  }));
  expect(settledWidth).toBe(940);
  expect(optimizedCost.candidateDomCount).toBeLessThan(legacyAutoWidth80LineCost.candidateDomCount);
  expect(optimizedCost.lineDomCount).toBeLessThan(legacyAutoWidth80LineCost.lineDomCount);
  expect(rangeQueries).toBeLessThan(legacyAutoWidth80LineCost.rangeQueries / 3);
});

test("clears remote input and status after a successful remote cover", async ({ page }) => {
  await installRemoteCoverRoute(page);
  await openWebLite(page);

  await applyRemoteCover(page);
  await expect(page.getByTestId("web-lite-cover-status")).toContainText("safe to preview");
  await expect(page.getByTestId("web-lite-active-cover")).toHaveAttribute("src", remoteCoverUrl);

  await page.getByTestId("web-lite-clear-all-button").click();
  await expectEmptyCoverState(page);
});

test("keeps a successful remote URL when the song step remounts", async ({ page }) => {
  await installRemoteCoverRoute(page);
  await openWebLite(page);

  await applyRemoteCover(page);
  await expect(page.getByTestId("web-lite-cover-status")).toContainText("safe to preview");
  await page.locator('[data-step-id="lyrics"]').click();
  await page.locator('[data-step-id="song-info"]').click();
  await expect(page.getByTestId("web-lite-remote-cover-input")).toHaveValue(remoteCoverUrl);
  await expect(page.getByTestId("web-lite-active-cover")).toHaveAttribute("src", remoteCoverUrl);
});

test("ignores a remote cover that completes after clear", async ({ page }) => {
  // Delay the response to make the stale validation race deterministic.
  const gate = await installRemoteCoverRoute(page, true);
  await openWebLite(page);

  await applyRemoteCover(page);
  await gate.requestStarted;
  await expect(page.getByTestId("web-lite-cover-status")).toContainText("Checking whether");

  await page.getByTestId("web-lite-clear-all-button").click();
  await expectEmptyCoverState(page);
  gate.release();
  await gate.firstResponseFinished;
  await waitForValidationRead(page);
  await expectEmptyCoverState(page);
});

test("invalidates remote validation when the song step unmounts", async ({ page }) => {
  const gate = await installRemoteCoverRoute(page, true);
  await openWebLite(page);

  await applyRemoteCover(page);
  await gate.requestStarted;
  await page.locator('[data-step-id="lyrics"]').click();
  gate.release();
  await gate.firstResponseFinished;
  await waitForValidationRead(page);
  await page.locator('[data-step-id="song-info"]').click();
  await expectEmptyCoverState(page);
});

test("keeps a local cover when an older remote validation completes", async ({ page }) => {
  const gate = await installRemoteCoverRoute(page, true);
  await openWebLite(page);

  await applyRemoteCover(page);
  await gate.requestStarted;

  await page.getByTestId("web-lite-local-cover-input").setInputFiles({
    name: "local-cover.png",
    mimeType: "image/png",
    buffer: await localCoverBytesPromise
  });
  await expect(page.getByTestId("web-lite-remote-cover-input")).toHaveValue("");
  await expect(page.getByTestId("web-lite-cover-status")).toHaveCount(0);
  const localBlobUrl = await page.getByTestId("web-lite-active-cover").getAttribute("src");
  expect(localBlobUrl).toMatch(/^blob:/);

  gate.release();
  await gate.firstResponseFinished;
  await waitForValidationRead(page);
  await expect(page.getByTestId("web-lite-active-cover")).toHaveAttribute("src", localBlobUrl!);
  await expect(page.getByTestId("web-lite-remote-cover-input")).toHaveValue("");
  await expect(page.getByTestId("web-lite-cover-status")).toHaveCount(0);

  const blobStillReadable = await page.evaluate(async (url) => {
    const response = await fetch(url);
    return response.ok && (await response.blob()).size > 0;
  }, localBlobUrl!);
  expect(blobStillReadable).toBe(true);
});

test("exports a CORS-safe remote cover at standard and high pixel ratios", async ({ page }) => {
  test.setTimeout(120_000);
  await installRemoteCoverRoute(page);
  await openWebLite(page, { width: 1440, height: 1000 });

  await applyRemoteCover(page);
  await expect(page.getByTestId("web-lite-cover-status")).toContainText("safe to preview");

  await page.locator('[data-step-id="layout"]').click();
  await page
    .getByRole("radiogroup", { name: "Size Mode", exact: true })
    .getByRole("radio", { name: "1:1 Square", exact: true })
    .click();
  await expect(page.locator('[data-export-card-host] [data-export-card="true"]')).toHaveCSS("width", "1080px");
  await expect(page.locator('[data-export-card-host] [data-export-card="true"]')).toHaveCSS("height", "1080px");

  await page.locator('[data-step-id="export"]').click();
  await exportAndExpectDimensions(page, "medium", 1512, 1512);
  await exportAndExpectDimensions(page, "high", 2160, 2160);
});

test("exports WebP and JPG with matching filenames and file signatures", async ({ page }) => {
  test.setTimeout(120_000);
  await openWebLite(page, { width: 1280, height: 900 });
  await page.locator('[data-step-id="export"]').click();

  await exportAndExpectFormat(page, "webp");
  await exportAndExpectFormat(page, "jpg");
});

test("shares the 36/37 logical-line export boundary with desktop", async ({ page }) => {
  await openWebLite(page, { width: 1280, height: 900 });
  await page.locator('[data-step-id="lyrics"]').click();
  const lyricText = page.getByLabel("Lyric Text", { exact: true });
  const lines = (count: number) => Array.from({ length: count }, (_, index) => `Line ${index + 1}`).join("\n");

  await lyricText.fill(lines(36));
  await page.locator('[data-step-id="export"]').click();
  await expect(page.getByText(/36-line limit/i)).toHaveCount(0);

  await page.locator('[data-step-id="lyrics"]').click();
  await lyricText.fill(lines(37));
  await page.locator('[data-step-id="export"]').click();
  await expect(page.getByText(/37 non-empty lines.*36-line limit/i)).toBeVisible();
});

test("blocks real overflow on a fixed 1:1 export canvas", async ({ page }) => {
  await openWebLite(page, { width: 1280, height: 900 });
  await page.locator('[data-step-id="lyrics"]').click();
  await page.getByLabel("Lyric Text", { exact: true }).fill(
    Array.from({ length: 20 }, (_, index) => `${index + 1} ${"W".repeat(180)}`).join("\n")
  );
  await page.locator('[data-step-id="layout"]').click();
  await page
    .getByRole("radiogroup", { name: "Size Mode", exact: true })
    .getByRole("radio", { name: "1:1 Square", exact: true })
    .click();
  await page.locator('[data-step-id="export"]').click();
  await expect(page.getByText(/cannot contain all lyrics/i)).toBeVisible();
});

test("exports from the independent host while the visible preview is collapsed", async ({ page }) => {
  test.setTimeout(120_000);
  await openWebLite(page, { width: 768, height: 1024 });
  await page.locator('[data-step-id="lyrics"]').click();
  await page.getByLabel("Lyric Text", { exact: true }).fill("A stable line\nA second line");
  await page.locator('[data-step-id="layout"]').click();
  await page
    .getByRole("radiogroup", { name: "Size Mode", exact: true })
    .getByRole("radio", { name: "1:1 Square", exact: true })
    .click();
  const previewToggle = page.getByTestId("preview-pane-toggle");
  await previewToggle.click();
  await expect(page.getByTestId("preview-pane-content")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("[data-export-card-host]")).toHaveCount(1);

  await page.locator('[data-step-id="export"]').click();
  await exportAndExpectDimensions(page, "medium", 1512, 1512);
});

async function measureAutoWidthWrapMetrics(page: Page) {
  return page.locator('[data-export-card-host] [data-export-card="true"]').first().evaluate((root) => {
    return Array.from(root.querySelectorAll<HTMLElement>("[data-auto-width-line]")).map((line) => {
      const textNode = Array.from(line.childNodes).find((node): node is Text => node.nodeType === Node.TEXT_NODE);
      if (!textNode) return null;
      type Unit = { start: number; end: number; kind: "cjk" | "word"; text: string };
      const graphemes = Array.from(new Intl.Segmenter("und", { granularity: "grapheme" }).segment(textNode.data));
      const units: Unit[] = [];
      let pendingWord: Unit | null = null;
      const flushWord = () => {
        if (pendingWord) units.push(pendingWord);
        pendingWord = null;
      };
      for (const grapheme of graphemes) {
        const end = grapheme.index + grapheme.segment.length;
        if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(grapheme.segment)) {
          flushWord();
          units.push({ start: grapheme.index, end, kind: "cjk", text: grapheme.segment });
        } else if (/[\p{L}\p{N}]/u.test(grapheme.segment)) {
          if (pendingWord) {
            pendingWord.end = end;
            pendingWord.text += grapheme.segment;
          } else {
            pendingWord = { start: grapheme.index, end, kind: "word", text: grapheme.segment };
          }
        } else if (/^[’'\-‐‑]$/u.test(grapheme.segment) && pendingWord) {
          pendingWord.end = end;
          pendingWord.text += grapheme.segment;
        } else {
          flushWord();
          if (!/^\s+$/u.test(grapheme.segment) && units.length > 0) {
            const previous = units[units.length - 1];
            previous.end = end;
            previous.text += grapheme.segment;
          }
        }
      }
      flushWord();
      const range = document.createRange();
      const fragments: Array<{ top: number; left: number; right: number; index: number }> = [];
      units.forEach((unit, index) => {
        range.setStart(textNode, unit.start);
        range.setEnd(textNode, unit.end);
        Array.from(range.getClientRects()).forEach((rect) => {
          if (rect.width > 0) fragments.push({ top: rect.top, left: rect.left, right: rect.right, index });
        });
      });
      range.detach();
      const visualLines: Array<{
        top: number;
        left: number;
        right: number;
        indexes: Set<number>;
      }> = [];
      fragments.sort((left, right) => left.top - right.top || left.left - right.left).forEach((fragment) => {
        const visualLine = visualLines.find((candidate) => Math.abs(candidate.top - fragment.top) <= 2);
        if (visualLine) {
          visualLine.left = Math.min(visualLine.left, fragment.left);
          visualLine.right = Math.max(visualLine.right, fragment.right);
          visualLine.indexes.add(fragment.index);
        } else {
          visualLines.push({
            top: fragment.top,
            left: fragment.left,
            right: fragment.right,
            indexes: new Set([fragment.index])
          });
        }
      });
      const last = visualLines.at(-1);
      const lastFill = last ? (last.right - last.left) / Math.max(1, line.clientWidth) : 0;
      const lastUnits = last ? Array.from(last.indexes, (index) => units[index]) : [];
      const cjkCount = lastUnits.filter((unit) => unit.kind === "cjk").length;
      const wordUnits = lastUnits.filter((unit) => unit.kind === "word");
      const wordCharacterCount = wordUnits.reduce(
        (total, unit) => total + unit.text.replace(/[^\p{L}\p{N}]/gu, "").length,
        0
      );
      return {
        kind: line.dataset.autoWidthLine,
        visualLines: visualLines.length,
        lastUnits: lastUnits.length,
        lastFill,
        severe: visualLines.length > 1 && lastFill <= 0.3 && (
          (cjkCount > 0 && lastUnits.length <= 2) ||
          (cjkCount === 0 && wordUnits.length > 0 && wordUnits.length <= 2 && wordCharacterCount <= 14)
        )
      };
    }).filter((metric): metric is NonNullable<typeof metric> => metric !== null);
  });
}

async function applyAutoWidthEquivalenceFixture(page: Page, fixture: AutoWidthEquivalenceFixture) {
  const controls = await prepareAutoWidthEquivalenceFixture(page, fixture);
  await controls.autoWidth.click();
  return readSettledAutoWidthResult(controls.width, controls.height);
}

async function prepareAutoWidthEquivalenceFixture(page: Page, fixture: AutoWidthEquivalenceFixture) {
  const lyricsStep = page.locator('[data-step-id="lyrics"]');
  const layoutStep = page.locator('[data-step-id="layout"]');
  const fontStep = page.locator('[data-step-id="font"]');

  await layoutStep.click();
  const autoWidth = page.getByRole("switch", { name: "Auto Width", exact: true });
  if (await autoWidth.getAttribute("aria-checked") === "true") {
    await autoWidth.click();
  }
  const width = page.getByLabel("Width", { exact: true });
  const height = page.getByLabel("Height", { exact: true });
  await setRangeValue(width, fixture.anchorWidth);
  await setRangeValue(page.getByLabel("Font Size", { exact: true }), fixture.lyricFontSize);
  await setRangeValue(page.getByLabel("Line Height", { exact: true }), fixture.lineHeight);
  await page
    .getByRole("radiogroup", { name: "Alignment", exact: true })
    .getByRole("radio", { name: fixture.align === "center" ? "Center" : "Left", exact: true })
    .click();

  await fontStep.click();
  await page.locator(`[data-font-id="${fixture.fontPreset}"]`).click();

  await lyricsStep.click();
  await page.getByLabel("Lyric Text", { exact: true }).fill(fixture.lyrics);
  const translationToggle = page.getByRole("switch", { name: "Enable Translation", exact: true });
  if (fixture.translationText) {
    if (await translationToggle.getAttribute("aria-checked") !== "true") {
      await translationToggle.click();
    }
    await page.getByLabel("Translation", { exact: true }).fill(fixture.translationText);
  }
  if ((await translationToggle.getAttribute("aria-checked") === "true") !== fixture.translationEnabled) {
    await translationToggle.click();
  }

  await layoutStep.click();
  if (fixture.translationEnabled) {
    await setRangeValue(page.getByLabel("Translation Scale", { exact: true }), fixture.translationScale);
  }
  return { autoWidth, width, height };
}

async function readSettledAutoWidthResult(width: Locator, height: Locator) {
  const settledWidth = await waitForStableSliderValue(width, 700, 20_000);
  const settledHeight = await waitForStableSliderValue(height, 700, 20_000);
  return { width: settledWidth, height: settledHeight };
}

async function setRangeValue(locator: Locator, value: number) {
  await locator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, String(nextValue));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await expect(locator).toHaveValue(String(value));
}

function effectiveLineCount(value: string) {
  return value.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

async function openWebLite(page: Page, viewport = { width: 1280, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("web-lite-editor-surface")).toBeVisible();
}

async function applyRemoteCover(page: Page) {
  await page.getByTestId("web-lite-remote-cover-input").fill(remoteCoverUrl);
  await page.getByTestId("web-lite-apply-remote-cover").click();
}

async function expectEmptyCoverState(page: Page) {
  await expect(page.getByTestId("web-lite-remote-cover-input")).toHaveValue("");
  await expect(page.getByTestId("web-lite-cover-status")).toHaveCount(0);
  await expect(page.getByTestId("web-lite-active-cover")).toHaveCount(0);
  await expect(page.getByTestId("web-lite-apply-remote-cover")).toBeDisabled();
}

async function expectNoHorizontalClipping(page: Page) {
  const readAudit = () => page.getByTestId("web-lite-editor-surface").evaluate((surface) => {
    const viewportWidth = document.documentElement.clientWidth;
    const clippedControls = Array.from(
      surface.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]")
    )
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          !element.closest('[inert], [aria-hidden="true"]') &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      })
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > viewportWidth + 1;
      })
      .slice(0, 8)
      .map((element) => ({
        tag: element.tagName,
        testId: element.dataset.testid ?? "",
        text: (element.textContent ?? "").trim().slice(0, 80)
      }));

    return {
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      surfaceClientWidth: surface.clientWidth,
      surfaceScrollWidth: surface.scrollWidth,
      clippedControls
    };
  });

  await expect.poll(async () => (await readAudit()).clippedControls).toEqual([]);
  const audit = await readAudit();
  expect(audit.documentScrollWidth).toBeLessThanOrEqual(audit.documentClientWidth + 1);
  expect(audit.surfaceScrollWidth).toBeLessThanOrEqual(audit.surfaceClientWidth + 1);
}

async function waitForValidationRead(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { __webLiteValidationReads?: number }).__webLiteValidationReads ?? 0
      )
    )
    .toBeGreaterThanOrEqual(1);
}

async function installRemoteCoverRoute(page: Page, delayed = false) {
  const requestStarted = deferred<void>();
  const releaseResponse = deferred<void>();
  const firstResponseFinished = deferred<void>();
  const coverBytes = await localCoverBytesPromise;
  let firstRequest = true;

  await page.route(remoteCoverRequestPattern, async (route) => {
    const isFirstRequest = firstRequest;
    firstRequest = false;
    if (isFirstRequest) {
      requestStarted.resolve();
      if (delayed) {
        await releaseResponse.promise;
      }
    }

    await route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      },
      body: coverBytes
    });

    if (isFirstRequest) {
      firstResponseFinished.resolve();
    }
  });

  if (!delayed) {
    releaseResponse.resolve();
  }

  return {
    requestStarted: requestStarted.promise,
    firstResponseFinished: firstResponseFinished.promise,
    release: () => releaseResponse.resolve()
  };
}

async function exportAndExpectDimensions(page: Page, quality: "medium" | "high", width: number, height: number) {
  const qualityButton = page.locator(`[data-segment-value="${quality}"]`);
  await qualityButton.click();
  await expect(qualityButton).toHaveAttribute("aria-checked", "true");

  const exportButton = page.getByTestId("complete-export-button");
  await expect(exportButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  expect(await pngDimensions(download)).toEqual({ width, height });
  await expect(exportButton).toBeEnabled();
}

async function exportAndExpectFormat(page: Page, format: "webp" | "jpg") {
  const formatButton = page.locator(`[data-segment-value="${format}"]`);
  await formatButton.click();
  await expect(formatButton).toHaveAttribute("aria-checked", "true");

  const exportButton = page.getByTestId("complete-export-button");
  await expect(exportButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`, "i"));
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error(`Playwright did not expose the downloaded ${format} path.`);
  const image = await readFile(downloadPath);
  if (format === "webp") {
    expect(image.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(image.subarray(8, 12).toString("ascii")).toBe("WEBP");
  } else {
    expect(image.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  }
  await expect(exportButton).toBeEnabled();
}

async function pngDimensions(download: Download) {
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("Playwright did not expose the downloaded PNG path.");
  }

  const png = await readFile(downloadPath);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20)
  };
}

function deferred<T>() {
  let settled = false;
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value?: T) {
      if (!settled) {
        settled = true;
        resolvePromise(value as T);
      }
    }
  };
}

async function waitForStableSliderValue(locator: Locator, stableMs = 500, timeoutMs = 10_000) {
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

  throw new Error(`Slider value did not settle within ${timeoutMs}ms; last value: ${latest}`);
}

function createStaticServer() {
  const mimeTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".otf": "font/otf",
    ".png": "image/png"
  };

  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
      const filePath = path.resolve(projectRoot, relativePath);
      if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }

      const body = await readFile(filePath);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": body.byteLength,
        "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream"
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
}
