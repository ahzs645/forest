/**
 * Set-Piece Scenes
 * Composed frame decks built on the textmode toolkit: the night camp
 * (ascii-anim starfield + gas-lantern ideas), debrief fireworks (particle
 * port), and the desk-mode ambience (office window, approval stamp, board
 * chart) that give planning, permitting, and manager days their motion.
 */

import { createGrid, hash, seededRandom } from './grid.js';
import { createWeatherPainter } from './effects.js';

const TENT = [
  '    /\\    ',
  '   /  \\   ',
  '  / /\\ \\  ',
  ' /_/__\\_\\ ',
];

/**
 * Night camp: a starfield twinkling over the tent, lantern pulsing beside
 * it. Played when the crew ends a shift.
 * @param {Object} opts
 * @returns {string[]}
 */
export function buildNightCampFrames({ frames = 12, seed = 9 } = {}) {
  const cols = 44;
  const rows = 10;
  const rand = seededRandom(seed);
  const stars = [];
  for (let i = 0; i < 26; i++) {
    stars.push({
      x: Math.floor(rand() * cols),
      y: Math.floor(rand() * 5),
      phase: Math.floor(rand() * 5),
    });
  }

  const deck = [];
  for (let f = 0; f < frames; f++) {
    const grid = createGrid(cols, rows);
    for (const star of stars) {
      const tick = (f + star.phase) % 5;
      grid.set(star.x, star.y, tick === 0 ? '+' : tick === 2 ? '*' : '.');
    }
    // Ridge, tent, ground
    grid.text('‾\\_'.repeat(15).slice(0, cols), 0, 5);
    for (let r = 0; r < TENT.length; r++) {
      grid.sprite(TENT[r], 6, 4 + r);
    }
    grid.hline(0, rows - 2, cols, '_');
    // Lantern on a post, pulsing
    const glow = f % 3 === 0 ? '(*)' : '(o)';
    grid.text('|', 24, 6);
    grid.text('|', 24, 7);
    grid.text(glow, 23, 5);
    grid.text('z'.repeat(1 + (f % 3)), 17, 4);
    deck.push(grid.toString());
  }
  return deck;
}

/**
 * Fireworks (ascii-anim port, monochrome): rockets climb, burst into
 * gravity-pulled sparks. For A-grade debriefs and campaign year-ends.
 * @param {Object} opts
 * @returns {string[]}
 */
export function buildFireworksFrames({ frames = 26, bursts = 3, seed = 13 } = {}) {
  const cols = 44;
  const rows = 12;
  const rand = seededRandom(seed);
  const sparkChars = ['*', '+', '.', 'x', "'"];

  // Precompute rocket launches and burst particles.
  const rockets = [];
  for (let b = 0; b < bursts; b++) {
    const launchFrame = Math.floor(b * (frames / (bursts + 1)));
    const x = 8 + Math.floor(rand() * (cols - 16));
    const apexRow = 2 + Math.floor(rand() * 3);
    const climb = 5 + Math.floor(rand() * 2);
    const particles = [];
    const count = 12 + Math.floor(rand() * 8);
    for (let p = 0; p < count; p++) {
      const angle = (p / count) * Math.PI * 2;
      const speed = 0.8 + rand() * 1.4;
      particles.push({
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.55,
        ch: sparkChars[Math.floor(rand() * sparkChars.length)],
      });
    }
    rockets.push({ launchFrame, x, apexRow, climb, particles });
  }

  const deck = [];
  for (let f = 0; f < frames; f++) {
    const grid = createGrid(cols, rows);
    grid.hline(0, rows - 1, cols, '_');
    for (const rocket of rockets) {
      const age = f - rocket.launchFrame;
      if (age < 0) continue;
      if (age < rocket.climb) {
        // Climbing: a spark with a short tail.
        const y = rows - 2 - Math.floor((age / rocket.climb) * (rows - 2 - rocket.apexRow));
        grid.set(rocket.x, y, '|');
        grid.set(rocket.x, Math.min(rows - 2, y + 1), '.');
      } else {
        const t = age - rocket.climb;
        if (t > 8) continue;
        for (const particle of rocket.particles) {
          const px = Math.round(rocket.x + particle.vx * t);
          const py = Math.round(rocket.apexRow + particle.vy * t + 0.12 * t * t);
          if (py >= rows - 1) continue;
          if (t > 5 && (hash(px * 31 + py * 7 + t) % 3) === 0) continue; // fade
          grid.set(px, py, t < 2 ? '@' : particle.ch);
        }
      }
    }
    deck.push(grid.toString());
  }
  return deck;
}

/**
 * The office window: season and weather outside, coffee steaming inside.
 * Desk-mode ambience, played at the top of a planning/permitting day.
 * @param {Object} opts
 * @param {string} [opts.weatherId]
 * @param {string} [opts.season]
 * @returns {string[]}
 */
export function buildOfficeWindowFrames({ weatherId = null, season = null, frames = 10, seed = 15 } = {}) {
  const cols = 44;
  const rows = 9;
  const winCol = 4;
  const winRow = 1;
  const winW = 22;
  const winH = 6;
  const paintWeather = createWeatherPainter(weatherId, {
    cols: winW - 2,
    rows: winH - 2,
    frames,
    seed,
  });
  const treeline = season === 'winter'
    ? '/\\ .. /\\ . /\\ ..'
    : season === 'fall'
      ? '/\\ ,, /\\ , /\\ ,,'
      : '/\\ /\\ ^ /\\ /\\ ^ ';

  const deck = [];
  for (let f = 0; f < frames; f++) {
    const grid = createGrid(cols, rows);
    grid.box(winCol, winRow, winW, winH);
    grid.set(winCol + Math.floor(winW / 2), winRow, '┬');
    for (let r = 1; r < winH - 1; r++) grid.set(winCol + Math.floor(winW / 2), winRow + r, '│');

    // Outside: treeline at the sill, weather above it.
    grid.text(treeline.repeat(2).slice(0, winW - 2), winCol + 1, winRow + winH - 2);
    const pane = createGrid(winW - 2, winH - 2);
    paintWeather(pane, f);
    grid.sprite(pane.toString(), winCol + 1, winRow + 1);

    // Inside: the desk, the mug, the steam.
    grid.hline(2, rows - 2, cols - 4, '═');
    grid.text('[_]', cols - 12, rows - 3);
    const steam = f % 2 === 0 ? ')' : '(';
    grid.set(cols - 11, rows - 4, steam);
    grid.text(season ? season.toUpperCase() : '', winCol + 1, rows - 1);
    deck.push(grid.toString());
  }
  return deck;
}

/**
 * The approval stamp: descends onto the document and leaves its mark.
 * @param {string} [text]
 * @param {Object} [opts]
 * @returns {string[]}
 */
export function buildStampFrames(text = 'APPROVED', { frames = 10 } = {}) {
  const cols = 44;
  const rows = 9;
  const docCol = 8;
  const docW = 28;
  const label = ` ${text} `;
  const labelCol = docCol + Math.floor((docW - label.length) / 2);

  const deck = [];
  for (let f = 0; f < frames; f++) {
    const grid = createGrid(cols, rows);
    // The document
    grid.box(docCol, 3, docW, 5);
    grid.hline(docCol + 2, 4, docW - 8, '─');
    grid.hline(docCol + 2, 5, docW - 12, '─');

    const t = f / Math.max(1, frames - 1);
    if (t < 0.5) {
      // Stamp descending
      const stampRow = Math.floor(t * 2 * 4);
      grid.text('▄▄▄▄', labelCol + 2, Math.max(0, stampRow));
      grid.text('|  |', labelCol + 2, Math.max(0, stampRow - 1));
    } else {
      // The mark, with an impact ring on the first frame after contact
      if (t < 0.62) {
        grid.text('\\ ' + ' '.repeat(label.length - 4) + ' /', labelCol - 1, 5);
      }
      grid.text(`[${label}]`, labelCol - 1, 6);
    }
    deck.push(grid.toString());
  }
  return deck;
}

/**
 * The board chart: quarterly metrics drawing themselves left to right,
 * one sparkbar per metric.
 * @param {Array<{label: string, value: number}>} metrics - values 0..100
 * @param {Object} [opts]
 * @returns {string[]}
 */
export function buildBoardChartFrames(metrics, { frames = 12 } = {}) {
  const cols = 44;
  const rows = Math.max(4, metrics.length + 2);
  const labelW = 14;
  const barW = cols - labelW - 6;

  const deck = [];
  for (let f = 0; f < frames; f++) {
    const t = f / Math.max(1, frames - 1);
    const grid = createGrid(cols, rows);
    grid.text('Q REVIEW', 1, 0);
    metrics.forEach((metric, i) => {
      const row = i + 1;
      grid.text(String(metric.label).slice(0, labelW - 1).padEnd(labelW), 1, row);
      const target = Math.max(0, Math.min(1, (metric.value || 0) / 100));
      const filled = Math.round(target * barW * Math.min(1, t * 1.4));
      grid.text('▮'.repeat(filled).padEnd(barW, '·'), labelW + 1, row);
      if (t >= 0.99 || filled >= Math.round(target * barW)) {
        grid.text(String(Math.round(metric.value || 0)).padStart(3), labelW + barW + 2, row);
      }
    });
    deck.push(grid.toString());
  }
  return deck;
}
