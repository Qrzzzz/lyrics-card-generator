import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const fullSurfaceKinds = ["examples", "history", "settings"] as const;
const allSurfaceKinds = [...fullSurfaceKinds, "ai", "export"] as const;
type SurfaceKind = (typeof allSurfaceKinds)[number];
type HarnessMode = "fail-first" | "success";

type BrowserHarness = {
  start: (mode: HarnessMode) => void;
  reject: (kind: SurfaceKind) => void;
  calls: (kind: SurfaceKind) => number;
};

let bundleDirectory = "";
let bundlePath = "";

test.beforeAll(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), "lyrics-card-deferred-surfaces-"));
  bundlePath = join(bundleDirectory, "fixture.js");
  await build({
    absWorkingDir: process.cwd(),
    bundle: true,
    define: {
      "process.env.NODE_ENV": '"test"'
    },
    entryPoints: [resolve("tests/deferred-surfaces/fixtures/deferred-surfaces.fixture.tsx")],
    format: "iife",
    jsx: "automatic",
    logLevel: "silent",
    outfile: bundlePath,
    platform: "browser",
    tsconfig: resolve("tsconfig.json")
  });
});

test.afterAll(async () => {
  if (bundleDirectory) await rm(bundleDirectory, { recursive: true, force: true });
});

for (const kind of fullSurfaceKinds) {
  test(`${kind} failure stays local, closes cleanly, retries a fresh loader, and preserves mounted state`, async ({ page }) => {
    const pageErrors = await loadHarness(page, "fail-first");
    await page.getByTestId(`${kind}-trigger`).click();
    await expect(page.getByTestId(`${kind}-surface-loading`)).toBeVisible();
    await expectLoaderCalls(page, kind, 1);

    await rejectLoader(page, kind);
    await expect(page.getByTestId(`${kind}-surface-error`)).toBeVisible();
    await expectActiveTestId(page, `${kind}-surface-error-retry`);
    await assertEditorRemainsUsable(page, 1);

    if (kind === "examples") await page.keyboard.press("Escape");
    else await page.getByTestId(`${kind}-surface-error-close`).click();
    await expectActiveTestId(page, `${kind}-trigger`);
    await page.getByTestId(`${kind}-trigger`).click();
    await expect(page.getByTestId(`${kind}-surface-error`)).toHaveAttribute("data-surface-state", "open");
    await page.getByTestId(`${kind}-surface-error-retry`).click();
    await expect(page.getByTestId(`${kind}-loaded`)).toBeVisible();
    await expectLoaderCalls(page, kind, 2);
    await expect(page.getByTestId(`${kind}-surface-error`)).toHaveCount(0);

    await page.getByTestId(`${kind}-loaded-increment`).click();
    await expect(page.getByTestId(`${kind}-loaded-state`)).toHaveText("1");
    await page.getByTestId(`${kind}-loaded-close`).click();
    await expectActiveTestId(page, `${kind}-trigger`);
    await page.getByTestId(`${kind}-trigger`).click();
    await expect(page.getByTestId(`${kind}-loaded-state`)).toHaveText("1");
    expect(pageErrors).toEqual([]);
  });
}

test("AI failure keeps translation state, back navigation, focus, and true retry", async ({ page }) => {
  const pageErrors = await loadHarness(page, "fail-first");
  await page.getByTestId("ai-trigger").click();
  await expect(page.getByTestId("ai-translate-panel-loading")).toBeVisible();
  await expectLoaderCalls(page, "ai", 1);

  await rejectLoader(page, "ai");
  await expect(page.getByTestId("ai-translate-panel-error")).toBeVisible();
  await expectActiveTestId(page, "ai-translate-panel-error-retry");
  await assertEditorRemainsUsable(page, 1);
  await page.getByTestId("lyrics-ai-page-back").click();
  await expectActiveTestId(page, "ai-trigger");

  await page.getByTestId("ai-trigger").click();
  await page.getByTestId("ai-translate-panel-error-retry").click();
  await expect(page.getByTestId("ai-loaded")).toBeVisible();
  await expect(page.getByTestId("ai-loaded")).toHaveAttribute("data-streaming-text", "streaming state kept");
  await expectLoaderCalls(page, "ai", 2);
  await page.getByTestId("ai-loaded-increment").click();
  await page.getByTestId("ai-loaded-close").click();
  await expectActiveTestId(page, "ai-trigger");
  await page.getByTestId("ai-trigger").click();
  await expect(page.getByTestId("ai-loaded-state")).toHaveText("1");
  expect(pageErrors).toEqual([]);
});

test("export failure keeps return navigation and readiness while retry calls the loader again", async ({ page }) => {
  const pageErrors = await loadHarness(page, "fail-first");
  await page.getByTestId("export-trigger").click();
  await expect(page.getByTestId("export-panel-loading")).toBeVisible();
  await expectLoaderCalls(page, "export", 1);

  await rejectLoader(page, "export");
  await expect(page.getByTestId("export-panel-error")).toBeVisible();
  await assertEditorRemainsUsable(page, 1);
  await page.getByTestId("export-return").click();
  await expectActiveTestId(page, "export-trigger");

  await page.getByTestId("export-trigger").click();
  await page.getByTestId("export-panel-error-retry").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("export-loaded")).toBeVisible();
  await expect(page.getByTestId("export-loaded")).toHaveAttribute("data-readiness-preserved", "true");
  await expectLoaderCalls(page, "export", 2);
  await page.getByTestId("export-loaded-increment").click();
  await page.getByTestId("export-return").click();
  await expectActiveTestId(page, "export-trigger");
  await page.getByTestId("export-trigger").click();
  await expect(page.getByTestId("export-loaded-state")).toHaveText("1");
  expect(pageErrors).toEqual([]);
});

test("a loader rejected after close stays isolated and never steals restored focus", async ({ page }) => {
  const pageErrors = await loadHarness(page, "fail-first");
  for (const kind of allSurfaceKinds) {
    await page.getByTestId(`${kind}-trigger`).click();
    await expect(page.getByTestId(loadingTestId(kind))).toBeVisible();
    await page.getByTestId(closeWhileLoadingTestId(kind)).click();
    await expectActiveTestId(page, `${kind}-trigger`);

    await rejectLoader(page, kind);
    await expect(page.getByTestId(errorTestId(kind))).toBeAttached();
    await expectActiveTestId(page, `${kind}-trigger`);
    await assertEditorRemainsUsable(page, allSurfaceKinds.indexOf(kind) + 1);

    await page.getByTestId(`${kind}-trigger`).click();
    await page.getByTestId(retryTestId(kind)).click();
    await expect(page.getByTestId(`${kind}-loaded`)).toBeVisible();
    await expectLoaderCalls(page, kind, 2);
    await closeLoadedSurface(page, kind);
  }
  expect(pageErrors).toEqual([]);
});

test("first-load success renders every deferred path without error UI or extra loader calls", async ({ page }) => {
  const pageErrors = await loadHarness(page, "success");
  for (const kind of allSurfaceKinds) {
    await page.getByTestId(`${kind}-trigger`).click();
    await expect(page.getByTestId(`${kind}-loaded`)).toBeVisible();
    await expectLoaderCalls(page, kind, 1);
    await expect(page.getByTestId(errorTestId(kind))).toHaveCount(0);
    await closeLoadedSurface(page, kind);
  }
  expect(pageErrors).toEqual([]);
});

async function loadHarness(page: Page, mode: HarnessMode) {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  await page.addScriptTag({ path: bundlePath });
  await page.evaluate((selectedMode) => {
    (window as unknown as { __deferredSurfaceHarness: BrowserHarness }).__deferredSurfaceHarness.start(selectedMode);
  }, mode);
  await expect(page.getByTestId("editor-main-action")).toBeVisible();
  return pageErrors;
}

async function rejectLoader(page: Page, kind: SurfaceKind) {
  await page.evaluate((selectedKind) => {
    (window as unknown as { __deferredSurfaceHarness: BrowserHarness }).__deferredSurfaceHarness.reject(selectedKind);
  }, kind);
}

async function expectLoaderCalls(page: Page, kind: SurfaceKind, expected: number) {
  await expect.poll(() => page.evaluate((selectedKind) => (
    (window as unknown as { __deferredSurfaceHarness: BrowserHarness }).__deferredSurfaceHarness.calls(selectedKind)
  ), kind)).toBe(expected);
}

async function expectActiveTestId(page: Page, testId: string) {
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe(testId);
}

async function assertEditorRemainsUsable(page: Page, expectedCount: number) {
  await page.getByTestId("editor-main-action").click();
  await expect(page.getByTestId("editor-main-count")).toHaveText(String(expectedCount));
}

function loadingTestId(kind: SurfaceKind) {
  if (kind === "ai") return "ai-translate-panel-loading";
  if (kind === "export") return "export-panel-loading";
  return `${kind}-surface-loading`;
}

function errorTestId(kind: SurfaceKind) {
  if (kind === "ai") return "ai-translate-panel-error";
  if (kind === "export") return "export-panel-error";
  return `${kind}-surface-error`;
}

function retryTestId(kind: SurfaceKind) {
  if (kind === "ai") return "ai-translate-panel-error-retry";
  if (kind === "export") return "export-panel-error-retry";
  return `${kind}-surface-error-retry`;
}

function closeWhileLoadingTestId(kind: SurfaceKind) {
  if (kind === "ai") return "lyrics-ai-page-back";
  if (kind === "export") return "export-return";
  return `${kind}-surface-loading-close`;
}

async function closeLoadedSurface(page: Page, kind: SurfaceKind) {
  if (kind === "export") await page.getByTestId("export-return").click();
  else await page.getByTestId(`${kind}-loaded-close`).click();
  await expectActiveTestId(page, `${kind}-trigger`);
}
