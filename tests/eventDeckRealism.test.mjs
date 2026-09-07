import test from 'node:test';
import assert from 'node:assert/strict';

import { FIELD_EVENTS } from '../js/data/fieldEvents.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';

// Realism guards for the authored event decks. The player is a licensee-side
// forester; the field crew is a pre-harvest layout/recon crew or a silviculture
// crew; institutions and units are the ones a practising BC forester would
// recognise. These checks pin the vocabulary so a future card cannot quietly
// put a yarder back on the recce crew or an "auditor from the ministry" at the
// door.

const ALL_EVENTS = [...FIELD_EVENTS, ...DESK_EVENTS];

/** Every string a player can read off an event, including graded bands and manager variants. */
function eventText(event) {
  const parts = [event.title, event.description];
  const collectOptions = (options = []) => {
    for (const option of options) {
      parts.push(option.label, option.outcome, option.partialOutcome, option.failureOutcome);
    }
  };
  collectOptions(event.options);
  if (event.managerVariant) {
    parts.push(event.managerVariant.title, event.managerVariant.description);
    collectOptions(event.managerVariant.options);
  }
  return parts.filter(Boolean).join('\n');
}

// An event with no roles tag reaches every role, the recce crew included.
const reachesRecce = (event) => !Array.isArray(event.roles) || event.roles.length === 0 || event.roles.includes('recce');

test('recce-reachable field events never assume harvest-phase equipment or sites', () => {
  const harvestWords = /\b(yarder|feller[- ]buncher|landing|log deck|skidder)s?\b/i;
  const offenders = FIELD_EVENTS
    .filter(reachesRecce)
    .filter((event) => harvestWords.test(eventText(event)))
    .map((event) => `${event.id}: ${eventText(event).match(harvestWords)[0]}`);
  assert.deepEqual(offenders, [], `layout-crew events mention harvest kit:\n${offenders.join('\n')}`);
});

test('cedar-grove events are gated to cedar country by BEC code', () => {
  const cedarEvents = FIELD_EVENTS.filter((event) => /cedar/i.test(`${event.title} ${event.description}`)
    && Number(event.probability) > 0);
  assert.ok(cedarEvents.length >= 2, 'expected the ancient grove and old-growth cedar cards to exist');
  for (const event of cedarEvents) {
    assert.ok(
      Array.isArray(event.becCodes) && event.becCodes.length > 0,
      `${event.id} needs becCodes so an 800-year cedar never fires on the SBS plateau`,
    );
    for (const code of event.becCodes) {
      assert.match(code, /^(CWH|ICH)/, `${event.id}: ${code} is not a cedar-bearing BEC zone`);
    }
  }
});

test('event copy is metric and names real institutions', () => {
  const banned = [
    /\bgallons?\b/i,
    /\bfeet\b/i,
    /\binches\b/i,
    /ministry auditor/i,
    /safety inspector/i,
    /compliance officer/i,
  ];
  const offenders = [];
  for (const event of ALL_EVENTS) {
    const text = eventText(event);
    for (const pattern of banned) {
      const hit = text.match(pattern);
      if (hit) offenders.push(`${event.id}: "${hit[0]}"`);
    }
  }
  assert.deepEqual(offenders, [], `banned vocabulary in event copy:\n${offenders.join('\n')}`);
});

test('story-arc stages after the opener are only reachable through the chain', () => {
  const stages = ALL_EVENTS.filter((event) => /^story_arc_.*_stage(\d+)/.test(event.id)
    && Number(event.id.match(/_stage(\d+)/)[1]) >= 1);
  assert.ok(stages.length >= 2, 'expected the ancient grove follow-up stages to exist');
  for (const event of stages) {
    assert.equal(event.probability, 0, `${event.id} must not fire on its own`);
    assert.equal(event.expeditionOnly, true, `${event.id} must stay out of the seasonal strategy draw`);
  }
});
