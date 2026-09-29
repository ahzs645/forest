// Seasonal shortcut offers, their fallout, and the classic view's panels.
// Each test parks a real seeded run at the season boundary just before the
// card under test (found headlessly through the same controller), resumes it
// in the browser, and plays option 1 up to the card.
import { test, expect } from '@playwright/test';

import { TuiGameController } from '../../tui/controller.js';
import { attachRuntimeErrorCollector } from './tui-browser.helpers.js';

const SAVE_KEY = 'bc-forestry-trail/seasonal-run/v1';
const THEMES = ['dark', 'green', 'amber', 'ice'];

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

/**
 * Play seeded Strategic Planner years on option 1 (taking every shortcut)
 * until `match` accepts a card; return the season-boundary save and how many
 * cards into that season the card sits (the season's opening card is 0).
 */
function findCard(match) {
  for (let seed = 1; seed <= 400; seed += 1) {
    const storage = memoryStorage();
    const controller = new TuiGameController({ seed: seed * 7919, storage, onExit: () => {} });
    controller.setInputText('Fixture Crew');
    controller.submitCurrent();
    controller.selectOption(0);
    controller.selectOption(seed % 9);
    let round = 0;
    let index = 0;
    for (let step = 0; step < 80 && controller.getState().mode !== 'end'; step += 1) {
      if (controller.gs.round !== round) {
        round = controller.gs.round;
        index = 0;
      }
      const data = controller.getState().contentData;
      if (match(data)) return { save: storage.getItem(SAVE_KEY), index, title: data.title };
      controller.selectOption(data.type === 'temptation' ? data.shortcut.takeIndex : 0);
      index += 1;
    }
  }
  throw new Error('no seeded run reached the card');
}

const OFFER = findCard((data) => data.type === 'temptation' && data.shortcut?.odds);
const FALLOUT = findCard((data) => /^Because you took: /.test(data.provenance || ''));

async function resumeInto(page, card, { view, theme = 'dark' }) {
  await page.addInitScript(({ key, save, themeId }) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem(key, save);
    localStorage.setItem('bcForestry_theme', themeId);
  }, { key: SAVE_KEY, save: card.save, themeId: theme });
  await page.goto(view === 'hub' ? '/?mode=seasonal' : '/tui.html?classic=1');
  const first = page.locator(view === 'hub' ? '#choices button' : '.tui-option').first();
  await expect(first).toContainText('Resume seasonal run');
  // Keyboard-first: resume, then option 1 up to the card.
  for (let i = 0; i <= card.index; i += 1) {
    await expect(first).toBeVisible();
    await page.keyboard.press('1');
    await page.waitForTimeout(120);
  }
}

// Whether `from` .. `to` sits wholly inside what the player can see without
// scrolling: the scrolling panel when it scrolls, else the window.
async function readableWithoutScrolling(page, panelSelector, fromSelector, toSelector) {
  return page.evaluate(([panelSel, fromSel, toSel]) => {
    const panel = document.querySelector(panelSel);
    const from = document.querySelector(fromSel);
    const to = document.querySelector(toSel);
    if (!panel || !from || !to) return { ok: false, why: 'missing' };
    const view = panel.scrollHeight > panel.clientHeight + 1
      ? panel.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight };
    const top = from.getBoundingClientRect().top;
    const bottom = to.getBoundingClientRect().bottom;
    return { ok: top >= view.top - 1 && bottom <= view.bottom + 1, top, bottom, view: [view.top, view.bottom] };
  }, [panelSelector, fromSelector, toSelector]);
}

for (const theme of THEMES) {
  test(`hub: the offer is priced and styled as a legal call in the ${theme} theme`, async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await resumeInto(page, OFFER, { view: 'hub', theme });

    const banner = page.locator('#terminal .term-shortcut-banner');
    await expect(banner).toContainText(/Shortcut offer/i);
    await expect(page.locator('#terminal .term-header').last()).toHaveText(OFFER.title);
    const odds = (await page.locator('#terminal .term-shortcut-odds').innerText()).match(/holds (\d+)% · caught (\d+)%/);
    expect(odds, 'the odds line states both bands').not.toBeNull();

    const options = page.locator('#choices button');
    await expect(options.first()).toContainText(/Decline|Say no/);
    await expect(options.filter({ hasText: 'Take the shortcut' })).toContainText(`Holds ${odds[1]}%`);
    await expect(options.filter({ hasText: 'Take the shortcut' })).toContainText(`Caught ${odds[2]}%`);
    await expect(options.filter({ hasText: 'More context' })).toHaveCount(0);

    const fit = await readableWithoutScrolling(page, '#terminal', '#terminal .term-shortcut-banner', '#terminal .term-shortcut-odds');
    expect(fit.ok, JSON.stringify(fit)).toBe(true);

    // The banner wears this theme's danger token.
    const colours = await banner.evaluate((node) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--danger)';
      document.body.append(probe);
      const danger = getComputedStyle(probe).color;
      probe.remove();
      return { banner: getComputedStyle(node).color, danger };
    });
    expect(colours.banner).toBe(colours.danger);

    // Enter on the default refuses.
    await page.keyboard.press('Enter');
    await expect(page.locator('#terminal')).toContainText(/On the record: (Decline|Say no)/);
    expect(errors).toEqual([]);
  });
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`classic view: the whole offer is readable without scrolling at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await page.setViewportSize(viewport);
    await resumeInto(page, OFFER, { view: 'classic' });

    await expect(page.locator('.tui-shortcut-banner')).toContainText(/Shortcut offer/i);
    await expect(page.locator('.tui-last-decision')).toHaveCount(0);
    const fit = await readableWithoutScrolling(page, '.tui-field-main', '.tui-shortcut-banner', '.tui-shortcut-terms');
    expect(fit.ok, JSON.stringify(fit)).toBe(true);

    const odds = (await page.locator('.tui-shortcut-odds').innerText()).match(/holds (\d+)% · caught (\d+)%/);
    expect(odds).not.toBeNull();
    const take = page.locator('.tui-option').filter({ hasText: 'Take the shortcut' });
    await expect(take.locator('.tui-option-band').first()).toContainText(`Holds ${odds[1]}%`);
    await expect(take.locator('.tui-option-band').nth(1)).toContainText(`Caught ${odds[2]}%`);
    await expect(page.locator('.tui-field-main')).not.toContainText('Pressure points');
    await expect(page.locator('.tui-field-main')).not.toContainText('The upside here is');

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const view of ['hub', 'classic']) {
  test(`${view}: a shortcut's fallout names the shortcut under its title`, async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await resumeInto(page, FALLOUT, { view });
    const selector = view === 'hub' ? '#terminal .term-provenance' : '.tui-provenance';
    await expect(page.locator(selector)).toContainText(/^Because you took: .+ shortcut\.$/);
    const fit = await readableWithoutScrolling(
      page,
      view === 'hub' ? '#terminal' : '.tui-field-main',
      selector,
      selector,
    );
    expect(fit.ok, JSON.stringify(fit)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('classic view: G, P, L, S and ? open their panels and Escape closes them', async ({ page }) => {
  const errors = attachRuntimeErrorCollector(page);
  await resumeInto(page, OFFER, { view: 'classic' });
  const panels = { g: 'Glossary', p: 'Professional / compliance intel', l: 'Journey log', s: 'Status', '?': 'How to play' };
  for (const [key, name] of Object.entries(panels)) {
    await page.keyboard.press(key);
    await expect(page.getByRole('dialog', { name })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  // Escape closed the panels only: the offer is still waiting.
  await expect(page.locator('.tui-shortcut-banner')).toBeVisible();
  await page.getByRole('button', { name: /Log/ }).click();
  await expect(page.getByRole('dialog', { name: 'Journey log' })).toContainText('Season');
  expect(errors).toEqual([]);
});

test('hub: Play Again starts the new year without last year\'s meters in the dashboard', async ({ page }) => {
  const errors = attachRuntimeErrorCollector(page);
  const winter = findCard((data) => data.type === 'message' && data.heading === 'Winter Operations');
  await resumeInto(page, winter, { view: 'hub' });
  await expect(page.locator('#mission-panel')).toContainText('Budget');
  const options = page.locator('#choices button');
  for (let step = 0; step < 20; step += 1) {
    if (await options.filter({ hasText: 'Play Again' }).count()) break;
    await page.keyboard.press('1');
    await page.waitForTimeout(120);
  }
  await options.filter({ hasText: 'Play Again' }).click();
  await expect(page.locator('#terminal')).toContainText('SEASONAL STRATEGY');
  await expect(page.locator('#mission-section')).toBeHidden();
  await expect(page.locator('#mission-panel')).not.toContainText('Budget');
  expect(errors).toEqual([]);
});

test('a partial seasonal save is named and discarded, never resumed', async ({ page }) => {
  const errors = attachRuntimeErrorCollector(page);
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem(key, '{"version":1,"round":1,"state":{"role":"planner","metrics":{}}}');
  }, SAVE_KEY);
  await page.goto('/');
  await expect(page.locator('#modal-body')).toContainText('seasonal run');
  await page.keyboard.press('Enter');
  await expect(page.locator('#modal')).toBeHidden();
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBeNull();
  await page.click('#load-game-btn');
  await expect(page.locator('#modal-body')).toContainText('No saved games found');
  expect(errors).toEqual([]);
});
