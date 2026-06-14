import { test, expect } from '@playwright/test';

const DEFAULT_SEED = 20260411;

function normalizeText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

async function seedBrowser(page, seed) {
  await page.addInitScript((seedStart) => {
    let seedValue = seedStart;
    Math.random = () => {
      seedValue = (1664525 * seedValue + 1013904223) >>> 0;
      return seedValue / 0x100000000;
    };
  }, seed);
}

async function bootSeasonalTui(page, seed = DEFAULT_SEED) {
  await seedBrowser(page, seed);
  await page.goto('/tui.html');

  await expect(page.locator('.tui-heading')).toContainText('Welcome to BC Forestry Trail');

  await page.keyboard.press('Enter');
  await expect(page.locator('.tui-heading')).toHaveText('Select your Specialization');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tui-heading')).toHaveText('Select your Operating Area');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  await expect(page.locator('.tui-field-main')).toContainText('What job am I doing?');
}

async function readPromptSnapshot(page) {
  const heading = normalizeText(await page.locator('.tui-heading').first().innerText());
  const sourceLabels = (await page.locator('.tui-source-label').allInnerTexts()).map(normalizeText).filter(Boolean);
  const fieldText = normalizeText(await page.locator('.tui-field-main').innerText());
  const cardKey = sourceLabels[0] || sourceLabels[1] || heading;

  return {
    heading,
    sourceLabels,
    fieldText,
    familyKey: normalizeText(cardKey).replace(/\s*:\s*.*$/, ''),
  };
}

function looksLikeEscalationChain(snapshot) {
  const text = [snapshot.heading, snapshot.fieldText, ...snapshot.sourceLabels].join(' ');
  return /(?:\bchain\b|\bfollow[- ]?up\b|\bescalat(?:e|ion)\b)/i.test(text);
}

function assertNoDuplicateFamilies(history) {
  for (let index = 1; index < history.length; index += 1) {
    const previous = history[index - 1];
    const current = history[index];

    if (current.familyKey === previous.familyKey) {
      const allowed = looksLikeEscalationChain(current) || looksLikeEscalationChain(previous);
      expect(
        allowed,
        [
          `Repeated prompt family without an explicit escalation chain: ${current.familyKey}`,
          `Previous: ${previous.heading} | ${previous.sourceLabels.join(' / ') || '(no source label)'}`,
          `Current: ${current.heading} | ${current.sourceLabels.join(' / ') || '(no source label)'}`,
        ].join('\n'),
      ).toBeTruthy();
    }
  }
}

async function autoplayToSummary(page, seed = DEFAULT_SEED) {
  await bootSeasonalTui(page, seed);

  const history = [];
  for (let step = 0; step < 120; step += 1) {
    const snapshot = await readPromptSnapshot(page);
    if (snapshot.heading === 'Year End Review') {
      return {
        history,
        summary: snapshot,
      };
    }

    history.push(snapshot);
    const previousFieldText = snapshot.fieldText;
    await page.keyboard.press('Enter');

    await page.waitForFunction(
      (previous) => {
        const main = document.querySelector('.tui-field-main');
        return !!main && main.textContent?.replace(/\s+/g, ' ').trim() !== previous;
      },
      previousFieldText,
      { timeout: 10000 },
    );
  }

  throw new Error('Timed out before reaching the Year End Review summary');
}

test('autoplays to the year-end review and exposes summary actions', async ({ page }) => {
  const result = await autoplayToSummary(page, DEFAULT_SEED);

  assertNoDuplicateFamilies(result.history);

  await expect(page.locator('.tui-heading')).toHaveText('Year End Review');
  await expect(page.locator('.tui-field-main')).toContainText('Key Decisions');
  await expect(page.locator('.tui-field-main')).toContainText('Next Year Outlook');
  await expect(page.locator('.tui-options button').nth(0)).toContainText('Play Again');
  await expect(page.locator('.tui-options button').nth(1)).toContainText('Quit');
});

test('summary play-again restarts back to the welcome screen', async ({ page }) => {
  await autoplayToSummary(page, DEFAULT_SEED + 1);

  await page.keyboard.press('Enter');
  await expect(page.locator('.tui-heading')).toContainText('Welcome to BC Forestry Trail');
  await expect(page.locator('.tui-options button')).toHaveCount(0);
});

test('escape on a live run confirms before exiting to the landing screen', async ({ page }) => {
  await bootSeasonalTui(page, DEFAULT_SEED + 2);

  // Escape no longer quits instantly mid-run — it raises a confirm overlay so an
  // accidental keypress can't throw away a seasonal run.
  await page.keyboard.press('Escape');
  await expect(page.locator('.tui-heading')).toHaveText('Return to the main menu?');
  await expect(page.locator('.tui-options button')).toHaveText(['1Continue run', '2Main menu']);

  // Continuing keeps the run alive on the same decision card.
  await page.keyboard.press('Enter');
  await expect(page.locator('.tui-field-main')).toContainText('What job am I doing?');

  // Escape again, then confirm the exit (Main menu is the second option).
  await page.keyboard.press('Escape');
  await expect(page.locator('.tui-heading')).toHaveText('Return to the main menu?');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/index\.html$/);
  await expect(page.locator('#new-game-btn')).toBeVisible();
});

test('repeated seeded keyboard-only runs stay deterministic', async ({ page }) => {
  const firstRun = await autoplayToSummary(page, DEFAULT_SEED + 3);

  const secondPage = await page.context().newPage();
  try {
    const secondRun = await autoplayToSummary(secondPage, DEFAULT_SEED + 3);

    assertNoDuplicateFamilies(firstRun.history);
    assertNoDuplicateFamilies(secondRun.history);

    expect(secondRun.summary.heading).toBe(firstRun.summary.heading);
    expect(secondRun.summary.fieldText).toBe(firstRun.summary.fieldText);
    expect(secondRun.history.map((entry) => entry.familyKey)).toEqual(
      firstRun.history.map((entry) => entry.familyKey),
    );
  } finally {
    await secondPage.close();
  }
});
