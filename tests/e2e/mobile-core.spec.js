import { test, expect } from '@playwright/test';

// The main game (landing hub → Campaign) at phone width. The TUI mobile
// spec covers the retired /tui.html surface; this one covers the surface
// players actually land on.
const SEED = 20260727;
const MIN_TOUCH_TARGET = 44;

function attachRuntimeErrorCollector(page) {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });
  return runtimeErrors;
}

async function seedBrowser(page, seed) {
  await page.addInitScript((seedStart) => {
    let currentSeed = seedStart;
    Math.random = () => {
      currentSeed = (1664525 * currentSeed + 1013904223) >>> 0;
      return currentSeed / 0x100000000;
    };
  }, seed);
}

async function assertNoHorizontalOverflow(page, context) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.scrollingElement.scrollWidth,
    innerWidth: window.innerWidth
  }));
  expect(overflow.scrollWidth, `${context}: document should not overflow horizontally`).toBeLessThanOrEqual(
    overflow.innerWidth
  );
}

async function assertChoiceButtonsAreTappable(page) {
  const heights = await page.locator('#choices button').evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height)
  );
  expect(heights.length).toBeGreaterThan(0);
  for (const height of heights) {
    expect(height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  }
}

test('landing hub loads at phone width with no horizontal overflow', async ({ page }) => {
  const runtimeErrors = attachRuntimeErrorCollector(page);
  await seedBrowser(page, SEED);

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#campaign-btn')).toBeVisible();
  await expect(page.locator('#new-game-btn')).toBeVisible();
  await assertNoHorizontalOverflow(page, 'landing hub');
  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
});

test('tapping Campaign reaches a playable screen with touch-sized choices and never overflows', async ({ page }) => {
  const runtimeErrors = attachRuntimeErrorCollector(page);
  await seedBrowser(page, SEED);

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#campaign-btn');

  // Operating area list.
  await expect(page.locator('#choices button').first()).toBeVisible();
  await page.locator('#choices button').first().click();

  // Difficulty select.
  await expect(page.locator('#choices button').filter({ hasText: 'Journeyman' })).toBeVisible();
  await page.locator('#choices button').filter({ hasText: 'Journeyman' }).click();

  // Crew name prompt.
  await expect(page.locator('#input-wrapper')).toBeVisible();
  await page.locator('#text-input').fill('Trailhead Test Crew');
  await page.click('#submit-btn');

  // Season briefing animates in before the first real decision appears.
  await expect(page.locator('#choices button').first()).toBeVisible({ timeout: 20000 });
  await assertNoHorizontalOverflow(page, 'first playable screen');
  await assertChoiceButtonsAreTappable(page);

  for (let tap = 0; tap < 3; tap += 1) {
    await page.locator('#choices button').first().click();
    await expect(page.locator('#choices button').first()).toBeVisible({ timeout: 20000 });
    await assertNoHorizontalOverflow(page, `after tap ${tap + 1}`);
  }

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
});
