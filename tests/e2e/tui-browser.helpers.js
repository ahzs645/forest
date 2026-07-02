import { expect } from '@playwright/test';

export const SEASONAL_TUI_SEEDS = [20260409, 20260410, 20260411, 20260412];

export function attachRuntimeErrorCollector(page) {
  const runtimeErrors = [];

  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  return runtimeErrors;
}

export async function installDeterministicSeed(page, seed) {
  await page.addInitScript((seedStart) => {
    let currentSeed = seedStart;
    Math.random = () => {
      currentSeed = (1664525 * currentSeed + 1013904223) >>> 0;
      return currentSeed / 0x100000000;
    };
  }, seed);
}

export async function gotoSeasonalTui(page, seed = SEASONAL_TUI_SEEDS[0]) {
  await installDeterministicSeed(page, seed);
  await page.goto('/tui.html?classic=1');
  await expect(page.locator('.tui-heading')).toContainText('Welcome to BC Forestry Trail');
}

export async function expectSetupHeading(page, heading) {
  await expect(page.locator('.tui-heading')).toHaveText(heading);
}

export async function chooseOptionByLabel(page, matcher) {
  const labels = await page.locator('.tui-options button').allInnerTexts();
  const targetIndex = labels.findIndex((label) => {
    if (matcher instanceof RegExp) {
      return matcher.test(label);
    }
    return label.includes(matcher);
  });

  expect(targetIndex, `expected option matching ${String(matcher)} in [${labels.join(', ')}]`).toBeGreaterThanOrEqual(0);

  for (let i = 0; i < targetIndex; i += 1) {
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');

  return {
    index: targetIndex,
    labels,
    chosenLabel: labels[targetIndex],
  };
}

export async function startSeasonalRun(page, { seed, roleLabel, areaLabel, companyName = '' }) {
  const runtimeErrors = attachRuntimeErrorCollector(page);
  await gotoSeasonalTui(page, seed);

  if (companyName) {
    await page.keyboard.type(companyName);
  }
  await page.keyboard.press('Enter');
  await expectSetupHeading(page, 'Select your Specialization');
  const roleSelection = await chooseOptionByLabel(page, roleLabel);

  await expectSetupHeading(page, 'Select your Operating Area');
  const areaSelection = await chooseOptionByLabel(page, areaLabel);

  await expect(page.locator('.tui-dashboard')).toContainText(roleLabel);
  await expect(page.locator('.tui-dashboard')).toContainText(areaLabel);

  return {
    runtimeErrors,
    roleSelection,
    areaSelection,
  };
}

export async function openCurrentDecision(page) {
  await expect(page.locator('.tui-options button').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tui-field-main')).toContainText('What am I deciding?');
}

export async function getCurrentCardSnapshot(page) {
  const heading = await page.locator('.tui-heading').first().innerText();
  const title = await page.locator('.tui-field-main .tui-heading').first().innerText();
  const cardLabel = await page.locator('.tui-source-label').allInnerTexts();
  const fieldText = await page.locator('.tui-field-main').innerText();
  const options = await page.locator('.tui-options button').allInnerTexts();

  return {
    heading,
    title,
    cardLabel,
    fieldText,
    options,
  };
}

export async function advanceDecision(page, labelMatcher = null) {
  await expect(page.locator('.tui-options button').first()).toBeVisible({ timeout: 5000 });

  if (!labelMatcher) {
    await page.keyboard.press('Enter');
    return;
  }

  await chooseOptionByLabel(page, labelMatcher);
}

export async function autoPlayToSummary(page, { maxSteps = 80 } = {}) {
  for (let step = 0; step < maxSteps; step += 1) {
    const heading = await page.locator('.tui-heading').first().innerText();
    if (heading === 'Year End Review') {
      return {
        ended: true,
        step,
        text: await page.locator('.tui-field-main').innerText(),
      };
    }

    await advanceDecision(page);
  }

  return {
    ended: false,
    step: maxSteps,
    text: await page.locator('.tui-field-main').innerText(),
  };
}
