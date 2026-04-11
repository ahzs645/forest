import test from 'node:test';
import assert from 'node:assert/strict';

import { ISSUE_LIBRARY } from '../js/data/issues.js';
import { createInitialState, scoreIssueSelection, SEASONS } from '../js/engine.js';

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
