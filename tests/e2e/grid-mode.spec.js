import { test, expect } from '@playwright/test';

test.describe('touch grid choices', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

  test('last campaign area is reachable through touch pages with usable targets', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('bcForestry_displayMode', 'grid'));
    await page.goto('/');
    await page.locator('#campaign-btn').tap();
    await expect(page.locator('#grid-canvas')).toBeVisible();
    const target = await page.locator('#choices .choice-label').last().innerText();
    let chosen = false;
    for (let turn = 0; turn < 12 && !chosen; turn++) {
      await expect.poll(() => page.evaluate(() => window.__forestGame.ui.gridView._regions.filter((region) => region.type === 'option').length)).toBeGreaterThan(0);
      const next = await page.evaluate((label) => {
        const grid = window.__forestGame.ui.gridView;
        const region = grid._regions.find((entry) => entry.type === 'option' && entry.label === label)
          || grid._regions.find((entry) => entry.type === 'option-page' && entry.label === '[Next]');
        if (!region) return null;
        const firstOption = grid._regions.find((entry) => entry.type === 'option');
        return { label: region.label, height: region.h * grid.renderer.cellH,
          x: (region.x + region.w / 2) * grid.renderer.cellW,
          y: (region.y + region.h / 2) * grid.renderer.cellH,
          start: grid._optionStart,
          pageLabel: firstOption?.label || null };
      }, target);
      expect(next, 'the last area or a next page must be tappable').not.toBeNull();
      expect(next.height).toBeGreaterThanOrEqual(44);
      await page.touchscreen.tap(next.x, next.y);
      chosen = next.label === target;
      // A page tap moves _optionStart synchronously but the option regions are
      // rebuilt on the next animation frame, so wait for the new page to be
      // drawn before reading the regions again.
      if (!chosen) {
        await page.waitForFunction(({ start, prevLabel }) => {
          const grid = window.__forestGame.ui.gridView;
          return grid._optionStart > start
            && grid._regions.some((region) => region.type === 'option' && region.label !== prevLabel);
        }, { start: next.start, prevLabel: next.pageLabel });
      }
    }
    expect(chosen).toBe(true);
    await expect(page.locator('#choices')).toContainText('Journeyman');
  });
});

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
