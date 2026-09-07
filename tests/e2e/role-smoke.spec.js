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
}

async function resolveUntil(page, predicate, maxSteps = 3) {
  for (let step = 0; step < maxSteps; step += 1) {
    if (await predicate()) {
      return true;
    }

    const firstChoice = page.locator('#choices button').first();
    if (!(await firstChoice.isVisible().catch(() => false))) {
      break;
    }

    await firstChoice.click();
  }

  return predicate();
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

  // Lane guidance renders in the mission dashboard pane now, not the log.
  await expect(page.locator('#mission-panel .mission-fact-label').filter({ hasText: 'Lane' })).toBeVisible();
  await expect(page.locator('#mission-panel .mission-guidance')).toBeVisible();
  await expect(page.locator('#choices button').first()).toBeVisible();
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

  await resolveUntil(
    page,
    async () => (await page.locator('#mission-panel').textContent())?.includes('Lane') ?? false,
    2
  );

  // Lane guidance renders in the mission dashboard pane now, not the log.
  await expect(page.locator('#mission-panel .mission-fact-label').filter({ hasText: 'Lane' })).toBeVisible();
  await expect(page.locator('#mission-panel .mission-fact-label').filter({ hasText: 'Stage' })).toBeVisible();
  await expect(page.locator('#mission-panel .mission-guidance')).toBeVisible();
  await expect(page.locator('#choices button').first()).toBeVisible();
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

  // Block intel renders as a mission-pane fact now, not a log line.
  await expect(page.locator('#mission-panel .mission-fact-label').filter({ hasText: 'Intel' })).toBeVisible();
  // The crew musters at a staging lot, which is a waypoint with no package.
  // Stand it on the first cutblock (the truck's arrival has already written
  // the road notes) and re-open the card through a free look-up so the menu
  // is rebuilt for that stop.
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
  // The outstanding block work is one option ("Work the block", described by
  // whichever shift is actually outstanding): the boundary shift first, then
  // the WTP / wildlife / CH sweep — see docs/day_as_situation.md.
  const workTheBlock = page.locator('#choices button').filter({ hasText: 'Work the block' });
  await expect(workTheBlock).toBeVisible();
  await expect(workTheBlock).toContainText('Walk the boundary and ribbon it');
  await workTheBlock.click();
  await expect(page.locator('#choices button').filter({ hasText: 'Continue' })).toBeVisible();
  await page.locator('#choices button').filter({ hasText: 'Continue' }).click();
  // Ground-truthing a block is the shift (js/journey/dayPlan.js), so the day
  // closes out on it rather than returning to the menu for another action.
  await expect(page.locator('#choices button').filter({ hasText: /Begin Shift \d+/ })).toBeVisible();
  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
});

test('response-pane reflow keeps the newest prompt visible at the bottom of a long field log', async ({ page }) => {
  await startRole(page, 2, 0, 'Greenhorn', 6101);

  await page.evaluate(() => {
    const ui = window.__forestGame.ui;
    ui._hideChoices();
    for (let index = 0; index < 60; index += 1) {
      ui.write(`Prior field result ${index + 1}`);
    }
    void ui.promptChoice('What do you do?', [
      { label: 'First response', value: 'first' },
      { label: 'Second response', value: 'second' },
      { label: 'Third response', value: 'third' }
    ]);
  });

  await expect(page.locator('#choices button')).toHaveCount(3);
  const position = await page.locator('#terminal').evaluate((terminal) => {
    const prompt = terminal.lastElementChild;
    const terminalRect = terminal.getBoundingClientRect();
    const promptRect = prompt?.getBoundingClientRect();
    return {
      bottomGap: terminal.scrollHeight - terminal.clientHeight - terminal.scrollTop,
      promptVisible: Boolean(
        promptRect
          && promptRect.top >= terminalRect.top
          && promptRect.bottom <= terminalRect.bottom
      )
    };
  });

  expect(Math.abs(position.bottomGap)).toBeLessThanOrEqual(1);
  expect(position.promptVisible).toBeTruthy();
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
