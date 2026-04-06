import test from 'node:test';
import assert from 'node:assert/strict';

import { createReconJourney, executeFieldDay } from '../js/journey.js';

function makeJourney() {
  const journey = createReconJourney({
    roleId: 'recce',
    areaId: 'fort-st-john-plateau',
    crewName: 'Test Crew'
  });

  journey.weather = { id: 'clear', name: 'Clear', moraleEffect: 0, travelModifier: 1 };
  journey.temperature = 'cool';
  journey.resources.food = 8;
  journey.resources.fuel = 50;
  journey.resources.equipment = 80;

  return journey;
}

test('sustained critical food shortage triggers hardship pressure on the field crew', () => {
  const journey = makeJourney();
  const startingMorale = journey.crew.reduce((sum, member) => sum + member.morale, 0);

  executeFieldDay(journey, 'slow');
  const secondDay = executeFieldDay(journey, 'slow');

  assert.equal(journey.resourcePressure.food, 2);
  assert.ok(secondDay.messages.some((message) => message.includes('Rationing has set in')));
  const endingMorale = journey.crew.reduce((sum, member) => sum + member.morale, 0);
  assert.ok(endingMorale < startingMorale);
});

test('route choices apply their narrative consequence and clear for the next day', () => {
  const journey = makeJourney();
  journey.resources.food = 30;
  const startingMorale = journey.crew[0].morale;

  journey.routePlan = {
    day: journey.day,
    label: 'Risky Shortcut',
    shortLabel: 'shortcut',
    distanceMultiplier: 1.24,
    fuelMultiplier: 0.92,
    equipmentMultiplier: 1.28,
    injuryRisk: 0,
    moraleDelta: -2,
    note: 'You cut a rough shortcut through the timber, gambling that speed matters more than comfort.'
  };

  const result = executeFieldDay(journey, 'normal');

  assert.ok(result.messages.some((message) => message.includes('rough shortcut')));
  assert.equal(journey.routePlan, null);
  assert.equal(journey.crew[0].morale, startingMorale - 2);
});

test('short rations reduce food use and revert to the normal baseline after the shift', () => {
  const journey = makeJourney();
  journey.resources.food = 30;
  journey.rationPlan.mode = 'short';
  journey.rationPlan.shortRationStreak = 2;

  executeFieldDay(journey, 'camp_work');

  assert.ok(journey.resources.food > 26);
  assert.equal(journey.rationPlan.mode, 'normal');
  assert.equal(journey.rationPlan.shortRationStreak, 2);
});
