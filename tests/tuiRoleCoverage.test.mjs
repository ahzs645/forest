import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptIllegalActTemptation,
  applyOptionOutcome,
  buildSeasonContext,
  createInitialState,
  drawSeasonalAssignment,
  drawIssue,
  drawSeasonalEvent,
  recordAssignmentSelection,
} from '../js/engine.js';
import { ILLEGAL_ACTS } from '../js/data/illegalActs.js';

const ROLE_FIXTURES = [
  {
    roleId: 'planner',
    areaId: 'bulkley-valley',
    eventFlavor: /Adapted desk event/i,
    temptationFlavor: /Bureaucratic shortcut/i,
    actId: 'black-market-timber-maps',
    failMetrics: { compliance: 20, progress: 20 },
    expectedIssueIds: ['ministry-data-audit'],
  },
  {
    roleId: 'permitter',
    areaId: 'bulkley-valley',
    eventFlavor: /Adapted desk event/i,
    temptationFlavor: /Bureaucratic shortcut/i,
    actId: 'courtesy-flag-bribes',
    failMetrics: { relationships: 20, compliance: 25 },
    expectedIssueIds: ['heritage-protocol-gap', 'archaeology-escalation-pause'],
  },
  {
    roleId: 'recce',
    areaId: 'muskwa-foothills',
    eventFlavor: /Adapted field event/i,
    temptationFlavor: /Field desperation/i,
    actId: 'bribed-hazard-flags',
    failMetrics: { forestHealth: 20, relationships: 25, compliance: 35 },
    expectedIssueIds: ['wildlife-collar-drop'],
  },
  {
    roleId: 'silviculture',
    areaId: 'muskwa-foothills',
    eventFlavor: /Adapted field event/i,
    temptationFlavor: /Field desperation/i,
    actId: 'seedling-switcheroo',
    failMetrics: { forestHealth: 20, progress: 30, compliance: 35 },
    expectedIssueIds: ['seedlot-vigour-drop', 'free-growing-catchup-plan'],
  },
];

test('all TUI roles reflect their updated event and temptation domains', () => {
  for (const fixture of ROLE_FIXTURES) {
    const state = createInitialState({
      companyName: `${fixture.roleId} domain coverage`,
      roleId: fixture.roleId,
      areaId: fixture.areaId,
    });
    state.round = 2;

    const event = drawSeasonalEvent(state, () => 0);
    assert.ok(event, `expected seasonal event for ${fixture.roleId}`);
    assert.match(event.flavor, fixture.eventFlavor, `unexpected event flavor for ${fixture.roleId}`);

    const act = ILLEGAL_ACTS.find((entry) => entry.id === fixture.actId);
    assert.ok(act, `missing act fixture ${fixture.actId}`);
    const temptation = adaptIllegalActTemptation(act, state, () => 0.5);
    assert.match(temptation.flavor, fixture.temptationFlavor, `unexpected temptation flavor for ${fixture.roleId}`);
  }
});

test('all TUI roles surface role-specific fallout after failed shortcuts', () => {
  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    for (const fixture of ROLE_FIXTURES) {
      const state = createInitialState({
        companyName: `${fixture.roleId} fallout coverage`,
        roleId: fixture.roleId,
        areaId: fixture.areaId,
      });
      state.round = 3;
      state.metrics = { ...state.metrics, ...fixture.failMetrics };

      const act = ILLEGAL_ACTS.find((entry) => entry.id === fixture.actId);
      assert.ok(act, `missing act fixture ${fixture.actId}`);
      const temptation = adaptIllegalActTemptation(act, state, () => 0.5);
      const riskyOption = temptation.options.find((option) => option.risk);
      assert.ok(riskyOption, `missing risky option for ${fixture.roleId}`);

      const resolution = applyOptionOutcome(state, riskyOption, {
        type: 'temptation',
        id: temptation.id,
        title: temptation.title,
        option: riskyOption.label,
        round: state.round,
      });

      assert.equal(resolution.riskResult.success, false, `expected failed shortcut for ${fixture.roleId}`);
      const issue = drawIssue(state, () => 0);
      assert.ok(
        fixture.expectedIssueIds.includes(issue?.id),
        `unexpected fallout issue for ${fixture.roleId}: ${issue?.id}`,
      );
    }
  } finally {
    Math.random = originalRandom;
  }
});

test('all TUI roles now source normal-season assignments from the seasonal data families', () => {
  const allowedFamiliesByRole = {
    planner: ['briefing', 'planning', 'process', 'situation', 'professional', 'road'],
    permitter: ['briefing', 'process', 'road', 'situation', 'professional'],
    recce: ['briefing', 'road', 'situation', 'discovery', 'professional'],
    silviculture: ['briefing', 'situation', 'discovery', 'professional', 'road'],
  };

  for (const fixture of ROLE_FIXTURES) {
    const state = createInitialState({
      companyName: `${fixture.roleId} assignment coverage`,
      roleId: fixture.roleId,
      areaId: fixture.areaId,
    });

    const families = [];
    for (let round = 1; round <= 4; round++) {
      state.round = round;
      const context = buildSeasonContext(state);
      state.currentSeasonContext = context;
      const assignment = drawSeasonalAssignment(state, context);

      assert.ok(assignment, `expected seasonal assignment for ${fixture.roleId} in round ${round}`);
      assert.notEqual(assignment.sourceFamily, 'legacy-task', `unexpected legacy fallback for ${fixture.roleId}`);
      assert.ok(
        allowedFamiliesByRole[fixture.roleId].includes(assignment.sourceFamily),
        `unexpected assignment family for ${fixture.roleId}: ${assignment.sourceFamily}`,
      );

      recordAssignmentSelection(state, assignment);
      families.push(assignment.sourceFamily);
    }

    assert.ok(new Set(families).size >= 2, `expected assignment variety for ${fixture.roleId}`);
  }
});
