import test from 'node:test';
import assert from 'node:assert/strict';

import { createPermittingJourney, createPlanningJourney } from '../js/journey/factory.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import {
  COMPLIANCE_REVIEW_SCRUTINY,
  applySelectedBlockImpact,
  getOutreachReadinessCap,
  getPlanningDecisionHolds,
  getPlanningSubmissionReadiness,
  processAction,
  runPlanningDay,
  syncFomStateFromActiveBlock,
  updatePlanningMissionStatus,
} from '../js/modes/planning.js';
import { getPlanningAreaBlockPool } from '../js/data/planningBlocks.js';
import { isPlanningApprovalReady } from '../js/modes/shared/endConditions.js';
import { PLANNING_SCRUTINY_GATE } from '../js/journey/constants.js';
import { queueFallout, takeDueFallout } from '../js/events/fallout.js';
import { startDay } from '../js/journey/dayPlan.js';
import { buildProtagonistEpilogue } from '../js/game/debrief.js';
import { buildVictoryNarrative } from '../js/game/endScreen.js';
import { calculateScore, formatScoreDisplay, rateDeskConduct, summarizeDeskConduct } from '../js/scoring.js';

function makeUi() {
  const lines = [];
  return {
    lines,
    write(text) { if (typeof text === 'string') lines.push(text); },
    writeHeader(text) { lines.push(text); },
    writeWarning(text) { lines.push(text); },
    writePositive(text) { lines.push(text); },
    writeDanger(text) { lines.push(text); },
    clear() {},
    updateAllStatus() {},
    setMissionStatus() {},
    async promptChoice(prompt, choices) { return choices?.[0] || { value: undefined }; },
  };
}

/** A file one Prepare Submission away from the District Manager's decision. */
function makeReadyFile() {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === 'fraser-plateau');
  const journey = createPlanningJourney({ roleId: 'planner', areaId: area.id, area });
  applySelectedBlockImpact(journey, getPlanningAreaBlockPool(journey.areaId)[0], 'access', null, []);
  journey.day = 14;
  journey.plan.phase = 'ministerial_approval';
  journey.plan.dataCompleteness = 90;
  journey.plan.analysisQuality = 90;
  journey.plan.stakeholderBuyIn = 80;
  journey.values = { biodiversity: 55, timberSupply: 55, communityNeeds: 55, firstNationsValues: 55 };
  journey.resources.budget = 200000;
  journey.resources.politicalCapital = 100;
  journey.professional.registrationStatus = 'active';
  journey.professional.cpdHours = journey.professional.cpdTarget;
  const fom = syncFomStateFromActiveBlock(journey, null);
  fom.status = 'closed';
  fom.commentLoad = 0;
  fom.reviewDaysRemaining = 0;
  fom.hydrologyReadiness = 100;
  journey.plan.ministerialConfidence = getOutreachReadinessCap(getPlanningSubmissionReadiness(journey, null));
  journey.scrutiny = 30;
  return journey;
}

async function submit(journey, ui = makeUi()) {
  startDay(journey);
  await processAction({ ui, journey }, 'submit', null);
  return ui;
}

test('an exposed file is not signed: scrutiny at the gate holds the decision until a compliance review brings it down', async () => {
  const journey = makeReadyFile();
  journey.scrutiny = PLANNING_SCRUTINY_GATE + 5;
  const readiness = journey.plan.ministerialConfidence;

  const ui = await submit(journey);
  assert.equal(journey.isComplete, false);
  assert.equal(journey.plan.ministerialConfidence, readiness, 'a held filing moves nothing');
  assert.ok(ui.lines.some((line) => /Submission blocked: .*scrutiny 80%/.test(line)), ui.lines.join('\n'));
  assert.equal(isPlanningApprovalReady({ ...journey, plan: { ...journey.plan, ministerialConfidence: 95 } }), false);

  // The hold is a gate condition on the mission pane, with its remedy named.
  const status = updatePlanningMissionStatus(makeUi(), journey, null);
  assert.ok(status.checklist.some((item) => /Scrutiny 80% \(the District Manager decides under 75%\)/.test(item.label) && !item.done));
  assert.match(status.guidance, /District Compliance Review/);

  startDay(journey);
  await processAction({ ui: makeUi(), journey }, 'compliance_review', null);
  assert.equal(journey.scrutiny, PLANNING_SCRUTINY_GATE + 5 - COMPLIANCE_REVIEW_SCRUTINY);
  assert.deepEqual(getPlanningDecisionHolds(journey), []);

  await submit(journey);
  assert.equal(journey.isComplete, true, 'under the gate the file is decided on its merits');
});

test('a plan is not approved while a regulator has an open file on one of its shortcuts', async () => {
  const journey = makeReadyFile();
  queueFallout(journey, {
    actId: 'planner-fabricate-wildlife-report',
    title: 'Invent the Winter Range Survey',
    institution: 'FPB',
    dueIn: 4,
    effects: { compliance: -8, scrutiny: 12 },
  });
  const [hold] = getPlanningDecisionHolds(journey);
  assert.match(hold.reason, /Forest Practices Board has an open file on “Invent the Winter Range Survey” \(lands Day 18\)/);

  const ui = await submit(journey);
  assert.equal(journey.isComplete, false);
  assert.ok(ui.lines.some((line) => /open file on “Invent the Winter Range Survey”/.test(line)));
  const status = updatePlanningMissionStatus(makeUi(), journey, null);
  assert.ok(status.checklist.some((item) => /^Open file: /.test(item.label) && !item.done));

  // The report lands on its day; the file can then be decided.
  journey.day = 18;
  assert.ok(takeDueFallout(journey));
  await submit(journey);
  assert.equal(journey.isComplete, true);
});

test('the compliance review is offered only when the file is at the gate', async () => {
  for (const [scrutiny, offered] of [[40, false], [PLANNING_SCRUTINY_GATE, true]]) {
    const journey = makeReadyFile();
    journey.scrutiny = scrutiny;
    let options = null;
    const ui = {
      ...makeUi(),
      async promptChoice(prompt, choices) {
        if (!options && choices?.some((choice) => choice.value === 'end')) options = choices;
        return choices?.find((choice) => choice.value === 'end') || choices?.[0] || { value: undefined };
      },
    };
    const original = Math.random;
    Math.random = () => 0.999;
    try {
      await runPlanningDay({ ui, journey, checkpoint() {} });
    } finally {
      Math.random = original;
    }
    assert.equal(options.some((option) => option.value === 'compliance_review'), offered, `scrutiny ${scrutiny}`);
  }
});

function logShortcut(journey, band, day = 7) {
  journey.log.push({ day, type: 'event', eventId: 'temptation_planner-fabricate-wildlife-report', eventTitle: 'Invent the Winter Range Survey', optionLabel: 'Take the shortcut', band, effects: {} });
}

test('the closing epilogue reads the run\'s conduct, not only its stress', () => {
  // A clean file that ends stressed on the filing day is still a clean file.
  const clean = makeReadyFile();
  clean.protagonist.stress = 70;
  clean.log.push({ day: 4, type: 'event', eventId: 'temptation_x', eventTitle: 'x', optionLabel: 'Document and report', effects: { compliance: 2 } });
  const [cleanLine] = buildProtagonistEpilogue(clean, true);
  assert.doesNotMatch(cleanLine, /flinch/);
  assert.equal(rateDeskConduct(summarizeDeskConduct(clean)), 'clean');

  // A calm run that was caught is not the one the district calls for work
  // done properly.
  const caught = makeReadyFile();
  caught.protagonist.stress = 10;
  logShortcut(caught, 'bad');
  const [caughtLine] = buildProtagonistEpilogue(caught, true);
  assert.doesNotMatch(caughtLine, /done properly/);
  assert.match(caughtLine, /finding with your name/);

  // An unlawful answer on an ordinary card counts the same way.
  const quiet = makeReadyFile();
  quiet.log.push({ day: 9, type: 'event', eventId: 'special_use_permit_bundle', eventTitle: 'Special Use Permit Bundle', optionLabel: 'Use the sites without the permit and hope nobody notices', offBook: true, band: 'good', effects: { compliance: -8 } });
  assert.equal(summarizeDeskConduct(quiet).taken, 1);
  assert.doesNotMatch(buildProtagonistEpilogue(quiet, true)[0], /done properly/);
});

test('the approval narrative praises engagement only when the run earned it', () => {
  const clean = makeReadyFile();
  assert.match(buildVictoryNarrative(clean, 'Fraser Plateau', 'You', 20), /engagement with the Nations and the public/);

  const letters = makeReadyFile();
  letters.log.push({ day: 5, type: 'event', eventId: 'first_nations_consultation', eventTitle: 'First Nations Engagement', optionLabel: 'Send information-sharing letters only (minimal engagement)', band: 'bad', effects: { relationships: -12, reputation: -8 } });
  assert.doesNotMatch(buildVictoryNarrative(letters, 'Fraser Plateau', 'You', 20), /engagement with the Nations|careful balancing/);

  const caught = makeReadyFile();
  logShortcut(caught, 'bad');
  caught.scrutiny = 100;
  assert.match(buildVictoryNarrative(caught, 'Fraser Plateau', 'You', 21), /what is on the file about how it got there/);
});

test('a desk run answers in the grade for the shortcuts that were noticed or caught', () => {
  const journey = createPermittingJourney({ roleId: 'permitter', areaId: 'bulkley-valley' });
  const cleanScore = calculateScore(journey, true);
  assert.equal(cleanScore.integrityPenalty, 0);

  logShortcut(journey, 'bad', 5);
  logShortcut(journey, 'partial', 8);
  const score = calculateScore(journey, true);
  assert.equal(score.integrityPenalty, 11);
  assert.ok(formatScoreDisplay(score).some((line) => /Integrity\s+-11 for shortcuts that were noticed or caught/.test(line)));
});
