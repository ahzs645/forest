import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNightCampFrames,
  buildFireworksFrames,
  buildOfficeWindowFrames,
  buildStampFrames,
  buildBoardChartFrames,
} from '../js/scene/textmode/scenes.js';
import { buildHuntFrames, scoreHunt, mooseXAt, SIGHT_COL, HUNT_FRAMES } from '../js/scene/hunt.js';

function assertRectangular(deck) {
  for (const frame of deck) {
    const lines = frame.split('\n');
    assert.ok(lines.every((line) => line.length === lines[0].length), 'frame rows equal width');
  }
}

test('night camp: stars twinkle over the tent and lantern', () => {
  const deck = buildNightCampFrames({ frames: 8, seed: 3 });
  assert.equal(deck.length, 8);
  assertRectangular(deck);
  assert.ok(deck[0].includes('/_/__\\_\\'), 'tent present');
  assert.ok(deck.some((f) => f.includes('(*)')), 'lantern pulses');
  assert.notEqual(deck[0], deck[2], 'stars twinkle between frames');
});

test('fireworks climb then burst with gravity', () => {
  const deck = buildFireworksFrames({ frames: 20, bursts: 2, seed: 8 });
  assert.equal(deck.length, 20);
  assertRectangular(deck);
  assert.ok(deck.slice(0, 6).some((f) => f.includes('|')), 'a rocket climbs early');
  assert.ok(deck.slice(8).some((f) => /[@*+x']/.test(f)), 'sparks appear after the burst');
});

test('office window shows weather outside and the season label', () => {
  const rainy = buildOfficeWindowFrames({ weatherId: 'heavy_rain', season: 'fall', frames: 6 });
  assert.equal(rainy.length, 6);
  assertRectangular(rainy);
  assert.ok(rainy.some((f) => f.includes('/')), 'rain outside the window');
  assert.ok(rainy[0].includes('FALL'));
  assert.ok(rainy[0].includes('┌'), 'window frame drawn');

  const clear = buildOfficeWindowFrames({ weatherId: 'clear', season: 'summer', frames: 4 });
  assert.ok(clear[0].includes('SUMMER'));
});

test('stamp descends and leaves its mark', () => {
  const deck = buildStampFrames('APPROVED', { frames: 10 });
  assert.equal(deck.length, 10);
  assertRectangular(deck);
  assert.ok(!deck[0].includes('[ APPROVED ]'), 'no mark before impact');
  assert.ok(deck[deck.length - 1].includes('[ APPROVED ]'), 'mark on the final frame');
});

test('board chart bars grow to their values', () => {
  const metrics = [
    { label: 'Operations', value: 80 },
    { label: 'Compliance', value: 40 },
  ];
  const deck = buildBoardChartFrames(metrics, { frames: 8 });
  assert.equal(deck.length, 8);
  assertRectangular(deck);
  const first = deck[0];
  const last = deck[deck.length - 1];
  const bars = (frame) => (frame.match(/▮/g) || []).length;
  assert.ok(bars(last) > bars(first), 'bars grow over the deck');
  assert.ok(last.includes(' 80'), 'value labels land');
});

test('hunt: moose crosses the sight line and scoring rewards timing', () => {
  const deck = buildHuntFrames({ seed: 4 });
  assert.equal(deck.length, HUNT_FRAMES);
  assertRectangular(deck);
  assert.ok(deck[0].includes('TAP AT THE SIGHT LINE'));
  assert.ok(deck.some((f) => f.includes('|===<')), 'moose walks the strip');

  // Find the frame where the moose center crosses the sight line.
  let bestFrame = 0;
  let bestDist = Infinity;
  for (let f = 0; f < HUNT_FRAMES; f++) {
    const d = Math.abs(mooseXAt(f) + 3 - SIGHT_COL);
    if (d < bestDist) {
      bestDist = d;
      bestFrame = f;
    }
  }
  assert.equal(scoreHunt(bestFrame).quality, 'clean');
  assert.ok(scoreHunt(bestFrame).food > 0);
  assert.equal(scoreHunt(0).quality, 'miss');
  assert.equal(scoreHunt(0).food, 0);
  assert.equal(scoreHunt(HUNT_FRAMES - 1).quality, 'miss');
});
