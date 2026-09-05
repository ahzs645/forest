import { test, expect } from '@playwright/test';

// Exercise every deployment and the year-end handoff. A spring-only smoke
// cannot catch a stalled planning season or a broken final debrief.
test('campaign plays all four seasons through the year-end review', async ({ page }) => {
  test.setTimeout(240000);
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await page.addInitScript(() => {
    let seed = 4242;
    Math.random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.click('#campaign-btn');

  const skip = /Glossary|Intel|Status|Help|Restart|Review the|More context|locked|NEEDS|Never mind|Program Binder|Consult|Briefing$|Camp & Support/i;
  // Objective-focused priorities keep the bot from wandering: close packages,
  // travel the mainline, and always take flow-advancing prompts.
  const prefer = [
    /Move out|On to |Close out the year|Begin|Continue|Confirm|Move On|Fold the map|Back to/i,
    /Journeyman/i,
    /Field Notebook|Ground-Truth|Values Sweep/i,
    /Standard Recon|Stay Mainline/i,
  ];
  const reviews = new Set();
  let sawYearEnd = false;

  for (let step = 0; step < 1600 && !sawYearEnd; step++) {
    await page.waitForTimeout(100);

    if (await page.locator('#input-wrapper').isVisible().catch(() => false)) {
      await page.locator('#text-input').fill('Smoke Crew');
      await page.click('#submit-btn');
      continue;
    }

    const body = await page.locator('body').innerText();
    for (const season of ['SPRING', 'SUMMER', 'FALL', 'WINTER']) {
      if (body.includes(`${season} REVIEW`)) reviews.add(season);
    }
    if (/YEAR IN REVIEW/.test(body)) {
      sawYearEnd = true;
      break;
    }

    const buttons = page.locator('#choices button');
    const labels = await buttons.evaluateAll((nodes) =>
      nodes.filter((n) => n.offsetParent !== null && !n.disabled).map((n) => n.innerText.replace(/\s+/g, ' ').trim()));
    if (!labels.length) continue;
    let index = -1;
    for (const re of prefer) {
      index = labels.findIndex((label) => re.test(label) && !skip.test(label));
      if (index >= 0) break;
    }
    if (index < 0) index = labels.findIndex((label) => !skip.test(label));
    if (index < 0) index = 0;
    await buttons.nth(index).click({ timeout: 3000 }).catch(() => {});
  }

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
  expect([...reviews], 'every deployment should reach its season review').toEqual(['SPRING', 'SUMMER', 'FALL', 'WINTER']);
  expect(sawYearEnd, 'year-end review never rendered').toBeTruthy();
  await page.locator('#choices button').filter({ hasText: 'Return to the district office' }).click();
  await expect(page.locator('#campaign-btn')).toBeVisible();
});
