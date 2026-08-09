import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, mkdir, access } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coverPath = path.join(projectRoot, "docs", "readme-assets", "source", "galaxy-cover.webp");
const outputDirectory = path.join(projectRoot, "docs", "readme-assets", "cards");
const lineHeight = 1.7;
const artist = "Aster Vale";

const lyrics = {
  zhCN: [
    "暮色沉入海",
    "银河缓缓舒展",
    "星辰从不问去处",
    "我们走过寂静长夜",
    "遥光渐成金"
  ],
  zhTW: [
    "暮色沉入海",
    "銀河緩緩舒展",
    "星辰從不問去處",
    "我們走過寂靜長夜",
    "遙光漸成金"
  ],
  en: [
    "Twilight sinks into the sea",
    "The quiet galaxy slowly unfolds",
    "No star asks where we are going",
    "Together, we cross the long and silent night",
    "Far light turns slowly to gold"
  ],
  fr: [
    "Le soir s'enfonce dans la mer",
    "La galaxie silencieuse se déploie",
    "Nulle étoile ne demande où nous allons",
    "Ensemble, nous traversons la longue nuit silencieuse",
    "Au loin, la lumière devient or"
  ],
  ja: [
    "暮色は海へ",
    "銀河はひらく",
    "星は行方を問わず",
    "ともに夜を渡る",
    "遠い光は金色に"
  ],
  es: [
    "El crepúsculo se hunde en el mar",
    "La galaxia silenciosa se abre despacio",
    "Ninguna estrella pregunta adónde vamos",
    "Juntos cruzamos la larga y silenciosa noche",
    "La luz lejana se vuelve oro"
  ]
};

const metadata = {
  zhCN: { title: "最远的光", album: "天光未醒" },
  zhTW: { title: "最遠的光", album: "天光未醒" },
  en: { title: "The Farthest Light", album: "Before Daybreak" },
  enCompact: { title: "Far Light", album: "Before Daybreak" },
  fr: { title: "Lueur lointaine", album: "Avant l'aube" },
  ja: { title: "遠い光", album: "夜明け前" },
  es: { title: "La luz lejana", album: "Antes del alba" }
};

const cards = [
  card("zh-CN.single", "zhCN", "zhCN", null, 60),
  card("zh-CN.bilingual", "enCompact", "en", "zhCN", 48, 0.72),
  card("zh-TW.single", "zhTW", "zhTW", null, 60),
  card("zh-TW.bilingual", "enCompact", "en", "zhTW", 48, 0.72),
  card("en.single", "en", "en", null, 68),
  card("en.bilingual", "ja", "ja", "en", 56, 0.7),
  card("fr.single", "fr", "fr", null, 64),
  card("fr.bilingual", "enCompact", "en", "fr", 46, 0.68),
  card("ja.single", "ja", "ja", null, 60),
  card("ja.bilingual", "enCompact", "en", "ja", 46, 0.76),
  card("es.single", "es", "es", null, 72),
  card("es.bilingual", "enCompact", "en", "es", 58, 0.82)
];

function card(id, metadataLocale, lyricLocale, translationLocale, fontSize, translationScale = 0.75) {
  return {
    id,
    metadata: metadata[metadataLocale],
    lyrics: lyrics[lyricLocale],
    translation: translationLocale ? lyrics[translationLocale] : null,
    fontSize,
    translationScale
  };
}

async function fillExact(locator, value) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await locator.fill(value);
    await locator.page().waitForTimeout(80);
    if (await locator.inputValue() === value) return;
  }
  assert.equal(await locator.inputValue(), value);
}

async function setRange(locator, value) {
  const min = Number(await locator.getAttribute("min"));
  const max = Number(await locator.getAttribute("max"));
  const step = Number(await locator.getAttribute("step") ?? "1");
  assert.ok(value >= min && value <= max, `${value} is outside ${min}-${max}`);
  const presses = Math.round((value - min) / step);
  await locator.focus();
  await locator.press("Home");
  for (let index = 0; index < presses; index += 1) await locator.press("ArrowRight");
  assert.ok(Math.abs(Number(await locator.inputValue()) - value) < 1e-8);
}

async function ensureSwitch(locator, checked) {
  if ((await locator.getAttribute("aria-checked")) !== String(checked)) await locator.click();
  assert.equal(await locator.getAttribute("aria-checked"), String(checked));
}

async function waitForStableAutoSize(page) {
  const width = page.locator('input[type="range"][aria-label="宽度"]');
  const height = page.locator('input[type="range"][aria-label="高度"]');
  const deadline = Date.now() + 20_000;
  let previous = "";
  let stableSince = 0;
  while (Date.now() < deadline) {
    const current = `${await width.inputValue()}x${await height.inputValue()}`;
    if (current === previous) {
      if (stableSince === 0) stableSince = Date.now();
      if (Date.now() - stableSince >= 800) {
        const [settledWidth, settledHeight] = current.split("x").map(Number);
        return { width: settledWidth, height: settledHeight };
      }
    } else {
      previous = current;
      stableSince = 0;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Automatic card size did not settle; last observed ${previous}.`);
}

async function renderCard(browser, baseUrl, coverBytes, fixture) {
  const context = await browser.newContext({
    acceptDownloads: true,
    colorScheme: "dark",
    locale: "zh-CN",
    viewport: { width: 1600, height: 1000 }
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.stack || error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.route("**/__readme_cover.webp*", (route) => route.fulfill({
    status: 200,
    contentType: "image/webp",
    headers: { "Cache-Control": "no-store" },
    body: coverBytes
  }));

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const firstLaunch = page.getByTestId("first-launch-language-dialog");
    await firstLaunch.waitFor({ state: "visible", timeout: 30_000 });
    await page.locator('[data-testid="first-launch-language"][data-locale="zh"]').click();
    await firstLaunch.waitFor({ state: "hidden", timeout: 15_000 });

    await page.getByTestId("song-info-toggle").click();
    const editor = page.getByTestId("song-info-editor");
    await editor.waitFor({ state: "visible" });
    const textInputs = editor.locator('input:not([type="file"])');
    assert.ok(await textInputs.count() >= 4, "song metadata editor exposes four text inputs");
    await fillExact(textInputs.nth(0), fixture.metadata.title);
    await fillExact(textInputs.nth(1), artist);
    await fillExact(textInputs.nth(2), fixture.metadata.album);
    await fillExact(textInputs.nth(3), `${baseUrl}/__readme_cover.webp`);
    const saveButton = editor.getByTestId("song-info-save");
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="song-info-save"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    await saveButton.click();
    await page.getByTestId("song-info-summary").waitFor({ state: "visible" });

    await page.locator('button[data-step-id="lyrics"]').click();
    const original = page.getByTestId("lyrics-editor-original");
    await original.waitFor({ state: "visible" });
    await fillExact(original, fixture.lyrics.join("\n"));
    if (fixture.translation) {
      await page.getByTestId("lyrics-sidebar-tab-translation").click();
      const translationToggle = page.getByTestId("translation-toggle");
      await ensureSwitch(translationToggle, true);
      const translation = page.getByTestId("lyrics-editor-translation");
      await translation.waitFor({ state: "visible" });
      await fillExact(translation, fixture.translation.join("\n"));
    }

    await page.locator('button[data-step-id="layout"]').click();
    const layoutGrid = page.getByTestId("layout-settings-grid");
    await layoutGrid.waitFor({ state: "visible" });
    const custom = layoutGrid.locator('[data-segment-value="custom"]');
    if (await custom.getAttribute("aria-checked") !== "true") await custom.click();
    const switches = layoutGrid.getByRole("switch");
    assert.equal(await switches.count(), 2);
    await ensureSwitch(switches.nth(0), true);
    await ensureSwitch(switches.nth(1), true);
    await setRange(page.locator('input[type="range"][aria-label="字号"]'), fixture.fontSize);
    await setRange(page.locator('input[type="range"][aria-label="行高"]'), lineHeight);
    if (fixture.translation) {
      await setRange(page.locator('input[type="range"][aria-label="译文字号比例"]'), fixture.translationScale);
    }

    await page.locator('button[data-step-id="font"]').click();
    const serif = page.getByTestId("apply-font-preset-source-han-serif");
    await serif.waitFor({ state: "visible" });
    await serif.click();

    await page.locator('button[data-step-id="layout"]').click();
    await layoutGrid.waitFor({ state: "visible" });
    const canvas = await waitForStableAutoSize(page);
    assert.ok(canvas.height >= canvas.width * 1.1, `${fixture.id} must remain clearly portrait, got ${canvas.width}x${canvas.height}`);

    await page.locator('button[data-step-id="export"]').click();
    const exportPanel = page.locator('[data-testid="export-settings-panel"][data-active="true"]');
    await exportPanel.locator('[data-segment-value="webp"]').click();
    await exportPanel.locator('[data-segment-value="high"]').click();
    const exportButton = exportPanel.getByTestId("complete-export-button");
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="export-settings-panel"][data-active="true"]');
      const button = panel?.querySelector('[data-testid="complete-export-button"]');
      return document.fonts.status === "loaded" && button instanceof HTMLButtonElement && !button.disabled;
    }, undefined, { timeout: 30_000 });
    await page.waitForTimeout(500);

    const outputPath = path.join(outputDirectory, `${fixture.id}.webp`);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      exportButton.click()
    ]);
    await download.saveAs(outputPath);
    const image = await sharp(outputPath).metadata();
    assert.equal(image.format, "webp");
    assert.ok(image.height >= image.width * 1.1);
    if (browserErrors.length > 0) {
      throw new Error(`${fixture.id} emitted browser errors:\n${browserErrors.join("\n")}`);
    }
    return {
      id: fixture.id,
      canvas: `${canvas.width}x${canvas.height}`,
      output: `${image.width}x${image.height}`,
      fontSize: fixture.fontSize,
      translationScale: fixture.translation ? fixture.translationScale : null
    };
  } finally {
    await context.close();
  }
}

async function findAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  assert.ok(port > 0);
  return port;
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`README media server exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${baseUrl}.`);
}

async function startServer() {
  if (process.env.README_MEDIA_BASE_URL) {
    return { baseUrl: process.env.README_MEDIA_BASE_URL.replace(/\/$/, ""), stop: async () => undefined };
  }

  await access(path.join(projectRoot, ".next", "BUILD_ID"));
  const port = await findAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: projectRoot,
    env: { ...process.env, CI: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let log = "";
  const appendLog = (chunk) => {
    log = `${log}${chunk}`.slice(-12_000);
  };
  child.stdout.on("data", appendLog);
  child.stderr.on("data", appendLog);
  try {
    await waitForServer(baseUrl, child);
  } catch (error) {
    child.kill();
    throw new Error(`${error.message}\n${log}`);
  }
  return {
    baseUrl,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill();
      await Promise.race([
        once(child, "exit"),
        new Promise((resolve) => setTimeout(resolve, 5_000))
      ]);
    }
  };
}

await mkdir(outputDirectory, { recursive: true });
const coverBytes = await readFile(coverPath);
const server = await startServer();
const browser = await chromium.launch({ headless: true });

try {
  const results = [];
  const filter = process.env.README_MEDIA_FILTER?.trim();
  const selectedCards = filter ? cards.filter((fixture) => fixture.id.includes(filter)) : cards;
  assert.ok(selectedCards.length > 0, `No README media fixture matched ${filter}.`);
  for (const fixture of selectedCards) {
    const result = await renderCard(browser, server.baseUrl, coverBytes, fixture);
    results.push(result);
    process.stdout.write(`${fixture.id}: ${result.canvas} -> ${result.output}\n`);
  }
  process.stdout.write(`${JSON.stringify({ lineHeight, autoWidth: true, autoHeight: true, results }, null, 2)}\n`);
} finally {
  await browser.close();
  await server.stop();
}
