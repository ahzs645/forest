import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMPAIGN_SEASONS,
  carryFollowUpsIntoJourney,
  carrySeenEventsIntoJourney,
  collectSeenEventsFromJourney,
  computeSeasonBridge,
  crewWasNeglected,
  settleOrCarryFollowUps,
} from '../js/game/campaign.js';
import { applyRoundConsequences, createInitialState } from '../js/engine.js';
import { resolveEvent } from '../js/events/resolution.js';
import { createPermittingJourney, createPlanningJourney, createReconJourney } from '../js/journey/factory.js';
import { checkForEvent, checkScheduledEvents } from '../js/events.js';
import { FIELD_EVENTS } from '../js/data/fieldEvents.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';

const season = (id) => CAMPAIGN_SEASONS.find((entry) => entry.id === id);

/** Every ordinary card a journey draws over a run of days, temptations aside. */
function drawCards(journey, days = 40) {
  const drawn = [];
  for (let day = 2; day <= days; day += 1) {
    journey.day = day;
    journey.daySeed = { day, seed: (day * 2654435761) >>> 0 };
    const event = checkForEvent(journey);
    if (event && event.type !== 'temptation') {
      drawn.push(event.id);
      journey.log.push({ day, type: 'event', eventId: event.id });
    }
  }
  return drawn;
}

test('a campaign year never deals a desk card a second time in a later season', () => {
  const campaign = {};
  const fall = createPlanningJourney({ areaId: 'fort-st-john-plateau' });
  const fallCards = drawCards(fall);
  assert.ok(fallCards.length >= 8, `the fall drew ${fallCards.length} cards`);
  collectSeenEventsFromJourney(campaign, fall);
  assert.ok(fallCards.every((id) => campaign.seenEventIds.includes(id)));

  const winter = createPermittingJourney({ areaId: 'fort-st-john-plateau' });
  carrySeenEventsIntoJourney(campaign, winter);
  const winterCards = drawCards(winter);
  assert.ok(winterCards.length >= 8, `the winter drew ${winterCards.length} cards`);
  const repeated = winterCards.filter((id) => fallCards.includes(id));
  assert.deepEqual(repeated, [], 'the winter desk skips what the fall already dealt');
});

test('a field season skips what the spring dealt, and still repeats inside its own season when it must', () => {
  const campaign = { seenEventIds: FIELD_EVENTS.slice(0, 20).map((event) => event.id) };
  const summer = createReconJourney({ areaId: 'fort-st-john-plateau' });
  carrySeenEventsIntoJourney(campaign, summer);
  const cards = drawCards(summer, 30);
  assert.ok(cards.length >= 6);
  const carried = new Set(campaign.seenEventIds);
  assert.deepEqual(cards.filter((id) => carried.has(id)), [], 'nothing the year already dealt');
  // Without the carry the same seeds do deal them: the filter is doing the work.
  const control = createReconJourney({ areaId: 'fort-st-john-plateau' });
  assert.ok(drawCards(control, 30).some((id) => carried.has(id)), 'control run draws from the whole deck');
});

test('a follow-up still owed when the season closes follows you into the next seat that can hear it', () => {
  const campaign = {};
  const fall = createPlanningJourney({ areaId: 'fort-st-john-plateau' });
  fall.day = 24;
  fall.scheduledEvents = [{ eventId: 'new_chief_meeting', triggerDay: 27 }];
  const lines = settleOrCarryFollowUps(campaign, fall, season('winter'));
  assert.deepEqual(fall.scheduledEvents, []);
  assert.equal(campaign.pendingFollowUps.length, 1);
  assert.match(lines[0], /“New Chief Requests Meeting” was still coming back when the season closed\. It follows you into winter\./);

  const winter = createPermittingJourney({ areaId: 'fort-st-john-plateau' });
  const carryLines = carryFollowUpsIntoJourney(campaign, winter);
  assert.match(carryLines[0], /Still coming back from last season: “New Chief Requests Meeting”/);
  assert.deepEqual(campaign.pendingFollowUps, []);
  winter.day = 3;
  assert.equal(checkScheduledEvents(winter)?.id, 'new_chief_meeting', 'it lands early in the winter');
});

test('a follow-up the next seat cannot hear is settled in the review at the least of it, not dropped', () => {
  const campaign = {};
  const summer = createReconJourney({ areaId: 'fort-st-john-plateau' });
  summer.day = 18;
  summer.scrutiny = 20;
  summer.scheduledEvents = [
    { eventId: 'inspector_arrives', triggerDay: 20 },
    { eventId: 'major_storm_hits', triggerDay: 21 },
  ];
  const inspector = FIELD_EVENTS.find((event) => event.id === 'inspector_arrives');
  assert.ok(inspector);
  const lines = settleOrCarryFollowUps(campaign, summer, season('fall'));
  assert.deepEqual(campaign.pendingFollowUps, [], 'a WorkSafeBC revisit is not a planning card');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^“WorkSafeBC Officer Arrives” came back after the season closed/);
  assert.match(lines[1], /^“Major Storm Hits” came after the crew had gone home\.$/);
  assert.deepEqual(summer.scheduledEvents, []);
});

test('a starved crew\'s Budget charge is not refunded by the steady program', () => {
  const season = () => {
    const state = createInitialState({ companyName: 'T', roleId: 'recce', areaId: 'fraser-plateau' });
    state.round = 2;
    state.metrics = { progress: 55, forestHealth: 58, relationships: 60, compliance: 62, budget: 45 };
    return state;
  };
  const kept = season();
  kept.seasonOutcome = { fellShort: false, crewNeglected: false, shortcutsCaught: 0 };
  assert.ok(applyRoundConsequences(kept).includes('steady-program'), 'a steady, fed season still earns it');

  const starved = season();
  starved.seasonOutcome = { fellShort: false, crewNeglected: true, shortcutsCaught: 0 };
  assert.ok(!applyRoundConsequences(starved).includes('steady-program'));
  assert.equal(starved.metrics.budget, 45);

  const caught = season();
  caught.seasonOutcome = { fellShort: false, crewNeglected: false, shortcutsCaught: 1 };
  assert.ok(!applyRoundConsequences(caught).includes('steady-program'), 'nor a season whose shortcut was caught');
});

test('a crew member sent home to a family emergency is not a walk-off', () => {
  const journey = createReconJourney({ areaId: 'fort-st-john-plateau', scale: 'campaign' });
  journey.campaignStartBudget = Number(journey.resources.budget);
  journey.blocksAssessed = journey.packageTarget;
  const call = FIELD_EVENTS.find((event) => event.id === 'satellite_phone_call');
  resolveEvent(journey, call, call.options[0]);
  const gone = journey.crew.filter((member) => !member.isActive);
  assert.equal(gone.length, 1);
  assert.equal(gone[0].compassionateLeave, true);
  assert.equal(crewWasNeglected(journey), false);
  const budget = computeSeasonBridge(journey, { victory: true }, journey.campaignStartBudget)
    .entries.find((entry) => entry.metric === 'budget');
  assert.doesNotMatch(budget.reason, /walked off/);

  // A crew member who quits still is.
  const quitter = journey.crew.find((member) => member.isActive);
  quitter.isActive = false;
  quitter.hasQuit = true;
  assert.equal(crewWasNeglected(journey), true);
  assert.match(computeSeasonBridge(journey, { victory: true }, journey.campaignStartBudget)
    .entries.find((entry) => entry.metric === 'budget').reason, /1 crew member walked off/);
});

test('the year\'s last season settles what it still owes', () => {
  const campaign = {};
  const winter = createPermittingJourney({ areaId: 'fort-st-john-plateau' });
  winter.day = 20;
  winter.scheduledEvents = [{ eventId: 'audit_followup', triggerDay: 22 }];
  assert.ok(DESK_EVENTS.some((event) => event.id === 'audit_followup'));
  const lines = settleOrCarryFollowUps(campaign, winter, null);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /came back after the season closed/);
  assert.deepEqual(campaign.pendingFollowUps, []);
});
