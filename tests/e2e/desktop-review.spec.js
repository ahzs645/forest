import { test, expect } from '@playwright/test';
import { installDeterministicSeed, attachRuntimeErrorCollector } from './tui-browser.helpers.js';

async function expectContained(page, selector) {
  const geometry = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  expect(geometry.left, `${selector} left edge`).toBeGreaterThanOrEqual(-1);
  expect(geometry.right, `${selector} right edge`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.top, `${selector} top edge`).toBeGreaterThanOrEqual(-1);
  expect(geometry.bottom, `${selector} bottom edge`).toBeLessThanOrEqual(geometry.viewportHeight + 1);
}

async function startRecce(page) {
  await installDeterministicSeed(page, 6101);
  await page.goto('/');
  await page.keyboard.press('n');
  await expect(page.locator('#intro-step')).toBeVisible();
  await page.locator('#crew-name-input').fill('Desktop Review Crew');
  await page.keyboard.press('Enter');
  await page.locator('.role-card').nth(2).click();
  await page.locator('#role-continue-btn').focus();
  await page.keyboard.press('Enter');
  await page.locator('.area-item').first().click();
  await page.locator('#area-continue-btn').focus();
  await page.keyboard.press('Enter');
  await page.locator('#choices button').filter({ hasText: 'Journeyman' }).click();
  await expect(page.locator('#choices button').filter({ hasText: 'Work the block' })).toBeVisible();
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
  test.describe(`desktop review ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('landing utility entry points stay accessible and dismiss cleanly', async ({ page }, testInfo) => {
      const errors = attachRuntimeErrorCollector(page);
      await page.goto('/');
      for (const selector of ['#campaign-btn', '#new-game-btn', '#tui-mode-btn', '#load-game-btn', '#settings-btn']) {
        await expect(page.locator(selector)).toBeInViewport();
      }
      await page.screenshot({ path: testInfo.outputPath('landing.png') });
      for (const [key, title] of [['h', 'HOW TO PLAY'], ['p', 'PROFESSIONAL / COMPLIANCE INTEL'], ['l', 'LOAD DATA']]) {
        await page.keyboard.press(key);
        await expect(page.locator('#modal-title')).toContainText(title);
        await expectContained(page, '#modal .modal-box');
        await page.locator('#modal-actions button').first().click();
        await expect(page.locator('#modal')).toBeHidden();
      }
      await page.click('#settings-btn');
      await expect(page.locator('#modal-title')).toHaveText('SETTINGS');
      await expectContained(page, '#modal .modal-box');
      await page.locator('#modal-actions button').first().click();
      await expect(page.locator('#landing-screen')).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('keyboard menus, long status panes and a real action survive resume', async ({ page }, testInfo) => {
      const errors = attachRuntimeErrorCollector(page);
      await startRecce(page);
      await expectContained(page, '#action-area');
      await expectContained(page, '#terminal-window');
      await page.screenshot({ path: testInfo.outputPath('recce-start.png') });
      const choices = page.locator('#choices button');
      await choices.first().focus();
      await page.keyboard.press('ArrowUp');
      await expect(choices.last()).toBeFocused();
      await expect(choices.last()).toBeInViewport();
      await page.keyboard.press('ArrowDown');
      await expect(choices.first()).toBeFocused();
      const status = page.locator('#panel-content');
      await status.hover();
      await page.mouse.wheel(0, 1800);
      await expect(page.locator('#location-panel')).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath('scrolled-status.png') });
      await expectContained(page, '#action-area');
      await expectContained(page, '#terminal-window');
      await choices.first().focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#choices')).toContainText('Acknowledge results and continue');
      await page.keyboard.press('Enter');
      await expect(page.locator('#choices')).toContainText('Begin Shift 2');
      await page.keyboard.press('Enter');
      await expect(page.locator('#choices button').first()).toBeVisible();
      const before = await page.evaluate(() => ({ day: window.__forestGame.journey.day,
        distance: window.__forestGame.journey.distanceTraveled,
        objective: document.querySelector('#mission-panel .mission-objective')?.textContent }));
      await page.reload();
      await page.locator('#modal-actions button').filter({ hasText: 'Resume Expedition' }).click();
      await expect(page.locator('#choices button').first()).toBeVisible();
      expect(await page.evaluate(() => ({ day: window.__forestGame.journey.day,
        distance: window.__forestGame.journey.distanceTraveled,
        objective: document.querySelector('#mission-panel .mission-objective')?.textContent }))).toEqual(before);
      await expectContained(page, '#action-area');
      await page.screenshot({ path: testInfo.outputPath('resumed.png') });
      expect(errors).toEqual([]);
    });

    test('help modal isolates keyboard focus and cannot execute the underlying shift', async ({ page }, testInfo) => {
      await startRecce(page);
      const before = await page.locator('#choices').innerText();
      await page.keyboard.press('?');
      await expect(page.locator('#modal')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('help-modal.png') });
      await page.keyboard.press('1');
      await expect(page.locator('#choices')).toHaveText(before, { useInnerText: true });
      expect(await page.evaluate(() => document.querySelector('#modal').contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.querySelector('#modal').contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => document.querySelector('#modal').contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('#modal')).toBeHidden();
      await expect(page.locator('#choices button').first()).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#choices')).toContainText('Acknowledge results and continue');
    });

    test('campaign entry and seasonal strategy entry work at this desktop size', async ({ page }, testInfo) => {
      const errors = attachRuntimeErrorCollector(page);
      await page.goto('/');
      await page.keyboard.press('c');
      await expect(page.locator('#choices button').first()).toBeVisible();
      await expect(page.locator('#terminal')).toContainText(/Operating Area|district/i);
      await expectContained(page, '#action-area');
      await page.screenshot({ path: testInfo.outputPath('campaign-entry.png') });
      // A separate fresh context is unnecessary: campaign setup has not saved
      // a run, and the route itself must expose the advertised entry point.
      await page.goto('/');
      await page.keyboard.press('t');
      await expect(page.locator('#terminal')).toContainText('SEASONAL STRATEGY');
      await expect(page.locator('#text-input')).toBeVisible();
      await page.locator('#text-input').fill('Desktop Seasonal Crew');
      await page.keyboard.press('Enter');
      await expect(page.locator('#choices button').first()).toBeVisible();
      await expectContained(page, '#action-area');
      await page.screenshot({ path: testInfo.outputPath('seasonal-entry.png') });
      expect(errors).toEqual([]);
    });
  });
}
