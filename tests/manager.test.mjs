import test from 'node:test';
import assert from 'node:assert/strict';

import { getOperationalProgress, recordProgressMilestones } from '../js/journey.js';
import { createManagerJourney } from '../js/journey/factory.js';
import { checkForEvent, resolveEvent } from '../js/events.js';
import { escalateFieldEventForManager, isManagerFieldEscalation } from '../js/events/selection.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { FIELD_EVENTS } from '../js/data/fieldEvents.js';

const NEW_MANAGER_EVENT_IDS = [
  'gm_board_packet_pressure',
  'gm_shareholder_inquiry',
  'gm_division_rivalry',
  'gm_executive_poaching',
  'gm_certification_audit_prep'
];

test('manager operational progress blends term progress with metric health', () => {
  const journey = createManagerJourney();

  // Month 1 of 12 with all metrics at 50: 0.6 * (1/12) + 0.4 * 0.5 = 0.25 -> 25
  assert.equal(journey.day, 1);
  assert.equal(journey.deadline, 12);
  assert.equal(getOperationalProgress(journey), 25);

  // Halfway through the term: 0.6 * 0.5 + 0.4 * 0.5 = 0.5 -> 50
  journey.day = 6;
  assert.equal(getOperationalProgress(journey), 50);

  journey.day = 12;
  for (const key of Object.keys(journey.metrics)) {
    journey.metrics[key] = 100;
  }
  assert.equal(getOperationalProgress(journey), 100);

  // Overshooting the deadline stays clamped to 100
  journey.day = 30;
  assert.equal(getOperationalProgress(journey), 100);

  // Collapsed metrics drag progress below pure term progress
  journey.day = 6;
  for (const key of Object.keys(journey.metrics)) {
    journey.metrics[key] = 0;
  }
  assert.equal(getOperationalProgress(journey), 30);
});

test('manager journeys now cross the shared milestone thresholds', () => {
  const journey = createManagerJourney();
  journey.day = 3; // 0.6 * (3/12) + 0.4 * 0.5 = 0.35 -> 35%

  const messages = [];
  const reached = recordProgressMilestones(journey, 0, messages, journey.day);

  assert.deepEqual(reached, [25]);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /MILESTONE/);
  assert.match(messages[0], /First quarter closes/);
  assert.equal(journey.milestonesReached.length, 1);
});

test('new manager desk events are manager-tagged, expedition-only, and well-formed', () => {
  for (const id of NEW_MANAGER_EVENT_IDS) {
    const event = DESK_EVENTS.find((candidate) => candidate.id === id);
    assert.ok(event, `expected desk event ${id} to exist`);
    assert.deepEqual(event.roles, ['manager'], `${id} should be manager-only`);
    assert.equal(event.expeditionOnly, true, `${id} should stay out of the seasonal TUI pool`);
    assert.equal(typeof event.title, 'string');
    assert.equal(typeof event.description, 'string');
    assert.equal(typeof event.type, 'string');
    assert.ok(event.probability > 0 && event.probability <= 1, `${id} probability in (0, 1]`);
    assert.ok(Array.isArray(event.options) && event.options.length >= 2, `${id} needs choices`);
    for (const option of event.options) {
      assert.equal(typeof option.label, 'string');
      assert.equal(typeof option.outcome, 'string');
      assert.ok(option.effects && Object.keys(option.effects).length > 0, `${id} options need effects`);
    }
  }

  // No id collisions with either pool (lint guarantee, kept as a regression net)
  const allIds = [...DESK_EVENTS, ...FIELD_EVENTS].map((event) => event.id);
  assert.equal(new Set(allIds).size, allIds.length);
});

test('checkForEvent serves manager journeys from both desk and field pools', () => {
  const journey = createManagerJourney({ role: { id: 'manager' } });
  const deskIds = new Set(DESK_EVENTS.map((event) => event.id));
  const fieldIds = new Set(FIELD_EVENTS.map((event) => event.id));

  let sawDesk = false;
  let sawField = false;
  let fieldExample = null;

  for (let i = 0; i < 1000 && !(sawDesk && sawField); i++) {
    const event = checkForEvent(journey);
    if (!event || event.type === 'temptation') continue;
    if (deskIds.has(event.id)) sawDesk = true;
    if (fieldIds.has(event.id)) {
      sawField = true;
      fieldExample = fieldExample || event;
    }
  }

  assert.ok(sawDesk, 'manager journeys should draw desk-context events');
  assert.ok(sawField, 'manager journeys should draw field-context events');

  // Field-context events arrive as radio reports from the GM's crew, with the
  // reporter baked into the description (manager is not a field journeyType,
  // so formatEventForDisplay would otherwise drop the reporter framing).
  assert.ok(fieldExample.reporter, 'field-context manager events carry a crew reporter');
  assert.match(fieldExample.description, /^Radio from /);
  assert.match(fieldExample.description, new RegExp(fieldExample.reporter.name));
});

test('the manager field lane is gated to division-level escalations', () => {
  // The rule: explicit managerEscalation flag wins; otherwise issue-type and
  // severe events escalate; chain children (probability 0) and events that
  // schedule follow-ups never do (manager mode never drains scheduledEvents).
  const byId = (id) => FIELD_EVENTS.find((event) => event.id === id);

  assert.equal(isManagerFieldEscalation(byId('peatland-subsidence_field')), true, 'issue events escalate by default');
  assert.equal(isManagerFieldEscalation(byId('chainsaw_cut')), true, 'severe events escalate by default');
  assert.equal(isManagerFieldEscalation(byId('road_washout')), true, 'managerEscalation: true opts a moderate event in');
  assert.equal(isManagerFieldEscalation(byId('first_nations_consultation_field')), true);
  assert.equal(isManagerFieldEscalation(byId('flash_flood')), false, 'managerEscalation: false opts a severe event out');
  assert.equal(isManagerFieldEscalation(byId('grizzly_territory')), false);
  assert.equal(isManagerFieldEscalation(byId('major_storm_hits')), false, 'chain children (probability 0) stay out');
  assert.equal(isManagerFieldEscalation(byId('safety_inspection_notice')), false, 'events that schedule follow-ups stay out');

  // The transcript offenders: crew-scale noise a GM should never adjudicate.
  for (const id of ['resupply_opportunity', 'worker_injury', 'crew_card_game', 'lost_supplies']) {
    assert.equal(isManagerFieldEscalation(byId(id)), false, `${id} is division business, not GM business`);
  }

  // Behavioural check: nothing outside the gate ever comes through the pipeline.
  const journey = createManagerJourney({ role: { id: 'manager' } });
  const fieldIds = new Set(FIELD_EVENTS.map((event) => event.id));
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const event = checkForEvent(journey);
    if (event && event.type !== 'temptation' && fieldIds.has(event.id)) seen.add(event.id);
  }
  assert.ok(seen.size > 0, 'the field lane still serves events');
  for (const id of seen) {
    assert.ok(isManagerFieldEscalation(byId(id)), `${id} reached the GM but is not escalation-worthy`);
  }
});

test('escalated field events translate crew-wallet effects to the corporate ledger', () => {
  const event = {
    id: 'gm_escalation_probe',
    title: 'Probe',
    type: 'supply',
    severity: 'severe',
    probability: 0.2,
    description: 'A load shifted on the mainline.',
    options: [
      {
        label: 'Absorb it',
        outcome: 'Absorbed.',
        effects: { fuel: -10, food: 5, budget: -500, timeUsed: 2, progress: -3, crew_health: -4, crew_morale: -2 },
        riskInjury: 0.2,
        crewEffect: { injury: 'sprain' }
      }
    ]
  };

  const escalated = escalateFieldEventForManager(event);
  const option = escalated.options[0];

  // Stocks and hours never reach the GM; their cost lands on the treasury:
  // fuel -10 * $150 + food +5 * $200 + budget -500 * 10 = -$5,500.
  for (const key of ['fuel', 'food', 'firstAid', 'equipment', 'timeUsed']) {
    assert.equal(option.effects[key], undefined, `${key} should not survive translation`);
  }
  assert.equal(option.effects.budget, -5500);
  assert.equal(option.effects.progress, -3);
  // crew_health folds into crew_morale (division mood), not executive bruises.
  assert.equal(option.effects.crew_morale, -6);
  // An injury 300 km away comes back as a compliance problem, not a hurt analyst.
  assert.equal(option.riskInjury, undefined);
  assert.equal(option.riskCompliance, 0.2);
  assert.equal(option.crewEffect, undefined);

  // The framing is a division escalating upward over the radio.
  assert.match(escalated.description, /^Radio from /);
  assert.match(escalated.description, /head office/);
  assert.ok(escalated.reporter?.name && escalated.reporter?.role);

  // The source event is untouched: field journeys keep the bush-scale original.
  assert.equal(event.options[0].effects.fuel, -10);
  assert.equal(event.options[0].riskInjury, 0.2);
});

test('managerVariant rewrites tailgate copy at executive altitude', () => {
  const chainsaw = FIELD_EVENTS.find((event) => event.id === 'chainsaw_cut');
  const escalated = escalateFieldEventForManager(chainsaw);

  assert.equal(escalated.title, 'Serious Injury - Medevac Decision');
  assert.equal(escalated.options[0].label, 'Authorize the medevac charter');
  // Variant effects are authored at corporate scale and bypass translation.
  assert.equal(escalated.options[0].effects.budget, -9000);
  assert.equal(escalated.options[0].crewEffect, undefined);
  // Options without variant effects keep systemic translation under new copy:
  // fuel -8 * $150 = -$1,200, and the hour disappears with the hours mechanic.
  assert.equal(escalated.options[1].label, 'Send him out by road with the first aid attendant');
  assert.deepEqual(escalated.options[1].effects, { crew_morale: -6, budget: -1200 });
  assert.equal(escalated.options[2].effects.compliance, -8);
  assert.equal(escalated.options[2].effects.firstAid, undefined);
});

test('escalated events resolve against the treasury, not the crew wallet', () => {
  const journey = createManagerJourney();
  const budgetBefore = journey.resources.budget;
  const fuelBefore = journey.resources.fuel;

  const chainsaw = FIELD_EVENTS.find((event) => event.id === 'chainsaw_cut');
  const escalated = escalateFieldEventForManager(chainsaw);
  const result = resolveEvent(journey, escalated, escalated.options[1]);

  assert.equal(journey.resources.budget, budgetBefore - 1200);
  assert.equal(journey.resources.fuel, fuelBefore, 'division fuel is not the GM\'s meter');
  assert.ok(result.messages.some((message) => message.includes('Budget: -$1,200')));
  // The original option carries crewEffect.evacuate; escalation strips it so
  // no executive staffer gets evacuated by an incident 300 km away.
  assert.ok(journey.crew.every((member) => member.isActive));
});

test('manager events resolve through resolveEvent with desk-style money effects at corporate scale', () => {
  const journey = createManagerJourney();
  assert.equal(journey.resources.budget, 500000);
  // Starts below the 100 ceiling so the meter can move in both directions.
  assert.equal(journey.resources.politicalCapital, 65);

  const event = { id: 'gm_test_event', title: 'Board Test', severity: 'moderate', options: [] };
  const option = {
    label: 'Eat the cost',
    effects: {
      budget: -5000,
      politicalCapital: -6,
      compliance: 4,
      relationships: -3,
      progress: 5,
      reputation: 2
    }
  };

  const result = resolveEvent(journey, event, option);

  // Budget must NOT clamp to the 100k desk ceiling (manager treasury is 500k)
  assert.equal(journey.resources.budget, 495000);
  assert.equal(journey.resources.politicalCapital, 59);
  assert.equal(journey.metrics.compliance, 54);
  assert.equal(journey.metrics.relationships, 47);
  assert.equal(journey.metrics.progress, 55);
  assert.equal(journey.metrics.reputation, 52);
  assert.ok(Array.isArray(result.messages) && result.messages.length > 0);
  assert.ok(result.messages.some((message) => message.includes('Budget: -$5,000')));

  const logged = journey.log.at(-1);
  assert.equal(logged.type, 'event');
  assert.equal(logged.eventId, 'gm_test_event');
});

test('manager field-side stocks absorb field event effects without desk caps leaking in', () => {
  const journey = createManagerJourney();
  const fuelBefore = journey.resources.fuel;
  const equipmentBefore = journey.resources.equipment;

  const event = { id: 'gm_ops_event', title: 'Ops Hit', severity: 'minor', options: [] };
  const option = {
    label: 'Absorb it',
    effects: { fuel: -10, equipment: -8, crew_morale: -2 }
  };

  resolveEvent(journey, event, option);

  assert.equal(journey.resources.fuel, Math.max(0, fuelBefore - 10));
  assert.equal(journey.resources.equipment, Math.max(0, equipmentBefore - 8));
  for (const member of journey.crew.filter((m) => m.isActive)) {
    assert.ok(member.morale <= 100);
  }
});
