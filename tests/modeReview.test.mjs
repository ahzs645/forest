import test from 'node:test';
import assert from 'node:assert/strict';
import { createManagerJourney } from '../js/journey/factory.js';
import { runManagerDay } from '../js/modes/manager.js';
import { checkEndConditions } from '../js/modes/shared/endConditions.js';

test('a manager who loses all trust is dismissed before the next board period', () => {
  const journey = createManagerJourney({ areaId: 'fraser-plateau' });
  journey.metrics.reputation = 0;
  const end = checkEndConditions(journey);
  assert.equal(end?.gameOver, true);
  assert.match(end.reason, /trust/i);
});

test('finishing the manager term with zero trust cannot count as a victory', () => {
  const journey = createManagerJourney({ areaId: 'fraser-plateau' });
  journey.day = journey.deadline + 1;
  journey.metrics.reputation = 0;
  const end = checkEndConditions(journey);
  assert.equal(end?.gameOver, true);
  assert.notEqual(end?.victory, true);
});

for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`manager completes bounded monthly turns after serialized recovery (${difficulty}, 12 seeds)`, async () => {
    const originalRandom = Math.random;
    try {
      for (let run = 0; run < 12; run++) {
        let seed = 8900 + run * 37;
        Math.random = () => {
          seed = (1664525 * seed + 1013904223) >>> 0;
          return seed / 0x100000000;
        };
        let prompts = 0;
        const noop = () => {};
        const ui = new Proxy({
          async promptText() { return 'The team remembers'; },
          async promptChoice(_prompt, options) {
            assert.ok(++prompts < 300, 'manager must not loop indefinitely inside a month');
            assert.ok(options.length, 'every prompt needs an actionable response');
            const actionable = options.filter((option) => typeof option.value !== 'symbol');
            // Vary strategic choices and escalation responses across all runs.
            return actionable[(run + prompts) % actionable.length];
          },
        }, { get: (target, key) => target[key] || noop });
        const game = { journey: createManagerJourney({ areaId: 'fraser-plateau', difficulty }), ui, gameOver: false, checkpoint: noop };
        let result;
        for (let month = 0; month < 13 && !result; month++) {
          const before = game.journey.day;
          await runManagerDay(game);
          result = checkEndConditions(game.journey);
          assert.ok(result || game.journey.day > before, 'a completed board period must advance the calendar');
          for (const [name, value] of Object.entries(game.journey.metrics)) {
            assert.ok(Number.isFinite(value) && value >= 0 && value <= 100, `${name} is outside its meter bounds: ${value}`);
          }
          // Reload the real plain-data journey between periods, as save/load does.
          game.journey = JSON.parse(JSON.stringify(game.journey));
        }
        assert.ok(result?.victory || result?.gameOver, `seed ${run} must reach a declared outcome`);
        assert.ok(result.reason, 'the player needs an explanation for the result');
      }
    } finally {
      Math.random = originalRandom;
    }
  });
}
