import { test, expect } from '@playwright/test';
import { installDeterministicSeed } from './tui-browser.helpers.js';

/**
 * The shortcut card in every renderer: it says what it is before who is
 * asking, opens on that line even in a short log pane, and keeps its odds
 * and payoff readable on the option itself (the ASCII grid used to clip
 * them off both widths).
 */

async function openShortcutCard(page, mode) {
  await installDeterministicSeed(page, 6101);
  await page.addInitScript((displayMode) => localStorage.setItem('bcForestry_displayMode', displayMode), mode);
  await page.goto('/');
  await page.click('#new-game-btn');
  await page.click('#intro-continue-btn');
  await page.locator('.role-card').filter({ hasText: 'Strategic Planner' }).click();
  await page.click('#role-continue-btn');
  await page.locator('.area-item').first().click();
  await page.click('#area-continue-btn');
  await page.locator('#choices button', { hasText: 'Journeyman' }).first().waitFor({ state: 'attached' });
  await page.evaluate(() => [...document.querySelectorAll('#choices button')].find((b) => /Journeyman/.test(b.textContent)).click());
  await page.waitForFunction(() => localStorage.getItem('bcft.activeRun.v1'));

  // Move the saved run to a later day with the offer lane due, then resume.
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('bcft.activeRun.v1'));
    save.journey.day = 4;
    delete save.journey.daySeed;
    save.journey.temptationMemory = { lastDay: 0, missedEligibleDays: 99 };
    localStorage.setItem('bcft.activeRun.v1', JSON.stringify(save));
  });
  await page.reload();
  await page.locator('#modal-actions button', { hasText: 'Resume Expedition' }).click();
  await page.waitForSelector('#terminal .term-shortcut.term-anchor');
}

async function expectAnchorInView(page) {
  const { anchorTop, anchorBottom, paneTop, paneBottom, text } = await page.evaluate(() => {
    const pane = document.getElementById('terminal').getBoundingClientRect();
    const anchor = document.querySelector('#terminal .term-anchor');
    const box = anchor.getBoundingClientRect();
    return { anchorTop: box.top, anchorBottom: box.bottom, paneTop: pane.top, paneBottom: pane.bottom, text: anchor.innerText };
  });
  expect(text).toMatch(/^== SHORTCUT · (IN THE INBOX|PHONE CALL|AT YOUR DESK) ==$/);
  expect(anchorTop).toBeGreaterThanOrEqual(paneTop - 1);
  expect(anchorBottom).toBeLessThanOrEqual(paneBottom + 1);
}

test('Classic desktop opens the card on its marker and tags the shortcut OFF-BOOK', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openShortcutCard(page, 'classic');
  await expectAnchorInView(page);
  const take = page.locator('#choices button', { hasText: 'Take the shortcut' });
  await expect(take.locator('.choice-tag')).toHaveText('OFF-BOOK');
  await expect(take.locator('.choice-hint')).toHaveText(/^today: \d+% clean · \d+% noticed · \d+% caught by /);
  await expect(page.locator('#terminal .term-stakes').first()).toHaveText(/^Take it and you get /);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('Modern on a phone keeps the marker and who is asking in the short log pane', async ({ page }) => {
    await openShortcutCard(page, 'modern');
    await expectAnchorInView(page);
    await expect(page.locator('#choices .decision-card', { hasText: 'Take the shortcut' }).locator('.choice-tag')).toHaveText('OFF-BOOK');
  });
});

test('ASCII Grid shows the marker and, on focus, the full odds and cost of the shortcut', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openShortcutCard(page, 'grid');
  const gridText = () => page.evaluate(() => {
    const r = window.__forestGame.ui.gridView.renderer;
    const rows = [];
    for (let y = 0; y < r.rows; y += 1) {
      let line = '';
      for (let x = 0; x < r.cols; x += 1) line += r._cells[y * r.cols + x]?.ch || ' ';
      rows.push(line);
    }
    return rows.join('\n');
  });
  await expect.poll(gridText).toMatch(/== SHORTCUT · /);

  // Keyboard-first: arrow to the shortcut and its detail gets rows of its own.
  await page.evaluate(() => document.querySelector('#choices button')?.focus());
  await expect.poll(async () => {
    const at = await page.evaluate(() => document.activeElement?.innerText?.trim().charAt(0));
    if (at !== '2') await page.keyboard.press('ArrowDown');
    return at;
  }).toBe('2');
  await expect.poll(gridText).toMatch(/> 2 Take the shortcut\s+‹OFF-BOOK›/);
  const text = await gridText();
  const detail = text.slice(text.indexOf('> 2 Take the shortcut'));
  expect(detail.replace(/[│\s]+/g, ' ')).toMatch(/today: \d+% clean · \d+% noticed · \d+% caught by .* offer: /);
});

test.describe('phone grid', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('a tap on the shortcut opens its whole detail; only a second tap takes it', async ({ page }) => {
    await openShortcutCard(page, 'grid');
    const grid = () => page.evaluate(() => {
      const r = window.__forestGame.ui.gridView.renderer;
      const rows = [];
      for (let y = 0; y < r.rows; y += 1) {
        let line = '';
        for (let x = 0; x < r.cols; x += 1) line += r._cells[y * r.cols + x]?.ch || ' ';
        rows.push(line);
      }
      return rows;
    });
    const tapRow = async (pattern) => {
      const rows = await grid();
      const row = rows.findIndex((line) => pattern.test(line));
      expect(row, rows.join('\n')).toBeGreaterThan(0);
      const box = await page.locator('#grid-canvas').boundingBox();
      const cellH = await page.evaluate(() => window.__forestGame.ui.gridView.renderer.cellH);
      await page.touchscreen.tap(box.x + 120, box.y + (row + 0.5) * cellH);
    };

    await expect.poll(async () => (await grid()).join('\n')).toMatch(/2 Take the shortcut/);
    await tapRow(/2 Take the shortcut/);
    await expect.poll(async () => (await grid()).join('\n')).toMatch(/Tap again to take it\./);
    const text = (await grid()).join('\n');
    const detail = text.slice(text.indexOf('> 2 Take the shortcut'), text.indexOf('Tap again'));
    expect(detail).not.toContain('…');
    expect(detail.replace(/[│\s]+/g, ' ')).toMatch(/today: \d+% clean · \d+% noticed · \d+% caught by .* offer: /);
    await expect(page.locator('#terminal')).not.toContainText('> Take the shortcut');

    await tapRow(/> 2 Take the shortcut/);
    await expect(page.locator('#terminal')).toContainText('> Take the shortcut');
  });
});
