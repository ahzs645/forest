import test from 'node:test';
import assert from 'node:assert/strict';

import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import { getRoleAreaBriefing, getRoleAreaFinding } from '../js/data/roleAreaIntel.js';

test('role-area briefing combines zone summary with role-aware likely finds', () => {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === 'skeena-nass');
  const briefing = getRoleAreaBriefing('recce', area, { maxFinds: 4 });

  assert.ok(briefing.zoneSummary.includes('CWH'));
  assert.equal(briefing.likelyFinds.length, 4);
  assert.ok(briefing.planningSnapshot);
  assert.ok(briefing.planningSnapshot.blockCount > 0);
  assert.ok(
    briefing.likelyFinds.some((item) => item.includes('fish') || item.includes('karst'))
  );
});

test('role-area finding rotates through the available findings', () => {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === 'fraser-plateau');

  const first = getRoleAreaFinding('silviculture', area, 0);
  const second = getRoleAreaFinding('silviculture', area, 1);

  assert.notEqual(first, '');
  assert.notEqual(second, '');
  assert.notEqual(first, second);
});
