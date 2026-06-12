import test from 'node:test';
import assert from 'node:assert/strict';

import { FIELD_EVENTS } from '../js/data/fieldEvents.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { getEventById } from '../js/events/scheduled.js';

const ALL_EVENTS = [...FIELD_EVENTS, ...DESK_EVENTS];

function scheduledTargets(events) {
  const targets = [];
  for (const event of events) {
    for (const option of event.options || []) {
      if (option.schedulesEvent) {
        targets.push({ from: event.id, to: option.schedulesEvent });
      }
    }
  }
  return targets;
}

test('every schedulesEvent target exists somewhere in the event pools', () => {
  const ids = new Set(ALL_EVENTS.map((e) => e.id));
  for (const { from, to } of scheduledTargets(ALL_EVENTS)) {
    assert.ok(ids.has(to), `event "${from}" schedules "${to}" which exists in no pool`);
  }
});

test('scheduled chains resolve for both field and desk journeys (cross-pool fallback)', () => {
  for (const { from, to } of scheduledTargets(ALL_EVENTS)) {
    for (const journeyType of ['recon', 'silviculture', 'permitting', 'planning']) {
      const resolved = getEventById(to, journeyType);
      assert.ok(resolved, `"${from}" -> "${to}" fails to resolve for ${journeyType}`);
      assert.equal(resolved.id, to);
    }
  }
});

test('the ancientGrove arc payoff resolves for field journeys (regression)', () => {
  const stage0 = ALL_EVENTS.find((e) => e.id?.includes('ancientGrove') || e.id?.includes('ancient_grove'));
  if (!stage0) return; // arc renamed or removed — covered by the generic tests above
  for (const option of stage0.options || []) {
    if (option.schedulesEvent) {
      assert.ok(
        getEventById(option.schedulesEvent, 'recon'),
        `ancientGrove follow-up ${option.schedulesEvent} must resolve for field runs`
      );
    }
  }
});

test('event ids are unique across all pools', () => {
  const seen = new Map();
  for (const event of ALL_EVENTS) {
    assert.ok(event.id, `event titled "${event.title}" is missing an id`);
    assert.ok(!seen.has(event.id), `duplicate event id "${event.id}"`);
    seen.set(event.id, true);
  }
});
