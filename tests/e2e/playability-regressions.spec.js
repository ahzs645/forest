import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { installDeterministicSeed } from './tui-browser.helpers.js';

const fieldEvents = JSON.parse(readFileSync(new URL('../../js/data/json/field/events.json', import.meta.url), 'utf8'));
const washout = fieldEvents.find((event) => event.id === 'road_washout');

test('a deferred washout survives autosave and can be cleared without moving the crew', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await installDeterministicSeed(page, 6101);
  await page.goto('/');
  await page.click('#new-game-btn');
  await page.click('#intro-continue-btn');
  await page.locator('.role-card').nth(2).click();
  await page.click('#role-continue-btn');
  await page.locator('.area-item').first().click();
  await page.click('#area-continue-btn');
  await page.locator('#choices button').filter({ hasText: 'Journeyman' }).click();
  await expect(page.locator('#choices button').filter({ hasText: 'Work the block' })).toBeVisible();

  // Seed an authored event into the real decision checkpoint. Everything
  // after resume uses the normal UI, including the second automatic save.
  const before = await page.evaluate((event) => {
    const game = window.__forestGame;
    game.journey.activeReconShift.pendingEvent = event;
    game.checkpoint();
    return { day: game.journey.day, distance: game.journey.distanceTraveled };
  }, washout);
  await page.reload();
  await page.locator('#modal-actions button').filter({ hasText: 'Resume Expedition' }).click();
  const defer = page.locator('#choices button').filter({ hasText: 'Set it aside' });
  await expect(defer).toContainText('route stays blocked');
  await defer.click();
  await expect(page.locator('#choices button').filter({ hasText: 'Clear route obstruction' })).toBeVisible();
  await expect(page.locator('#choices button').filter({ hasText: 'Move on to' })).toHaveCount(0);
  await expect(page.locator('#choices button').filter({ hasText: 'Work the block' })).toBeVisible();
  await expect(page.locator('#terminal')).toContainText('You left Road Washed Out');

  // No explicit checkpoint here: the player's ordinary autosave must retain
  // both the closure and the fact that its event was already deferred.
  await page.reload();
  await page.locator('#modal-actions button').filter({ hasText: 'Resume Expedition' }).click();
  const clear = page.locator('#choices button').filter({ hasText: 'Clear route obstruction' });
  await expect(clear).toBeVisible();
  await expect(clear).toContainText('uses this shift');
  await expect(page.locator('#choices button').filter({ hasText: 'Set it aside' })).toHaveCount(0);
  await expect(page.locator('#choices button').filter({ hasText: 'Move on to' })).toHaveCount(0);
  expect(await page.evaluate(() => ({
    day: window.__forestGame.journey.day,
    distance: window.__forestGame.journey.distanceTraveled,
  }))).toEqual(before);

  await clear.click();
  await expect(page.locator('#terminal')).toContainText('travel can resume');
  expect(await page.evaluate(() => ({
    distance: window.__forestGame.journey.distanceTraveled,
    active: window.__forestGame.journey.routeConstraints.filter((entry) => entry.status === 'active').length,
  }))).toEqual({ distance: before.distance, active: 0 });
  await page.locator('#choices button').filter({ hasText: 'Acknowledge results and continue' }).click();
  await expect(page.locator('#choices button').filter({ hasText: `Begin Shift ${before.day + 1}` })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});
