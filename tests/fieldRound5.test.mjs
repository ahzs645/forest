/**
 * Field residuals from the round-5 retest: a recon medevac that flew out the
 * attendant treating the bleed, follow-up cards that skipped the day's fit
 * (a silviculture "-20 L fuel" chip that applied nothing), a planters'
 * re-price call that came back, stacked and fired with every tree planted,
 * and a supply run that took the shift without saying so.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createReconJourney, createSilvicultureJourney } from '../js/journey/factory.js';
import { runReconDay } from '../js/modes/recon.js';
import { CONTRACTOR_EVENTS, handleContractorEvent, runSilvicultureDay } from '../js/modes/silviculture.js';
import { fitEventToCrew, holdFollowUpForDay, takeDueFollowUp } from '../js/journey/fieldMechanics.js';
import { runDaySituation } from '../js/journey/daySituation.js';
import { checkScheduledEvents } from '../js/events.js';
import { ensureDaySeed } from '../js/events/dayRng.js';
import { evacuateCrewMember, generateCrewMember } from '../js/crew.js';
import { FIELD_EVENTS } from '../js/data/fieldEvents.js';
import { FIELD_ROLES } from '../js/data/crewNames.js';

const eventById = (id) => FIELD_EVENTS.find((event) => event.id === id);

/** Records what was written and asked; a disabled option is never taken. */
function makeRecordingUi(answer) {
  const lines = [];
  const prompts = [];
  const push = (text) => { if (typeof text === 'string') lines.push(text); };
  return {
    lines,
    prompts,
    write: push, writeHeader: push, writeWarning: push, writePositive: push, writeDanger: push,
    writeInfo: push, writeSuccess: push, writeBox: push, writeDivider: () => {}, clear: () => {}, updateAllStatus: () => {},
    playEventVignette: () => {}, playScene: async () => {}, playTravelStrip: () => {}, clearMissionStatus: () => {}, setMissionStatus: () => {},
    releaseScrollAnchor: () => {},
    async promptText() { return 'x'; },
    async promptChoice(prompt, all = []) {
      prompts.push({ prompt, options: all });
      const options = all.filter((option) => !option.disabled);
      if (!options.length) return { value: undefined };
      if (options.length === 1) return options[0];
      return answer(prompt, options) || options[0];
    },
  };
}

const byLabel = (label) => (prompt, options) => options.find((o) => String(o.label).startsWith(label))
  || options.find((o) => o.value === 'continue') || options[0];

/** A five-hand recon crew with the attendant and a layout tech on it. */
function reconCrew() {
  const journey = createReconJourney({ areaId: 'vancouver-island-coast' });
  const role = (id) => FIELD_ROLES.find((candidate) => candidate.id === id);
  journey.crew = ['medic', 'faller', 'bucker', 'spotter', 'driver'].map((id, index) => ({
    ...generateCrewMember('field', role(id)),
    id: `crew-${index}`,
    name: ['Mike', 'Linda', 'Deborah', 'Ravi', 'Tom'][index],
  }));
  journey.day = 4;
  ensureDaySeed(journey);
  return journey;
}

function victimOf(card) {
  const ids = new Set();
  for (const option of card.options) {
    for (const key of ['crewEffect', 'partialCrewEffect', 'failureCrewEffect']) {
      if (option[key]?.injury || option[key]?.evacuate) ids.add(option[key].victimId);
    }
  }
  assert.equal(ids.size, 1, 'every band lands on one person');
  return [...ids][0];
}

// ── F-1: the one hurt is the one who goes out ──────────────────────────────

test('a recon medevac flies out the one the saw cut, never the attendant treating them', async () => {
  const journey = reconCrew();
  const card = fitEventToCrew(journey, eventById('chainsaw_cut'));
  const victim = journey.crew.find((member) => member.id === victimOf(card));
  assert.notEqual(victim.role, 'medic');
  assert.ok(['faller', 'driver'].includes(victim.role), `a saw hand, not the ${victim.role}`);
  const noun = victim.role === 'faller' ? 'layout tech' : 'driver-swamper';
  assert.equal(card.description, `A saw kicks back on the block: ${victim.name}, your ${noun}. There's blood. This is serious.`);
  const medevac = card.options.find((option) => option.label === 'Call helicopter medevac');
  assert.equal(medevac.crewEffect.departure, '{name} is flown out. WorkSafeBC is notified.');
  const etv = card.options.find((option) => /^First aid, then the ETV/.test(option.label));
  assert.match(etv.crewEffect.departure, /goes out in the ETV with the attendant/);

  const ui = makeRecordingUi(byLabel('Call helicopter medevac'));
  await runDaySituation({ ui, journey }, card);
  assert.deepEqual(journey.crew.filter((member) => !member.isActive).map((member) => member.id), [victim.id]);
  assert.ok(journey.crew.find((member) => member.role === 'medic').isActive, 'the attendant stays');
  assert.ok(ui.lines.includes(`${victim.name} is flown out. WorkSafeBC is notified.`), ui.lines.join('\n'));
});

test('a taped ankle that turns out broken goes out in the ETV, and it is not the hand who radioed it in', async () => {
  const journey = reconCrew();
  const reporter = journey.crew.find((member) => member.role === 'faller');
  // Leave the reporter and one other field hand: the reporter is never the one hurt.
  for (const member of journey.crew) {
    if (!['medic', 'faller', 'spotter'].includes(member.role)) member.isActive = false;
  }
  const card = fitEventToCrew(journey, { ...eventById('worker_injury'), reporter: { id: reporter.id, name: reporter.name } });
  const victim = journey.crew.find((member) => member.id === victimOf(card));
  assert.equal(victim.role, 'spotter');
  assert.match(card.description, new RegExp(`^${victim.name}, your compassman, slips on a wet log`));
  const tape = card.options.find((option) => /^Have the OFA 3 tape it/.test(option.label));
  assert.equal(tape.failureCrewEffect.departure, '{name} goes out in the ETV with the attendant. WorkSafeBC gets the call from the truck.');

  // The bad band: the fracture lands on the same person, and they go.
  delete journey.daySeed;
  const ui = makeRecordingUi(byLabel('Have the OFA 3 tape it'));
  const original = Math.random;
  Math.random = () => 0.99;
  try {
    await runDaySituation({ ui, journey }, card);
  } finally {
    Math.random = original;
  }
  assert.equal(victim.isActive, false);
  assert.ok(reporter.isActive);
  assert.ok(ui.lines.includes(`${victim.name} goes out in the ETV with the attendant. WorkSafeBC gets the call from the truck.`), ui.lines.join('\n'));
});

test('with the attendant gone, a recon card stops calling on them', () => {
  const journey = reconCrew();
  evacuateCrewMember(journey.crew.find((member) => member.role === 'medic'), { day: 3 });
  const card = fitEventToCrew(journey, eventById('worker_injury'));
  assert.ok(card.options.some((option) => option.label === 'Have the crew\'s OFA 1 tape it and keep them on light duty'));
  assert.ok(!card.options.some((option) => /OFA 3/.test(`${option.label} ${option.outcome} ${option.failureOutcome || ''}`)));
  const sendOut = card.options.find((option) => /^Send them out/.test(option.label));
  assert.equal(sendOut.crewEffect.departure, '{name} goes out in the ETV. WorkSafeBC gets the call from the truck.');
});

test('a card that hurts nobody is left alone', () => {
  const journey = reconCrew();
  const card = eventById('wolf_pack_sighting');
  assert.equal(fitEventToCrew(journey, card), card);
});

// ── F-2: a follow-up is the day's situation, fitted like any other ─────────

test('a silviculture follow-up is priced into the program: its fuel chip costs cash', async () => {
  for (const viaGameLoop of [false, true]) {
    const journey = createSilvicultureJourney({ areaId: 'vancouver-island-coast' });
    journey.day = 5;
    ensureDaySeed(journey);
    journey.scheduledEvents = [{ eventId: 'wolf_pack_sighting', triggerDay: 5 }];
    if (viaGameLoop) {
      // ForestryTrailGame._handleEvent hands the follow-up to the day.
      assert.equal(holdFollowUpForDay(journey, checkScheduledEvents(journey)), true);
      assert.deepEqual(journey.scheduledEvents, []);
    }
    const ui = makeRecordingUi((prompt, options) => options.find((o) => String(o.label).startsWith('Move camp'))
      || options.find((o) => o.value === 'end') || options.find((o) => o.value === 'continue'));
    await runSilvicultureDay({ ui, journey, gameOver: false });
    const card = ui.prompts.find((entry) => entry.options.some((o) => String(o.label).startsWith('Move camp')));
    assert.ok(card, 'the wolves are the day\'s situation');
    assert.ok(card.options.some((o) => o.value === 'set_aside'), 'and can be set aside like any card');
    const move = card.options.find((o) => String(o.label).startsWith('Move camp'));
    assert.doesNotMatch(`${move.label} ${move.description || ''}`, /\bL fuel\b/);
    assert.ok(ui.lines.includes('Cash: -$125'), 'five units of fuel at $25 come off the program');
    assert.equal(journey.dueFollowUp, undefined);
    assert.deepEqual(journey.scheduledEvents, []);
  }
});

test('a follow-up that takes most of the day spends it in silviculture', async () => {
  const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  journey.day = 6;
  ensureDaySeed(journey);
  holdFollowUpForDay(journey, eventById('inspector_arrives'));
  const ui = makeRecordingUi((prompt, options) => options.find((o) => String(o.label).startsWith('Give them the full tour'))
    || options.find((o) => o.value === 'end') || options.find((o) => o.value === 'continue'));
  await runSilvicultureDay({ ui, journey, gameOver: false });
  const tour = ui.prompts.flatMap((entry) => entry.options).find((o) => String(o.label).startsWith('Give them the full tour'));
  assert.ok(tour);
  assert.doesNotMatch(tour.description || '', /brief response/i);
  assert.ok(!ui.prompts.some((entry) => entry.options.some((o) => o.value === 'end')), 'no work menu after the tour');
});

test('a recon follow-up is the shift\'s situation, with set-aside, and leaves the schedule', async () => {
  const journey = createReconJourney({ areaId: 'kootenay-wetbelt' });
  journey.day = 3;
  ensureDaySeed(journey);
  journey.weather = { id: 'clear', name: 'Clear', travelModifier: 1 };
  journey.scheduledEvents = [{ eventId: 'wolf_pack_sighting', triggerDay: 3 }];
  const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'set_aside')
    || options.find((o) => o.value === 'end_shift') || options.find((o) => o.value === 'camp_menu')
    || options.find((o) => o.value === 'next' || o.value === 'continue'));
  await runReconDay({ ui, journey, checkpoint() {} });
  assert.ok(ui.lines.includes('Wolf Pack Sighting'), ui.lines.join('\n'));
  const card = ui.prompts.find((entry) => entry.options.some((o) => String(o.label).startsWith('Move camp')));
  assert.ok(card.options.some((o) => o.value === 'set_aside'));
  assert.deepEqual(journey.scheduledEvents, []);
});

test('only field days hold a follow-up; a desk plays it as before', () => {
  const event = eventById('wolf_pack_sighting');
  assert.equal(holdFollowUpForDay({ journeyType: 'planning' }, event), false);
  assert.equal(holdFollowUpForDay({ journeyType: 'recon' }, null), false);
  const journey = { journeyType: 'recon', scheduledEvents: [] };
  assert.equal(holdFollowUpForDay(journey, event), true);
  assert.equal(takeDueFollowUp(journey), event);
  assert.equal(takeDueFollowUp(journey), null);
});

// ── F-3: one re-price call per contract, while trees are owed ──────────────

test('the planters ask to re-price once, never stack it, and never with no trees left', async () => {
  const reprice = CONTRACTOR_EVENTS.find((event) => event.id === 'reprice');
  const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  const planters = journey.contractors.find((c) => c.specialty === 'planting');
  planters.productivity = 95;
  assert.equal(reprice.trigger(planters, journey), true);

  const price = Number(planters.pricePerTree) || 0.32;
  const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'pay'));
  await handleContractorEvent({ ui, journey }, reprice, planters, () => 0.5);
  assert.equal(planters.pricePerTree, Math.round((price + 0.04) * 100) / 100);
  planters.productivity = 95;
  assert.equal(reprice.trigger(planters, journey), false, 'answered once, not asked again');

  // Held to the contract price counts as the answer too.
  const held = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  const heldPlanters = held.contractors.find((c) => c.specialty === 'planting');
  heldPlanters.productivity = 95;
  await handleContractorEvent({ ui: makeRecordingUi((prompt, options) => options.find((o) => o.value === 'wait')), journey: held }, reprice, heldPlanters, () => 0.5);
  heldPlanters.productivity = 95;
  assert.equal(reprice.trigger(heldPlanters, held), false);

  // Every block planted and the fill done: nothing left to re-price.
  const done = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  const donePlanters = done.contractors.find((c) => c.specialty === 'planting');
  donePlanters.productivity = 95;
  done.planting.blocksPlanted = done.planting.blocksToPlant;
  for (const opening of done.program.fill || []) opening.done = true;
  assert.equal(reprice.trigger(donePlanters, done), false);
});

// ── F-5: the supply run says it costs the shift ────────────────────────────

test('running into the supply point says it uses the shift', async () => {
  const journey = createReconJourney({ areaId: 'kootenay-wetbelt' });
  journey.day = 1;
  journey.distanceTraveled = 0;
  ensureDaySeed(journey);
  assert.ok(journey.blocks[journey.currentBlockIndex].hasSupply, 'the start yard has a supply point');
  const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'end_shift')
    || options.find((o) => o.value === 'camp_menu') || options.find((o) => o.value === 'next' || o.value === 'continue'));
  await runReconDay({ ui, journey, checkpoint() {} });
  const supply = ui.prompts.flatMap((entry) => entry.options).find((o) => o.value === 'resupply');
  assert.equal(supply.description, 'Fuel, food, repairs, kits; uses this shift');
});
