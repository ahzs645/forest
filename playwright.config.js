import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const basePath = process.env.PLAYWRIGHT_BASE_PATH || '/';
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
    trace: 'on-first-retry',
    // Scenes and vignettes honor prefers-reduced-motion by rendering a
    // single still frame; the drivers never tap-to-skip, so animated decks
    // would otherwise stack several seconds of waiting into every game day.
    contextOptions: { reducedMotion: 'reduce' }
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
