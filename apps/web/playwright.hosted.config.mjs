import {defineConfig} from '@playwright/test';

// The production Docker image must already be serving on this URL.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['platform.spec.mjs', 'hosting.spec.mjs'],
  workers: 1,
  timeout: 45000,
  expect: {timeout: 10000},
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4189',
    browserName: 'chromium',
    viewport: {width: 1440, height: 1000},
  },
});
