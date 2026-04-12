import { test, expect } from '@playwright/test';

const MOBILE_SEED = 20260411;

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

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

test('seasonal strategy TUI supports touch-first setup and play on mobile', async ({ page }) => {
  const runtimeErrors = attachRuntimeErrorCollector(page);
  await seedBrowser(page, MOBILE_SEED);

  await page.goto('/tui.html');

  await expect(page.locator('#company-name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use Default' })).toBeVisible();

  await page.locator('#company-name').click();
  await page.locator('#company-name').fill('Northline Forestry');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: /Permitting Specialist/ }).click();
  await page.getByRole('button', { name: /Muskwa Foothills/ }).click();

  await expect(page.locator('.tui-dashboard')).toContainText('Northline Forestry');
  if ((await page.locator('.tui-field-main').innerText()).includes('Prepare your crew.')) {
    await page.locator('.tui-option').first().click();
  }
  await expect(page.locator('.tui-field-main')).toContainText('What am I deciding?');

  const beforeDecision = await page.locator('.tui-field-main').innerText();
  await page.locator('.tui-option').first().click();
  await page.waitForFunction(
    (previous) => {
      const main = document.querySelector('.tui-field-main');
      return !!main && main.textContent?.replace(/\s+/g, ' ').trim() !== previous;
    },
    beforeDecision.replace(/\s+/g, ' ').trim(),
  );

  const layout = await page.evaluate(() => {
    const optionRects = Array.from(document.querySelectorAll('.tui-option')).map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });

    return {
      hasHorizontalOverflow: document.body.scrollWidth > window.innerWidth,
      hasOffscreenOptions: optionRects.some((rect) => rect.left < 0 || rect.right > window.innerWidth),
    };
  });

  expect(layout.hasHorizontalOverflow).toBeFalsy();
  expect(layout.hasOffscreenOptions).toBeFalsy();
  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
});

test('mobile exit button returns the TUI to the landing page', async ({ page }) => {
  await seedBrowser(page, MOBILE_SEED + 1);
  await page.goto('/tui.html');

  await page.getByRole('button', { name: 'Exit' }).click();

  await expect(page).toHaveURL(/\/index\.html$/);
  await expect(page.locator('#new-game-btn')).toBeVisible();
});
