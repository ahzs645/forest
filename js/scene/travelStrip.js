/**
 * Travel Strip
 * Procedurally generates the frame deck for the between-decisions travel
 * animation: parallax tree line, a walking crew (or truck on road terrain),
 * weather overlay, and a progress track that fills as the day's distance
 * lands. Pure string generation — playback belongs to the scene player.
 */

const WIDTH = 44;

const WALKER = [
  [' o ', '/|\\', '/ \\'],
  [' o ', '/|\\', ' |\\'],
  [' o ', '/|\\', '/| '],
];

const TRUCK = [
  [' ____ ', '|__|_\\', ' O  O '],
  [' ____ ', '|__|_\\', ' o  o '],
];

function padTo(line, width = WIDTH) {
  return line.length >= width ? line.slice(0, width) : line + ' '.repeat(width - line.length);
}

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

function weatherLine(weatherId, frame, row) {
  if (!weatherId) return ' '.repeat(WIDTH);
  const id = String(weatherId).toLowerCase();
  let glyph = null;
  if (/rain|storm|shower|wet/.test(id)) glyph = '/';
  if (/snow|flurr|blizzard/.test(id)) glyph = '*';
  if (!glyph) return ' '.repeat(WIDTH);
  const chars = new Array(WIDTH).fill(' ');
  for (let i = 0; i < WIDTH; i += 5) {
    const offset = (i + frame * 2 + row * 3) % WIDTH;
    chars[offset] = glyph;
  }
  return chars.join('');
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
  } = ctx;

  const useTruck = /road|cutblock|gravel/.test(String(terrain).toLowerCase());
  const sprite = useTruck ? TRUCK : WALKER;
  const scrollStep = pace === 'grueling' ? 3 : pace === 'fast' ? 2 : 1;
  const frames = [];

  for (let f = 0; f < frameCount; f++) {
    const t = frameCount <= 1 ? 1 : f / (frameCount - 1);
    const progress = progressBefore + (progressAfter - progressBefore) * t;

    const far = treeBand(3, 1);
    const near = treeBand(11, 2);
    const farOffset = (f * scrollStep) % WIDTH;
    const nearOffset = (f * scrollStep * 2) % WIDTH;

    const body = sprite[f % sprite.length];
    const spriteCol = 4;
    const spriteRows = body.map((row) => padTo(' '.repeat(spriteCol) + row));

    const trackLen = WIDTH - 8;
    const filled = Math.round(Math.max(0, Math.min(1, progress)) * trackLen);
    const track = `[${'='.repeat(filled)}${filled < trackLen ? '>' : ''}${'-'.repeat(Math.max(0, trackLen - filled - 1))}] ${String(Math.round(progress * 100)).padStart(2)}%`;

    frames.push([
      weatherLine(weatherId, f, 0),
      padTo(far.slice(farOffset, farOffset + WIDTH)),
      padTo(near.slice(nearOffset, nearOffset + WIDTH)),
      '_'.repeat(WIDTH),
      ...spriteRows,
      padTo(track),
    ].join('\n'));
  }

  return frames;
}
