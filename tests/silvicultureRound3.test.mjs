import test from 'node:test';
import assert from 'node:assert/strict';

import { createSilvicultureJourney } from '../js/journey/factory.js';
import {
  runSilvicultureDay,
  adaptEventForProgram,
  fitEventToCrew,
  settleContractorCasualty,
  describeLostCrewRole,
  setAsideCostsTheDay,
  getSilvicultureFacts,
  getReleaseDayFactor,
  handleContractorEvent,
  CONTRACTOR_EVENTS,
  PUSHED_STAND_DOWN_INCIDENT,
} from '../js/modes/silviculture.js';
import { runDaySituation } from '../js/journey/daySituation.js';
import { ensureDaySeed } from '../js/events/dayRng.js';
import { evacuateCrewMember } from '../js/crew.js';
import { estimateProgramCosts } from '../js/data/silvicultureProgram.js';
import { FIELD_EVENTS } from '../js/data/fieldEvents.js';

function seededRandomFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function withSeededRandom(seed, fn) {
  const original = Math.random;
  Math.random = seededRandomFactory(seed);
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

/** Records what was written and asked; a disabled option is never taken. */
function makeRecordingUi(answer) {
  const lines = [];
  const prompts = [];
  const push = (text) => { if (typeof text === 'string') lines.push(text); };
  return {
    lines,
    prompts,
    write: push, writeHeader: push, writeWarning: push, writePositive: push, writeDanger: push,
    writeInfo: push, writeSuccess: push, writeDivider: () => {}, clear: () => {}, updateAllStatus: () => {},
    playEventVignette: () => {}, playScene: async () => {}, clearMissionStatus: () => {}, setMissionStatus: () => {},
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

const endDay = (prompt, options) => options.find((o) => o.value === 'set_aside') || options.find((o) => o.value === 'end');
const byLabel = (label) => (prompt, options) => options.find((o) => String(o.label).startsWith(label)) || options.find((o) => o.value === 'continue') || options[0];
const eventById = (id) => FIELD_EVENTS.find((event) => event.id === id);
const dayMenu = (ui) => ui.prompts.find((entry) => entry.options.some((o) => o.value === 'end'));

// ── Each outfit works its own contract ─────────────────────────────────────

test('with the planters stood down for the day, the saw crew does not plant', async () => {
  await withSeededRandom(52202, async () => {
    const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
    const planters = journey.contractors.find((c) => c.specialty === 'planting');
    const brushers = journey.contractors.find((c) => c.specialty === 'brushing');
    brushers.isActive = true;
    // "Stand the camp down for a day: No planting today", answered this morning
    // (the day boundary has already taken one day off the count).
    planters.isActive = false;
    planters.silvicultureState = { status: 'recovering', cooldownDays: 2, traits: [] };
    const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'plant') || endDay(prompt, options));
    await runSilvicultureDay({ ui, journey, gameOver: false });
    const plant = dayMenu(ui).options.find((o) => o.value === 'plant');
    assert.ok(plant.disabled, 'planting waits for the planters');
    assert.equal(plant.description, `Waits for ${planters.name}, on days off until day 2.`);
    assert.equal(journey.planting.seedlingsPlanted, 0);
    assert.ok(!ui.lines.some((line) => /\/tree - invoice/.test(line)), 'nobody billed a tree');
  });
});

// ── The release quote holds for the day ────────────────────────────────────

test('backing out of the release menu and opening it again quotes the same hectares', async () => {
  await withSeededRandom(707, async () => {
    const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
    let quotes = 0;
    const ui = makeRecordingUi((prompt, options) => {
      if (prompt.startsWith('Release treatment on ')) return options.find((o) => o.value === 'manual');
      if (prompt.startsWith('Today\'s release')) {
        quotes += 1;
        return options.find((o) => o.value === (quotes < 3 ? 'cancel' : 'confirm'));
      }
      return options.find((o) => o.value === 'brush') || endDay(prompt, options);
    });
    await runSilvicultureDay({ ui, journey, gameOver: false });
    const asked = ui.prompts.filter((entry) => entry.prompt.startsWith('Today\'s release')).map((entry) => entry.prompt);
    assert.equal(asked.length, 3);
    assert.equal(new Set(asked).size, 1, asked.join('\n'));
    const quoted = Number(asked[0].match(/: (\d+) ha at/)[1]);
    assert.equal(journey.brushing.hectaresComplete, quoted);
  });
});

test('the day\'s release factor comes from the day seed, so a reload quotes the same day', () => {
  const journey = createSilvicultureJourney({ areaId: 'fraser-plateau' });
  ensureDaySeed(journey);
  const first = getReleaseDayFactor(journey, {});
  const again = getReleaseDayFactor(journey, {});
  assert.equal(first, again);
  assert.ok(first >= 0.8 && first <= 1.2);
});

// ── Setting a situation aside ───────────────────────────────────────────────

test('setting aside a situation whose cheapest answer is a day\'s work takes the day too', () => {
  const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  assert.equal(setAsideCostsTheDay(journey, adaptEventForProgram(eventById('road_washout'))), true);
  assert.equal(setAsideCostsTheDay(journey, adaptEventForProgram(eventById('inspector_arrives'))), true);
  // A card that can be answered without losing the day still lets you keep it.
  assert.equal(setAsideCostsTheDay(journey, adaptEventForProgram(eventById('food_poisoning'))), false);
});

test('a storm that says nobody works today takes the day whatever the answer', () => {
  const journey = createSilvicultureJourney({ areaId: 'vancouver-island-coast' });
  const storm = adaptEventForProgram(eventById('major_storm_hits'));
  assert.ok(storm.options.every((option) => option.spendsDay === true));
  assert.equal(setAsideCostsTheDay(journey, storm), true);
});

test('novelty cards from the old deck stay out of the program', () => {
  for (const id of ['social_media_viral', 'celebrity_endorsement', 'alien_landing']) {
    assert.ok(eventById(id), id);
    assert.equal(adaptEventForProgram(eventById(id)), null, id);
  }
});

// ── Casualties ──────────────────────────────────────────────────────────────

test('an injury lands on one named member of your crew, never the attendant treating them', async () => {
  const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  const card = fitEventToCrew(journey, adaptEventForProgram(eventById('worker_injury')));
  const named = card.description.match(/^(\w+), your ([a-z ]+),/);
  assert.ok(named, card.description);
  const victim = journey.crew.find((member) => member.name === named[1]);
  assert.notEqual(victim.role, 'medic');
  for (const option of card.options) {
    for (const key of ['crewEffect', 'partialCrewEffect', 'failureCrewEffect']) {
      if (option[key]?.injury || option[key]?.evacuate) assert.equal(option[key].victimId, victim.id, `${option.label} ${key}`);
    }
  }
  const sendOut = card.options.find((option) => /^Send them out/.test(option.label));
  assert.match(sendOut.crewEffect.departure, /goes out in the ETV with the attendant/);
  const rest = card.options.find((option) => /^Have them rest/.test(option.label));
  assert.match(rest.failureCrewEffect.departure, /ETV/, 'the ETV run in the morning is not a helicopter');

  const ui = makeRecordingUi(byLabel(sendOut.label));
  await runDaySituation({ ui, journey }, card);
  const gone = journey.crew.filter((member) => !member.isActive);
  assert.deepEqual(gone.map((member) => member.id), [victim.id]);
  assert.ok(ui.lines.some((line) => line === `${victim.name} goes out in the ETV with the attendant. WorkSafeBC gets the call from the truck.`), ui.lines.join('\n'));
});

test('a saw kickback hurts one of the brushing contractor\'s cutters, not your crew', async () => {
  const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  const brushers = journey.contractors.find((c) => c.specialty === 'brushing');
  const card = fitEventToCrew(journey, adaptEventForProgram(eventById('chainsaw_cut')));
  assert.match(card.description, /^A saw kicks back on the block: one of Wetbelt Brushing Co's cutters\./);
  const medevac = card.options.find((option) => option.label === 'Call helicopter medevac');
  assert.deepEqual(medevac.crewEffect, { contractorCasualty: brushers.id, evacuated: true });

  const productivity = brushers.productivity;
  const ui = makeRecordingUi(byLabel('Call helicopter medevac'));
  await runDaySituation({ ui, journey }, card);
  assert.ok(journey.crew.every((member) => member.isActive), 'nobody on your crew went out');
  const note = settleContractorCasualty(journey, card);
  assert.match(note, /^Wetbelt Brushing Co's cutter is out for the season; the saw crews run a hand short/);
  assert.equal(brushers.productivity, productivity - 8);
});

test('with the attendant gone, the cards stop calling on them, the loss is named, and a replacement is on the day card', async () => {
  const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  const medic = journey.crew.find((member) => member.role === 'medic');
  evacuateCrewMember(medic, { day: 1 });
  const card = fitEventToCrew(journey, adaptEventForProgram(eventById('worker_injury')));
  assert.ok(card.options.some((option) => option.label === 'Have the contractor\'s attendant tape it and keep them on light duty'));
  assert.ok(!card.options.some((option) => /OFA 3/.test(option.label)));
  assert.equal(describeLostCrewRole(medic),
    `${medic.name} was your OFA 3 attendant. No OFA 3 or ETV of your own: first aid on the block falls to the contractors' attendants, and injury calls go without yours. A replacement can come up from town: a day and $1,200.`);

  const budget = journey.resources.budget;
  const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'replace:medic') || endDay(prompt, options));
  await runSilvicultureDay({ ui, journey, gameOver: false });
  const replace = dayMenu(ui).options.find((o) => o.value === 'replace:medic');
  assert.equal(replace.label, 'Bring up a replacement OFA 3 attendant');
  const medics = journey.crew.filter((member) => member.role === 'medic' && member.isActive);
  assert.equal(medics.length, 1);
  assert.equal(medics[0].firstAidTicket, 'OFA3');
  assert.ok(budget - journey.resources.budget >= 1200);
  assert.equal(ui.prompts.filter((entry) => entry.options.some((o) => o.value === 'end')).length, 1, 'the drive to town is the day');
});

// ── Program facts for content ───────────────────────────────────────────────

test('getSilvicultureFacts reports what the program still owes and who can do it', () => {
  const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  const trees = journey.program.blocks.reduce((sum, block) => sum + block.trees, 0);
  const facts = getSilvicultureFacts(journey);
  assert.deepEqual(facts, {
    plantingRemaining: trees,
    blocksRemaining: 8,
    fillRemaining: 2,
    releaseQueueRemaining: 260,
    surveysRemaining: 3,
    seedlingsOnHand: journey.resources.seedlings,
    plantersOnStandDown: false,
    surveyorOnCrew: true,
    accreditedSurveyor: true,
    firstAidAttendant: true,
    sprayClosed: false,
  });
  const planters = journey.contractors.find((c) => c.specialty === 'planting');
  planters.silvicultureState = { status: 'recovering', cooldownDays: 1, traits: [] };
  assert.equal(getSilvicultureFacts(journey).plantersOnStandDown, true);
  for (const block of journey.program.blocks) block.planted = block.trees;
  journey.planting.blocksPlanted = journey.planting.blocksToPlant;
  assert.equal(getSilvicultureFacts(journey).plantingRemaining, 0);
  assert.equal(getSilvicultureFacts(journey).blocksRemaining, 0);
  assert.equal(getSilvicultureFacts({}).plantingRemaining, 0, 'safe on a journey with no program');
});

// ── Contractor calls ────────────────────────────────────────────────────────

test('an upgraded camp stays upgraded, and an inspected kitchen buys ten days', async () => {
  const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  journey.day = 25;
  const planters = journey.contractors.find((c) => c.specialty === 'planting');
  planters.morale = 50;
  const camp = CONTRACTOR_EVENTS.find((event) => event.id === 'camp_demand');
  const sickness = CONTRACTOR_EVENTS.find((event) => event.id === 'crew_illness');
  assert.equal(camp.trigger(planters, journey), true);
  const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'pay'));
  await handleContractorEvent({ ui, journey }, camp, planters, () => 0.5);
  planters.morale = 40;
  journey.day = 31;
  assert.equal(camp.trigger(planters, journey), false, 'the upgraded camp does not come back with the same leak');
  assert.equal(sickness.trigger(planters, journey, () => 0), false, 'the water was fixed six days ago');
  journey.day = 36;
  assert.equal(sickness.trigger(planters, journey, () => 0), true);
});

test('stand-down calls only come for an outfit with its own work left', () => {
  const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  const standDown = CONTRACTOR_EVENTS.find((event) => event.id === 'stand_down');
  const brushers = journey.contractors.find((c) => c.specialty === 'brushing');
  assert.equal(standDown.trigger(brushers, journey), true);
  for (const opening of journey.program.brush) opening.treated = opening.ha;
  assert.equal(standDown.trigger(brushers, journey), false);
});

test('keeping a crew on the block through a stand-down carries a stated, real risk', async () => {
  const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  const standDown = CONTRACTOR_EVENTS.find((event) => event.id === 'stand_down');
  const push = standDown.options.find((option) => option.value === 'push');
  assert.equal(push.description, `Production today; ${PUSHED_STAND_DOWN_INCIDENT * 100}% someone gets hurt and WorkSafeBC opens a file (scrutiny +6, compliance -4)`);
  const brushers = journey.contractors.find((c) => c.specialty === 'brushing');
  const scrutiny = journey.scrutiny;
  const compliance = journey.standingLedger?.compliance || 0;
  const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'push'));
  await handleContractorEvent({ ui, journey }, standDown, brushers, () => 0.01);
  assert.equal(journey.scrutiny, scrutiny + 1 + 6);
  assert.equal(journey.standingLedger.compliance, compliance - 4);
  assert.ok(ui.lines.some((line) => /One of Wetbelt Brushing Co's cutters is hurt on the block/.test(line)));
});

test('the split-the-crew call and its answer describe the same deal', () => {
  const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
  const planters = journey.contractors.find((c) => c.specialty === 'planting');
  const reprice = CONTRACTOR_EVENTS.find((event) => event.id === 'reprice');
  const text = reprice.getText(planters, journey);
  assert.doesNotMatch(text, /smaller crew/);
  assert.match(text, /keep the whole crew on your program at \+\$0\.04\/tree/);
  assert.match(reprice.options[0].description, /^Full crew stays/);
});

// ── The day's work ──────────────────────────────────────────────────────────

test('a release day that eats into the money the rest of the program needs says so', async () => {
  await withSeededRandom(55555, async () => {
    const journey = createSilvicultureJourney({ areaId: 'vancouver-island-coast' });
    journey.resources.budget = estimateProgramCosts(journey).committed + 5000;
    const ui = makeRecordingUi((prompt, options) => {
      if (prompt.startsWith('Release treatment on ')) return options.find((o) => o.value === 'manual');
      if (prompt.startsWith('Today\'s release')) return options.find((o) => o.value === 'cancel');
      return options.find((o) => o.value === 'brush' && !ui.prompts.some((entry) => entry.prompt.startsWith('Today'))) || endDay(prompt, options);
    });
    await runSilvicultureDay({ ui, journey, gameOver: false });
    const quote = ui.prompts.find((entry) => entry.prompt.startsWith('Today\'s release'));
    const send = quote.options.find((o) => o.value === 'confirm');
    assert.match(send.description, /This eats into the money planting, fill and surveys still need: only about \$\d/);
  });
});

test('a meeting and a briefing print what they moved', async () => {
  await withSeededRandom(12, async () => {
    const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
    const ui = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'meeting') || options[0]);
    await runSilvicultureDay({ ui, journey, gameOver: false });
    assert.ok(ui.lines.some((line) => /: morale \d+% → \d+%/.test(line)), ui.lines.join('\n'));
    const ui2 = makeRecordingUi((prompt, options) => options.find((o) => o.value === 'team_briefing') || endDay(prompt, options));
    const brief = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
    await runSilvicultureDay({ ui: ui2, journey: brief, gameOver: false });
    assert.ok(ui2.lines.some((line) => /^Crew morale \d+% → \d+% on average\.$/.test(line)), ui2.lines.join('\n'));
  });
});

test('on a plot day, fill planting stays on the card with the reason it waits', async () => {
  await withSeededRandom(22, async () => {
    const journey = createSilvicultureJourney({ areaId: 'kootenay-wetbelt' });
    const block = journey.program.blocks[0];
    Object.assign(block, { planted: block.trees, status: 'planted', plantedDay: 1 });
    journey.planting.blocksPlanted = 1;
    const ui = makeRecordingUi(endDay);
    await runSilvicultureDay({ ui, journey, gameOver: false });
    const fill = dayMenu(ui).options.find((o) => o.value === 'fill');
    assert.ok(fill?.disabled);
    assert.equal(fill.description, `Waits for the quality plots on ${block.id}: the planters go nowhere else until they are walked.`);
  });
});
