import { test, expect } from '@playwright/test';

import {
  autoPlayToSummary,
  openCurrentDecision,
  SEASONAL_TUI_SEEDS,
  startSeasonalRun,
} from './tui-browser.helpers.js';

test('seasonal strategy TUI completes a keyboard-driven browser playthrough', async ({ page }) => {
  const { runtimeErrors } = await startSeasonalRun(page, {
    seed: SEASONAL_TUI_SEEDS[0],
    roleLabel: 'Permitting Specialist',
    areaLabel: 'Muskwa Foothills',
  });

  await openCurrentDecision(page);
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
