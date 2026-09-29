import test from 'node:test';
import assert from 'node:assert/strict';

import { createManagerJourney } from '../js/journey/factory.js';
import { fitManagerEvent, runManagerDay } from '../js/modes/manager.js';
import { formatEventForDisplay, resolveEvent } from '../js/events/index.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { FIELD_EVENTS } from '../js/data/fieldEvents.js';
import { simulateManagerYear } from '../scripts/simulate-manager.mjs';
import managerEvents from '../js/data/json/desk/managerEvents.json' with { type: 'json' };

/**
 * What reaches the GM's desk: cards that fit the month and the job, options
 * that say what they do to the ledger, and outcomes that say what they did to
 * reputation.
 */

const deck = [...DESK_EVENTS, ...FIELD_EVENTS];
const find = (id) => {
  const event = deck.find((entry) => entry.id === id);
  assert.ok(event, `${id} exists`);
  return event;
};

function atMonth(month) {
  const journey = createManagerJourney({ areaId: 'okanagan-shuswap-drybelt' });
  journey.day = month;
  return journey;
}

test('fire and smoke cards land in the fire season, storms and ice roads in theirs', () => {
  const wildfire = find('wildfire_threat');
  const smoke = find('smoke-inversion_field');
  const washout = find('salmon-crossing-washout_field');
  const iceRoad = find('ice-road-window_field');
  for (const month of [12, 1, 3, 11]) {
    assert.equal(fitManagerEvent(atMonth(month), wildfire), null, `no approaching wildfire in month ${month}`);
    assert.equal(fitManagerEvent(atMonth(month), smoke), null, `no smoke inversion in month ${month}`);
  }
  assert.ok(fitManagerEvent(atMonth(7), wildfire));
  assert.ok(fitManagerEvent(atMonth(8), smoke));
  assert.equal(fitManagerEvent(atMonth(3), smoke), null);
  assert.equal(fitManagerEvent(atMonth(7), washout), null, 'no atmospheric river in July');
  assert.ok(fitManagerEvent(atMonth(11), washout));
  assert.equal(fitManagerEvent(atMonth(7), iceRoad), null);
  assert.ok(fitManagerEvent(atMonth(1), iceRoad));
  // Any other fire card is held to the fire season by its title.
  assert.equal(fitManagerEvent(atMonth(12), { id: 'x', title: 'Fire Weather Warning', type: 'weather', options: [] }), null);
  assert.ok(fitManagerEvent(atMonth(12), { id: 'y', title: 'Budget Cut', type: 'political', options: [] }));
});

test('a year of GM months never deals a fire or smoke card out of season', async () => {
  const outOfSeason = [];
  for (let seed = 500; seed < 530; seed += 1) {
    const { journey } = await simulateManagerYear(seed, 'random', { areaId: seed % 2 ? 'fraser-plateau' : 'okanagan-shuswap-drybelt' });
    for (const entry of journey.log.filter((item) => item.type === 'event')) {
      const event = deck.find((candidate) => candidate.id === entry.eventId);
      if (event && /wildfire|smoke/i.test(event.title) && ![5, 6, 7, 8, 9].includes(entry.day)) {
        outOfSeason.push(`${seed}: ${event.title} in month ${entry.day}`);
      }
    }
  }
  assert.deepEqual(outOfSeason, []);
});

test('the CEO budget fight and the woodlot and community-forest shortcuts are not the GM\'s', async () => {
  assert.equal(fitManagerEvent(atMonth(4), find('competing_budget_claim')), null);

  const offered = new Set();
  for (let seed = 900; seed < 960; seed += 1) {
    const { journey } = await simulateManagerYear(seed, 'random');
    for (const entry of journey.log.filter((item) => item.type === 'event' && /^temptation_/.test(item.eventId || ''))) {
      offered.add(entry.eventId.replace(/^temptation_(reoffer_)?/, ''));
    }
  }
  assert.ok(offered.size > 5, `the GM still hears shortcuts (${offered.size})`);
  assert.ok(!offered.has('woodlot-overcut-gambit'));
  assert.ok(!offered.has('community-forest-coasting'));
});

test('replacement crews in a labour dispute read as the section 68 problem they are', () => {
  const event = find('labour-job-action_desk');
  const fitted = fitManagerEvent(atMonth(9), event);
  const option = fitted.options[2];
  assert.match(option.label, /replacement crews/);
  assert.match(option.outcome, /section 68 of the Labour Relations Code/);
  assert.ok(option.effects.progress < 0 && option.effects.reputation < 0, 'it does not buy progress');
  assert.equal(formatEventForDisplay(fitted, 'manager').options[2].tag, 'RISKY');
  assert.deepEqual(fitted.options[0], event.options[0], 'the other options are the deck\'s');
  assert.ok(event.options[2].effects.permits_approved, 'the shared deck is untouched');
});

test('a ledger-hook option says on its chip and in its outcome what it does to the rest of the year', async () => {
  const event = managerEvents.find((entry) => entry.id === 'gm_contractor_rate_renegotiation');
  const shown = formatEventForDisplay(fitManagerEvent(atMonth(6), event), 'manager');
  assert.match(shown.options[0].hint, /ledger: logging & haul \+\$2\.50\/m³ for the rest of the year/);
  assert.match(shown.options[1].hint, /ledger: logging & haul \+\$2\/m³ for the rest of the year, this month's deliveries at 90% of plan/);
  assert.match(shown.options[2].hint, /ledger: logging & haul \+\$3\/m³ for the rest of the year/);

  const sharing = managerEvents.find((entry) => entry.id === 'gm_fn_revenue_sharing');
  const sharingShown = formatEventForDisplay(fitManagerEvent(atMonth(6), sharing), 'manager');
  assert.match(sharingShown.options[0].hint, /ledger: logging & haul \+\$2\/m³ for the rest of the year/);
  assert.ok(!/ledger:/.test(sharingShown.options[2].hint), 'an option with no ledger effect says nothing');

  const bcts = formatEventForDisplay(fitManagerEvent(atMonth(6), managerEvents.find((entry) => entry.id === 'gm_bcts_bid')), 'manager');
  assert.match(bcts.options[1].hint, /\+12,000 m³ on this month's cut/);
  assert.match(bcts.options[1].hint, /stumpage \+\$3\/m³ for the rest of the year/);
});

test('an event\'s reputation effect is printed with the outcome', () => {
  const journey = createManagerJourney({ areaId: 'fraser-plateau' });
  const before = journey.metrics.reputation;
  const event = { id: 'rep_test', title: 'Test', type: 'stakeholder', severity: 'minor', options: [{ label: 'Meet everyone', outcome: 'You do.', effects: { reputation: 8 } }] };
  const result = resolveEvent(journey, event, event.options[0]);
  assert.equal(journey.metrics.reputation, before + 8);
  assert.ok(result.messages.includes(`Reputation +8 → ${before + 8}.`), result.messages.join(' | '));
});

test('the set-aside chip says what setting a card aside means at head office', async () => {
  const journey = createManagerJourney({ areaId: 'fraser-plateau' });
  const cards = [];
  const ui = {
    write() {}, writeHeader() {}, writeWarning() {}, writePositive() {}, writeDanger() {}, writeInfo() {}, writeSuccess() {}, writeDivider() {},
    clear() {}, updateAllStatus() {}, playEventVignette() {}, async playScene() {}, setMissionStatus() {}, clearMissionStatus() {},
    async promptChoice(prompt, options = []) {
      const aside = options.find((option) => option.value === 'set_aside');
      if (aside) cards.push(aside.description);
      return options.find((option) => ['steady', 'none', 'hold', 'plan', 'desk', 'rehearse', 'transparent', 'pace:1', 'set_aside', 'continue'].includes(option.value)) || options[0];
    },
  };
  const original = Math.random;
  let state = 77;
  Math.random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000; };
  try {
    for (let month = 0; month < 12; month += 1) await runManagerDay({ ui, journey, gameOver: false, checkpoint() {} });
  } finally {
    Math.random = original;
  }
  assert.ok(cards.length > 0);
  assert.ok(cards.every((text) => !/Delegate/.test(text)), cards.join(' | '));
});
