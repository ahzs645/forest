import test from 'node:test';
import assert from 'node:assert/strict';

import { checkForEvent } from '../js/events.js';
import { ensureDaySeed } from '../js/events/dayRng.js';
import { createPermittingJourney, createPlanningJourney } from '../js/journey/factory.js';
import { runPlanningDay } from '../js/modes/planning.js';
import { runPermittingDay } from '../js/modes/permitting.js';
import { resumingDeskDay } from '../js/journey/deskMechanics.js';
import { buildEventReaction } from '../js/events/reactions.js';

/** What saveActiveRun puts on disk, and what a reload gets back. */
function reload(journey) {
  return JSON.parse(JSON.stringify(journey));
}

/**
 * A headless UI that answers every prompt through `answer`, and records the
 * option values it was offered.
 */
function makeUi(answer) {
  const offered = [];
  const labels = [];
  const lines = [];
  const write = (text) => { lines.push(String(text ?? '')); };
  return {
    offered,
    labels,
    lines,
    write, writeHeader: write, writeWarning: write, writePositive: write, writeDanger: write,
    writeBox: write, writeInfo: write, writeSuccess: write,
    writeDivider() {}, clear() {}, updateAllStatus() {}, playEventVignette() {}, playScene() {},
    setMissionStatus() {}, clearMissionStatus() {},
    async promptText() { return ''; },
    async promptChoice(prompt, options = []) {
      offered.push(options.map((option) => option.value));
      labels.push(options.map((option) => option.label));
      if (options.length <= 1) return options[0] || { value: undefined };
      return answer(options, String(prompt || '')) || options[0];
    },
  };
}

function makeGame(journey, answer) {
  const saves = [];
  const game = {
    ui: makeUi(answer),
    journey,
    gameOver: false,
    checkpoint() { saves.push(reload(game.journey)); },
  };
  return { game, saves };
}

const isSituationCard = (options) => options.some((option) => option.value === 'set_aside');

/** A day on which the morning draws a situation. */
function eventfulDay(create, day = 6) {
  for (let seed = 1; seed <= 400; seed += 1) {
    const journey = create();
    journey.day = day;
    journey.daySeed = { day, seed };
    const probe = checkForEvent(reload(journey));
    if (probe && probe.type !== 'temptation' && probe.severity !== 'positive') return journey;
  }
  throw new Error('no seed in 1..400 drew a situation');
}

test('a planning day resumes after its situation instead of replaying it', async () => {
  const journey = eventfulDay(() => createPlanningJourney({ areaId: 'fort-st-john-plateau' }));
  const first = makeGame(journey, (options) => {
    if (isSituationCard(options)) return options.find((option) => typeof option.value === 'number');
    return options.find((option) => option.value === 'gather_data');
  });
  await runPlanningDay(first.game);

  assert.ok(first.saves.length >= 1, 'the settled situation is checkpointed');
  const afterSituation = first.saves[0];
  assert.equal(afterSituation.day, 6);
  assert.ok(resumingDeskDay(afterSituation), 'the checkpoint marks the day in progress');
  const eventsLogged = afterSituation.log.filter((entry) => entry.type === 'event').length;
  assert.equal(eventsLogged, 1, 'the situation is on the file at the checkpoint');

  // Reload at the outcome screen: the situation is not offered again.
  const again = makeGame(afterSituation, (options) => {
    assert.ok(!isSituationCard(options), 'a resumed day does not re-offer the morning situation');
    return options.find((option) => option.value === 'gather_data');
  });
  await runPlanningDay(again.game);
  assert.equal(again.game.journey.log.filter((entry) => entry.type === 'event').length, 1);
  assert.equal(again.game.journey.day, 7, 'the day closes and the calendar moves on');
  assert.equal(again.game.journey.activeDeskDay, null, 'the next day starts fresh');
});

test('a permitting day resumes after its situation instead of replaying it', async () => {
  const journey = eventfulDay(() => createPermittingJourney({ areaId: 'bulkley-valley' }));
  const first = makeGame(journey, (options) => {
    if (isSituationCard(options)) return options.find((option) => option.value === 'set_aside');
    return options.find((option) => option.value === 'end_day');
  });
  await runPermittingDay(first.game);
  const afterSituation = first.saves[0];
  assert.ok(resumingDeskDay(afterSituation));
  const scrutiny = afterSituation.scrutiny;

  const again = makeGame(afterSituation, (options) => {
    assert.ok(!isSituationCard(options), 'a resumed day does not re-offer the morning situation');
    return options.find((option) => option.value === 'end_day');
  });
  await runPermittingDay(again.game);
  assert.equal(again.game.journey.log.filter((entry) => entry.setAside).length, 1, 'the set-aside is charged once');
  assert.ok(again.game.journey.scrutiny >= scrutiny);
  assert.equal(again.game.journey.day, 7);
});

test('goodwill spent by the morning situation ends the planning file there', async () => {
  const journey = eventfulDay(() => createPlanningJourney({ areaId: 'bulkley-valley' }));
  const { game } = makeGame(journey, (options) => {
    if (isSituationCard(options)) {
      // Stand-in for an outcome that spends the last of the goodwill.
      game.journey.resources.politicalCapital = 0;
      return options.find((option) => option.value === 'set_aside');
    }
    return null;
  });
  await runPlanningDay(game);
  assert.equal(journey.isGameOver, true);
  assert.match(journey.gameOverReason, /goodwill/);
  assert.equal(journey.day, 6, 'no day closes after the file stops');
  assert.ok(!game.ui.offered.some((values) => values.includes('stakeholder') || values.includes('gather_data')),
    'the day\'s work is never offered once the file has stopped');
});

test('goodwill spent by the morning situation ends the permitting run there', async () => {
  const journey = eventfulDay(() => createPermittingJourney({ areaId: 'skeena-nass' }));
  const { game } = makeGame(journey, (options) => {
    if (isSituationCard(options)) {
      game.journey.resources.politicalCapital = 0;
      return options.find((option) => option.value === 'set_aside');
    }
    return null;
  });
  await runPermittingDay(game);
  assert.equal(journey.isGameOver, true);
  assert.match(journey.gameOverReason, /goodwill/);
  assert.equal(journey.day, 6);
  assert.ok(!game.ui.offered.some((values) => values.includes('support_menu')),
    'no district meeting can win the goodwill back after the run ended');
});

test('a day that opens with no goodwill left ends before any work', async () => {
  const journey = createPermittingJourney({ areaId: 'fraser-plateau' });
  journey.day = 4;
  ensureDaySeed(journey);
  journey.resources.politicalCapital = 0;
  const { game } = makeGame(journey, () => null);
  await runPermittingDay(game);
  assert.equal(journey.isGameOver, true);
  assert.equal(game.ui.offered.length, 0);
});

test('the night the run ends, the button says so', async () => {
  const journey = createPermittingJourney({ areaId: 'fraser-plateau' });
  journey.day = 1;
  journey.resources.politicalCapital = 1;
  const { game } = makeGame(journey, (options) => {
    game.journey.resources.politicalCapital = 0;
    return options.find((option) => option.value === 'end_day');
  });
  await runPermittingDay(game);
  assert.deepEqual(game.ui.labels.at(-1), ['The work stops here...'],
    'not "Start next day... (29 days left)" on the night the licensee pulls you off');
});

test('the inner voice does not call a failed gamble a clean call, and says nothing once the run has ended', () => {
  const journey = createPlanningJourney({ areaId: 'fort-st-john-plateau' });
  journey.protagonist.stress = 10;
  const always = () => 0;
  for (const band of ['bad', 'partial']) {
    const line = buildEventReaction(journey, {}, always, { band });
    assert.ok(line && !/clean call|appreciate the paper trail/.test(line), `${band}: ${line}`);
  }
  journey.resources.politicalCapital = 0;
  assert.equal(buildEventReaction(journey, {}, always, { band: 'good' }), null);
});
