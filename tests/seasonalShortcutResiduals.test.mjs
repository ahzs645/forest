import test from 'node:test';
import assert from 'node:assert/strict';

import { ILLEGAL_ACTS } from '../js/data/index.js';
import {
  actMatchesSeasonalTemptationContext,
  adaptIllegalActTemptation,
  describeSeasonalShortcutWatch,
} from '../js/engine/content.js';
import { createInitialState } from '../js/engine/state.js';
import { buildShortcutBrief, dropQueuedFalloutDuplicates, TuiGameController } from '../tui/controller.js';
import { collectShortcutLines } from '../js/game/seasonalAdapter.js';
import { makeRng } from '../js/engine/rng.js';

const SEASONAL_ROLES = ['planner', 'permitter', 'recce', 'silviculture'];

function stateFor(roleId, areaId = 'bulkley-valley', round = 2) {
  const state = createInitialState({ companyName: 'Residuals', roleId, areaId });
  state.round = round;
  return state;
}

const takeOf = (card) => card.options.find((option) => option.risk);

test('a caught shortcut promises a card the year has not already dealt, when one lands there', () => {
  let checked = 0;
  for (const roleId of SEASONAL_ROLES) {
    const state = stateFor(roleId);
    for (const act of ILLEGAL_ACTS.filter((entry) => actMatchesSeasonalTemptationContext(entry, state))) {
      const schedule = takeOf(adaptIllegalActTemptation(act, state)).risk.failScheduleIssues?.[0];
      if (!schedule?.id) continue;
      // The same card answered earlier in the year, or queued later this season.
      const answered = { ...state, history: [{ type: 'issue', id: schedule.id, round: 1 }] };
      const avoided = takeOf(adaptIllegalActTemptation(act, answered)).risk.failScheduleIssues[0];
      const queued = takeOf(adaptIllegalActTemptation(act, state, { avoidIssueIds: [schedule.id] })).risk.failScheduleIssues[0];
      if (avoided.id === schedule.id) continue; // nothing else lands there: the promise stands
      assert.ok(avoided.candidates.some((candidate) => candidate.id === avoided.id));
      assert.equal(queued.id, avoided.id, `${act.id}: a card queued later this season counts as dealt`);
      checked += 1;
    }
  }
  assert.ok(checked >= 20, `acts with a fresh alternative checked: ${checked}`);
});

test('an ordinary copy of the promised card still queued this season gives way, so it is dealt once, linked', () => {
  const gs = stateFor('planner', 'bulkley-valley', 3);
  gs.pendingIssues = [{ id: 'fom-consistency-gap', delay: 1, causedBy: { kind: 'shortcut', actId: 'x', title: 'X' } }];
  const queue = [
    { type: 'issue', data: { id: 'fom-consistency-gap', title: 'FOM Consistency Gap' } },
    { type: 'event', data: { id: 'fom-consistency-gap-event' } },
    { type: 'issue', data: { id: 'fom-consistency-gap', title: 'FOM Consistency Gap', causedBy: { kind: 'shortcut' } } },
    { type: 'consequences' },
  ];
  const excluded = [];
  const dropped = dropQueuedFalloutDuplicates(queue, gs, (exclude) => {
    excluded.push(...exclude);
    return { id: 'fresh-card', title: 'Fresh' };
  });
  assert.equal(dropped, 1);
  assert.equal(queue[0].data.id, 'fresh-card');
  assert.ok(excluded.includes('fom-consistency-gap'), 'the replacement is never the promised card');
  assert.equal(queue[2].data.causedBy.kind, 'shortcut', 'the linked delivery is left alone');

  const noReplacement = [{ type: 'issue', data: { id: 'fom-consistency-gap' } }, { type: 'consequences' }];
  dropQueuedFalloutDuplicates(noReplacement, gs, () => null);
  assert.deepEqual(noReplacement.map((entry) => entry.type), ['consequences']);
});

test('the odds reason closes once: no "strong.. Saying no costs nothing."', () => {
  const gs = stateFor('planner');
  gs.metrics.compliance = 82;
  gs.metrics.relationships = 76;
  const act = ILLEGAL_ACTS.find((entry) => actMatchesSeasonalTemptationContext(entry, gs));
  const card = adaptIllegalActTemptation(act, gs);
  assert.match(card.oddsReason, /Better odds because .*\.$/);
  const brief = buildShortcutBrief(gs, card);
  assert.doesNotMatch(brief.oddsText, /\.$/, 'the views close the sentence');
  // The classic card sets the reason on its own line, a size down.
  assert.match(brief.oddsLine, /^Odds this season: clean \d+% · noticed \d+% · caught \d+%$/);
  assert.equal(brief.oddsText, `${brief.oddsLine} — ${brief.oddsReason}`);
  const hub = collectShortcutLines({ shortcut: brief }).map((line) => line.text).join(' ');
  assert.doesNotMatch(hub, /\.\./);
  assert.match(hub, /rate you\. Saying no costs nothing\.$/);
});

test('a noticed take puts a standing "Watched" line on the seasonal status and decision panels', () => {
  const quiet = stateFor('recce');
  assert.equal(describeSeasonalShortcutWatch(quiet), '');
  quiet.flags['watched:Timber Pricing'] = true;
  assert.equal(describeSeasonalShortcutWatch(quiet),
    'Watched: Timber Pricing has your cruises on the check list. Shortcut odds are worse.');

  const controller = new TuiGameController({ rng: makeRng(7), storage: null, onExit() {} });
  controller.setInputText('Watch Co');
  controller.submitCurrent();
  controller.selectOption(0);
  controller.selectOption(0);
  assert.equal(controller.getState().gameState.objectiveStrip.watch, undefined);
  controller.gs.flags['watched:C&E'] = true;
  controller.emit();
  assert.match(controller.getState().gameState.objectiveStrip.watch, /^Watched: the district is now reading everything with your name on it\. Shortcut odds are worse\.$/);
});
