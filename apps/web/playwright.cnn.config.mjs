import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "cnn.spec.mjs",
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: "../../runtime/cnn-e2e-results",
  reporter: [
    ["list"],
    ["html", {
      outputFolder: "../../runtime/cnn-e2e-report",
      open: "never",
    }],
    ["json", {
      outputFile: "../../runtime/cnn-e2e.json",
    }],
  ],
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:4189",
    viewport: { width: 1440, height: 1000 },
    locale: "es-PE",
    actionTimeout: 10000,
    screenshot: "only-on-failure",
    trace: "off",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4189 --strictPort",
    url: "http://127.0.0.1:4189",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
