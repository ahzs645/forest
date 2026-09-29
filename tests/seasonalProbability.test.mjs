import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, drawSeasonalEvent } from '../js/engine.js';
import { makeRng } from '../js/engine/rng.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';
import { FIELD_EVENTS } from '../js/data/fieldEvents.js';

const JOKE_EVENT_IDS = ['alien_landing', 'sasquatch_sighting', 'celebrity_endorsement', 'social_media_viral'];

function tally(roleId, areaId, draws, seed = 11) {
  const rng = makeRng(seed);
  const counts = new Map();
  for (let index = 0; index < draws; index += 1) {
    // A fresh state per draw: no cooldowns, so every draw sees the whole pool.
    const state = createInitialState({ companyName: 'Draw Co', roleId, areaId });
    state.round = 1 + (index % 4);
    const card = drawSeasonalEvent(state, rng);
    if (!card) continue;
    counts.set(card.id, (counts.get(card.id) || 0) + 1);
  }
  return counts;
}

test('the seasonal draw honours the deck\'s probability: the legacy joke cards are rare', () => {
  const draws = 4000;
  for (const [roleId, areaId] of [['recce', 'okanagan-shuswap-drybelt'], ['silviculture', 'vancouver-island-coast'], ['recce', 'fort-st-john-plateau']]) {
    const counts = tally(roleId, areaId, draws);
    const jokes = JOKE_EVENT_IDS.reduce((sum, id) => sum + (counts.get(id) || 0), 0);
    const share = jokes / draws;
    // Fresh states sit at 50 on every metric, where a joke card earns every
    // metric bonus; over a real year (metrics drift up, cooldowns apply) the
    // four cards together land in about 6% of field-role years. Before the
    // draw honoured probability they were in four field years out of five.
    assert.ok(share < 0.03, `${roleId} @ ${areaId}: joke cards are ${(share * 100).toFixed(2)}% of draws`);
    assert.ok(JOKE_EVENT_IDS.every((id) => FIELD_EVENTS.some((event) => event.id === id && event.probability <= 0.005)),
      'the fixture jokes are still the rare cards of the expedition deck');
  }
});

test('a card at the deck\'s reference probability keeps its weight; a rarer one is drawn less', () => {
  const counts = tally('recce', 'fort-st-john-plateau', 6000, 23);
  const byProbability = (min, max) => FIELD_EVENTS
    .filter((event) => event.probability >= min && event.probability <= max)
    .reduce((sum, event) => sum + (counts.get(event.id) || 0), 0);
  const perCardRare = byProbability(0.001, 0.01) / Math.max(1, FIELD_EVENTS.filter((e) => e.probability >= 0.001 && e.probability <= 0.01 && counts.has(e.id)).length);
  const perCardNormal = byProbability(0.04, 0.08) / Math.max(1, FIELD_EVENTS.filter((e) => e.probability >= 0.04 && e.probability <= 0.08 && counts.has(e.id)).length);
  assert.ok(perCardNormal > perCardRare * 4, `a normal card (${perCardNormal.toFixed(1)}/card) outdraws a rare one (${perCardRare.toFixed(1)}/card) by well over 4x`);
});

test('probability-0 chain payoffs are never drawn cold in a seasonal year', () => {
  const zero = new Set([...FIELD_EVENTS, ...DESK_EVENTS].filter((event) => Number(event.probability) === 0).map((event) => event.id));
  assert.ok(zero.size > 0, 'the decks carry probability-0 payoffs');
  for (const [roleId, areaId] of [['recce', 'bulkley-valley'], ['planner', 'fraser-plateau'], ['permitter', 'skeena-nass']]) {
    const counts = tally(roleId, areaId, 2000, 5);
    const drawnCold = [...counts.keys()].filter((id) => zero.has(id));
    assert.deepEqual(drawnCold, [], `${roleId} @ ${areaId} drew a payoff cold`);
  }
});
