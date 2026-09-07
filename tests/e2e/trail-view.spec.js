import { test, expect } from '@playwright/test';
import { installDeterministicSeed } from './tui-browser.helpers.js';

async function start(page, role = 'Recon Crew Lead') {
  await installDeterministicSeed(page, 6101);
  await page.goto('/');
  await page.click('#new-game-btn'); await page.click('#intro-continue-btn');
  await page.locator('.role-card').filter({ hasText: role }).click();
  await page.click('#role-continue-btn'); await page.locator('.area-item').first().click();
  await page.click('#area-continue-btn');
  await page.locator('#choices button').filter({ hasText: 'Journeyman' }).click();
  await expect(page.locator('.trail-view')).toBeVisible();
}

for (const [name, scene] of [['Recon Crew Lead', 'recon'], ['Silviculture Supervisor', 'silviculture'],
  ['Strategic Planner', 'planning'], ['Permitting Specialist', 'permitting'], ['General Manager', 'manager']]) {
  test(`${name} gets a live-state illustration`, async ({ page }, info) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await start(page, name);
    await expect(page.locator('.trail-view')).toHaveAttribute('data-scene', scene);
    await expect(page.locator('.trail-progress')).toHaveAttribute('aria-valuenow', /\d+/);
    expect(await page.locator('.trail-picture canvas').evaluate(c => c.height)).toBeGreaterThan(40);
    await page.screenshot({ path: info.outputPath(`${scene}.png`) });
    expect(errors).toEqual([]);
  });
}

test('animation runs, pauses, and collapses without advancing the game', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await start(page);
  const before = await page.evaluate(() => JSON.stringify(window.__forestGame.journey));
  const tick = await page.evaluate(() => window.__forestGame.ui.trailView.tick);
  await expect.poll(() => page.evaluate(() => window.__forestGame.ui.trailView.tick)).toBeGreaterThan(tick);
  await page.getByRole('button', { name: 'Pause trail animation' }).click();
  const paused = await page.evaluate(() => window.__forestGame.ui.trailView.tick);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__forestGame.ui.trailView.tick)).toBe(paused);
  expect(await page.evaluate(() => JSON.stringify(window.__forestGame.journey))).toBe(before);
  await page.locator('.trail-toggle').click();
  await expect(page.locator('.trail-picture')).toBeHidden();
  await expect(page.locator('#choices button').first()).toBeInViewport();
  await page.locator('.trail-toggle').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Play trail animation' })).toBeVisible();
  expect(await page.evaluate(() => window.__forestGame.ui.trailView.timer)).toBeNull();
});

test('road blockage appears and clears from real route state', async ({ page }, info) => {
  await start(page);
  await page.evaluate(() => {
    const g = window.__forestGame, j = g.journey;
    j.routeConstraints = [{ status: 'active', kind: 'washout', fromBlockId: j.blocks[0].id, toBlockId: j.blocks[1].id }];
    g.ui.updateAllStatus(j);
  });
  await expect(page.locator('.trail-view')).toHaveAttribute('data-blocked', 'true');
  await expect(page.locator('.trail-caption')).toContainText('Route blocked');
  await page.screenshot({ path: info.outputPath('washout.png') });
  await page.evaluate(() => {
    const g = window.__forestGame; g.journey.routeConstraints[0].status = 'resolved'; g.ui.updateAllStatus(g.journey);
  });
  await expect(page.locator('.trail-view')).toHaveAttribute('data-blocked', 'false');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test.describe(`trail touch ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });
    test('picture and controls leave decisions reachable', async ({ page }, info) => {
      await start(page);
      if (viewport.height < 600) {
        await expect(page.locator('.trail-picture')).toBeHidden();
        await page.locator('.trail-toggle').tap();
      }
      await expect(page.locator('.trail-picture')).toBeVisible();
      expect(await page.locator('.trail-picture canvas').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(60);
      for (const selector of ['.trail-toggle', '.trail-motion']) {
        expect(await page.locator(selector).evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      }
      expect(await page.locator('#terminal').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(30);
      expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath('phone.png') });
      await page.locator('.trail-toggle').tap();
      await page.locator('#choices button').first().tap();
      await expect(page.locator('#choices button').first()).toBeVisible();
    });
  });
}

test('Modern display retains the scene and playable choice area', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('bcForestry_displayMode', 'modern'));
  await start(page);
  await expect(page.locator('.trail-picture')).toBeVisible();
  await expect(page.locator('#choices button').first()).toBeInViewport();
  await page.screenshot({ path: info.outputPath('modern.png') });
});

test('ASCII Grid projects the scene and its pause control', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('bcForestry_displayMode', 'modern'));
  await start(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('[data-mode="grid"]').click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__forestGame.ui.gridView._regions.some(r => r.type === 'trail-motion'))).toBe(true);
  const point = await page.evaluate(() => {
    const grid = window.__forestGame.ui.gridView;
    const r = grid._regions.find(r => r.type === 'trail-motion');
    return { x: (r.x + r.w / 2) * grid.renderer.cellW, y: (r.y + .5) * grid.renderer.cellH };
  });
  await page.mouse.click(point.x, point.y);
  expect(await page.evaluate(() => window.__forestGame.ui.trailView.paused)).toBe(false);
  await page.screenshot({ path: info.outputPath('grid.png') });
  await page.keyboard.press('1');
  await expect(page.locator('#choices')).not.toContainText('Set the tempo');
});


// The crew musters at a staging lot, which is a waypoint with no package.
// Stand it on the first cutblock (the truck's arrival has already written the
// road notes) and re-open the card through a free look-up so the menu is
// rebuilt for that stop.
async function standOnFirstBlock(page) {
  await expect(page.locator('#choices button').filter({ hasText: 'Set the tempo' })).toBeVisible();
  await page.evaluate(() => {
    const journey = window.__forestGame.journey;
    const index = journey.blocks.findIndex((stop) => stop.kind === 'block');
    journey.currentBlockIndex = index;
    journey.distanceTraveled = journey.blocks.slice(0, index + 1).reduce((sum, stop) => sum + stop.distance, 0);
    journey.reconIntel = journey.reconIntel || { byBlock: {} };
    journey.reconIntel.byBlock[journey.blocks[index].id] = {
      accessGroundTruthed: true, layoutWalked: false, valuesSwept: false, assessmentComplete: false,
      lastAccessDay: journey.day, lastLayoutDay: 0, lastValuesDay: 0,
    };
  });
  await page.locator('#choices button').filter({ hasText: 'Set the tempo' }).click();
  await page.locator('#choices button').filter({ hasText: 'Leave it' }).click();
  await page.locator('#choices button').filter({ hasText: 'Full rations' }).click();
  await expect(page.locator('#choices button').filter({ hasText: 'Work the block' })).toBeVisible();
}

for (const mode of ['classic', 'modern']) {
  test(`${mode} results use one plain Continue button`, async ({ page }, info) => {
    await page.addInitScript(mode => localStorage.setItem('bcForestry_displayMode', mode), mode);
    await start(page);
    await standOnFirstBlock(page);
    await page.locator('#choices button').filter({ hasText: 'Work the block' }).click();
    const button = page.locator('#choices button');
    await expect(button).toHaveCount(1);
    await expect(button).toHaveText('Continue');
    await expect(button.locator('.choice-key, .card-header, .choice-hint, .card-hint')).toHaveCount(0);
    await expect(page.locator('#radio-section')).toBeHidden();
    await page.screenshot({ path: info.outputPath('simple-continue.png') });
    await button.press('Enter');
    await expect(page.locator('#choices button').filter({ hasText: /Begin Shift \d+/ })).toBeVisible();
  });
}

test('travel uses Trail View without a second animation in the log', async ({ page }, info) => {
  await start(page);
  await page.locator('#choices button').filter({ hasText: 'Move on to' }).click();
  await page.locator('#choices button').filter({ hasText: 'Risky Shortcut' }).click();
  await expect(page.locator('#choices button')).toHaveText('Continue');
  await expect(page.locator('#terminal .scene-canvas, #terminal .scene-skip-hint')).toHaveCount(0);
  await expect(page.locator('.trail-view')).toBeVisible();
  await expect(page.locator('#radio-section')).toBeHidden();
  await page.screenshot({ path: info.outputPath('single-travel-view.png') });
});

test('standing down uses Trail View without a second camp animation', async ({ page }) => {
  await start(page);
  await page.locator('#choices button').filter({ hasText: 'Camp & crew' }).click();
  await page.locator('#choices button').filter({ hasText: 'Stand down' }).click();
  await expect(page.locator('#choices button').filter({ hasText: /Begin Shift \d+/ })).toBeVisible();
  await expect(page.locator('#terminal .scene-canvas')).toHaveCount(0);
});
