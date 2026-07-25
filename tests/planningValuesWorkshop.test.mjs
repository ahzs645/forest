import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BALANCED_WORKSHOP_SURCHARGE,
  buildValuesWorkshopChoices
} from '../js/modes/planning.js';

// The Values Workshop used to gate its Balanced Approach on having 5 of the
// day's 8 hours left. A day is one action now (js/journey/dayPlan.js), so
// every emphasis takes the same day and the balanced option pays for its
// spread out of the planner instead of out of a clock.

test('every values emphasis is on the table, balanced included', () => {
  const choices = buildValuesWorkshopChoices();
  const values = choices.map((choice) => choice.value);

  assert.deepEqual(values, ['bio', 'timber_v', 'community', 'fn', 'balanced']);
});

test('the balanced option advertises what it costs the planner', () => {
  const balanced = buildValuesWorkshopChoices().find((choice) => choice.value === 'balanced');

  assert.ok(balanced, 'Balanced Approach should always be offered');
  assert.match(balanced.description, new RegExp(`${BALANCED_WORKSHOP_SURCHARGE.energy} energy`));
  assert.match(balanced.description, new RegExp(`${BALANCED_WORKSHOP_SURCHARGE.stress} stress`));
});

test('the balanced surcharge is a real cost, not decoration', () => {
  assert.ok(BALANCED_WORKSHOP_SURCHARGE.energy > 0);
  assert.ok(BALANCED_WORKSHOP_SURCHARGE.stress > 0);
});

test('no workshop choice is gated on a resource the day no longer tracks', () => {
  // buildValuesWorkshopChoices takes no arguments now; passing a stale hour
  // count must not quietly shrink the menu the way the old signature did.
  for (const stale of [0, 1, 4, 8]) {
    assert.equal(
      buildValuesWorkshopChoices(stale).length,
      5,
      `an ignored "${stale}" argument must not drop options`
    );
  }
});
