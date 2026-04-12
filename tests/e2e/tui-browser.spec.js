import { test, expect } from '@playwright/test';

test('seasonal strategy TUI completes a keyboard-driven browser playthrough', async ({ page }) => {
  const runtimeErrors = [];

  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  await page.addInitScript((seedStart) => {
    let seed = seedStart;
    Math.random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
  }, 20260409);

  await page.goto('/tui.html');
  await expect(page.locator('.tui-heading')).toContainText('Welcome to BC Forestry Trail');

  await page.keyboard.press('Enter');
  await expect(page.locator('.tui-heading')).toHaveText('Select your Specialization');
  const roleOptions = await page.locator('.tui-options button').allInnerTexts();
  expect(roleOptions.some((label) => label.includes('General Manager'))).toBeFalsy();
  expect(roleOptions.some((label) => label.includes('Field Technician'))).toBeTruthy();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tui-heading')).toHaveText('Select your Operating Area');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(page.locator('.tui-dashboard')).toContainText('Permitting Specialist');
  await expect(page.locator('.tui-dashboard')).toContainText('Muskwa Foothills');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tui-field-main')).toContainText('What job am I doing?');
  await expect(page.locator('.tui-field-main')).toContainText('What changed?');
  await expect(page.locator('.tui-field-main')).toContainText('Why does it matter now?');
  await expect(page.locator('.tui-field-main')).toContainText('What am I deciding?');
  await expect(page.locator('.tui-art')).toHaveCount(0);

  const result = await autoPlayToSummary(page);

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
  expect(result.ended).toBeTruthy();
  expect(result.text).toContain('Year End Review');
  expect(result.text).toContain('Key Decisions');
  expect(result.text).toContain('Next Year Outlook');
});

async function autoPlayToSummary(page, maxSteps = 80) {
  for (let step = 0; step < maxSteps; step++) {
    const heading = await page.locator('.tui-heading').first().innerText();
    if (heading === 'Year End Review') {
      return {
        ended: true,
        step,
        text: await page.locator('.tui-field-main').innerText(),
      };
    }

    await expect(page.locator('.tui-options button').first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Enter');
  }

  return {
    ended: false,
    step: maxSteps,
    text: await page.locator('.tui-field-main').innerText(),
  };
}
