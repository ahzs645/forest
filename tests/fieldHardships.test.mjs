import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReconJourney,
  executeFieldDay,
  executeFieldAction,
  endFieldDay
} from '../js/journey.js';
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

test('executeFieldAction resolves the shift without rolling the calendar forward', () => {
  const journey = makeJourney();
  journey.routePlan = { day: journey.day, shortLabel: 'ridge line', fuelMultiplier: 1 };
  const startDay = journey.day;
  const startWeather = journey.weather;

  const result = executeFieldAction(journey, 'normal');

  // The day's work resolved (distance covered) but the calendar did not advance,
  // so the header, weather, and route plan stay put for the rest of the shift.
  assert.equal(journey.day, startDay, 'day must not advance on a single action');
  assert.equal(journey.weather, startWeather, 'weather must not reroll mid-shift');
  assert.deepEqual(journey.routePlan, { day: startDay, shortLabel: 'ridge line', fuelMultiplier: 1 });
  assert.ok(result.messages.length > 0);

  // Only ending the shift advances the calendar and clears per-shift state.
  endFieldDay(journey);
  assert.equal(journey.day, startDay + 1, 'endFieldDay advances exactly one day');
  assert.equal(journey.routePlan, null, 'endFieldDay clears the route plan');
});

test('executeFieldDay still advances the day for single-call callers', () => {
  const journey = makeJourney();
  const startDay = journey.day;
  executeFieldDay(journey, 'normal');
  assert.equal(journey.day, startDay + 1);
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

test('field travel records road lifecycle and water timing pressure on sensitive crossings', () => {
  const journey = makeJourney();
  journey.blocks = [
    {
      id: 'base',
      name: 'Base Camp',
      distance: 0,
      terrain: 'flat',
      hazards: [],
      features: ['town']
    },
    {
      id: 'crossing',
      name: 'Community Watershed Crossing',
      distance: 0.1,
      terrain: 'river',
      hazards: ['river_crossing', 'road_damage', 'grade', 'bridge_weight'],
      features: ['community_water', 'watershed', 'water_intake']
    }
  ];
  journey.totalDistance = 0.1;
  journey.currentBlockIndex = 0;
  journey.distanceTraveled = 0;
  journey.resources.food = 30;
  journey.resources.fuel = 50;
  journey.resources.equipment = 80;
  journey.weather = {
    id: 'heavy_rain',
    name: 'Heavy Rain',
    dangerous: true,
    moraleEffect: -1,
    travelModifier: 1
  };
  journey.temperature = 'cool';
  journey.season.currentSeason = 'spring';
  journey.routePlan = {
    day: journey.day,
    label: 'Stay Mainline',
    shortLabel: 'mainline',
    distanceMultiplier: 1,
    fuelMultiplier: 1,
    equipmentMultiplier: 1,
    injuryRisk: 0,
    moraleDelta: 0
  };
  journey.roadAssets = {
    byBlock: {
      crossing: {
        roadWear: 62,
        crossingWear: 16,
        watershedPressure: 10
      }
    },
    observations: []
  };

  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    const result = executeFieldDay(journey, 'normal');
    const crossingObservation = journey.roadAssets.byBlock.crossing;

    assert.ok(result.messages.some((message) => /Access verdict: /i.test(message)));
    assert.ok(result.messages.some((message) => /Road: /i.test(message)));
    assert.ok(result.messages.some((message) => /Crossing: /i.test(message)));
    assert.ok(result.messages.some((message) => /Watershed: /i.test(message)));
    assert.equal(crossingObservation.roadLifecycleId, 'out_of_service');
    assert.equal(crossingObservation.crossingConditionId, 'restricted');
    assert.equal(crossingObservation.watershedPressureId, 'critical');
    assert.equal(journey.accessVerdicts.crossing.roadLifecycleId, 'out_of_service');
    assert.equal(journey.accessVerdicts.crossing.crossingConditionId, 'restricted');
    assert.ok(journey.scrutiny >= 3);
  } finally {
    Math.random = originalRandom;
  }
});
