import test from 'node:test';
import assert from 'node:assert/strict';

import { DESK_EVENTS, FIELD_EVENTS, OPERATING_AREAS } from '../js/data/index.js';

// An event gated on both area tags and BEC codes is drawn only where both
// match, so a BEC list shorter than the tags quietly drops an area the tags
// were written for (the coast's fish-passage red flag, the Okanagan's smoke
// hold).
test('an event gated on area tags and BEC codes loses no area its tags name', () => {
  const lost = [];
  for (const event of [...FIELD_EVENTS, ...DESK_EVENTS]) {
    if (!event.areaTags?.length || !event.becCodes?.length) continue;
    for (const area of OPERATING_AREAS) {
      const byTags = event.areaTags.some((tag) => (area.tags || []).includes(tag));
      if (byTags && !event.becCodes.includes(area.becCode)) lost.push(`${event.id} misses ${area.id} (${area.becCode})`);
    }
  }
  assert.deepEqual(lost, []);
});
