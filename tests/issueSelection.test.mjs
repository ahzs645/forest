import test from 'node:test';
import assert from 'node:assert/strict';

import { ISSUE_LIBRARY } from '../js/data/issues.js';
import { CHAINED_ISSUES } from '../js/data/chainedIssues.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import { makeRng } from '../js/engine/rng.js';
import { PLACE_NAME_PATTERN } from '../scripts/lint-seasonal-content.mjs';
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
    seasonBias: ['Winter Operations'],
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

test('season-locked issues never surface outside the season their copy describes', () => {
  const locked = ISSUE_LIBRARY.filter((issue) => issue.seasonLock);
  assert.ok(locked.length > 0, 'some cards opt into the hard season gate');

  for (const issue of locked) {
    assert.ok(Array.isArray(issue.seasonBias) && issue.seasonBias.length,
      `${issue.id} declares the seasons it belongs to`);
  }

  const iceRoad = ISSUE_LIBRARY.find((issue) => issue.id === 'ice-road-window');
  assert.ok(iceRoad, 'the mid-winter ice-bridge card is still in the library');

  // Spring: the winter-only card must not be drawable at all.
  const springDraws = new Set();
  for (let i = 0; i < 400; i += 1) {
    const springState = createSeasonalState('recce', 1, 'fort-st-john-plateau');
    let seed = i + 1;
    const rng = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const card = drawIssue(springState, rng);
    if (card?.id) springDraws.add(card.id);
  }
  assert.equal(springDraws.has('ice-road-window'), false,
    'a mid-winter crisis does not open the spring season');
});

// ── Region gating ───────────────────────────────────────────────────────────
// Place-named cards used to leak across the province: a planner in the
// Okanagan got "Smithers issues a turbidity advisory" because the near-universal
// "northern-bc" tag counted as an area match. Cards that name a place now
// declare `areaIds`, and the generic tags earn no relevance bonus.

const AREA_PLACE_WORDS = {
  'fort-st-john-plateau': [/Peace River/, /\bBWBS\b/, /Fort St\. John/],
  'muskwa-foothills': [/Peace River/, /\bBWBS\b/, /Fort Nelson/],
  'bulkley-valley': [/Smithers/, /Highway 16/, /Bulkley/, /\bSBS\b/],
  'fraser-plateau': [/Lheidli/, /Prince George/, /\bSBS\b/],
  'skeena-nass': [/Skeena/, /\bNass\b/, /Terrace/],
  'tahltan-highland': [/Stikine/, /Tahltan/, /Dease/, /\bSWB\b/],
  'vancouver-island-coast': [/Alberni/],
  'kootenay-wetbelt': [/Kootenay/],
  'okanagan-shuswap-drybelt': [/Okanagan/],
};

function namesForeignPlace(text, areaId) {
  const match = String(text || '').match(PLACE_NAME_PATTERN);
  if (!match) return null;
  const allowed = AREA_PLACE_WORDS[areaId] || [];
  return allowed.some((re) => re.test(match[0])) ? null : match[0];
}

test('areaIds is a hard gate: a Bulkley viewshed card never draws in the Okanagan', () => {
  const viewshed = ISSUE_LIBRARY.find((issue) => issue.id === 'highway-16-viewshed-redesign');
  assert.deepEqual(viewshed.areaIds, ['bulkley-valley']);

  const okanagan = createSeasonalState('planner', 1, 'okanagan-shuswap-drybelt');
  okanagan.pendingIssues = [{ id: 'highway-16-viewshed-redesign', delay: 0, force: true }];
  assert.notEqual(drawIssue(okanagan, () => 0)?.id, 'highway-16-viewshed-redesign');

  const bulkley = createSeasonalState('planner', 1, 'bulkley-valley');
  bulkley.pendingIssues = [{ id: 'highway-16-viewshed-redesign', delay: 0, force: true }];
  assert.equal(drawIssue(bulkley, () => 0)?.id, 'highway-16-viewshed-redesign');
});

test('generic province-wide tags earn no area relevance bonus', () => {
  const state = createSeasonalState('planner', 1, 'okanagan-shuswap-drybelt');
  const context = { tags: state.area.tags, season: 'Spring Planning' };
  const base = { id: 'x', roles: ['planner'], options: [] };
  const untagged = scoreIssueSelection({ ...base, areaTags: [] }, state, context);
  const genericOnly = scoreIssueSelection({ ...base, areaTags: ['bc-wide'] }, state, context);
  const realMatch = scoreIssueSelection({ ...base, areaTags: ['wildfire'] }, state, context);
  assert.equal(genericOnly, untagged, '"bc-wide" must not outscore an untagged card');
  assert.ok(realMatch > genericOnly, 'a real area tag still earns its bonus');
});

test('no role draws a card that names another region, across every area', () => {
  const roles = ['planner', 'permitter', 'recce', 'silviculture'];
  const leaks = [];
  for (const area of OPERATING_AREAS) {
    for (const roleId of roles) {
      const rng = makeRng(7);
      for (let round = 1; round <= 4; round += 1) {
        for (let draw = 0; draw < 40; draw += 1) {
          const state = createSeasonalState(roleId, round, area.id);
          state.flags = { professionalAuditActive: true, regulatoryScrutiny: true, outdatedData: true };
          const issue = drawIssue(state, rng);
          if (!issue) continue;
          const foreign = namesForeignPlace(`${issue.title} ${issue.description}`, area.id);
          if (foreign) leaks.push(`${roleId} @ ${area.id}: "${issue.title}" names ${foreign}`);
        }
      }
    }
  }
  assert.deepEqual([...new Set(leaks)], []);
});

test('every place-named card in the libraries declares the areas it belongs to', () => {
  for (const issue of [...ISSUE_LIBRARY, ...CHAINED_ISSUES]) {
    const text = `${issue.title} ${issue.description}`;
    if (PLACE_NAME_PATTERN.test(text)) {
      assert.ok(Array.isArray(issue.areaIds) && issue.areaIds.length, `${issue.id} names a place without areaIds`);
    }
  }
});
