import test from 'node:test';
import assert from 'node:assert/strict';

import { ISSUE_LIBRARY } from '../js/data/issues.js';
import { createInitialState, drawIssue, scoreIssueSelection, SEASONS } from '../js/engine.js';
import {
  matchesPreconditions,
  normalizeSeasonalCard,
  validateSeasonalCardContract,
} from '../js/engine/seasonalContract.js';

function createSeasonalState(roleId, round = 1, areaId = 'bulkley-valley') {
  const defaultAreaByRole = {
    planner: 'bulkley-valley',
    permitter: 'bulkley-valley',
    recce: 'muskwa-foothills',
    silviculture: 'fraser-plateau',
  };

  const state = createInitialState({
    companyName: 'Seasonal Contract Test',
    roleId,
    areaId: areaId || defaultAreaByRole[roleId] || 'bulkley-valley',
  });
  state.round = round;
  return state;
}

const CORE_ROLES = ['planner', 'permitter', 'recce', 'silviculture'];

test('core TUI roles have at least one exclusive issue in every season', () => {
  for (const roleId of CORE_ROLES) {
    for (const season of SEASONS) {
      const matches = ISSUE_LIBRARY.filter(
        (issue) =>
          issue.roles?.length === 1 &&
          issue.roles[0] === roleId &&
          Array.isArray(issue.seasonBias) &&
          issue.seasonBias.includes(season),
      );

      assert.ok(matches.length >= 1, `${roleId} is missing an exclusive issue for ${season}`);
    }
  }
});

test('issue scoring favors specialty-specific and season-aligned scenarios', () => {
  const state = createInitialState({
    companyName: 'Selection Test Co.',
    roleId: 'planner',
    areaId: 'bulkley-valley',
  });
  const context = {
    tags: state.area.tags,
    season: 'Spring Planning',
  };

  const sharedCrossRole = ISSUE_LIBRARY.find((issue) => issue.id === 'special-use-permit-stack');
  const exclusivePlanner = ISSUE_LIBRARY.find((issue) => issue.id === 'highway-16-viewshed-redesign');

  assert.ok(sharedCrossRole, 'expected a shared cross-role issue fixture');
  assert.ok(exclusivePlanner, 'expected an exclusive planner issue fixture');

  const offSeasonClone = {
    ...exclusivePlanner,
    seasonBias: ['Winter Review'],
  };

  const exclusiveWeight = scoreIssueSelection(exclusivePlanner, state, context);
  const sharedWeight = scoreIssueSelection(sharedCrossRole, state, context);
  const offSeasonWeight = scoreIssueSelection(offSeasonClone, state, context);

  assert.ok(exclusiveWeight > sharedWeight, 'exclusive issue should outrank broad shared issue');
  assert.ok(exclusiveWeight > offSeasonWeight, 'season-aligned issue should outrank off-season variant');
});

test('seasonal issues normalize into contract-complete cards', () => {
  for (const issue of ISSUE_LIBRARY) {
    const state = createSeasonalState(issue.roles?.[0] || 'planner');
    const normalized = normalizeSeasonalCard(issue, state, 'issue');
    const violations = validateSeasonalCardContract(normalized);

    assert.deepEqual(violations, [], `contract violations for ${issue.id}: ${violations.join(', ')}`);
  }
});

test('issue preconditions are satisfiable for at least one listed role and season', () => {
  const constrainedIssues = ISSUE_LIBRARY.filter((issue) => issue.preconditions);

  for (const issue of constrainedIssues) {
    let satisfiable = false;

    for (const roleId of issue.roles || []) {
      for (let round = 1; round <= 4; round++) {
        const state = createSeasonalState(roleId, round);
        if (matchesPreconditions(issue, state)) {
          satisfiable = true;
          break;
        }
      }
      if (satisfiable) break;
    }

    assert.ok(satisfiable, `expected a satisfiable role/season combination for ${issue.id}`);
  }
});

test('silviculture survey and winter-review issues stay gated by stage and stand age', () => {
  const surveyIssue = ISSUE_LIBRARY.find((issue) => issue.id === 'free-growing-catchup-plan');
  const winterIssue = ISSUE_LIBRARY.find((issue) => issue.id === 'snow-press-browse-signal');

  assert.ok(surveyIssue, 'expected free-growing-catchup-plan fixture');
  assert.ok(winterIssue, 'expected snow-press-browse-signal fixture');

  const springState = createSeasonalState('silviculture', 1, 'fraser-plateau');
  const fallState = createSeasonalState('silviculture', 3, 'fraser-plateau');
  const winterState = createSeasonalState('silviculture', 4, 'fraser-plateau');

  assert.equal(matchesPreconditions(surveyIssue, springState), false);
  assert.equal(matchesPreconditions(surveyIssue, fallState), true);
  assert.equal(matchesPreconditions(surveyIssue, winterState), false);
  assert.equal(matchesPreconditions(winterIssue, fallState), false);
  assert.equal(matchesPreconditions(winterIssue, winterState), true);
});

test('flag-gated pending audit issue only resolves once the trigger flag is present', () => {
  const state = createSeasonalState('planner', 4, 'bulkley-valley');

  assert.equal(
    ISSUE_LIBRARY.some((issue) => issue.id === 'fpbc-competence-audit'),
    true,
    'expected fpbc-competence-audit fixture',
  );

  state.pendingIssues = [{ id: 'fpbc-competence-audit', delay: 0 }];
  assert.notEqual(drawIssue(state, () => 0)?.id, 'fpbc-competence-audit');

  state.flags.professionalAuditActive = true;
  state.pendingIssues = [{ id: 'fpbc-competence-audit', delay: 0 }];
  assert.equal(drawIssue(state, () => 0)?.id, 'fpbc-competence-audit');
});

test('spring breakup hauling issues keep a viable defer-or-stand-down response', () => {
  const state = createSeasonalState('recce', 1, 'fort-st-john-plateau');
  state.pendingIssues = [{ id: 'peatland-subsidence', delay: 0 }];

  const issue = drawIssue(state, () => 0);
  assert.ok(issue, 'expected peatland-subsidence to resolve from pending issues');
  assert.ok(
    issue.options.some((option) => /suspend hauling until freeze-up/i.test(option.label)),
    'expected a defer-or-stand-down response for peatland breakup hauling risk',
  );
});
