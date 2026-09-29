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

function makeHubUi() {
  const lines = [];
  const ui = {
    lines,
    mission: null,
    clear() { lines.length = 0; },
    write(text) { lines.push(String(text)); },
    writeHeader(text) { lines.push(`# ${text}`); },
    writeDivider(text) { lines.push(`-- ${text}`); },
    writeWarning(text) { lines.push(String(text)); },
    writeDanger(text) { lines.push(String(text)); },
    setMissionStatus(status) { ui.mission = status; },
    async promptChoice() { return { value: 0 }; },
  };
  return ui;
}

test('the hub renders the mission brief, keeps body lines apart, and does not repeat alerts', async () => {
  const { promptSeasonalCard, renderMetricStrip } = await import('../js/game/seasonalAdapter.js');
  const ui = makeHubUi();
  await promptSeasonalCard(ui, {
    title: 'Why This Happened',
    body: '• Stands recovering\n  Why: Compliance stayed strong.\n  This season: Forest Health +3',
    mission: { goal: 'Finish the year strong.', steps: ['Pick one response.'], mandate: 'Keep compliance stable.', win: 'Defensible plan' },
  }, ['Continue']);
  assert.ok(ui.lines.includes('• Stands recovering'));
  assert.ok(ui.lines.includes('  Why: Compliance stayed strong.'));
  assert.ok(ui.lines.includes('-- YOUR MISSION'));
  assert.ok(ui.lines.includes('Goal: Finish the year strong.'));
  assert.ok(ui.lines.includes('Win: Defensible plan'));

  renderMetricStrip(ui, {
    metrics: { progress: 30, forestHealth: 50, relationships: 50, compliance: 50, budget: 20 },
    round: 2,
    objectiveStrip: {
      goal: 'Goal',
      pressure: 'budget low',
      risks: [{ metric: 'budget', label: 'budget low' }, { metric: 'progress', label: 'progress behind' }],
    },
  });
  assert.equal(ui.mission.guidance, 'budget low');
  assert.deepEqual(ui.mission.alerts.map((alert) => alert.text), ['progress behind']);
});

test('the seasonal role card says why General Manager is not offered', () => {
  const controller = new TuiGameController({ storage: null, onExit() {} });
  controller.setInputText('T');
  controller.submitCurrent();
  const view = controller.getState();
  assert.ok(!view.options.includes('General Manager'));
  assert.match(view.contentData.note, /General Manager is not in Seasonal Strategy/);
});

test('the hub journey log reads the seasonal year', async () => {
  const { buildSeasonalLogEntries } = await import('../js/game/seasonalAdapter.js');
  const controller = new TuiGameController({ rng: makeRng(5), storage: null, onExit() {} });
  controller.setInputText('T');
  controller.submitCurrent();
  controller.selectOption(0);
  controller.selectOption(0);
  for (let step = 0; step < 8; step += 1) controller.selectOption(0);
  const entries = buildSeasonalLogEntries(controller.gs);
  assert.ok(entries.length >= 3, 'decisions so far should be in the log');
  assert.ok(entries.every((entry) => entry.dayLabel === 'Season' && entry.summary));
});

test('season-bound events and issues only surface in their season', async () => {
  const { drawSeasonalEvent, getOperationalEventLibrary } = await import('../js/engine/content.js');
  const { ISSUE_LIBRARY, CHAINED_ISSUES } = await import('../js/data/index.js');
  const allIssueIds = [...ISSUE_LIBRARY, ...CHAINED_ISSUES].map((issue) => issue.id);

  const drawOnly = (round, kind, id) => {
    const state = createInitialState({ companyName: 'T', roleId: 'recce', areaId: 'fraser-plateau' });
    state.round = round;
    if (kind === 'event') {
      const others = getOperationalEventLibrary(state).map((event) => event.id).filter((eventId) => eventId !== id);
      return drawSeasonalEvent(state, makeRng(3), { advancePending: false, excludeIds: others })?.id || null;
    }
    const others = allIssueIds.filter((issueId) => issueId !== id);
    return drawIssue(state, makeRng(3), { advancePending: false, excludeIds: others })?.id || null;
  };

  assert.equal(drawOnly(2, 'event', 'extreme_cold'), null, 'no -30C cold snap in summer');
  assert.equal(drawOnly(4, 'event', 'extreme_cold'), 'extreme_cold');
  assert.equal(drawOnly(4, 'issue', 'wildfire-heat-dome'), null, 'no heat dome in winter');
  assert.equal(drawOnly(2, 'issue', 'wildfire-heat-dome'), 'wildfire-heat-dome');
});
