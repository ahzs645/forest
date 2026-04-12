import { test, expect } from '@playwright/test';

import {
  advanceDecision,
  expectSetupHeading,
  gotoSeasonalTui,
  openCurrentDecision,
  SEASONAL_TUI_SEEDS,
  startSeasonalRun,
} from './tui-browser.helpers.js';

async function collectDecisionScreens(page, count) {
  const decisions = [];

  while (decisions.length < count) {
    const fieldText = await page.locator('.tui-field-main').innerText();
    if (fieldText.includes('What am I deciding?')) {
      decisions.push(fieldText);
    }
    await advanceDecision(page);
  }

  return decisions;
}

test('seasonal role picker stays keyboard-only and filters out the manager role', async ({ page }) => {
  await gotoSeasonalTui(page, SEASONAL_TUI_SEEDS[0]);
  await page.keyboard.press('Enter');
  await expectSetupHeading(page, 'Select your Specialization');

  const roleOptions = await page.locator('.tui-options button').allInnerTexts();
  expect(roleOptions.some((label) => label.includes('General Manager'))).toBeFalsy();
  expect(roleOptions.some((label) => label.includes('Field Technician'))).toBeTruthy();
});

const ROLE_AREA_SCENARIOS = [
  {
    title: 'Strategic Planner in the north/interior lane',
    seed: SEASONAL_TUI_SEEDS[0],
    roleLabel: 'Strategic Planner',
    areaLabel: 'Fraser Plateau Uplands',
  },
  {
    title: 'Permitting Specialist in the north/interior lane',
    seed: SEASONAL_TUI_SEEDS[1],
    roleLabel: 'Permitting Specialist',
    areaLabel: 'Muskwa Foothills',
  },
  {
    title: 'Field Technician on the coast lane',
    seed: SEASONAL_TUI_SEEDS[2],
    roleLabel: 'Field Technician',
    areaLabel: 'Vancouver Island Coast',
  },
  {
    title: 'Silviculture Supervisor in the drybelt lane',
    seed: SEASONAL_TUI_SEEDS[3],
    roleLabel: 'Silviculture Supervisor',
    areaLabel: 'Okanagan/Shuswap Drybelt',
  },
];

for (const scenario of ROLE_AREA_SCENARIOS) {
  test(`setup smoke stays stable for ${scenario.title}`, async ({ page }) => {
    const { runtimeErrors } = await startSeasonalRun(page, scenario);

    await openCurrentDecision(page);
    const decisions = await collectDecisionScreens(page, 10);

    expect(decisions).toHaveLength(10);
    expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
  });
}
