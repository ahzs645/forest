/**
 * Textmode Effects
 * Procedural frame-deck builders ported from the ascii-anim library's
 * textmode modules (ascii-fire, ascii-rain, text-morph), reworked for this
 * game's scene contract: pure string frames, deterministic given a seed,
 * monochrome so every renderer and theme shows them faithfully.
 */

import { createGrid, seededRandom } from './grid.js';

// Classic luminance ramp (ascii-anim's fire ramp): index by intensity.
const FIRE_RAMP = ' .:-=+*#%@';

/**
 * Cellular fire (ascii-anim ascii-fire port): heat seeds along the bottom
 * row propagate upward with decay, mapped through the luminance ramp.
 * @param {Object} opts
 * @param {number} opts.cols
 * @param {number} opts.rows
 * @param {number} opts.frames
 * @param {number} opts.seed
 * @param {number} [opts.intensity] - 0..1 scale of the blaze
 * @returns {string[]}
 */
export function buildFireFrames({ cols = 44, rows = 10, frames = 16, seed = 1, intensity = 1 } = {}) {
  const rand = seededRandom(seed);
  const maxHeat = 9;
  const buffer = new Array(cols * rows).fill(0);
  const deck = [];

  // Warm the buffer before capturing so frame 0 is already burning.
  const warmup = rows;
  for (let f = 0; f < warmup + frames; f++) {
    for (let x = 0; x < cols; x++) {
      buffer[(rows - 1) * cols + x] = rand() > 0.4 - intensity * 0.15
        ? maxHeat * intensity + rand() * 2
        : 0;
    }
    for (let y = 0; y < rows - 1; y++) {
      for (let x = 0; x < cols; x++) {
        const below = (y + 1) % rows;
        const src = (
          buffer[below * cols + ((x - 1 + cols) % cols)] +
          buffer[below * cols + x] +
          buffer[below * cols + ((x + 1) % cols)] +
          buffer[((y + 2) % rows) * cols + x]
        ) / 4;
        buffer[y * cols + x] = Math.max(0, src - rand() * 0.9);
      }
    }

    if (f < warmup) continue;
    const grid = createGrid(cols, rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const heat = Math.min(FIRE_RAMP.length - 1, Math.floor(buffer[y * cols + x]));
        if (heat > 0) grid.set(x, y, FIRE_RAMP[heat]);
      }
    }
    deck.push(grid.toString());
  }

  return deck;
}

const CAMPFIRE_LOGS = '  ___/____\\___  ';

/**
 * A small campfire scene: cellular fire over crossed logs, framed for the
 * milestone camp interstitials and rest beats.
 * @param {Object} opts
 * @returns {string[]}
 */
export function buildCampfireFrames({ frames = 16, seed = 7 } = {}) {
  const cols = 44;
  const rows = 10;
  const fireCols = 16;
  const fireRows = 7;
  const fire = buildFireFrames({ cols: fireCols, rows: fireRows, frames, seed, intensity: 0.8 });
  const offCol = Math.floor((cols - fireCols) / 2);
  const rand = seededRandom(seed + 1);
  const stars = [];
  for (let i = 0; i < 8; i++) {
    stars.push({ x: Math.floor(rand() * cols), y: Math.floor(rand() * 2), tick: Math.floor(rand() * 4) });
  }

  return fire.map((flameFrame, f) => {
    const grid = createGrid(cols, rows);
    for (const star of stars) {
      grid.set(star.x, star.y, (f + star.tick) % 4 === 0 ? '+' : '.');
    }
    grid.sprite(flameFrame, offCol, 1);
    grid.text(CAMPFIRE_LOGS, offCol, fireRows + 1);
    grid.hline(0, rows - 1, cols, '_');
    return grid.toString();
  });
}

const GLITCH_CHARS = '!<>-_\\/[]{}=+*^?#________';

/**
 * Text scramble morph (ascii-anim text-morph port): `from` decodes into `to`
 * through per-character glitch windows. One clean pass, no loop.
 * @param {string} from
 * @param {string} to
 * @param {Object} opts
 * @returns {string[]}
 */
export function buildTextMorphFrames(from, to, { cols = 44, rows = 5, frames = 22, seed = 3 } = {}) {
  const rand = seededRandom(seed);
  const source = String(from ?? '');
  const target = String(to ?? '');
  const length = Math.max(source.length, target.length);
  const settle = Math.max(6, frames - 6);
  const queue = [];
  for (let i = 0; i < length; i++) {
    const start = Math.floor(rand() * (settle / 2));
    queue.push({
      from: source[i] || ' ',
      to: target[i] || ' ',
      start,
      end: start + 2 + Math.floor(rand() * (settle - start)),
    });
  }

  const row = Math.floor(rows / 2);
  const deck = [];
  for (let f = 0; f < frames; f++) {
    const grid = createGrid(cols, rows);
    let output = '';
    for (const slot of queue) {
      if (f >= slot.end || f === frames - 1) {
        output += slot.to;
      } else if (f >= slot.start) {
        output += GLITCH_CHARS[Math.floor(rand() * GLITCH_CHARS.length)];
      } else {
        output += slot.from;
      }
    }
    grid.text(output, Math.max(0, Math.floor((cols - output.length) / 2)), row);
    deck.push(grid.toString());
  }
  return deck;
}

/**
 * Weather particle layer (ascii-anim ascii-rain port, condensed): returns a
 * per-frame painter the travel strip composes over its parallax rows. Rain
 * falls as tracked drops with ground splashes; snow drifts; clear is a no-op.
 * @param {string|null} weatherId
 * @param {Object} opts
 * @param {number} opts.cols
 * @param {number} opts.rows - rows available to weather (sky above ground line)
 * @param {number} opts.frames - total frames the deck will run
 * @param {number} [opts.seed]
 * @returns {(grid: Object, frame: number) => void}
 */
export function createWeatherPainter(weatherId, { cols = 44, rows = 4, frames = 14, seed = 5 } = {}) {
  const id = String(weatherId || '').toLowerCase();
  const isRain = /rain|storm|shower|wet/.test(id);
  const isSnow = /snow|flurr|blizzard/.test(id);
  if (!isRain && !isSnow) return () => {};

  const heavy = /heavy|storm|blizzard/.test(id);
  const rand = seededRandom(seed);
  const count = Math.floor(cols / (heavy ? 3 : 5));
  const drops = [];
  for (let i = 0; i < count; i++) {
    drops.push({
      x: Math.floor(rand() * cols),
      y: rand() * rows,
      speed: isSnow ? 0.3 + rand() * 0.4 : 0.8 + rand() * 1.2,
      drift: isSnow ? (rand() < 0.5 ? -0.3 : 0.3) : 0,
    });
  }

  // Precompute positions per frame so the painter stays pure per call.
  const frameStates = [];
  for (let f = 0; f < frames; f++) {
    const state = { drops: [], splashes: [] };
    for (const drop of drops) {
      drop.y += drop.speed;
      drop.x = (drop.x + drop.drift + cols) % cols;
      if (drop.y >= rows) {
        if (isRain) state.splashes.push(Math.floor(drop.x));
        drop.y -= rows;
        drop.x = Math.floor(rand() * cols);
      }
      state.drops.push({ x: Math.floor(drop.x), y: Math.floor(drop.y) });
    }
    frameStates.push(state);
  }

  const glyph = isSnow ? '*' : '/';
  return (grid, frame) => {
    const state = frameStates[frame % frameStates.length];
    if (!state) return;
    for (const drop of state.drops) {
      if (drop.y >= 0 && drop.y < rows) grid.set(drop.x, drop.y, glyph);
    }
    for (const x of state.splashes) {
      grid.set(x, rows, isSnow ? '*' : '.');
    }
  };
}
