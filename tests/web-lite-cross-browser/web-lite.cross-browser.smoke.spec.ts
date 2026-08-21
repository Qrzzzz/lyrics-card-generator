import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Download, type Page } from "@playwright/test";

const projectRoot = process.cwd();
const siteRoot = path.join(projectRoot, "_site");
const preferencesKey = "lyrics-card-web-lite-preferences-v1";
const expectedFontPaths = [
  "/public/fonts/SourceHanSansSC-Heavy.otf",
  "/public/fonts/SourceHanSerifSC-Heavy.otf"
] as const;
const unsafeBrowserPorts = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179,
  389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601,
  636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566,
  6665, 6666, 6667, 6668, 6669, 6697, 10080
]);

let staticServer: Server;
let baseUrl = "";
let servedPaths: Set<string>;

test.beforeAll(async () => {
  await stat(path.join(siteRoot, "index.html"));
  for (const expectedFontPath of expectedFontPaths) {
    await stat(path.join(siteRoot, ...expectedFontPath.split("/").filter(Boolean)));
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    servedPaths = new Set<string>();
    staticServer = createStaticSiteServer(servedPaths);
    await new Promise<void>((resolve, reject) => {
      staticServer.once("error", reject);
      staticServer.listen(0, "127.0.0.1", () => resolve());
    });

    const address = staticServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Web Lite cross-browser server did not expose a TCP port.");
    }
    if (!unsafeBrowserPorts.has(address.port)) {
      baseUrl = `http://127.0.0.1:${address.port}`;
      return;
    }
    await closeServer(staticServer);
  }
  throw new Error("Web Lite cross-browser server repeatedly received browser-restricted ports.");
});

test.afterAll(async () => {
  await closeServer(staticServer);
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

function createStaticSiteServer(requestLog: Set<string>) {
  const mimeTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".otf": "font/otf",
    ".png": "image/png"
  };

  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
      const filePath = path.resolve(siteRoot, relativePath);
      if (filePath !== siteRoot && !filePath.startsWith(`${siteRoot}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }

      const body = await readFile(filePath);
      requestLog.add(requestUrl.pathname);
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

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
