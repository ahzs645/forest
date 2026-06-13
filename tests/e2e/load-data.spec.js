import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('Load Data is wired to the save system, not a "coming soon" placeholder', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Guarantee a clean slate so Load Data reflects the no-save case.
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');

  await page.click('#load-game-btn');

  const modalBody = page.locator('#modal-body');
  await expect(modalBody).toBeVisible();
  const text = await modalBody.innerText();

  expect(text).not.toMatch(/coming soon/i);
  expect(text).toMatch(/saved expedition|automatically/i);
});

test('a started expedition is offered for resume after a reload', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Walk the init flow far enough to trigger the day-zero save.
  await page.click('#new-game-btn');
  await page.click('#intro-continue-btn');
  await page.locator('.role-card').nth(2).click();
  await page.click('#role-continue-btn');
  await page.locator('.area-item').nth(0).click();
  await page.click('#area-continue-btn');
  await page.locator('#choices button').filter({ hasText: 'Journeyman' }).click();
  await page.locator('#choices button').filter({ hasText: 'Begin Journey' }).click();

  // The run is persisted at the start of the journey; a reload should detect it.
  await page.reload();
  await page.waitForLoadState('networkidle');

  const modalBody = page.locator('#modal-body');
  await expect(modalBody).toBeVisible();
  await expect(page.locator('#modal-actions')).toContainText('Resume Expedition');
});
