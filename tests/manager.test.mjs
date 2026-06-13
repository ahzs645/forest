import test from 'node:test';
import assert from 'node:assert/strict';

import { getOperationalProgress, recordProgressMilestones } from '../js/journey.js';
import { createManagerJourney } from '../js/journey/factory.js';
import { checkForEvent, resolveEvent } from '../js/events.js';
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

  // Field-context events arrive as radio calls from the GM's crew, with the
  // reporter baked into the description (manager is not a field journeyType,
  // so formatEventForDisplay would otherwise drop the reporter framing).
  assert.ok(fieldExample.reporter, 'field-context manager events carry a crew reporter');
  assert.match(fieldExample.description, /radios in:/);
  assert.match(fieldExample.description, new RegExp(fieldExample.reporter.name));
});

test('manager events resolve through resolveEvent with desk-style money effects at corporate scale', () => {
  const journey = createManagerJourney();
  assert.equal(journey.resources.budget, 500000);
  assert.equal(journey.resources.politicalCapital, 100);

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
  assert.equal(journey.resources.politicalCapital, 94);
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
