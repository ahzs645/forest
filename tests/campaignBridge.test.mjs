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
  describeCampaignProgress,
  describeSeasonSituation,
  describeYearEnd,
  formatBridgeCauses,
  gradeCampaignYear,
  readStandingSnapshot,
  recordCampaignYear,
} from '../js/game/campaign.js';
import { CAMPAIGN_TIER_GATES, deriveTier, gradeTier } from '../js/engine/scoring.js';
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

function silviculture() {
  return opened(createSilvicultureJourney({ roleId: 'silviculture', areaId: AREA_ID, area, scale: 'campaign' }));
}

/** Plant, inspect, fill, release and survey the whole spring program. */
function deliverProgram(journey, quality = 90) {
  journey.planting.blocksPlanted = journey.planting.blocksToPlant;
  journey.planting.qualityAverage = quality;
  for (const block of journey.program.blocks) block.status = 'inspected';
  for (const opening of journey.program.fill) opening.done = true;
  for (const opening of journey.program.brush) opening.treated = opening.ha;
  journey.brushing.hectaresComplete = journey.brushing.hectaresTarget;
  journey.surveys.freeGrowingComplete = journey.surveys.freeGrowingTarget;
  return journey;
}

test('an allowance left unspent because nothing got done earns no budget credit', () => {
  const idle = recon();
  const idleBridge = computeSeasonBridge(idle, { gameOver: true }, idle.campaignStartBudget);
  assert.equal(idleBridge.completion, 0);
  assert.equal(idleBridge.deltas.budget, 0, 'spending nothing on a failed season is not thrift');
  assert.match(entryFor(idleBridge, 'budget').reason, /Spent 0% of the season allowance for 0% of the work/);

  const thrifty = deliverProgram(silviculture());
  const bridge = computeSeasonBridge(thrifty, { victory: true }, thrifty.campaignStartBudget);
  assert.equal(bridge.completion, 1);
  assert.equal(bridge.deltas.budget, 5, 'a delivered season on a light spend still banks the thrift');
});

test('spending the allowance on the work it was for is on budget, not a loss', () => {
  const journey = deliverProgram(silviculture());
  journey.resources.budget = 0;
  const bridge = computeSeasonBridge(journey, { victory: true }, journey.campaignStartBudget);
  assert.equal(bridge.deltas.budget, 0);
  assert.match(entryFor(bridge, 'budget').reason, /Spent 100% of the season allowance for 100% of the work/);

  const overdrawn = recon();
  overdrawn.blocksAssessed = Math.round(overdrawn.packageTarget / 3);
  overdrawn.resources.budget = 0;
  const short = computeSeasonBridge(overdrawn, { victory: false }, overdrawn.campaignStartBudget);
  assert.ok(short.deltas.budget <= -4, `the whole allowance for a third of the work, got ${short.deltas.budget}`);
});

test('shortcut cash is not a saving, and a crew left on an empty food box is not thrift', () => {
  const journey = recon();
  journey.blocksAssessed = journey.packageTarget;
  const start = journey.campaignStartBudget;
  // Most of the allowance spent, then a shortcut pays some of it back in cash.
  journey.resources.budget = Math.round(start * 0.2) + 1200;
  journey.log = [{ type: 'event', eventId: 'temptation_retired-rft-cruise', effects: { budget: 1200 } }];
  const bridge = computeSeasonBridge(journey, { victory: true }, start);
  assert.equal(bridge.deltas.budget, 2, 'measured on the 80% honestly spent');
  assert.match(entryFor(bridge, 'budget').reason, /\$1,200 of shortcut cash is not a saving/);

  const starved = recon();
  starved.blocksAssessed = starved.packageTarget;
  starved.resourcePressure = { hungryShifts: 2 };
  const starvedBridge = computeSeasonBridge(starved, { victory: true }, starved.campaignStartBudget);
  assert.equal(starvedBridge.deltas.budget, -2, 'an untouched allowance with a hungry crew costs, it does not pay');
  assert.match(entryFor(starvedBridge, 'budget').reason, /the crew went 2 shifts on an empty food box/);
});

test('an idle spring earns no Forest Health for planting it never did, and the brush costs the stands', () => {
  const idle = silviculture();
  const idleBridge = computeSeasonBridge(idle, { gameOver: true }, idle.campaignStartBudget);
  assert.ok(idleBridge.deltas.forestHealth < 0, `idle spring moved Forest Health ${idleBridge.deltas.forestHealth}`);
  assert.ok(!idleBridge.entries.some((entry) => /Planting quality/.test(entry.reason)));
  assert.ok(idleBridge.entries.some((entry) => /100% of the release queue left to the brush/.test(entry.reason)));

  const delivered = deliverProgram(silviculture());
  const bridge = computeSeasonBridge(delivered, { victory: true }, delivered.campaignStartBudget);
  assert.equal(bridge.deltas.forestHealth, 6, 'planting quality +4 and a treated release queue +2');
});

test('a spring that skipped its fill does not read 100% complete', () => {
  const journey = deliverProgram(silviculture());
  for (const opening of journey.program.fill) opening.done = false;
  const bridge = computeSeasonBridge(journey, { victory: false }, journey.campaignStartBudget);
  assert.ok(bridge.completion < 1);
  assert.doesNotMatch(entryFor(bridge, 'progress').reason, /100%/);
});

test('a planning file that clears every gate reads 100% and earns what any delivered season earns', () => {
  const journey = opened(createPlanningJourney({ roleId: 'planner', areaId: AREA_ID, area, scale: 'campaign' }));
  Object.assign(journey.plan, { dataCompleteness: 84, analysisQuality: 90, stakeholderBuyIn: 85, ministerialConfidence: 80 });
  const bridge = computeSeasonBridge(journey, { victory: true }, journey.campaignStartBudget);
  assert.equal(bridge.completion, 1);
  assert.equal(bridge.deltas.progress, 14);
  assert.equal(entryFor(bridge, 'progress').reason, 'Objective 100% and delivered');
});

test('two causes on one meter each print their own amount', () => {
  const entries = [
    { metric: 'forestHealth', delta: 4, reason: 'Planting quality 90% on 3/3 blocks' },
    { metric: 'forestHealth', delta: 2, reason: 'Release queue treated' },
  ];
  assert.deepEqual(formatBridgeCauses(entries, { forestHealth: 6 }), [
    'Planting quality 90% on 3/3 blocks → Forest Health +4',
    'Release queue treated → Forest Health +2',
  ]);
  const cut = formatBridgeCauses(entries, { forestHealth: 4 }, { forestHealth: 'harder to gain near the top of the meter' });
  assert.equal(cut[2], 'Forest Health took +4 of the +6 earned; harder to gain near the top of the meter');
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
  assert.equal(gradeCampaignYear(solidMeters, 4).tier, 'solid');
  const capped = gradeCampaignYear(solidMeters, 1);
  assert.equal(capped.tier, 'mixed');
  assert.equal(capped.cappedFrom, 'solid');
  assert.match(describeYearEnd(capped).reasons[0], /takes at least 2 of 4 deployments delivered/);
});

test('the service record files the tier the Year in Review shows, not the uncapped meters', () => {
  const store = new Map();
  globalThis.window = {
    localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) },
  };
  try {
    const campaign = {
      yearMetrics: { progress: 60, forestHealth: 55, relationships: 60, compliance: 70, budget: 50 },
      seasonLog: [{ id: 'spring', victory: true }, { id: 'summer', victory: false }, { id: 'fall', victory: false }, { id: 'winter', victory: false }],
    };
    const grade = gradeCampaignYear(campaign.yearMetrics, 1);
    assert.equal(grade.earned, 'solid', 'the meters alone read Solid');
    assert.equal(grade.tier, 'mixed');
    const record = recordCampaignYear(campaign);
    assert.deepEqual(record.byRole.campaign, { runs: 1, victories: 0, bestScore: grade.score, bestGrade: 'Mixed' });
    assert.ok(grade.score < 60, `a Mixed year files a Mixed-band score, got ${grade.score}`);
  } finally {
    delete globalThis.window;
  }
});

test('one tier function decides both modes, each on its own gate table', () => {
  const years = [
    { progress: 52, forestHealth: 57, relationships: 85, compliance: 90, budget: 50 },
    { progress: 48, forestHealth: 52, relationships: 58, compliance: 72, budget: 44 },
    { progress: 30, forestHealth: 30, relationships: 30, compliance: 30, budget: 30 },
  ];
  for (const year of years) assert.equal(deriveTier(year), gradeTier(year).tier);
  const careful = { progress: 91, forestHealth: 66, relationships: 67, compliance: 81, budget: 62 };
  assert.equal(gradeCampaignYear(careful, 4).tier, gradeTier(careful, { gates: CAMPAIGN_TIER_GATES, delivered: 4 }).tier);
});

test('Solid ending copy reflects the deliveries: "The program delivered" only when it did', () => {
  const meters = { progress: 80, forestHealth: 58, relationships: 60, compliance: 70, budget: 50 };
  const twoOfFour = describeYearEnd(gradeCampaignYear(meters, 2));
  assert.match(twoOfFour.body, /^2\/4 deployments delivered\./);
  assert.doesNotMatch(twoOfFour.body, /The program delivered/);

  const allFour = describeYearEnd(gradeCampaignYear(meters, 4));
  assert.match(allFour.body, /The program delivered/);
  assert.match(allFour.reasons[0], /^Outstanding needs/);
});

test('a Solid year names the meters that fell short of Outstanding, with the values it finished on', () => {
  // The round-2 careful Okanagan year: every season delivered, held to Solid.
  const meters = { progress: 89, forestHealth: 61, relationships: 72, compliance: 83, budget: 36 };
  const grade = gradeCampaignYear(meters, 4);
  assert.equal(grade.tier, 'solid');
  const [reason] = describeYearEnd(grade).reasons;
  assert.match(reason, /^Outstanding needs Budget 40\+ \(you have 36\)/);
  assert.match(reason, /Compliance 85\+ \(you have 83\)/);
});

test('a flawless careful year can reach Outstanding; three of four deliveries cannot', () => {
  const meters = { progress: 91, forestHealth: 66, relationships: 67, compliance: 81, budget: 62 };
  assert.equal(gradeCampaignYear(meters, 4).tier, 'outstanding');
  const threeOfFour = gradeCampaignYear(meters, 3);
  assert.equal(threeOfFour.tier, 'solid');
  assert.match(describeYearEnd(threeOfFour).reasons[0], /takes at least 4 of 4 deployments delivered/);
});

test('a Mixed year names the Solid floors it missed', () => {
  const meters = { progress: 80, forestHealth: 50, relationships: 48, compliance: 55, budget: 50 };
  const grade = gradeCampaignYear(meters, 3);
  assert.equal(grade.tier, 'mixed');
  const { reasons } = describeYearEnd(grade);
  assert.equal(reasons[0], 'Solid needs Compliance 60+ (you have 55), Relationships 52+ (you have 48).');
});

test('a year saved at the Year in Review resumes as the Year in Review, not "Unknown"', () => {
  assert.equal(describeCampaignProgress({ seasonIndex: 4 }), 'Year in Review (all 4 seasons played)');
  assert.equal(describeCampaignProgress({ seasonIndex: 1, activeJourney: { day: 6 } }), 'Summer, day 6 (season 2 of 4)');
  assert.equal(describeCampaignProgress({ seasonIndex: 0 }), 'Spring (season 1 of 4)');
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

test('headless years: the review prints an amount for every meter it moves, and the seasons add up', async () => {
  const lines = [];
  const run = await simulateCampaign({ style: 'good', areaId: 'bulkley-valley', seed: 4000, trace: (line) => lines.push(line) });

  // Every "Why this happened" consequence names what it moved.
  let inWhy = false;
  let explained = 0;
  for (const line of lines) {
    if (line === 'WHY THIS HAPPENED') inWhy = true;
    else if (/^Season total:/.test(line)) inWhy = false;
    else if (inWhy && line.startsWith('• ')) {
      explained += 1;
      assert.match(line, / → (Progress|Forest Health|Relationships|Compliance|Budget) [+-]\d/, line);
    }
  }
  assert.ok(explained > 0, 'a careful year draws at least one recovery or consequence');
  assert.equal(lines.filter((line) => /^Season total:/.test(line)).length, 4);
  // Each deployment keeps its own CPD file; the seasonal reminder is no crisis.
  assert.ok(!lines.some((line) => /CPD Log Behind/.test(line)));

  // The season lines sum to the year's trendlines.
  const totals = { progress: 50, forestHealth: 50, relationships: 50, compliance: 50, budget: 50 };
  for (const season of run.seasonLog) {
    for (const [metric, delta] of Object.entries(season.deltas)) totals[metric] += delta;
  }
  for (const [metric, value] of Object.entries(run.yearMetrics)) assert.equal(totals[metric], Math.round(value), metric);
});
