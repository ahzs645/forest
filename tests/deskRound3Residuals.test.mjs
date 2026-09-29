import test from 'node:test';
import assert from 'node:assert/strict';

import { createPermittingJourney, createPlanningJourney } from '../js/journey/factory.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { ILLEGAL_ACTS } from '../js/data/illegalActs.js';
import { resolveEvent } from '../js/events/resolution.js';
import { formatEventForDisplay, formatOptionEffects } from '../js/events/display.js';
import { buildShortcutOption, buildTemptationEvent, checkForEvent } from '../js/events/selection.js';
import { queueFallout } from '../js/events/fallout.js';
import { settleOutstandingFallout } from '../js/events/shortcutRecord.js';
import { buildEventReaction } from '../js/events/reactions.js';
import { applyDifficultyMultipliers } from '../js/game/ForestryTrailGame.js';
import { dropDuplicateDeskEnergy } from '../js/journey/deskMechanics.js';
import {
  advancePermitClocks,
  describeLane,
  ensurePermitFiles,
  getPermitFiles,
  getSignableFiles,
  syncPermitCounters,
} from '../js/journey/permitPipeline.js';
import { ensurePermittingRevisionState, seedPermitRevisionTickets } from '../js/modes/permitting.js';

function permitJourney(areaId = 'vancouver-island-coast') {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === areaId);
  const journey = createPermittingJourney({ roleId: 'permitter', areaId, area });
  journey.day = 3;
  ensurePermitFiles(journey);
  return journey;
}

function heritagePair(journey) {
  const hca = getPermitFiles(journey).find((file) => file.type === 'HCA');
  const cp = getPermitFiles(journey).find((file) => file.id === hca.holdsFileId);
  return { hca, cp };
}

test('no District Manager event signs a heritage permit, and an issued one releases its cutting permit', () => {
  const journey = permitJourney();
  const { hca, cp } = heritagePair(journey);
  // Only the HCA permit is at decision: nothing is the District Manager's to sign.
  for (const file of getPermitFiles(journey)) {
    if (file.lane === 'decision') { file.lane = 'referral'; file.clockCloses = journey.day + 3; }
  }
  hca.lane = 'decision';
  hca.clockCloses = journey.day;
  syncPermitCounters(journey);
  assert.equal(getSignableFiles(journey).length, 0);

  const windstorm = DESK_EVENTS.find((event) => event.id === 'severe_windstorm');
  const salvage = windstorm.options.find((option) => option.effects?.permits_approved === 1);
  const { messages } = resolveEvent(journey, windstorm, salvage);
  assert.equal(hca.lane, 'decision', 'the Archaeology Branch still has it');
  assert.ok(!messages.some((line) => /HCA permit .* ISSUED by the District Manager/.test(line)), messages.join(' | '));

  // The Branch decides it at night: the CP is released at once, not left
  // waiting on an issued permit with a "(Day ?)" clock.
  advancePermitClocks(journey, { approvalRate: 1, random: () => 0 });
  assert.equal(hca.lane, 'issued');
  assert.equal(cp.pausedBy, null);
  assert.doesNotMatch(describeLane(cp, journey), /\?/);
});

test('a heritage permit only ever gets a letter a heritage permit can get', () => {
  const journey = permitJourney();
  ensurePermittingRevisionState(journey);
  const { hca } = heritagePair(journey);
  const seen = new Set();
  for (let round = 0; round < 6; round += 1) {
    hca.lane = 'deficiency';
    hca.deficiencyProfileId = null;
    const queue = seedPermitRevisionTickets(journey, 1, { type: 'review' });
    const ticket = queue.find((entry) => entry.fileId === hca.id && !entry.resolved);
    assert.ok(ticket, 'a letter is written for the HCA permit');
    seen.add(ticket.profileId);
    queue.splice(queue.indexOf(ticket), 1);
    hca.resolvedDeficiencies = [];
  }
  assert.ok(!seen.has('visual-quality'), [...seen].join(', '));
  for (const id of seen) assert.ok(['consultation', 'heritage-assessment', 'package-completeness'].includes(id), id);
});

test('a permitter has one energy meter, whatever the difficulty', () => {
  const journey = createPermittingJourney({ roleId: 'permitter', areaId: 'fraser-plateau' });
  journey.difficulty = 'hard';
  applyDifficultyMultipliers(journey, 'hard');
  assert.equal('energy' in journey.resources, false);
  assert.equal(journey.protagonist.energy, 100);

  // An older save still carrying the copy loses it on the next desk day.
  const legacy = createPermittingJourney({ roleId: 'permitter', areaId: 'fraser-plateau' });
  legacy.resources.energy = 80;
  dropDuplicateDeskEnergy(legacy);
  assert.equal('energy' in legacy.resources, false);
});

test('a desk run meets each situation card once', () => {
  const journey = permitJourney('kootenay-wetbelt');
  const seen = [];
  for (let day = 2; day <= 40; day += 1) {
    journey.day = day;
    const event = checkForEvent(journey);
    if (!event || event.type === 'temptation') continue;
    seen.push(event.id);
    journey.log.push({ day, type: 'event', eventId: event.id, eventTitle: event.title, optionLabel: 'x', effects: {} });
  }
  assert.ok(seen.length >= 8, `drew ${seen.length}`);
  assert.equal(new Set(seen).size, seen.length, seen.join(', '));
});

test('a phone call is declined on the phone, an email by email', () => {
  const planner = createPlanningJourney({ roleId: 'planner', areaId: 'bulkley-valley' });
  planner.day = 5;
  const phoned = ILLEGAL_ACTS.find((act) => /contractor|VP/.test(String(act.proposer)) && act.roles?.includes?.('planner'))
    || ILLEGAL_ACTS.find((act) => /contractor/.test(String(act.proposer)));
  const emailed = ILLEGAL_ACTS.find((act) => /the client|the GIS tech/.test(String(act.proposer)));
  for (let i = 0; i < 4; i += 1) {
    const call = buildTemptationEvent(phoned, planner);
    assert.equal(call.cardLabel, 'PHONE CALL');
    assert.doesNotMatch(call.options[0].outcome, /email|thread|message/i);
    const mail = buildTemptationEvent(emailed, planner);
    assert.equal(mail.cardLabel, 'IN THE INBOX');
    assert.doesNotMatch(mail.options[0].outcome, /on the phone|call/i);
  }
});

test('a permit desk option shows the goodwill its compliance moves, and morale as your stress', () => {
  const plus = formatOptionEffects({ effects: { compliance: 8, timeUsed: 3 } }, 'permitting');
  assert.match(plus, /\+8 compliance/);
  assert.match(plus, /\+8 goodwill/);
  assert.match(formatOptionEffects({ effects: { compliance: -5, politicalCapital: -3 } }, 'permitting'), /-8 goodwill/);
  // A planner's compliance is professional standing, not goodwill.
  assert.doesNotMatch(formatOptionEffects({ effects: { compliance: 8 } }, 'planning'), /goodwill/);

  const morale = formatOptionEffects({ effects: { crew_morale: -5 } }, 'permitting');
  assert.match(morale, /\+5 stress/);
  assert.doesNotMatch(morale, /morale/);
  assert.match(formatOptionEffects({ effects: { crew_morale: 12 } }, 'planning'), /-12 stress/);
});

test('ten minutes on a note to file does not cut into the day', () => {
  const journey = createPlanningJourney({ roleId: 'planner', areaId: 'bulkley-valley' });
  journey.day = 5;
  const act = ILLEGAL_ACTS.find((entry) => entry.id === 'borrowed-rpf-stamp');
  const event = buildTemptationEvent(act, journey);
  const report = event.options.find((option) => option.label === 'Document and report');
  const { messages } = resolveEvent(journey, event, report);
  assert.ok(!messages.some((line) => /cuts into the day|ate the day/.test(line)), messages.join(' | '));
});

test('an unlawful answer inside an ordinary desk card is marked off-book and never praised', () => {
  const cases = [
    ['special_use_permit_bundle', /without the permit/],
    ['road_use_permit_gap', /without the road use permit/],
    ['whistleblower_allegation', /bury/],
  ];
  const journey = createPlanningJourney({ roleId: 'planner', areaId: 'bulkley-valley' });
  for (const [id, label] of cases) {
    const event = DESK_EVENTS.find((entry) => entry.id === id);
    const formatted = formatEventForDisplay(event, 'planning');
    const index = event.options.findIndex((option) => label.test(option.label));
    assert.ok(index >= 0, id);
    assert.equal(formatted.options[index].tag, 'OFF-BOOK', id);
    for (let seed = 0; seed < 10; seed += 1) {
      const line = buildEventReaction(journey, event.options[index], () => seed / 25, { band: 'good' });
      if (line) assert.doesNotMatch(line, /appreciate the paper trail/, id);
    }
  }
  const camp = DESK_EVENTS.find((entry) => entry.id === 'special_use_permit_bundle');
  for (const option of camp.options) {
    assert.doesNotMatch(option.outcome, /October|a week of paperwork/);
  }
});

test('the Forest Practices Board reports; it does not decide penalties', () => {
  const journey = createPlanningJourney({ roleId: 'planner', areaId: 'bulkley-valley' });
  journey.day = 5;
  const act = ILLEGAL_ACTS.find((entry) => entry.catch?.by === 'FPB' && Number(entry.catch?.lagDays) >= 30);
  const option = buildShortcutOption(act, journey);
  assert.match(option.failureOutcome, /its report lands/);
  assert.doesNotMatch(option.failureOutcome, /determination/);

  queueFallout(journey, { actId: act.id, title: act.title, institution: 'FPB', dueIn: 40, effects: { compliance: -8, scrutiny: 12 } });
  const [line] = settleOutstandingFallout(journey);
  assert.match(line, /Forest Practices Board reports on/);
});
