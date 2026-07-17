import test from 'node:test';
import assert from 'node:assert/strict';

import { createGrid, renderDeck, hash, seededRandom } from '../js/scene/textmode/grid.js';
import {
  buildFireFrames,
  buildCampfireFrames,
  buildTextMorphFrames,
  createWeatherPainter,
} from '../js/scene/textmode/effects.js';
import { buildTravelFrames } from '../js/scene/travelStrip.js';

test('createGrid draws and renders fixed-size string frames', () => {
  const grid = createGrid(10, 3);
  grid.text('hi', 2, 1);
  grid.box(0, 0, 4, 3);
  const out = grid.toString();
  const lines = out.split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines.every((line) => line.length === 10));
  assert.equal(lines[0][0], '┌');
  assert.equal(lines[1][2], 'h');
  // Out-of-bounds writes are ignored, not thrown.
  grid.set(99, 99, 'x');
  grid.text('overflowing text well past the edge', 5, 1);
  assert.equal(grid.toString().split('\n')[1].length, 10);
});

test('sprite blits treat spaces as transparent', () => {
  const grid = createGrid(6, 2);
  grid.hline(0, 0, 6, '=');
  grid.sprite(' o ', 0, 0);
  assert.equal(grid.toString().split('\n')[0], '=o====');
});

test('hash and seededRandom are deterministic', () => {
  assert.equal(hash(42), hash(42));
  const a = seededRandom(9);
  const b = seededRandom(9);
  for (let i = 0; i < 5; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test('renderDeck produces one frame per index', () => {
  const deck = renderDeck((grid, f) => grid.text(String(f), 0, 0), { cols: 4, rows: 1, frames: 3 });
  assert.deepEqual(deck.map((frame) => frame[0]), ['0', '1', '2']);
});

test('fire frames are deterministic per seed and actually burn', () => {
  const a = buildFireFrames({ cols: 20, rows: 6, frames: 4, seed: 5 });
  const b = buildFireFrames({ cols: 20, rows: 6, frames: 4, seed: 5 });
  assert.deepEqual(a, b);
  assert.equal(a.length, 4);
  assert.ok(a.some((frame) => /[#%@]/.test(frame)), 'hot ramp characters appear');
  const c = buildFireFrames({ cols: 20, rows: 6, frames: 4, seed: 6 });
  assert.notDeepEqual(a, c);
});

test('campfire frames include logs, stars, and flame', () => {
  const deck = buildCampfireFrames({ frames: 6, seed: 2 });
  assert.equal(deck.length, 6);
  assert.ok(deck[0].includes('___/____\\___'));
  assert.ok(deck.some((frame) => /[.+]/.test(frame.split('\n')[0] + frame.split('\n')[1])), 'stars in the sky rows');
});

test('text morph starts on from-text and settles on to-text', () => {
  const deck = buildTextMorphFrames('SPRING', 'SUMMER', { cols: 20, rows: 3, frames: 18, seed: 1 });
  assert.equal(deck.length, 18);
  assert.ok(deck[0].includes('SPRING'));
  assert.ok(deck[deck.length - 1].includes('SUMMER'));
  assert.ok(!deck[deck.length - 1].includes('SPRING'));
});

test('weather painter rains, snows, and no-ops on clear', () => {
  const cols = 30;
  const paintRain = createWeatherPainter('heavy_rain', { cols, rows: 4, frames: 8, seed: 4 });
  const grid = createGrid(cols, 6);
  for (let f = 0; f < 8; f++) paintRain(grid, f);
  assert.ok(grid.toString().includes('/'), 'rain glyphs painted');

  const paintSnow = createWeatherPainter('light_snow', { cols, rows: 4, frames: 8, seed: 4 });
  const snowGrid = createGrid(cols, 6);
  for (let f = 0; f < 8; f++) paintSnow(snowGrid, f);
  assert.ok(snowGrid.toString().includes('*'), 'snow glyphs painted');

  const paintClear = createWeatherPainter('clear', { cols, rows: 4, frames: 8 });
  const clearGrid = createGrid(cols, 6);
  paintClear(clearGrid, 0);
  assert.equal(clearGrid.toString().trim(), '');
});

test('travel strip renders progress, terrain sprite, weather, and wildlife', () => {
  const walking = buildTravelFrames({
    progressBefore: 0.25,
    progressAfter: 0.5,
    weatherId: 'heavy_rain',
    terrain: 'dense_forest',
    pace: 'normal',
    frameCount: 8,
  });
  assert.equal(walking.length, 8);
  assert.ok(walking[0].includes('25%'));
  assert.ok(walking[7].includes('50%'));
  assert.ok(walking.some((frame) => frame.includes('/|\\')), 'walker sprite on foot terrain');
  assert.ok(walking.some((frame) => frame.includes('‾')), 'ridgeline present');

  const driving = buildTravelFrames({ terrain: 'road', frameCount: 4 });
  assert.ok(driving.some((frame) => frame.includes('|__|_\\')), 'truck sprite on road terrain');

  const withMoose = buildTravelFrames({ frameCount: 12, wildlife: 'moose' });
  assert.ok(withMoose.some((frame) => frame.includes('|==<')), 'moose crosses the strip');
});
