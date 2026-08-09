import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/render-boundaries",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 12_000
  },
  reporter: "line",
  outputDir: "test-results/render-boundaries",
  use: {
    acceptDownloads: true,
    baseURL: "http://127.0.0.1:3101",
    colorScheme: "dark",
    headless: true,
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 1000 }
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" }
    }
  ]
});
