/**
 * Travel Strip
 * Procedurally generates the frame deck for the between-decisions travel
 * animation: a ridgeline and two parallax tree bands, a walking crew (or
 * truck on road terrain), a live weather particle layer (rain splashes,
 * drifting snow), optional wildlife crossing the trail, and a progress
 * track that fills as the day's distance lands. Pure string generation —
 * playback belongs to the scene player.
 */

import { createGrid, seededRandom } from './textmode/grid.js';
import { createWeatherPainter } from './textmode/effects.js';

const WIDTH = 44;

// Row layout, top to bottom.
const ROW_RIDGE = 1;
const ROW_FAR = 2;
const ROW_NEAR = 3;
const ROW_GROUND = 4;
const ROW_SPRITE = 5;     // 3 rows tall
const ROW_TRACK = 8;
const ROWS = 9;

const WALKER = [
  [' o ', '/|\\', '/ \\'],
  [' o ', '/|\\', ' |\\'],
  [' o ', '/|\\', '/| '],
];

const TRUCK = [
  [' ____ ', '|__|_\\', ' O  O '],
  [' ____ ', '|__|_\\', ' o  o '],
];

// Small trail-crossers, drawn at ground level walking right-to-left.
const WILDLIFE = {
  moose: [
    ['\\/\\/ ', ' |==<', ' H  H'],
    ['\\/\\/ ', ' |==<', ' H H '],
  ],
  deer: [
    ['  \\/ ', ' |=< ', ' n n '],
    ['  \\/ ', ' |=< ', ' n n'],
  ],
  bear: [
    ['     ', ' /**\\', ' u  u'],
    ['     ', ' /**\\', ' u u '],
  ],
};

// A repeating tree band long enough to scroll through
function treeBand(seed, density) {
  const glyphs = ['/\\', '/\\', '^', '╱╲', '/\\'];
  let band = '';
  let i = seed;
  while (band.length < WIDTH * 2) {
    band += glyphs[i % glyphs.length] + ' '.repeat(2 + ((i * 7 + density) % 4));
    i += 1;
  }
  return band;
}

// A distant ridgeline: slow, sparse peaks.
function ridgeBand(seed) {
  const rand = seededRandom(seed);
  let band = '';
  while (band.length < WIDTH * 2) {
    const gap = 3 + Math.floor(rand() * 5);
    band += (rand() < 0.6 ? '‾\\' : '/‾') + '‾'.repeat(gap);
  }
  return band;
}

/**
 * Build the travel frame deck.
 * @param {Object} ctx
 * @param {number} ctx.progressBefore - 0..1 journey progress at day start
 * @param {number} ctx.progressAfter - 0..1 progress once the distance lands
 * @param {string} [ctx.weatherId] - journey.weather?.id
 * @param {string} [ctx.terrain] - current block terrain
 * @param {string} [ctx.pace] - slow | normal | fast | grueling
 * @param {number} [ctx.frameCount]
 * @param {string} [ctx.wildlife] - 'moose' | 'deer' | 'bear' crossing the trail
 * @param {number} [ctx.seed]
 * @returns {string[]} frames
 */
export function buildTravelFrames(ctx = {}) {
  const {
    progressBefore = 0,
    progressAfter = 0,
    weatherId = null,
    terrain = '',
    pace = 'normal',
    frameCount = 14,
    wildlife = null,
    seed = 3,
  } = ctx;

  const useTruck = /road|cutblock|gravel/.test(String(terrain).toLowerCase());
  const sprite = useTruck ? TRUCK : WALKER;
  const scrollStep = pace === 'grueling' ? 3 : pace === 'fast' ? 2 : 1;
  const paintWeather = createWeatherPainter(weatherId, {
    cols: WIDTH,
    rows: ROW_GROUND,
    frames: frameCount,
    seed: seed + 2,
  });
  const critter = WILDLIFE[wildlife] || null;

  const far = treeBand(3, 1);
  const near = treeBand(11, 2);
  const ridge = ridgeBand(seed);
  const frames = [];

  for (let f = 0; f < frameCount; f++) {
    const t = frameCount <= 1 ? 1 : f / (frameCount - 1);
    const progress = progressBefore + (progressAfter - progressBefore) * t;
    const grid = createGrid(WIDTH, ROWS);

    const ridgeOffset = Math.floor(f * scrollStep * 0.5) % WIDTH;
    const farOffset = (f * scrollStep) % WIDTH;
    const nearOffset = (f * scrollStep * 2) % WIDTH;
    grid.text(ridge.slice(ridgeOffset, ridgeOffset + WIDTH), 0, ROW_RIDGE);
    grid.text(far.slice(farOffset, farOffset + WIDTH), 0, ROW_FAR);
    grid.text(near.slice(nearOffset, nearOffset + WIDTH), 0, ROW_NEAR);
    grid.hline(0, ROW_GROUND, WIDTH, '_');

    // Weather falls over the bands; splashes land on the ground line.
    paintWeather(grid, f);

    const body = sprite[f % sprite.length];
    for (let r = 0; r < body.length; r++) {
      grid.sprite(body[r], 4, ROW_SPRITE + r);
    }

    // Wildlife crosses right-to-left ahead of the crew.
    if (critter) {
      const span = WIDTH + 8;
      const cx = WIDTH - Math.floor((f / Math.max(1, frameCount - 1)) * span) + 2;
      if (cx > 10 && cx < WIDTH - 4) {
        const pose = critter[f % critter.length];
        for (let r = 0; r < pose.length; r++) {
          grid.sprite(pose[r], cx, ROW_SPRITE + r);
        }
      }
    }

    const trackLen = WIDTH - 8;
    const clamped = Math.max(0, Math.min(1, progress));
    const filled = Math.round(clamped * trackLen);
    const track = `[${'='.repeat(filled)}${filled < trackLen ? '>' : ''}${'-'.repeat(Math.max(0, trackLen - filled - 1))}] ${String(Math.round(clamped * 100)).padStart(2)}%`;
    grid.text(track, 0, ROW_TRACK);

    frames.push(grid.toString());
  }

  return frames;
}
