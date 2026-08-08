import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/deferred-surfaces",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  reporter: "line",
  outputDir: "test-results/deferred-surfaces",
  use: {
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
