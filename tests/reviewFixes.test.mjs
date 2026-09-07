import test from 'node:test';
import assert from 'node:assert/strict';

import { formatEventForDisplay } from '../js/events.js';
import { resolveEvent } from '../js/events/resolution.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { FIELD_EVENTS } from '../js/data/fieldEvents.js';
import {
  createPlanningJourney,
  createSilvicultureJourney,
  createReconJourney,
  createPermittingJourney
} from '../js/journey/factory.js';
import { endFieldDay, executeFieldAction } from '../js/journey/fieldMechanics.js';
import { runDaySituation } from '../js/journey/daySituation.js';
import { getActiveRouteConstraint, resolveRouteConstraint } from '../js/journey/routeConstraints.js';
import { runSilvicultureDay } from '../js/modes/silviculture.js';
import { updatePlanningMissionStatus } from '../js/modes/planning.js';

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

async function withRandomAsync(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return await fn();
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

test('silviculture progress effects never leave blocksPlanted fractional', () => {
  const journey = createSilvicultureJourney({ areaId: 'fort-st-john-plateau' });
  // progress:1 -> blockDelta of 1/8 = 0.125, which used to be applied
  // directly and could show the player "0.125/15 blocks" in the header.
  for (let i = 0; i < 5; i++) {
    const { option, event } = makeEvent({ label: 'nudge', outcome: 'x', effects: { progress: 1 } });
    resolveEvent(journey, event, option);
    assert.ok(Number.isInteger(journey.planting.blocksPlanted),
      `blocksPlanted must stay a whole number, got ${journey.planting.blocksPlanted}`);
  }

  // The fractional remainder still accumulates across calls instead of
  // being silently rounded away - eight +1 nudges (1 full block worth)
  // eventually tips the counter over by one whole block.
  const journey2 = createSilvicultureJourney({ areaId: 'fort-st-john-plateau' });
  for (let i = 0; i < 8; i++) {
    const { option, event } = makeEvent({ label: 'nudge', outcome: 'x', effects: { progress: 1 } });
    resolveEvent(journey2, event, option);
  }
  assert.equal(journey2.planting.blocksPlanted, 1, 'eight +1 progress nudges should accumulate into one whole block');
});

test('silviculture setback events cannot drag blocksPlanted below what seedlings already back', () => {
  const journey = createSilvicultureJourney({ areaId: 'fort-st-john-plateau' });
  // Simulate a fully-seeded program (as if every plant/fill action had run)
  // where a block counter of 15 is fully backed by the seedling pool.
  journey.planting.seedlingsPlanted = journey.planting.seedlingsAllocated;
  journey.planting.blocksPlanted = journey.planting.blocksToPlant;

  const { option, event } = makeEvent({ label: 'setback', outcome: 'x', effects: { progress: -80 } });
  resolveEvent(journey, event, option);

  assert.equal(journey.planting.blocksPlanted, journey.planting.blocksToPlant,
    'a narrative setback must not erase planting progress that seedlings already paid for');
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

test('event option hints disclose whether the response uses the day', () => {
  const media = DESK_EVENTS.find((event) => event.id === 'media_inquiry');
  const mediaFormatted = formatEventForDisplay(media, 'planning');
  const written = mediaFormatted.options.find((option) => option.label === 'Provide a written statement only');
  assert.match(written.hint, /brief response; work continues/i);
  assert.match(written.hint, /-1h/i);

  const washout = FIELD_EVENTS.find((event) => event.id === 'road_washout');
  const washoutFormatted = formatEventForDisplay(washout, 'recon');
  const bypass = washoutFormatted.options.find((option) => option.label === 'Build a bypass');
  assert.match(bypass.hint, /uses this day/i);

  const hidden = formatEventForDisplay({
    id: 'hidden_call',
    title: 'Hidden Call',
    options: [{ label: 'Risk it', hiddenOutcome: true, chanceSuccess: 0.5, chancePartial: 0.3 }]
  }, 'recon');
  assert.match(hidden.options[0].hint, /50% clean, 20% badly wrong/i);
  assert.match(hidden.options[0].hint, /brief response; work continues/i);
});

test('setting aside a road washout leaves a persistent route constraint that blocks travel', async () => {
  const journey = createReconJourney({ areaId: 'fort-st-john-plateau' });
  journey.blocks = [
    { id: 'camp', name: 'Highway Camp', distance: 0, terrain: 'flat', hazards: [], features: [] },
    { id: 'blackwater', name: 'Blackwater Road', distance: 5, terrain: 'flat', hazards: [], features: [] },
  ];
  journey.totalDistance = 5;
  journey.currentBlockIndex = 0;
  journey.distanceTraveled = 0;
  journey.resources.fuel = 50;
  journey.resources.equipment = 100;
  journey.weather = { id: 'clear', name: 'Clear', travelModifier: 1 };
  const washout = FIELD_EVENTS.find((event) => event.id === 'road_washout');
  const writes = [];
  const ui = {
    clear() {},
    write(text) { writes.push(String(text || '')); },
    writeHeader(text) { writes.push(String(text || '')); },
    writeWarning(text) { writes.push(String(text || '')); },
    updateAllStatus() {},
    async promptChoice(_prompt, options) {
      return options.find((option) => option.value === 'set_aside') || options[0];
    }
  };

  const outcome = await runDaySituation({ ui, journey, gameOver: false }, washout, {});
  assert.equal(outcome.setAside, true);
  const constraint = getActiveRouteConstraint(journey);
  assert.ok(constraint, 'the washout should stay active after being set aside');
  assert.match(writes.join('\n'), /remains active/i);

  const blocked = executeFieldAction(journey, 'normal');
  assert.equal(blocked.blocked, true);
  assert.equal(journey.currentBlockIndex, 0);
  assert.equal(journey.distanceTraveled, 0);

  const cleared = resolveRouteConstraint(journey, constraint.id, 'clear');
  assert.equal(cleared.resolved, true);
  assert.equal(getActiveRouteConstraint(journey), null);
});

test('detouring a route constraint queues delay for the next travel leg', async () => {
  const journey = createReconJourney({ areaId: 'fort-st-john-plateau' });
  journey.blocks = [
    { id: 'camp', name: 'Camp', distance: 0, terrain: 'flat', hazards: [], features: [] },
    { id: 'ridge', name: 'Ridge Spur', distance: 10, terrain: 'flat', hazards: [], features: [] },
  ];
  journey.totalDistance = 10;
  journey.currentBlockIndex = 0;
  journey.distanceTraveled = 0;
  journey.resources.food = 50;
  journey.resources.fuel = 50;
  journey.resources.equipment = 100;
  journey.weather = { id: 'clear', name: 'Clear', travelModifier: 1 };
  journey.temperature = 'cool';
  const washout = FIELD_EVENTS.find((event) => event.id === 'road_washout');
  const ui = {
    clear() {}, write() {}, writeHeader() {}, writeWarning() {}, updateAllStatus() {},
    async promptChoice(_prompt, options) {
      return options.find((option) => option.value === 'set_aside') || options[0];
    }
  };

  await runDaySituation({ ui, journey, gameOver: false }, washout, {});
  const constraint = getActiveRouteConstraint(journey);
  const detoured = resolveRouteConstraint(journey, constraint.id, 'detour');
  assert.equal(detoured.resolved, true);
  assert.ok(journey.pendingTravelSetback > 0);
  assert.equal(journey.travelSetback || 0, 0);

  endFieldDay(journey);
  assert.ok(journey.travelSetback > 0);
  assert.equal(journey.pendingTravelSetback, 0);
  const result = withRandom(0.5, () => executeFieldAction(journey, 'normal'));
  assert.ok(journey.distanceTraveled > 0 && journey.distanceTraveled < 10);
  assert.equal(journey.currentBlockIndex, 0, 'the detour delay slows this leg instead of teleporting progress');
});

test('travel stops at the named next destination and reports clamped distance', () => {
  const journey = createReconJourney({ areaId: 'fort-st-john-plateau' });
  journey.blocks = [
    { id: 'camp', name: 'Camp', distance: 0, terrain: 'flat', hazards: [], features: [] },
    { id: 'blackwater', name: 'Blackwater Road', distance: 5, terrain: 'flat', hazards: [], features: [] },
    { id: 'burn', name: 'Old Burn Edge', distance: 5, terrain: 'flat', hazards: [], features: [] },
  ];
  journey.totalDistance = 10;
  journey.currentBlockIndex = 0;
  journey.distanceTraveled = 0;
  journey.resources.food = 50;
  journey.resources.fuel = 50;
  journey.resources.equipment = 100;
  journey.weather = { id: 'clear', name: 'Clear', travelModifier: 1 };
  journey.temperature = 'cool';

  const result = withRandom(0.5, () => executeFieldAction(journey, 'grueling'));
  assert.equal(journey.currentBlockIndex, 1);
  assert.equal(journey.distanceTraveled, 5);
  assert.ok(result.messages.some((message) => /Walked 5 km of line and road location/.test(message)));
  assert.ok(result.messages.some((message) => /Arrived at Blackwater Road/.test(message)));
  assert.ok(!result.messages.some((message) => /Arrived at Old Burn Edge/.test(message)));
});

test('incidental negative field progress creates delay without moving the crew backward', () => {
  const journey = createReconJourney({ areaId: 'fort-st-john-plateau' });
  journey.blocks = [
    { id: 'camp', name: 'Camp', distance: 0, terrain: 'flat', hazards: [], features: [] },
    { id: 'pine', name: 'Pine Plantation', distance: 5, terrain: 'flat', hazards: [], features: [] },
    { id: 'dry', name: 'Dry Creek', distance: 5, terrain: 'flat', hazards: ['river_crossing'], features: [] },
  ];
  journey.totalDistance = 10;
  journey.currentBlockIndex = 1;
  journey.distanceTraveled = 5;
  journey.travelSetback = 0;

  const event = { id: 'supplies_lost', title: 'Supplies Lost', severity: 'minor', options: [] };
  const option = { label: 'Secure remaining cargo', outcome: 'You stop to re-tie the load.', effects: { progress: -1 } };
  const result = resolveEvent(journey, event, option);

  assert.equal(journey.currentBlockIndex, 1);
  assert.equal(journey.distanceTraveled, 5);
  assert.ok(journey.travelSetback > 0);
  assert.ok(result.messages.some((message) => /Tomorrow's leg will be slower/i.test(message)));
});

test('GIS data recovery does not route a technical setback into stakeholder buy-in', () => {
  const journey = createPlanningJourney({ areaId: 'fraser-plateau' });
  journey.plan.phase = 'stakeholder_review';
  journey.plan.dataCompleteness = 70;
  journey.plan.stakeholderBuyIn = 62;
  const event = DESK_EVENTS.find((event) => event.id === 'gis_data_corrupted');
  const rebuild = event.options.find((option) => option.label === 'Rebuild from field notes');

  const result = resolveEvent(journey, event, rebuild);
  assert.equal(journey.plan.dataCompleteness, 70);
  assert.equal(journey.plan.stakeholderBuyIn, 62);
  assert.ok(result.messages.some((message) => /ate the day|cuts into the day/i.test(message)));

  const extensionJourney = createPlanningJourney({ areaId: 'fraser-plateau' });
  extensionJourney.plan.phase = 'stakeholder_review';
  extensionJourney.plan.dataCompleteness = 70;
  extensionJourney.plan.stakeholderBuyIn = 62;
  const extension = event.options.find((option) => option.label === 'Request extension from ministry');
  withRandom(0.99, () => resolveEvent(extensionJourney, event, extension));
  assert.equal(extensionJourney.plan.dataCompleteness, 62);
  assert.equal(extensionJourney.plan.stakeholderBuyIn, 62);
});

test('silviculture task preview names the ready contractor that will auto-deploy', async () => {
  const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
  journey.contractors.forEach((contractor) => { contractor.isActive = false; });
  const seenDescriptions = [];
  const ui = {
    write() {}, writeHeader() {}, writeWarning() {}, writePositive() {}, writeDanger() {},
    clear() {}, updateAllStatus() {}, playEventVignette() {},
    async promptChoice(_prompt, options) {
      for (const option of options || []) seenDescriptions.push(option.description || '');
      if ((options || []).some((option) => option.value === 'end')) {
        return options.find((option) => option.value === 'plant') || options.find((option) => option.value === 'end');
      }
      return options[0] || { value: 'next' };
    }
  };

  await withRandomAsync(0.99, () => runSilvicultureDay({ ui, journey, gameOver: false }));
  assert.ok(seenDescriptions.some((description) => /will deploy/i.test(description)));
  assert.ok(journey.contractors.some((contractor) => contractor.isActive), 'planting should auto-deploy a ready contractor');
  assert.ok(journey.planting.seedlingsPlanted > 0);
});

test('silviculture cannot manufacture planting output when no workforce is available', async () => {
  const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
  journey.contractors.forEach((contractor) => {
    contractor.isActive = false;
    contractor.silvicultureState = { status: 'recovering', cooldownDays: 2, traits: [] };
  });
  journey.crew = [];
  const dayBefore = journey.day;
  const offered = [];
  const ui = {
    write() {}, writeHeader() {}, writePositive() {}, writeDanger() {},
    writeWarning() {},
    clear() {}, updateAllStatus() {}, playEventVignette() {},
    async promptChoice(_prompt, options) {
      offered.push(...options.map((option) => option.value));
      return options.find((option) => option.value === 'plant') || options.find((option) => option.value === 'end') || options[0];
    }
  };

  await withRandomAsync(0.99, () => runSilvicultureDay({ ui, journey, gameOver: false }));
  assert.equal(journey.planting.seedlingsPlanted, 0);
  assert.equal(journey.day, dayBefore + 1);
  assert.equal(offered.includes('plant'), false, 'unavailable fieldwork must not be offered');
});

test('silviculture hides surveys without a workforce and does not charge for them', async () => {
  const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
  journey.contractors.forEach((contractor) => {
    contractor.isActive = false;
    contractor.silvicultureState = { status: 'recovering', cooldownDays: 2, traits: [] };
  });
  journey.crew = [];
  journey.planting.seedlingsPlanted = Math.round(journey.planting.seedlingsAllocated * 0.35);
  journey.planting.blocksPlanted = 5;
  journey.brushing.hectaresComplete = journey.brushing.hectaresTarget;
  journey.silvicultureState = { phase: 'survey' };
  const dayBefore = journey.day;
  const budgetBefore = journey.resources.budget;
  const surveyAttemptsBefore = journey.surveys.regenerationSurveys;
  let actionPrompts = 0;
  const offered = [];
  const ui = {
    write() {}, writeHeader() {}, writePositive() {}, writeDanger() {},
    writeWarning() {},
    clear() {}, updateAllStatus() {}, playEventVignette() {},
    async promptChoice(_prompt, options) {
      offered.push(...options.map((option) => option.value));
      if ((options || []).some((option) => option.value === 'survey')) {
        actionPrompts++;
        if (actionPrompts === 1) return options.find((option) => option.value === 'survey');
        return options.find((option) => option.value === 'end') || options[0];
      }
      return options[0];
    }
  };

  await withRandomAsync(0.99, () => runSilvicultureDay({ ui, journey, gameOver: false }));
  assert.equal(journey.day, dayBefore + 1);
  assert.equal(actionPrompts, 0, 'an unavailable survey must not be offered');
  assert.equal(journey.resources.budget, budgetBefore - 550, 'only daily overhead should land after ending the day');
  assert.equal(journey.surveys.regenerationSurveys, surveyAttemptsBefore);
  assert.equal(offered.includes('survey'), false);
});

test('planning mission guidance recommends direct submission when it can close approval faster', () => {
  const journey = createPlanningJourney({ areaId: 'fraser-plateau' });
  journey.blockPlanning.activeBlock = {
    id: 'block-a',
    name: 'Block A',
    features: [],
    hazards: [],
  };
  journey.blockPlanning.fom.activeBlockId = 'block-a';
  journey.blockPlanning.fom.status = 'approved';
  journey.blockPlanning.fom.commentLoad = 0;
  journey.blockPlanning.fom.reviewDaysRemaining = 0;
  journey.plan.phase = 'ministerial_approval';
  journey.plan.dataCompleteness = 85;
  journey.plan.analysisQuality = 85;
  journey.plan.stakeholderBuyIn = 80;
  journey.plan.ministerialConfidence = 70;
  journey.professional.registrationStatus = 'active';
  journey.professional.cpdHours = journey.professional.cpdTarget;
  journey.professional.paperworkLoad = 0;
  journey.professional.auditExposure = 0;
  journey.professional.competenceRisk = 0;

  let status = null;
  updatePlanningMissionStatus({ setMissionStatus(next) { status = next; } }, journey, { id: 'fall', name: 'Fall' });
  assert.match(status.guidance, /Prepare Submission can carry confidence/i);
  assert.ok(status.alerts.some((alert) => /Prepare Submission can close it now/i.test(alert.text)));
});
