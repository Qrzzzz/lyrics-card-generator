import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Server } from "node:http";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import AxeBuilder from "@axe-core/playwright";
import { startStaticServer, closeStaticServer } from "../helpers/static-test-server";

const baseline = process.env.SETTINGS_LAYOUT_BASELINE === "1";
const root = process.cwd();
const artifactDir = "output/playwright/v6.3.2";
const mode = baseline ? "baseline" : "candidate";
let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
  await mkdir(resolve(artifactDir), { recursive: true });
  const original = (file: string) => execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", maxBuffer: 2_000_000 });
  const css = baseline ? original("app/globals.css") : await readFile("app/globals.css", "utf8");
  const processed = await postcss([tailwindcss(resolve("tailwind.config.ts"))]).process(css, { from: resolve("app/globals.css") });
  await writeFile(resolve(artifactDir, `${mode}.css`), processed.css.replaceAll('/fonts/', '/public/fonts/'));
  const bundle = await build({
    entryPoints: [resolve("tests/deferred-surfaces/fixtures/settings-layout.fixture.tsx")],
    write: false, bundle: true, format: "iife", jsx: "automatic", logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: baseline ? [{ name: "baseline-source", setup(builder) {
      builder.onLoad({ filter: /(?:StylePanel|ColorControls|FontSchemePanel|controls)\.tsx$/ }, (args) => ({
        contents: original(args.path.slice(root.length + 1).replaceAll("\\", "/")), loader: "tsx"
      }));
    } }] : []
  });
  await writeFile(resolve(artifactDir, `${mode}.html`), `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Settings layout fixture</title><style>${processed.css.replaceAll('/fonts/', '/public/fonts/')}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`);
  ({ server, baseUrl } = await startStaticServer(root, "Settings layout"));
});

test.afterAll(async () => { await closeStaticServer(server); });

async function open(page: Page, locale = "en", theme = "dark") {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${baseUrl}/${artifactDir}/${mode}.html?locale=${locale}&theme=${theme}`);
  await expect(page.getByTestId("settings-fixture")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function width(page: Page, value: number) {
  await page.getByTestId("settings-fixture").evaluate((node, next) => { node.style.width = `${next}px`; }, value);
}

test("settings layout comparison screenshots", async ({ page }) => {
  const metrics: object[] = [];
  await open(page, "zh");
  for (const step of ["layout", "font", "visual"]) {
    await page.locator(`[data-step="${step}"]`).click();
    for (const size of [440, 640, 960]) {
      await width(page, size);
      await page.getByTestId("settings-fixture").screenshot({ path: `${artifactDir}/${mode}-${step}-${size}.png`, animations: "disabled" });
      metrics.push({ step, width: size, height: (await page.getByTestId("settings-fixture").boundingBox())?.height });
    }
  }
  await writeFile(resolve(artifactDir, `${mode}-metrics.json`), JSON.stringify(metrics, null, 2));
});

test("settings layout uses one stable grid across widths and six languages", async ({ page }) => {
  test.skip(baseline);
  test.setTimeout(120_000);
  for (const locale of ["zh", "zh-TW", "en", "fr", "ja", "es"]) {
    await open(page, locale);
    for (const step of ["layout", "font", "visual"]) {
      await page.locator(`[data-step="${step}"]`).click();
      const issues = await page.getByTestId("settings-fixture").evaluate((node) => {
        const widths = [...Array.from({ length: 103 }, (_, i) => 280 + i * 8), 507, 508, 509, 767, 768, 769, 1100];
        const errors: string[] = [];
        for (const w of widths) {
          node.style.width = `${w}px`;
          for (const grid of node.querySelectorAll<HTMLElement>(".editor-settings-grid")) {
            const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
            const expected = Math.max(1, Math.min(3, Math.floor((grid.getBoundingClientRect().width + 12) / 260)));
            if (columns !== expected) errors.push(`${w}: ${columns} columns, expected ${expected}`);
            const cells = [...grid.children].map((child) => child.getBoundingClientRect());
            for (let i = 1; i < cells.length; i++) {
              const prev = cells[i - 1], cell = cells[i];
              if (cell.top < prev.top - 1 || (Math.abs(cell.top - prev.top) < 1 && cell.left < prev.right - 1)) errors.push(`${w}: overlap/order`);
            }
          }
          for (const el of node.querySelectorAll<HTMLElement>(".editor-settings-field, .editor-font-option, .segmented-control__item, [role=switch]")) {
            if (el.clientWidth && el.scrollWidth > el.clientWidth + 1) errors.push(`${w}: overflow ${el.textContent?.slice(0, 50)}`);
          }
        }
        return errors.slice(0, 20);
      });
      expect(issues, `${locale} ${step}`).toEqual([]);
    }
  }
});

test("settings layout preserves values, focus and font draft when resized", async ({ page }) => {
  test.skip(baseline);
  await open(page);
  const fontSize = page.getByRole("slider", { name: "Font Size", exact: true });
  await fontSize.focus();
  await fontSize.press("ArrowRight");
  const state = await page.getByTestId("settings-state").textContent();
  for (const w of [440, 508, 768, 960, 280]) {
    await width(page, w);
    await expect(fontSize).toBeFocused();
    await expect(page.getByTestId("settings-state")).toHaveText(state!);
  }
  await page.locator('[data-step="font"]').click();
  await page.getByTestId("edit-custom-font-scheme").click();
  await page.getByTestId("font-picker-category-latin").click();
  await page.getByTestId("font-picker-search").fill("Arial");
  const options = page.getByTestId("font-picker-results").getByRole("button");
  await options.first().click();
  await expect(page.getByTestId("font-picker-scheme")).toHaveAttribute("data-dirty", "true");
  const query = page.getByTestId("font-picker-search");
  await query.focus();
  for (const w of [960, 508, 280, 768]) {
    await width(page, w);
    await expect(query).toBeFocused();
    await expect(query).toHaveValue("Arial");
    await expect(page.getByTestId("font-picker-scheme")).toHaveAttribute("data-dirty", "true");
    await expect(page.getByTestId("settings-state")).toHaveText(state!);
  }
  await page.getByTestId("cancel-custom-font-scheme").click();
  await expect(page.getByTestId("edit-custom-font-scheme")).toBeFocused();
  await expect(page.getByTestId("settings-state")).toHaveText(state!);
  await page.getByTestId("edit-custom-font-scheme").click();
  await page.getByTestId("font-picker-category-latin").click();
  await page.getByTestId("font-picker-search").fill("Arial");
  await page.getByTestId("font-picker-results").getByRole("button").first().click();
  await width(page, 440);
  await page.getByTestId("save-custom-font-scheme").click();
  await expect(page.getByTestId("edit-custom-font-scheme")).toBeFocused();
  expect(JSON.parse((await page.getByTestId("settings-state").textContent())!).style.fontScheme.latinFontFamily).toBe("Arial");
});

test("settings layout themes, narrow font editor and accessibility", async ({ page }) => {
  test.skip(baseline);
  test.setTimeout(120_000);
  for (const theme of ["dark", "light", "dark-acrylic", "light-acrylic"]) {
    await open(page, "fr", theme);
    for (const step of ["layout", "font", "visual"]) {
      await page.locator(`[data-step="${step}"]`).click();
      await width(page, 508);
      const result = await new AxeBuilder({ page }).include('[data-testid="settings-fixture"]').analyze();
      expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), `${theme} ${step}`).toEqual([]);
      await page.getByTestId("settings-fixture").screenshot({ path: `${artifactDir}/${theme}-${step}.png`, animations: "disabled" });
    }
    await page.locator('[data-step="font"]').click();
    await page.getByTestId("edit-custom-font-scheme").click();
    const editorAxe = await new AxeBuilder({ page }).include('[data-testid="settings-fixture"]').analyze();
    expect(editorAxe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), `${theme} font editor`).toEqual([]);
    await page.setViewportSize({ width: 320, height: 568 });
    await width(page, 280);
    const buttons = page.getByTestId("font-picker-scheme").locator("button");
    expect(await buttons.evaluateAll((nodes) => nodes.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent))).toEqual([]);
    await page.getByTestId("font-picker-scheme").screenshot({ path: `${artifactDir}/${theme}-font-editor-280.png`, animations: "disabled" });
    await page.getByTestId("cancel-custom-font-scheme").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("cancel-custom-font-scheme")).toBeInViewport();
  }
});

test("settings grid follows enlarged root text without changing the field order", async ({ page }) => {
  test.skip(baseline);
  await open(page);
  for (const rootSize of [16, 20, 24, 32]) {
    await page.evaluate((size) => { document.documentElement.style.fontSize = `${size}px`; }, rootSize);
    for (const w of [440, 640, 768, 960]) {
      await width(page, w);
      const columns = await page.getByTestId("layout-settings-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      expect(columns).toBe(Math.max(1, Math.min(3, Math.floor((w + 0.75 * rootSize) / (16.25 * rootSize)))));
    }
  }
});
