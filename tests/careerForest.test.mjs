import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCareerStand,
  buildForestBuffer,
  renderCareerForestHTML,
  getBiome,
  getSprite,
  buildStandStrip,
  SCENE_ROWS,
} from '../js/scene/forest.js';
import { getRandomWeather } from '../js/data/blocks.js';

const record = {
  runs: 7,
  byRole: {
    recon: { runs: 3, victories: 2, bestScore: 80, bestGrade: 'A' },
    silviculture: { runs: 2, victories: 1, bestScore: 60, bestGrade: 'B' },
    seasonal: { runs: 2, victories: 0, bestScore: 40, bestGrade: 'C' },
  },
  career: {},
};

test('career stand is deterministic and species follow roles', () => {
  const a = buildCareerStand(record, 64);
  const b = buildCareerStand(record, 64);
  assert.deepEqual(a, b);
  assert.equal(a.count, 7);
  assert.equal(a.trees.filter((t) => t.type === 'pine').length, 3);
  assert.equal(a.trees.filter((t) => t.type === 'spruce').length, 2);
  // Victorious runs stand full grown.
  assert.equal(a.trees.filter((t) => t.growth === 1).length, 3);
  assert.equal(a.biome.label, getBiome(7).label);
});

test('biome tiers climb with the record', () => {
  assert.equal(getBiome(0).label, 'clearing');
  assert.equal(getBiome(5).label, 'regen stand');
  assert.equal(getBiome(25).label, 'old growth');
  assert.equal(getBiome(50).label, 'ancient forest');
});

test('forest buffer has sky, trees, and ground rows', () => {
  const { trees } = buildCareerStand(record, 48);
  const buf = buildForestBuffer(trees, 48, 1);
  assert.equal(buf.length, SCENE_ROWS);
  assert.ok(buf.every((row) => row.length === 48));
  const groundRow = buf[SCENE_ROWS - 1];
  assert.ok(groundRow.every((cell) => cell.ch === '█' && cell.cls === 'ground-deep'));
  const flat = buf.flat();
  assert.ok(flat.some((cell) => cell.cls?.startsWith('canopy')), 'canopy cells present');
});

test('HTML rendering merges runs and escapes nothing dangerous', () => {
  const { html, count, biomeLabel } = renderCareerForestHTML(record, { cols: 48, twinkle: 2 });
  assert.equal(count, 7);
  assert.equal(biomeLabel, 'regen stand');
  assert.ok(html.includes('<span class="cf-'));
  assert.ok(!html.includes('<script'));
  assert.equal(html.split('\n').length, SCENE_ROWS);

  const empty = renderCareerForestHTML(null, { cols: 40 });
  assert.equal(empty.count, 0);
  assert.equal(empty.biomeLabel, 'clearing');
});

test('sprites grow through the four stages', () => {
  const stages = [0.1, 0.3, 0.6, 1].map((g) => getSprite('pine', g));
  for (let i = 1; i < stages.length; i++) {
    assert.ok(stages[i].rows.length >= stages[i - 1].rows.length);
  }
});

test('silviculture stand strip tracks planting and surveys', () => {
  const journey = {
    planting: { blocksToPlant: 6, blocksPlanted: 3 },
    surveys: { freeGrowingComplete: 1 },
  };
  const strip = buildStandStrip(journey);
  assert.ok(strip.includes('♠ ^ ^ · · ·'));
  assert.ok(strip.includes('3/6 planted'));
  assert.ok(strip.includes('1 free-growing'));
  assert.equal(buildStandStrip({}), null);
});

test('season-keyed weather shifts the distribution', () => {
  let winterSnow = 0;
  let summerSnow = 0;
  for (let i = 0; i < 300; i++) {
    const w = getRandomWeather(null, 5, 'winter');
    if (/snow|freezing/.test(w.id)) winterSnow++;
    const s = getRandomWeather(null, 5, 'summer');
    if (/snow|freezing/.test(s.id)) summerSnow++;
  }
  assert.ok(winterSnow > 90, `winter should be snowy (got ${winterSnow}/300)`);
  assert.ok(summerSnow < 20, `summer should almost never snow (got ${summerSnow}/300)`);
});
