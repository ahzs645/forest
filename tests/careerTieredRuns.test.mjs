import test from "node:test";
import assert from "node:assert/strict";

import { loadServiceRecord, recordTieredRun } from "../js/career.js";
import { recordCampaignYear } from "../js/game/campaign.js";
import { getCareerDeltas } from "../js/game/debrief.js";
import { buildCareerStand } from "../js/scene/forest.js";

function withStorage() {
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

test.afterEach(() => {
  delete globalThis.window;
});

test("a finished campaign year plants one tree and carries its deployments' field counters", () => {
  withStorage();
  const campaign = {
    yearMetrics: { progress: 70, forestHealth: 66, relationships: 68, compliance: 72, budget: 60 },
    seasonLog: [
      { season: "Spring", victory: true, careerDeltas: getCareerDeltas({ journeyType: "silviculture", planting: { seedlingsPlanted: 120000 } }, true) },
      { season: "Summer", victory: true, careerDeltas: getCareerDeltas({ journeyType: "recon", distanceTraveled: 41.6 }, true) },
      { season: "Fall", victory: false, careerDeltas: getCareerDeltas({ journeyType: "planning" }, false) },
      { season: "Winter", victory: true, careerDeltas: getCareerDeltas({ journeyType: "permitting", permits: { approved: 9 } }, true) },
    ],
  };

  const record = recordCampaignYear(campaign);
  assert.equal(record.runs, 1);
  assert.equal(record.byRole.campaign.runs, 1);
  assert.equal(record.byRole.campaign.victories, 1, "a solid year stands full-grown");
  assert.equal(record.byRole.campaign.bestGrade, "Solid");
  assert.deepEqual(record.career, { seedlingsPlanted: 120000, kmSurveyed: 42, permitsApproved: 9 });
  assert.equal(loadServiceRecord().byRole.campaign.runs, 1, "the record is persisted");

  const stand = buildCareerStand(loadServiceRecord());
  assert.equal(stand.count, 1, "the campaign year shows in the career forest");
  assert.equal(stand.trees[0].type, "cottonwood");
  assert.equal(stand.trees[0].growth, 1);
});

test("a stumbled year still files, as a sapling", () => {
  withStorage();
  const record = recordCampaignYear({
    yearMetrics: { progress: 30, forestHealth: 35, relationships: 30, compliance: 28, budget: 40 },
    seasonLog: [],
  });
  assert.equal(record.byRole.campaign.victories, 0);
  assert.ok(buildCareerStand(record).trees[0].growth < 1);
});

test("seasonal and crisis debriefs file under their own buckets", () => {
  withStorage();
  recordTieredRun("seasonal", { tier: "outstanding", score: 81 });
  recordTieredRun("seasonal", { tier: "mixed", score: 52 });
  const record = recordTieredRun("crisis-command", { tier: "FRAGILE", score: 44 });

  assert.equal(record.runs, 3);
  assert.deepEqual(record.byRole.seasonal, { runs: 2, victories: 1, bestScore: 81, bestGrade: "Outstanding" });
  assert.deepEqual(record.byRole["crisis-command"], { runs: 1, victories: 0, bestScore: 44, bestGrade: "Fragile" });
  assert.equal(buildCareerStand(record).count, 3);
});

test("recording survives storage that is unavailable", () => {
  globalThis.window = { get localStorage() { throw new Error("SecurityError"); } };
  const record = recordTieredRun("seasonal", { tier: "solid", score: 70 });
  assert.equal(record.runs, 1);
});
