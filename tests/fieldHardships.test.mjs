import test from 'node:test';
import assert from 'node:assert/strict';

import { createReconJourney, executeFieldDay } from '../js/journey.js';
import {
  applyAccessVerdictPressure,
  getBlockAccessVerdict
} from '../js/journey/fieldMechanics.js';

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

test('access verdicts distinguish hard stops from passable blocks and adjust scrutiny modestly', () => {
  const noGoVerdict = getBlockAccessVerdict(
    {
      id: 'karst-bench',
      name: 'Karst Bench',
      terrain: 'hilly',
      hazards: ['karst_collapse', 'hidden_cavities'],
      features: ['karst']
    },
    { id: 'storm', name: 'Storm', dangerous: true }
  );

  assert.equal(noGoVerdict.id, 'no_go');
  assert.match(noGoVerdict.summary, /no-go/i);

  const passableVerdict = getBlockAccessVerdict(
    {
      id: 'town-line',
      name: 'Town Line',
      terrain: 'flat',
      hazards: ['traffic'],
      features: ['pipeline']
    },
    { id: 'clear', name: 'Clear', dangerous: false }
  );

  assert.equal(passableVerdict.id, 'passable_now');

  const journey = { scrutiny: 3 };
  const cautiousDelta = applyAccessVerdictPressure(journey, passableVerdict, { stance: 'cautious' });
  assert.equal(cautiousDelta, -1);
  assert.equal(journey.scrutiny, 2);

  const aggressiveDelta = applyAccessVerdictPressure(journey, noGoVerdict, { stance: 'aggressive' });
  assert.equal(aggressiveDelta, 3);
  assert.equal(journey.scrutiny, 5);
});

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

test('field travel surfaces access verdicts when the crew pushes into a bad block', () => {
  const journey = makeJourney();
  journey.blocks = [
    {
      id: 'start',
      name: 'Base Camp',
      distance: 0,
      terrain: 'flat',
      hazards: [],
      features: ['town']
    },
    {
      id: 'risk',
      name: 'Karst Bench',
      distance: 0.1,
      terrain: 'hilly',
      hazards: ['karst_collapse', 'hidden_cavities'],
      features: ['karst']
    }
  ];
  journey.totalDistance = 0.1;
  journey.currentBlockIndex = 0;
  journey.distanceTraveled = 0;
  journey.resources.food = 30;
  journey.resources.fuel = 50;
  journey.resources.equipment = 80;
  journey.weather = { id: 'clear', name: 'Clear', moraleEffect: 0, travelModifier: 1 };
  journey.temperature = 'cool';
  journey.routePlan = {
    day: journey.day,
    label: 'Risky Shortcut',
    shortLabel: 'shortcut',
    distanceMultiplier: 1.24,
    fuelMultiplier: 1,
    equipmentMultiplier: 1,
    injuryRisk: 0,
    moraleDelta: 0
  };

  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    const result = executeFieldDay(journey, 'grueling');

    assert.ok(result.messages.some((message) => /Access verdict: No-go/i.test(message)));
    assert.ok(result.messages.some((message) => /Scrutiny rises by/i.test(message)));
    assert.equal(journey.accessVerdicts.risk.id, 'no_go');
    assert.ok(journey.scrutiny >= 3);
    assert.ok(journey.discoveryTags.some((tag) => tag.id === 'access_rehab'));
  } finally {
    Math.random = originalRandom;
  }
});
