import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/web-lite",
  // A single worker shares one static server and keeps timing-sensitive layout
  // and export cases deterministic while each test retains an isolated context.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report/web-lite", open: "never" }]
  ],
  outputDir: "test-results/web-lite",
  use: {
    acceptDownloads: true,
    colorScheme: "dark",
    headless: true,
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" }
    }
  ]
});
