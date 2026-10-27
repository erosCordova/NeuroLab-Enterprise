import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: "../../runtime/e2e-results",
  reporter: [
    ["list"],
    ["html", {
      outputFolder: "../../runtime/e2e-report",
      open: "never",
    }],
  ],
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:4189",
    viewport: { width: 1440, height: 1000 },
    locale: "es-PE",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10000,
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4189 --strictPort",
    url: "http://127.0.0.1:4189",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
