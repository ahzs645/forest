import test from 'node:test';
import assert from 'node:assert/strict';

import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { createPlanningJourney, createReconJourney } from '../js/journey/factory.js';
import { runDaySituation, situationWeight } from '../js/journey/daySituation.js';
import { isCrewCasualtySituation, isImposedSituation, pickDeferredCost } from '../js/events/deferral.js';
import { FIELD_EVENTS } from '../js/data/fieldEvents.js';
import { STEEP_EFFECT_THRESHOLDS } from '../js/events/display.js';
import { isSituationClosedClean, scoreSituationsClosedClean } from '../js/scoring.js';

function makeUi() {
  const lines = [];
  const prompts = [];
  return {
    lines,
    prompts,
    clear() { lines.push('<clear>'); },
    write(text) { lines.push(String(text ?? '')); },
    writeHeader(text) { lines.push(String(text ?? '')); },
    writeWarning(text) { lines.push(String(text ?? '')); },
    updateAllStatus() {},
    async promptChoice(_prompt, options) {
      prompts.push(options.map((option) => option.label));
      return options.find((option) => option.value === 'set_aside') || options[0];
    },
  };
}

function textAfterDeferral(ui) {
  const last = ui.lines.lastIndexOf('<clear>');
  return ui.lines.slice(last + 1).join('\n');
}

test('setting aside an imposed situation lands its default cost, keeps the cost on screen, and logs it', async () => {
  const journey = createPlanningJourney({ areaId: 'fort-st-john-plateau' });
  journey.day = 12;
  journey.scrutiny = 30;
  journey.plan.dataCompleteness = 60;
  const budgetBefore = journey.resources.budget;
  const stressBefore = journey.protagonist.stress;
  const budgetCut = DESK_EVENTS.find((event) => event.id === 'budget_cut');
  assert.ok(budgetCut, 'fixture event present');
  assert.equal(isImposedSituation(budgetCut, 2), true, 'every option on a budget cut costs something');
  assert.equal(pickDeferredCost(budgetCut, 2).option.label, 'Find alternative funding',
    'a gamble is priced at its expected cost, not its hoped-for band, and here it is the least of it');

  const ui = makeUi();
  const outcome = await runDaySituation({ ui, journey, gameOver: false }, budgetCut, {});

  assert.equal(outcome.setAside, true);
  assert.equal(journey.resources.budget, budgetBefore - 3600, 'the cut lands anyway, at the least of it');
  assert.equal(journey.plan.dataCompleteness, 58, 'so does a little of the survey it defers');
  assert.equal(journey.scrutiny, 32);
  assert.equal(journey.protagonist.stress, stressBefore + 8, 'the scramble for money and the deferral both sit with you');

  const shown = textAfterDeferral(ui);
  assert.match(shown, /It lands anyway — the least of it:/);
  assert.match(shown, /Budget: -\$3,600/);
  assert.match(shown, /Data readiness slipped \(-2%\)/);
  assert.match(shown, /Scrutiny \+2; it sits with you \(stress \+2\)/);
  assert.deepEqual(ui.prompts.at(-1), ['Take the day back'], 'the cost waits to be acknowledged');

  const entry = journey.log.at(-1);
  assert.equal(entry.type, 'event');
  assert.equal(entry.eventId, 'budget_cut');
  assert.equal(entry.optionLabel, 'Set it aside');
  assert.equal(entry.setAside, true);
  assert.deepEqual(entry.effects, { crew_morale: -6, data: -2, budget: -3600, scrutiny: 2 });
  assert.equal(isSituationClosedClean(entry), false);
  assert.equal(scoreSituationsClosedClean(journey).label, '0 of 1 situation closed clean');
});

test('a situation with a free answer costs scrutiny and the people carrying the run, nothing more', async () => {
  const journey = createPlanningJourney({ areaId: 'fort-st-john-plateau' });
  journey.day = 6;
  journey.scrutiny = 10;
  const budgetBefore = journey.resources.budget;
  const event = {
    id: 'walk_in', title: 'Walk-in', severity: 'moderate', description: 'x',
    options: [
      { label: 'Take the meeting', outcome: 'x', effects: { relationships: 4, timeUsed: 3 } },
      { label: 'Send them to the front desk', outcome: 'x', effects: { relationships: -6 } },
    ],
  };
  assert.equal(isImposedSituation(event, 2), false);

  const ui = makeUi();
  await runDaySituation({ ui, journey, gameOver: false }, event, {});
  assert.equal(journey.resources.budget, budgetBefore);
  assert.equal(journey.scrutiny, 12);
  assert.match(textAfterDeferral(ui), /You leave it\. Scrutiny \+2; it sits with you \(stress \+2\)\./);
  assert.equal(journey.log.at(-1).setAside, true);
});

test('a minor call costs a point of scrutiny; a positive turn costs nothing but the moment', async () => {
  const journey = createReconJourney({ areaId: 'fort-st-john-plateau' });
  journey.day = 4;
  journey.scrutiny = 5;
  const morale = journey.crew.map((member) => member.morale);

  const ui = makeUi();
  await runDaySituation({ ui, journey, gameOver: false }, {
    id: 'flat', title: 'Flat Tire', severity: 'minor', description: 'x',
    options: [{ label: 'Change it', outcome: 'x', effects: { timeUsed: 1 } }],
  }, {});
  assert.equal(journey.scrutiny, 6);
  assert.deepEqual(journey.crew.map((member) => member.morale), morale, 'a minor call has no human cost');
  assert.match(textAfterDeferral(ui), /You leave it for another day\. Scrutiny \+1\./);
  assert.deepEqual(ui.prompts.at(-1), ['Take the shift back']);

  await runDaySituation({ ui, journey, gameOver: false }, {
    id: 'sunset', title: 'Beautiful Sunset', severity: 'positive', description: 'x',
    options: [{ label: 'Knock off early', outcome: 'x', effects: { crew_morale: 4 } }],
  }, {});
  assert.equal(journey.scrutiny, 6, 'letting a good turn pass is not something the file notices');
  assert.match(textAfterDeferral(ui), /Nothing lost but the moment/);
  const sunset = journey.log.at(-1);
  assert.equal(sunset.setAside, true);
  assert.equal(isSituationClosedClean(sunset), true);
  assert.equal(scoreSituationsClosedClean(journey).label, '1 of 2 situations closed clean');
});

test('an imposed situation made only of gambles lands the least expected cost', () => {
  const event = {
    id: 'audit', title: 'Surprise Audit', severity: 'severe', description: 'x',
    options: [
      { label: 'Bluff', outcome: 'x', effects: { compliance: 2 }, chanceSuccess: 0.4, failureEffects: { compliance: -12, budget: -3000 } },
      { label: 'Stall', outcome: 'x', effects: { scrutiny: 2 }, chanceSuccess: 0.5, failureEffects: { compliance: -6 } },
    ],
  };
  assert.equal(isImposedSituation(event, 3), true);
  const cost = pickDeferredCost(event, 3);
  assert.equal(cost.option.label, 'Stall');
  assert.deepEqual(cost.effects, { compliance: -3 }, 'half the time the stall works');
});

test('setting aside the contractor billing dispute never charges the invoice', () => {
  const dispute = DESK_EVENTS.find((event) => event.id === 'contractor_dispute');
  const cost = pickDeferredCost(dispute, 2, { budgetBase: 66000 });
  assert.notEqual(cost.option.label, 'Pay the full amount to preserve the relationship');
  assert.ok(cost.effects.budget >= -2000, `budget charge ${cost.effects.budget}`);
});

test('no desk situation set aside charges more than its cheapest answer or its weight allows', () => {
  const budgetBase = 66000; // an Old Growth planning budget
  const units = (costs, { budget = true } = {}) => Object.entries(costs)
    .filter(([key, value]) => value < 0 && (budget || key !== 'budget') && STEEP_EFFECT_THRESHOLDS[key] !== undefined)
    .reduce((sum, [key, value]) => sum + Math.abs(value) / Math.abs(STEEP_EFFECT_THRESHOLDS[key]), 0);
  const expected = (option) => {
    if (typeof option.chanceSuccess !== 'number') return option.effects || {};
    const bad = option.failureEffects || option.effects || {};
    const out = {};
    for (const key of new Set([...Object.keys(option.effects || {}), ...Object.keys(bad)])) {
      out[key] = option.chanceSuccess * Number(option.effects?.[key] || 0) + (1 - option.chanceSuccess) * Number(bad[key] || 0);
    }
    return out;
  };
  let imposed = 0;
  for (const event of DESK_EVENTS) {
    const weight = situationWeight(event);
    const cost = pickDeferredCost(event, weight, { budgetBase });
    if (!cost) continue;
    imposed += 1;
    // A safety investigation is never cheaper to walk away from: no cap.
    if (event.type !== 'safety') {
      const share = weight >= 3 ? 0.1 : 0.06;
      assert.ok(-(cost.effects.budget || 0) <= budgetBase * share, `${event.id}: budget ${cost.effects.budget}`);
      assert.ok(units(cost.effects, { budget: false }) <= (weight >= 3 ? 3 : 2) + 0.3, `${event.id}: ${JSON.stringify(cost.effects)}`);
    }
    const cheapest = Math.min(...event.options.map((option) => units(expected(option))));
    assert.ok(units(cost.effects) <= cheapest + 0.3,
      `${event.id}: set aside ${JSON.stringify(cost.effects)} costs more than the cheapest answer`);
    assert.ok(Object.values(cost.effects).every((value) => Number.isInteger(value) && value < 0), `${event.id}: whole costs only`);
  }
  assert.ok(imposed >= 20, `imposed desk situations checked: ${imposed}`);
});

test('setting aside a chainsaw kickback lands the evacuation and the hard road, never less than answering it', async () => {
  const journey = createReconJourney({ areaId: 'fort-st-john-plateau' });
  journey.day = 13;
  journey.scrutiny = 20;
  journey.resources.budget = 212; // the medevac is off the card
  const chainsaw = FIELD_EVENTS.find((event) => event.id === 'chainsaw_cut');
  assert.ok(chainsaw, 'fixture event present');
  const onCrewBefore = journey.crew.filter((member) => member.isActive).length;

  const cost = pickDeferredCost(chainsaw, situationWeight(chainsaw), { budgetBase: journey.budgetStart, journey });
  assert.notEqual(cost.option.label, 'Call helicopter medevac', 'the charter the card could not offer is not the charge');
  assert.ok(cost.crewEffect?.evacuate, 'the crew still takes the injured hand out');
  assert.ok(cost.effects.compliance <= -6, `the incident review lands: ${JSON.stringify(cost.effects)}`);
  assert.ok(cost.effects.scrutiny >= 8, 'and the file notices why nobody decided');

  const ui = makeUi();
  const outcome = await runDaySituation({ ui, journey, gameOver: false }, chainsaw, {
    setAsideDescription: 'Not today. Take the shift back and spend it on your own work.',
  });
  assert.equal(outcome.setAside, true);
  assert.equal(journey.crew.filter((member) => member.isActive).length, onCrewBefore - 1, 'somebody goes out');
  assert.ok(journey.crew.some((member) => member.status === 'evacuated'));
  assert.ok(journey.scrutiny >= 20 + 8 + 3, `scrutiny ${journey.scrutiny}`);
  const shown = textAfterDeferral(ui);
  assert.match(shown, /Nobody sets a hurt crew member aside/);
  assert.doesNotMatch(shown, /the least of it/);
  assert.equal(journey.log.at(-1).setAside, true);
});

test('no crew casualty card is cheaper to set aside than to answer', () => {
  const casualties = FIELD_EVENTS.filter((event) => isCrewCasualtySituation(event));
  assert.ok(casualties.length >= 4, `casualty cards checked: ${casualties.length}`);
  const units = (costs) => Object.entries(costs)
    .filter(([key, value]) => value < 0 && STEEP_EFFECT_THRESHOLDS[key] !== undefined)
    .reduce((sum, [key, value]) => sum + Math.abs(value) / Math.abs(STEEP_EFFECT_THRESHOLDS[key]), 0);
  for (const event of casualties) {
    const cost = pickDeferredCost(event, situationWeight(event), {});
    assert.ok(cost, `${event.id}: a set-aside lands something`);
    // Every band of the answer the charge is drawn from costs no more than
    // the set-aside: its worst band lands, and the deferral on top.
    const option = cost.option;
    for (const band of [option.effects, option.partialEffects, option.failureEffects].filter(Boolean)) {
      assert.ok(units(cost.effects) >= units(band) - 0.01,
        `${event.id}: set aside ${JSON.stringify(cost.effects)} is cheaper than "${option.label}" ${JSON.stringify(band)}`);
    }
  }
});
