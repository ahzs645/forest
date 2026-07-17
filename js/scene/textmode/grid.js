/**
 * Scene Grid
 * A minimal character cell buffer for procedural scene generation. Drawing
 * helpers mirror ascii-anim's textmode surface (drawChar/drawText/drawHLine/
 * drawBox with top-left (col,row) coordinates) so animations ported from
 * that library land nearly verbatim. Scenes render grids to string frames
 * (`toString()`), which the shared scene player animates in every renderer —
 * the DOM terminal shows the <pre>, and the ASCII Grid view projects it.
 */

/**
 * Create a character grid.
 * @param {number} cols
 * @param {number} rows
 * @returns {Object} grid with drawing helpers
 */
export function createGrid(cols, rows) {
  const width = Math.max(1, Math.floor(cols));
  const height = Math.max(1, Math.floor(rows));
  const cells = new Array(width * height).fill(' ');

  const grid = {
    cols: width,
    rows: height,

    clear(ch = ' ') {
      cells.fill(ch);
    },

    set(col, row, ch) {
      if (col < 0 || col >= width || row < 0 || row >= height) return;
      if (typeof ch !== 'string' || !ch.length) return;
      cells[row * width + col] = ch[0];
    },

    get(col, row) {
      if (col < 0 || col >= width || row < 0 || row >= height) return ' ';
      return cells[row * width + col];
    },

    text(str, col, row) {
      const s = String(str ?? '');
      for (let i = 0; i < s.length; i++) {
        grid.set(col + i, row, s[i]);
      }
    },

    hline(col, row, len, ch = '─') {
      for (let i = 0; i < len; i++) grid.set(col + i, row, ch);
    },

    box(col, row, w, h) {
      if (w < 2 || h < 2) return;
      grid.set(col, row, '┌');
      grid.set(col + w - 1, row, '┐');
      grid.set(col, row + h - 1, '└');
      grid.set(col + w - 1, row + h - 1, '┘');
      for (let i = 1; i < w - 1; i++) {
        grid.set(col + i, row, '─');
        grid.set(col + i, row + h - 1, '─');
      }
      for (let i = 1; i < h - 1; i++) {
        grid.set(col, row + i, '│');
        grid.set(col + w - 1, row + i, '│');
      }
    },

    /** Blit a multiline string sprite; spaces are transparent by default. */
    sprite(str, col, row, { opaque = false } = {}) {
      const lines = String(str ?? '').split('\n');
      for (let r = 0; r < lines.length; r++) {
        const line = lines[r];
        for (let c = 0; c < line.length; c++) {
          if (!opaque && line[c] === ' ') continue;
          grid.set(col + c, row + r, line[c]);
        }
      }
    },

    toString() {
      const out = [];
      for (let r = 0; r < height; r++) {
        out.push(cells.slice(r * width, (r + 1) * width).join(''));
      }
      return out.join('\n');
    }
  };

  return grid;
}

/**
 * Render a frame deck by running a draw function over a fresh grid per frame.
 * @param {Function} drawFrame - (grid, frameIndex) => void
 * @param {Object} opts
 * @param {number} opts.cols
 * @param {number} opts.rows
 * @param {number} opts.frames
 * @returns {string[]}
 */
export function renderDeck(drawFrame, { cols = 44, rows = 10, frames = 12 } = {}) {
  const deck = [];
  for (let f = 0; f < frames; f++) {
    const grid = createGrid(cols, rows);
    drawFrame(grid, f);
    deck.push(grid.toString());
  }
  return deck;
}

/**
 * Deterministic integer hash (from ascii-anim's honeytree forest) — the
 * scene layer's stand-in for seeded randomness, so decks built from game
 * state render identically on every replay.
 * @param {number} n
 * @returns {number} unsigned 32-bit hash
 */
export function hash(n) {
  let v = n >>> 0;
  v = Math.imul(v ^ (v >>> 16), 0x45d9f3b) >>> 0;
  v = Math.imul(v ^ (v >>> 16), 0x45d9f3b) >>> 0;
  return (v ^ (v >>> 16)) >>> 0;
}

/**
 * A tiny deterministic PRNG built on the hash, for scene builders that want
 * varied-but-reproducible layouts from a numeric seed.
 * @param {number} seed
 * @returns {() => number} function yielding floats in [0, 1)
 */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = hash(state + 0x9e3779b9);
    return state / 0x100000000;
  };
}
