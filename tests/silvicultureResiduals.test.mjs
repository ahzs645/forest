import test from 'node:test';
import assert from 'node:assert/strict';

import { createSilvicultureJourney } from '../js/journey/factory.js';
import {
  runSilvicultureDay,
  describeBudgetPlan,
  describeSilvicultureMilestone,
  pickStandDownReason,
  CONTRACTOR_EVENTS,
  SENSITIVE_SPRAY_DAYS,
} from '../js/modes/silviculture.js';
import { applyDifficultyMultipliers } from '../js/game/ForestryTrailGame.js';
import { getEndBanner, getFinalReportPrompt, resolveFinalReport } from '../js/game/debrief.js';
import { buildDefeatNarrative, buildVictoryNarrative } from '../js/game/endScreen.js';
import { recordProgramShortcut } from '../js/modes/silvicultureIntegrity.js';
import { FIELD_EVENTS } from '../js/data/fieldEvents.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import { runPolicy } from '../scripts/simulate-silviculture-policies.mjs';

function seededRandomFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function withSeededRandom(seed, fn) {
  const original = Math.random;
  Math.random = seededRandomFactory(seed);
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

/** Records what was written and asked; a disabled option is never taken. */
function makeRecordingUi(answer) {
  const lines = [];
  const prompts = [];
  const missions = [];
  const push = (text) => { if (typeof text === 'string') lines.push(text); };
  return {
    lines,
    prompts,
    missions,
    write: push, writeHeader: push, writeWarning: push, writePositive: push, writeDanger: push,
    writeInfo: push, writeSuccess: push, writeDivider: () => {}, clear: () => {}, updateAllStatus: () => {},
    playEventVignette: () => {}, playScene: async () => {}, clearMissionStatus: () => {},
    setMissionStatus: (status) => missions.push(status),
    async promptText() { return 'x'; },
    async promptChoice(prompt, all = []) {
      prompts.push({ prompt, options: all });
      const options = all.filter((option) => !option.disabled);
      if (!options.length) return { value: undefined };
      if (options.length === 1) return options[0];
      return answer(prompt, options) || options[0];
    },
  };
}

const endDay = (prompt, options) => options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end');

function hardJourney(areaId) {
  const journey = createSilvicultureJourney({ areaId });
  journey.difficulty = 'hard';
  applyDifficultyMultipliers(journey, 'hard');
  return journey;
}

// ── The coast budget ────────────────────────────────────────────────────────

test('day 1 on the hard coast says what the budget assumes: manual release throughout does not fit', async () => {
  await withSeededRandom(8080, async () => {
    const journey = hardJourney('vancouver-island-coast');
    const ui = makeRecordingUi(endDay);
    await runSilvicultureDay({ ui, journey, gameOver: false });
    const line = ui.lines.find((text) => text.includes('Budget: $'));
    assert.ok(line, ui.lines.join('\n'));
    assert.match(line, /leaving about \$[\d,]+ for 260 ha of release: manual release \$234,000, cylinder release \$146,000, glyphosate \$91,000\. Manual release for all of it would run the program out of money\./);
    assert.equal(journey.program.budgetStart, 304000, 'the grade reads the budget the run actually opened with');
  });
});

test('on normal difficulty the budget carries any release method', () => {
  const journey = createSilvicultureJourney({ areaId: 'vancouver-island-coast' });
  assert.match(describeBudgetPlan(journey), /Any of them fits\.$/);
});

test('honest play on the hard coast, saws only and never a spray day, delivers the program solvent', async () => {
  for (const seed of [8080, 4000, 4053, 4212]) {
    const result = await runPolicy('honest', 'vancouver-island-coast', seed, { difficulty: 'hard' });
    assert.equal(result.won, true, `seed ${seed}: ${result.reason}`);
    assert.equal(result.sprayed, false);
    assert.ok(result.budget > 10000, `seed ${seed} finished with $${result.budget}`);
  }
});

test('competent play delivers on every area and difficulty; neglect and fraud do not', async () => {
  for (const area of OPERATING_AREAS.map((candidate) => candidate.id)) {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      for (const policy of ['competent', 'honest']) {
        const result = await runPolicy(policy, area, 4106, { difficulty });
        assert.equal(result.won, true, `${policy} ${area} ${difficulty}: ${result.reason}`);
        assert.ok(result.budget > 0, `${policy} ${area} ${difficulty} finished at $${result.budget}`);
      }
    }
  }
  for (const policy of ['neglect', 'fraud']) {
    const result = await runPolicy(policy, 'vancouver-island-coast', 4106, { difficulty: 'hard' });
    assert.equal(result.won, false, `${policy} delivered`);
    assert.ok(['D', 'F'].includes(result.grade), `${policy} graded ${result.grade}`);
  }
});

// ── Release: realistic ground, a costed confirmation ────────────────────────

test('a release day is quoted and confirmed before the crews go out, at a saw crew\'s real pace', async () => {
  await withSeededRandom(707, async () => {
    const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
    let backedOut = false;
    const ui = makeRecordingUi((prompt, options) => {
      if (prompt.startsWith('Release treatment on ')) return options.find((o) => o.value === (backedOut ? 'cylinder' : 'manual'));
      if (prompt.startsWith('Today\'s release')) {
        if (!backedOut) { backedOut = true; return options.find((o) => o.value === 'back'); }
        return options.find((o) => o.value === 'confirm');
      }
      return options.find((o) => o.value === 'brush') || endDay(prompt, options);
    });
    const budgetBefore = journey.resources.budget;
    await runSilvicultureDay({ ui, journey, gameOver: false });

    const quotes = ui.prompts.filter((entry) => entry.prompt.startsWith('Today\'s release'));
    assert.equal(quotes.length, 2, 'choosing another method goes back to the options');
    const manual = quotes[0].prompt.match(/^Today's release by manual release: (\d+) ha at \$900\/ha, \$([\d,]+) against \$[\d,]+ left\. Send the crews\?$/);
    assert.ok(manual, quotes[0].prompt);
    assert.ok(Number(manual[1]) <= 38, `four saw crews do not brush ${manual[1]} ha in a day`);
    const cylinder = quotes[1].prompt.match(/^Today's release by cylinder release: (\d+) ha at \$560\/ha, \$([\d,]+) against/);
    assert.ok(cylinder, quotes[1].prompt);
    assert.equal(journey.brushing.hectaresComplete, Number(cylinder[1]), 'the quoted area is the area treated');
    const invoice = Number(cylinder[2].replace(/,/g, ''));
    assert.equal(invoice, Number(cylinder[1]) * 560);
    assert.ok(budgetBefore - journey.resources.budget >= invoice + 550);
    assert.ok(ui.lines.some((line) => /by cylinder release - Sitka alder and thimbleberry cut back in a ring round every crop tree/.test(line)));
  });
});

test('after three spray days on interface ground the Nation asks for no more, and glyphosate is shown off the table', async () => {
  await withSeededRandom(51, async () => {
    const journey = createSilvicultureJourney({ areaId: 'bulkley-valley' });
    journey.silvicultureState = { sensitiveSprayDays: SENSITIVE_SPRAY_DAYS };
    const ui = makeRecordingUi((prompt, options) => {
      if (prompt.startsWith('Release treatment on ')) return options.find((o) => o.value === 'cancel');
      return options.find((o) => o.value === 'brush') || endDay(prompt, options);
    });
    await runSilvicultureDay({ ui, journey, gameOver: false });
    const methods = ui.prompts.find((entry) => entry.prompt.startsWith('Release treatment on '));
    const spray = methods.options.find((o) => o.value === 'glyphosate');
    assert.ok(spray.disabled);
    assert.match(spray.description, /^Off the table: after 3 spray days on this ground the Nation asked/);
    assert.doesNotMatch(describeBudgetPlan(journey, { sprayAllowed: false }), /glyphosate/);
  });
});

// ── Crews on days off ──────────────────────────────────────────────────────

test('brushing and surveys stay on the card, disabled, while their crews are on days off', async () => {
  await withSeededRandom(24, async () => {
    const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
    journey.day = 24;
    journey.crew = journey.crew.filter((member) => member.role !== 'surveyor');
    for (const contractor of journey.contractors) {
      if (contractor.specialty === 'planting') continue;
      contractor.isActive = false;
      contractor.silvicultureState = { status: 'recovering', cooldownDays: 2, traits: [] };
    }
    const ui = makeRecordingUi(endDay);
    await runSilvicultureDay({ ui, journey, gameOver: false });
    const menu = ui.prompts.find((entry) => entry.options.some((o) => o.value === 'end'));
    const brush = menu.options.find((o) => o.value === 'brush');
    const survey = menu.options.find((o) => o.value === 'survey');
    assert.ok(brush?.disabled && survey?.disabled, menu.options.map((o) => String(o.value)).join(','));
    assert.equal(brush.description, 'Waits for Wetbelt Brushing Co, on days off until day 25.');
    assert.equal(survey.description, 'Waits for Columbia Regen Surveys, on days off until day 25.');
  });
});

test('two surveyors are not a planting crew', async () => {
  await withSeededRandom(22, async () => {
    const journey = createSilvicultureJourney({ areaId: 'okanagan-shuswap-drybelt' });
    for (const contractor of journey.contractors) {
      if (contractor.specialty === 'survey') continue;
      contractor.isActive = false;
      contractor.silvicultureState = { status: 'recovering', cooldownDays: 2, traits: [] };
    }
    const ui = makeRecordingUi(endDay);
    await runSilvicultureDay({ ui, journey, gameOver: false });
    const menu = ui.prompts.find((entry) => entry.options.some((o) => o.value === 'end'));
    const plant = menu.options.find((o) => o.value === 'plant');
    assert.ok(plant.disabled);
    assert.match(plant.description, /^Waits for Benchland Planters, on days off until day \d+\.$/);
  });
});

// ── Contractor calls ────────────────────────────────────────────────────────

test('stand-down reasons fit the season and the ground', () => {
  const reasonsFor = (areaId, season) => {
    const journey = createSilvicultureJourney({ areaId });
    journey.season.currentSeason = season;
    const original = Math.random;
    const seen = new Set();
    try {
      for (let i = 0; i < 50; i += 1) {
        Math.random = () => i / 50;
        seen.add(pickStandDownReason(journey));
      }
    } finally {
      Math.random = original;
    }
    return [...seen].join(' | ');
  };
  const coastSpring = reasonsFor('vancouver-island-coast', 'spring');
  assert.doesNotMatch(coastSpring, /Extreme|humidex|grizzly|lightning|smoke/);
  assert.match(coastSpring, /black bear sow/);
  assert.match(coastSpring, /cutslope above the spur/);
  const wetbeltSpring = reasonsFor('kootenay-wetbelt', 'spring');
  assert.doesNotMatch(wetbeltSpring, /Extreme|humidex|black bear/);
  assert.match(wetbeltSpring, /grizzly with cubs/);
  assert.match(reasonsFor('okanagan-shuswap-drybelt', 'summer'), /Extreme[\s\S]*humidex/);
});

test('a planting quality dispute needs plots that really came in short, and names the block', () => {
  const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  const planters = journey.contractors.find((c) => c.specialty === 'planting');
  const dispute = CONTRACTOR_EVENTS.find((event) => event.id === 'quality_dispute');
  journey.day = 10;
  assert.equal(dispute.trigger(planters, journey), false, 'no short plots, no dispute');
  const block = journey.program.blocks[0];
  Object.assign(block, { status: 'inspected', quality: 87, holdback: 140, inspectedDay: 9 });
  assert.equal(dispute.trigger(planters, journey), true);
  assert.match(dispute.getText(planters, journey), new RegExp(`plots on ${block.id} came in at 87%.*Cedar Draw Planters' foreman.*\\$140 holdback`));
  block.quality = 93;
  assert.equal(dispute.trigger(planters, journey), false, 'a clean pass is not disputed');
});

test('a sick survey crew is two surveyors, and a sick saw crew does not stop the planting', () => {
  const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  const sickness = CONTRACTOR_EVENTS.find((event) => event.id === 'crew_illness');
  const surveyors = journey.contractors.find((c) => c.specialty === 'survey');
  const brushers = journey.contractors.find((c) => c.specialty === 'brushing');
  assert.match(sickness.getText(surveyors, journey), /^One of Columbia Regen Surveys' surveyors is down/);
  assert.match(sickness.getText(brushers, journey), /^Several cutters from Wetbelt Brushing Co/);
  const rest = sickness.options.find((option) => option.value === 'rest');
  assert.equal(rest.description(brushers), 'No saws on the block today; the bug runs its course');
});

// ── Events fitted to the program ────────────────────────────────────────────

test('the chainsaw accident\'s partial band evacuates the worker it says was lost', () => {
  const event = FIELD_EVENTS.find((candidate) => /A saw kicks back/.test(candidate.description || ''));
  assert.ok(event);
  assert.doesNotMatch(event.description, /clearing line/);
  const option = event.options.find((candidate) => /You lost the worker/.test(candidate.partialOutcome || ''));
  assert.deepEqual(option.partialCrewEffect, { evacuate: true });
});

// ── Milestones, the panel, the close ────────────────────────────────────────

test('milestones say what is actually delivered', () => {
  const journey = createSilvicultureJourney({ areaId: 'vancouver-island-coast' });
  for (const block of journey.program.blocks.slice(0, 4)) Object.assign(block, { status: 'inspected', planted: block.trees, quality: 93 });
  journey.planting.blocksPlanted = 4;
  const line = describeSilvicultureMilestone(journey, 50);
  assert.match(line, /^\*\*\* MILESTONE: Half the program delivered, by weight: 4\/8 blocks planted and inspected, fill 0\/2, release not started \(260 ha\), 0\/3 free-growing declarations\. \*\*\*$/);
  assert.doesNotMatch(line, /release moving/);
});

test('the last day\'s panel shows the program after the work, and the prompt closes out the season', async () => {
  await withSeededRandom(11, async () => {
    const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
    const program = journey.program;
    for (const block of program.blocks) Object.assign(block, { status: 'inspected', planted: block.trees, quality: 93 });
    journey.planting.blocksPlanted = journey.planting.blocksToPlant;
    journey.planting.seedlingsPlanted = journey.planting.seedlingsAllocated;
    journey.planting.qualityAverage = 93;
    for (const opening of program.fill) opening.done = true;
    for (const opening of program.brush) opening.treated = opening.ha;
    journey.brushing.hectaresComplete = journey.brushing.hectaresTarget;
    const ready = program.freeGrowing.filter((opening) => !opening.needsRelease);
    for (const opening of ready.slice(0, 2)) Object.assign(opening, { surveyed: true, result: 'pass' });
    for (const opening of program.freeGrowing.filter((o) => o.needsRelease)) Object.assign(opening, { released: true, releaseReadyDay: 1 });
    journey.surveys.freeGrowingComplete = 2;
    ready[2].fgPlotPct = 95;
    const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'survey') || endDay(prompt, options));
    await runSilvicultureDay({ ui, journey, gameOver: false });
    assert.equal(journey.surveys.freeGrowingComplete, 3);
    const panel = ui.missions[ui.missions.length - 1];
    assert.ok(panel.checklist.some((item) => /free-growing declarations 100% \(3\/3\)/.test(item.label) && item.done), JSON.stringify(panel.checklist));
    const last = ui.prompts[ui.prompts.length - 1];
    assert.equal(last.options[0].label, 'Close out the season');
  });
});

test('an extra shift from the schedule only counts the hectares an opening took', async () => {
  await withSeededRandom(5, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    const young = journey.program.brush.filter((opening) => !opening.fgId);
    young[0].treated = young[0].ha - 2;
    journey.brushing.hectaresComplete = young[0].treated;
    journey.programSchedule = { days: 1 };
    await runSilvicultureDay({ ui: makeRecordingUi(endDay), journey, gameOver: false });
    const treated = journey.program.brush.reduce((sum, opening) => sum + opening.treated, 0);
    assert.equal(journey.brushing.hectaresComplete, treated);
  });
});

// ── The end of the run ──────────────────────────────────────────────────────

test('the banner follows the grade: a delivered run graded D or F is complete, not successful', () => {
  assert.equal(getEndBanner(true, 'A'), 'EXPEDITION SUCCESSFUL');
  assert.equal(getEndBanner(true, 'C'), 'EXPEDITION SUCCESSFUL');
  assert.equal(getEndBanner(true, 'F'), 'EXPEDITION COMPLETE');
  assert.equal(getEndBanner(false, 'A'), 'EXPEDITION FAILED');
});

test('a pulled program with every block planted says so, and is handed over rather than reported', () => {
  const journey = createSilvicultureJourney({ areaId: 'okanagan-shuswap-drybelt' });
  journey.planting.blocksPlanted = journey.planting.blocksToPlant;
  journey.day = 30;
  for (const id of ['a', 'b']) recordProgramShortcut(journey, { id, title: 'Falsify the survival plots', kind: 'false-record', status: 'caught' });
  journey.gameOverReason = 'C&E has falsified records with your signature on them.';
  const text = buildDefeatNarrative(journey, 'the Drybelt', 'Crew', 29);
  assert.match(text, /^The licensee pulled you off the silviculture program in the Drybelt after 29 days\./);
  assert.doesNotMatch(text, /unplanted blocks/);
  assert.match(getFinalReportPrompt('silviculture', { victory: false }).prompt, /How do you hand it over\?$/);
  assert.match(resolveFinalReport('integrity', journey).lines[0], /^The binder goes over as it stands/);

  const delivered = createSilvicultureJourney({ areaId: 'okanagan-shuswap-drybelt' });
  delivered.planting.blocksPlanted = delivered.planting.blocksToPlant;
  recordProgramShortcut(delivered, { id: 'c', title: 'Skip the machine wash', kind: 'shortcut', status: 'caught' });
  assert.match(buildVictoryNarrative(delivered, 'the Drybelt', 'Crew', 30), /1 caught shortcut on the file with your signature\.$/);
});
