/**
 * Hunt Scene
 * The Oregon Trail hunting break, terminal-sized: a moose works its way
 * across the strip and the player taps (or presses any key) the moment it
 * crosses the sight line. playFrames reports the frame the tap landed on;
 * scoreHunt turns that into how much meat reaches camp. No tap — the
 * animal wanders off and the crew forages the ordinary way.
 */

import { createGrid, seededRandom } from './textmode/grid.js';

export const HUNT_WIDTH = 44;
export const SIGHT_COL = Math.floor(HUNT_WIDTH / 2);
export const HUNT_FRAMES = 26;

const MOOSE = [
  ['\\/\\/  ', ' |===<', ' H  H '],
  ['\\/\\/  ', ' |===<', ' H H  '],
];
const MOOSE_HALF = 3;

/** Moose leading-edge x at a frame (it walks right to left). */
export function mooseXAt(frame) {
  const span = HUNT_WIDTH + 10;
  return HUNT_WIDTH + 4 - Math.floor((frame / (HUNT_FRAMES - 1)) * span);
}

/**
 * Build the hunt deck: brush rows, the sight line, the crossing moose.
 * @param {Object} [opts]
 * @returns {string[]}
 */
export function buildHuntFrames({ seed = 27 } = {}) {
  const rows = 9;
  const rand = seededRandom(seed);
  const brush = [];
  for (let i = 0; i < 14; i++) {
    brush.push({ x: Math.floor(rand() * HUNT_WIDTH), y: 2 + Math.floor(rand() * 2) });
  }

  const deck = [];
  for (let f = 0; f < HUNT_FRAMES; f++) {
    const grid = createGrid(HUNT_WIDTH, rows);
    grid.text('THE CREW NEEDS MEAT — TAP AT THE SIGHT LINE', 0, 0);
    for (const b of brush) grid.set(b.x, b.y, '"');
    grid.hline(0, 7, HUNT_WIDTH, '_');

    // The sight line
    for (let r = 2; r < 7; r++) grid.set(SIGHT_COL, r, '¦');
    grid.set(SIGHT_COL, 1, 'v');

    const x = mooseXAt(f);
    const pose = MOOSE[f % MOOSE.length];
    for (let r = 0; r < pose.length; r++) {
      grid.sprite(pose[r], x, 4 + r);
    }
    deck.push(grid.toString());
  }
  return deck;
}

/**
 * Score a tap: distance from the moose's center to the sight line.
 * @param {number} frameIndex - frame reported by playFrames
 * @returns {{quality: 'clean'|'grazing'|'miss', food: number, line: string}}
 */
export function scoreHunt(frameIndex) {
  const center = mooseXAt(frameIndex) + MOOSE_HALF;
  const distance = Math.abs(center - SIGHT_COL);
  if (distance <= 2) {
    return {
      quality: 'clean',
      food: 18,
      line: 'One clean shot. The crew spends the evening packing meat and saying nice things about you.',
    };
  }
  if (distance <= 6) {
    return {
      quality: 'grazing',
      food: 8,
      line: 'A rushed shot — the moose bolts, but the blood trail is short. Some meat reaches camp.',
    };
  }
  return {
    quality: 'miss',
    food: 0,
    line: 'The shot goes wide. The moose crashes off through the brush, insulted.',
  };
}
