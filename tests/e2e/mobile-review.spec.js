import { test, expect } from '@playwright/test';

// A touch-context matrix for the main game, including the smallest supported
// phones and short landscape screens. These assertions check reachable UI,
// not just whether the simulation can advance underneath it.
const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 }
];
const roles = ['planner', 'permitter', 'recon', 'silviculture', 'manager'];

test.use({ isMobile: true, hasTouch: true, actionTimeout: 15000 });
test.setTimeout(45000);

async function seed(page, value = 6001) {
  await page.addInitScript((initial) => {
    let value = initial;
    Math.random = () => ((value = (1664525 * value + 1013904223) >>> 0) / 0x100000000);
  }, value);
}

async function layout(page, label, choices = false) {
  const size = await page.evaluate(() => ({
    actual: document.scrollingElement.scrollWidth,
    expected: window.innerWidth,
    pageHeight: document.scrollingElement.scrollHeight,
    viewportHeight: window.innerHeight
  }));
  expect.soft(size.actual, `${label}: horizontal overflow`).toBeLessThanOrEqual(size.expected + 1);
  if (!choices) return;
  const rows = page.locator('#choices button');
  await expect(rows.first()).toBeVisible();
  const dimensions = await rows.evaluateAll((nodes) => nodes.map((node) => {
    const r = node.getBoundingClientRect();
    return { width: r.width, height: r.height };
  }));
  for (const r of dimensions) {
    expect.soft(r.width, `${label}: choice width`).toBeGreaterThanOrEqual(44);
    expect.soft(r.height, `${label}: choice height`).toBeGreaterThanOrEqual(44);
  }
  // Scroll the choices only, as a player would. A short landscape window must
  // not require an impossible scroll of its fixed-height document.
  const reach = await page.locator('#choices').evaluate((list) => {
    list.scrollTop = list.scrollHeight;
    const last = list.lastElementChild.getBoundingClientRect();
    const bounds = list.getBoundingClientRect();
    return { lastTop: last.top, lastBottom: last.bottom, listTop: bounds.top, listBottom: bounds.bottom, viewport: innerHeight };
  });
  expect.soft(reach.lastBottom, `${label}: last choice below viewport`).toBeLessThanOrEqual(reach.viewport + 1);
  expect.soft(reach.lastBottom, `${label}: last choice clipped by list`).toBeLessThanOrEqual(reach.listBottom + 1);
  // Scroll positions can round by half a CSS pixel at phone widths.
  expect.soft(Math.ceil(Math.min(reach.lastBottom, reach.listBottom, reach.viewport) - Math.max(reach.lastTop, reach.listTop, 0)),
    `${label}: last choice needs a touch-sized visible portion`).toBeGreaterThanOrEqual(44);
  await page.locator('#choices').evaluate((list) => { list.scrollTop = 0; });
}

async function startRole(page, index) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('#new-game-btn').tap();
  await page.locator('#intro-continue-btn').tap();
  await page.locator('.role-card').nth(index).tap();
  await page.locator('#role-continue-btn').tap();
  await page.locator('.area-item').nth(index % 4).tap();
  await page.locator('#area-continue-btn').tap();
  await page.locator('#choices button').filter({ hasText: 'Greenhorn' }).tap();
  await expect(page.locator('#choices button').first()).toBeVisible();
}

for (const viewport of viewports) {
  test.describe(`${viewport.width}x${viewport.height} touch`, () => {
    test.use({ viewport });
    for (const [index, role] of roles.entries()) {
      test(`${role} supports choices, status, and saved resume`, async ({ page }, testInfo) => {
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await seed(page, 6001 + index);
        await startRole(page, index);
        await layout(page, `${role} opening`, true);
        await page.screenshot({ path: testInfo.outputPath('opening.png') });
        // Exercise more than the static first-day layout, including result
        // acknowledgements and the next day/event menu.
        for (let action = 0; action < 6; action += 1) {
          await page.locator('#choices button').first().tap();
          await expect(page.locator('#choices button').first()).toBeVisible();
          await layout(page, `${role} action ${action + 1}`, true);
        }
        await page.locator('#status-btn').tap();
        await expect(page.locator('#side-panel')).toBeInViewport();
        await layout(page, `${role} status`);
        await page.screenshot({ path: testInfo.outputPath('status.png') });
        await page.locator('#close-panel').tap();
        await page.reload();
        await expect(page.locator('#modal-actions').getByRole('button', { name: 'Resume Expedition' })).toBeVisible();
        await layout(page, `${role} resume modal`);
        await page.locator('#modal-actions').getByRole('button', { name: 'Resume Expedition' }).tap();
        await expect(page.locator('#choices button').first()).toBeVisible();
        await layout(page, `${role} resumed`, true);
        expect(errors).toEqual([]);
      });
    }

    test('campaign setup and field decisions remain touch reachable', async ({ page }, testInfo) => {
      await seed(page);
      await page.goto('/');
  await page.waitForLoadState('networkidle');
      await layout(page, 'landing');
      await page.locator('#campaign-btn').tap();
      await layout(page, 'campaign area', true);
      await page.locator('#choices button').first().tap();
      await page.locator('#choices button').filter({ hasText: 'Journeyman' }).tap();
      await page.locator('#text-input').fill('Mobile Review Crew');
      await page.locator('#submit-btn').tap();
      await expect(page.locator('#choices button').first()).toBeVisible();
      for (let action = 0; action < 6; action += 1) {
        await layout(page, `campaign action ${action + 1}`, true);
        await page.locator('#choices button').first().tap();
        await expect(page.locator('#choices button').first()).toBeVisible();
      }
      await page.screenshot({ path: testInfo.outputPath('campaign.png') });
    });
  });
}

for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test.describe(`Modern ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test('area cards have enough visible space to read and tap', async ({ page }, testInfo) => {
      await page.addInitScript(() => localStorage.setItem('bcForestry_displayMode', 'modern'));
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.locator('#campaign-btn').tap();
      const first = page.locator('#choices button').first();
      await expect(first).toBeVisible();
      const geometry = await first.evaluate((button) => {
        const b = button.getBoundingClientRect();
        const list = button.parentElement.getBoundingClientRect();
        const visibleTop = Math.max(0, b.top, list.top);
        const visibleBottom = Math.min(innerHeight, b.bottom, list.bottom);
        const midpoint = { x: b.left + Math.min(b.width, innerWidth - b.left) / 2, y: (visibleTop + visibleBottom) / 2 };
        return {
          visibleHeight: Math.max(0, visibleBottom - visibleTop),
          canHit: button.contains(document.elementFromPoint(midpoint.x, midpoint.y))
        };
      });
      await page.screenshot({ path: testInfo.outputPath('modern-area.png') });
      expect(geometry.visibleHeight, 'operating area needs a readable touch-sized card').toBeGreaterThanOrEqual(44);
      expect(geometry.canHit, 'a visible part of the area card must receive taps').toBeTruthy();
      await first.tap();
      await expect(page.locator('#choices')).toContainText('Journeyman');
    });
  });
}

for (const viewport of viewports) {
  test.describe(`Seasonal Strategy ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test('main-menu strategy flow advances with touch and readable decisions', async ({ page }, testInfo) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await seed(page, 4242);
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.locator('#tui-mode-btn').tap();
      await page.locator('#text-input').fill('Mobile Strategy Crew');
      await page.locator('#submit-btn').tap();
      let decisions = 0;
      for (let step = 0; step < 16; step += 1) {
        await expect(page.locator('#choices button').first()).toBeVisible();
        await layout(page, `strategy step ${step + 1}`, true);
        if ((await page.locator('#choices button').count()) > 1) decisions += 1;
        await page.locator('#choices button').first().tap();
      }
      await page.screenshot({ path: testInfo.outputPath('seasonal-strategy.png') });
      expect(decisions).toBeGreaterThan(3);
      expect(errors).toEqual([]);
    });
  });
}
