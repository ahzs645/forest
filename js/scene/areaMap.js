/**
 * Area Map
 * Synthesizes mapscii vector features from a journey's block list so the crew
 * can consult a Braille map of the traverse: route polyline, block points,
 * camp marker at the current position, and area labels. Deterministic per
 * journey (seeded by block ids) so the map doesn't shapeshift between looks.
 */

import { renderMapsciiFrame } from './mapscii/index.js';

// Small deterministic hash for stable per-block jitter
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Lay the journey's blocks along a winding west-to-east route in mapscii's
 * 0-100 world space.
 * @param {Object} journey
 * @returns {Array} mapscii feature list
 */
export function buildJourneyMapFeatures(journey) {
  const blocks = Array.isArray(journey.blocks) ? journey.blocks : [];
  if (!blocks.length) return [];

  const margin = 10;
  const span = 100 - margin * 2;
  const positions = blocks.map((block, index) => {
    const t = blocks.length === 1 ? 0.5 : index / (blocks.length - 1);
    const wobble = (hash(block.id || block.name || String(index)) % 36) - 18;
    return {
      x: margin + t * span,
      y: 50 + wobble,
    };
  });

  const features = [];

  // Operating-area frame
  features.push({
    type: 'polygon',
    points: [
      { x: 4, y: 10 }, { x: 96, y: 10 },
      { x: 96, y: 92 }, { x: 4, y: 92 },
    ],
  });

  // The route
  features.push({ type: 'line', width: 1, points: positions });

  // Blocks: surveyed ones small, current one ringed, upcoming dots
  const currentIndex = Math.max(0, Math.min(blocks.length - 1, journey.currentBlockIndex || 0));
  positions.forEach((pos, index) => {
    const block = blocks[index];
    const isCurrent = index === currentIndex;
    features.push({
      type: 'point',
      point: pos,
      radius: isCurrent ? 2 : 1,
      label: isCurrent ? 'CAMP' : (block.shortName || `B${index + 1}`),
    });
  });

  // Area name banner
  features.push({
    type: 'label',
    point: { x: 50, y: 5 },
    text: (journey.area?.name || 'OPERATING AREA').toUpperCase(),
    center: true,
  });

  const surveyed = Math.min(currentIndex, blocks.length);
  features.push({
    type: 'label',
    point: { x: 50, y: 96 },
    text: `${surveyed}/${blocks.length} BLOCKS BEHIND YOU`,
    center: true,
  });

  return features;
}

/**
 * Render the journey map as a Braille frame string.
 * @param {Object} journey
 * @param {Object} options - { width, height, zoom }
 * @returns {string|null}
 */
export function renderJourneyMap(journey, options = {}) {
  const features = buildJourneyMapFeatures(journey);
  if (!features.length) return null;
  return renderMapsciiFrame(features, {
    width: options.width || 84,
    height: options.height || 60,
    zoom: options.zoom || 1,
    center: { x: 50, y: 50 },
  });
}
