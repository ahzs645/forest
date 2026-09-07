import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installDeterministicSeed } from './tui-browser.helpers.js';

const roles = [
  { name: 'Strategic Planner', type: 'planning', difficulty: 'Greenhorn' },
  { name: 'Permitting Specialist', type: 'permitting', difficulty: 'Old Growth' },
  { name: 'Recon Crew Lead', type: 'recon', difficulty: 'Journeyman' },
  { name: 'Silviculture Supervisor', type: 'silviculture', difficulty: 'Greenhorn' },
  { name: 'General Manager', type: 'manager', difficulty: 'Old Growth' },
];

async function startExpedition(page, role, seed) {
  await installDeterministicSeed(page, seed);
  await page.goto('/');
  await page.click('#new-game-btn');
  await page.click('#intro-continue-btn');
  await page.locator('.role-card').filter({ hasText: role.name }).click();
  await page.click('#role-continue-btn');
  await page.locator('.area-item').first().click();
  await page.click('#area-continue-btn');
  await page.locator('#choices button').filter({ hasText: role.difficulty }).click();
  await expect(page.locator('#choices button').first()).toBeVisible();
}

async function takeAction(page) {
  if (await page.locator('#input-wrapper').isVisible()) {
    await page.locator('#text-input').fill('Mode review crew');
    await page.click('#submit-btn');
    return;
  }
  const buttons = page.locator('#choices button');
  await expect(buttons.first()).toBeVisible();
  const labels = await buttons.allInnerTexts();
  const skip = /More context|Review the|Glossary|Intel|Status|Help|Never mind/i;
  const index = labels.findIndex((label) => !skip.test(label));
  await buttons.nth(index < 0 ? 0 : index).click();
}

for (const [index, role] of roles.entries()) {
  test(`${role.name} reloads its completed-period save and continues (${role.difficulty})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await startExpedition(page, role, 9100 + index * 37);
    let saved;
    for (let step = 0; step < 45; step++) {
      saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bcft.activeRun.v1'))?.journey);
      if (saved?.day >= 2) break;
      await takeAction(page);
    }
    expect(saved?.day).toBeGreaterThanOrEqual(2);
    expect(saved.journeyType).toBe(role.type);
    await page.reload();
    await page.locator('#modal-actions button').filter({ hasText: 'Resume Expedition' }).click();
    await expect(page.locator('#choices button').first()).toBeVisible();
    await expect(page.locator('#terminal')).not.toContainText('Something broke');
    expect(await page.evaluate(() => ({ day: window.__forestGame.journey.day, type: window.__forestGame.journey.journeyType })))
      .toEqual({ day: saved.day, type: role.type });
    for (let step = 0; step < 45; step++) {
      if (await page.evaluate((day) => window.__forestGame.journey.day > day || window.__forestGame.gameOver, saved.day)) break;
      await takeAction(page);
    }
    expect(await page.evaluate((day) => window.__forestGame.journey.day > day || window.__forestGame.gameOver, saved.day)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('General Manager finishes its entire board term and can start a new expedition', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await startExpedition(page, roles[4], 9513);
  for (let step = 0; step < 160; step++) {
    if (await page.locator('#choices button').filter({ hasText: 'Return to District Office' }).count()) break;
    const conserve = page.locator('#choices button').filter({ hasText: /Set it aside|Skip certification|Hold the line/ });
    if (await conserve.count()) {
      await conserve.first().click();
      continue;
    }
    await takeAction(page);
  }
  const office = page.locator('#choices button').filter({ hasText: 'Return to District Office' });
  await expect(office).toBeVisible();
  await expect(page.locator('#terminal')).toContainText('SERVICE RECORD');
  expect(await page.evaluate(() => ({ day: window.__forestGame.journey.day, victory: window.__forestGame.victory })))
    .toEqual({ day: 13, victory: true });
  expect(await page.evaluate(() => localStorage.getItem('bcft.activeRun.v1'))).toBeNull();
  await office.click();
  await expect(page.locator('#new-game-btn')).toBeVisible();
  await page.click('#new-game-btn');
  await expect(page.locator('#intro-continue-btn')).toBeVisible();
  expect(errors).toEqual([]);
});

test('reloading a manager event outcome does not apply the monthly strategic choice twice', async ({ page }) => {
  await startExpedition(page, roles[4], 9513);
  const acknowledge = page.locator('#choices button').filter({ hasText: 'Acknowledge outcome and continue' });
  for (let step = 0; step < 50; step++) {
    if (await acknowledge.count()) break;
    await takeAction(page);
  }
  await expect(acknowledge).toBeVisible();
  const month = await page.evaluate(() => window.__forestGame.journey.day);
  expect(await page.evaluate((day) => window.__forestGame.journey.decisions.filter((entry) => entry.type === 'strategic' && entry.day === day).length, month)).toBe(1);
  await page.reload();
  await page.locator('#modal-actions button').filter({ hasText: 'Resume Expedition' }).click();
  for (let step = 0; step < 40; step++) {
    if (await page.evaluate((day) => window.__forestGame.journey.day > day, month)) break;
    await takeAction(page);
  }
  expect(await page.evaluate((day) => window.__forestGame.journey.day > day, month)).toBe(true);
  expect(await page.evaluate((day) => window.__forestGame.journey.decisions.filter((entry) => entry.type === 'strategic' && entry.day === day).length, month)).toBe(1);
});

test('refreshing a recon outcome restores its pre-decision resources without retaining partial event effects', async ({ page }) => {
  const events = JSON.parse(readFileSync(new URL('../../js/data/json/field/events.json', import.meta.url), 'utf8'));
  const washout = events.find((event) => event.id === 'road_washout');
  await startExpedition(page, roles[2], 6101);
  await expect(page.locator('#choices button').filter({ hasText: /Work the block|Move on to/ }).first()).toBeVisible();
  const original = await page.evaluate((event) => {
    const game = window.__forestGame;
    game.journey.activeReconShift.pendingEvent = event;
    game.checkpoint();
    return { day: game.journey.day, resources: game.journey.resources, distance: game.journey.distanceTraveled };
  }, washout);
  await page.reload();
  await page.locator('#modal-actions button').filter({ hasText: 'Resume Expedition' }).click();
  await expect(page.locator('#choices button').filter({ hasText: 'Set it aside' })).toBeVisible();
  await page.locator('#choices button').first().click();
  await expect(page.locator('#choices button').filter({ hasText: 'Acknowledge outcome and continue' })).toBeVisible();
  await page.reload();
  await page.locator('#modal-actions button').filter({ hasText: 'Resume Expedition' }).click();
  await expect(page.locator('#choices button').filter({ hasText: 'Set it aside' })).toBeVisible();
  expect(await page.evaluate(() => ({
    day: window.__forestGame.journey.day,
    resources: window.__forestGame.journey.resources,
    distance: window.__forestGame.journey.distanceTraveled,
  }))).toEqual(original);
});

for (const device of ['desktop', 'phone']) {
  test.describe(`experimental Crisis Command on ${device}`, () => {
    if (device === 'phone') test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    test('completes all phases, reaches a debrief, and restarts', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/?experimental=1');
      await page.click('#crisis-mode-btn');
      await expect(page).toHaveURL(/mode=crisis-command/);
      await expect(page.locator('.tui-field-main')).toContainText('Pine Beetle');
      for (let phase = 0; phase < 4; phase++) {
        const choices = page.locator('.tui-options button');
        await expect(choices.first()).toBeVisible();
        if (device === 'phone') await choices.first().tap();
        else await choices.first().click();
      }
      await expect(page.locator('.tui-heading').first()).toContainText('Crisis Debrief');
      await expect(page.locator('.tui-options button')).toContainText(['Play Again', 'Quit']);
      await page.locator('.tui-options button').filter({ hasText: 'Play Again' }).click();
      await expect(page.locator('#company-name')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
