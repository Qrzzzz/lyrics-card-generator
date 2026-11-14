import { defineConfig } from "@playwright/test";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  testDir: path.join(projectRoot, "tests/render-boundaries"),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 12_000
  },
  reporter: [
    ["line"],
    ["html", { outputFolder: path.join(projectRoot, "playwright-report/render-boundaries"), open: "never" }]
  ],
  outputDir: path.join(projectRoot, "test-results/render-boundaries"),
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
