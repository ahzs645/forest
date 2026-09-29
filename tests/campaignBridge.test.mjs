import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPermittingJourney,
  createPlanningJourney,
  createReconJourney,
  createSilvicultureJourney,
} from '../js/journey/factory.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import { createInitialState } from '../js/engine.js';
import { resolveEvent } from '../js/events/resolution.js';
import {
  CAMPAIGN_SEASONS,
  applySeasonCarryForward,
  applyYearEffects,
  computeSeasonBridge,
  deriveCampaignTier,
  describeSeasonSituation,
  describeYearEnd,
  formatBridgeCauses,
  readStandingSnapshot,
} from '../js/game/campaign.js';
import { simulateCampaign } from '../scripts/simulate-campaign.mjs';

const AREA_ID = 'fraser-plateau';
const area = OPERATING_AREAS.find((candidate) => candidate.id === AREA_ID);

function opened(journey) {
  journey.campaignStartStanding = readStandingSnapshot(journey);
  journey.campaignStartBudget = Number(journey.resources?.budget ?? 0);
  return journey;
}

function recon() {
  return opened(createReconJourney({ roleId: 'recce', areaId: AREA_ID, area, scale: 'campaign' }));
}

function eventWith(effects) {
  return { id: 'bridge-test', title: 'Bridge test', severity: 'minor', options: [{ label: 'Answer it', effects }] };
}

const entryFor = (bridge, metric) => bridge.entries.find((entry) => entry.metric === metric);

test('relationship effects a field event announces reach the year meter (they used to write to nothing)', () => {
  const journey = recon();
  for (const member of journey.crew) member.morale = 70; // no morale signal either way
  const event = eventWith({ relationships: 12 });
  const first = resolveEvent(journey, event, event.options[0]);
  assert.ok(first.messages.some((message) => /Relationships improved \(\+12\)/.test(message)));
  resolveEvent(journey, event, event.options[0]);

  assert.equal(journey.standingLedger.relationships, 24);
  const bridge = computeSeasonBridge(journey, { victory: true }, journey.campaignStartBudget);
  assert.ok(bridge.deltas.relationships >= 4, `+24 relations in-season should move the year, got ${bridge.deltas.relationships}`);
  assert.match(entryFor(bridge, 'relationships').reason, /in-season calls \+24/);
});

test('compliance cause names what happened: no "File compliance held" while scrutiny ran to 100', () => {
  const journey = recon();
  const event = eventWith({ compliance: -6 });
  resolveEvent(journey, event, event.options[0]);
  resolveEvent(journey, event, event.options[0]);
  journey.scrutiny = 100;

  const bridge = computeSeasonBridge(journey, { victory: false }, journey.campaignStartBudget);
  assert.ok(bridge.deltas.compliance <= -7, `got ${bridge.deltas.compliance}`);
  const reason = entryFor(bridge, 'compliance').reason;
  assert.doesNotMatch(reason, /held/);
  assert.match(reason, /in-season calls -12/);
  assert.match(reason, /scrutiny rose 28% → 100%/);
});

test('the scrutiny read is measured from where the deployment opened, not a flat baseline', () => {
  // A permitting desk opens at 38. Holding it there is not a compliance slide.
  const journey = opened(createPermittingJourney({ roleId: 'permitter', areaId: AREA_ID, area, scale: 'campaign' }));
  const bridge = computeSeasonBridge(journey, { victory: true }, journey.campaignStartBudget);
  assert.equal(bridge.deltas.compliance, undefined);
});

test('a permitting desk that warmed the district, Nation and agencies earns relationships', () => {
  const journey = opened(createPermittingJourney({ roleId: 'permitter', areaId: AREA_ID, area, scale: 'campaign' }));
  journey.relationships.ministry += 12;
  journey.relationships.nations += 14;
  journey.relationships.agencies += 10;
  const bridge = computeSeasonBridge(journey, { victory: true }, journey.campaignStartBudget);
  assert.ok(bridge.deltas.relationships > 0);
  assert.match(entryFor(bridge, 'relationships').reason, /warmed/);
});

test('a planning file with a strong engagement record earns relationships', () => {
  const journey = opened(createPlanningJourney({ roleId: 'planner', areaId: AREA_ID, area, scale: 'campaign' }));
  journey.plan.stakeholderBuyIn = 95;
  const bridge = computeSeasonBridge(journey, { victory: true }, journey.campaignStartBudget);
  assert.ok(bridge.deltas.relationships >= 2);
  assert.match(entryFor(bridge, 'relationships').reason, /engagement record at 95% buy-in/);
});

test('a crew that walked off costs relationships instead of reading as neutral', () => {
  const journey = recon();
  for (const member of journey.crew) member.isActive = false;
  const bridge = computeSeasonBridge(journey, { gameOver: true }, journey.campaignStartBudget);
  assert.ok(bridge.deltas.relationships < 0);
  assert.match(entryFor(bridge, 'relationships').reason, /walked off/);
});

test('an allowance left unspent because nothing got done earns no budget credit', () => {
  const idle = recon();
  const idleBridge = computeSeasonBridge(idle, { gameOver: true }, idle.campaignStartBudget);
  assert.equal(idleBridge.completion, 0);
  assert.equal(idleBridge.deltas.budget, 0, 'spending nothing on a failed season is not thrift');
  assert.match(entryFor(idleBridge, 'budget').reason, /work it was for undone/);

  const thrifty = opened(createSilvicultureJourney({ roleId: 'silviculture', areaId: AREA_ID, area, scale: 'campaign' }));
  thrifty.planting.blocksPlanted = thrifty.planting.blocksToPlant;
  thrifty.surveys.freeGrowingComplete = thrifty.surveys.freeGrowingTarget;
  const bridge = computeSeasonBridge(thrifty, { victory: true }, thrifty.campaignStartBudget);
  assert.equal(bridge.deltas.budget, 5, 'a delivered season on a light spend still banks the thrift');
});

test('a season that delivered nothing costs real Progress', () => {
  const journey = recon();
  const bridge = computeSeasonBridge(journey, { gameOver: true }, journey.campaignStartBudget);
  assert.equal(bridge.deltas.progress, -8);
});

test('the review prints the Progress the meter actually took, not the pre-diminishing +14', () => {
  const gs = createInitialState({ companyName: 'Test', roleId: 'permitter', areaId: AREA_ID });
  gs.metrics.progress = 78;
  const entries = [{ metric: 'progress', delta: 14, reason: 'Objective 100% and delivered' }];
  const applied = applyYearEffects(gs, { progress: 14 }, { type: 'event', id: 't', title: 't', round: 4 });
  assert.equal(applied.moved.progress, 8);
  assert.equal(gs.metrics.progress, 86);
  const [line] = formatBridgeCauses(entries, applied.moved, applied.notes);
  assert.equal(line, 'Objective 100% and delivered → Progress +8 (+14 earned; harder to gain near the top of the meter)');
});

test('the year tier is capped by what the deployments delivered', () => {
  const solidMeters = { progress: 80, forestHealth: 58, relationships: 60, compliance: 70, budget: 50 };
  assert.deepEqual(deriveCampaignTier(solidMeters, 4), { tier: 'solid', cappedFrom: null });
  assert.deepEqual(deriveCampaignTier(solidMeters, 1), { tier: 'mixed', cappedFrom: 'solid' });

  const capped = describeYearEnd(deriveCampaignTier(solidMeters, 1), 1, solidMeters);
  assert.match(capped.reasons[0], /takes at least 2 of 4 deployments delivered/);
});

test('Solid ending copy reflects the deliveries: "The program delivered" only when it did', () => {
  const meters = { progress: 80, forestHealth: 58, relationships: 60, compliance: 70, budget: 50 };
  const twoOfFour = describeYearEnd(deriveCampaignTier(meters, 2), 2, meters);
  assert.match(twoOfFour.body, /^2\/4 deployments delivered\./);
  assert.doesNotMatch(twoOfFour.body, /The program delivered/);

  const allFour = describeYearEnd(deriveCampaignTier(meters, 4), 4, meters);
  assert.match(allFour.body, /The program delivered/);
  assert.match(allFour.reasons[0], /^Outstanding needs/);
});

test('a Mixed year names the Solid floors it missed', () => {
  const meters = { progress: 80, forestHealth: 50, relationships: 48, compliance: 55, budget: 50 };
  const verdict = deriveCampaignTier(meters, 3);
  assert.equal(verdict.tier, 'mixed');
  const { reasons } = describeYearEnd(verdict, 3, meters);
  assert.equal(reasons[0], 'Solid needs Compliance 60+ (you have 55), Relationships 52+ (you have 48).');
});

test('winter honours a fall that never got its FSP approved', () => {
  const winter = CAMPAIGN_SEASONS.find((season) => season.id === 'winter');
  const failedFall = { seasonLog: [{ id: 'fall', season: 'Fall', victory: false }] };
  const journey = createPermittingJourney({ roleId: 'permitter', areaId: AREA_ID, area, scale: 'campaign' });
  const scrutinyBefore = journey.scrutiny;
  const lines = applySeasonCarryForward(failedFall, winter, journey);
  opened(journey);

  assert.equal(journey.permits.programTarget, 12);
  assert.equal(journey.permits.target, 8, 'cutting permits that need the new plan are held');
  assert.equal(journey.permits.heldForFsp, 4);
  assert.ok(journey.scrutiny > scrutinyBefore);
  assert.ok(lines.some((line) => /held until a replacement plan is approved/.test(line)));
  assert.match(describeSeasonSituation(failedFall, winter), /extended the old FSP/);

  // Every permit the extension allows still leaves the year's program short.
  journey.permits.approved = 8;
  const bridge = computeSeasonBridge(journey, { victory: true }, journey.campaignStartBudget);
  assert.equal(Math.round(bridge.completion * 100), 67);

  const deliveredFall = { seasonLog: [{ id: 'fall', season: 'Fall', victory: true }] };
  const clean = createPermittingJourney({ roleId: 'permitter', areaId: AREA_ID, area, scale: 'campaign' });
  assert.deepEqual(applySeasonCarryForward(deliveredFall, winter, clean), []);
  assert.equal(clean.permits.target, 12);
  assert.equal(describeSeasonSituation(deliveredFall, winter), winter.situation);
});

// Headless campaign years (scripts/simulate-campaign.mjs). Each is a full
// year through the real mode day-runners, so keep the matrix small.
test('headless years: the tier tracks how the year was played', async () => {
  const seeds = [4000, 4131];
  const areas = ['fraser-plateau', 'bulkley-valley'];
  const runs = { good: [], terrible: [] };
  for (const style of Object.keys(runs)) {
    for (const areaId of areas) {
      for (const seed of seeds) runs[style].push(await simulateCampaign({ style, areaId, seed }));
    }
  }

  for (const run of runs.terrible) {
    assert.ok(!['solid', 'outstanding'].includes(run.tier), `terrible play reached ${run.tier} (${run.areaId} ${run.seed})`);
    assert.ok(run.yearMetrics.progress < 75, `terrible play kept Progress ${run.yearMetrics.progress}`);
  }
  const goodSolid = runs.good.filter((run) => ['solid', 'outstanding'].includes(run.tier)).length;
  assert.ok(goodSolid >= runs.good.length - 1, `careful play reached Solid in only ${goodSolid}/${runs.good.length}`);

  // The year's standing meters answer the deployments, not just the stance.
  const meanRelationships = runs.good.reduce((sum, run) => sum + run.yearMetrics.relationships, 0) / runs.good.length;
  assert.ok(meanRelationships >= 58, `careful play left Relationships at ${meanRelationships}`);

  // The review's season lines record the movement the meters took.
  for (const run of [...runs.good, ...runs.terrible]) {
    let before = { progress: 50, forestHealth: 50, relationships: 50, compliance: 50, budget: 50 };
    for (const season of run.seasonLog) {
      for (const [metric, delta] of Object.entries(season.deltas)) {
        assert.ok(Number.isInteger(delta), `${season.season} ${metric} delta ${delta}`);
      }
      assert.ok(Object.values(season.metricsAfter).every((value) => value >= 0 && value <= 100));
      before = season.metricsAfter;
    }
    assert.deepEqual(before, run.yearMetrics);
  }
});
