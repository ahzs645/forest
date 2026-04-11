import { test, expect } from '@playwright/test';

async function startRole(page, roleIndex, areaIndex, difficultyLabel = 'Greenhorn', seed = 1200) {
  await page.addInitScript((seedStart) => {
    let seedValue = seedStart;
    Math.random = () => {
      seedValue = (1664525 * seedValue + 1013904223) >>> 0;
      return seedValue / 0x100000000;
    };
  }, seed);

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.click('#new-game-btn');
  await page.click('#intro-continue-btn');
  await page.locator('.role-card').nth(roleIndex).click();
  await page.click('#role-continue-btn');
  await page.locator('.area-item').nth(areaIndex).click();
  await page.click('#area-continue-btn');
  await page.locator('#choices button').filter({ hasText: difficultyLabel }).click();
  await page.locator('#choices button').filter({ hasText: 'Begin Journey' }).click();
}

test('planner smoke shows live lane guidance on boot', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  await startRole(page, 0, 0, 'Greenhorn', 4001);

  await expect(page.locator('#terminal')).toContainText('Lane Focus:');
  await expect(page.locator('#terminal')).toContainText('Next Best Move:');
  await expect(page.locator('#choices button').filter({ hasText: 'Gather Data' })).toBeVisible();
  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
});

test('permitter smoke shows file-lane guidance on boot', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  await startRole(page, 1, 1, 'Greenhorn', 5001);

  await expect(page.locator('#terminal')).toContainText('Lane Focus:');
  await expect(page.locator('#terminal')).toContainText('Next Best Move:');
  await expect(page.locator('#terminal')).toContainText('Stage:');
  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
});

test('recce smoke exposes role-specific ground-truth actions', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  await startRole(page, 2, 2, 'Greenhorn', 6001);

  await expect(page.locator('#terminal')).toContainText('Current Intel:');
  await expect(page.locator('#choices button').filter({ hasText: 'Ground-Truth Access' })).toBeVisible();
  await page.locator('#choices button').filter({ hasText: 'Ground-Truth Access' }).click();
  await expect(page.locator('#choices button').filter({ hasText: 'Rest & End Shift' })).toBeVisible();
  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
});

test('silviculture smoke reaches contractor rotation without runtime failure', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  await startRole(page, 3, 3, 'Greenhorn', 7001);

  await expect(page.locator('#choices button').filter({ hasText: 'Contractor Rotation' })).toBeVisible();
  await page.locator('#choices button').filter({ hasText: 'Contractor Rotation' }).click();
  await expect(page.locator('#choices button').first()).toBeVisible();
  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
});
