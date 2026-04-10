import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPlanningRoadAssetContext,
  getPlanningRoadObservationJoin,
} from '../js/data/roadAssetIntel.js';

test('planning road join matches hydrology-sensitive blocks to observed route segments with different ids', () => {
  const journey = {
    areaId: 'bulkley-valley',
    area: {
      id: 'bulkley-valley',
      tags: ['watershed', 'community-interface', 'visuals']
    },
    roadAssets: {
      observations: [
        {
          blockId: 'blk-6',
          blockName: 'VQO Ridgeline',
          roadLifecycleId: 'repair_needed',
          roadLifecycleLabel: 'Repair Needed',
          crossingConditionId: 'timing_sensitive',
          crossingConditionLabel: 'Timing Sensitive',
          watershedPressureId: 'watch',
          watershedPressureLabel: 'Watch',
          day: 9
        },
        {
          blockId: 'blk-7',
          blockName: 'Water Intake Buffer',
          roadLifecycleId: 'watch',
          roadLifecycleLabel: 'Watch',
          crossingConditionId: 'high_water',
          crossingConditionLabel: 'High Water',
          watershedPressureId: 'critical',
          watershedPressureLabel: 'Critical',
          day: 10
        }
      ],
      byBlock: {}
    }
  };

  const planningBlock = {
    id: 'fta-join-1',
    plannedHarvestDate: '2026-04-12',
    indicators: {
      ogmaNearby: true,
      whaNoHarvestNearby: false,
      speciesAtRiskNearby: false,
      firstNationsReserveNearby: false
    },
    metrics: {
      technicalComplexity: 26,
      biodiversitySensitivity: 58,
      firstNationsSensitivity: 14
    }
  };

  const join = getPlanningRoadObservationJoin(journey, planningBlock);
  const context = getPlanningRoadAssetContext(journey, planningBlock);

  assert.ok(join);
  assert.equal(join.routeBlock.id, 'blk-7');
  assert.equal(context.source, 'joined');
  assert.equal(context.joinedFromBlockId, 'blk-7');
  assert.equal(context.joinedFromBlockName, 'Water Intake Buffer');
  assert.match(context.note, /matched recce segment water intake buffer/i);
  assert.equal(context.blocker, false);
});
