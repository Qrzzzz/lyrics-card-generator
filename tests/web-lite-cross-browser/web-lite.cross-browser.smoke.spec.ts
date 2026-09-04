import type { Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Download, type Page } from "@playwright/test";
import { closeStaticServer, startStaticServer } from "../helpers/static-test-server";

const projectRoot = process.cwd();
const siteRoot = path.join(projectRoot, "_site");
const preferencesKey = "lyrics-card-web-lite-preferences-v1";
const expectedFontPaths = [
  "/public/fonts/SourceHanSansSC-Heavy.otf",
  "/public/fonts/SourceHanSerifSC-Heavy.otf"
] as const;
let staticServer: Server;
let baseUrl = "";
let servedPaths: Set<string>;

test.beforeAll(async () => {
  await stat(path.join(siteRoot, "index.html"));
  for (const expectedFontPath of expectedFontPaths) {
    await stat(path.join(siteRoot, ...expectedFontPath.split("/").filter(Boolean)));
  }

  servedPaths = new Set<string>();
  ({ server: staticServer, baseUrl } = await startStaticServer(siteRoot, "Web Lite cross-browser", servedPaths));
});

test.afterAll(async () => {
  await closeStaticServer(staticServer);
});

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({ version: 1, locale: "en", exportFormat: "png", exportQuality: "medium" })
      );
    },
    { key: preferencesKey }
  );
});

test("starts, edits, previews, loads bundled fonts, selects a local cover, and downloads PNG", async ({ page }) => {
  const fontResponses = new Map<string, { origin: string; status: number }>();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (expectedFontPaths.includes(url.pathname as (typeof expectedFontPaths)[number])) {
      fontResponses.set(url.pathname, { origin: url.origin, status: response.status() });
    }
  });

  await openWebLite(page);
  await page.locator('[data-step-id="lyrics"]').click();
  const lyricText = page.getByLabel("Lyric Text", { exact: true });
  await lyricText.fill("Cross-browser local light\nFirefox and WebKit render this preview");
  await expect(lyricText).toHaveValue("Cross-browser local light\nFirefox and WebKit render this preview");
  await expect(page.getByTestId("lyric-card-preview")).toContainText("Cross-browser local light");

  await page.locator('[data-step-id="font"]').click();
  await page.locator('[data-font-id="source-han-serif"]').click();
  const fontReadiness = await page.evaluate(async () => {
    const families = ["Source Han Sans Heavy Local", "Source Han Serif Heavy Local"];
    await Promise.all(families.map((family) => document.fonts.load(`16px "${family}"`, "跨浏览器")));
    await document.fonts.ready;
    return {
      status: document.fonts.status,
      families: families.map((family) => ({
        family,
        ready: document.fonts.check(`16px "${family}"`, "跨浏览器")
      }))
    };
  });
  expect(fontReadiness).toEqual({
    status: "loaded",
    families: [
      { family: "Source Han Sans Heavy Local", ready: true },
      { family: "Source Han Serif Heavy Local", ready: true }
    ]
  });
  for (const expectedFontPath of expectedFontPaths) {
    expect(servedPaths.has(expectedFontPath)).toBe(true);
    expect(fontResponses.get(expectedFontPath)).toEqual({ origin: baseUrl, status: 200 });
  }

  await page.locator('[data-step-id="song-info"]').click();
  const localCover = await readFile(path.join(siteRoot, "public", "app-icon.png"));
  await page.getByTestId("web-lite-local-cover-input").setInputFiles({
    name: "cross-browser-local-cover.png",
    mimeType: "image/png",
    buffer: localCover
  });
  const cover = page.getByTestId("web-lite-active-cover");
  await expect(cover).toHaveAttribute("src", /^blob:/);
  await expect(page.getByTestId("lyric-card-preview").locator("img").first()).toBeVisible();

  await page.locator('[data-step-id="export"]').click();
  const pngFormat = page.locator('[data-segment-value="png"]');
  await pngFormat.click();
  await expect(pngFormat).toHaveAttribute("aria-checked", "true");
  const exportButton = page.getByTestId("complete-export-button");
  await expect(exportButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  await expectPngDownload(download);
  await expect(exportButton).toBeEnabled();
});

async function openWebLite(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("web-lite-editor-surface")).toBeVisible();
  await expect(page.getByTestId("lyric-card-preview")).toBeVisible();
}

async function expectPngDownload(download: Download) {
  expect(download.suggestedFilename()).toMatch(/\.png$/i);
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Playwright did not expose the downloaded PNG path.");
  const png = await readFile(downloadPath);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(png.readUInt32BE(16)).toBeGreaterThan(0);
  expect(png.readUInt32BE(20)).toBeGreaterThan(0);
}
