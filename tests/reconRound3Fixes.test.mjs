/**
 * Recon residuals from the round-3 retest: a restock billed at list price for
 * a part-load, a storm follow-up under clear skies that promised work, five
 * crew with the same epilogue, a grade that could not tell careful from
 * flawless, gamble failures that charged cash the card never showed, block
 * cards at waypoints and on closed blocks, and next-leg bonuses at the end of
 * the road.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createReconJourney } from '../js/journey/factory.js';
import { handleResupply } from '../js/modes/recon.js';
import { FIELD_RESOURCES } from '../js/resources.js';

function makeUi(pickValue, log = []) {
  const write = (message) => log.push(String(message ?? ''));
  const noop = () => {};
  return {
    clear: noop, write, writeHeader: write, writePositive: write, writeWarning: write, writeDanger: write,
    writeBox: write, writeDivider: noop, updateAllStatus: noop, playScene: noop, playEventVignette: noop,
    playTravelStrip: noop, setMissionStatus: noop, clearMissionStatus: noop,
    async promptText() { return 'x'; },
    async promptChoice(prompt, options = []) {
      return pickValue(options, prompt) || options[0];
    },
  };
}

/** A journey parked at the first stop, so the shop charges no freight. */
function shopJourney() {
  const journey = createReconJourney({ areaId: 'kootenay-wetbelt' });
  journey.distanceTraveled = 0;
  journey.day = 1;
  return journey;
}

// ── Restock ────────────────────────────────────────────────────────────────

test('a part restock is billed for what the truck takes, and leaves the shelf when one line fits', async () => {
  const journey = shopJourney();
  // Nelson, shift 1 in the retest: fuel 720/800, food full, equipment 90, kits 8/15.
  Object.assign(journey.resources, { budget: 5000, fuel: 720, food: FIELD_RESOURCES.food.max, equipment: 90, firstAid: 8 });
  const menus = [];
  await handleResupply({
    ui: makeUi((options) => {
      menus.push(options.map((o) => ({ ...o })));
      return menus.length === 1 ? options.find((o) => o.value === 'full_restock') : options.find((o) => o.value === 'done');
    }),
    journey,
  }, { name: 'Nelson Works Yard' });

  const offer = menus[0].find((o) => o.value === 'full_restock');
  assert.match(offer.label, /^Restock, part \(all that fits\) \(\$\d+\)$/);
  assert.equal(offer.description, '+80 L fuel, +10% equipment, +2 kits');
  const price = Number(offer.label.match(/\$(\d+)\)$/)[1]);
  // The same goods item by item: 80 L of a $360 drum, 10% of a $220 repair
  // for 15%, two $120 kits. The bundle is cheaper, never dearer.
  const itemByItem = 360 * 80 / 200 + 220 * 10 / 15 + 2 * 120;
  assert.ok(price < itemByItem, `${price} < ${itemByItem}`);
  assert.ok(price < 700 * 0.6, `part-load price ${price} is pro-rated`);
  assert.equal(journey.resources.budget, 5000 - price);
  assert.equal(journey.resources.fuel, 800);
  assert.equal(journey.resources.equipment, 100);
  assert.equal(journey.resources.firstAid, 10);

  // Only kit room is left: the restock is no longer a choice.
  const after = menus[1].find((o) => o.value === 'full_restock');
  assert.ok(after?.disabled, 'restock with one line left is not offered');
  assert.ok(menus[1].find((o) => o.value === 'first_aid' && !o.disabled), 'the kit is still sold on its own');
});

test('a full restock still costs the bundle price', async () => {
  const journey = shopJourney();
  Object.assign(journey.resources, { budget: 5000, fuel: 300, food: 40, equipment: 50, firstAid: 3 });
  let menu = [];
  await handleResupply({ ui: makeUi((options) => { menu = options; return options.find((o) => o.value === 'done'); }), journey }, { name: 'Supply Point' });
  const offer = menu.find((o) => o.value === 'full_restock');
  assert.equal(offer.label, 'Full restock ($700)');
  assert.equal(offer.description, '+200 L fuel, +25 person-days food, +20% equipment, +2 kits');
});

test('shop rows keep their number when an item stops being affordable', async () => {
  const journey = shopJourney();
  // After one crate the fuel drum is out of reach; the kit must not slide into its slot.
  Object.assign(journey.resources, { budget: 500, fuel: 400, food: 30, equipment: 100, firstAid: 5 });
  const menus = [];
  await handleResupply({
    ui: makeUi((options) => {
      menus.push(options.map((o) => ({ value: o.value, disabled: Boolean(o.disabled) })));
      return menus.length === 1 ? options.find((o) => o.value === 'rations') : options.find((o) => o.value === 'done');
    }),
    journey,
  }, { name: 'Sproat Lake Camp' });
  assert.deepEqual(menus[1].map((o) => o.value), menus[0].map((o) => o.value));
  assert.equal(menus[1].find((o) => o.value === 'fuel_drum').disabled, true);
});
