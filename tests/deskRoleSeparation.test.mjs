import test from 'node:test';
import assert from 'node:assert/strict';

import { simulateRun } from '../scripts/simulate-expeditions.mjs';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import { getPlanningAreaBlockPool } from '../js/data/planningBlocks.js';

// The headless harness drives the real day runners with a competent player
// and with a reckless one (declines every situation, files before the
// district is ready, runs the plan timber-first, never answers the FOM
// comments, fast-tracks every deficiency letter). In every operating area the
// grade has to tell them apart, and the reckless player must never do better.

const SEEDS = [1000, 1037, 1074, 1111];

async function batch(role, areaId, policy) {
  const results = [];
  for (const seed of SEEDS) {
    results.push(await simulateRun(role, seed, undefined, null, { areaId, policy }));
  }
  return {
    wins: results.filter((result) => result.won).length,
    meanScore: results.reduce((sum, result) => sum + result.score, 0) / results.length,
    results,
  };
}

for (const role of ['planning', 'permitting']) {
  test(`${role}: competent and reckless play separate in every operating area`, async () => {
    for (const area of OPERATING_AREAS) {
      const competent = await batch(role, area.id, 'competent');
      const reckless = await batch(role, area.id, 'reckless');
      const where = `${role} in ${area.id}: competent ${competent.wins}/${SEEDS.length} (${Math.round(competent.meanScore)}), reckless ${reckless.wins}/${SEEDS.length} (${Math.round(reckless.meanScore)})`;

      assert.ok(competent.wins >= reckless.wins, where);
      assert.ok(competent.meanScore >= reckless.meanScore + 20, where);
      for (const result of competent.results) {
        assert.ok(!String(result.reason || '').startsWith('error'), `${where}: ${result.reason}`);
      }

      // A planning file needs a lead block set to publish a FOM; an area with
      // no block pool cannot be won yet, and that is a data gap, not balance.
      const winnable = role === 'permitting' || getPlanningAreaBlockPool(area.id).length > 0;
      if (winnable) assert.ok(competent.wins >= SEEDS.length - 1, where);
      if (role === 'planning') assert.equal(reckless.wins, 0, `${where}: spam and a draft FOM never win`);
    }
  });
}
