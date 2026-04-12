import { test, expect } from '@playwright/test';

import {
  advanceDecision,
  getCurrentCardSnapshot,
  openCurrentDecision,
  SEASONAL_TUI_SEEDS,
  startSeasonalRun,
} from './tui-browser.helpers.js';

async function captureDecisionSamples(page, targetCount) {
  const samples = [];

  while (samples.length < targetCount) {
    const fieldText = await page.locator('.tui-field-main').innerText();
    if (fieldText.includes('What am I deciding?')) {
      samples.push(await getCurrentCardSnapshot(page));
    }
    await advanceDecision(page);
  }

  return samples;
}

function expectCardContract(snapshot) {
  expect(snapshot.fieldText).toContain('What job am I doing?');
  expect(snapshot.fieldText).toContain('What changed?');
  expect(snapshot.fieldText).toContain('Why does it matter now?');
  expect(snapshot.fieldText).toContain('What am I deciding?');
  expect(snapshot.options.length).toBeGreaterThan(0);
}

const CONTRACT_SCENARIOS = [
  {
    title: 'north/interior contract run',
    seed: SEASONAL_TUI_SEEDS[1],
    roleLabel: 'Permitting Specialist',
    areaLabel: 'Muskwa Foothills',
  },
  {
    title: 'coast contract run',
    seed: SEASONAL_TUI_SEEDS[2],
    roleLabel: 'Field Technician',
    areaLabel: 'Vancouver Island Coast',
  },
  {
    title: 'drybelt contract run',
    seed: SEASONAL_TUI_SEEDS[3],
    roleLabel: 'Silviculture Supervisor',
    areaLabel: 'Okanagan/Shuswap Drybelt',
  },
];

for (const scenario of CONTRACT_SCENARIOS) {
  test(`seasonal card contract holds for ${scenario.title}`, async ({ page }) => {
    const { runtimeErrors } = await startSeasonalRun(page, scenario);

    await openCurrentDecision(page);
    await expect(page.locator('.tui-art')).toHaveCount(0);

    const firstCard = await getCurrentCardSnapshot(page);
    expectCardContract(firstCard);

    await advanceDecision(page);
    const samples = await captureDecisionSamples(page, 3);
    expect(samples.length).toBeGreaterThanOrEqual(3);
    for (const sample of samples) {
      expectCardContract(sample);
    }

    await expect(page.locator('.tui-art')).toHaveCount(0);
    expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
  });
}
