/**
 * Landing Scene
 * Procedural ASCII hero for the landing screen: a BC treeline with a cloud
 * drifting one way, a bird flapping the other, and stars slowly twinkling —
 * the ascii-anim method (frame deck + interval), generated instead of
 * hand-drawn so overlays never smear the title block.
 */

const W = 52;
const H = 9;

const TREE_BIG = ['  /\\  ', ' /  \\ ', '/    \\', '  ||  '];
const TREE_MED = [' /\\ ', '/  \\', ' || '];

const TREES = [
  { x: 2, art: TREE_BIG },
  { x: 9, art: TREE_MED },
  { x: 14, art: TREE_BIG },
  { x: 21, art: TREE_MED }
];

const TITLE = [
  { x: 28, y: 2, text: 'BRITISH COLUMBIA' },
  { x: 28, y: 3, text: 'FORESTRY OPERATIONS' },
  { x: 28, y: 4, text: 'SIMULATOR v1.0.4' },
  { x: 28, y: 6, text: '"SUSTAINABILITY' },
  { x: 29, y: 7, text: 'THROUGH DATA"' }
];

const STARS = [
  { x: 8, y: 0 }, { x: 24, y: 0 }, { x: 47, y: 0 }, { x: 18, y: 1 }
];

function blank() {
  return Array.from({ length: H }, () => Array(W).fill(' '));
}

function stamp(grid, x, y, lines) {
  for (let r = 0; r < lines.length; r++) {
    const row = grid[y + r];
    if (!row) continue;
    const line = lines[r];
    for (let c = 0; c < line.length; c++) {
      const col = x + c;
      if (col < 0 || col >= W) continue;
      if (line[c] !== ' ') row[col] = line[c];
    }
  }
}

function buildFrame(step) {
  const grid = blank();

  // Stars twinkle on a slow cycle
  STARS.forEach((star, i) => {
    grid[star.y][star.x] = (step + i) % 4 === 0 ? '*' : '·';
  });

  // Cloud drifts right, wrapping; bird flies left, flapping
  const cloudX = ((step * 2) % (W + 12)) - 9;
  stamp(grid, cloudX, 0, [' .-~~-.', '(      )']);
  const birdX = W - 4 - ((step * 3) % (W + 8));
  stamp(grid, birdX, 1, [step % 2 === 0 ? '^v^' : 'v^v']);

  // Treeline: crowns sway one column on a slow gust
  const sway = step % 8 >= 6 ? 1 : 0;
  TREES.forEach((tree, i) => {
    const y = H - 1 - tree.art.length;
    stamp(grid, tree.x + (i % 2 === 1 ? sway : 0), y, tree.art);
  });

  // Ground
  grid[H - 1] = Array.from('~^~'.repeat(Math.ceil(W / 3)).slice(0, W));

  // Title block wins over any overlay that wandered into it
  for (const { x, y, text } of TITLE) {
    stamp(grid, x, y, [text]);
  }

  return grid.map((row) => row.join('')).join('\n');
}

/** The full deck; period chosen so cloud/bird/star cycles all resolve. */
export const landingSceneFrames = Array.from({ length: 32 }, (_, i) => buildFrame(i));

export const LANDING_SCENE_DELAY = 350;
