import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMPAIGN_SAVE_KEY,
  findUnreadableSaves,
  loadActiveRun,
  readActiveRun,
  readCampaignSave,
  saveActiveRun,
  validateCampaignSave,
  validateJourneySave,
} from "../js/game/saveLoad.js";
import { createJourney } from "../js/journey.js";
import { FORESTER_ROLES, OPERATING_AREAS } from "../js/data/index.js";

const ACTIVE_RUN_KEY = "bcft.activeRun.v1";

function withStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  globalThis.window = {
    localStorage: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    },
  };
  return map;
}

function genuineJourney(roleId = "recce", options = {}) {
  const role = FORESTER_ROLES.find((r) => r.id === roleId);
  return JSON.parse(JSON.stringify(createJourney({
    crewName: "Save Co",
    role,
    area: OPERATING_AREAS[0],
    ...options,
  })));
}

function genuineCampaign(overrides = {}) {
  return {
    version: 1,
    crewName: "Save Co",
    areaId: OPERATING_AREAS[0].id,
    areaName: OPERATING_AREAS[0].name,
    difficulty: "normal",
    seasonIndex: 1,
    yearMetrics: { progress: 52, forestHealth: 50, relationships: 49, compliance: 55, budget: 47 },
    history: [],
    flags: {},
    pendingIssues: [],
    discoveryTags: [],
    seasonLog: [{ season: "Spring", title: "Silviculture Program", victory: true, completion: 80, deltas: {} }],
    seed: 99,
    rngState: 1234,
    activeJourney: null,
    stanceIndex: null,
    ...overrides,
  };
}

test.afterEach(() => {
  delete globalThis.window;
});

test("every role's freshly created journey passes the save check", () => {
  for (const role of FORESTER_ROLES) {
    const journey = genuineJourney(role.id);
    assert.equal(validateJourneySave(journey), null, `${role.id} should be resumable`);
    if (role.id === "manager") continue; // the campaign never deploys a GM
    const campaignScale = genuineJourney(role.id, { scale: "campaign" });
    assert.equal(validateJourneySave(campaignScale), null, `${role.id} (campaign scale) should be resumable`);
  }
});

test("a genuine save round-trips through storage", () => {
  withStorage();
  const journey = genuineJourney("silviculture");
  saveActiveRun(journey);
  assert.equal(readActiveRun().status, "ok");
  assert.deepEqual(loadActiveRun(), journey);
  assert.deepEqual(findUnreadableSaves(), []);
});

test("the playtest's bricking save is reported unreadable, not handed to the game", () => {
  withStorage({ [ACTIVE_RUN_KEY]: '{"version":1,"journey":{"journeyType":"recon"}}' });
  const slot = readActiveRun();
  assert.equal(slot.status, "unreadable");
  assert.equal(loadActiveRun(), null);
});

test("corrupt JSON, another version, and a missing journey are unreadable", () => {
  for (const raw of ["{not json", '{"version":2,"journey":{}}', '{"version":1}', "null", "[]", '"text"']) {
    withStorage({ [ACTIVE_RUN_KEY]: raw });
    assert.equal(readActiveRun().status, "unreadable", raw);
    assert.equal(loadActiveRun(), null, raw);
  }
});

test("an empty slot is empty, and a stale campaign deployment is ignored rather than flagged", () => {
  withStorage();
  assert.equal(readActiveRun().status, "empty");

  const deployment = { ...genuineJourney("recce", { scale: "campaign" }), campaignStartMetrics: {} };
  withStorage({ [ACTIVE_RUN_KEY]: JSON.stringify({ version: 1, journey: deployment }) });
  assert.equal(readActiveRun().status, "empty");
  assert.deepEqual(findUnreadableSaves(), []);
});

test("dropping any field the resume path dereferences makes a genuine save unreadable", () => {
  const required = {
    recce: ["journeyType", "day", "crew", "resources", "blocks", "currentBlockIndex", "distanceTraveled"],
    silviculture: ["crew", "resources", "blocks", "planting", "brushing", "surveys", "contractors"],
    planner: ["crew", "resources", "plan", "protagonist", "stakeholders", "values"],
    permitter: ["crew", "resources", "permits", "protagonist", "relationships"],
    manager: ["crew", "resources", "metrics", "ledger"],
  };
  for (const [roleId, keys] of Object.entries(required)) {
    for (const key of keys) {
      const journey = genuineJourney(roleId);
      delete journey[key];
      assert.notEqual(validateJourneySave(journey), null, `${roleId} without ${key} must not resume`);
    }
  }
});

test("wrong-typed fields are caught too", () => {
  const cases = [
    (j) => { j.crew = "nobody"; },
    (j) => { j.crew = [null]; },
    (j) => { j.resources = []; },
    (j) => { j.day = "3"; },
    (j) => { j.day = 0; },
    (j) => { j.blocks = []; },
    (j) => { j.currentBlockIndex = 999; },
    (j) => { j.journeyType = "lumberjack"; },
  ];
  for (const mutate of cases) {
    const journey = genuineJourney("recce");
    mutate(journey);
    assert.notEqual(validateJourneySave(journey), null, mutate.toString());
  }
});

test("a genuine campaign year passes, mid-deployment included", () => {
  assert.equal(validateCampaignSave(genuineCampaign()), null);
  const midDeployment = genuineCampaign({
    stanceIndex: 2,
    activeJourney: { ...genuineJourney("recce", { scale: "campaign" }), campaignStartMetrics: {} },
  });
  assert.equal(validateCampaignSave(midDeployment), null);
  // Winter closed, year-end review not yet dismissed.
  assert.equal(validateCampaignSave(genuineCampaign({ seasonIndex: 4 })), null);
});

test("malformed campaign saves are unreadable instead of reaching a screen with no choices", () => {
  const broken = [
    { version: 1 },
    genuineCampaign({ version: 2 }),
    genuineCampaign({ seasonIndex: 9 }),
    genuineCampaign({ seasonIndex: "1" }),
    genuineCampaign({ seasonLog: undefined }),
    genuineCampaign({ yearMetrics: { progress: 50 } }),
    genuineCampaign({ crewName: undefined }),
    genuineCampaign({ flags: [] }),
    genuineCampaign({ seed: undefined, rngState: undefined }),
    genuineCampaign({ stanceIndex: 7 }),
    genuineCampaign({ activeJourney: { journeyType: "recon" } }),
  ];
  for (const state of broken) {
    assert.notEqual(validateCampaignSave(state), null, JSON.stringify(state).slice(0, 80));
    withStorage({ [CAMPAIGN_SAVE_KEY]: JSON.stringify(state) });
    assert.equal(readCampaignSave().status, "unreadable");
  }
});

test("findUnreadableSaves names each broken slot and discarding clears only those", () => {
  const good = genuineCampaign();
  const map = withStorage({
    [ACTIVE_RUN_KEY]: '{"version":1,"journey":{"journeyType":"recon"}}',
    [CAMPAIGN_SAVE_KEY]: JSON.stringify(good),
    "bcft.serviceRecord.v1": '{"runs":1}',
  });
  let found = findUnreadableSaves();
  assert.deepEqual(found.map((s) => s.label), ["expedition"]);
  found[0].discard();
  assert.equal(map.has(ACTIVE_RUN_KEY), false);
  assert.equal(map.has(CAMPAIGN_SAVE_KEY), true);
  assert.equal(map.has("bcft.serviceRecord.v1"), true);

  map.set(CAMPAIGN_SAVE_KEY, '{"version":1}');
  found = findUnreadableSaves();
  assert.deepEqual(found.map((s) => s.label), ["campaign year"]);
  assert.ok(found[0].reason);
  found[0].discard();
  assert.equal(map.has(CAMPAIGN_SAVE_KEY), false);
});

test("storage that throws reads as empty", () => {
  globalThis.window = {
    get localStorage() { throw new Error("SecurityError"); },
  };
  assert.equal(readActiveRun().status, "empty");
  assert.equal(readCampaignSave().status, "empty");
  assert.deepEqual(findUnreadableSaves(), []);
});
