import { test, expect } from '@playwright/test';

test('landing shortcuts stay scoped to the landing screen actions', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.keyboard.press('l');

  await expect(page.locator('#modal-title')).toHaveText('LOAD DATA');
  await expect(page.locator('#modal-body')).toContainText('Save/Load functionality coming soon.');
});
