import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ImportRaceHarness } from "./fixtures/import-preparation.fixture";

declare global { interface Window { __importRace: ImportRaceHarness; } }
let directory = "";
let bundle = "";
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "lyrics-card-import-race-"));
  bundle = join(directory, "fixture.js");
  await build({
    absWorkingDir: process.cwd(), bundle: true, define: { "process.env.NODE_ENV": '"test"' },
    entryPoints: [resolve("tests/deferred-surfaces/fixtures/import-preparation.fixture.tsx")],
    format: "iife", jsx: "automatic", logLevel: "silent", outfile: bundle, platform: "browser", tsconfig: resolve("tsconfig.json")
  });
});
test.afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

async function load(page: Page) {
  await page.setContent('<!doctype html><div id="root"></div>');
  await page.addScriptTag({ path: bundle });
  await page.evaluate(() => window.__importRace.start());
  await expect(page.getByTestId("ready")).toHaveText("true");
}
const snapshot = (page: Page) => page.evaluate(() => window.__importRace.snapshot());

for (const kind of ["url", "lyrics", "document"] as const) {
  test(`editing ${kind} during real autosave flush invalidates link import`, async ({ page }) => {
    await load(page);
    await page.getByRole("button", { name: "Parse", exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).writes.length).toBe(1);
    await expect(page.getByTestId("pending")).toHaveText("true");
    await expect(page.getByRole("button", { name: "Parsing", exact: false })).toBeDisabled();
    await page.evaluate((edit) => window.__importRace.edit(edit), kind);
    await page.evaluate(() => window.__importRace.releaseWrites());
    await expect(page.getByRole("button", { name: "Parse", exact: true })).toBeEnabled();
    const result = await snapshot(page);
    expect(result.requests).toEqual([]);
    expect(result.lyrics).toBe(kind === "lyrics" ? "NEW LYRICS DURING WAIT" : "ORIGINAL LYRICS");
    if (kind === "lyrics") expect(result.writes).toContain("NEW LYRICS DURING WAIT");
    if (kind === "document") expect(result.title).toBe("New document");
  });
}

test("confirmation binds revision before awaiting the user", async ({ page }) => {
  await load(page);
  await page.evaluate(() => { window.__importRace.deferConfirmations(); window.__importRace.begin("history-replay"); });
  await expect.poll(async () => (await snapshot(page)).confirmations).toBe(1);
  await page.evaluate(() => window.__importRace.edit("lyrics"));
  await page.evaluate(() => window.__importRace.confirm(0, true));
  await expect.poll(async () => (await snapshot(page)).outcomes).toEqual([null]);
  expect((await snapshot(page)).lyrics).toBe("NEW LYRICS DURING WAIT");
});

for (const phase of ["confirmation", "flush"] as const) {
  test(`newest import owns out-of-order ${phase} completion`, async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__importRace.deferConfirmations());
    await page.evaluate(() => window.__importRace.begin("link"));
    if (phase === "flush") {
      await page.evaluate(() => window.__importRace.confirm(0, true));
      await expect.poll(async () => (await snapshot(page)).writes.length).toBe(1);
    }
    await page.evaluate(() => window.__importRace.begin("search"));
    await page.evaluate(() => window.__importRace.confirm(1, true));
    if (phase === "confirmation") await page.evaluate(() => window.__importRace.confirm(0, true));
    await page.evaluate(() => window.__importRace.releaseWrites());
    await expect.poll(async () => (await snapshot(page)).outcomes.length).toBe(2);
    expect((await snapshot(page)).outcomes.filter((value) => value !== null)).toEqual([0]);
    expect((await snapshot(page)).lyrics).toBe("REMOTE LYRICS");
  });
}

for (const surface of ["link", "audio", "search", "editor"] as const) {
  test(`unmounting ${surface} during flush prevents late upstream work`, async ({ page }) => {
    await load(page);
    if (surface === "audio") {
      await page.evaluate(() => window.__importRace.surface("audio"));
      await page.locator('input[type="file"]').setInputFiles({ name: "fixture.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("fixture") });
    } else if (surface === "search") {
      await page.evaluate(() => window.__importRace.surface("search"));
      await page.getByRole("combobox").fill("Fixture");
      await page.getByRole("option").first().click();
    } else await page.getByRole("button", { name: "Parse", exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).writes.length).toBe(1);
    await page.evaluate((target) => target === "editor" ? window.__importRace.unmount() : window.__importRace.surface("none"), surface);
    await page.evaluate(() => window.__importRace.releaseWrites());
    // Await a browser task after every queued continuation of the released write.
    await page.evaluate(() => new Promise((done) => setTimeout(done, 0)));
    expect((await snapshot(page)).requests).toEqual([]);
  });
}

for (const mode of ["success", "save-failure", "cancel-confirmation", "edit-after-request"] as const) {
  test(`link import preserves ${mode} behavior`, async ({ page }) => {
    await load(page);
    if (mode === "cancel-confirmation") await page.evaluate(() => window.__importRace.rejectConfirmations());
    if (mode === "edit-after-request") await page.evaluate(() => window.__importRace.holdResponse());
    await page.getByRole("button", { name: "Parse", exact: true }).click();
    await page.evaluate((fail) => window.__importRace.releaseWrites(fail), mode === "save-failure");
    if (mode === "edit-after-request") {
      await expect.poll(async () => (await snapshot(page)).requests.length).toBe(1);
      await page.evaluate(() => { window.__importRace.edit("lyrics"); window.__importRace.releaseResponse(); });
    }
    await expect(page.getByTestId("pending")).toHaveText("false");
    await expect(page.getByRole("button", { name: "Parse", exact: true })).toBeEnabled();
    const result = await snapshot(page);
    expect(result.requests.length).toBe(mode === "success" || mode === "edit-after-request" ? 1 : 0);
    expect(result.lyrics).toBe(mode === "success" ? "REMOTE LYRICS" : mode === "edit-after-request" ? "NEW LYRICS DURING WAIT" : "ORIGINAL LYRICS");
    expect(result.notices.length).toBe(mode === "save-failure" ? 1 : 0);
  });
}
