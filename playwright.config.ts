import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  globalTimeout: process.env.CI ? 30 * 60_000 : undefined,
  use: {
    trace: "on-first-retry",
    baseURL: "http://127.0.0.1:5174",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    },
  },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: true,
  },
});
