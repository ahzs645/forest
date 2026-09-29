import test from 'node:test';
import assert from 'node:assert/strict';

import { createSilvicultureJourney } from '../js/journey/factory.js';
import { runSilvicultureDay } from '../js/modes/silviculture.js';
import { calculateScore, formatScoreDisplay } from '../js/scoring.js';
import { resolveFinalReport } from '../js/game/debrief.js';
import { recordTemptationOutcome, runSeasonCloseAudit, summarizeIntegrity } from '../js/modes/silvicultureIntegrity.js';
import { runPolicy } from '../scripts/simulate-silviculture-policies.mjs';

// Deterministic PRNG so these tests never flake on Math.random().
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
    // Must await here - fn() is async, and returning the unresolved promise
    // would let `finally` restore Math.random before fn's body finishes,
    // silently switching the run over to real randomness mid-test.
    return await fn();
  } finally {
    Math.random = original;
  }
}

const ACTION_PRIORITY = ['inspect', 'plant', 'survey', 'fill', 'brush', 'rotation', 'meeting', 'team_briefing', 'briefing', 'end'];

// A minimal "sensible player" UI: always take the highest-priority
// target-advancing action that's on offer, deploy ready contractors rather
// than stand deployed ones down, and never gamble on standing anyone down.
function makeSensibleUi(journey, actionCounts) {
  return {
    write() {}, writeHeader() {}, writeWarning() {}, writePositive() {}, writeDanger() {},
    clear() {}, updateAllStatus() {}, playEventVignette() {},
    async promptChoice(prompt, options) {
      if (!options || options.length === 0) return { value: undefined };
      if (options.length === 1) return options[0];

      // A day can now open with an authored situation that costs the day to
      // answer, plus an explicit way to decline it (js/journey/daySituation.js).
      // A sensible player does not answer everything: when the program is
      // behind the calendar they wear the scrutiny and keep the day for the
      // planting. Without this the "sensible" run spends its season on the
      // radio and lands outside any plausible window.
      const setAside = options.find((o) => o.value === 'set_aside');
      if (setAside) {
        const deadline = journey.deadline || 42;
        const elapsed = (journey.day || 1) / deadline;
        const planted = (journey.planting?.blocksPlanted || 0)
          / (journey.planting?.blocksToPlant || 1);
        if (planted < elapsed) return setAside;
      }

      if (options.some((o) => o.value === 'end')) {
        const anyReadyToDeploy = (journey.contractors || []).some((c) => {
          const s = c.silvicultureState;
          return !c.isActive && !(s?.status === 'recovering') && !((s?.cooldownDays || 0) > 0);
        });
        for (const val of ACTION_PRIORITY) {
          if (val === 'rotation' && !anyReadyToDeploy) continue;
          const idx = options.findIndex((o) => o.value === val);
          if (idx !== -1) {
            actionCounts[val] = (actionCounts[val] || 0) + 1;
            return options[idx];
          }
        }
        return options[options.length - 1];
      }

      if (prompt === 'Adjust which contractor?') {
        const readyIdx = options.findIndex((o) => o.description && /^(ready|available)/.test(o.description));
        if (readyIdx !== -1) return options[readyIdx];
        return options.find((o) => o.value === 'cancel') || options[options.length - 1];
      }
      if (prompt.startsWith('Stand down ')) {
        // A sensible player never volunteers to stand a deployed contractor
        // down mid-priority-chase; always cancel this confirmation.
        return options.find((o) => o.value === 'cancel') || options[0];
      }
      if (prompt === 'Meet with which contractor?') {
        let bestIdx = 0;
        let bestMorale = Infinity;
        options.forEach((o, i) => {
          const c = journey.contractors.find((c) => c.id === o.value);
          if (c && c.morale < bestMorale) { bestMorale = c.morale; bestIdx = i; }
        });
        return options[bestIdx];
      }
      return options[0];
    },
  };
}

test('planting reopens repeatedly across the campaign, not just once (the core regression)', async () => {
  await withSeededRandom(13579, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    const actionCounts = {};
    const ui = makeSensibleUi(journey, actionCounts);
    const game = { ui, journey, gameOver: false };

    let days = 0;
    while (!journey.isComplete && !journey.isGameOver && !game.gameOver && days < 60) {
      await runSilvicultureDay(game);
      days++;
    }

    // Before the fix, 'plant' could only ever be chosen twice in an entire
    // campaign (once at the start, once after every free-growing survey was
    // already complete). A rebalanced, working phase cycle should offer it
    // many more times across a 15-block program.
    // The exact count wobbles with the seed (8-11 across a dozen seeds, every
    // one of them finishing 8/8 blocks); the regression this guards produced 2.
    assert.ok((actionCounts.plant || 0) >= 8,
      `expected plant to be offered/taken many times across the campaign, got ${actionCounts.plant}`);
  });
});

test('a sensible normal-difficulty run reaches EXPEDITION SUCCESSFUL-equivalent victory within a plausible season', async () => {
  await withSeededRandom(24680, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    const ui = makeSensibleUi(journey, {});
    const game = { ui, journey, gameOver: false };

    let days = 0;
    while (!journey.isComplete && !journey.isGameOver && !game.gameOver && days < 60) {
      await runSilvicultureDay(game);
      days++;
    }

    assert.equal(journey.isComplete, true, `expected the campaign to win; final state: day=${journey.day} planted=${journey.planting.blocksPlanted}/${journey.planting.blocksToPlant} surveys=${journey.surveys.freeGrowingComplete}/${journey.surveys.freeGrowingTarget} budget=${journey.resources.budget} gameOverReason=${journey.gameOverReason}`);
    assert.equal(journey.planting.blocksPlanted, journey.planting.blocksToPlant);
    assert.equal(journey.surveys.freeGrowingComplete >= journey.surveys.freeGrowingTarget, true);
    // The task's target window is ~25-45 in-game days for competent play;
    // give some headroom above that for RNG variance in a unit test.
    assert.ok(journey.day <= 50, `expected a win within a plausible season, got day ${journey.day}`);
  });
});

test('zombie-tail: an unwinnable run (capacity and budget both gone) ends early with an explicit reason instead of grinding to bankruptcy', async () => {
  await withSeededRandom(11111, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    // Simulate a program that is nowhere near finished on the planting
    // track but has burned through every contractor-hour, with brushing and
    // surveys already at their own targets (so those don't keep offering a
    // false "still advancing" signal) and a budget generous enough to
    // survive a few days so the zombie-tail check - not the older flat
    // budget check - is what actually ends the run.
    journey.planting.blocksPlanted = 3;
    journey.planting.blocksToPlant = 15;
    journey.planting.seedlingsPlanted = 60000;
    journey.brushing.hectaresComplete = journey.brushing.hectaresTarget;
    journey.surveys.freeGrowingComplete = journey.surveys.freeGrowingTarget;
    journey.resources.contractorCapacity = 0;
    journey.resources.budget = 20000;
    journey.contractors.forEach((c) => { c.isActive = false; });

    const ui = makeSensibleUi(journey, {});
    const game = { ui, journey, gameOver: false };

    let days = 0;
    while (!journey.isComplete && !journey.isGameOver && !game.gameOver && days < 30) {
      await runSilvicultureDay(game);
      days++;
    }

    assert.equal(journey.isGameOver, true, 'an unwinnable program should end the run');
    assert.equal(journey.isComplete, false);
    assert.match(journey.gameOverReason || '', /can no longer reach its targets/i);
    // The old bug ground on for 80-140 days of zero-agency clicking before
    // hitting "Budget exhausted"; the zombie-tail check should catch this
    // within a handful of days once it's genuinely unwinnable.
    assert.ok(days <= 10, `expected an early call, took ${days} days`);
  });
});

test('contractor rotation offers a "Never mind" cancel and never force-stands-down a deployed contractor without confirmation', async () => {
  await withSeededRandom(99999, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    // Force every contractor active/deployed so the only rotation options
    // are "stand someone down" or "Never mind".
    journey.contractors.forEach((c) => { c.isActive = true; });

    let sawNeverMind = false;
    let sawStandDownConfirm = false;
    let rotationExercised = false;
    const ui = {
      write() {}, writeHeader() {}, writeWarning() {}, writePositive() {}, writeDanger() {},
      clear() {}, updateAllStatus() {}, playEventVignette() {},
      async promptChoice(prompt, options) {
        if (options.some((o) => o.value === 'end')) {
          // Exercise the rotation submenu exactly once - cancelling the
          // stand-down confirmation is a genuine no-op (0 hours spent), so
          // re-selecting 'rotation' every time would spin forever without
          // ever advancing the day.
          if (!rotationExercised) {
            const idx = options.findIndex((o) => o.value === 'rotation');
            if (idx !== -1) {
              rotationExercised = true;
              return options[idx];
            }
          }
          return options.find((o) => o.value === 'end') || options[options.length - 1];
        }
        if (prompt === 'Adjust which contractor?') {
          sawNeverMind = options.some((o) => o.value === 'cancel' && /never mind/i.test(o.label));
          // Deliberately pick a deployed contractor to exercise the confirm step.
          const deployed = options.find((o) => o.value !== 'cancel');
          return deployed || options[options.length - 1];
        }
        if (prompt.startsWith('Stand down ')) {
          sawStandDownConfirm = true;
          // Cancel - the player changes their mind.
          return options.find((o) => o.value === 'cancel') || options[0];
        }
        return options[0];
      },
    };
    const game = { ui, journey, gameOver: false };

    await runSilvicultureDay(game);

    assert.equal(sawNeverMind, true, 'the rotation submenu must offer a "Never mind" way out');
    assert.equal(sawStandDownConfirm, true, 'standing a deployed contractor down must require a second confirmation');
    assert.ok(journey.contractors.every((c) => c.isActive), 'cancelling the confirmation must leave every contractor deployed');
  });
});

test('recovering contractors cannot be assigned fieldwork; rest makes work available again', async () => {
  await withSeededRandom(12345, async () => {
    const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
    for (const contractor of journey.contractors) {
      contractor.isActive = false;
      contractor.silvicultureState = { status: 'recovering', cooldownDays: 2 };
    }
    for (const member of journey.crew || []) member.role = 'driver';
    let sawRest = false;
    let sawAvailablePlanting = false;
    let checkedFirstMenu = false;
    const ui = makeSensibleUi(journey, {});
    ui.promptChoice = async (_prompt, options = []) => {
      if (options.some((o) => o.value === 'end')) {
        if (!checkedFirstMenu) {
          const fieldTasks = options.filter((o) => ['plant', 'fill', 'brush', 'inspect', 'survey'].includes(o.value));
          assert.equal(fieldTasks.some((o) => !o.disabled), false);
          // Shown, not hidden: each waits on its crew, with the day it is back.
          assert.ok(fieldTasks.length > 0);
          for (const task of fieldTasks) assert.match(task.description, /^Waits for .+, on days off until day \d+\./);
          assert.ok(options.some((o) => o.label === 'Rest crews and plan tomorrow'));
          checkedFirstMenu = true;
          sawRest = true;
        } else {
          sawAvailablePlanting ||= options.some((o) => o.value === 'plant' && !o.disabled);
        }
        return options.find((o) => o.value === 'end');
      }
      return options.find((o) => o.value === 'set_aside') || options[0];
    };
    const game = { journey, ui, gameOver: false };
    for (let i = 0; i < 4 && !sawAvailablePlanting; i++) await runSilvicultureDay(game);
    assert.ok(sawRest);
    assert.ok(sawAvailablePlanting, 'field tasks should return after recovery');
  });
});

// ── Grade, integrity and the final report ────────────────────────────────────

function deliveredJourney() {
  const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
  journey.planting.blocksPlanted = journey.planting.blocksToPlant;
  journey.planting.seedlingsPlanted = journey.planting.seedlingsAllocated;
  for (const block of journey.program.blocks) { block.planted = block.trees; block.status = 'inspected'; block.quality = 93; }
  journey.planting.qualityAverage = 93;
  for (const opening of journey.program.fill) opening.done = true;
  for (const opening of journey.program.brush) opening.treated = opening.ha;
  journey.brushing.hectaresComplete = journey.brushing.hectaresTarget;
  journey.surveys.freeGrowingComplete = journey.surveys.freeGrowingTarget;
  journey.day = 31;
  journey.resources.budget = 120000;
  return journey;
}

/** Put a taken temptation in the log the way the event resolver does, and ledger it. */
function takenShortcut(journey, actId, band) {
  const option = {
    label: 'Take the shortcut',
    outcome: 'Clean.',
    partialOutcome: 'Noticed.',
    failureOutcome: 'It does not hold.',
  };
  const event = { id: `temptation_${actId}`, temptationActId: actId, title: actId, options: [{ label: 'Say no' }, option] };
  const outcomes = { caught: option.failureOutcome, noticed: option.partialOutcome, clean: option.outcome };
  journey.log.push({ type: 'event', day: journey.day, eventId: event.id, optionLabel: option.label, outcome: outcomes[band] });
  return recordTemptationOutcome(journey, event);
}

test('a delivered program with a clean file grades A; fill counts toward it', () => {
  const journey = deliveredJourney();
  assert.equal(calculateScore(journey, true).grade, 'A');
  const skippedFill = deliveredJourney();
  for (const opening of skippedFill.program.fill) opening.done = false;
  const withoutFill = calculateScore(skippedFill, false);
  assert.ok(withoutFill.components.objectives.score <= 85, `fill counts in the objectives (${withoutFill.components.objectives.score})`);
  assert.ok(withoutFill.totalScore <= 54, 'and a program that skipped it did not deliver');
});

test('a caught falsification costs twenty points on top of scrutiny; two pull the program', () => {
  const journey = deliveredJourney();
  const record = takenShortcut(journey, 'silvi-fake-free-growing', 'caught');
  assert.equal(record.kind, 'false-record');
  assert.equal(record.status, 'caught');
  const after = calculateScore(journey, true);
  const ledger = journey.programIntegrity;
  delete journey.programIntegrity;
  const unledgered = calculateScore(journey, true);
  journey.programIntegrity = ledger;
  assert.equal(after.integrityPenalty, 20);
  assert.equal(after.totalScore, unledgered.totalScore - 20, 'the penalty is not folded into the capped scrutiny line');
  assert.ok(formatScoreDisplay(after).some((line) => /Integrity\s+-20 for shortcuts the district found/.test(line)));

  const spill = takenShortcut(journey, 'silvi-dump-chemicals', 'caught');
  assert.equal(spill.kind, 'shortcut', 'a caught field shortcut is not a false record');
  assert.equal(summarizeIntegrity(journey).penalty, 26);
  assert.equal(summarizeIntegrity(journey).programPulled, false);
  takenShortcut(journey, 'silvi-misreport-planting', 'caught');
  assert.equal(summarizeIntegrity(journey).programPulled, true);
});

test('the season-close check finds falsified records, and repeated falsification takes the win away', async () => {
  const journey = createSilvicultureJourney({ areaId: 'fraser-plateau', scale: 'campaign' });
  journey.planting.blocksPlanted = journey.planting.blocksToPlant;
  journey.planting.seedlingsPlanted = journey.planting.seedlingsAllocated;
  for (const block of journey.program.blocks) { block.planted = block.trees; block.status = 'inspected'; block.quality = 93; }
  for (const opening of journey.program.fill) opening.done = true;
  for (const opening of journey.program.brush) opening.treated = opening.ha;
  journey.brushing.hectaresComplete = journey.brushing.hectaresTarget;
  for (const opening of journey.program.freeGrowing) { opening.needsRelease = false; opening.fgPlotPct = 95; }
  journey.surveys.freeGrowingComplete = journey.surveys.freeGrowingTarget - 1;
  journey.program.freeGrowing[0].surveyed = true;
  journey.program.freeGrowing[0].result = 'pass';
  journey.scrutiny = 70;
  takenShortcut(journey, 'silvi-fake-free-growing', 'noticed');
  takenShortcut(journey, 'silvi-misreport-planting', 'noticed');

  const lines = [];
  const noop = () => {};
  const record = (text) => lines.push(text);
  const ui = {
    write: record, writeHeader: record, writeWarning: record, writeDanger: record,
    writePositive: noop, clear: noop, updateAllStatus: noop, playEventVignette: noop,
    async promptChoice(prompt, options) {
      return options.find((o) => o.value === 'survey') || options.find((o) => o.value === 'set_aside')
        || options.find((o) => o.value === 'end') || options[0];
    },
  };
  const original = Math.random;
  Math.random = () => 0.05;
  try {
    await runSilvicultureDay({ ui, journey, gameOver: false });
  } finally {
    Math.random = original;
  }
  assert.ok(lines.includes('SEASON CLOSE: DISTRICT CHECK'));
  assert.equal(summarizeIntegrity(journey).caughtFalseRecords, 2);
  assert.equal(journey.isComplete, false, 'the declarations are under review, so the program is not delivered');
  assert.equal(journey.isGameOver, true);
  assert.match(journey.gameOverReason, /licensee pulls you off the program/);
  assert.equal(runSeasonCloseAudit(journey).length, 0, 'the season is checked once');
});

test('reporting as surveyed is never the losing play, and the spin reads the run it is written about', () => {
  const clean = deliveredJourney();
  const integrity = resolveFinalReport('integrity', clean).delta;
  const people = resolveFinalReport('people', clean).delta;
  const rolls = Array.from({ length: 100 }, (_, i) => (i + 0.5) / 100);
  const spinEv = (journey) => rolls.reduce((sum, roll) => sum + resolveFinalReport('spin', journey, () => roll).delta, 0) / rolls.length;
  assert.equal(integrity, 4);
  assert.ok(integrity > people);
  assert.ok(integrity > spinEv(clean), `spin expectation ${spinEv(clean)} vs ${integrity}`);

  const dirty = deliveredJourney();
  dirty.scrutiny = 85;
  takenShortcut(dirty, 'silvi-fake-free-growing', 'clean');
  assert.ok(spinEv(dirty) < spinEv(clean), 'a file under scrutiny with a false record in it spins worse');
  assert.ok(resolveFinalReport('integrity', dirty).delta >= 0);
});

test('a scripted no-planting run fails and grades F, not C', async () => {
  const result = await runPolicy('neglect', 'kootenay-wetbelt', 31337);
  assert.equal(result.won, false);
  assert.equal(result.grade, 'F', `neglect graded ${result.grade} (${result.score})`);
  assert.match(result.reason, /program short: 8 of 8 blocks unplanted/);
});

test('competent, neglectful and fraudulent supervisors separate cleanly across the zones', async () => {
  const areas = ['kootenay-wetbelt', 'okanagan-shuswap-drybelt', 'fort-st-john-plateau', 'vancouver-island-coast'];
  const seeds = [4000, 4053];
  const results = { competent: [], neglect: [], shortcuts: [], fraud: [] };
  for (const policy of Object.keys(results)) {
    for (const area of areas) {
      for (const seed of seeds) results[policy].push(await runPolicy(policy, area, seed));
    }
  }
  const mean = (list) => list.reduce((sum, result) => sum + result.score, 0) / list.length;
  for (const result of results.competent) {
    assert.equal(result.won, true, `${result.area}/${result.seed}: ${result.reason}`);
    assert.equal(result.grade, 'A', `${result.area}/${result.seed} graded ${result.grade}`);
  }
  for (const result of results.neglect) {
    assert.equal(result.won, false);
    assert.equal(result.grade, 'F');
  }
  for (const result of results.fraud) {
    assert.equal(result.won, false, 'skipping fill and half the release is not a delivered program');
    assert.ok(['D', 'F'].includes(result.grade), `${result.area}/${result.seed} fraud graded ${result.grade}`);
  }
  assert.ok(results.shortcuts.every((result) => result.integrity.caughtFalseRecords + result.integrity.caughtShortcuts > 0),
    'a season of shortcuts gets found');
  assert.ok(mean(results.shortcuts) < mean(results.competent) - 30,
    `shortcuts ${mean(results.shortcuts)} vs competent ${mean(results.competent)}`);
});
