import { test, expect } from '@playwright/test';
import { attachRuntimeErrorCollector, installDeterministicSeed } from './tui-browser.helpers.js';

const CAREER_RECORD = JSON.stringify({
  runs: 3,
  byRole: {
    recon: { runs: 2, victories: 1, bestScore: 70, bestGrade: 'B' },
    silviculture: { runs: 1, victories: 1, bestScore: 80, bestGrade: 'A' },
  },
  career: { kmSurveyed: 120 },
});

// Seed storage once, before the app boots, without re-seeding on reloads.
async function seedStorage(page, entries) {
  await page.addInitScript((values) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  }, entries);
}

async function startRecce(page) {
  await installDeterministicSeed(page, 6101);
  await page.goto('/');
  await page.click('#new-game-btn');
  await page.click('#intro-continue-btn');
  await page.locator('.role-card').filter({ hasText: 'Recon Crew Lead' }).click();
  await page.click('#role-continue-btn');
  await page.locator('.area-item').first().click();
  await page.click('#area-continue-btn');
  await page.locator('#choices button').filter({ hasText: 'Journeyman' }).click();
  await expect(page.locator('#choices button').first()).toBeVisible();
}

test('a partial expedition save is discarded with a message instead of blanking the app', async ({ page }) => {
  const errors = attachRuntimeErrorCollector(page);
  await seedStorage(page, { 'bcft.activeRun.v1': '{"version":1,"journey":{"journeyType":"recon"}}' });
  await page.goto('/');

  await expect(page.locator('#modal-title')).toHaveText("Save Can't Be Read");
  await expect(page.locator('#modal-body')).toContainText('expedition');
  await page.locator('#modal-actions').getByRole('button', { name: 'Discard and continue' }).click();

  await expect(page.locator('#landing-screen')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('bcft.activeRun.v1'))).toBeNull();
  await page.reload();
  await expect(page.locator('#landing-screen')).toBeVisible();
  await expect(page.locator('#modal')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a malformed campaign save is discarded and never listed in Load Data', async ({ page }) => {
  const errors = attachRuntimeErrorCollector(page);
  await seedStorage(page, { 'bcft.campaign.v1': '{"version":1}' });
  await page.goto('/');

  await expect(page.locator('#modal-body')).toContainText('campaign year');
  await page.keyboard.press('Enter');
  await expect(page.locator('#modal')).toBeHidden();

  await page.click('#load-game-btn');
  await expect(page.locator('#modal-body')).toContainText('No saved games found');
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }]) {
  test(`the landing menu stays reachable with a career forest at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedStorage(page, { 'bcft.serviceRecord.v1': CAREER_RECORD });
    await page.goto('/');
    await expect(page.locator('#career-forest-block')).toBeVisible();

    for (const selector of ['#campaign-btn', '#load-game-btn', '#help-landing-btn', '#settings-btn']) {
      const hit = await page.locator(selector).evaluate((button) => {
        const footer = document.querySelector('.terminal-footer').getBoundingClientRect();
        const r = button.getBoundingClientRect();
        const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { aboveFooter: r.bottom <= footer.top + 1, clickable: Boolean(target && button.contains(target)) };
      });
      expect(hit, selector).toEqual({ aboveFooter: true, clickable: true });
    }
  });
}

test('Escape then Enter keeps playing instead of deleting the expedition', async ({ page }) => {
  await startRecce(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-title')).toHaveText('Leave the Expedition?');
  await expect(page.locator('#modal-actions button').first()).toBeFocused();
  await expect(page.locator('#modal-actions button').first()).toHaveText('Keep Playing');
  await page.keyboard.press('Enter');

  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('#landing-screen')).toBeHidden();
  expect(await page.evaluate(() => Boolean(localStorage.getItem('bcft.activeRun.v1')))).toBe(true);
});

test('Save & return keeps the expedition on file for Load Data', async ({ page }) => {
  await startRecce(page);
  await page.keyboard.press('r');
  await page.locator('#modal-actions').getByRole('button', { name: 'Save & return to district office' }).click();

  await expect(page.locator('#landing-screen')).toBeVisible();
  await expect(page.locator('#modal')).toBeHidden();
  await page.click('#load-game-btn');
  await expect(page.locator('#modal-actions')).toContainText('Resume Expedition');
});

test('Ctrl+C on the landing copies instead of launching the Campaign', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Meta+c');
  await expect(page.locator('#landing-screen')).toBeVisible();
  await page.keyboard.press('c');
  await expect(page.locator('#landing-screen')).toBeHidden();
});

test('keyboard focus cannot reach the hidden game shell behind the landing or setup', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => document.querySelector('.game-wrapper').inert)).toBe(true);
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('Tab');
    const insideShell = await page.evaluate(() => Boolean(document.activeElement?.closest('.game-wrapper')));
    expect(insideShell).toBe(false);
  }

  await page.click('#new-game-btn');
  expect(await page.evaluate(() => document.querySelector('.game-wrapper').inert)).toBe(true);
  await page.click('#intro-continue-btn');
  await page.locator('.role-card').first().click();
  await page.click('#role-continue-btn');
  await page.click('#area-continue-btn');
  await expect(page.locator('#choices button').first()).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('.game-wrapper').inert)).toBe(false);
});

for (const themeId of ['green', 'amber', 'ice']) {
  test(`the ${themeId} theme reaches the legacy colour aliases`, async ({ page }) => {
    await seedStorage(page, { bcForestry_theme: themeId });
    await page.goto('/');
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      const get = (name) => style.getPropertyValue(name).trim();
      return {
        fgDim: get('--fg-dim'), textDim: get('--text-dim'),
        bgPanel: get('--bg-panel'), surface: get('--surface'),
        fgMain: get('--fg-main'), text: get('--text'),
      };
    });
    expect(tokens.fgDim).toBe(tokens.textDim);
    expect(tokens.bgPanel).toBe(tokens.surface);
    expect(tokens.fgMain).toBe(tokens.text);
    expect(tokens.fgMain).not.toBe('#c3cedd');
  });
}

test('Modern keeps the day\'s story readable under the Trail View', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedStorage(page, { bcForestry_displayMode: 'modern' });
  await startRecce(page);
  await expect(page.locator('.trail-picture')).toBeVisible();
  const logHeight = await page.locator('#terminal').evaluate((el) => el.clientHeight);
  expect(logHeight).toBeGreaterThanOrEqual(90);
  await expect(page.locator('#choices button').first()).toBeInViewport();
});

test('Modern on a phone stacks every decision card instead of hiding them sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedStorage(page, { bcForestry_displayMode: 'modern' });
  await startRecce(page);
  const overflow = await page.locator('#choices').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const logHeight = await page.locator('#terminal').evaluate((el) => el.clientHeight);
  expect(logHeight).toBeGreaterThanOrEqual(90);
});
