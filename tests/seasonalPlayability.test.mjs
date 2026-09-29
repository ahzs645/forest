import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advancePaperworkChain,
  getPaperworkChainProgress,
} from '../js/data/professionalPractice.js';
import { FORESTER_ROLES, OPERATING_AREAS } from '../js/data/index.js';
import { TuiGameController } from '../tui/controller.js';
import { makeRng } from '../js/engine/rng.js';
import {
  applyRoundConsequences,
  buildAssignmentCandidates,
  buildSeasonContext,
  createInitialState,
  drawIssue,
} from '../js/engine.js';

test('pushing a process card through leaves the rushed-package flag for the deficiency notice', () => {
  const state = createInitialState({ companyName: 'T', roleId: 'permitter', areaId: 'fort-st-john-plateau' });
  state.round = 2;
  const context = buildSeasonContext(state);
  state.currentSeasonContext = context;
  const processCard = buildAssignmentCandidates(state, context).find((card) => card.sourceFamily === 'process');
  const aggressive = processCard.options.find((option) => option.stance === 'aggressive');
  assert.equal(aggressive.setFlags?.rushJob, true);

  state.flags.rushJob = true;
  const seen = new Set();
  const rng = makeRng(11);
  for (let draw = 0; draw < 60; draw += 1) {
    seen.add(drawIssue(structuredClone(state), rng, { advancePending: false })?.id);
  }
  assert.ok(seen.has('permit-deficiency'), 'the deficiency notice should be drawable once its flag is set');
});

test('a budget run into the ground puts the emergency-loan decision on the desk', () => {
  const state = createInitialState({ companyName: 'T', roleId: 'planner', areaId: 'kootenay-wetbelt' });
  state.round = 3;
  state.metrics.budget = 18;
  applyRoundConsequences(state);
  assert.equal(state.flags.budgetEmergencyScheduled, true);

  state.metrics.budget = 60;
  applyRoundConsequences(state);
  assert.equal(state.flags.budgetEmergencyScheduled, undefined);
});

test('advancing a paperwork chain moves the stored stage, not a stale copy', () => {
  const planner = FORESTER_ROLES.find((role) => role.id === 'planner');
  const state = { role: planner, area: OPERATING_AREAS[3] };
  assert.equal(getPaperworkChainProgress(state, 'fom-notice-cycle').state.stageIndex, 0);

  const result = advancePaperworkChain(state, 'fom-notice-cycle', { day: 1 });
  assert.equal(result.advanced, true);

  const after = getPaperworkChainProgress(state, 'fom-notice-cycle');
  assert.equal(after.state.stageIndex, 1);
  assert.equal(after.stage.id, 'response');
  assert.equal(state.professional.paperworkChains.find((chain) => chain.id === 'fom-notice-cycle').stageIndex, 1);
});

test('a balanced answer on a seasonal chain card brings the next stage with its own options', () => {
  const controller = new TuiGameController({ rng: makeRng(7), storage: null, onExit() {} });
  controller.setInputText('T');
  controller.submitCurrent();
  controller.selectOption(0); // Strategic Planner
  controller.selectOption(3); // Fraser Plateau

  const chainCards = [];
  for (let guard = 0; guard < 200 && controller.getState().mode !== 'end'; guard += 1) {
    const view = controller.getState();
    const data = view.contentData;
    if (data.type === 'assignment' && /FOM Notice/.test(data.title)) {
      chainCards.push({ round: controller.gs.round, options: [...view.options] });
    }
    controller.selectOption(data.type === 'assignment' ? 1 : 0);
  }

  assert.ok(chainCards.length >= 2, 'the FOM chain should return for its second stage');
  assert.match(chainCards[0].options[0], /Post the FOM notice/);
  assert.match(chainCards[1].options[0], /Answer every comment/);
  const chain = controller.gs.professional.paperworkChains.find((entry) => entry.id === 'fom-notice-cycle');
  assert.ok(chain.stageIndex >= 1);
});
