import test from 'node:test';
import assert from 'node:assert/strict';

import { buildValuesWorkshopChoices } from '../js/modes/planning.js';

// Mirror of the workshop time costs in planning.js: the four single-emphasis
// options cost the workshop's base 3h; Balanced Approach costs 5h total.
function workshopCost(choice) {
  return choice.value === 'balanced' ? 5 : 3;
}

test('Balanced Approach is hidden below 5 hours', () => {
  for (const hours of [0, 1, 2, 3, 4]) {
    const choices = buildValuesWorkshopChoices(hours);
    assert.ok(
      !choices.some((c) => c.value === 'balanced'),
      `Balanced Approach must not be offered with only ${hours}h left`
    );
    assert.equal(choices.length, 4, 'the four single-emphasis options remain available');
  }
});

test('Balanced Approach appears once 5 hours are available', () => {
  for (const hours of [5, 6, 7, 8]) {
    const choices = buildValuesWorkshopChoices(hours);
    assert.ok(
      choices.some((c) => c.value === 'balanced'),
      `Balanced Approach should be offered with ${hours}h left`
    );
    assert.equal(choices.length, 5);
  }
});

test('no offered workshop choice can drive the shift below zero hours', () => {
  // The Values Workshop action itself is only offered at >= 3h, so test the
  // reachable range. Every listed choice must leave hours at zero or above.
  for (let hours = 3; hours <= 8; hours++) {
    for (const choice of buildValuesWorkshopChoices(hours)) {
      assert.ok(
        hours - workshopCost(choice) >= 0,
        `choosing "${choice.label}" with ${hours}h left would go negative`
      );
    }
  }
});
