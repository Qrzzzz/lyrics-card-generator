import { defineConfig } from "@playwright/test";

const supportedProjects = ["firefox", "webkit"] as const;
const selectedBrowser = process.env.WEB_LITE_BROWSER;

if (selectedBrowser && !supportedProjects.includes(selectedBrowser as (typeof supportedProjects)[number])) {
  throw new Error(`WEB_LITE_BROWSER must be firefox or webkit, received: ${selectedBrowser}`);
}

const reportSegment = selectedBrowser ?? "all";

export default defineConfig({
  testDir: "./tests/web-lite-cross-browser",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000
  },
  reporter: [
    ["line"],
    [
      "html",
      {
        outputFolder: `playwright-report/web-lite-cross-browser/${reportSegment}`,
        open: "never"
      }
    ]
  ],
  outputDir: `test-results/web-lite-cross-browser/${reportSegment}`,
  use: {
    acceptDownloads: true,
    colorScheme: "dark",
    headless: true,
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  projects: supportedProjects
    .filter((browserName) => !selectedBrowser || browserName === selectedBrowser)
    .map((browserName) => ({
      name: browserName,
      use: { browserName }
    }))
});
