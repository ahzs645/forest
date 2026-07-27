import { test, expect } from '@playwright/test';

const MOBILE_SEED = 20260411;

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

function attachRuntimeErrorCollector(page) {
  const runtimeErrors = [];

  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  return runtimeErrors;
}

async function seedBrowser(page, seed) {
  await page.addInitScript((seedStart) => {
    let currentSeed = seedStart;
    Math.random = () => {
      currentSeed = (1664525 * currentSeed + 1013904223) >>> 0;
      return currentSeed / 0x100000000;
    };
  }, seed);
}

test('seasonal strategy TUI supports touch-first setup and play on mobile', async ({ page }) => {
  const runtimeErrors = attachRuntimeErrorCollector(page);
  await seedBrowser(page, MOBILE_SEED);

  await page.goto('/tui.html?classic=1');

  await expect(page.locator('#company-name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use Default' })).toBeVisible();

  await page.locator('#company-name').click();
  await page.locator('#company-name').fill('Northline Forestry');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: /Permitting Specialist/ }).click();
  await page.getByRole('button', { name: /Muskwa Foothills/ }).click();

  await expect(page.locator('.tui-dashboard')).toContainText('Northline Forestry');
  if ((await page.locator('.tui-field-main').innerText()).includes('Prepare your crew.')) {
    await page.locator('.tui-option').first().click();
  }
  await expect(page.locator('.tui-field-main')).toContainText('What am I deciding?');

  const beforeDecision = await page.locator('.tui-field-main').innerText();
  await page.locator('.tui-option').first().click();
  await page.waitForFunction(
    (previous) => {
      const main = document.querySelector('.tui-field-main');
      return !!main && main.textContent?.replace(/\s+/g, ' ').trim() !== previous;
    },
    beforeDecision.replace(/\s+/g, ' ').trim(),
  );

  const layout = await page.evaluate(() => {
    const optionRects = Array.from(document.querySelectorAll('.tui-option')).map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });

    return {
      hasHorizontalOverflow: document.body.scrollWidth > window.innerWidth,
      hasOffscreenOptions: optionRects.some((rect) => rect.left < 0 || rect.right > window.innerWidth),
    };
  });

  expect(layout.hasHorizontalOverflow).toBeFalsy();
  expect(layout.hasOffscreenOptions).toBeFalsy();
  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
});

test('mobile exit button returns the TUI to the landing page', async ({ page }) => {
  await seedBrowser(page, MOBILE_SEED + 1);
  await page.goto('/tui.html?classic=1');

  await page.getByRole('button', { name: '← Main Menu' }).click();

  await expect(page).toHaveURL(/\/index\.html$/);
  await expect(page.locator('#new-game-btn')).toBeVisible();
});

// The recon shift menu is the longest in the game — nine or ten options with
// two-line hints. It is the case that broke twice: first as a silently
// truncated 300px box, then as an action area tall enough to push the whole
// fixed-viewport screen past the fold, so reaching the last option needed a
// page scroll on top of the list scroll and the "more below" marker could
// itself sit off screen. The contract is: the document never scrolls, and
// scrolling the option list alone is always enough to reach the last option.
test('a long option menu stays inside the viewport and reachable by list scroll alone', async ({ page }) => {
  const runtimeErrors = attachRuntimeErrorCollector(page);
  await seedBrowser(page, 777001);

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.click('#new-game-btn');
  await page.click('#intro-continue-btn');
  await page.locator('.role-card').nth(2).click(); // Recon Crew Lead
  await page.click('#role-continue-btn');
  await page.locator('.area-item').nth(1).click();
  await page.click('#area-continue-btn');

  let sawShiftMenu = false;
  for (let step = 0; step < 30 && !sawShiftMenu; step += 1) {
    await page.waitForSelector('#choices button', { timeout: 15000 });
    const labels = await page.locator('#choices button').evaluateAll((nodes) =>
      nodes.map((node) => node.innerText.replace(/\s+/g, ' ').trim()));

    sawShiftMenu = labels.some((label) => label.includes('Camp & crew'))
      && labels.some((label) => label.includes('Set the tempo'));

    const layout = await page.evaluate(() => {
      const list = document.querySelector('#choices');
      const area = document.querySelector('#action-area');
      const rows = [...list.querySelectorAll('.choice-btn')];
      list.scrollTop = list.scrollHeight; // scroll the LIST, nothing else
      const last = rows.length ? rows[rows.length - 1].getBoundingClientRect() : null;
      return {
        rows: rows.length,
        documentScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
        lastRowReachable: last ? last.bottom <= window.innerHeight + 1 && last.top >= -1 : true,
        markerOnScreen: area.classList.contains('has-more-choices')
          ? area.getBoundingClientRect().bottom <= window.innerHeight + 1
          : true,
      };
    });

    expect(layout.documentScrolls, 'the fixed-viewport screen must never scroll the document').toBeFalsy();
    expect(layout.lastRowReachable, `last of ${layout.rows} options must come into view on a list scroll`).toBeTruthy();
    expect(layout.markerOnScreen, 'the "more below" marker must be on screen when it applies').toBeTruthy();

    const preferred = [/Journeyman/, /^Done/, /Acknowledge/, /^Begin Shift/, /^Continue/];
    let index = 0;
    for (const pattern of preferred) {
      const found = labels.findIndex((label) => pattern.test(label));
      if (found >= 0) { index = found; break; }
    }
    if (sawShiftMenu) break;
    await page.locator('#choices button').nth(index).click();
    await page.waitForTimeout(150);
  }

  expect(sawShiftMenu, 'expected to reach the recon shift menu').toBeTruthy();
  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
});
