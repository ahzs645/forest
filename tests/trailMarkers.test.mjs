import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadTrailMarkers,
  recordTrailMarker,
  markersForBlock,
  formatTrailMarker,
} from '../js/journey/trailMarkers.js';

function installStorage() {
  const map = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    },
  };
  return map;
}

test('markers persist, filter by block, and respect the epoch cutoff', () => {
  installStorage();
  assert.deepEqual(loadTrailMarkers(), []);

  const early = recordTrailMarker({
    name: 'Avery Chen',
    epitaph: "should've waited for the water",
    areaId: 'nechako',
    blockId: 'b7',
    blockName: 'Chutanli Crossing',
    day: 14,
    cause: 'hypothermia',
  });
  recordTrailMarker({ name: 'Bo', epitaph: 'x', areaId: 'nechako', blockId: 'b9', day: 3 });

  assert.equal(loadTrailMarkers().length, 2);
  const atBlock = markersForBlock('nechako', 'b7');
  assert.equal(atBlock.length, 1);
  assert.equal(atBlock[0].name, 'Avery Chen');

  // A run started before the marker existed sees nothing at that block.
  const before = markersForBlock('nechako', 'b7', { before: early.createdAt });
  assert.equal(before.length, 0);

  // Other areas never see it.
  assert.equal(markersForBlock('skeena', 'b7').length, 0);

  delete globalThis.window;
});

test('epitaphs are length-capped and format as box art', () => {
  installStorage();
  const marker = recordTrailMarker({
    name: 'A Name Much Longer Than The Cap Allows Really',
    epitaph: 'a'.repeat(200),
    areaId: 'x',
    blockId: 'y',
    day: 5,
  });
  assert.ok(marker.name.length <= 24);
  assert.ok(marker.epitaph.length <= 48);

  const art = formatTrailMarker({
    name: 'Avery Chen',
    epitaph: "should've waited for the water",
    day: 14,
    cause: 'hypothermia',
  });
  const lines = art.split('\n');
  assert.ok(lines[0].startsWith('┌'));
  assert.ok(lines[lines.length - 1].startsWith('└'));
  assert.ok(art.includes('AVERY CHEN'));
  assert.ok(art.includes('Shift 14 — hypothermia'));
  // Every row is the same width (the box is straight).
  assert.ok(lines.every((line) => line.length === lines[0].length));

  delete globalThis.window;
});

test('storage is capped and survives absence of window', () => {
  installStorage();
  for (let i = 0; i < 70; i++) {
    recordTrailMarker({ name: `M${i}`, epitaph: 'x', areaId: 'a', blockId: 'b', day: i });
  }
  assert.ok(loadTrailMarkers().length <= 60);

  delete globalThis.window;
  // No window at all: reads return empty, writes do not throw.
  assert.deepEqual(loadTrailMarkers(), []);
  assert.doesNotThrow(() => recordTrailMarker({ name: 'Z', epitaph: 'x', areaId: 'a', blockId: 'b', day: 1 }));
});
