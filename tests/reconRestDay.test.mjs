import test from 'node:test';
import assert from 'node:assert/strict';

import { createReconJourney } from '../js/journey/factory.js';
import { runReconDay } from '../js/modes/recon.js';
import { OPERATING_AREAS } from '../js/data/index.js';

/**
 * Minimal scripted UI: answers every prompt by preferring to end the shift,
 * then taking the single continue/next button. Route prompts (no end_shift)
 * fall through to the first option.
 */
function createScriptedUI() {
  const noop = () => {};
  return {
    clear: noop,
    writeHeader: noop,
    write: noop,
    writePositive: noop,
    writeWarning: noop,
    writeDanger: noop,
    writeBox: noop,
    writeDivider: noop,
    updateAllStatus: noop,
    async promptChoice(_prompt, options = []) {
      const endShift = options.find((o) => o.value === 'end_shift');
      if (endShift) return endShift;
      const next = options.find((o) => o.value === 'next');
      if (next) return next;
      return options[0] || { value: 'next' };
    }
  };
}

test('recon Rest & End Shift advances the day exactly once', async () => {
  // Build the journey (and its crew) with the real RNG — crew name generation
  // rejection-samples for uniqueness and would spin under a constant stub.
  const journey = createReconJourney({ roleId: 'recce', areaId: OPERATING_AREAS[0].id });
  // Keep the day on the normal multi-action path (not a weather-forced camp)
  // and clear of the low-food decision prompt.
  journey.weather = { id: 'clear', name: 'Clear' };
  journey.resources.food = 100;
  journey.resources.fuel = 100;
  journey.resources.equipment = 100;

  // Only now suppress random events and crew dialogue for a deterministic run.
  const realRandom = Math.random;
  Math.random = () => 0.999;

  try {
    const game = { ui: createScriptedUI(), journey, gameOver: false };

    const dayBefore = journey.day;
    await runReconDay(game);

    assert.equal(
      journey.day,
      dayBefore + 1,
      'ending the shift should advance the calendar by one day, not two'
    );
    assert.equal(journey.hoursRemaining, 0, 'the shift should be fully spent');
  } finally {
    Math.random = realRandom;
  }
});
