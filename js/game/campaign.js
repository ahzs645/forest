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
import { checkEndConditions as evaluateEndConditions } from '../modes/shared/endConditions.js';
import { runReconDay } from '../modes/recon.js';
import { runSilvicultureDay } from '../modes/silviculture.js';
import { runPlanningDay } from '../modes/planning.js';
import { runPermittingDay } from '../modes/permitting.js';
import { createInitialState } from '../engine/state.js';
import { applyEffects, applyRoundConsequences, applyOptionOutcome, formatMetricDelta } from '../engine/effects.js';
import { describeConsequences } from '../engine/insights.js';
import { deriveTier } from '../engine/scoring.js';
import { drawIssue } from '../engine/content.js';
import { makeRng } from '../engine/rng.js';
import { clamp, formatMetricName } from '../engine/shared.js';
import { applyDifficultyMultipliers } from './ForestryTrailGame.js';
import { promptSeasonalCard, promptSummaryCard, renderMetricStrip, setExpeditionChromeHidden } from './seasonalAdapter.js';

const CAMPAIGN_SAVE_KEY = 'bcft.campaign.v1';

// One year, four hats. Each season names the expedition role that plays it
// and the seasonal-engine role that frames it (they share ids).
const CAMPAIGN_SEASONS = [
  {
    id: 'spring',
    label: 'Spring',
    roleId: 'recce',
    title: 'Recon Traverse',
    situation: 'Breakup is over and the year starts on the ground: scout the blocks the whole program will stand on.',
  },
  {
    id: 'summer',
    label: 'Summer',
    roleId: 'silviculture',
    title: 'Silviculture Program',
    situation: 'Planting windows are open. Put trees in the ground the spring recon said would carry them.',
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
    situation: 'The plan means nothing until it clears the agencies. Shepherd the permits through before spring.',
  },
];

// Season briefing stances: a small immediate posture on the year's meters,
// plus one concrete perk for the deployment about to start.
const BRIEFING_STANCES = [
  {
    label: 'Run it careful',
    preview: 'Compliance +3 · Progress -2 · Extra first-aid kit and +5 equipment',
    riskLevel: 'low',
    yearEffects: { compliance: 3, progress: -2 },
    perkLine: 'The crew packs an extra first-aid kit and double-checks the gear.',
    applyPerk(journey) {
      const r = journey.resources || {};
      if (typeof r.firstAid === 'number') r.firstAid += 1;
      if (typeof r.equipment === 'number') r.equipment = Math.min(100, r.equipment + 5);
    },
  },
  {
    label: 'Balance the season',
    preview: 'No meter or supply modifier — judged entirely on the deployment',
    riskLevel: 'medium',
    yearEffects: {},
    perkLine: 'No shortcuts, no padding. The season is what you make of it.',
    applyPerk() {},
  },
  {
    label: 'Push for delivery',
    preview: 'Progress +3 · Compliance -2 · Fuel +15% and budget +8%',
    riskLevel: 'high',
    yearEffects: { progress: 3, compliance: -2 },
    perkLine: 'Extra fuel and money up front — the district expects numbers for it.',
    applyPerk(journey) {
      const r = journey.resources || {};
      if (typeof r.fuel === 'number') r.fuel = Math.round(r.fuel * 1.15);
      if (typeof r.budget === 'number') r.budget = Math.round(r.budget * 1.08);
    },
  },
];

function saveCampaign(state) {
  try {
    localStorage.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(state));
  } catch { /* storage full/unavailable: play on without persistence */ }
}

export function loadCampaign() {
  try {
    const raw = localStorage.getItem(CAMPAIGN_SAVE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    return state?.version === 1 ? state : null;
  } catch {
    return null;
  }
}

export function clearCampaign() {
  try {
    localStorage.removeItem(CAMPAIGN_SAVE_KEY);
  } catch { /* ignore */ }
}

/** Objective completion 0..1, per deployment type. */
function getObjectiveCompletion(journey) {
  switch (journey.journeyType) {
    case 'recon':
    case 'field': {
      const total = journey.blocks?.length || 0;
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
      const permits = journey.permits || {};
      return permits.target ? clamp((permits.approved || 0) / permits.target, 0, 1) : 0;
    }
    default:
      return 0;
  }
}

/**
 * The metric bridge: what the deployment did to the year's five meters,
 * each delta paired with a plain-language cause for the review card.
 */
function computeSeasonBridge(journey, endResult, startBudget) {
  const completion = getObjectiveCompletion(journey);
  const victory = Boolean(endResult?.victory);
  const starts = journey.campaignStartMetrics || {};
  const deltas = {};
  const causes = [];

  let progress = Math.round(-4 + completion * 16) + (victory ? 2 : 0);
  deltas.progress = clamp(progress, -6, 14);
  causes.push(`Objective ${(completion * 100).toFixed(0)}% ${victory ? 'and delivered' : 'complete'} → Progress ${deltas.progress >= 0 ? '+' : ''}${deltas.progress}`);

  // Stakeholder signal: how the run moved its own relationships AND
  // reputation meters, plus a small read from crew morale for field modes —
  // otherwise a clean-but-quiet season leaves the year meter inert.
  const relMoved = Number(journey.metrics?.relationships ?? 50) - Number(starts.relationships ?? 50);
  const repMoved = Number(journey.metrics?.reputation ?? 50) - Number(starts.reputation ?? 50);
  const crew = Array.isArray(journey.crew) ? journey.crew.filter((m) => m.isActive) : [];
  const morale = crew.length
    ? crew.reduce((sum, m) => sum + (Number(m.morale) || 0), 0) / crew.length
    : null;
  const moraleSignal = morale === null ? 0 : clamp(Math.round((morale - 70) / 10), -2, 2);
  deltas.relationships = clamp(Math.round((relMoved + repMoved) / 5) + moraleSignal, -8, 8);
  if (deltas.relationships) {
    causes.push(`Stakeholders and crew ${deltas.relationships > 0 ? 'came along' : 'were strained'} → Relationships ${deltas.relationships > 0 ? '+' : ''}${deltas.relationships}`);
  }

  const compMoved = Number(journey.metrics?.compliance ?? 50) - Number(starts.compliance ?? 50);
  const scrutiny = Number(journey.scrutiny ?? 20);
  deltas.compliance = clamp(
    Math.round(compMoved / 4) + clamp(Math.round((22 - scrutiny) / 6), -5, 3),
    -10,
    8,
  );
  if (deltas.compliance) {
    causes.push(`File compliance ${compMoved >= 0 ? 'held' : 'slipped'}, scrutiny ${scrutiny} → Compliance ${deltas.compliance > 0 ? '+' : ''}${deltas.compliance}`);
  }

  const endBudget = Number(journey.resources?.budget ?? 0);
  if (startBudget > 0) {
    const spentFraction = clamp(1 - endBudget / startBudget, 0, 1);
    deltas.budget = clamp(Math.round(5 - spentFraction * 11), -8, 5);
    causes.push(`Spent ${(spentFraction * 100).toFixed(0)}% of the season allowance → Budget ${deltas.budget >= 0 ? '+' : ''}${deltas.budget}`);
  }

  // Forest health only moves when the deployment actually touched the land;
  // the ecology drift stays the systemic mover.
  let fh = 0;
  if (journey.journeyType === 'silviculture') {
    const survival = Number(journey.planting?.survivalRate ?? 85);
    fh = survival >= 85 ? 4 : survival < 75 ? -3 : 1;
    causes.push(`Seedling survival ${survival}% → Forest Health ${fh >= 0 ? '+' : ''}${fh}`);
  } else if (journey.journeyType === 'recon' || journey.journeyType === 'field') {
    const swept = (journey.blocks || []).filter((block) => {
      const intel = journey.reconIntel?.byBlock?.[block.id];
      return intel?.valuesSwept;
    }).length;
    fh = clamp(Math.floor(swept / 2), 0, 3);
    if (fh) causes.push(`${swept} values sweeps on the ground → Forest Health +${fh}`);
  }
  if (fh) deltas.forestHealth = fh;

  return { deltas, causes, completion, victory };
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
  try {
    await runCampaignInner(game);
  } finally {
    // Never leak hidden expedition chrome or the campaign banner back to the
    // hub or a quick mode.
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

  await showYearEnd(ui, campaign);
  clearCampaign();
}

async function setupCampaign(ui) {
  ui.clear();
  ui.writeHeader('A YEAR IN THE DISTRICT');
  ui.write('One operating area. Four seasons. Four hats.');
  ui.write('Spring recon, summer planting, a fall planning file, a winter permitting push — the same five meters carry through the whole year.');
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

  const crewName = (await ui.promptText('Crew handle:', 'The Timber Wolves')) || 'The Timber Wolves';

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
    const stanceIndex = await promptSeasonalCard(ui, {
      cardLabel: `${season.label} · Season ${campaign.seasonIndex + 1} of 4`,
      title: `${season.label}: ${season.title}`,
      description: season.situation,
      context: `You take the ${FORESTER_ROLES.find((r) => r.id === season.roleId)?.name || season.roleId} seat this season. The deployment is condensed — a season's worth of work in a tight window — and what it does feeds the year's meters at the season review.`,
      decisionPrompt: 'How do you brief the crew?',
      optionDetails: BRIEFING_STANCES.map((s) => ({ preview: s.preview, riskLevel: s.riskLevel })),
    }, BRIEFING_STANCES.map((s) => s.label), gsSeason);

    stance = BRIEFING_STANCES[stanceIndex];
    campaign.stanceIndex = stanceIndex;
    if (Object.keys(stance.yearEffects).length) {
      applyEffects(gsSeason, stance.yearEffects, {
        type: 'assignment',
        id: `campaign-briefing-${season.id}`,
        title: `${season.label} briefing: ${stance.label}`,
        option: stance.label,
        round: gsSeason.round,
      });
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
      crew: generateCrew(5, role.journeyType || 'field'),
      scale: 'campaign',
    });
    journey.difficulty = campaign.difficulty;
    applyDifficultyMultipliers(journey, campaign.difficulty);
    stance.applyPerk(journey);
    journey.campaignStartBudget = Number(journey.resources?.budget ?? 0);
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

    ui.clear();
    ui.writeHeader(`DEPLOYMENT: ${season.title.toUpperCase()}`);
    ui.write(stance.perkLine, 'term-dim');
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
        + `Prog ${Math.round(m.progress)} · Forest ${Math.round(m.forestHealth)} · Rel ${Math.round(m.relationships)} `
        + `· Comp ${Math.round(m.compliance)} · Budget ${Math.round(m.budget)}`;
      ui.updateAllStatus(journey);

      const scheduledEvent = checkScheduledEvents(journey);
      if (scheduledEvent) {
        await game._handleEvent(scheduledEvent);
      }

      switch (journey.journeyType) {
        case 'silviculture': await runSilvicultureDay(game); break;
        case 'planning': await runPlanningDay(game); break;
        case 'permitting':
        case 'desk': await runPermittingDay(game); break;
        case 'recon':
        case 'field':
        default: await runReconDay(game); break;
      }

      endResult = evaluateEndConditions(journey) || null;
      if (!endResult) {
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
  if (stance && Object.keys(stance.yearEffects).length) {
    bridge.causes.push(`Briefing stance "${stance.label}" → ${formatMetricDelta(stance.yearEffects)}`);
  }
  applyEffects(gsSeason, bridge.deltas, {
    type: 'event',
    id: `campaign-season-${season.id}`,
    title: `${season.label} deployment: ${season.title}`,
    option: endResult.victory ? 'Delivered' : 'Fell short',
    round: gsSeason.round,
  });

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
  ui.write(endResult.victory
    ? `${season.title} delivered. ${endResult.reason || ''}`
    : `${season.title} fell short. ${endResult.reason || ''}`);
  ui.write('');
  ui.writeDivider('WHAT IT DID TO THE YEAR');
  for (const cause of bridge.causes) ui.write(`• ${cause}`);
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
    season: season.label,
    title: season.title,
    victory: endResult.victory === true,
    reason: endResult.reason || '',
    completion: Math.round(bridge.completion * 100),
    deltas: bridge.deltas,
    metricsAfter: { ...campaign.yearMetrics },
  });

  game.journey = null;
  return true;
}

async function showYearEnd(ui, campaign) {
  setExpeditionChromeHidden(true);
  const tier = deriveTier(campaign.yearMetrics);
  const metrics = campaign.yearMetrics;
  const wins = campaign.seasonLog.filter((s) => s.victory).length;

  const tierBody = {
    outstanding: 'An exceptional year — the district will be measured against it.',
    solid: 'A clearly good year. The program delivered and the file holds up.',
    mixed: 'Mixed outcomes. Some seasons carried the ones that stumbled.',
    stumbled: 'A hard year. The meters tell the story, and so will the review.',
  }[tier] || '';

  const summary = {
    heading: 'YEAR IN REVIEW',
    tier,
    body: `${wins}/${CAMPAIGN_SEASONS.length} deployments delivered. ${tierBody}`,
    scoreReasons: [],
    seasonSummaries: campaign.seasonLog.map((s) =>
      `• ${s.season} ${s.title}: ${s.victory ? 'delivered' : 'fell short'} at ${s.completion}% — ${formatMetricDelta(s.deltas) || 'no metric movement'}`),
    trendLines: Object.entries(metrics).map(([key, value]) => `${formatMetricName(key)}: ${Math.round(value)}`),
  };

  const gsLike = { metrics, round: 4, totalRounds: 4, roleDisplayName: campaign.crewName };
  await promptSummaryCard(ui, summary, ['Return to the district office'], gsLike);
}
