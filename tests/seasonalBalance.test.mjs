import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyOptionOutcome,
  applyRoundConsequences,
  buildSeasonContext,
  buildSummary,
  createInitialState,
  drawIssue,
  drawSeasonalAssignment,
  drawSeasonalEvent,
  drawSeasonalTemptation,
  recordAssignmentSelection,
} from '../js/engine.js';

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function cloneState(state) {
  return globalThis.structuredClone
    ? structuredClone(state)
    : JSON.parse(JSON.stringify(state));
}

function chooseOption(card, strategy) {
  if (!Array.isArray(card?.options) || !card.options.length) {
    return null;
  }

  if (strategy === 'aggressive') {
    return card.options.find((option) => option.risk) || card.options[card.options.length - 1];
  }

  return card.options[0];
}

function playSeason(roleId, areaId, strategy, seed) {
  const state = createInitialState({
    companyName: 'Seasonal Balance Sweep',
    roleId,
    areaId,
  });
  const rng = createRng(seed);
  const issueIds = [];

  for (let round = 1; round <= 4; round++) {
    state.round = round;
    const context = buildSeasonContext(state);
    state.currentSeasonContext = context;
    state.seasonContexts.push(context);

    const previewIssue = drawIssue(cloneState(state), () => 0);
    const crisisRound = previewIssue?.surfaceSeverity === 'danger';
    const cards = [];

    if (crisisRound) {
      const issue = drawIssue(state, rng);
      if (issue) cards.push(['issue', issue]);
    } else {
      const assignment = drawSeasonalAssignment(state, context, rng);
      if (assignment) {
        recordAssignmentSelection(state, assignment);
        cards.push(['assignment', assignment]);
      }

      const event = drawSeasonalEvent(state, rng);
      if (event) cards.push(['event', event]);

      const temptation = drawSeasonalTemptation(state, rng);
      if (temptation) cards.push(['temptation', temptation]);

      const issue = drawIssue(state, rng);
      if (issue) cards.push(['issue', issue]);
    }

    for (const [type, card] of cards) {
      const option = chooseOption(card, strategy);
      if (!option) continue;

      applyOptionOutcome(state, option, {
        type,
        id: card.id,
        title: card.title,
        option: option.label,
        round,
      });

      if (type === 'issue') {
        issueIds.push(card.id);
      }
    }

    applyRoundConsequences(state);
    state.timeline.push({
      round,
      season: context.season,
      metrics: { ...state.metrics },
    });
  }

  return {
    metrics: { ...state.metrics },
    issueIds,
    summary: buildSummary(state),
  };
}

test('responsible play is viable while aggressive play collapses into weaker endings', () => {
  const scenarios = [
    ['planner', 'bulkley-valley'],
    ['permitter', 'skeena-nass'],
    ['recce', 'muskwa-foothills'],
    ['silviculture', 'fraser-plateau'],
    ['planner', 'vancouver-island-coast'],
    ['silviculture', 'okanagan-shuswap-drybelt'],
  ];

  const responsibleRuns = scenarios.map(([roleId, areaId], index) =>
    playSeason(roleId, areaId, 'responsible', 20260411 + index),
  );
  const aggressiveRuns = scenarios.map(([roleId, areaId], index) =>
    playSeason(roleId, areaId, 'aggressive', 20260511 + index),
  );

  const responsibleStrongCount = responsibleRuns.filter((run) =>
    /Outstanding season|Solid performance/.test(run.summary.overall),
  ).length;
  const aggressiveCollapseCount = aggressiveRuns.filter((run) =>
    /Operations stumbled/.test(run.summary.overall),
  ).length;

  const responsibleComplianceAverage = responsibleRuns.reduce((sum, run) => sum + run.metrics.compliance, 0) / responsibleRuns.length;
  const aggressiveComplianceAverage = aggressiveRuns.reduce((sum, run) => sum + run.metrics.compliance, 0) / aggressiveRuns.length;
  const responsibleRelationshipAverage = responsibleRuns.reduce((sum, run) => sum + run.metrics.relationships, 0) / responsibleRuns.length;
  const aggressiveRelationshipAverage = aggressiveRuns.reduce((sum, run) => sum + run.metrics.relationships, 0) / aggressiveRuns.length;
  const uniqueResponsibleIssues = new Set(responsibleRuns.flatMap((run) => run.issueIds));

  assert.ok(
    responsibleStrongCount >= 4,
    `expected most responsible runs to end strongly, saw ${responsibleStrongCount} of ${responsibleRuns.length}`,
  );
  assert.equal(
    aggressiveCollapseCount,
    aggressiveRuns.length,
    'aggressive play should not be the reliable route to a good ending',
  );
  assert.ok(
    responsibleComplianceAverage > aggressiveComplianceAverage,
    'responsible play should protect compliance better than aggressive play',
  );
  assert.ok(
    responsibleRelationshipAverage > aggressiveRelationshipAverage,
    'responsible play should protect relationships better than aggressive play',
  );
  assert.ok(
    uniqueResponsibleIssues.size >= 12,
    `expected broad issue diversity across roles and areas, saw ${uniqueResponsibleIssues.size} unique issues`,
  );
});
