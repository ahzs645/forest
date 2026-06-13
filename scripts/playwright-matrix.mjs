import { chromium } from '@playwright/test';

const ROLE_RUNS = [
  { name: 'planner', roleIndex: 0, areaIndex: 0, seed: 1001 },
  { name: 'permitter', roleIndex: 1, areaIndex: 1, seed: 2001 },
  { name: 'recce', roleIndex: 2, areaIndex: 2, seed: 3001 },
  { name: 'silviculture', roleIndex: 3, areaIndex: 3, seed: 4001 },
  { name: 'manager', roleIndex: 4, areaIndex: 4, seed: 5001 }
];

const DIFFICULTIES = [
  { name: 'easy', label: 'Greenhorn' },
  { name: 'normal', label: 'Journeyman' },
  { name: 'hard', label: 'Old Growth' }
];

const BASE_URL = process.env.PLAYWRIGHT_MATRIX_URL || 'http://127.0.0.1:4173/forest/';
const ROLE_FILTER = process.env.MATRIX_ROLE || '';
const DIFFICULTY_FILTER = process.env.MATRIX_DIFFICULTY || '';
const VERBOSE = process.env.MATRIX_VERBOSE === '1';

function isEndScreen(text) {
  return text.includes('EXPEDITION SUCCESSFUL') || text.includes('EXPEDITION FAILED');
}

function extractElapsedDays(text) {
  const match = text.match(/(?:Days Elapsed|Days Used|Shifts Elapsed):\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

function extractResource(text, label) {
  const match = text.match(new RegExp(`${escapeRegExp(label)}:\\s*(\\d+)`));
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function extractPair(text, label) {
  const match = text.match(new RegExp(`${escapeRegExp(label)}:\\s*(\\d+)/(\\d+)`));
  return {
    current: match ? Number(match[1]) : 0,
    total: match ? Number(match[2]) : 0
  };
}

function normalizeChoiceLabel(label) {
  return String(label || '').replace(/^\[\d+\]\s*/, '').trim();
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

// Recon's shift menu is two-tiered: camp/upkeep actions live behind a
// "Camp & Support" entry. When the highest-priority action is one of those
// and it isn't on the current (primary) menu, drill into the submenu; the next
// call sees the support actions and selects directly.
const RECON_SUPPORT_ACTIONS = new Set([
  'Forage & Hunt',
  'Maintenance',
  'Scout Ahead',
  'Triage',
  'Consult the Area Map',
  'Review the Briefing'
]);

function pickReconMenuChoice(labels, priorities) {
  for (const priority of priorities) {
    const index = labels.findIndex((label) => normalizeChoiceLabel(label).startsWith(priority));
    if (index !== -1) {
      return index;
    }
    if (RECON_SUPPORT_ACTIONS.has(priority)) {
      const supportIndex = labels.findIndex((label) => normalizeChoiceLabel(label).startsWith('Camp & Support'));
      if (supportIndex !== -1) {
        return supportIndex;
      }
    }
  }
  return 0;
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

  // When the shift is nearly out of hours, no useful work fits — end it rather
  // than bouncing into the support submenu for actions we can't afford.
  const hoursMatch = terminalText.match(/Hours:\s*(\d+)\s*h/);
  const hoursLeft = hoursMatch ? Number(hoursMatch[1]) : 9;
  const atShiftMenu = labels.some((label) => {
    const normalized = normalizeChoiceLabel(label);
    return normalized.startsWith('Rest & End Shift')
      || normalized.startsWith('Camp & Support')
      || normalized === 'Back';
  });
  if (atShiftMenu && hoursLeft < 2) {
    return findFirstMatching(labels, ['Rest & End Shift', 'Back', 'Consult the Area Map']);
  }

  if (labels.some((label) => label.includes('Safe Detour')) || labels.some((label) => label.includes('Stay Mainline'))) {
    if (fuel < 20 || equipment < 40) {
      return findFirstMatching(labels, ['Risky Shortcut', 'Stay Mainline', 'Safe Detour']);
    }
    if (injuredCount > 0) {
      return findFirstMatching(labels, ['Safe Detour', 'Stay Mainline', 'Risky Shortcut']);
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
    return pickReconMenuChoice(labels, ['Resupply', 'Forage & Hunt', 'Ground-Truth Access', 'Values Sweep', 'Field Notebook', 'Standard Recon', 'Cautious Recon', 'Maintenance', 'Scout Ahead', 'Triage', 'Rest & End Shift']);
  }

  if (fuel <= 25 || equipment <= 35) {
    return pickReconMenuChoice(labels, ['Resupply', 'Maintenance', 'Ground-Truth Access', 'Values Sweep', 'Field Notebook', 'Standard Recon', 'Cautious Recon', 'Forage & Hunt', 'Scout Ahead', 'Triage', 'Rest & End Shift']);
  }

  if (injuredCount >= 2 && meds > 0) {
    return pickReconMenuChoice(labels, ['Triage', 'Ground-Truth Access', 'Values Sweep', 'Field Notebook', 'Standard Recon', 'Cautious Recon', 'Maintenance', 'Scout Ahead', 'Forage & Hunt', 'Rest & End Shift']);
  }

  return pickReconMenuChoice(labels, ['Ground-Truth Access', 'Values Sweep', 'Field Notebook', 'Standard Recon', 'Cautious Recon', 'Resupply', 'Scout Ahead', 'Maintenance', 'Forage & Hunt', 'Triage', 'Rest & End Shift']);
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
    // Manager runs a 12-month term; this strategy protects the treasury and
    // reputation (the win condition) by favouring cheap, steady choices.
    manager: [
      'Skip certification for now',
      'Hold the line',
      'Demand a corrective plan',
      'Rehearse the numbers cold',
      'Full transparency',
      'Back the division lead publicly',
      'Fly out to the blocks',
      'Stay at your desk',
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

async function autoPlayToEnd(page, strategyName, maxSteps = 360) {
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

    const choiceIndex = pickChoice(labels, terminalText, strategyName);
    await buttons.nth(choiceIndex).click();
  }

  return {
    ended: false,
    steps: maxSteps,
    terminalText: await page.locator('#terminal').innerText(),
    finalLabels: await page.locator('#choices button').evaluateAll((nodes) =>
      nodes.map((node) => node.innerText.replace(/\s+/g, ' ').trim())
    )
  };
}

function summarizeResult(result) {
  const text = result.terminalText;
  const reconSurveyed = extractPair(text, 'Blocks Surveyed');
  const silviPlanted = extractPair(text, 'Blocks Planted');
  const silviSurveys = extractPair(text, 'Free-Growing Surveys');

  return {
    role: result.role,
    difficulty: result.difficulty,
    outcome: text.includes('EXPEDITION SUCCESSFUL') ? 'SUCCESS' : 'FAIL',
    ended: result.ended,
    steps: result.steps,
    elapsed: extractElapsedDays(text),
    errors: result.runtimeErrors.length,
    permitsApproved: extractPair(text, 'Permits Approved'),
    reconSurveyed,
    silviPlanted,
    silviSurveys,
    finalPhase: text.match(/Final Phase:\s*([a-z_]+)/)?.[1] || null
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function runMatrix() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  const rolesToRun = ROLE_FILTER ? ROLE_RUNS.filter((role) => role.name === ROLE_FILTER) : ROLE_RUNS;
  const difficultiesToRun = DIFFICULTY_FILTER ? DIFFICULTIES.filter((difficulty) => difficulty.name === DIFFICULTY_FILTER) : DIFFICULTIES;

  for (const role of rolesToRun) {
    for (const difficulty of difficultiesToRun) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
      const runtimeErrors = [];
      const seed = role.seed + (difficulty.name === 'easy' ? 0 : difficulty.name === 'normal' ? 100 : 200);

      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') {
          runtimeErrors.push(message.text());
        }
      });

      await page.addInitScript((seedStart) => {
        let currentSeed = seedStart;
        Math.random = () => {
          currentSeed = (1664525 * currentSeed + 1013904223) >>> 0;
          return currentSeed / 0x100000000;
        };
      }, seed);

      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      await page.click('#new-game-btn');
      await page.click('#intro-continue-btn');
      await page.locator('.role-card').nth(role.roleIndex).click();
      await page.click('#role-continue-btn');
      await page.locator('.area-item').nth(role.areaIndex).click();
      await page.click('#area-continue-btn');
      await page.locator('#choices button').filter({ hasText: difficulty.label }).click();

      const outcome = await autoPlayToEnd(page, role.name);
      results.push({
        ...outcome,
        role: role.name,
        difficulty: difficulty.name,
        runtimeErrors
      });

      await page.close();
    }
  }

  await browser.close();
  return results;
}

const results = await runMatrix();
for (const summary of results.map(summarizeResult)) {
  console.log([
    summary.role,
    summary.difficulty,
    summary.outcome,
    `ended=${summary.ended}`,
    `steps=${summary.steps}`,
    `elapsed=${summary.elapsed}`,
    `errors=${summary.errors}`,
    summary.finalPhase ? `phase=${summary.finalPhase}` : null,
    summary.permitsApproved.total ? `permits=${summary.permitsApproved.current}/${summary.permitsApproved.total}` : null,
    summary.reconSurveyed.total ? `surveyed=${summary.reconSurveyed.current}/${summary.reconSurveyed.total}` : null,
    summary.silviPlanted.total ? `planted=${summary.silviPlanted.current}/${summary.silviPlanted.total}` : null,
    summary.silviSurveys.total ? `surveys=${summary.silviSurveys.current}/${summary.silviSurveys.total}` : null
  ].filter(Boolean).join('\t'));
}

if (VERBOSE) {
  for (const result of results) {
    const lines = result.terminalText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    console.log(`\n[${result.role}/${result.difficulty}]`);
    if (result.runtimeErrors.length) {
      console.log('runtimeErrors:');
      for (const error of result.runtimeErrors) {
        console.log(`- ${error}`);
      }
    }
    if (Array.isArray(result.finalLabels)) {
      console.log(`finalLabels: ${result.finalLabels.join(' || ')}`);
    }
    console.log(lines.slice(-14).join(' | '));
  }
}

// CI gate: a playable smoke test should never hit a runtime error (an uncaught
// page error or a console error) for any role. This is the regression class the
// startup-parse-error report was about — a broken import surfaces here for every
// role. Balance outcomes (SUCCESS vs FAIL) and whether the auto-player reaches
// an end screen are reported above but intentionally not gated.
const runsWithErrors = results.filter((result) => result.runtimeErrors.length > 0);

if (runsWithErrors.length > 0) {
  console.error(`\n${runsWithErrors.length} run(s) hit runtime errors:`);
  for (const result of runsWithErrors) {
    console.error(`- ${result.role}/${result.difficulty}: ${result.runtimeErrors.join(' | ')}`);
  }
  process.exitCode = 1;
}
