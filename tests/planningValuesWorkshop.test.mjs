import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlanningJourney } from '../js/journey/factory.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import { startDay } from '../js/journey/dayPlan.js';
import {
  BALANCED_WORKSHOP_SURCHARGE,
  PLANNING_VALUES_FLOOR,
  VALUES_WORKSHOP_COST,
  applyLaneValueDrift,
  applyValuesConsequences,
  buildValuesWorkshopChoices,
  getValuesGateDeficits,
  getWeakestPlanningValue,
  processAction,
  runPlanningDay,
  updatePlanningMissionStatus,
} from '../js/modes/planning.js';

// The Values Workshop used to gate its Balanced Approach on having 5 of the
// day's 8 hours left. A day is one action now (js/journey/dayPlan.js), so
// every emphasis takes the same day and the balanced option pays for its
// spread out of the planner instead of out of a clock.

function makeJourney() {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === 'fraser-plateau');
  return createPlanningJourney({ roleId: 'planner', areaId: 'fraser-plateau', area });
}

function makeUi(pickValue) {
  const lines = [];
  const prompts = [];
  return {
    lines,
    prompts,
    write(text) { if (typeof text === 'string') lines.push(text); },
    writeHeader(text) { lines.push(text); },
    writeWarning(text) { lines.push(text); },
    writePositive(text) { lines.push(text); },
    writeDanger(text) { lines.push(text); },
    clear() {},
    updateAllStatus() {},
    setMissionStatus() {},
    async promptChoice(prompt, choices) {
      prompts.push({ prompt, choices });
      return pickValue(prompt, choices || []) || choices?.[0] || { value: undefined };
    },
  };
}

test('every values emphasis is on the table, balanced included, and Back leads out', () => {
  const choices = buildValuesWorkshopChoices();
  const values = choices.map((choice) => choice.value);

  assert.deepEqual(values, ['bio', 'timber_v', 'community', 'fn', 'balanced', 'values_back']);
  assert.equal(choices.at(-1).label, 'Back');
});

test('the balanced option advertises the whole day it costs, not only the surcharge', () => {
  const balanced = buildValuesWorkshopChoices().find((choice) => choice.value === 'balanced');
  const energy = VALUES_WORKSHOP_COST.energy + BALANCED_WORKSHOP_SURCHARGE.energy;
  const stress = VALUES_WORKSHOP_COST.stress + BALANCED_WORKSHOP_SURCHARGE.stress;

  assert.ok(balanced, 'Balanced Approach should always be offered');
  assert.match(balanced.description, new RegExp(`-${energy} energy`));
  assert.match(balanced.description, new RegExp(`\\+${stress} stress`));
});

test('the label is what the day actually costs', async () => {
  for (const choice of buildValuesWorkshopChoices().filter((entry) => entry.value !== 'values_back')) {
    const journey = makeJourney();
    journey.protagonist.energy = 100;
    journey.protagonist.stress = 0;
    const ui = makeUi((prompt, choices) => choices.find((entry) => entry.value === choice.value));
    startDay(journey);
    await processAction({ ui, journey }, 'values', null);
    const [, energy] = choice.description.match(/-(\d+) energy/);
    const [, stress] = choice.description.match(/\+(\d+) stress/);
    assert.equal(100 - journey.protagonist.energy, Number(energy), `${choice.label} energy`);
    assert.equal(journey.protagonist.stress, Number(stress), `${choice.label} stress`);
  }
});

test('no workshop choice is gated on a resource the day no longer tracks', () => {
  // buildValuesWorkshopChoices takes no arguments now; passing a stale hour
  // count must not quietly shrink the menu the way the old signature did.
  for (const stale of [0, 1, 4, 8]) {
    assert.equal(
      buildValuesWorkshopChoices(stale).length,
      6,
      `an ignored "${stale}" argument must not drop options`
    );
  }
});

test('the workshop shows the values before you pick, and Back leaves the day and the values alone', async () => {
  const journey = makeJourney();
  const before = { ...journey.values };
  const ui = makeUi((prompt, choices) => choices.find((entry) => entry.value === 'values_back'));
  startDay(journey);
  const outcome = await processAction({ ui, journey }, 'values', null);

  assert.deepEqual(outcome, { cancelled: true });
  assert.equal(journey.actionsRemaining, 1, 'the day is still open');
  assert.deepEqual(journey.values, before);
  assert.match(ui.prompts[0].prompt, /Biodiversity 50% \| Timber 50% \| Community 50% \| First Nations 50%/);
  assert.match(ui.prompts[0].prompt, new RegExp(`${PLANNING_VALUES_FLOOR}%`));
});

test('backing out of the workshop in the day loop returns to the card and the day goes on', async () => {
  const journey = makeJourney();
  let sawWorkshop = false;
  const ui = makeUi((prompt, choices) => {
    if (choices.some((entry) => entry.value === 'values_back')) {
      sawWorkshop = true;
      return choices.find((entry) => entry.value === 'values_back');
    }
    if (choices.some((entry) => entry.value === 'gather_data')) {
      return choices.find((entry) => entry.value === (sawWorkshop ? 'gather_data' : 'values'));
    }
    return choices[0];
  });
  await runPlanningDay({ ui, journey, gameOver: false });
  assert.ok(sawWorkshop);
  assert.ok(journey.plan.dataCompleteness > 0, 'the day went to the data after backing out');
  assert.equal(journey.values.biodiversity, 50);
  assert.equal(journey.day, 2);
});

test('the mission pane carries the weakest value against the floor', () => {
  const journey = makeJourney();
  journey.values.firstNationsValues = 33;
  const status = updatePlanningMissionStatus({ setMissionStatus() {} }, journey, null);
  const item = status.checklist.find((entry) => /^Weakest value/.test(entry.label));
  assert.ok(item);
  assert.equal(item.label, `Weakest value: First Nations 33% (needs ${PLANNING_VALUES_FLOOR}%)`);
  assert.equal(item.done, false);
});

test('the analysis and a Timber Supply Analysis wear the non-timber values down, and a session rebuilds some', () => {
  const journey = makeJourney();
  for (let day = 0; day < 4; day += 1) applyLaneValueDrift(journey, 'analyze');
  assert.ok(journey.values.biodiversity < 50 && journey.values.firstNationsValues < 50, 'the analysis thins the non-timber results');
  for (let day = 0; day < 3; day += 1) applyLaneValueDrift(journey, 'timber');
  assert.ok(journey.values.biodiversity < PLANNING_VALUES_FLOOR, `a timber-first file drops biodiversity under the floor (${journey.values.biodiversity})`);
  assert.ok(journey.values.timberSupply > 50);
  assert.deepEqual(getValuesGateDeficits(journey).map((entry) => entry.label), ['Biodiversity']);
  assert.equal(getWeakestPlanningValue(journey).label, 'Biodiversity');

  const community = journey.values.communityNeeds;
  applyLaneValueDrift(journey, 'stakeholder');
  assert.equal(journey.values.communityNeeds, community + 2);
});

test('a value under the floor blocks the engagement and costs the file every day until the workshop answers it', async () => {
  const journey = makeJourney();
  journey.plan.phase = 'stakeholder_review';
  journey.plan.stakeholderBuyIn = 50;
  journey.values.biodiversity = PLANNING_VALUES_FLOOR - 4;

  applyValuesConsequences(journey);
  assert.equal(journey.plan.stakeholderBuyIn, 48, 'the daily penalty is reachable now');

  const blockedUi = makeUi(() => null);
  startDay(journey);
  await processAction({ ui: blockedUi, journey }, 'stakeholder_blocked', null);
  assert.ok(blockedUi.lines.some((line) => /Recover these values first: Biodiversity 36%\/40%/.test(line)));

  const ui = makeUi((prompt, choices) => choices.find((entry) => entry.value === 'bio'));
  startDay(journey);
  await processAction({ ui, journey }, 'values', null);
  assert.equal(journey.values.biodiversity, PLANNING_VALUES_FLOOR + 4);
  assert.equal(getValuesGateDeficits(journey).length, 0);
  const buyIn = journey.plan.stakeholderBuyIn;
  applyValuesConsequences(journey);
  assert.equal(journey.plan.stakeholderBuyIn, buyIn, 'answered, the penalty stops');
});

test('a Nation whose values the draft ignores costs DM readiness at the decision', () => {
  const journey = makeJourney();
  journey.plan.phase = 'ministerial_approval';
  journey.plan.ministerialConfidence = 50;
  journey.values.firstNationsValues = 30;
  applyValuesConsequences(journey);
  assert.equal(journey.plan.ministerialConfidence, 48);
});
