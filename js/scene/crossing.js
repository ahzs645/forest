/**
 * Crossing Scene
 * The river-crossing set piece, composed from ascii-anim techniques: a
 * flowing water band with a variance-walked edge (ascii-tide's generateEdge
 * idea), tree-lined banks from the travel strip's band grammar, and the
 * crew sprite at the water. Three decks: the approach (played behind the
 * decision), then a success or mishap resolution.
 */

import { createGrid, seededRandom } from './textmode/grid.js';

const WIDTH = 44;
const ROWS = 10;

const BANK_TREES = '/\\  ^ /\\   ╱╲  /\\ ^  ';

// Water rows by gauge index (low → flood): how much of the scene is river.
const WATER_DEPTH = [2, 3, 4, 5];

const CREW = [' o ', '/|\\', '/ \\'];
const CREW_BRACED = [' o ', '-|-', '/ \\'];

function drawBanksAndSky(grid, seed) {
  const rand = seededRandom(seed);
  for (let i = 0; i < 6; i++) {
    grid.set(Math.floor(rand() * WIDTH), 0, rand() < 0.5 ? '.' : '+');
  }
  grid.text(BANK_TREES.repeat(3).slice(0, WIDTH), 0, 1);
}

function drawWater(grid, { frame, depth, edge, top }) {
  for (let y = 0; y < depth; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const wobble = Math.floor(edge[x % edge.length] * (y === 0 ? 1 : 0));
      const row = top + y + wobble;
      if (row < top || row >= top + depth) continue;
      // Flow: pushed glyphs drift downstream a little faster each row down.
      const phase = (x + frame * (1 + y) + y * 3) % 7;
      grid.set(x, top + y, phase === 0 ? '≈' : phase === 3 ? '-' : '~');
    }
  }
}

function waterEdge(seed) {
  const rand = seededRandom(seed);
  const edge = [];
  let prev = 0;
  for (let x = 0; x < WIDTH; x++) {
    const step = rand() < 0.5 ? -1 : 1;
    prev = Math.max(-1, Math.min(1, prev + step));
    edge.push(prev);
  }
  return edge;
}

/**
 * The approach: crew on the near bank, river flowing, gauge readout.
 * @param {Object} ctx - crossing context from getCrossingContext
 * @param {Object} [opts]
 * @returns {string[]}
 */
export function buildCrossingApproachFrames(ctx, { frames = 12, seed = 21 } = {}) {
  const depth = WATER_DEPTH[ctx?.gaugeIndex ?? 1];
  const top = ROWS - 2 - depth;
  const edge = waterEdge(seed);
  const deck = [];

  for (let f = 0; f < frames; f++) {
    const grid = createGrid(WIDTH, ROWS);
    drawBanksAndSky(grid, seed);
    drawWater(grid, { frame: f, depth, edge, top });
    grid.hline(0, top - 1, WIDTH, '_');
    grid.hline(0, ROWS - 2, WIDTH, '_');
    for (let r = 0; r < CREW.length; r++) {
      grid.sprite(CREW[r], 3, Math.max(0, top - 4 + r));
    }
    grid.text(`GAUGE: ${ctx?.gaugeLabel || 'MODERATE'}`, WIDTH - 16, ROWS - 1);
    deck.push(grid.toString());
  }
  return deck;
}

/**
 * The resolution: the crew wades the channel. On a mishap, a crate breaks
 * loose and rides the current off-screen; on a swept outcome a head bobs
 * downstream before the crew hauls them out.
 * @param {Object} ctx - crossing context
 * @param {Object} result - result from fordCrossing/winchCrossing
 * @param {Object} [opts]
 * @returns {string[]}
 */
export function buildCrossingResolveFrames(ctx, result, { frames = 16, seed = 23 } = {}) {
  const depth = WATER_DEPTH[ctx?.gaugeIndex ?? 1];
  const top = ROWS - 2 - depth;
  const edge = waterEdge(seed);
  const mishap = Boolean(result?.mishap);
  const swept = result?.severity === 'swept';
  const deck = [];

  for (let f = 0; f < frames; f++) {
    const grid = createGrid(WIDTH, ROWS);
    drawBanksAndSky(grid, seed);
    drawWater(grid, { frame: f, depth, edge, top });
    grid.hline(0, top - 1, WIDTH, '_');
    grid.hline(0, ROWS - 2, WIDTH, '_');

    // The crew works across the water over the deck's run.
    const t = f / Math.max(1, frames - 1);
    const crewX = 3 + Math.floor(t * (WIDTH - 10));
    const inWater = crewX > 6 && crewX < WIDTH - 8;
    const pose = inWater ? CREW_BRACED : CREW;
    const crewTop = inWater ? top - 2 : top - 4;
    for (let r = 0; r < pose.length; r++) {
      const row = crewTop + r;
      if (row >= top + depth - 1 && inWater) break; // legs under water
      grid.sprite(pose[r], crewX, Math.max(0, row));
    }

    if (mishap && f > frames / 3) {
      // A crate rides the current downstream, faster than the crew.
      const crateX = crewX + 3 + Math.floor((f - frames / 3) * 2.5);
      if (crateX < WIDTH - 1) {
        grid.sprite('▯', crateX, top + 1);
      }
      if (swept) {
        const headX = crewX + 2 + Math.floor((f - frames / 3) * 1.5);
        if (headX < WIDTH - 2) {
          grid.set(headX, top + (f % 2 === 0 ? 1 : 2), 'o');
        }
      }
    }

    deck.push(grid.toString());
  }
  return deck;
}
