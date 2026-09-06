import base from './playwright.config.js';

// Opt-in browser/device matrix; the ordinary suite remains the fast default.
const webkitLaunch = process.env.PLAYWRIGHT_WEBKIT_PATH
  ? { executablePath: process.env.PLAYWRIGHT_WEBKIT_PATH }
  : {};

export default {
  ...base,
  outputDir: './test-results/compat',
  workers: 3,
  projects: [
    {
      name: 'webkit-desktop',
      testMatch: ['game-modes.spec.js', 'campaign.spec.js', 'load-data.spec.js', 'ui-shortcuts.spec.js', 'grid-mode.spec.js'],
      use: { browserName: 'webkit', viewport: { width: 1280, height: 800 }, launchOptions: webkitLaunch },
    },
    {
      name: 'webkit-phone',
      testMatch: ['mobile-core.spec.js'],
      use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, launchOptions: webkitLaunch },
    },
    {
      name: 'chromium-phone-modes',
      testMatch: ['game-modes.spec.js'],
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
};
