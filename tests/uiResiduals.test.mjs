// Round-3 UI and renderer residuals: the Modern budget gauge, the ASCII Grid's
// off-book guard and mission pane, the fallout chip and its printed costs,
// the late-catch delay, summer weather, and the day card's scroll anchor.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ILLEGAL_ACTS } from '../js/data/illegalActs.js';
import { WEATHER_CONDITIONS, getRandomWeather } from '../js/data/blocks.js';
import { buildFalloutEvent, buildShortcutOption, describeShortcutStakes } from '../js/events/selection.js';
import { deriveEventOptionTag, describeEffectChips } from '../js/events/display.js';
import { formatEventForDisplay, resolveEvent } from '../js/events.js';
import { falloutLandsIn, getPendingFallout, queueFallout } from '../js/events/fallout.js';
import { presentDayCard } from '../js/journey/dayCard.js';
import { createJourney } from '../js/journey.js';
import { describeBudgetGauge } from '../js/ui/modernUI.js';
import { GridView } from '../js/gridview/gridView.js';

function act(id) {
  const found = ILLEGAL_ACTS.find((entry) => entry.id === id);
  assert.ok(found, `no act ${id}`);
  return found;
}

test('the Modern budget gauge reads against the run\'s own starting budget', () => {
  for (const [roleId, areaId] of [
    ['recce', 'fort-st-john-plateau'],
    ['planner', 'bulkley-valley'],
    ['permitter', 'fort-st-john-plateau'],
    ['silviculture', 'fraser-plateau'],
    ['manager', 'bulkley-valley'],
  ]) {
    const journey = createJourney({ roleId, areaId });
    assert.deepEqual(describeBudgetGauge(journey), { percent: 100, fill: 100 }, roleId);
    journey.resources.budget = journey.startingResources.budget / 4;
    assert.deepEqual(describeBudgetGauge(journey), { percent: 25, fill: 25 }, roleId);
  }
});

test('a budget above its start reads over 100% but never overfills the bar', () => {
  const journey = createJourney({ roleId: 'manager', areaId: 'bulkley-valley' });
  journey.resources.budget = journey.startingResources.budget * 1.3;
  assert.deepEqual(describeBudgetGauge(journey), { percent: 130, fill: 100 });
  journey.resources.budget = -500;
  assert.equal(describeBudgetGauge(journey).fill, 0);
  assert.equal(describeBudgetGauge({ resources: {} }), null);
});

test('an off-book grid option opens its whole detail and says how to take it', () => {
  const hint = 'today: 60% clean · 30% noticed · 10% caught by C&E, +24 data, +3 scrutiny, offer: six amendments you do not draft, brief response; work continues';
  const entries = [
    { key: '1', label: 'Decline', hint: 'brief response; work continues', tag: 'SAFE', focused: false, guarded: false },
    { key: '2', label: 'Take the shortcut', hint, tag: 'OFF-BOOK', focused: true, guarded: true },
  ];
  const touch = GridView.prototype._focusedDetailRows.call({ _touch: true }, entries, 50);
  assert.equal(touch.at(-1), 'Tap again to take it.');
  assert.ok(!touch.some((row) => row.endsWith('…')), `nothing clipped: ${touch.join(' / ')}`);
  assert.equal(touch.slice(0, -1).join(' '), hint);

  const keyboard = GridView.prototype._focusedDetailRows.call({ _touch: false }, entries, 50);
  assert.equal(keyboard.at(-1), 'Enter or click again to take it.');

  // An ordinary focused touch row keeps its usual rows.
  entries[1].focused = false;
  entries[0].focused = true;
  assert.deepEqual(GridView.prototype._focusedDetailRows.call({ _touch: true }, entries, 50), []);
});

test('a grid mission fact too long for its row wraps under the label instead of losing its tail', () => {
  const previous = globalThis.document;
  globalThis.document = { querySelectorAll: () => [], getElementById: () => null };
  try {
    const rows = new Map();
    const renderer = {
      drawText(text, x, y) { rows.set(y, `${rows.get(y) || ''}${String(text)}`); },
      set() {},
    };
    const ui = { _missionStatus: { facts: [
      { label: 'Weather', value: 'Freezing Conditions -12°C' },
      { label: 'Day', value: '4' },
    ] } };
    GridView.prototype._drawSidebar.call({ ui }, renderer, {}, 0, 2, 34, 20);
    const text = [...rows.values()].join('\n');
    assert.match(text, /Freezing Conditions -12°C/);
    assert.match(text, /Day\s*4/);
  } finally {
    globalThis.document = previous;
  }
});

test('answering a determination is a certain cost: TRADEOFF, never RISKY', () => {
  const journey = createJourney({ roleId: 'planner', areaId: 'bulkley-valley' });
  const event = buildFalloutEvent({
    actId: 'planner-skip-amendments',
    title: 'Forget the Cutting-Authority Amendments',
    institution: 'ce',
    effects: { budget: -3000, compliance: -10, scrutiny: 15 },
    takenDay: 4,
  }, journey);
  const formatted = formatEventForDisplay(event, journey.journeyType);
  assert.equal(formatted.options[0].tag, 'TRADEOFF');
  // The same steep costs on an ordinary card, or with a roll, stay RISKY.
  assert.equal(deriveEventOptionTag(event.options[0], { temptationStage: 'offer' }), 'RISKY');
  assert.equal(deriveEventOptionTag({ ...event.options[0], chanceSuccess: 0.5 }, event), 'RISKY');
});

test('a late catch states the delay the queue will really apply', () => {
  const journey = createJourney({ roleId: 'manager', areaId: 'bulkley-valley' });
  journey.day = 10;
  assert.equal(journey.deadline, 12);
  assert.deepEqual(falloutLandsIn(journey, 4), { dueIn: 2, capped: true });
  assert.deepEqual(falloutLandsIn(journey, 1), { dueIn: 1, capped: false });

  const option = buildShortcutOption(act('reality-show-pitch'), journey);
  assert.equal(option.failureFallout.dueIn, 4, 'the determination itself is unchanged');
  assert.match(option.failureOutcome, /lands in 2 months, in the last month of the run\./);
  const stakes = describeShortcutStakes(option, journey).join(' ');
  assert.match(stakes, /landing 2 months later, in the last month of the run\)/);
  assert.doesNotMatch(stakes, /about 4 months/);

  const entry = queueFallout(journey, option.failureFallout);
  assert.equal(entry.dueDay, 12);
  getPendingFallout(journey).length = 0;

  journey.day = 3;
  assert.match(buildShortcutOption(act('reality-show-pitch'), journey).failureOutcome, /lands in about 4 months\./);
});

test('a budget chip is short only when short is exact', () => {
  assert.deepEqual(describeEffectChips({ budget: -1800 }), ['-$1.8k']);
  assert.deepEqual(describeEffectChips({ budget: 36600 }), ['+$36.6k']);
  assert.deepEqual(describeEffectChips({ budget: -1440 }), ['-$1,440']);
  assert.deepEqual(describeEffectChips({ budget: -2450 }), ['-$2,450']);
  assert.deepEqual(describeEffectChips({ budget: -400 }), ['-$400']);
});

test('a fine the purse cannot cover says what it will actually take', () => {
  const journey = createJourney({ roleId: 'recce', areaId: 'fort-st-john-plateau' });
  journey.resources.budget = 1440;
  const entry = {
    actId: 'silv-declare-free-growing',
    title: 'Declare It Free Growing',
    institution: 'ce',
    effects: { budget: -1800, compliance: -10, scrutiny: 15 },
    takenDay: 11,
    takenWhen: 'spring, on day 11',
  };
  const event = buildFalloutEvent(entry, journey);
  assert.equal(event.stakes[0], 'What it costs: -$1.8k, -10 compliance, +15 scrutiny. You have $1,440; it takes all of it.');
  const { messages } = resolveEvent(journey, event, event.options[0]);
  assert.ok(messages.includes('Cash: -$1,440'), messages.join(' | '));

  journey.resources.budget = 3000;
  assert.equal(buildFalloutEvent(entry, journey).stakes[0], 'What it costs: -$1.8k, -10 compliance, +15 scrutiny.');
});

test('summer never rolls a freeze-up or heavy snow, even on a pass', () => {
  const block = { features: ['alpine', 'pass'] };
  const original = Math.random;
  try {
    for (let i = 0; i < 400; i += 1) {
      Math.random = () => i / 400;
      const weather = getRandomWeather(block, 25, 'summer');
      assert.ok(!['freezing', 'heavy_snow'].includes(weather.id), `summer rolled ${weather.id}`);
    }
  } finally {
    Math.random = original;
  }
  assert.ok(WEATHER_CONDITIONS.some((c) => c.id === 'freezing'), 'winter still has it');
});

test('an ordinary day card anchors the log on its first line until it is answered', async () => {
  const written = [];
  const ui = {
    clear() {},
    writeHeader(text) { written.push(['term-header', text]); },
    write(text, cls = '') { written.push([cls, text]); },
    promptChoice: async (prompt, choices) => choices[0],
    releaseScrollAnchor() { written.push(['released']); },
  };
  await presentDayCard(ui, { label: 'ON THE RADIO', title: 'Sudden Storm', body: 'Wind.', options: [{ label: 'Wait it out', value: 1 }] });
  assert.deepEqual(written[0], ['term-dim term-anchor', 'ON THE RADIO']);
  assert.deepEqual(written[1], ['term-header', 'Sudden Storm']);
  assert.deepEqual(written.at(-1), ['released']);

  written.length = 0;
  await presentDayCard(ui, { title: 'Socked In', options: [{ label: 'Go', value: 1 }] });
  assert.deepEqual(written[0], ['term-header term-anchor', 'Socked In']);
});
