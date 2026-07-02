import test from 'node:test';
import assert from 'node:assert/strict';

import { createSilvicultureJourney } from '../js/journey/factory.js';
import { runSilvicultureDay } from '../js/modes/silviculture.js';

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

const ACTION_PRIORITY = ['plant', 'inspect', 'fill', 'herbicide', 'survey', 'rotation', 'meeting', 'team_briefing', 'briefing', 'end'];

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
        const readyIdx = options.findIndex((o) => o.description && o.description.startsWith('ready'));
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
    assert.ok((actionCounts.plant || 0) >= 10,
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
