import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlanningJourney } from '../js/journey/factory.js';
import { runPlanningDay } from '../js/modes/planning.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';

// Deterministic PRNG so these tests never flake on Math.random().
function seededRandomFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function withSeededRandom(seed, fn) {
  const original = Math.random;
  Math.random = seededRandomFactory(seed);
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

// A minimal UI that captures every writeHeader/write call and always ends
// the day (or takes the first offered choice) as fast as possible so a run
// can be driven day-by-day without a real terminal.
function makeCaptureUi() {
  const lines = [];
  const headers = [];
  return {
    lines,
    headers,
    write(text) {
      if (typeof text === 'string') lines.push(text);
    },
    writeHeader(text) {
      headers.push(text);
      lines.push(text);
    },
    writeWarning(text) { lines.push(text); },
    writePositive(text) { lines.push(text); },
    writeDanger(text) { lines.push(text); },
    clear() {},
    updateAllStatus() {},
    playEventVignette() {},
    async promptChoice(prompt, choices) {
      if (!choices || choices.length === 0) return { value: undefined };
      // Work the file the way a player would, so the phases actually turn
      // over; fall back to closing the day, then to the first option.
      for (const wanted of ['set_aside', 'gather_data', 'analyze', 'stakeholder', 'end']) {
        const found = choices.find((c) => c.value === wanted);
        if (found) return found;
      }
      return choices[0];
    }
  };
}

test('Cutblock Priority Decision card never repeats a paragraph', async () => {
  await withSeededRandom(4242, async () => {
    const area = OPERATING_AREAS.find((candidate) => candidate.id === 'fraser-plateau');
    const journey = createPlanningJourney({ roleId: 'planner', areaId: 'fraser-plateau', area });
    const ui = makeCaptureUi();
    const game = { ui, journey, gameOver: false };

    // The card opens the analysis, not the run: the inventory has to be in
    // before there is anything to triage against.
    let guard = 0;
    while (!ui.lines.some((line) => line.includes('CUTBLOCK PRIORITY DECISION')) && guard < 14) {
      await runPlanningDay(game);
      guard += 1;
    }

    const cardStart = ui.lines.findIndex((line) => line.includes('CUTBLOCK PRIORITY DECISION'));
    assert.ok(cardStart !== -1, 'expected the card to fire once the analysis opened');
    assert.equal(journey.plan.phase === 'data_gathering', false, 'the card must not fire before the inventory is in');

    // The area's zoneSummary is a full descriptive sentence/paragraph. The
    // bug rendered it once on its own line and again as the leading clause
    // of triage.summary on the very next line - two different full lines of
    // text, but the same paragraph appearing twice on the card. Checking for
    // duplicate *lines* misses that (the second line has extra text
    // appended), so assert the paragraph appears only once across the card.
    const zoneSummary = area.zoneSummary;
    const cardText = ui.lines.slice(cardStart, cardStart + 20).join('\n');
    const occurrences = cardText.split(zoneSummary).length - 1;

    assert.equal(occurrences, 1, `zone-summary paragraph should appear exactly once on the card, found ${occurrences} times`);
  });
});

test('Cutblock Priority Decision fires exactly once in a campaign-length planning run and locks a lead block set', async () => {
  await withSeededRandom(9001, async () => {
    const area = OPERATING_AREAS.find((candidate) => candidate.id === 'fraser-plateau');
    const journey = createPlanningJourney({ roleId: 'planner', areaId: 'fraser-plateau', area, scale: 'campaign' });
    // The triage runs once, at the start of the analysis; only an authored
    // event (effects.blockSelection) can reopen it.
    assert.equal(journey.deadline, 26);
    const ui = makeCaptureUi();
    const game = { ui, journey, gameOver: false };

    let guard = 0;
    while (journey.day <= journey.deadline && !journey.isComplete && !journey.isGameOver && !game.gameOver && guard < 40) {
      await runPlanningDay(game);
      guard += 1;
    }

    const fireCount = ui.headers.filter((header) => header === 'CUTBLOCK PRIORITY DECISION').length;
    assert.equal(fireCount, 1, `expected the card to fire exactly once, fired ${fireCount} times`);
    assert.ok(journey.blockPlanning.leadBlocks.length >= 2 && journey.blockPlanning.leadBlocks.length <= 3,
      `expected a lead block set of 2-3 blocks, got ${journey.blockPlanning.leadBlocks.length}`);
    assert.equal(journey.blockPlanning.leadBlocks[0].id, journey.blockPlanning.activeBlock.id, 'the chosen block leads the set');
    assert.ok(ui.lines.some((line) => line.startsWith('Lead block set for the first FOM:')));
  });
});
