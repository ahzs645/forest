/**
 * Campaign — "A Year in the District"
 * The unified flagship mode (docs/unified_campaign.md): one year, one
 * operating area, four seasons, four hats. Each season opens with a seasonal
 * briefing (strategy layer), plays a condensed expedition deployment
 * (journey layer), then closes with a season review where the year's five
 * meters absorb what the deployment actually did — consequences, recoveries,
 * and ecology drift included. The year ends in a tier, like a seasonal run,
 * with the deployments as the story of how it got there.
 */

import { FORESTER_ROLES, OPERATING_AREAS } from '../data/index.js';
import { generateCrew } from '../crew.js';
import { createJourney } from '../journey.js';
import { checkScheduledEvents } from '../events.js';
import { ensureDaySeed } from '../events/dayRng.js';
import { checkEndConditions as evaluateEndConditions } from '../modes/shared/endConditions.js';
import { runReconDay } from '../modes/recon.js';
import { runSilvicultureDay } from '../modes/silviculture.js';
import { runPlanningDay } from '../modes/planning.js';
import { runPermittingDay } from '../modes/permitting.js';
import { runManagerDay } from '../modes/manager.js';
import { createInitialState } from '../engine/state.js';
import { applyEffects, applyRoundConsequences, applyOptionOutcome, formatMetricDelta } from '../engine/effects.js';
import { describeConsequences } from '../engine/insights.js';
import { deriveTier, scoreMetricHealth } from '../engine/scoring.js';
import { drawIssue } from '../engine/content.js';
import { makeRng } from '../engine/rng.js';
import { clamp, formatMetricName } from '../engine/shared.js';
import { applyDifficultyMultipliers } from './ForestryTrailGame.js';
import { readCampaignSave, saveCampaignState, clearCampaignSave } from './saveLoad.js';
import { getCareerDeltas } from './debrief.js';
import { recordTieredRun } from '../career.js';
import { promptSeasonalCard, promptSummaryCard, renderMetricStrip, setExpeditionChromeHidden } from './seasonalAdapter.js';

// One year, four hats, in the order the work actually happens on a licensee's
// calendar: the spring plant goes in as soon as breakup ends, recon and layout
// run through the open summer ground, the planning file is built in the fall
// once the field notes are in, and the cutting and road permits are pushed
// through the district over winter. Each season names the expedition role
// that plays it and the seasonal-engine role that frames it (they share ids).
export const CAMPAIGN_SEASONS = [
  {
    id: 'spring',
    label: 'Spring',
    roleId: 'silviculture',
    title: 'Silviculture Program',
    situation: 'Breakup is over and the reefers are full: get the spring plant in before the stock ages out.',
    // No frost to come out of the ground on the maritime coast; the plant
    // runs through the late-winter rain.
    coastSituation: 'The reefers are full and the rain has not let up: get the spring plant in before the stock ages out.',
  },
  {
    id: 'summer',
    label: 'Summer',
    roleId: 'recce',
    title: 'Recon Traverse',
    situation: 'Ground is open and fully visible: walk the blocks the whole program will stand on — layout, streams, cultural features.',
  },
  {
    id: 'fall',
    label: 'Fall',
    roleId: 'planner',
    title: 'Planning File',
    situation: 'Field season winds down; the desk season begins. Turn what the year learned into a defensible plan.',
  },
  {
    id: 'winter',
    label: 'Winter',
    roleId: 'permitter',
    title: 'Permitting Push',
    situation: 'The plan means nothing until the District Manager signs the cutting and road permits. Shepherd them through before breakup.',
    coastSituation: 'The plan means nothing until the District Manager signs the cutting and road permits. Shepherd them through before the spring operating window opens.',
  },
];

const isFieldSeason = (journeyType) => ['recon', 'field', 'silviculture'].includes(journeyType);

/**
 * The season's opening line for this area: breakup is an Interior word, so
 * an area without frozen ground (no "freeze-thaw" tag) gets the coastal line.
 */
export function getSeasonSituation(season, area) {
  if (season?.coastSituation && !hasFrozenGround(area)) return season.coastSituation;
  return season?.situation || '';
}

function hasFrozenGround(area) {
  const tags = Array.isArray(area?.tags) ? area.tags : null;
  return !tags || tags.includes('freeze-thaw');
}

// Season briefing stances: a small immediate posture on the year's meters,
// plus one concrete perk for the deployment about to start. The perk (and its
// preview) depends on whether the season is a field deployment or a desk
// file — a permitting push has no fuel to top up and no first-aid kit to pack.
const BRIEFING_STANCES = [
  {
    label: 'Run it careful',
    preview: (journeyType) => (isFieldSeason(journeyType)
      ? 'Compliance +3 · Progress -2 · Extra first-aid kit and +5 equipment'
      : 'Compliance +3 · Progress -2 · Political capital +4 up front'),
    riskLevel: 'low',
    yearEffects: { compliance: 3, progress: -2 },
    perkLine: (journeyType) => (isFieldSeason(journeyType)
      ? 'The crew packs an extra first-aid kit and double-checks the gear.'
      : 'You open the season with a few favours banked at the district office.'),
    applyPerk(journey) {
      const r = journey.resources || {};
      if (typeof r.firstAid === 'number') r.firstAid += 1;
      if (typeof r.equipment === 'number') r.equipment = Math.min(100, r.equipment + 5);
      if (!isFieldSeason(journey.journeyType) && typeof r.politicalCapital === 'number') r.politicalCapital += 4;
    },
  },
  {
    label: 'Balance the season',
    preview: () => 'No meter or supply modifier — judged entirely on the deployment',
    riskLevel: 'medium',
    yearEffects: {},
    perkLine: () => 'No shortcuts, no padding. The season is what you make of it.',
    applyPerk() {},
  },
  {
    label: 'Push for delivery',
    preview: (journeyType) => (isFieldSeason(journeyType)
      ? 'Progress +3 · Compliance -2 · Fuel +15% and budget +8%'
      : 'Progress +3 · Compliance -2 · Budget +8%'),
    riskLevel: 'high',
    yearEffects: { progress: 3, compliance: -2 },
    perkLine: (journeyType) => (isFieldSeason(journeyType)
      ? 'Extra fuel and money up front — the woods manager expects numbers for it.'
      : 'Extra money up front — the woods manager expects permits for it.'),
    applyPerk(journey) {
      const r = journey.resources || {};
      if (typeof r.fuel === 'number') r.fuel = Math.round(r.fuel * 1.15);
      if (typeof r.budget === 'number') r.budget = Math.round(r.budget * 1.08);
    },
  },
];

/** The deployment type a campaign season plays, from the role that plays it. */
function getSeasonJourneyType(season) {
  return FORESTER_ROLES.find((r) => r.id === season.roleId)?.journeyType || 'field';
}

// A winter push after a fall file that never got its FSP approved: the old
// plan's term was extended, so only blocks already consistent with it can go
// out. The cutting permits for the new blocks wait for a replacement plan.
const FSP_EXTENSION_HELD_PERMITS = 4;
const FSP_EXTENSION_SCRUTINY = 8;
const FSP_EXTENSION_DISTRICT_COOLING = 6;

function fallFellShort(campaign) {
  const fall = (campaign.seasonLog || []).find((entry) => (entry.id || entry.season?.toLowerCase()) === 'fall');
  return Boolean(fall) && !fall.victory;
}

/** The briefing's situation line, told against what the year already did. */
export function describeSeasonSituation(campaign, season) {
  const area = OPERATING_AREAS.find((a) => a.id === campaign?.areaId) || null;
  if (season.id === 'winter' && fallFellShort(campaign)) {
    const deadline = hasFrozenGround(area) ? 'before breakup' : 'before the spring operating window opens';
    return `The fall plan never got its approval. The district extended the old FSP's term, so only blocks already consistent with it can go: the cutting permits for the new blocks wait for a replacement plan. Push what the extension covers through ${deadline}.`;
  }
  return getSeasonSituation(season, area);
}

/**
 * Carry an earlier season's outcome into the deployment about to start.
 * Winter used to issue cutting permits for a plan the District Manager never
 * approved. Mutates the journey before its standing is snapshotted, so the
 * review measures the season from where it actually opened.
 * @returns {string[]} lines for the deployment screen
 */
export function applySeasonCarryForward(campaign, season, journey) {
  if (season.id !== 'winter' || !fallFellShort(campaign) || !journey.permits) return [];
  const permits = journey.permits;
  const held = Math.min(FSP_EXTENSION_HELD_PERMITS, Math.max(0, (permits.target || 0) - 1));
  permits.programTarget = permits.target;
  permits.target -= held;
  permits.heldForFsp = held;
  permits.backlog = Math.max(0, (permits.backlog || 0) - held);
  journey.scrutiny = Math.min(100, Number(journey.scrutiny || 0) + FSP_EXTENSION_SCRUTINY);
  if (typeof journey.relationships?.ministry === 'number') {
    journey.relationships.ministry = Math.max(0, journey.relationships.ministry - FSP_EXTENSION_DISTRICT_COOLING);
  }
  return [
    `No approved FSP from the fall: ${held} cutting permits are held until a replacement plan is approved.`,
    `The season's queue is ${permits.target} permits under the extended plan, and the district is reading every one of them closely.`,
  ];
}

function saveCampaign(state) {
  saveCampaignState(state);
}

/** The saved year, or null — also when the save fails its schema check. */
export function loadCampaign() {
  const slot = readCampaignSave();
  return slot.status === 'ok' ? slot.data : null;
}

export function clearCampaign() {
  clearCampaignSave();
}

/** Objective completion 0..1, per deployment type. */
function getObjectiveCompletion(journey) {
  switch (journey.journeyType) {
    case 'recon':
    case 'field': {
      const total = journey.packageTarget ?? journey.blocks?.length ?? 0;
      return total ? clamp((journey.blocksAssessed || 0) / total, 0, 1) : 0;
    }
    case 'silviculture': {
      const p = journey.planting || {};
      const s = journey.surveys || {};
      const plant = p.blocksToPlant ? (p.blocksPlanted || 0) / p.blocksToPlant : 0;
      const survey = s.freeGrowingTarget ? (s.freeGrowingComplete || 0) / s.freeGrowingTarget : 0;
      return clamp(plant * 0.6 + survey * 0.4, 0, 1);
    }
    case 'planning': {
      const plan = journey.plan || {};
      const gates = ['dataCompleteness', 'analysisQuality', 'stakeholderBuyIn', 'ministerialConfidence']
        .map((key) => Number(plan[key]) || 0);
      return clamp(gates.reduce((sum, v) => sum + v, 0) / (gates.length * 100), 0, 1);
    }
    case 'permitting':
    case 'desk': {
      // Measured against the program the year needed, not the queue an FSP
      // extension left: permits held for a replacement plan are not delivered.
      const permits = journey.permits || {};
      const target = permits.programTarget || permits.target;
      return target ? clamp((permits.approved || 0) / target, 0, 1) : 0;
    }
    default:
      return 0;
  }
}

function getObjectiveDetail(journey) {
  switch (journey.journeyType) {
    case 'recon':
    case 'field': {
      const achieved = journey.blocksAssessed || 0;
      const target = journey.packageTarget ?? journey.blocks?.length ?? 0;
      return `${achieved}/${target} block packages finalized`;
    }
    case 'silviculture': {
      const p = journey.planting || {};
      const s = journey.surveys || {};
      return `${p.blocksPlanted || 0}/${p.blocksToPlant || 0} blocks planted, ${s.freeGrowingComplete || 0}/${s.freeGrowingTarget || 0} free-growing surveys`;
    }
    case 'planning': {
      const plan = journey.plan || {};
      return `data ${Math.round(plan.dataCompleteness || 0)}/80, analysis ${Math.round(plan.analysisQuality || 0)}/80, buy-in ${Math.round(plan.stakeholderBuyIn || 0)}/75, DM readiness ${Math.round(plan.ministerialConfidence || 0)}/80`;
    }
    case 'permitting':
    case 'desk': {
      const permits = journey.permits || {};
      const held = permits.heldForFsp
        ? `; ${permits.heldForFsp} cutting permits held for a replacement FSP`
        : '';
      return `${permits.approved || 0}/${permits.target || 0} permits approved${held}`;
    }
    default:
      return `${Math.round(getObjectiveCompletion(journey) * 100)}% complete`;
  }
}

const signed = (value) => `${value > 0 ? '+' : ''}${value}`;

/** Mean of the finite numbers in a map, or null. */
function averageOf(map) {
  const values = Object.values(map || {}).filter((value) => Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/**
 * Where the deployment's own standing opens, so the review measures the
 * season against its start rather than a flat baseline: a permitting desk
 * opens at scrutiny 38, a planting program at 12.
 */
export function readStandingSnapshot(journey) {
  return {
    scrutiny: Number(journey.scrutiny ?? 22),
    working: journey.journeyType === 'permitting' ? averageOf(journey.relationships) : null,
  };
}

/**
 * The metric bridge: what the deployment did to the year's five meters. Each
 * entry pairs a raw delta with a plain-language cause; the review prints what
 * actually landed on the meter (formatBridgeCauses).
 *
 * Relationships and compliance read what the player did in-season: the
 * relationship and compliance effects the season's events announced
 * (journey.standingLedger, js/events/resolution.js), the mode's own
 * relationship work — crew morale in the field, the engagement record on a
 * planning file, the working relationships on a permitting desk — and how far
 * scrutiny moved from where the deployment opened. Only manager journeys
 * carry `metrics`, so reading those left both meters inert.
 */
export function computeSeasonBridge(journey, endResult, startBudget) {
  const completion = getObjectiveCompletion(journey);
  const victory = Boolean(endResult?.victory);
  const start = journey.campaignStartStanding || {};
  const ledger = journey.standingLedger || {};
  const entries = [];

  // A season that delivered nothing costs real ground. It used to cost four
  // points, which a Push stance's +3 all but paid back.
  entries.push({
    metric: 'progress',
    delta: clamp(Math.round(-8 + completion * 20) + (victory ? 2 : 0), -8, 14),
    reason: `Objective ${(completion * 100).toFixed(0)}% ${victory ? 'and delivered' : 'complete'}`,
  });

  const relEvents = Math.round(Number(ledger.relationships) || 0);
  const relParts = relEvents ? [`in-season calls ${signed(relEvents)}`] : [];
  let relWork = 0;
  const crew = Array.isArray(journey.crew) ? journey.crew : [];
  if (crew.length) {
    const active = crew.filter((m) => m.isActive);
    if (!active.length) {
      relWork = -3;
      relParts.push('the crew walked off the job');
    } else {
      const morale = active.reduce((sum, m) => sum + (Number(m.morale) || 0), 0) / active.length;
      relWork = clamp(Math.round((morale - 70) / 10), -2, 2);
      if (relWork) relParts.push(`crew morale ${Math.round(morale)}`);
    }
  } else if (journey.journeyType === 'planning' && journey.plan) {
    const buyIn = Math.round(Number(journey.plan.stakeholderBuyIn) || 0);
    relWork = clamp(Math.round((buyIn - 60) / 12), -2, 3);
    if (relWork) relParts.push(`engagement record at ${buyIn}% buy-in`);
  } else if (journey.journeyType === 'permitting' && Number.isFinite(start.working)) {
    // Events shift every working relationship by half their announced amount;
    // what is left is the meetings, follow-ups and answered letters.
    const moved = (averageOf(journey.relationships) ?? start.working) - start.working - relEvents / 2;
    relWork = clamp(Math.round(moved / 4), -3, 3);
    if (relWork) relParts.push(`working relationships with the district, Nation and agencies ${relWork > 0 ? 'warmed' : 'cooled'}`);
  }
  const relationships = clamp(Math.round(relEvents / 5) + relWork, -10, 10);
  if (relationships) {
    entries.push({ metric: 'relationships', delta: relationships, reason: `Relationships: ${relParts.join('; ')}` });
  }

  const compEvents = Math.round(Number(ledger.compliance) || 0);
  const scrutinyStart = Math.round(Number(start.scrutiny ?? 22));
  const scrutinyEnd = Math.round(Number(journey.scrutiny ?? scrutinyStart));
  const compliance = clamp(
    Math.round(compEvents / 4) + clamp(Math.round((scrutinyStart - scrutinyEnd) / 5), -5, 4),
    -10,
    10,
  );
  if (compliance) {
    const parts = compEvents ? [`in-season calls ${signed(compEvents)}`] : [];
    parts.push(scrutinyEnd === scrutinyStart
      ? `scrutiny held at ${scrutinyEnd}%`
      : `scrutiny ${scrutinyEnd > scrutinyStart ? 'rose' : 'eased'} ${scrutinyStart}% → ${scrutinyEnd}%`);
    entries.push({ metric: 'compliance', delta: compliance, reason: `The file: ${parts.join('; ')}` });
  }

  // Thrift only counts for work that got done. An allowance left unspent
  // because the crew starved or the queue sat still is not a saving.
  const endBudget = Number(journey.resources?.budget ?? 0);
  if (startBudget > 0) {
    const spentFraction = clamp(1 - endBudget / startBudget, 0, 1);
    const raw = 5 - spentFraction * 11;
    const spent = `Spent ${(spentFraction * 100).toFixed(0)}% of the season allowance`;
    entries.push({
      metric: 'budget',
      delta: clamp(Math.round(raw > 0 ? raw * completion : raw), -8, 5),
      reason: raw > 0 && completion < 0.5 ? `${spent}, with the work it was for undone` : spent,
    });
  }

  // Forest health only moves when the deployment actually touched the land;
  // the ecology drift stays the systemic mover.
  if (journey.journeyType === 'silviculture') {
    const quality = Number(journey.planting?.qualityAverage ?? journey.planting?.survivalRate ?? 85);
    entries.push({ metric: 'forestHealth', delta: quality >= 85 ? 4 : quality < 75 ? -3 : 1, reason: `Planting quality ${quality}%` });
  } else if (journey.journeyType === 'recon' || journey.journeyType === 'field') {
    const swept = (journey.blocks || []).filter((block) => journey.reconIntel?.byBlock?.[block.id]?.valuesSwept).length;
    const fh = clamp(Math.floor(swept / 2), 0, 3);
    if (fh) entries.push({ metric: 'forestHealth', delta: fh, reason: `${swept} values sweeps on the ground` });
  }

  const deltas = {};
  for (const entry of entries) deltas[entry.metric] = (deltas[entry.metric] || 0) + entry.delta;
  return { deltas, entries, completion, victory };
}

/**
 * Apply effects to the year and measure what each meter actually moved. The
 * review used to print the raw bridge (Progress +14) while the meter took +8.
 * @returns {{moved: Object, notes: Object}} per-metric movement, and why a
 *   meter took less than it was given
 */
export function applyYearEffects(gs, effects, source) {
  const before = { ...gs.metrics };
  const flags = gs.flags || {};
  applyEffects(gs, effects, source);
  const moved = {};
  const notes = {};
  for (const [key, delta] of Object.entries(effects)) {
    if (gs.metrics[key] === undefined) continue;
    moved[key] = Math.round(gs.metrics[key] - before[key]);
    if (moved[key] === Math.round(delta)) continue;
    if (gs.metrics[key] <= 0 || gs.metrics[key] >= 100) notes[key] = 'the meter is at its limit';
    else if (key === 'relationships' && flags.trustDeficitActive && delta > 0) notes[key] = 'low trust halves the gain';
    else if (key === 'budget' && flags.budgetLoanActive && delta > 0) notes[key] = 'the loan takes its cut';
    else if (delta > 0 && before[key] >= 75) notes[key] = 'harder to gain near the top of the meter';
  }
  return { moved, notes };
}

/** Review lines for the bridge, each naming the change the meter actually took. */
export function formatBridgeCauses(entries, moved = {}, notes = {}) {
  return entries.map((entry) => {
    const name = formatMetricName(entry.metric);
    const actual = moved[entry.metric] ?? entry.delta;
    if (!actual && !entry.delta) return `${entry.reason} → no ${name} change`;
    const note = notes[entry.metric] ? `; ${notes[entry.metric]}` : '';
    const earned = actual !== entry.delta ? ` (${signed(entry.delta)} earned${note})` : '';
    return `${entry.reason} → ${name} ${signed(actual)}${earned}`;
  });
}

/** Build a fresh seasonal-engine state for this season's role, sharing the year's meters. */
function buildSeasonState(campaign, season) {
  const gs = createInitialState({
    companyName: campaign.crewName,
    roleId: season.roleId,
    areaId: campaign.areaId,
  });
  gs.metrics = campaign.yearMetrics;
  gs.history = campaign.history;
  gs.flags = campaign.flags;
  gs.pendingIssues = campaign.pendingIssues;
  gs.round = campaign.seasonIndex + 1;
  gs.totalRounds = CAMPAIGN_SEASONS.length;
  gs.discoveryTags = campaign.discoveryTags;
  // The campaign shows one name per hat everywhere — briefing, metric strip,
  // review — so the strategy layer's short label ("Field Technician") never
  // contradicts the deployment's "Recon Crew Lead".
  gs.roleDisplayName = FORESTER_ROLES.find((r) => r.id === season.roleId)?.name || gs.roleDisplayName;
  return gs;
}

async function promptContinue(ui, label = 'Continue') {
  await ui.promptChoice('', [{ label, value: 'next' }]);
}

/**
 * Run the campaign. `game` is the ForestryTrailGame instance — its ui renders
 * everything, and its journey slot hosts each season's deployment so the
 * existing mode day-runners work unchanged.
 */
export async function runCampaign(game) {
  // While the campaign owns the journey slot, game.checkpoint() must not
  // write the expedition autosave — the year lives in bcft.campaign.v1.
  game._campaignActive = true;
  try {
    return await runCampaignInner(game);
  } finally {
    // Never leak hidden expedition chrome or the campaign banner back to the
    // hub or a quick mode.
    game._campaignActive = false;
    setExpeditionChromeHidden(false);
    game.ui.campaignBanner = null;
    game.journey = null;
  }
}

async function runCampaignInner(game) {
  const ui = game.ui;

  let campaign = null;
  const saved = loadCampaign();
  if (saved) {
    ui.clear();
    ui.writeHeader('CAMPAIGN IN PROGRESS');
    const seasonLabel = CAMPAIGN_SEASONS[saved.seasonIndex]?.label || 'Unknown';
    ui.write(`${saved.crewName} — ${seasonLabel}, ${saved.areaName || 'the district'}.`);
    ui.write('Saves land at the start of each day — resuming replays the saved day from its morning.', 'term-dim');
    const resume = await ui.promptChoice('', [
      { label: 'Resume the year', value: 'resume' },
      { label: 'Start a new campaign (abandons the saved year)', value: 'fresh' },
    ]);
    if (resume.value === 'resume') {
      campaign = saved;
      campaign.rng = makeRng(campaign.rngState ?? campaign.seed);
    } else {
      clearCampaign();
    }
  }

  if (!campaign) {
    campaign = await setupCampaign(ui);
    if (!campaign) return;
  }

  while (campaign.seasonIndex < CAMPAIGN_SEASONS.length) {
    const season = CAMPAIGN_SEASONS[campaign.seasonIndex];
    const completed = await runCampaignSeason(game, campaign, season);
    if (!completed) return; // crash recovery path already handled

    campaign.seasonIndex += 1;
    campaign.activeJourney = null;
    campaign.stanceIndex = null;
    campaign.rngState = campaign.rng.state();
    saveCampaign(serializeCampaign(campaign));
  }

  // One service-record entry per year (docs/unified_campaign.md), filed before
  // the review so a reload on the year-end card cannot file it twice.
  if (!campaign.recorded) {
    recordCampaignYear(campaign);
    campaign.recorded = true;
    saveCampaign(serializeCampaign(campaign));
  }

  const result = await showYearEnd(ui, campaign);
  clearCampaign();
  return result;
}

/**
 * File a finished campaign year to the service record: one tree in the career
 * forest, graded by the year's tier, plus the field counters (km, seedlings,
 * plans, permits) its four deployments earned.
 * @param {Object} campaign
 * @returns {Object} the updated service record
 */
export function recordCampaignYear(campaign) {
  const careerDeltas = {};
  for (const season of campaign.seasonLog || []) {
    for (const [key, value] of Object.entries(season.careerDeltas || {})) {
      if (Number.isFinite(value)) careerDeltas[key] = (careerDeltas[key] || 0) + value;
    }
  }
  return recordTieredRun('campaign', {
    tier: deriveTier(campaign.yearMetrics),
    score: scoreMetricHealth(campaign.yearMetrics),
  }, careerDeltas);
}

async function setupCampaign(ui) {
  ui.clear();
  ui.writeHeader('A YEAR IN THE DISTRICT');
  ui.write('One operating area. Four seasons. Four hats.');
  ui.write('Spring planting, summer recon and layout, a fall planning file, a winter permitting push — the same five meters carry through the whole year.');
  ui.write('');

  const areaChoice = await ui.promptChoice('Operating area:', OPERATING_AREAS.map((area, index) => ({
    label: area.name,
    description: `${area.becZone} — ${area.description?.slice(0, 90) || ''}`,
    value: index,
  })));
  const area = OPERATING_AREAS[areaChoice.value];

  const difficultyChoice = await ui.promptChoice('Difficulty:', [
    { label: 'Greenhorn (Easy)', description: 'More resources, fewer events.', value: 'easy' },
    { label: 'Journeyman (Normal)', description: 'Standard challenge.', value: 'normal' },
    { label: 'Old Growth (Hard)', description: 'Fewer resources, more events.', value: 'hard' },
  ]);

  const crewName = (await ui.promptText('Crew name:', 'The Timber Wolves')) || 'The Timber Wolves';

  const seed = Math.floor(Math.random() * 0x100000000);
  return {
    version: 1,
    crewName,
    areaId: area.id,
    areaName: area.name,
    difficulty: difficultyChoice.value || 'normal',
    seasonIndex: 0,
    yearMetrics: { progress: 50, forestHealth: 50, relationships: 50, compliance: 50, budget: 50 },
    history: [],
    flags: {},
    pendingIssues: [],
    discoveryTags: [],
    seasonLog: [],
    seed,
    rngState: seed,
    rng: makeRng(seed),
    activeJourney: null,
    stanceIndex: null,
  };
}

function serializeCampaign(campaign) {
  const { rng, ...rest } = campaign;
  return rest;
}

async function runCampaignSeason(game, campaign, season) {
  const ui = game.ui;
  const gsSeason = buildSeasonState(campaign, season);

  // ── 1. Season briefing ──────────────────────────────────────────────────
  let stance;
  if (campaign.stanceIndex != null && campaign.activeJourney) {
    stance = BRIEFING_STANCES[campaign.stanceIndex];
  } else {
    // The season turns over on screen: last season's name scrambles and
    // resolves into the new one before the briefing card.
    if (typeof ui.playScene === 'function') {
      const prevLabel = CAMPAIGN_SEASONS[campaign.seasonIndex - 1]?.label?.toUpperCase()
        || 'A YEAR IN THE DISTRICT';
      const { buildTextMorphFrames } = await import('../scene/textmode/effects.js');
      await ui.playScene(
        buildTextMorphFrames(prevLabel, season.label.toUpperCase(), {
          cols: 44,
          rows: 3,
          frames: 20,
          seed: 17 + campaign.seasonIndex,
        }),
        { delay: 90, holdLastFrame: false }
      );
    }
    setExpeditionChromeHidden(true);
    const journeyType = getSeasonJourneyType(season);
    const stanceIndex = await promptSeasonalCard(ui, {
      cardLabel: `${season.label} · Season ${campaign.seasonIndex + 1} of 4`,
      title: `${season.label}: ${season.title}`,
      description: describeSeasonSituation(campaign, season),
      context: `You take the ${FORESTER_ROLES.find((r) => r.id === season.roleId)?.name || season.roleId} seat this season. The deployment is condensed — a season's worth of work in a tight window — and what it does feeds the year's meters at the season review.`,
      decisionPrompt: isFieldSeason(journeyType) ? 'How do you brief the crew?' : 'How do you set the season up?',
      optionDetails: BRIEFING_STANCES.map((s) => ({ preview: s.preview(journeyType), riskLevel: s.riskLevel })),
    }, BRIEFING_STANCES.map((s) => s.label), gsSeason);

    stance = BRIEFING_STANCES[stanceIndex];
    campaign.stanceIndex = stanceIndex;
    campaign.stanceMoved = null;
    if (Object.keys(stance.yearEffects).length) {
      campaign.stanceMoved = applyYearEffects(gsSeason, stance.yearEffects, {
        type: 'assignment',
        id: `campaign-briefing-${season.id}`,
        title: `${season.label} briefing: ${stance.label}`,
        option: stance.label,
        round: gsSeason.round,
      }).moved;
    }
  }

  // ── 2. Deployment ───────────────────────────────────────────────────────
  let journey = campaign.activeJourney;
  if (!journey) {
    const role = FORESTER_ROLES.find((r) => r.id === season.roleId) || FORESTER_ROLES[0];
    const area = OPERATING_AREAS.find((a) => a.id === campaign.areaId) || OPERATING_AREAS[0];
    journey = createJourney({
      crewName: campaign.crewName,
      companyName: campaign.crewName,
      role,
      area,
      roleId: season.roleId,
      areaId: campaign.areaId,
      // Silviculture builds its own crew (checker, accredited surveyor, OFA 3
      // attendant, driver) in the factory; every other field season takes the
      // generic layout crew.
      crew: season.roleId === 'silviculture' ? undefined : generateCrew(5, role.journeyType || 'field'),
      scale: 'campaign',
    });
    journey.difficulty = campaign.difficulty;
    applyDifficultyMultipliers(journey, campaign.difficulty);
    stance.applyPerk(journey);
    journey.campaignStartBudget = Number(journey.resources?.budget ?? 0);
    // Marks the journey as a campaign deployment (js/game/saveLoad.js never
    // offers one as a standalone expedition).
    journey.campaignStartMetrics = { ...(journey.metrics || {}) };
    // The deployment's internal calendar matches the campaign season, so a
    // winter permitting push doesn't display "Spring Y1" in the sidebar.
    if (journey.season?.currentSeason) {
      journey.season.currentSeason = season.id;
      journey.season.totalDaysInSeason = journey.season.totalDaysInSeason || 30;
    }
    // Carry the year's discoveries into the new deployment.
    if (Array.isArray(campaign.discoveryTags) && campaign.discoveryTags.length) {
      journey.discoveryTags = [...campaign.discoveryTags];
    }
    const carryLines = applySeasonCarryForward(campaign, season, journey);
    journey.campaignStartStanding = readStandingSnapshot(journey);

    ui.clear();
    ui.writeHeader(`DEPLOYMENT: ${season.title.toUpperCase()}`);
    for (const line of carryLines) ui.writeWarning(line);
    ui.write(stance.perkLine(journey.journeyType), 'term-dim');
    ui.write('');
    await promptContinue(ui, 'Move out');
  }

  setExpeditionChromeHidden(false);
  game.journey = journey;
  game.gameOver = false;
  game.victory = false;

  let endResult = null;
  while (!endResult) {
    try {
      // Keep the campaign layer visible inside the deployment: day headers
      // clear the screen, and this banner is re-written by every clear().
      const m = campaign.yearMetrics;
      ui.campaignBanner = `CAMPAIGN · ${season.label} ${campaign.seasonIndex + 1}/4 · Year: `
        + `Progress ${Math.round(m.progress)} · Forest ${Math.round(m.forestHealth)} · Relations ${Math.round(m.relationships)} `
        + `· Compliance ${Math.round(m.compliance)} · Budget ${Math.round(m.budget)}`;
      ui.updateAllStatus(journey);
      ensureDaySeed(journey);

      const scheduledEvent = checkScheduledEvents(journey);
      if (scheduledEvent) {
        await game._handleEvent(scheduledEvent);
        // An event that ends the run closes the deployment here, the way the
        // expedition loop breaks on it. Without this the season played on
        // past its own ending.
        if (game.gameOver) {
          endResult = { gameOver: true, reason: journey.endReason || 'Operations halted' };
          break;
        }
      }

      switch (journey.journeyType) {
        case 'silviculture': await runSilvicultureDay(game); break;
        case 'planning': await runPlanningDay(game); break;
        case 'permitting':
        case 'desk': await runPermittingDay(game); break;
        case 'manager': await runManagerDay(game); break;
        case 'recon':
        case 'field':
        default: await runReconDay(game); break;
      }

      endResult = evaluateEndConditions(journey) || null;
      if (!endResult) {
        // Roll the next day's dice before the save, as the expedition loop
        // does, so resuming replays the day rather than re-rolling it.
        ensureDaySeed(journey);
        campaign.activeJourney = journey;
        campaign.rngState = campaign.rng.state();
        saveCampaign(serializeCampaign(campaign));
      }
    } catch (error) {
      console.error('Campaign deployment error:', error);
      ui.write('');
      ui.writeDanger(`Something broke in the field office: ${error.message}`);
      ui.write('The campaign is saved to the start of this day.', 'term-dim');
      await ui.promptChoice('', [{ label: 'Reload & Resume', value: 'reload' }]);
      window.location.reload();
      return false;
    }
  }

  // ── 3. Season review ────────────────────────────────────────────────────
  ui.campaignBanner = null;
  setExpeditionChromeHidden(true);
  const bridge = computeSeasonBridge(journey, endResult, journey.campaignStartBudget);
  const objectiveDetail = getObjectiveDetail(journey);
  const applied = applyYearEffects(gsSeason, bridge.deltas, {
    type: 'event',
    id: `campaign-season-${season.id}`,
    title: `${season.label} deployment: ${season.title}`,
    option: endResult.victory ? 'Delivered' : 'Fell short',
    round: gsSeason.round,
  });
  const causes = formatBridgeCauses(bridge.entries, applied.moved, applied.notes);
  const seasonDeltas = { ...applied.moved };
  if (stance && Object.keys(stance.yearEffects).length) {
    causes.push(`Briefing stance "${stance.label}" → ${formatMetricDelta(campaign.stanceMoved || stance.yearEffects)}`);
  }
  // The Push stance banked Progress up front on the promise of delivery; a
  // season that fell short gives it back.
  if (stance?.yearEffects.progress > 0 && !endResult.victory) {
    const clawback = applyYearEffects(gsSeason, { progress: -stance.yearEffects.progress }, {
      type: 'event',
      id: `campaign-push-shortfall-${season.id}`,
      title: `${season.label}: pushed for delivery and fell short`,
      option: stance.label,
      round: gsSeason.round,
    }).moved.progress;
    seasonDeltas.progress = (seasonDeltas.progress || 0) + clawback;
    causes.push(`Pushed for delivery and fell short: the woods manager wanted the numbers → Progress ${clawback}`);
  }

  // Pull the deployment's discoveries into the year.
  if (Array.isArray(journey.discoveryTags)) {
    for (const tag of journey.discoveryTags) {
      if (!campaign.discoveryTags.some((t) => (t.id || t) === (tag.id || tag))) {
        campaign.discoveryTags.push(tag);
      }
    }
  }

  // Crisis interlude: a danger-severity issue interrupts the review — and a
  // failed deployment always draws one, so falling short has a face.
  const issue = drawIssue(gsSeason, campaign.rng);
  const isCrisis = issue && Array.isArray(issue.options) && issue.options.length
    && (issue.surfaceSeverity === 'danger' || !endResult.victory);
  if (isCrisis) {
    const index = await promptSeasonalCard(ui, {
      cardLabel: 'CRISIS',
      title: issue.title,
      headline: issue.headline,
      description: issue.description,
      context: issue.context,
      whyNow: issue.whyNow,
      decisionPrompt: issue.decisionPrompt || 'Your call:',
      optionDetails: issue.optionDetails || issue.options.map((o) => ({
        preview: formatMetricDelta(o.effects || {}),
        riskLevel: o.risk ? 'high' : undefined,
      })),
      notice: issue.notice,
    }, issue.options.map((o) => o.label || String(o)), gsSeason);
    const outcome = applyOptionOutcome(gsSeason, issue.options[index], {
      type: 'issue',
      id: issue.id,
      title: issue.title,
      option: issue.options[index]?.label,
      round: gsSeason.round,
    }, campaign.rng);
    if (outcome?.outcome) {
      ui.write('');
      ui.write(outcome.outcome);
      if (outcome.effects && Object.keys(outcome.effects).length) {
        ui.write(`Effects: ${formatMetricDelta(outcome.effects)}`, 'term-dim');
      }
      await promptContinue(ui);
    }
  }

  const consequences = applyRoundConsequences(gsSeason);
  const explained = describeConsequences(gsSeason, consequences);

  ui.clear();
  renderMetricStrip(ui, gsSeason);
  ui.write('');
  ui.writeHeader(`${season.label.toUpperCase()} REVIEW`);
  // The recon end check is shared with standalone expeditions, whose win line
  // reads "Expedition completed!" — not something a campaign season says.
  const endReason = endResult.reason === 'Expedition completed!' ? '' : (endResult.reason || '');
  ui.write([
    `${season.title} ${endResult.victory ? 'delivered' : 'fell short'}: ${objectiveDetail}.`,
    endReason,
  ].filter(Boolean).join(' '));
  ui.write('');
  ui.writeDivider('WHAT IT DID TO THE YEAR');
  for (const cause of causes) ui.write(`• ${cause}`);
  if (explained.length) {
    ui.writeDivider('WHY THIS HAPPENED');
    for (const entry of explained) {
      ui.write(`• ${entry.title}`);
      if (entry.cause) ui.write(`  ${entry.cause}`, 'term-dim');
      if (entry.effects && Object.keys(entry.effects).length) {
        ui.write(`  ${formatMetricDelta(entry.effects)}`, 'term-dim');
      }
    }
  }
  ui.write('');
  await promptContinue(ui, campaign.seasonIndex + 1 < CAMPAIGN_SEASONS.length
    ? `On to ${CAMPAIGN_SEASONS[campaign.seasonIndex + 1].label}`
    : 'Close out the year');

  campaign.seasonLog.push({
    id: season.id,
    season: season.label,
    title: season.title,
    victory: endResult.victory === true,
    reason: endReason,
    detail: objectiveDetail,
    completion: Math.round(bridge.completion * 100),
    deltas: seasonDeltas,
    standing: { ...(journey.standingLedger || {}) },
    metricsAfter: { ...campaign.yearMetrics },
    careerDeltas: getCareerDeltas(journey, endResult.victory === true),
  });

  game.journey = null;
  return true;
}

const TIER_ORDER = ['stumbled', 'mixed', 'solid', 'outstanding'];

// The deployments a year must deliver to earn a tier. The meters alone let a
// year that delivered one season of four read "The program delivered".
const MIN_DELIVERIES = { solid: 2, outstanding: 3 };

// The meter floors of the next tier up (js/engine/scoring.js deriveTier),
// named on the Year in Review so the player can see what held the year back.
const NEXT_TIER_FLOORS = {
  stumbled: { tier: 'Mixed', floors: { compliance: 45, relationships: 42, forestHealth: 42 } },
  mixed: { tier: 'Solid', floors: { compliance: 60, relationships: 52, forestHealth: 48, progress: 35 } },
};

/**
 * The year's tier: the meters decide it, and the deployments cap it.
 * @returns {{tier: string, cappedFrom: string|null}}
 */
export function deriveCampaignTier(metrics, delivered) {
  const earned = deriveTier(metrics);
  let tier = earned;
  while (MIN_DELIVERIES[tier] && delivered < MIN_DELIVERIES[tier]) {
    tier = TIER_ORDER[TIER_ORDER.indexOf(tier) - 1];
  }
  return { tier, cappedFrom: tier === earned ? null : earned };
}

/** The Year in Review's verdict, written against what was actually delivered. */
export function describeYearEnd({ tier, cappedFrom }, delivered, metrics, total = CAMPAIGN_SEASONS.length) {
  const all = delivered === total;
  const most = delivered >= Math.ceil(total / 2);
  const body = {
    outstanding: all
      ? 'An exceptional year — the rest of the district will be measured against it.'
      : 'An exceptional year on the meters, with one season that got away. The district will still measure itself against it.',
    solid: all
      ? 'A clearly good year. The program delivered and the file holds up.'
      : 'A good year on balance: the file holds up, and the seasons that delivered carried the ones that fell short.',
    mixed: delivered === 0
      ? 'Mixed on paper, but nothing the year set out to deliver got delivered.'
      : most
        ? 'The work mostly got done, but the meters show what it cost.'
        : 'Mixed outcomes. Some seasons carried the ones that stumbled.',
    stumbled: 'A hard year. The meters tell the story, and so will the review.',
  }[tier] || '';

  const reasons = [];
  if (cappedFrom) {
    const need = MIN_DELIVERIES[cappedFrom];
    reasons.push(`The meters read ${cappedFrom[0].toUpperCase()}${cappedFrom.slice(1)}, but that takes at least ${need} of ${total} deployments delivered.`);
  } else if (tier === 'solid') {
    reasons.push('Outstanding needs Compliance 88+ with Relationships 72+, or Forest Health 67+ with Compliance 75+ and Relationships 65+, and no meter under 40.');
  } else if (NEXT_TIER_FLOORS[tier]) {
    const next = NEXT_TIER_FLOORS[tier];
    const missing = Object.entries(next.floors)
      .filter(([key, floor]) => Number(metrics[key]) < floor)
      .map(([key, floor]) => `${formatMetricName(key)} ${floor}+ (you have ${Math.round(metrics[key])})`);
    reasons.push(missing.length
      ? `${next.tier} needs ${missing.join(', ')}.`
      : `${next.tier} needs a stronger year across all five meters.`);
  }
  return { body: `${delivered}/${total} deployments delivered. ${body}`, reasons };
}

async function showYearEnd(ui, campaign) {
  setExpeditionChromeHidden(true);
  const metrics = campaign.yearMetrics;
  const wins = campaign.seasonLog.filter((s) => s.victory).length;
  const verdict = deriveCampaignTier(metrics, wins);
  const { tier } = verdict;
  const { body, reasons } = describeYearEnd(verdict, wins, metrics);

  const summary = {
    heading: 'YEAR IN REVIEW',
    tier,
    body: `${body} The year goes on your service record — look for its tree at the district office.`,
    scoreReasons: reasons,
    seasonSummaries: campaign.seasonLog.map((s) =>
      `• ${s.season} ${s.title}: ${s.victory ? 'delivered' : 'fell short'} at ${s.completion}% (${s.detail || 'counts unavailable'}) — ${formatMetricDelta(s.deltas) || 'no metric movement'}`),
    trendLines: Object.entries(metrics).map(([key, value]) => `${formatMetricName(key)}: ${Math.round(value)}`),
  };

  const gsLike = { metrics, round: 4, totalRounds: 4, roleDisplayName: campaign.crewName };
  await promptSummaryCard(ui, summary, ['Return to the district office'], gsLike);
  return { tier, yearMetrics: { ...metrics }, seasonLog: campaign.seasonLog, delivered: wins };
}
