import test from 'node:test';
import assert from 'node:assert/strict';

import { createManagerJourney } from '../js/journey/factory.js';
import { runManagerDay } from '../js/modes/manager.js';
import { ensureDaySeed } from '../js/events/dayRng.js';

/**
 * The game saves at the month boundary after rolling the next month's seed
 * (ForestryTrailGame._mainLoop). A reload replays the month from that save
 * with a fresh Math.random, so everything the month rolls has to come from
 * the seed: the ledger's volume and price, and December's restatement check.
 */

function seededRandomFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function withRandom(random, fn) {
  const original = Math.random;
  Math.random = random;
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

function makeUi(answer) {
  const lines = [];
  const push = (text) => { if (typeof text === 'string') lines.push(text); };
  return {
    lines,
    write: push, writeHeader: push, writeWarning: push, writePositive: push, writeDanger: push,
    writeInfo: push, writeSuccess: push, writeDivider: push, clear: () => {}, updateAllStatus: () => {},
    playEventVignette: () => {}, playScene: async () => {}, setMissionStatus: () => {}, clearMissionStatus: () => {},
    async promptText() { return 'x'; },
    async promptChoice(prompt, options = []) {
      if (!options.length) return { value: undefined };
      if (options.length === 1) return options[0];
      return answer(options) || options.find((o) => typeof o.value !== 'symbol') || options[0];
    },
  };
}

const spinAnswers = (options) => {
  for (const want of ['steady', 'SFI', 'pr', 'back', 'visit', 'polish', 'spin', 'pace:1', 'set_aside']) {
    const found = options.find((o) => o.value === want);
    if (found) return found;
  }
  return null;
};

const save = (journey) => JSON.parse(JSON.stringify(journey));

/** Play months until the journey reaches `day`, seeding each boundary like the game loop. */
async function playTo(journey, day, seed) {
  await withRandom(seededRandomFactory(seed), async () => {
    ensureDaySeed(journey);
    while (journey.day < day) {
      await runManagerDay({ ui: makeUi(spinAnswers), journey, gameOver: false, checkpoint() {} });
      ensureDaySeed(journey);
    }
  });
  return journey;
}

async function replay(saved, random) {
  const journey = save(saved);
  const ui = makeUi(spinAnswers);
  await withRandom(random, () => runManagerDay({ ui, journey, gameOver: false, checkpoint() {} }));
  return { journey, ui };
}

test('reloading mid-month replays the same ledger: volume, log price, net and treasury', async () => {
  for (const [area, seed] of [['fraser-plateau', 31], ['vancouver-island-coast', 77]]) {
    const saved = save(await playTo(createManagerJourney({ areaId: area }), 5, seed));
    const first = await replay(saved, seededRandomFactory(1));
    const reload = await replay(saved, seededRandomFactory(987654));
    const again = await replay(saved, () => 0.999);
    const may = (run) => run.journey.ledger.months.find((entry) => entry.month === 5);
    assert.ok(may(first), `${area}: May closed`);
    assert.deepEqual(may(reload), may(first), `${area}: the reloaded May ledger is the same May`);
    assert.deepEqual(may(again), may(first));
    assert.equal(reload.journey.resources.budget, first.journey.resources.budget);
    assert.deepEqual(
      reload.ui.lines.filter((line) => /^(Delivered|Log price|Net) /.test(line)),
      first.ui.lines.filter((line) => /^(Delivered|Log price|Net) /.test(line)),
    );
  }
});

test('reloading December replays the same year-end restatement check', async () => {
  const journey = await playTo(createManagerJourney({ areaId: 'fraser-plateau' }), 12, 4242);
  // Three spun quarters on the file, whatever the seed dealt, so the audit rolls.
  journey.flags.boardSpunQuarters = [1, 2, 3];
  const saved = save(journey);
  const restatement = (run) => run.ui.lines.filter((line) => /AUDITED YEAR-END|restates|spun quarter/.test(line));
  const low = await replay(saved, () => 0.01);
  const high = await replay(saved, () => 0.99);
  assert.ok(restatement(low).length >= 2, restatement(low).join(' | '));
  assert.deepEqual(restatement(high), restatement(low), 'the auditors find the same quarters after a reload');
  assert.equal(high.journey.metrics.reputation, low.journey.metrics.reputation);
});
