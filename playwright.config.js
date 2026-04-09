import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const basePath = '/forest/';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}${basePath}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,
  fullyParallel: false,
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1440, height: 1100 },
    screenshot: 'only-on-failure',
    trace: 'on-first-retry'
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run serve:e2e -- --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000
      }
});
