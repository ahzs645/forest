import test from 'node:test';
import assert from 'node:assert/strict';

import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { createPlanningJourney, createReconJourney } from '../js/journey/factory.js';
import { runDaySituation } from '../js/journey/daySituation.js';
import { isImposedSituation, pickDeferredCost } from '../js/events/deferral.js';
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
  assert.equal(pickDeferredCost(budgetCut, 2).option.label, 'Accept and adjust plans',
    'the certain option is the default, never a gamble\'s hoped-for band');

  const ui = makeUi();
  const outcome = await runDaySituation({ ui, journey, gameOver: false }, budgetCut, {});

  assert.equal(outcome.setAside, true);
  assert.equal(journey.resources.budget, budgetBefore - 8000, 'the cut lands anyway');
  assert.equal(journey.plan.dataCompleteness, 54, 'so does the survey it defers');
  assert.equal(journey.scrutiny, 32);
  assert.equal(journey.protagonist.stress, stressBefore + 2);

  const shown = textAfterDeferral(ui);
  assert.match(shown, /It lands anyway — the least of it:/);
  assert.match(shown, /Budget: -\$8,000/);
  assert.match(shown, /Data readiness slipped \(-6%\)/);
  assert.match(shown, /Scrutiny \+2; it sits with you \(stress \+2\)/);
  assert.deepEqual(ui.prompts.at(-1), ['Take the day back'], 'the cost waits to be acknowledged');

  const entry = journey.log.at(-1);
  assert.equal(entry.type, 'event');
  assert.equal(entry.eventId, 'budget_cut');
  assert.equal(entry.optionLabel, 'Set it aside');
  assert.equal(entry.setAside, true);
  assert.deepEqual(entry.effects, { budget: -8000, data: -6, scrutiny: 2 });
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

test('an imposed situation made only of gambles lands the least-bad failure band', () => {
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
  assert.deepEqual(cost.effects, { compliance: -6 });
});
