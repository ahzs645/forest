/**
 * Trail Markers
 * Oregon Trail's tombstones, BC bush edition: when a crew member dies on a
 * run, the player can carve a marker with their own epitaph. Markers persist
 * in localStorage and stand where they fell — later runs that travel past
 * the same block find them. Failed runs compost into world memory.
 */

const TRAIL_MARKERS_KEY = 'bcft.trailMarkers.v1';
const MAX_MARKERS = 60;
const MAX_EPITAPH = 48;

export function loadTrailMarkers() {
  try {
    const raw = window.localStorage?.getItem(TRAIL_MARKERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTrailMarkers(markers) {
  try {
    window.localStorage?.setItem(TRAIL_MARKERS_KEY, JSON.stringify(markers.slice(-MAX_MARKERS)));
  } catch {
    // Storage unavailable (private mode, node tests) — play continues.
  }
}

/**
 * Record a marker for a fallen crew member.
 * @param {Object} marker
 * @param {string} marker.name - crew member's name
 * @param {string} marker.epitaph - the player's line (or a stock one)
 * @param {string} marker.areaId
 * @param {string} marker.blockId
 * @param {string} marker.blockName
 * @param {number} marker.day - shift number they were lost on
 * @param {string} [marker.cause]
 * @returns {Object} the stored marker
 */
export function recordTrailMarker(marker) {
  const stored = {
    name: String(marker.name || 'Unknown').slice(0, 24),
    epitaph: String(marker.epitaph || 'They loved this country.').slice(0, MAX_EPITAPH),
    areaId: marker.areaId || null,
    blockId: marker.blockId || null,
    blockName: String(marker.blockName || '').slice(0, 32),
    day: Number(marker.day) || 0,
    cause: String(marker.cause || 'the trail').slice(0, 28),
    createdAt: Date.now(),
  };
  const markers = loadTrailMarkers();
  markers.push(stored);
  saveTrailMarkers(markers);
  return stored;
}

/**
 * Markers standing at a block, oldest first. Markers newer than `before`
 * (this run's own losses) are excluded so a crew never trips over its own
 * fresh grief.
 * @param {string} areaId
 * @param {string} blockId
 * @param {Object} [opts]
 * @param {number} [opts.before] - epoch ms cutoff
 * @returns {Object[]}
 */
export function markersForBlock(areaId, blockId, { before = Infinity } = {}) {
  return loadTrailMarkers()
    .filter((m) => m.areaId === areaId && m.blockId === blockId && (m.createdAt || 0) < before)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/**
 * Render a marker as box art for the terminal.
 * @param {Object} marker
 * @returns {string}
 */
export function formatTrailMarker(marker) {
  const width = 28;
  const wrap = (text) => {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).trim().length > width - 4) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = (line ? line + ' ' : '') + word;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const pad = (text) => `│ ${String(text).padEnd(width - 4)} │`;
  const rows = [
    `┌${'─'.repeat(width - 2)}┐`,
    pad(marker.name.toUpperCase()),
    ...wrap(`"${marker.epitaph}"`).map(pad),
    pad(`Shift ${marker.day} — ${marker.cause}`),
    `└${'─'.repeat(width - 2)}┘`,
  ];
  return rows.join('\n');
}
