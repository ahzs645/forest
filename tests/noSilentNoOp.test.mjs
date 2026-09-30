/**
 * No silent no-op on a day card. Every option the card offers as available,
 * once chosen, must spend the day, change the program, or leave its reason on
 * screen: a line the player acknowledges, or the option's own row, disabled
 * with the reason, on the redrawn card. A handler that printed a refusal and
 * returned let the redraw wipe it and offered the same no-op again, which
 * reads as a dead button.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSilvicultureJourney, createReconJourney } from '../js/journey/factory.js';
import { runSilvicultureDay } from '../js/modes/silviculture.js';
import { runReconDay } from '../js/modes/recon.js';
import { evacuateCrewMember } from '../js/crew.js';

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function withSeed(seed, fn) {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

/** A headless UI that logs writes, redraws and prompts, and never takes a disabled option. */
function capturingUi(events, pick) {
  const write = (text) => events.push({ type: 'write', text: String(text ?? '') });
  const noop = () => {};
  return {
    write, writeHeader: write, writeWarning: write, writePositive: write, writeDanger: write,
    writeInfo: write, writeSuccess: write, writeBox: write,
    clear: () => events.push({ type: 'clear' }),
    writeDivider: noop, updateAllStatus: noop, playEventVignette: noop, playScene: async () => {},
    playTravelStrip: noop, clearMissionStatus: noop, setMissionStatus: noop, releaseScrollAnchor: noop,
    async promptText() { return 'x'; },
    async promptChoice(prompt, all = []) {
      events.push({ type: 'prompt', prompt, options: all });
      const enabled = all.filter((option) => !option.disabled);
      if (enabled.length <= 1) return enabled[0] || { value: undefined };
      return pick(prompt, all, enabled) || enabled[0];
    },
  };
}

// A sub-menu is answered with a real choice, never a way back out: backing
// out is the player's call, not a no-op the card offered.
const BACK_OUT = /^(cancel|back|keep|camp_back|desk_back|support_back|set_aside)$/;
const BACK_OUT_LABEL = /never mind|^back|not today|leave it|choose another|\(current\)/i;
function answerSubMenu(enabled) {
  return enabled.find((option) => !BACK_OUT.test(String(option.value)) && !BACK_OUT_LABEL.test(option.label))
    || enabled[0];
}

// "More context" only unfolds the card, and ending the day is the day.
const isDayCardOption = (value) => typeof value === 'string'
  && !['end', 'end_shift'].includes(value.split('>').at(-1)) && !BACK_OUT.test(value.split('>').at(-1));

/** The program, the roster and the books; not the day's held-task reasons. */
function snapshot(journey) {
  return JSON.stringify(journey, (key, value) => (key === 'heldToday' ? undefined : value));
}

/**
 * What the player was left with after choosing `target`: the day spent, the
 * state changed, the reason on the option's own row, a line they
 * acknowledged, or nothing (SILENT).
 */
function judge(events, redrawn, target, before, atRedraw) {
  if (atRedraw !== null && atRedraw !== before) return 'changed';
  const row = redrawn.find((option) => option.value === target);
  if (row?.disabled && String(row.description || '').trim()) return 'held on its row';
  const redraw = events.map((event) => event.type).lastIndexOf('clear');
  const shown = redraw < 0 ? events : events.slice(0, redraw);
  const lastWrite = shown.map((event) => event.type).lastIndexOf('write');
  if (lastWrite >= 0 && shown.slice(lastWrite).some((event) => event.type === 'prompt')) return 'acknowledged';
  const wiped = shown.filter((event) => event.type === 'write' && event.text).map((event) => event.text);
  return `SILENT${wiped.length ? `: "${wiped.join(' / ')}" wiped by the redraw` : ''}${row && !row.disabled ? '; the same option is offered again' : ''}`;
}

/**
 * Play one mode day in which the day card's `target` option is chosen once
 * (after `race` moves the state under it), and judge the result. A target
 * "menu>option" picks an option inside one of the card's sub-menus (the
 * recon card keeps standing down and the camp jobs under "Camp & crew").
 * @returns {Promise<{offered: Object[], verdict: string|null}>}
 */
async function chooseOnce({ journey, runDay, isDayMenu, endValue, submenu = null, target, race }) {
  const events = [];
  const [top, sub] = String(target ?? '').split('>');
  let phase = 'before';
  let before = null;
  let atRedraw = null;
  let offered = [];
  let verdict = null;
  let mark = 0;
  const ui = capturingUi(events, (prompt, all, enabled) => {
    if (!isDayMenu(all)) {
      if (!submenu || !submenu.prompt.test(prompt)) return answerSubMenu(enabled);
      if (phase === 'chosen' && sub) return enabled.find((option) => option.value === sub);
      // The probe reads the sub-menu on its way to ending the day.
      if (phase === 'before') offered = [...offered, ...all.map((option) => ({ ...option, value: `${submenu.value}>${option.value}` }))];
      return enabled.find((option) => option.value === submenu.end);
    }
    const end = enabled.find((option) => option.value === endValue);
    if (phase === 'before') {
      offered = all.filter((option) => option.value !== submenu?.value);
      const option = target && enabled.find((candidate) => candidate.value === top);
      if (!option) return end;
      phase = 'chosen';
      race?.(journey);
      before = snapshot(journey);
      mark = events.length;
      return option;
    }
    if (phase === 'chosen') {
      phase = 'judged';
      verdict = judge(events.slice(mark, -1), all, top, before, atRedraw);
    }
    return end;
  });
  // The state is read at the redraw, before the card's own render hooks run.
  const clear = ui.clear;
  ui.clear = () => {
    if (phase === 'chosen') atRedraw = snapshot(journey);
    clear();
  };
  await runDay({ ui, journey, gameOver: false });
  return { offered, verdict: phase === 'chosen' ? 'spent' : verdict };
}

/**
 * Choose every enabled option on one morning's day card in turn, each from a
 * fresh build of the same state, and check none of them is a silent no-op.
 * @returns {Promise<number>} how many options were checked
 */
async function checkEveryOption(label, seed, build, mode) {
  const run = async (target) => chooseOnce({ ...mode, journey: await build(), target });
  const probe = await withSeed(seed, () => run(null));
  const values = probe.offered
    .filter((option) => !option.disabled && isDayCardOption(option.value))
    .map((option) => option.value);
  for (const target of values) {
    const { verdict } = await withSeed(seed, () => run(target));
    assert.ok(verdict && !verdict.startsWith('SILENT'), `${label}: "${target}" → ${verdict}`);
  }
  return values.length;
}

test('the judge flags a refusal that the redraw wipes', () => {
  const events = [{ type: 'write', text: 'No crew today.' }, { type: 'clear' }, { type: 'write', text: 'DAY 3' }];
  const redrawn = [{ value: 'plant', label: 'Plant' }, { value: 'end', label: 'End' }];
  assert.equal(judge(events, redrawn, 'plant', 'same', 'same'), 'SILENT: "No crew today." wiped by the redraw; the same option is offered again');
  assert.equal(judge([{ type: 'write', text: 'Read this.' }, { type: 'prompt' }, { type: 'clear' }], redrawn, 'plant', 'same', 'same'), 'acknowledged');
  assert.equal(judge(events, [{ value: 'plant', disabled: true, description: 'No crew today.' }], 'plant', 'same', 'same'), 'held on its row');
  assert.equal(judge(events, redrawn, 'plant', 'same', 'other'), 'changed');
});

// ── Silviculture ────────────────────────────────────────────────────────────

const SILVICULTURE_MODE = {
  runDay: runSilvicultureDay,
  isDayMenu: (all) => all.some((option) => option.value === 'end'),
  endValue: 'end',
};

const takeFieldWork = (prompt, all, enabled) => {
  if (!SILVICULTURE_MODE.isDayMenu(all)) return answerSubMenu(enabled);
  return enabled.find((option) => ['inspect', 'plant', 'fill', 'brush', 'survey'].includes(option.value))
    || enabled.find((option) => option.value === 'end');
};

/** A silviculture journey played to `day` by a crew that takes the next field task. */
function silvicultureState(areaId, day, setup) {
  return async () => {
    const journey = createSilvicultureJourney({ areaId });
    const ui = capturingUi([], takeFieldWork);
    while (journey.day < day && !journey.isComplete && !journey.isGameOver) {
      await runSilvicultureDay({ ui, journey, gameOver: false });
    }
    setup?.(journey);
    return journey;
  };
}

const allCrewsOff = (journey) => {
  for (const contractor of journey.contractors) {
    contractor.isActive = false;
    contractor.silvicultureState = { ...(contractor.silvicultureState || { traits: [] }), status: 'recovering', cooldownDays: 2 };
  }
};
const surveyorGone = (journey) => {
  const surveyor = journey.crew.find((member) => member.role === 'surveyor');
  if (surveyor) evacuateCrewMember(surveyor, { day: journey.day });
};

const SILVICULTURE_SETUPS = {
  'as played': null,
  'every crew on days off': allCrewsOff,
  'surveyor evacuated, $1,000 left': (journey) => { surveyorGone(journey); journey.resources.budget = 1000; },
  'reefer empty': (journey) => { journey.resources.seedlings = 0; },
};

// What can move between the card being drawn and the call being made.
const SILVICULTURE_RACES = {
  none: null,
  'the crews go on days off': (journey) => { allCrewsOff(journey); surveyorGone(journey); },
  'the reefer empties': (journey) => { journey.resources.seedlings = 0; },
  'the budget runs down': (journey) => { journey.resources.budget = 500; },
};

test('silviculture: every option the day card offers does something the player can see', async () => {
  let checked = 0;
  for (const areaId of ['fort-st-john-plateau', 'kootenay-wetbelt', 'fraser-plateau', 'okanagan-shuswap-drybelt']) {
    for (const day of [1, 6, 12]) {
      for (const [setupName, setup] of Object.entries(SILVICULTURE_SETUPS)) {
        for (const [raceName, race] of Object.entries(SILVICULTURE_RACES)) {
          checked += await checkEveryOption(`${areaId} day ${day}, ${setupName}, race: ${raceName}`, 4242 + day,
            silvicultureState(areaId, day, setup), { ...SILVICULTURE_MODE, race });
        }
      }
    }
  }
  assert.ok(checked > 200, `only ${checked} choices checked`);
});

test('silviculture: a task that cannot go once chosen keeps its row, disabled, with the reason', async () => {
  const journey = await withSeed(11, () => silvicultureState('fort-st-john-plateau', 1)());
  const { verdict } = await withSeed(11, () => chooseOnce({
    ...SILVICULTURE_MODE,
    journey,
    target: 'plant',
    race: (j) => { j.resources.seedlings = 0; },
  }));
  assert.equal(verdict, 'held on its row');
  assert.equal(journey.planting.seedlingsPlanted, 0);
  assert.match(journey.silvicultureState.heldToday.plant, /No seedlings remain/);
});

test('silviculture: a replacement the program cannot pay for is shown disabled with the reason', async () => {
  const journey = await withSeed(5, () => silvicultureState('kootenay-wetbelt', 1, (j) => {
    surveyorGone(j);
    j.resources.budget = 1000;
  })());
  const events = [];
  const ui = capturingUi(events, (prompt, all, enabled) => enabled.find((option) => option.value === 'end') || answerSubMenu(enabled));
  await withSeed(5, () => runSilvicultureDay({ ui, journey, gameOver: false }));
  const card = events.find((event) => event.type === 'prompt' && SILVICULTURE_MODE.isDayMenu(event.options));
  const row = card.options.find((option) => option.value === 'replace:surveyor');
  assert.ok(row?.disabled, 'the replacement cannot be taken');
  assert.match(row.description, /^The program cannot carry a replacement surveyor: \$1,400 against \$\d/);
});

// ── Recon ───────────────────────────────────────────────────────────────────

const RECON_MODE = {
  runDay: runReconDay,
  isDayMenu: (all) => all.some((option) => option.value === 'camp_menu'),
  endValue: 'camp_menu',
  submenu: { value: 'camp_menu', prompt: /^Camp & crew/, end: 'end_shift' },
};

const workTheRoute = (prompt, all, enabled) => {
  if (!RECON_MODE.isDayMenu(all)) return answerSubMenu(enabled);
  return enabled.find((option) => ['ground_truth', 'values_sweep', 'travel'].includes(option.value))
    || enabled.find((option) => option.value === 'camp_menu');
};

function reconState(areaId, day, setup) {
  return async () => {
    const journey = createReconJourney({ areaId });
    const ui = capturingUi([], workTheRoute);
    while (journey.day < day && !journey.isComplete && !journey.isGameOver) {
      await runReconDay({ ui, journey, gameOver: false });
    }
    setup?.(journey);
    return journey;
  };
}

const RECON_SETUPS = {
  'as played': null,
  'broke, dry and hungry': (journey) => {
    journey.resources.cash = 0;
    journey.resources.fuel = 0;
    journey.resources.food = 0;
    journey.resources.firstAid = 0;
  },
};

test('recon: every option the day card offers does something the player can see', async () => {
  let checked = 0;
  for (const areaId of ['fort-st-john-plateau', 'kootenay-wetbelt', 'skeena-nass']) {
    for (const day of [1, 4, 8]) {
      for (const [setupName, setup] of Object.entries(RECON_SETUPS)) {
        checked += await checkEveryOption(`${areaId} day ${day}, ${setupName}`, 900 + day, reconState(areaId, day, setup), RECON_MODE);
      }
    }
  }
  assert.ok(checked > 30, `only ${checked} choices checked`);
});
