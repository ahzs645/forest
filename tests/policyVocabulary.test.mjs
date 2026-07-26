import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReconJourney,
  createPlanningJourney,
  createPermittingJourney,
  createSilvicultureJourney,
} from '../js/journey/factory.js';
import { runReconDay } from '../js/modes/recon.js';
import { runPlanningDay } from '../js/modes/planning.js';
import { runPermittingDay } from '../js/modes/permitting.js';
import { runSilvicultureDay } from '../js/modes/silviculture.js';
import { POLICY_VOCABULARY } from '../scripts/simulate-expeditions.mjs';

/**
 * The balance harness steers every mode by option `value` strings. Rename one
 * and the policy stops recognising that decision and silently takes whatever is
 * first on the list — which reads as a balance regression, not a broken tool.
 * Renaming walk_away to set_aside moved recon from 17/24 to 5/24 and looked
 * for all the world like the content had got harder.
 *
 * Counting fall-through does not catch it: the policies end in an explicit
 * `options[0]`, so they never return null. The only reliable guard is to drive
 * the real modes and check the vocabulary is still there.
 */

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Drive a mode for a while, collecting every option value it ever offers. */
async function collectOptionValues(create, run, { seed = 4242, days = 25 } = {}) {
  const original = Math.random;
  Math.random = seededRandom(seed);
  const seen = new Set();
  try {
    const journey = create({ areaId: 'fraser-plateau' });
    const noop = () => {};
    const ui = {
      write: noop, writeHeader: noop, writeWarning: noop, writePositive: noop,
      writeDanger: noop, writeBox: noop, writeDivider: noop, clear: noop,
      updateAllStatus: noop, playEventVignette: noop, playScene: noop,
      playTravelStrip: noop, playRadioAction: noop, setMissionStatus: noop,
      clearMissionStatus: noop, writeSuccess: noop,
      async promptText() { return 'x'; },
      async promptChoice(prompt, options = []) {
        for (const option of options) seen.add(String(option?.value));
        if (!options.length) return { value: undefined };
        // Explore rather than always taking the first option: several values
        // the policy depends on live one level down (recon's end_shift is
        // inside the camp submenu), and a collector that never opens a submenu
        // reports them missing when they are simply unvisited. The per-day
        // free-lookup guard in js/journey/dayPlan.js stops this looping.
        return options[Math.floor(Math.random() * options.length)];
      },
    };
    const game = { ui, journey, gameOver: false };
    for (let day = 0; day < days && !game.gameOver && !journey.isComplete; day += 1) {
      try {
        await run(game);
      } catch {
        break;
      }
    }
  } finally {
    Math.random = original;
  }
  return seen;
}

const MODES = [
  ['recon', createReconJourney, runReconDay],
  ['planning', createPlanningJourney, runPlanningDay],
  ['permitting', createPermittingJourney, runPermittingDay],
  ['silviculture', createSilvicultureJourney, runSilvicultureDay],
];

for (const [name, create, run] of MODES) {
  test(`${name}: the balance policy's option vocabulary still exists in the mode`, async () => {
    const expected = POLICY_VOCABULARY[name];
    assert.ok(expected?.length, `no vocabulary declared for ${name}`);

    // Several seeds, because some options are conditional on run state and one
    // seed may never surface them.
    const seen = new Set();
    for (const seed of [4242, 90210, 1337]) {
      for (const value of await collectOptionValues(create, run, { seed })) {
        seen.add(value);
      }
    }

    const missing = expected.filter((value) => !seen.has(value));
    assert.deepEqual(
      missing, [],
      `${name} policy steers by option values that the mode no longer offers: ${missing.join(', ')}.\n`
      + 'Either the option was renamed (update POLICY_VOCABULARY and the policy in '
      + 'scripts/simulate-expeditions.mjs) or it was removed. Until then the harness '
      + 'is measuring a player who cannot see those choices.',
    );
  });
}
