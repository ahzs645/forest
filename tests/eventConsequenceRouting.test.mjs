import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlanningJourney, createReconJourney } from '../js/journey/factory.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import { resolveEvent } from '../js/events/resolution.js';
import { formatEventForDisplay } from '../js/events/display.js';

const AREA_ID = 'fraser-plateau';
const area = OPERATING_AREAS.find((candidate) => candidate.id === AREA_ID);

function eventWith(effects) {
  return { id: 'consequence-test', title: 'Consequence test', severity: 'minor', options: [{ label: 'Answer it', effects }] };
}

test('ground gained from an event is banked for the next leg and never runs the traverse past the route', () => {
  const journey = createReconJourney({ roleId: 'recce', areaId: AREA_ID, area, scale: 'campaign' });
  journey.distanceTraveled = journey.totalDistance - 1;
  const event = eventWith({ progress: 5 });
  resolveEvent(journey, event, event.options[0]);
  assert.ok(journey.distanceTraveled <= journey.totalDistance, 'Traverse 40/35 km is not a place');
});

test('a generic planning setback is time lost, not a gate unwound', () => {
  const journey = createPlanningJourney({ roleId: 'planner', areaId: AREA_ID, area, scale: 'campaign' });
  journey.plan.phase = 'ministerial_approval';
  journey.plan.ministerialConfidence = 29;
  journey.plan.stakeholderBuyIn = 80;
  const stressBefore = journey.protagonist.stress;
  const event = eventWith({ progress: -10 });

  const { messages } = resolveEvent(journey, event, event.options[0]);
  assert.equal(journey.plan.ministerialConfidence, 29, 'evacuating for a fire used to wipe DM readiness');
  assert.equal(journey.plan.stakeholderBuyIn, 80);
  assert.ok(journey.protagonist.stress > stressBefore);
  assert.ok(messages.some((message) => /costs the file time/.test(message)));

  const [option] = formatEventForDisplay(event, 'planning').options;
  assert.match(option.hint, /costs the file time/);
  assert.doesNotMatch(option.hint, /-10 progress/);
});

test('an explicit planning key still moves its own gate', () => {
  const journey = createPlanningJourney({ roleId: 'planner', areaId: AREA_ID, area, scale: 'campaign' });
  journey.plan.dataCompleteness = 60;
  const event = eventWith({ progress: -6, data: -10 });
  resolveEvent(journey, event, event.options[0]);
  assert.equal(journey.plan.dataCompleteness, 50);
});

test('every announced relationship and compliance effect lands on the deployment\'s standing ledger', () => {
  const field = createReconJourney({ roleId: 'recce', areaId: AREA_ID, area, scale: 'campaign' });
  const fieldEvent = eventWith({ relationships: 8, compliance: -4, reputation: 3 });
  resolveEvent(field, fieldEvent, fieldEvent.options[0]);
  // Reputation on a field crew is standing with the regulator: compliance.
  assert.deepEqual(field.standingLedger, { relationships: 8, compliance: -1 });

  const desk = createPlanningJourney({ roleId: 'planner', areaId: AREA_ID, area, scale: 'campaign' });
  const deskEvent = eventWith({ reputation: 6, compliance: 4 });
  resolveEvent(desk, deskEvent, deskEvent.options[0]);
  // Reputation at a desk is a relationship.
  assert.deepEqual(desk.standingLedger, { relationships: 6, compliance: 4 });
});
