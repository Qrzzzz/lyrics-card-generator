import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Download, type Page } from "@playwright/test";

const projectRoot = process.cwd();
const localCoverBytesPromise = readFile(path.join(projectRoot, "public", "app-icon.png"));
const remoteCoverUrl = "https://covers.test/cover.png";
const remoteCoverRequestPattern = /^https:\/\/covers\.test\/cover\.png(?:\?.*)?$/;
const preferencesKey = "lyrics-card-web-lite-preferences-v1";
const stepIds = ["song-info", "lyrics", "layout", "font", "visual", "export"] as const;
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

test("exposes all four font schemes and persists language and export quality", async ({ page }) => {
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

  await page.getByRole("radio", { name: "中" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.locator('[data-step-id="export"]').click();
  await expect(page.locator('[data-segment-value="medium"]')).toHaveAttribute("aria-checked", "true");
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
  const autoHeight = page.getByRole("switch", { name: "Auto Height", exact: true });
  const width = page.getByLabel("Width", { exact: true });
  const previewSection = page
    .getByRole("heading", { name: "Export Card Only", exact: true })
    .locator("xpath=ancestor::section[1]");
  const previewSize = previewSection.locator("span").filter({ hasText: /^\d+x\d+$/ }).first();
  const exportCard = page.locator('[data-export-card-host] [data-export-card="true"]');

  await expect(portrait).toHaveAttribute("aria-checked", "true");
  await expect(sizeMode.getByRole("radio", { name: "Custom", exact: true })).toHaveAttribute("aria-checked", "true");
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
  const audit = await page.getByTestId("web-lite-editor-surface").evaluate((surface) => {
    const viewportWidth = document.documentElement.clientWidth;
    const clippedControls = Array.from(
      surface.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]")
    )
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
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

  expect(audit.documentScrollWidth).toBeLessThanOrEqual(audit.documentClientWidth + 1);
  expect(audit.surfaceScrollWidth).toBeLessThanOrEqual(audit.surfaceClientWidth + 1);
  expect(audit.clippedControls).toEqual([]);
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
