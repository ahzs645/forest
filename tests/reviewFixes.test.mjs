import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveEvent } from '../js/events/resolution.js';
import { createSilvicultureJourney, createReconJourney, createPermittingJourney } from '../js/journey/factory.js';

function makeEvent(option) {
  return {
    event: { id: 'test_event', title: 'Test Event', severity: 'moderate', options: [option] },
    option,
  };
}

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

test('silviculture treasury is not clamped to the field cash ceiling', () => {
  const journey = createSilvicultureJourney({ areaId: 'fort-st-john-plateau' });
  assert.equal(journey.resources.budget, 120000);

  // budget: 0 must be a true no-op (the old clamp fired on typeof checks)
  let { option, event } = makeEvent({ label: 'noop', outcome: 'x', effects: { budget: 0 } });
  resolveEvent(journey, event, option);
  assert.equal(journey.resources.budget, 120000);

  ({ option, event } = makeEvent({ label: 'cost', outcome: 'x', effects: { budget: -200 } }));
  resolveEvent(journey, event, option);
  assert.equal(journey.resources.budget, 119800);

  ({ option, event } = makeEvent({ label: 'gain', outcome: 'x', effects: { budget: 50000 } }));
  resolveEvent(journey, event, option);
  assert.equal(journey.resources.budget, 169800, 'no 8k field ceiling on the program budget');
});

test('recon cash keeps the field ceiling', () => {
  const journey = createReconJourney({ areaId: 'fort-st-john-plateau' });
  const { option, event } = makeEvent({ label: 'windfall', outcome: 'x', effects: { budget: 50000 } });
  resolveEvent(journey, event, option);
  assert.ok(journey.resources.budget <= 8000, `field cash stays capped, got ${journey.resources.budget}`);
});

test('silviculture progress effects land on the planting track', () => {
  const journey = createSilvicultureJourney({ areaId: 'fort-st-john-plateau' });
  const { option, event } = makeEvent({ label: 'push', outcome: 'x', effects: { progress: 8 } });
  resolveEvent(journey, event, option);
  assert.ok(journey.planting.blocksPlanted > 0, 'progress converts to planted blocks');
});

test('gamble options use the failure branch when the roll misses', () => {
  const journey = createReconJourney({ areaId: 'fort-st-john-plateau' });
  const gamble = {
    label: 'risk it',
    outcome: 'It works!',
    effects: { progress: 5 },
    chanceSuccess: 0.4,
    failureOutcome: 'It fails.',
    failureEffects: { progress: -5 },
  };
  const { event } = makeEvent(gamble);

  // Journeys must be created OUTSIDE the Math.random stub: crew-name
  // generation retries for uniqueness and never terminates on a constant.
  const winJourney = createReconJourney({ areaId: 'fort-st-john-plateau' });
  const loseJourney = createReconJourney({ areaId: 'fort-st-john-plateau' });

  const win = withRandom(0.1, () => resolveEvent(winJourney, event, gamble));
  assert.ok(win.messages.includes('It works!'));

  const lose = withRandom(0.9, () => resolveEvent(loseJourney, event, gamble));
  assert.ok(lose.messages.includes('It fails.'));
  assert.ok(!lose.messages.includes('It works!'));
});

test('lose_member and evacuate_sick crew effects actually remove people', () => {
  const journey = createReconJourney({ areaId: 'fort-st-john-plateau' });
  const before = journey.crew.filter((m) => m.isActive).length;
  const { option, event } = makeEvent({ label: 'quit', outcome: 'x', crewEffect: { lose_member: true } });
  resolveEvent(journey, event, option);
  assert.equal(journey.crew.filter((m) => m.isActive).length, before - 1);
  assert.ok(journey.crew.some((m) => m.hasQuit));

  const sick = createReconJourney({ areaId: 'fort-st-john-plateau' });
  sick.crew[0].statusEffects = [{ effectId: 'flu', daysRemaining: 2 }];
  const evac = makeEvent({ label: 'evac', outcome: 'x', crewEffect: { evacuate_sick: true } });
  resolveEvent(sick, evac.event, evac.option);
  assert.equal(sick.crew[0].isActive, false);
});

test('survey data effects bank into recon quality surveys', () => {
  const journey = createReconJourney({ areaId: 'fort-st-john-plateau' });
  const { option, event } = makeEvent({ label: 'log it', outcome: 'x', effects: { data: 10 } });
  const result = resolveEvent(journey, event, option);
  assert.ok(journey.qualitySurveys >= 1);
  assert.ok(result.messages.some((m) => m.includes('Survey data logged')));
});

test('crew morale maps to protagonist stress on crewless desk runs', () => {
  const journey = createPermittingJourney({ areaId: 'fort-st-john-plateau' });
  journey.protagonist.stress = 50;
  const { option, event } = makeEvent({ label: 'win', outcome: 'x', effects: { crew_morale: 10 } });
  resolveEvent(journey, event, option);
  assert.equal(journey.protagonist.stress, 40, 'positive morale eases stress');
});
