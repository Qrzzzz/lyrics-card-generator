import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { closeElectronApplication } from "./electron-test-lifecycle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = path.join(root, "release", "win-unpacked", "Lyrics Card Generator.exe");
const userDataDirectory = await mkdtemp(path.join(tmpdir(), "lyrics-card-packaged-preload-"));
let electronApp;

try {
  electronApp = await electron.launch({
    executablePath,
    // Test-harness-only mitigation for the known host GPU child failure. The
    // packaged product and its startup policy remain unchanged.
    args: ["--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer"],
    env: { ...process.env, LYRICS_CARD_TEST_USER_DATA: userDataDirectory },
    timeout: 60_000
  });
  const page = await electronApp.firstWindow({ timeout: 60_000 });
  const bridgeState = await page.evaluate(() => ({
    present: typeof window.lyricsCardDesktopBridge === "object",
    hasClipboard: typeof window.lyricsCardDesktopBridge?.copyImageToClipboard === "function"
  }));
  assert.deepEqual(
    bridgeState,
    { present: true, hasClipboard: true },
    "the packaged sandboxed preload exposes the desktop clipboard bridge"
  );
  console.log("Packaged Electron sandbox preload bridge test passed");
} finally {
  await closeElectronApplication(electronApp, { label: "packaged-sandbox-preload" });
  await rm(userDataDirectory, { recursive: true, force: true });
}
