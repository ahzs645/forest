import test from 'node:test';
import assert from 'node:assert/strict';

import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import { getPlanningAreaSnapshot } from '../js/data/planningBlocks.js';
import { getRoleAreaBriefing } from '../js/data/roleAreaIntel.js';

test('planning area snapshot exposes districts, signal counts, and compact sample file ids', () => {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === 'fraser-plateau');
  const snapshot = getPlanningAreaSnapshot(area.id, area);

  assert.ok(snapshot.blockCount > 0);
  assert.ok(snapshot.districts.includes('Quesnel NRD'));
  assert.ok(snapshot.sampleBlocks.length > 0);
  assert.ok(snapshot.sampleBlocks.every((block) => block.compactId.length > 0));
  assert.ok(snapshot.signalCounts.ogmaNearby > 0);
  assert.ok(snapshot.signalCounts.speciesAtRiskNearby > 0);
});

test('role-area briefing carries a data-backed planning snapshot signal into likely finds', () => {
  const area = OPERATING_AREAS.find((candidate) => candidate.id === 'fraser-plateau');
  const briefing = getRoleAreaBriefing('planner', area, { maxFinds: 4 });

  assert.ok(briefing.planningSnapshot);
  assert.ok(briefing.likelyFinds.some((item) => item.includes('snapshot')));
});
