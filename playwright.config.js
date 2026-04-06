import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4173/forest/',
    headless: true,
    viewport: { width: 1440, height: 1100 },
    screenshot: 'only-on-failure',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm run serve:e2e',
    url: 'http://127.0.0.1:4173/forest/',
    reuseExistingServer: false,
    timeout: 120000
  }
});
