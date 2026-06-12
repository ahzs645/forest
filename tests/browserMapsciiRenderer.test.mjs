import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMapsciiFrame } from '../js/scene/mapscii/index.js';

test('browser mapscii renderer turns vector features into a braille frame with labels', () => {
  const frame = renderMapsciiFrame(
    [
      { type: 'line', points: [{ x: 0, y: 50 }, { x: 100, y: 50 }], width: 1 },
      { type: 'point', point: { x: 50, y: 50 }, radius: 2, label: 'BEETLE' },
      { type: 'label', point: { x: 50, y: 20 }, text: 'FSR-12', center: true },
    ],
    {
      width: 80,
      height: 48,
      center: { x: 50, y: 50 },
      zoom: 1,
    },
  );

  assert.match(frame, /BEETLE/);
  assert.match(frame, /FSR-12/);
  assert.ok(/[⠁-⣿]/u.test(frame), 'expected braille map glyphs');
});
