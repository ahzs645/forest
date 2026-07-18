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
  await resolveUntil(
    page,
    async () => (await page.locator('#choices').textContent())?.includes('Ground-Truth Access') ?? false,
    2
  );
  await expect(page.locator('#choices button').filter({ hasText: 'Ground-Truth Access' })).toBeVisible();
  await page.locator('#choices button').filter({ hasText: 'Ground-Truth Access' }).click();
  await expect(page.locator('#choices button').filter({ hasText: 'Acknowledge results and continue' })).toBeVisible();
  await page.locator('#choices button').filter({ hasText: 'Acknowledge results and continue' }).click();
  await expect(page.locator('#choices button').filter({ hasText: 'Rest & End Shift' })).toBeVisible();
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
