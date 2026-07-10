import { test, expect } from '@playwright/test';

// The ASCII grid renderer projects the DOM game screen onto a canvas; the
// hidden DOM keeps receiving input. This smoke run plays the campaign a few
// steps with keyboard only and confirms the projection stays alive and the
// game state advances underneath.
test('ASCII grid mode boots and plays a campaign start with the keyboard', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  await page.addInitScript(() => localStorage.setItem('bcForestry_displayMode', 'grid'));

  await page.goto('/');
  await page.locator('#campaign-btn').click();

  const canvas = page.locator('#grid-canvas');
  await expect(canvas).toBeVisible();

  // area → difficulty via number keys against the hidden DOM
  await page.waitForSelector('#choices button');
  await page.keyboard.press('1');
  await page.waitForSelector('#choices button');
  await page.keyboard.press('1');

  // crew handle input (focused hidden input still types)
  await page.waitForSelector('#text-input:not([hidden])', { state: 'attached' });
  await page.locator('#text-input').fill('Grid Smoke Crew');
  await page.locator('#text-input').press('Enter');

  // strategy choice appears — the run is live
  await page.waitForSelector('#choices button');
  await page.keyboard.press('1');
  await page.waitForSelector('#choices button');

  // the projection is still up and the DOM advanced into the season
  await expect(canvas).toBeVisible();
  await expect(page.locator('#terminal')).toContainText(/SHIFT|DEPLOYMENT|Move out|briefing/i);

  // arrow selection moves focus among the hidden buttons
  await page.keyboard.press('ArrowDown');
  const focusedIsChoice = await page.evaluate(
    () => document.activeElement?.classList.contains('choice-btn') ?? false
  );
  expect(focusedIsChoice).toBe(true);

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
});
