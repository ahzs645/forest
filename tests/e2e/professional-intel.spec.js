import { test, expect } from '@playwright/test';

test('professional intel modal opens from landing and shows role-aware source-backed sections', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#compliance-intel-landing-btn');

  await expect(page.locator('#modal-title')).toHaveText('PROFESSIONAL / COMPLIANCE INTEL');
  await expect(page.locator('#modal-body')).toContainText('ROLE COMPARISON');
  await expect(page.locator('#modal-body')).toContainText('ILLEGAL ACTS CATALOGUE');

  await page.getByRole('button', { name: 'Planner', exact: true }).click();

  await expect(page.locator('#modal-body')).toContainText('ROLE SNAPSHOT');
  await expect(page.locator('#modal-body')).toContainText('PROFESSIONAL OBLIGATIONS');
  await expect(page.locator('#modal-body a[href*="fpbc.ca"]').first()).toBeVisible();
});
