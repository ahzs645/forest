/**
 * A living trail diorama. Inspired by ascii-anim's forest compositor,
 * Soothing Car, rain splashes and lantern flicker. Original game sprites;
 * no React runtime or gallery state. Rendering never advances the simulation.
 */
import { hash } from './textmode/grid.js';

const ROLES = { recon: 'On the trail', field: 'On the trail', silviculture: 'Regeneration crew',
  planning: 'Planning office', permitting: 'Permit desk', desk: 'Permit desk', manager: 'District office' };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));

export function trailState(journey, progress = 0) {
  const role = journey.journeyType || 'recon';
  const block = journey.blocks?.[journey.currentBlockIndex || 0];
  const next = journey.blocks?.[(journey.currentBlockIndex || 0) + 1];
  // Deliberately read only: the route helper initializes missing save fields.
  const obstruction = journey.routeConstraints?.find(c => c.status === 'active'
    && c.fromBlockId === (block?.id || null) && c.toBlockId === (next?.id || null));
  const weather = `${journey.weather?.id || ''} ${journey.weather?.name || ''}`.toLowerCase();
  const season = journey.season?.currentSeason || journey.season?.name || '';
  const place = block?.name || journey.area?.name || journey.operatingArea?.name || journey.zone?.name || ROLES[role] || 'District';
  const planted = clamp((journey.planting?.blocksPlanted || 0) / Math.max(1, journey.planting?.blocksToPlant || 1), 0, 1);
  return {
    role, title: ROLES[role] || 'On the trail', place, next: next?.name || null,
    day: journey.day || 1, progress: clamp(progress, 0, 100), planted,
    distance: clamp(journey.distanceTraveled, 0, Number.MAX_SAFE_INTEGER),
    weather, weatherLabel: journey.weather?.name || 'Clear skies', season,
    obstruction: obstruction?.kind || null,
    terrain: String(block?.terrain || '').toLowerCase(),
    crew: journey.crew?.filter(c => c.isActive !== false).length || (journey.protagonist ? 1 : 0),
    seed: hash((journey.currentBlockIndex || 0) * 41 + (journey.day || 1)),
    desk: ['planning', 'permitting', 'desk', 'manager'].includes(role),
  };
}

/** Choice beats are illustrative; only confirmed journey data changes progress. */
export function trailAction(label = '') {
  if (['camp', 'work', 'travel'].includes(label)) return label;
  if (/rest|camp|end shift|end day|sleep|breakfast/i.test(label)) return 'camp';
  if (/plant|seedling|brush|survey|inspect|ground.truth|work the block/i.test(label)) return 'work';
  if (/travel|pace|mainline|detour|traverse|walk|hike|shortcut/i.test(label)) return 'travel';
  if (/map|plan|file|review|permit|submit|approve|board/i.test(label)) return 'work';
  return null;
}

function surface(cols, rows) {
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ ch: ' ', tone: 'sky' })));
  const text = (str, x, y, tone = 'crew', opaque = false) => {
    String(str).split('\n').forEach((line, r) => [...line].forEach((ch, c) => {
      if (y + r >= 0 && y + r < rows && x + c >= 0 && x + c < cols && (opaque || ch !== ' ')) {
        cells[y + r][x + c] = { ch, tone };
      }
    }));
  };
  return { cells, text };
}

function tree(s, x, ground, tall, tone) {
  for (let r = 0; r < tall; r++) s.text('/' + '^'.repeat(r * 2) + '\\', x - r, ground - tall + r, tone);
  s.text('||', x, ground, 'trunk');
}

function person(s, x, y, frame, working = false) {
  const arms = working && frame % 4 > 1 ? '/|_' : '/|\\';
  s.text([' o ', arms, frame % 2 ? '/ >' : '/ \\'].join('\n'), x, y, 'crew');
}

export function renderTrailFrame(state, tick = 0, { cols = 72, rows = 18, action = null } = {}) {
  cols = Math.floor(clamp(cols, 44, 120));
  rows = Math.floor(clamp(rows, 14, 24));
  const s = surface(cols, rows);
  const ground = rows - 5;
  const night = action === 'camp';
  const moving = action === 'travel' && !state.obstruction && !state.desk;
  const scroll = moving ? tick : 0;
  const snow = /snow|blizzard|frost|freez|ice/.test(state.weather);
  const rain = /rain|storm|drizzle|wet/.test(state.weather);
  const mist = /fog|mist/.test(state.weather);

  // Far sky moves much more slowly than the roadside: parallax, not progress.
  if (night) {
    for (let x = 1; x < cols; x += 3) {
      const n = hash(x * 17 + state.seed);
      s.text((tick + n) % 9 === 0 ? '+' : '.', x, n % 5, 'stars');
    }
    s.text('(_)', cols - 9, 1, 'stars');
  } else {
    s.text(rain || snow ? '.----.' : '\\ | /\n -O-\n / | \\', cols - 12, 0, rain || snow ? 'cloud' : 'sun');
    for (let i = 0; i < 3; i++) {
      const x = ((i * 29 + Math.floor(tick / 4) + state.seed % 11) % (cols + 14)) - 10;
      s.text(' .--.\n(____)', x, 1 + i % 2, 'cloud');
    }
  }
  for (let x = -10; x < cols + 15; x += 18) {
    const px = x - Math.floor(scroll / 5) % 18;
    s.text('      /\\\n   __/  \\_\n__/        \\__', px, ground - 8, 'ridge');
  }
  for (let x = -5; x < cols + 12; x += 8) tree(s, x - Math.floor(scroll / 2) % 8, ground - 2, 3, 'forest');
  if (mist) s.text('~  ~~~~~     ~~~~   '.repeat(6), 0, ground - 4, 'cloud');
  for (let x = -2; x < cols + 12; x += 17) tree(s, x - scroll % 17, ground, 5, snow ? 'snow' : 'canopy');
  s.text('_'.repeat(cols), 0, ground + 1, 'ground');
  s.text((' .   ,    '.repeat(16)).slice(scroll % 10, scroll % 10 + cols), 0, rows - 1, 'ground');

  if (night) {
    s.text('    /\\\n   /  \\\n  / /\\ \\\n /_/__\\_\\', Math.floor(cols * .24), ground - 2, 'tent');
    s.text(tick % 2 ? ' )\n(,)' : ' (\n(*)', Math.floor(cols * .54), ground, 'fire');
    s.text('/=\\', Math.floor(cols * .54), ground + 2, 'trunk');
    person(s, Math.floor(cols * .66), ground - 1, 0);
  } else if (state.desk) {
    // The landscape remains visible through the office window.
    const left = Math.floor(cols * .16), right = cols - left;
    s.text('┌' + '─'.repeat(right - left - 1) + '┐', left, 1, 'office');
    for (let y = 2; y < ground; y++) {
      s.text('│', left, y, 'office'); s.text('│', right, y, 'office');
    }
    s.text('└' + '─'.repeat(right - left - 1) + '┘', left, ground, 'office');
    s.text('═'.repeat(cols - 6), 3, ground + 3, 'trunk');
    const x = Math.floor(cols * .34);
    if (state.role === 'planning') s.text('.-----------.\n| /\\..+.. X |\n|___/___/___|', x, ground, 'paper');
    else if (state.role === 'manager') {
      s.text('DISTRICT', x, ground, 'paper');
      s.text('▁▂▃▄▅▆▇'.slice(0, 2 + Math.floor(state.progress / 20)), x, ground + 1, 'paper');
    } else s.text('.--------.\n| FILES  |\n|________|', x, ground, 'paper');
    s.text(tick % 4 < 2 ? ' )' : ' (', right - 4, ground - 1, 'cloud');
    s.text('[_]o', right - 4, ground + 1, 'tent');
    if (action === 'work') s.text(tick % 2 ? ' /' : ' _', x + 13, ground + 1, 'crew');
  } else if (state.role === 'silviculture') {
    // Seedlings reflect blocks actually planted; they never grow from the clock.
    const count = Math.round(state.planted * 8);
    for (let i = 0; i < 8; i++) s.text(i < count ? '\\|/' : ' _ ', 3 + i * Math.floor((cols - 6) / 8), ground + 2, i < count ? 'seedling' : 'ground');
    person(s, Math.floor(cols * .38), ground - 1, tick, action === 'work');
    s.text('[::]', Math.floor(cols * .38) + 5, ground + 1, 'tent');
  } else {
    const truck = /road|cutblock|gravel|highway/.test(`${state.terrain} ${state.place.toLowerCase()}`);
    const x = Math.floor(cols * .24);
    if (truck) {
      s.text('   ____     \n _|_||_\\___ \n|__________|\n  O      O  ', x, ground - 1, 'truck', true);
      if (moving) s.text(tick % 2 ? '· :.' : '.· ', x - 4, ground + 1, 'ground');
    } else {
      for (let i = 0; i < Math.min(3, state.crew); i++) person(s, x - i * 5, ground, moving || action === 'work' ? tick + i : 0, action === 'work');
    }
    const markerX = cols - 20;
    s.text(`|> ${state.next ? 'NEXT' : 'BASE'}\n|`, markerX, ground - 1, 'sign');
    if (state.obstruction) {
      s.text(state.obstruction === 'washout' ? '\\      /\n \\~~~~/ ' : ' /o\\_\n/oOOo\\', cols - 17, ground + 1, 'danger');
      s.text('! CLOSED !', cols - 20, ground - 1, 'danger', true);
    } else if (/river|creek|water|crossing/.test(state.terrain)) {
      s.text(tick % 2 ? '~ ~~~  ~~~ ~' : '~~  ~~~  ~~~', cols - 17, ground + 2, 'water');
    }
  }
  // Particle rain/snow is bounded above the crew and office foreground.
  if (!night && (rain || snow)) {
    for (let i = 0; i < (rain ? 27 : 18); i++) {
      const n = hash(state.seed + i * 73);
      const y = (n + tick * (rain ? 2 : 1)) % Math.max(1, ground - 1);
      s.text(snow ? '*' : '/', (n + Math.floor(tick / 2)) % cols, y, snow ? 'snow' : 'water');
    }
    if (rain && !state.desk) s.text(tick % 2 ? '. v .  v' : 'v .  . v', 1, ground + 2, 'water');
  }
  return { cells: s.cells, text: s.cells.map(row => row.map(c => c.ch).join('')).join('\n') };
}
