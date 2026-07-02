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
      const endIdx = choices.findIndex((c) => c.value === 'end');
      if (endIdx !== -1) return choices[endIdx];
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

    await runPlanningDay(game);

    const cardStart = ui.lines.findIndex((line) => line.includes('CUTBLOCK PRIORITY DECISION'));
    assert.ok(cardStart !== -1, 'expected the card to fire on day 1');

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

test('Cutblock Priority Decision fires at most twice in a campaign-length planning run', async () => {
  await withSeededRandom(9001, async () => {
    const area = OPERATING_AREAS.find((candidate) => candidate.id === 'fraser-plateau');
    const journey = createPlanningJourney({ roleId: 'planner', areaId: 'fraser-plateau', area, scale: 'campaign' });
    // Campaign scale sets a 12-day deadline with a 3-day selection cadence,
    // which used to put this card on screen 4 times (day 1, 4, 7, 10) with
    // identical wording each time.
    assert.equal(journey.deadline, 12);
    const ui = makeCaptureUi();
    const game = { ui, journey, gameOver: false };

    let guard = 0;
    while (journey.day <= journey.deadline && !journey.isComplete && !journey.isGameOver && !game.gameOver && guard < 30) {
      await runPlanningDay(game);
      guard += 1;
    }

    const fireCount = ui.headers.filter((header) => header === 'CUTBLOCK PRIORITY DECISION').length;
    assert.ok(fireCount <= 2, `expected the card to fire at most twice, fired ${fireCount} times`);
    assert.ok(fireCount >= 1, 'expected the card to fire at least once');
  });
});
