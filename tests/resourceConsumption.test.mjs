import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyConsumption,
  calculateFieldConsumption,
  FIELD_RESOURCES
} from '../js/resources.js';
import { createReconJourney, executeFieldAction } from '../js/journey.js';

// Regression test for a floating-point leak: repeatedly subtracting clean
// one-decimal consumption amounts (e.g. 4.4, 5.2, ...) from a resource total
// using plain `a - b` accumulates binary floating-point noise, eventually
// producing values like 15.100000000000001 that leaked straight into player
// -facing warning/critical text ("... person-days").
function hasFloatingPointNoise(value) {
  // A "clean" value rounded to one decimal never needs more than one digit
  // after the decimal point when stringified.
  const [, decimals = ''] = String(value).split('.');
  return decimals.length > 1;
}

test('applyConsumption never leaves floating-point noise on repeated subtraction', () => {
  let resources = { fuel: 200, food: 80, equipment: 100, budget: 0, firstAid: 8 };
  const conditions = { pace: 'normal', terrain: 'hilly', weather: 'cool', rationFactor: 1 };

  for (let day = 0; day < 60; day++) {
    const consumption = calculateFieldConsumption(conditions, 5);
    const result = applyConsumption(resources, consumption, FIELD_RESOURCES);
    resources = result.resources;

    for (const key of Object.keys(resources)) {
      assert.equal(
        hasFloatingPointNoise(resources[key]),
        false,
        `${key} should not carry floating-point noise, got ${resources[key]}`
      );
    }

    for (const entry of [...result.warnings, ...result.critical]) {
      assert.equal(
        hasFloatingPointNoise(entry.value),
        false,
        `${entry.resource} warning/critical value should not carry floating-point noise, got ${entry.value}`
      );
    }
  }
});

test('food (person-days) warnings render a clean one-decimal value during a real recon run', () => {
  const journey = createReconJourney({
    roleId: 'recce',
    areaId: 'fort-st-john-plateau',
    crewName: 'Test Crew'
  });

  // Push food down near the warning threshold so the day-advance loop below
  // is guaranteed to emit at least one food warning/critical message.
  journey.resources.food = 12;

  let sawFoodMessage = false;
  for (let day = 0; day < 10 && journey.resources.food > 0; day++) {
    const result = executeFieldAction(journey, 'normal');
    for (const message of result.messages || []) {
      if (!/person-days/.test(message)) continue;
      sawFoodMessage = true;
      const match = message.match(/([\d.]+)\s*person-days/);
      assert.ok(match, `expected a numeric person-days value in: ${message}`);
      const [, decimals = ''] = match[1].split('.');
      assert.ok(
        decimals.length <= 1,
        `food message should round to at most one decimal, got "${message}"`
      );
    }
  }

  assert.ok(sawFoodMessage, 'expected at least one food (person-days) warning/critical message to fire');
});
