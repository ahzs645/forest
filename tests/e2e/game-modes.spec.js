import { test, expect } from '@playwright/test';

const ROLE_RUNS = [
  { name: 'planner', roleIndex: 0, areaIndex: 0, seed: 1001 },
  { name: 'permitter', roleIndex: 1, areaIndex: 1, seed: 1002 },
  { name: 'recce', roleIndex: 2, areaIndex: 2, seed: 1003 },
  { name: 'silviculture', roleIndex: 3, areaIndex: 3, seed: 1004 },
  { name: 'manager', roleIndex: 4, areaIndex: 0, seed: 1005 }
];

const DIFFICULTIES = [
  { name: 'easy', label: 'Greenhorn', seedOffset: 0 },
  { name: 'normal', label: 'Journeyman', seedOffset: 100 },
  { name: 'hard', label: 'Old Growth', seedOffset: 200 }
];

const TEST_RUNS = ROLE_RUNS.flatMap((role) =>
  DIFFICULTIES.map((difficulty) => ({
    ...role,
    difficulty: difficulty.name,
    difficultyLabel: difficulty.label,
    seed: role.seed + difficulty.seedOffset
  }))
);

test.describe.configure({ mode: 'serial' });

for (const run of TEST_RUNS) {
  test(`${run.name} (${run.difficulty}) can complete a browser playthrough without runtime errors`, async ({ page }) => {
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

    const result = await autoPlayToEnd(page, run.name);

    expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
    expect(result.ended).toBeTruthy();
    expect(result.terminalText).toMatch(/EXPEDITION (SUCCESSFUL|FAILED)/);
    expect(extractElapsedDays(result.terminalText)).toBeGreaterThan(0);
    assertModeSpecificExpectations(run.name, result.terminalText);
  });
}

// The strategy bots below parse game state as text. Status moved from the
// terminal log into the mission dashboard and supplies panes, so this reads
// all three and normalizes the panes back to the old "Label: value" lines
// the extractors expect.
async function readGameText(page) {
  const terminalText = await page.locator('#terminal').innerText();
  const panesText = await page.evaluate(() => {
    const lines = [];

    const mission = document.getElementById('mission-panel');
    if (mission) {
      const objective = mission.querySelector('.mission-objective');
      if (objective) lines.push(`Objective: ${objective.textContent.trim()}`);
      for (const fact of mission.querySelectorAll('.mission-fact')) {
        const label = fact.querySelector('.mission-fact-label')?.textContent.trim();
        const value = fact.querySelector('.mission-fact-value')?.textContent.trim();
        if (label && value) lines.push(`${label}: ${value}`);
      }
      for (const check of mission.querySelectorAll('.mission-check')) {
        lines.push(check.textContent.replace(/\s+/g, ' ').trim());
      }
      const guidance = mission.querySelector('.mission-guidance');
      if (guidance) lines.push(`Next Best Move: ${guidance.textContent.replace(/^[>❯]\s*/, '').trim()}`);
      for (const alert of mission.querySelectorAll('.mission-alert')) {
        lines.push(alert.textContent.trim());
      }
    }

    for (const row of document.querySelectorAll('#resources-panel .resource-row')) {
      const label = row.querySelector('.resource-label')?.textContent.trim();
      const value = row.querySelector('.resource-value')?.textContent.trim();
      if (label && value) lines.push(`${label}: ${value}`);
    }

    const injured = document.querySelectorAll('#crew-panel .crew-member.injured, #crew-panel .crew-member.critical').length;
    if (injured > 0) lines.push(`| ${injured} injured`);

    return lines.join('\n');
  });
  return `${terminalText}\n${panesText}`;
}

async function autoPlayToEnd(page, strategyName, maxSteps = 900) {
  for (let step = 0; step < maxSteps; step++) {
    const terminalText = await readGameText(page);
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
        terminalText: await readGameText(page)
      };
    }

    const choiceIndex = pickChoice(labels, terminalText, strategyName);
    await buttons.nth(choiceIndex).click();
  }

  return {
    ended: false,
    steps: maxSteps,
    terminalText: await readGameText(page)
  };
}

function pickChoice(labels, terminalText, strategyName) {
  if (labels.length === 1) {
    return 0;
  }

  const recommendedAction = getRecommendedActionLabel(terminalText);
  if (recommendedAction) {
    const recommendedIndex = labels.findIndex((label) => normalizeChoiceLabel(label).startsWith(recommendedAction));
    if (recommendedIndex !== -1) {
      return recommendedIndex;
    }
  }

  if (strategyName === 'recce') {
    return pickReconChoice(labels, terminalText);
  }

  const sharedPriorities = ['Greenhorn', 'Journeyman', 'Old Growth', 'Begin Journey', 'Continue'];
  const planningPriorities = getPlanningPriorities(terminalText);
  const strategyPriorities = {
    planner: planningPriorities,
    permitter: [
      'Road Permit File',
      'Archaeology File',
      'Special-Use File',
      'Compliance Admin',
      'Renew Registration',
      'Clean response',
      'Fast-track',
      'Address Revisions',
      'Follow Up on Referrals',
      'Submit Permit',
      'Draft Permit Application',
      'Process Permits',
      'Stakeholder Meeting',
      'Team Building',
      'Take a Break',
      'End Day Early'
    ],
    silviculture: [
      'Plant Block',
      'Survival Check',
      'Fill Planting',
      'Brush Treatment',
      'Survey Free-Growing',
      'Contractor Rotation',
      'Contractor Meeting',
      'Team Briefing',
      'Upgrade camp',
      'Inspect & retrain',
      'Send medic',
      'Grant rest day',
      'Pay retention',
      'End Day'
    ],
    // Manager runs a 100-day term: favour budget-disciplined, no-cost choices so
    // the treasury survives to the deadline and the term reaches a clean end.
    manager: [
      'Skip certification',
      'Hold the line',
      'Demand a corrective plan',
      'Stay at your desk',
      'Rehearse the numbers',
      'Full transparency',
      'Adjourn the meeting'
    ]
  };

  const priorities = [...sharedPriorities, ...(strategyPriorities[strategyName] || [])];

  for (const priority of priorities) {
    const index = labels.findIndex((label) => normalizeChoiceLabel(label).startsWith(priority));
    if (index !== -1) {
      return index;
    }
  }

  return 0;
}

function pickReconChoice(labels, terminalText) {
  const hpLabels = labels
    .map((label, index) => {
      const match = label.match(/\((\d+)% HP/);
      return match ? { index, hp: Number(match[1]) } : null;
    })
    .filter(Boolean);
  if (hpLabels.length) {
    hpLabels.sort((left, right) => left.hp - right.hp);
    return hpLabels[0].index;
  }

  const food = extractResource(terminalText, 'FOOD');
  const fuel = extractResource(terminalText, 'FUEL');
  const equipment = extractResource(terminalText, 'EQUIP');
  const meds = extractResource(terminalText, 'MEDS');
  const injuredMatch = terminalText.match(/\|\s*(\d+)\s+injured/);
  const injuredCount = injuredMatch ? Number(injuredMatch[1]) : 0;

  if (labels.some((label) => label.includes('Safe Detour')) || labels.some((label) => label.includes('Stay Mainline'))) {
    if (food <= 10) {
      return findFirstMatching(labels, ['Stay Mainline', 'Safe Detour', 'Risky Shortcut']);
    }
    return findFirstMatching(labels, ['Stay Mainline', 'Safe Detour', 'Risky Shortcut']);
  }

  if (labels.some((label) => label.includes('Hunt & Forage Before Moving')) ||
      labels.some((label) => label.includes('Keep Full Rations')) ||
      labels.some((label) => label.includes('Short Rations and Push On'))) {
    if (food <= 10) {
      return findFirstMatching(labels, ['Hunt & Forage Before Moving', 'Keep Full Rations', 'Short Rations and Push On']);
    }
    return findFirstMatching(labels, ['Keep Full Rations', 'Hunt & Forage Before Moving', 'Short Rations and Push On']);
  }

  if (terminalText.includes('RESUPPLY')) {
    if (food <= 18) {
      return findFirstMatching(labels, ['Rations Crate', 'Fuel Drum', 'Field Repair', 'First Aid Kit', 'Done']);
    }
    if (fuel <= 30) {
      return findFirstMatching(labels, ['Fuel Drum', 'Rations Crate', 'Field Repair', 'First Aid Kit', 'Done']);
    }
    if (equipment <= 45) {
      return findFirstMatching(labels, ['Field Repair', 'Fuel Drum', 'Rations Crate', 'First Aid Kit', 'Done']);
    }
    if (meds <= 2) {
      return findFirstMatching(labels, ['First Aid Kit', 'Rations Crate', 'Fuel Drum', 'Field Repair', 'Done']);
    }
    return findFirstMatching(labels, ['Done']);
  }

  if (food <= 12) {
    return findFirstMatching(labels, ['Resupply', 'Forage & Hunt', 'Ground-Truth Access', 'Values Sweep', 'Field Notebook', 'Standard Recon', 'Cautious Recon', 'Maintenance', 'Scout Ahead', 'Triage', 'Rest & End Shift']);
  }

  if (fuel <= 25 || equipment <= 35) {
    return findFirstMatching(labels, ['Resupply', 'Maintenance', 'Ground-Truth Access', 'Values Sweep', 'Field Notebook', 'Standard Recon', 'Cautious Recon', 'Forage & Hunt', 'Scout Ahead', 'Triage', 'Rest & End Shift']);
  }

  if (injuredCount >= 2 && meds > 0) {
    return findFirstMatching(labels, ['Triage', 'Ground-Truth Access', 'Values Sweep', 'Field Notebook', 'Standard Recon', 'Cautious Recon', 'Maintenance', 'Scout Ahead', 'Forage & Hunt', 'Rest & End Shift']);
  }

  return findFirstMatching(labels, ['Ground-Truth Access', 'Values Sweep', 'Field Notebook', 'Standard Recon', 'Cautious Recon', 'Resupply', 'Scout Ahead', 'Maintenance', 'Forage & Hunt', 'Triage', 'Rest & End Shift']);
}

function getRecommendedActionLabel(terminalText) {
  const actionLabels = [
    'Gather Data',
    'Run Analysis',
    'Stakeholder Session',
    'Open FOM Review',
    'Update FOM Review',
    'Revise FOM',
    'Compliance Admin',
    'Renew Registration',
    'Ministerial Outreach',
    'Prepare Submission',
    'Clean response',
    'Fast-track',
    'Follow Up on Referrals',
    'Road Permit File',
    'Archaeology File',
    'Special-Use File',
    'Draft Permit Application',
    'Submit Permit'
  ];

  const line = terminalText.split('\n').find((entry) => entry.includes('Next Best Move:'));
  if (!line) {
    return '';
  }

  const headline = line.split('Next Best Move:')[1]?.trim() || '';
  return actionLabels.find((label) => headline.includes(label)) || '';
}

function getPlanningPriorities(terminalText) {
  const phaseMatch = terminalText.match(/Phase:\s*([A-Za-z ]+)/);
  const phase = phaseMatch ? phaseMatch[1].trim() : '';
  const valuesBlocked = terminalText.includes('BLOCKED') || terminalText.includes('All values must be');

  if (phase === 'Data Gathering') {
    return valuesBlocked
      ? ['Balanced Approach', 'Emphasize First Nations', 'Emphasize Biodiversity', 'Values Workshop', 'Gather Data', 'Network', 'Check Email', 'Take a Break', 'End Day']
      : ['Gather Data', 'Network', 'Check Email', 'Values Workshop', 'Balanced Approach', 'Take a Break', 'End Day'];
  }

  if (phase === 'Analysis') {
    return valuesBlocked
      ? ['Balanced Approach', 'Emphasize First Nations', 'Emphasize Biodiversity', 'Values Workshop', 'Run Analysis', 'Network', 'Check Email', 'Take a Break', 'End Day']
      : ['Run Analysis', 'Network', 'Check Email', 'Values Workshop', 'Balanced Approach', 'Take a Break', 'End Day'];
  }

  if (phase === 'Stakeholder Review') {
    return valuesBlocked
      ? ['Balanced Approach', 'Emphasize First Nations', 'Emphasize Biodiversity', 'Values Workshop', 'Stakeholder Session', 'Network', 'Check Email', 'Take a Break', 'End Day']
      : ['Stakeholder Session', 'Balanced Approach', 'Emphasize First Nations', 'Values Workshop', 'Network', 'Check Email', 'Take a Break', 'End Day'];
  }

  if (phase === 'Ministerial Approval') {
    return valuesBlocked
      ? ['Values Workshop', 'Timber Assessment', 'Open FOM Review', 'Update FOM Review', 'Revise FOM', 'Compliance Admin', 'Renew Registration', 'Ministerial Outreach', 'Prepare Submission', 'Network', 'Check Email', 'Take a Break', 'End Day']
      : ['Prepare Submission', 'Open FOM Review', 'Update FOM Review', 'Revise FOM', 'Compliance Admin', 'Renew Registration', 'Ministerial Outreach', 'Values Workshop', 'Network', 'Check Email', 'Take a Break', 'End Day'];
  }

  return [
    'Gather Data',
    'Run Analysis',
    'Stakeholder Session',
    'Open FOM Review',
    'Update FOM Review',
    'Revise FOM',
    'Compliance Admin',
    'Renew Registration',
    'Ministerial Outreach',
    'Prepare Submission',
    'Balanced Approach',
    'Emphasize First Nations',
    'Emphasize Biodiversity',
    'Values Workshop',
    'Network',
    'Check Email',
    'Take a Break',
    'End Day'
  ];
}

function isEndScreen(text) {
  return text.includes('EXPEDITION SUCCESSFUL') || text.includes('EXPEDITION FAILED');
}

function extractElapsedDays(text) {
  const match = text.match(/(?:Days Elapsed|Days Used|Shifts Elapsed|Term Served):\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

function assertModeSpecificExpectations(modeName, terminalText) {
  switch (modeName) {
    case 'planner': {
      expect(terminalText).toMatch(/Final Phase:\s*(data_gathering|analysis|stakeholder_review|ministerial_approval)/);
      if (terminalText.includes('EXPEDITION SUCCESSFUL')) {
        expect(terminalText).toMatch(/Final Phase:\s*ministerial_approval/);
        expect(extractStat(terminalText, 'Data Completeness')).toBeGreaterThanOrEqual(80);
        expect(extractStat(terminalText, 'Analysis Quality')).toBeGreaterThanOrEqual(80);
        expect(extractStat(terminalText, 'Stakeholder Buy-in')).toBeGreaterThanOrEqual(75);
        expect(extractStat(terminalText, 'Ministerial Confidence')).toBeGreaterThanOrEqual(80);
      } else {
        expect(terminalText).toMatch(/failed to achieve approval|Budget exhausted|Lost political support|Burnout/i);
      }
      break;
    }
    case 'permitter': {
      const approved = extractPair(terminalText, 'Permits Approved');
      expect(approved.current).toBeLessThanOrEqual(approved.total);
      if (terminalText.includes('EXPEDITION SUCCESSFUL')) {
        expect(approved.current).toBeGreaterThanOrEqual(Math.ceil(approved.total * 0.8));
      } else {
        expect(terminalText).toMatch(/could not meet its targets|Budget exhausted|Lost political support|Burnout/i);
      }
      break;
    }
    case 'recce': {
      const surveyed = extractPair(terminalText, 'Blocks Surveyed');
      expect(surveyed.current).toBeLessThanOrEqual(surveyed.total);
      if (terminalText.includes('EXPEDITION SUCCESSFUL')) {
        expect(surveyed.current).toBe(surveyed.total);
      } else {
        expect(surveyed.current).toBeLessThan(surveyed.total);
      }
      break;
    }
    case 'silviculture': {
      const planted = extractPair(terminalText, 'Blocks Planted');
      const surveys = extractPair(terminalText, 'Free-Growing Surveys');
      expect(planted.current).toBeLessThanOrEqual(planted.total);
      expect(surveys.current).toBeLessThanOrEqual(surveys.total);
      if (terminalText.includes('EXPEDITION SUCCESSFUL')) {
        expect(planted.current).toBeGreaterThanOrEqual(planted.total);
        expect(surveys.current).toBeGreaterThanOrEqual(surveys.total);
      } else {
        expect(terminalText).toMatch(/fell short of its targets|Budget exhausted|No contractor capacity/i);
        expect(planted.current).toBeLessThanOrEqual(planted.total);
      }
      break;
    }
    case 'manager': {
      const term = extractPair(terminalText, 'Term Served');
      expect(term.current).toBeGreaterThan(0);
      expect(term.current).toBeLessThanOrEqual(term.total);
      if (terminalText.includes('EXPEDITION SUCCESSFUL')) {
        expect(terminalText).toMatch(/board's confidence intact/);
      } else {
        expect(terminalText).toMatch(/board is already interviewing replacements|Budget exhausted|poor performance|board trust/i);
      }
      break;
    }
    default:
      break;
  }
}

function extractStat(text, label) {
  const match = text.match(new RegExp(`${escapeRegExp(label)}:\\s*(\\d+)`));
  return match ? Number(match[1]) : 0;
}

function extractPair(text, label) {
  const match = text.match(new RegExp(`${escapeRegExp(label)}:\\s*(\\d+)\\/(\\d+)`));
  return {
    current: match ? Number(match[1]) : 0,
    total: match ? Number(match[2]) : 0
  };
}

function extractResource(text, label) {
  const match = text.match(new RegExp(`${escapeRegExp(label)}:\\s*(\\d+)`));
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function findFirstMatching(labels, priorities) {
  for (const priority of priorities) {
    const index = labels.findIndex((label) => normalizeChoiceLabel(label).startsWith(priority));
    if (index !== -1) {
      return index;
    }
  }
  return 0;
}

function normalizeChoiceLabel(label) {
  // Accepts both the legacy "[1] Label" text and the TUI card markup, where
  // the key badge renders as a bare leading digit ("1 Label").
  return String(label || '').replace(/^\[?\d+\]?\s+/, '').trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
