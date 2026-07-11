import { test, expect } from '@playwright/test';

const FAILURE_RUNS = [
  {
    name: 'planner',
    roleIndex: 0,
    areaIndex: 0,
    difficultyLabel: 'Old Growth',
    seed: 7004,
    expectedReason: /(Lost political support|Cabinet window closed before approval|Budget exhausted)/i
  },
  {
    name: 'permitter',
    roleIndex: 1,
    areaIndex: 1,
    difficultyLabel: 'Old Growth',
    seed: 7000,
    expectedReason: /(Lost political support|Budget exhausted|Failed to meet deadline)/i
  },
  {
    name: 'recce',
    roleIndex: 2,
    areaIndex: 2,
    difficultyLabel: 'Old Growth',
    seed: 7000,
    expectedReason: /(ALL CREW LOST|OUT OF FUEL|stranded)/i
  },
  {
    name: 'silviculture',
    roleIndex: 3,
    areaIndex: 3,
    difficultyLabel: 'Old Growth',
    seed: 7000,
    maxSteps: 1000,
    expectedReason: /(Budget exhausted|No contractor capacity|fell short of its targets)/i
  }
];

test.describe.configure({ mode: 'serial' });

for (const run of FAILURE_RUNS) {
  test(`${run.name} collapse playthrough reaches a clean losing state`, async ({ page }) => {
    const runtimeErrors = [];

    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        runtimeErrors.push(message.text());
      }
    });

    await page.addInitScript((seedStart) => {
      let seed = seedStart;
      Math.random = () => {
        seed = (1664525 * seed + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
    }, run.seed);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.click('#new-game-btn');
    await page.click('#intro-continue-btn');
    await page.locator('.role-card').nth(run.roleIndex).click();
    await page.click('#role-continue-btn');
    await page.locator('.area-item').nth(run.areaIndex).click();
    await page.click('#area-continue-btn');
    await page.locator('#choices button').filter({ hasText: run.difficultyLabel }).click();

    const result = await autoPlayToEnd(page, run.name, 'collapse', run.maxSteps || 420);

    expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
    expect(result.ended).toBeTruthy();
    expect(result.terminalText).toContain('EXPEDITION FAILED');
    expect(result.terminalText).toMatch(run.expectedReason);
  });
}

async function autoPlayToEnd(page, modeName, strategy, maxSteps = 420) {
  for (let step = 0; step < maxSteps; step++) {
    const terminalText = await page.locator('#terminal').innerText();
    if (isEndScreen(terminalText)) {
      return { ended: true, steps: step, terminalText };
    }

    await page.waitForSelector('#choices button', { timeout: 15000 });
    const buttons = page.locator('#choices button');
    const labels = await buttons.evaluateAll((nodes) =>
      nodes.map((node) => node.innerText.replace(/\s+/g, ' ').trim())
    );

    if (labels.length === 1 && labels[0].includes('New Expedition')) {
      return {
        ended: true,
        steps: step,
        terminalText: await page.locator('#terminal').innerText()
      };
    }

    const choiceIndex = pickChoice(labels, terminalText, modeName, strategy);
    await buttons.nth(choiceIndex).click();
  }

  return {
    ended: false,
    steps: maxSteps,
    terminalText: await page.locator('#terminal').innerText()
  };
}

function pickChoice(labels, terminalText, modeName, strategy) {
  if (labels.length === 1) {
    return 0;
  }

  if (strategy === 'collapse') {
    return pickCollapseChoice(labels, terminalText, modeName);
  }

  return 0;
}

function pickCollapseChoice(labels, terminalText, modeName) {
  const hpLabels = labels
    .map((label, index) => {
      const match = label.match(/\((\d+)% HP/);
      return match ? { index, hp: Number(match[1]) } : null;
    })
    .filter(Boolean);
  if (hpLabels.length) {
    hpLabels.sort((left, right) => right.hp - left.hp);
    return hpLabels[0].index;
  }

  if (modeName === 'recce' && (labels.some((label) => label.includes('Safe Detour')) || labels.some((label) => label.includes('Risky Shortcut')))) {
    return findFirstMatching(labels, ['Safe Detour', 'Stay Mainline', 'Risky Shortcut']);
  }

  if (modeName === 'recce' && (labels.some((label) => label.includes('Keep Full Rations')) || labels.some((label) => label.includes('Short Rations and Push On')))) {
    return findFirstMatching(labels, ['Keep Full Rations', 'Short Rations and Push On', 'Hunt & Forage Before Moving']);
  }

  if (labels.some((label) => label.includes('Safe Detour')) || labels.some((label) => label.includes('Risky Shortcut'))) {
    return findFirstMatching(labels, ['Risky Shortcut', 'Stay Mainline', 'Safe Detour']);
  }

  if (labels.some((label) => label.includes('Keep Full Rations')) || labels.some((label) => label.includes('Short Rations and Push On'))) {
    return findFirstMatching(labels, ['Short Rations and Push On', 'Keep Full Rations', 'Hunt & Forage Before Moving']);
  }

  if (terminalText.includes('RESUPPLY')) {
    return findFirstMatching(labels, ['Done', 'Fuel Drum', 'Field Repair', 'Rations Crate', 'First Aid Kit']);
  }

  if (modeName === 'planner') {
    // Key badges render as a bare leading digit ("3 Cutblock ..."), so match
    // the label after an optional key prefix rather than with startsWith.
    if (labels.some((label) => /^(\[?\d+\]?\s+)?(Cutblock|Opening) /.test(label))) {
      return 0;
    }
    if (labels.some((label) => label.includes('Emphasize Timber Supply'))) {
      return findFirstMatching(labels, ['Emphasize Timber Supply', 'Emphasize Community', 'Emphasize Biodiversity', 'Balanced Approach']);
    }
    return findFirstMatching(labels, ['Timber Assessment', 'Check Email', 'Network', 'Take a Break', 'End Day', 'Gather Data', 'Run Analysis', 'Stakeholder Session', 'Prepare Submission', 'Values Workshop']);
  }

  if (modeName === 'permitter') {
    return findFirstMatching(labels, ['Handle Crisis', 'Stakeholder Meeting', 'Team Building', 'Take a Break', 'End Day Early', 'Process Permits']);
  }

  if (modeName === 'recce') {
    const priorities = ['Ground-Truth Access', 'Values Sweep', 'Cautious Recon', 'Rest & End Shift', 'Standard Recon', 'Maintenance', 'Scout Ahead'];
    const matchIndex = labels.findIndex((label) => priorities.some((priority) => label.includes(priority)));
    return matchIndex === -1 ? labels.length - 1 : matchIndex;
  }

  if (modeName === 'silviculture') {
    return findFirstMatching(labels, ['Brush Treatment', 'Contractor Meeting', 'Team Briefing', 'Survival Check', 'End Day', 'Survey Free-Growing', 'Plant Block']);
  }

  return 0;
}

function findFirstMatching(labels, priorities) {
  for (const priority of priorities) {
    const index = labels.findIndex((label) => label.includes(priority));
    if (index !== -1) {
      return index;
    }
  }
  return 0;
}

function isEndScreen(text) {
  return text.includes('EXPEDITION SUCCESSFUL') || text.includes('EXPEDITION FAILED');
}
