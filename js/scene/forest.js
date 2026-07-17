/**
 * Career Forest
 * A port of ascii-anim's honeytree forest (the pure sprite/biome/compositor
 * layer, de-Reactified) recast as the game's living service record: every
 * completed run plants a tree on the landing hub. Species come from the
 * role that ran, growth from how the run went, and the biome tier
 * (clearing → ancient) from the career total — so the hub visibly grows
 * old with the player. Deterministic from the record: no state to save.
 *
 * Colors are CSS classes resolved by the active theme, never inline hex.
 */

import { hash, seededRandom } from './textmode/grid.js';

// char → CSS class suffix (rendered as .cf-<suffix>)
function parseSprite(tpl, pal) {
  const lines = tpl.replace(/^\n/, '').replace(/\n$/, '').split('\n');
  const width = Math.max(...lines.map((l) => l.length));
  const rows = lines
    .map((l) => l.padEnd(width, ' '))
    .map((l) => Array.from(l, (ch) => (pal[ch] ? ['█', pal[ch]] : [' ', null])))
    .reverse(); // bottom row first, composited upward from the ground
  return { rows, width };
}

// BC species on the honeytree geometry. Palette keys: canopy (c), canopy
// dark (C), canopy bright (h), trunk (t), pale trunk (b), bloom (p/P).
const SPRITES = {
  pine: {
    seed: parseSprite(' c\n t', { c: 'canopy-deep', t: 'trunk-dark' }),
    sapling: parseSprite('  c\n cc\nccc\n t', { c: 'canopy-deep', t: 'trunk-dark' }),
    young: parseSprite('   c\n  ccc\n cCCCc\nccCCCC\n   t\n   t', { c: 'canopy-deep', C: 'canopy-dark', t: 'trunk-dark' }),
    full: parseSprite('    c\n   ccc\n  cCCCc\n cCCCCCc\nccCCCCCC\n cCCCCC\n    t\n    t', { c: 'canopy-deep', C: 'canopy-dark', t: 'trunk-dark' }),
  },
  spruce: {
    seed: parseSprite(' c\n t', { c: 'canopy-dark', t: 'trunk' }),
    sapling: parseSprite('  c\n cc\nccc\n t', { c: 'canopy-dark', t: 'trunk' }),
    young: parseSprite('  c\n ccc\nccccc\n  t\n  t', { c: 'canopy-dark', t: 'trunk' }),
    full: parseSprite('   c\n  ccc\n ccccc\nccccccc\n ccccc\n   t\n   t', { c: 'canopy-dark', t: 'trunk' }),
  },
  aspen: {
    seed: parseSprite(' c\n b', { c: 'canopy-light', b: 'trunk-pale' }),
    sapling: parseSprite(' cc\nchc\n b', { c: 'canopy-light', h: 'canopy-bright', b: 'trunk-pale' }),
    young: parseSprite('  hc\n hccc\nccchhc\n  bb\n  bb', { c: 'canopy-light', h: 'canopy-bright', b: 'trunk-pale' }),
    full: parseSprite('   hh\n hccch\nccchhcc\n hccch\n   bb\n   bb', { c: 'canopy-light', h: 'canopy-bright', b: 'trunk-pale' }),
  },
  cottonwood: {
    seed: parseSprite(' c\n t', { c: 'canopy-light', t: 'trunk' }),
    sapling: parseSprite(' ccc\nccccc\n ttt', { c: 'canopy-light', t: 'trunk' }),
    young: parseSprite('  cccc\n cccccc\ncc ccc cc\ncc     cc\n   tt\n   tt', { c: 'canopy-light', t: 'trunk' }),
    full: parseSprite('   ccccc\n cccccccc\ncc ccccc cc\ncc  ccc  cc\ncc       cc\n    tt\n    tt', { c: 'canopy-light', t: 'trunk' }),
  },
  dogwood: {
    seed: parseSprite(' p\n t', { p: 'bloom', t: 'trunk-light' }),
    sapling: parseSprite(' pp\npPp\n t', { p: 'bloom-bright', P: 'bloom', t: 'trunk-light' }),
    young: parseSprite('  pP\n pPPp\npPPpPP\n  tt\n  tt', { p: 'bloom-bright', P: 'bloom', t: 'trunk-light' }),
    full: parseSprite('   pPp\n pPPPPp\npPPpPPPp\n pPPPpp\n   tt\n   tt', { p: 'bloom-bright', P: 'bloom', t: 'trunk-light' }),
  },
};

// Which species each service-record bucket plants.
const SPECIES_BY_BUCKET = {
  recon: 'pine',
  field: 'pine',
  silviculture: 'spruce',
  planning: 'aspen',
  permitting: 'cottonwood',
  desk: 'cottonwood',
  manager: 'dogwood',
  seasonal: 'aspen',
  'crisis-command': 'pine',
};

export function getSprite(type, growth) {
  const s = SPRITES[type] || SPRITES.aspen;
  if (growth < 0.2) return s.seed;
  if (growth < 0.5) return s.sapling;
  if (growth < 0.8) return s.young;
  return s.full;
}

// Biome tiers by stand count (honeytree's arc, forestry labels).
export const BIOMES = [
  { min: 0, density: 14, glyphs: ['·', '.', ' ', ' '], label: 'clearing' },
  { min: 4, density: 9, glyphs: ['·', '·', '*', '.'], label: 'regen stand' },
  { min: 10, density: 7, glyphs: ['·', '*', '+', '·', '.'], label: 'young forest' },
  { min: 20, density: 6, glyphs: ['*', '+', '·', '·', '.'], label: 'old growth' },
  { min: 40, density: 5, glyphs: ['*', '+', '·', '*', '^', '.'], label: 'ancient forest' },
];

export function getBiome(count) {
  let biome = BIOMES[0];
  for (const b of BIOMES) {
    if (count >= b.min) biome = b;
  }
  return biome;
}

const SKY_ROWS = 4;
const TREE_ROWS = 8;
const GROUND_ROWS = 2;
export const SCENE_ROWS = SKY_ROWS + TREE_ROWS + GROUND_ROWS;
const MIN_GAP = 3;
const MAX_TREES = 42;

function findOpenX(trees, type, growth, width, rand) {
  const sprite = getSprite(type, growth);
  const half = Math.floor(sprite.width / 2);
  const margin = half + 1;
  const ranges = trees.map((t) => {
    const sp = getSprite(t.type, t.growth);
    const h2 = Math.floor(sp.width / 2);
    return [t.x - h2 - MIN_GAP, t.x + h2 + MIN_GAP];
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = margin + Math.floor(rand() * Math.max(1, width - margin * 2));
    const collides = ranges.some(([l, r]) => x - half < r && x + half > l);
    if (!collides) return x;
  }
  return margin + Math.floor(rand() * Math.max(1, width - margin * 2));
}

/**
 * Derive the stand from a service record. Victorious runs stand full-grown;
 * the rest made it partway. Placement is hash-deterministic, so the same
 * record always grows the same forest.
 * @param {Object|null} record - from js/career.js loadServiceRecord()
 * @param {number} [cols]
 * @returns {{trees: Array, biome: Object, count: number}}
 */
export function buildCareerStand(record, cols = 64) {
  const trees = [];
  const byRole = record?.byRole || {};
  const buckets = Object.keys(byRole).sort();
  for (const bucket of buckets) {
    const stats = byRole[bucket] || {};
    const runs = Math.max(0, Number(stats.runs) || 0);
    const victories = Math.max(0, Number(stats.victories) || 0);
    const type = SPECIES_BY_BUCKET[bucket] || 'aspen';
    const rand = seededRandom(hash(bucket.length * 131 + runs * 17 + 5));
    for (let i = 0; i < runs && trees.length < MAX_TREES; i++) {
      const growth = i < victories ? 1 : 0.3 + (hash(i * 31 + runs) % 40) / 100;
      trees.push({ type, growth, x: findOpenX(trees, type, growth, cols, rand) });
    }
  }
  return { trees, biome: getBiome(trees.length), count: trees.length };
}

function mkBuf(w, h) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => ({ ch: ' ', cls: null })));
}

function placeStars(buf, w, biome, twinkle) {
  for (let x = 0; x < w; x++) {
    const h2 = hash(x + w * 17 + twinkle * 101);
    if (h2 % biome.density !== 0) continue;
    const y = h2 % SKY_ROWS;
    buf[y][x] = { ch: biome.glyphs[h2 % biome.glyphs.length], cls: 'star' };
  }
}

function placeGround(buf, w) {
  const gy = SKY_ROWS + TREE_ROWS;
  for (let r = 0; r < GROUND_ROWS; r++) {
    for (let x = 0; x < w; x++) {
      buf[gy + r][x] = { ch: '█', cls: r === 0 ? 'ground' : 'ground-deep' };
    }
  }
}

function compositeSprite(buf, sprite, cx, baseY, w) {
  const ox = cx - Math.floor(sprite.width / 2);
  for (let ri = 0; ri < sprite.rows.length; ri++) {
    const ty = baseY - ri;
    if (ty < 0 || ty >= buf.length) continue;
    for (let ci = 0; ci < sprite.rows[ri].length; ci++) {
      const tx = ox + ci;
      if (tx < 0 || tx >= w) continue;
      const [ch, cls] = sprite.rows[ri][ci];
      if (cls) buf[ty][tx] = { ch, cls };
    }
  }
}

/**
 * Build the scene buffer: sky (twinkling by biome), stand, ground.
 * @param {Array} trees - from buildCareerStand
 * @param {number} cols
 * @param {number} twinkle - tick that reshuffles the stars
 * @returns {Array<Array<{ch: string, cls: string|null}>>}
 */
export function buildForestBuffer(trees, cols, twinkle = 0) {
  const biome = getBiome(trees.length);
  const buf = mkBuf(cols, SCENE_ROWS);
  placeStars(buf, cols, biome, twinkle);
  placeGround(buf, cols);
  const baseY = SKY_ROWS + TREE_ROWS - 1;
  for (const tree of trees) {
    compositeSprite(buf, getSprite(tree.type, tree.growth), tree.x, baseY, cols);
  }
  return buf;
}

function escapeHtml(ch) {
  if (ch === '<') return '&lt;';
  if (ch === '>') return '&gt;';
  if (ch === '&') return '&amp;';
  return ch;
}

/**
 * Render the career forest as HTML rows of class-colored spans (adjacent
 * same-class cells merged), ready for a <pre> host on the landing hub.
 * @param {Object|null} record - service record
 * @param {Object} [opts]
 * @returns {{html: string, count: number, biomeLabel: string}}
 */
export function renderCareerForestHTML(record, { cols = 64, twinkle = 0 } = {}) {
  const { trees, biome, count } = buildCareerStand(record, cols);
  const buf = buildForestBuffer(trees, cols, twinkle);
  const rows = buf.map((row) => {
    let html = '';
    let i = 0;
    while (i < row.length) {
      const cls = row[i].cls;
      let text = '';
      let j = i;
      while (j < row.length && row[j].cls === cls) {
        text += escapeHtml(row[j].ch);
        j++;
      }
      html += cls ? `<span class="cf-${cls}">${text}</span>` : text;
      i = j;
    }
    return html;
  });
  return { html: rows.join('\n'), count, biomeLabel: biome.label };
}

/**
 * The silviculture stand strip: one glyph per block in the program, growing
 * as the crew plants and surveys. Plain characters so every renderer and
 * theme reads it.
 *   · not planted   ^ planted   ♠ surveyed free-growing
 * @param {Object} journey - silviculture journey
 * @returns {string|null}
 */
export function buildStandStrip(journey) {
  const planting = journey?.planting;
  if (!planting?.blocksToPlant) return null;
  const total = Math.max(1, planting.blocksToPlant);
  const planted = Math.min(total, Math.max(0, planting.blocksPlanted || 0));
  const surveyed = Math.min(planted, Math.max(0, journey?.surveys?.freeGrowingComplete || 0));

  const glyphs = [];
  for (let i = 0; i < total; i++) {
    if (i < surveyed) glyphs.push('♠');
    else if (i < planted) glyphs.push('^');
    else glyphs.push('·');
  }
  return `STAND [${glyphs.join(' ')}] ${planted}/${total} planted · ${surveyed} free-growing`;
}
