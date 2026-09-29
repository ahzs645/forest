/**
 * Silviculture Mode Runner
 *
 * The supervisor's spring: one program decision a day across five vintages.
 * This year's blocks get planted and inspected; last year's openings get
 * filled where the survival survey fell below minimum stocking; the 2–5 year
 * old stands get released from brush; the 8–15 year old openings get
 * free-growing surveys against the site plan's stocking standard and the
 * declarations go into RESULTS. Contractors do the work and get paid per tree
 * and per hectare; the crew checks it and signs for it.
 */

import { checkForEvent } from '../events.js';
import { getDayRng } from '../events/dayRng.js';
import { runDaySituation, situationWeight } from '../journey/daySituation.js';
import { pickDeferredCost } from '../events/deferral.js';
import { optionSpendsDay } from '../events/timePolicy.js';
import { presentDayCard, formatStatusLine } from '../journey/dayCard.js';
import { getCurrentSeasonInfo, advanceDay as advanceSeasonDay, getSeasonModifiers } from '../season.js';
import { crewHasRole, generateCrewMember, hasActiveFirstAidAttendant } from '../crew.js';
import { SILVICULTURE_CREW_ROLES, SILVICULTURE_REPLACEMENT_COST } from '../data/silvicultureCrewRoles.js';
import { getOperationalProgress, recordProgressMilestones } from '../journey.js';
import { getRoleAreaBriefing } from '../data/roleAreaIntel.js';
import { addDiscoveryTags, getDiscoveryTagNotes, getJourneyDiscoveryTags } from '../data/discoveryTags.js';
import { getAreaSituationSummary } from '../data/areaSituations.js';
import { buildStandStrip } from '../scene/forest.js';
import { startDay, spendDay, dayIsSpent, dayPrompt, settleDayPass } from '../journey/dayPlan.js';
import { checkSilvicultureEndConditions } from './shared/endConditions.js';
import { getStockingStandard, describeStockingStandard, formatBrushSpecies, formatReleaseTargets } from '../data/stockingStandards.js';
import {
  buildSilvicultureProgram,
  ensureContractorEconomics,
  contractorHasCert,
  getCurrentPlantingBlock,
  getBlockAwaitingInspection,
  describeBlock,
  summarizeProgram,
  isFreeGrowingSurveyable,
  estimateProgramCosts,
  BRUSH_RATES,
  BRUSH_DAILY_HA,
  FILL_PRICE_PREMIUM,
  SURVEY_DAY_RATE,
  SUPERVISOR_OVERHEAD_PER_DAY,
  FG_RESURVEY_YEARS,
  RELEASE_TAKES_DAYS,
} from '../data/silvicultureProgram.js';
import {
  recordProgramShortcut,
  recordTemptationOutcome,
  runSeasonCloseAudit,
  summarizeIntegrity,
} from './silvicultureIntegrity.js';

// Contractor events. Each one is a call from a foreman that needs an answer
// before the crews go out; answering is brief and never spends the day.

/**
 * Why a foreman stands a crew down, by season and ground: no Extreme fire
 * danger in a wet coast spring, no humidex outside summer, no grizzlies on
 * Vancouver Island. The wind and snag call can come anywhere.
 */
const STAND_DOWN_REASONS = [
  { text: 'the danger rating went to Extreme at noon yesterday and the block is a hazard abatement file waiting to happen', seasons: ['summer', 'fall'] },
  { text: 'lightning is forecast on the ridge all afternoon and the crew is carrying steel', seasons: ['spring', 'summer'], ground: 'interior' },
  { text: 'smoke from the fire to the west has the air quality index past the crew\'s WorkSafeBC limit', seasons: ['summer', 'fall'] },
  { text: 'the heat warning has the humidex past 40 by mid-morning and two of the crew went down with heat stress yesterday', seasons: ['summer'] },
  { text: 'a grizzly with cubs is working the cache on the landing and nobody wants to be the second person to find her', seasons: ['spring', 'summer', 'fall'], ground: 'mainland' },
  { text: 'a black bear sow with cubs is working the cache on the landing and nobody wants to be the second person to find her', seasons: ['spring', 'summer', 'fall'], ground: 'island' },
  { text: 'the freezing level dropped overnight and the block is under wet snow to the boot tops', seasons: ['spring', 'fall'], ground: 'interior' },
  { text: 'the cutslope above the spur let go in the night and the road engineer wants eyes on it before anyone drives under it', ground: 'coast' },
  { text: 'the wind warning has gusts to 80 on the ridge and the block edge is lined with snags' },
];

/**
 * A stand-down reason that fits today's season and this ground.
 * @param {Object} journey
 * @returns {string}
 */
export function pickStandDownReason(journey, rng = Math.random) {
  const season = (journey?.season ? getCurrentSeasonInfo(journey.season)?.id : null) || 'spring';
  const coast = String(journey?.program?.becCode || journey?.area?.becCode || '').toUpperCase().startsWith('CWH');
  const mainland = areaHasTag(journey, 'mainland');
  const fits = (reason) => {
    if (reason.seasons && !reason.seasons.includes(season)) return false;
    if (reason.ground === 'coast') return coast;
    if (reason.ground === 'interior') return !coast;
    if (reason.ground === 'mainland') return mainland;
    if (reason.ground === 'island') return !mainland;
    return true;
  };
  const pool = STAND_DOWN_REASONS.filter(fits);
  return pool[Math.floor(rng() * pool.length)].text;
}

/** "Cedar Draw Planters'" and "Wetbelt Brushing Co's". */
function possessive(name) {
  return /s$/i.test(String(name)) ? `${name}'` : `${name}'s`;
}

/** The people an outfit sends onto the block. */
const CREW_NOUNS = { planting: 'planters', brushing: 'cutters', survey: 'surveyors' };
function crewNoun(contractor) {
  return CREW_NOUNS[contractor?.specialty] || 'crew';
}

/** A block whose plots came in under a clean pass in the last two days. */
function getDisputedBlock(journey) {
  return (journey?.program?.blocks || [])
    .filter((block) => block.status === 'inspected' && block.quality < 90 && block.holdback > 0
      && Number.isFinite(block.inspectedDay) && journey.day - block.inspectedDay <= 2)
    .sort((a, b) => b.inspectedDay - a.inspectedDay)[0] || null;
}

/** Where a planting outfit's other contract is. */
function otherContract(journey) {
  return String(journey?.program?.becCode || '').toUpperCase().startsWith('CWH') ? 'up the coast' : 'on the coast';
}

/**
 * How long a call stays answered once the fix is paid for: an upgraded camp
 * stays upgraded, and an inspected kitchen buys ten days before the same bug
 * can be blamed on it again.
 */
const CALL_SETTLED_DAYS = { camp_demand: Infinity, crew_illness: 10 };
function callSettled(contractor, journey, callId) {
  const day = contractor?.silvicultureState?.settledCalls?.[callId];
  return Number.isFinite(day) && journey.day - day < (CALL_SETTLED_DAYS[callId] ?? 0);
}

/** Whether an outfit still has its own work on the program. */
function hasWorkLeft(contractor, journey) {
  const facts = getSilvicultureFacts(journey);
  if (contractor?.specialty === 'planting') return facts.blocksRemaining > 0 || facts.fillRemaining > 0;
  if (contractor?.specialty === 'brushing') return facts.releaseQueueRemaining > 0;
  return facts.surveysRemaining > 0;
}

/** Odds that keeping a crew on the block through a stand-down hurts someone. */
export const PUSHED_STAND_DOWN_INCIDENT = 0.25;

export const CONTRACTOR_EVENTS = [
  {
    id: 'camp_demand',
    trigger: (c, journey) => c.morale < 60 && !callSettled(c, journey, 'camp_demand'),
    title: 'Camp Conditions',
    getText: (c) => `${possessive(c.name)} foreman calls from the camp: the cook shack water test came back cloudy, the drying tent leaks, and the crew is talking about it. They want the camp brought up before the next shift.`,
    options: [
      { label: 'Upgrade the camp ($3,000)', description: 'Water, a real drying tent, a second hand-wash station', value: 'pay', cost: 3000, moraleGain: 15, prodGain: 5, settles: ['camp_demand', 'crew_illness'] },
      { label: 'Tell them the camp meets the standard', description: 'It does, on paper', value: 'deny', cost: 0, moraleGain: -15, prodGain: -5 },
    ],
  },
  {
    // Only when the plots really did come in short: a dispute over a block
    // that passed clean, or one planted a week ago, contradicts the file.
    id: 'quality_dispute',
    trigger: (c, journey) => c.specialty === 'planting' && Boolean(getDisputedBlock(journey)),
    title: 'Planting Quality Dispute',
    getText: (c, journey) => {
      const block = getDisputedBlock(journey);
      return `Your checker's plots on ${block.id} came in at ${block.quality}%: wide on spacing, with J-roots and shallow plugs. ${possessive(c.name)} foreman says the plots are wrong, the ground is wrong, and the $${block.holdback.toLocaleString()} holdback should be released today.`;
    },
    options: [
      { label: 'Re-plot with the foreman and retrain the crew', description: 'A morning of quality plots; the crew fixes what the plots find', value: 'inspect', cost: 0, moraleGain: -5, prodGain: 10, qualityLift: 3 },
      { label: 'Sign the foreman\'s numbers and release the holdback', description: 'Signing plot cards you did not walk is a false record; scrutiny climbs and the next inspection reads it', value: 'slide', cost: 0, moraleGain: 5, prodGain: 0, fraud: true },
    ],
  },
  {
    id: 'crew_illness',
    trigger: (c, journey, rng = Math.random) => !callSettled(c, journey, 'crew_illness') && rng() < 0.3,
    title: 'Sickness in Camp',
    getText: (c) => (c.specialty === 'survey'
      ? `One of ${possessive(c.name)} surveyors is down with a stomach bug and the other is eating standing up. The foreman thinks it is the water; the cook thinks it is the foreman.`
      : `Several ${crewNoun(c)} from ${c.name} are down with a stomach bug and the rest are eating standing up. The foreman thinks it is the water; the cook thinks it is the foreman.`),
    options: [
      { label: 'Call a camp inspection ($800)', description: 'Water test, kitchen, hand-wash stations; the crew works a short day', value: 'inspect_camp', cost: 800, moraleGain: 5, prodGain: 0, settles: ['crew_illness'] },
      { label: 'Stand the camp down for a day', description: (c) => `${{ planting: 'No planting', brushing: 'No saws on the block', survey: 'No plots walked' }[c.specialty] || 'No work'} today; the bug runs its course`, value: 'rest', cost: 0, moraleGain: 8, prodGain: 0 },
      { label: 'Push through', description: (c) => `${{ planting: 'Trees in the ground', brushing: 'Brush cut', survey: 'Plots walked' }[c.specialty] || 'Work done'} either way`, value: 'push', cost: 0, moraleGain: -10, prodGain: -10 },
    ],
  },
  {
    id: 'stand_down',
    trigger: (c, journey) => (c.specialty === 'planting' || c.specialty === 'brushing') && hasWorkLeft(c, journey),
    title: 'Stand-Down Call',
    getText: (c, journey, rng = Math.random) => `${possessive(c.name)} foreman calls a stand-down: ${pickStandDownReason(journey, rng)}. ${c.specialty === 'planting' ? 'Planters plant in rain' : 'Saw crews work in rain'}; this is not rain.`,
    options: [
      { label: 'Back the stand-down', description: 'Crew off the block today; the tailgate meeting covers it tomorrow', value: 'rest', cost: 0, moraleGain: 10, prodGain: 0 },
      { label: 'Keep them on the block', description: `Production today; ${Math.round(PUSHED_STAND_DOWN_INCIDENT * 100)}% someone gets hurt and WorkSafeBC opens a file (scrutiny +6, compliance -4)`, value: 'push', cost: 0, moraleGain: -8, prodGain: -5, scrutiny: 1, incidentRisk: PUSHED_STAND_DOWN_INCIDENT },
    ],
  },
  {
    id: 'reprice',
    trigger: (c) => c.productivity > 85 && c.specialty === 'planting',
    title: 'Contractor Wants to Split the Crew',
    getText: (c, journey) => `${c.name} has another contract ${otherContract(journey)} starting early. They want to release half the crew to it, or keep the whole crew on your program at +$0.04/tree for every tree left.`,
    options: [
      { label: 'Accept the re-price (+$0.04/tree)', description: 'Full crew stays; every tree left in the program costs four cents more', value: 'pay', cost: 0, moraleGain: 10, prodGain: 5, priceLift: 0.04 },
      { label: 'Hold them to the contract price', description: 'Half the crew leaves for the other contract; daily output drops', value: 'wait', cost: 0, moraleGain: -5, prodGain: -10, plantersLost: 0.4 },
    ],
  },
];

const CONTRACTOR_TASK_TRAITS = {
  plant: ['planting-specialist', 'wet-ground', 'remote-ready', 'terrain-aware'],
  fill: ['planting-specialist', 'brush-specialist', 'wet-ground', 'terrain-aware'],
  brush: ['brush-specialist', 'heat-hard', 'remote-ready', 'terrain-aware'],
  survey: ['survey-minded', 'process-cautious', 'community-facing', 'remote-ready'],
};

/** Fatigue a crew sheds for each day off. */
const DAY_OFF_RECOVERY = 3;

const TRAIT_LABELS = {
  'wet-ground': 'wet-ground crew',
  'remote-ready': 'camp crew',
  'brush-specialist': 'saw crews',
  'survey-minded': 'accredited surveyors',
  'planting-specialist': 'production planters',
  'heat-hard': 'used to the heat',
  'community-facing': 'used to interface work',
  'process-cautious': 'tidy paperwork',
  'terrain-aware': 'reads the ground',
};

/**
 * Run a silviculture day
 * @param {Object} game - Game instance
 */
export async function runSilvicultureDay(game) {
  const { ui, journey } = game;
  const silvicultureState = ensureSilvicultureState(journey);
  const program = ensureSilvicultureProgram(journey);
  const zoneProfile = getSilvicultureZoneProfile(journey, silvicultureState);
  for (const contractor of journey.contractors || []) ensureContractorEconomics(contractor, program.becCode);
  tickSilvicultureContractorRecovery(journey, zoneProfile);
  const seasonInfo = journey.season ? getCurrentSeasonInfo(journey.season) : null;
  const currentSeason = seasonInfo?.id || 'summer';
  const vegetationPressure = getVegetationPressure(journey);
  const progressBeforeDay = getOperationalProgress(journey);

  startDay(journey);
  // What happened earlier today (a contractor call answered, a situation set
  // aside) stays on the day card instead of being cleared by its redraw.
  silvicultureState.dayNotes = [];
  silvicultureState.heldToday = {};
  silvicultureState.contractorCallToday = false;

  // Daily contractor productivity and morale drift. Fatigue is earned on the
  // block (applySilvicultureContractorUsage) and shed on days off
  // (tickSilvicultureContractorRecovery); a crew that stood by yesterday
  // sheds a point instead of earning one.
  for (const contractor of journey.contractors) {
    const contractorState = ensureSilvicultureContractorState(contractor, journey, zoneProfile);
    const fit = getSilvicultureContractorFit(contractor, zoneProfile, 'plant');

    if (contractorState.status === 'recovering') {
      contractor.productivity = Math.min(100, contractor.productivity + (fit > 1 ? 2 : 1));
      contractor.morale = Math.min(100, contractor.morale + 2);
      continue;
    }

    if (contractor.isActive) {
      const productivityDecay = currentSeason === 'summer' ? 2 : 1;
      const moraleDecay = currentSeason === 'summer' ? 2 : 1;
      const accessDrag = zoneProfile.accessPressure > 0.12 ? 1 : 0;
      const fitDrag = fit < 0.9 ? 1 : 0;
      contractor.productivity = Math.max(20, contractor.productivity - productivityDecay - (vegetationPressure > 0.25 ? 1 : 0) - accessDrag - fitDrag);
      contractor.morale = Math.max(0, contractor.morale - moraleDecay - accessDrag - (fit < 0.85 ? 1 : 0));
      contractorState.deploymentDays = (contractorState.deploymentDays || 0) + 1;
      if (contractorState.lastWorkedDay !== journey.day - 1) {
        contractorState.fatigue = Math.max(0, (contractorState.fatigue || 0) - 1);
      }
      contractorState.status = 'deployed';
      contractorState.zoneFit = fit;
      if (contractorState.fatigue >= 4 || contractor.morale <= 28) {
        startSilvicultureContractorRecovery(contractor, contractorState.fatigue >= 5 ? 2 : 1, contractor.morale <= 28 ? 'morale' : 'fatigue');
      }
    } else {
      contractorState.status ||= contractorState.cooldownDays > 0 ? 'recovering' : 'ready';
    }
  }

  // What the program opened with, after the difficulty and any campaign
  // stance moved it: the grade reads the season against this.
  if (journey.day === 1) program.budgetStart = Math.round(Number(journey.resources.budget) || 0) || program.budgetStart;

  // Supervisor overhead: truck, camp, radio, your time.
  journey.resources.budget -= SUPERVISOR_OVERHEAD_PER_DAY;

  // Contractor call before the crews go out (never on day 1).
  const activeContractors = journey.contractors.filter(c => c.isActive);
  const contractorStress = activeContractors.some(c => c.morale < 55 || c.productivity < 60);
  // Crews are on the block most mornings now that fatigue clears on days
  // off, so the odds are set for a call every few days, not every other one.
  // Rolled on the day's own dice (js/events/dayRng.js), so a reload replays
  // the same call, or the same quiet morning, ahead of the day's situation.
  const callRng = getDayRng(journey, 'contractor-call');
  if (journey.day > 1 && callRng() < (contractorStress ? 0.35 : 0.25)) {
    if (activeContractors.length > 0) {
      const targetContractor = activeContractors[Math.floor(callRng() * activeContractors.length)];
      const applicableEvents = CONTRACTOR_EVENTS.filter(e => e.trigger(targetContractor, journey, callRng));
      if (applicableEvents.length > 0) {
        const cEvent = applicableEvents[Math.floor(callRng() * applicableEvents.length)];
        await handleContractorEvent(game, cEvent, targetContractor, callRng);
        if (game.gameOver) return;
        if (journey.isGameOver) return;
      }
    }
  }

  // The day's situation. Day 1 stays event-free so the program loop is
  // legible before disruptions begin.
  const drawn = journey.day > 1 ? checkForEvent(journey) : null;
  const event = drawn ? fitEventToCrew(journey, adaptEventForProgram(drawn)) : null;
  if (event) {
    const scrutinyBefore = Number(journey.scrutiny) || 0;
    const onCrew = (journey.crew || []).filter((member) => member.isActive);
    const setAsideTakesDay = setAsideCostsTheDay(journey, event);
    const outcome = await runDaySituation(game, event, {
      frame: {
        dayHeader: buildSilvicultureDayHeader(journey),
        statusLine: buildSilvicultureStatusLine(journey),
        onRender: () => updateSilvicultureMissionStatus(ui, journey, seasonInfo, zoneProfile),
      },
      setAsideDescription: setAsideTakesDay
        ? 'Not today. It lands anyway: the least of what answering costs, the day included.'
        : 'Not today. Keep the day for the program.',
    });
    if (outcome.gameOver) return;
    if (outcome.spendsDay) spendDay(journey);
    if (outcome.setAside) {
      if (setAsideTakesDay) spendDay(journey);
      const scrutinyRise = Math.round((Number(journey.scrutiny) || 0) - scrutinyBefore);
      silvicultureState.dayNotes.push(`You set aside "${event.title}"${scrutinyRise > 0 ? `; scrutiny +${scrutinyRise}` : ''}${setAsideTakesDay ? '; it took the day anyway' : ''}.`);
    }
    const contractorHurt = settleContractorCasualty(journey, event);
    if (contractorHurt) silvicultureState.dayNotes.push(contractorHurt);
    for (const member of onCrew) {
      const lost = member.isActive ? null : describeLostCrewRole(member);
      if (lost) silvicultureState.dayNotes.push(lost);
    }
    if (settleShortcut(journey, event)) return;
  }

  const seasonMods = journey.season
    ? getSeasonModifiers(currentSeason, 'silviculture')
    : {};

  // Zombie-tail tracking: a day that opens with nothing that can move any
  // of the five tracks counts toward calling an unwinnable run.
  const advancingActionValues = new Set(['plant', 'fill', 'brush', 'survey', 'inspect']);
  const dayOpeningOptions = buildSilvicultureActions(journey, currentSeason, seasonMods, silvicultureState, zoneProfile);
  const hasAdvancingAction = dayOpeningOptions.some((option) => !option.disabled && advancingActionValues.has(option.value));
  silvicultureState.zombieDays = hasAdvancingAction ? 0 : (silvicultureState.zombieDays || 0) + 1;

  const freeChoices = { count: 0 };
  while (!dayIsSpent(journey)) {
    const actionOptions = buildSilvicultureActions(journey, currentSeason, seasonMods, silvicultureState, zoneProfile);

    const actionId = await presentDayCard(ui, {
      dayHeader: buildSilvicultureDayHeader(journey),
      statusLine: buildSilvicultureStatusLine(journey),
      label: 'MORNING CHECK-INS',
      title: buildSilvicultureQuietTitle(journey, seasonInfo),
      body: buildSilvicultureQuietBody(journey, seasonInfo, silvicultureState, currentSeason),
      context: buildSilvicultureContextLines(journey, seasonInfo, silvicultureState, zoneProfile),
      prompt: dayPrompt(journey),
      options: actionOptions,
      onRender: () => { updateSilvicultureMissionStatus(ui, journey, seasonInfo, zoneProfile); },
    });

    ui.write('');

    if (actionId === 'end') {
      spendDay(journey);
      break;
    }

    await processAction(game, actionId, currentSeason, seasonMods, silvicultureState, zoneProfile);

    ui.updateAllStatus(journey);
    settleDayPass(journey, freeChoices, ui);
  }
  // The day's result screen shows the program after the day's work, not
  // the panel from before it.
  updateSilvicultureMissionStatus(ui, journey, seasonInfo, zoneProfile);

  // End of day
  journey.day++;
  if (journey.season) {
    const { state, transition } = advanceSeasonDay(journey.season);
    journey.season = state;

    if (transition.seasonChanged) {
      ui.write('');
      ui.writeHeader(`SEASON CHANGE: ${transition.newSeason.toUpperCase()}`);
      if (transition.yearChanged) {
        ui.write(`Year ${transition.newYear} begins!`);
      }
    }
  }

  // Program schedule banked by events (never planted blocks): a day ahead
  // buys the release crew an extra shift, a day behind costs crew-days.
  settleProgramSchedule(journey, ui);

  // Contractor walkoffs (below 10 morale)
  for (const contractor of journey.contractors) {
    if (contractor.isActive && contractor.morale <= 10 && Math.random() < 0.4) {
      contractor.isActive = false;
      ui.writeDanger(`${contractor.name} has pulled their crew off the program.`);
    }
  }

  const endResult = checkSilvicultureEndConditions(journey);
  if (endResult?.victory) {
    journey.isComplete = true;
    journey.endReason = endResult.reason;
  }
  if (endResult) closeOutSeason(journey, ui);

  if (!journey.isComplete && !journey.isGameOver &&
      (silvicultureState.zombieDays || 0) >= 4 &&
      isSilvicultureUnwinnable(journey)) {
    journey.isGameOver = true;
    journey.gameOverReason = 'The program can no longer reach its targets - the season is called.';
    closeOutSeason(journey, ui);
  }

  ui.updateAllStatus(journey);
  updateSilvicultureMissionStatus(ui, journey, nextSeasonInfoOf(journey), zoneProfile);

  // Milestones read oddly on the winning day ("last declaration in sight"
  // after the last declaration), so they are recorded but not printed then.
  // The line says what is actually done, not what the threshold hoped for.
  const reached = recordProgressMilestones(journey, progressBeforeDay, [], Math.max(1, journey.day - 1));
  if (!journey.isComplete) {
    for (const threshold of reached) {
      ui.writePositive(describeSilvicultureMilestone(journey, threshold));
    }
  }

  const nextSeasonInfo = nextSeasonInfoOf(journey);
  const contractorHint = journey.contractors.filter(c => c.isActive && c.morale < 40).length;
  const seasonOver = Boolean(endResult) || journey.isComplete || journey.isGameOver;
  const continueLabel = seasonOver
    ? 'Close out the season'
    : contractorHint > 0
      ? `Continue... (Day ${journey.day}, ${nextSeasonInfo?.name || ''}, ${contractorHint} unhappy contractor${contractorHint > 1 ? 's' : ''})`
      : `Continue... (Day ${journey.day}, ${nextSeasonInfo?.name || ''})`;
  await ui.promptChoice('', [{ label: continueLabel, value: 'next' }]);
}

function nextSeasonInfoOf(journey) {
  return journey.season ? getCurrentSeasonInfo(journey.season) : null;
}

const MILESTONE_LEADS = {
  25: 'A quarter of the program delivered',
  50: 'Half the program delivered',
  75: 'Three-quarters of the program delivered',
  90: 'The program is nearly delivered',
};

/**
 * A progress milestone in the program's own numbers, so it can never claim
 * release is moving at 0 ha or blocks inspected before the plots are walked.
 * @param {Object} journey
 * @param {number} threshold - 25, 50, 75 or 90
 * @returns {string}
 */
export function describeSilvicultureMilestone(journey, threshold) {
  const summary = summarizeProgram(journey.program);
  const blocksToPlant = journey.planting?.blocksToPlant || 0;
  const release = Math.round(journey.brushing?.hectaresComplete || 0);
  const releaseTarget = journey.brushing?.hectaresTarget || 0;
  const fg = Math.min(journey.surveys?.freeGrowingComplete || 0, journey.surveys?.freeGrowingTarget || 0);
  const parts = [
    `${summary.blocksInspected}/${blocksToPlant} blocks planted and inspected`,
    summary.fillTotal ? `fill ${summary.fillDone}/${summary.fillTotal}` : null,
    release > 0 ? `release ${release}/${releaseTarget} ha` : `release not started (${releaseTarget} ha)`,
    `${fg}/${journey.surveys?.freeGrowingTarget || 0} free-growing declarations`,
  ].filter(Boolean);
  // The threshold is the weighted program (planting counts most), so the
  // headline says so and the counts beside it say what is done.
  return `*** MILESTONE: ${MILESTONE_LEADS[threshold] || `${threshold}% of the program delivered`}, by weight: ${parts.join(', ')}. ***`;
}

// ── Day card ────────────────────────────────────────────────────────────────

function buildSilvicultureDayHeader(journey) {
  return Number.isFinite(journey.deadline)
    ? `DAY ${journey.day} of ${journey.deadline} - SILVICULTURE`
    : `DAY ${journey.day} - SILVICULTURE`;
}

/**
 * The status line shows every vintage, not just this year's blocks:
 * "3/8 blocks planted · fill 1/2 · brush 100/260 ha · FG 1/3 · 17 days left".
 */
function buildSilvicultureStatusLine(journey) {
  const daysLeft = Number.isFinite(journey.deadline)
    ? Math.max(0, journey.deadline - journey.day)
    : null;
  const summary = summarizeProgram(journey.program);
  return formatStatusLine([
    `${journey.planting?.blocksPlanted || 0}/${journey.planting?.blocksToPlant || 0} blocks planted`,
    summary.fillTotal ? `fill ${summary.fillDone}/${summary.fillTotal}` : null,
    `brush ${Math.round(journey.brushing?.hectaresComplete || 0)}/${journey.brushing?.hectaresTarget || 0} ha`,
    `FG ${Math.min(journey.surveys?.freeGrowingComplete || 0, journey.surveys?.freeGrowingTarget || 0)}/${journey.surveys?.freeGrowingTarget || 0}`,
    daysLeft === null ? null : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
    `budget ${formatMoneyK(journey.resources.budget || 0)}`,
  ]);
}

/** "$212k", "-$1k": the sign goes before the dollar. */
function formatMoneyK(amount) {
  const value = Math.round((Number(amount) || 0) / 1000);
  return `${value < 0 ? '-' : ''}$${Math.abs(value)}k`;
}

/** "$21,600", "-$858". */
function formatMoney(amount) {
  const value = Math.round(Number(amount) || 0);
  return `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString()}`;
}

/**
 * What the program budget assumes, in one line: what the committed work
 * costs, what is left for the release queue, and which release methods that
 * pays for. On hard, manual release of the whole queue does not fit on the
 * coast; the player needs to hear that on day 1, not on day 28.
 * @param {Object} journey
 * @param {Object} [options]
 * @param {boolean} [options.sheepAllowed]
 * @param {boolean} [options.sprayAllowed]
 * @returns {string|null}
 */
export function describeBudgetPlan(journey, { sheepAllowed = false, sprayAllowed = true } = {}) {
  const costs = estimateProgramCosts(journey);
  if (costs.releaseHa <= 0) {
    return `${formatMoney(costs.budget)} left; the rest of the program needs about ${formatMoney(roundTo(costs.committed, 1000))}.`;
  }
  const methods = [
    ['manual', 'manual release'],
    ['cylinder', 'cylinder release'],
    sheepAllowed ? ['sheep', 'sheep'] : null,
    sprayAllowed ? ['glyphosate', 'glyphosate'] : null,
  ].filter(Boolean);
  const short = methods.filter(([method]) => costs.release[method] > costs.freeForRelease).map(([, label]) => label);
  const priced = methods.map(([method, label]) => `${label} ${formatMoney(roundTo(costs.release[method], 1000))}`).join(', ');
  const verdict = short.length === 0
    ? 'Any of them fits.'
    : short.length < methods.length
      ? `${capitalize(formatList(short, 'or'))} for all of it would run the program out of money.`
      : 'No method pays for all of it: the program runs out of money before the queue is done.';
  return `${formatMoney(costs.budget)} left. Planting, fill, surveys and overhead need about ${formatMoney(roundTo(costs.committed, 1000))}, leaving about ${formatMoney(roundTo(costs.freeForRelease, 1000))} for ${Math.round(costs.releaseHa)} ha of release: ${priced}. ${verdict}`;
}

function roundTo(value, step) {
  return Math.round((Number(value) || 0) / step) * step;
}

function formatList(items, conjunction = 'and') {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function buildSilvicultureQuietTitle(journey, seasonInfo) {
  const activeContractors = (journey.contractors || []).filter((c) => c.isActive);
  const readyContractors = (journey.contractors || []).filter((c) => {
    const state = ensureSilvicultureContractorState(c, journey, getSilvicultureZoneProfile(journey));
    return !c.isActive && state.status === 'ready';
  });
  if (seasonInfo?.id === 'winter') return 'FROZEN GROUND';
  if (journey.day === 1) return 'THE PROGRAM BINDER';
  if (getBlockAwaitingInspection(journey.program)) {
    return getCurrentPlantingBlock(journey.program) ? 'PLOT CARDS BEFORE PLANTING' : 'PLOT CARDS ON THE LAST BLOCK';
  }
  if (activeContractors.length === 0 && readyContractors.length > 0) return 'CREWS AVAILABLE';
  if (activeContractors.length === 0) return 'NOBODY ON THE GROUND';
  if (activeContractors.some((c) => c.morale < 40)) return 'A SHORT-TEMPERED CHECK-IN';
  if (getVegetationPressure(journey) > 0.25) return 'BRUSH COMING UP FAST';
  if ((journey.resources.budget || 0) < 15000) return 'THIN IN THE ACCOUNT';
  return 'ALL CREWS ACCOUNTED FOR';
}

function buildSilvicultureQuietBody(journey, seasonInfo, silvicultureState, currentSeason) {
  const activeContractors = (journey.contractors || []).filter((c) => c.isActive);
  const unhappy = activeContractors.find((c) => c.morale < 40);
  const parts = [];
  const notes = silvicultureState?.dayNotes || [];
  if (notes.length) parts.push(`Earlier today: ${notes.join(' ')}`);

  if (journey.day === 1) {
    // The budget's assumptions, before the first dollar goes out.
    parts.push(`Budget: ${describeBudgetPlan(journey, getReleaseAccess(journey, silvicultureState))} Supervisor overhead runs $${SUPERVISOR_OVERHEAD_PER_DAY}/day on top of the contractors' invoices.`);
  } else if (seasonInfo?.id === 'winter') {
    parts.push('The ground is frozen through and nothing plants until spring. What moves today is the roster, the RESULTS submissions and next year\'s seedling order.');
  } else if (activeContractors.length === 0) {
    const readyCount = (journey.contractors || []).filter((c) => {
      const state = ensureSilvicultureContractorState(c, journey, getSilvicultureZoneProfile(journey));
      return !c.isActive && state.status === 'ready';
    }).length;
    parts.push(readyCount > 0
      ? `${readyCount} contractor${readyCount === 1 ? ' is' : 's are'} available. Picking a field task puts the best fit on the block.`
      : 'The contractors are on days off. Give them the day, or use your own crew for the plots and surveys it can carry.');
  } else if (unhappy) {
    parts.push(`${unhappy.name} keeps the morning call short and lets you hear it. Nothing that needs an answer yet.`);
  } else if (silvicultureState?.contractorCallToday) {
    parts.push('The rest of the morning check-ins are quiet. Whatever today is, it is yours to decide.');
  } else {
    parts.push('The foremen call in one by one and none of them has a problem for you. Whatever today is, it is yours to decide.');
  }

  if (seasonInfo?.id !== 'winter') {
    parts.push(`Next up: ${describeNextTask(journey, silvicultureState)}.`);
  }
  parts.push(...describeHeldWork(journey, currentSeason));
  if (Number.isFinite(journey.deadline)) {
    const daysLeft = Math.max(0, journey.deadline - journey.day);
    if (daysLeft <= 5) {
      parts.push(`The season closes in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`);
    }
  }
  return parts.join(' ');
}

/** "planted yesterday", "planted on day 12" - never a stale "yesterday". */
function describePlantedWhen(journey, block) {
  if (!Number.isFinite(block?.plantedDay)) return 'planted and waiting';
  const ago = journey.day - block.plantedDay;
  if (ago <= 0) return 'planted out today';
  if (ago === 1) return 'planted yesterday';
  return `planted out on day ${block.plantedDay}`;
}

/**
 * Work the program is holding, and why. These used to be menu options that
 * only printed their reason - which the card redraw then wiped - so they sit
 * on the card itself now.
 */
function describeHeldWork(journey, currentSeason) {
  const program = journey.program;
  const held = [];
  const plantingRemaining = journey.planting.blocksPlanted < journey.planting.blocksToPlant && getCurrentPlantingBlock(program);
  const awaiting = getBlockAwaitingInspection(program);
  if (plantingRemaining && currentSeason === 'winter') {
    held.push('Planting waits for spring: the ground is frozen.');
  } else if (plantingRemaining && awaiting) {
    held.push(`Planting holds until the plots on ${awaiting.id} are walked - the contractor gets paid on them.`);
  }
  if (currentSeason !== 'winter' && journey.surveys.freeGrowingComplete < journey.surveys.freeGrowingTarget && !getSurveyableOpening(journey)) {
    const waiting = (program.freeGrowing || []).filter((opening) => !(opening.surveyed && opening.result === 'pass'));
    const underBrush = waiting.find((opening) => opening.needsRelease && !opening.released);
    const takingEffect = waiting.find((opening) => opening.needsRelease && opening.released && opening.releaseReadyDay > journey.day);
    if (takingEffect) {
      held.push(`The release on ${takingEffect.id} has not taken yet; the surveyor can read it from day ${takingEffect.releaseReadyDay}.`);
    } else if (underBrush) {
      held.push(`Free-growing surveys wait on the release: ${underBrush.id} is still under brush and would fail on competition.`);
    } else if (waiting.length) {
      held.push('Every candidate left on the free-growing list is inside its resurvey interval.');
    }
  }
  return held;
}

/** What a supervisor would say the program needs next, in vintage terms. */
function describeNextTask(journey, silvicultureState) {
  const program = journey.program;
  const awaiting = getBlockAwaitingInspection(program);
  if (awaiting) return `quality plots on ${awaiting.id}, ${describePlantedWhen(journey, awaiting)}`;
  const current = getCurrentPlantingBlock(program);
  if (current && journey.planting.blocksPlanted < journey.planting.blocksToPlant) {
    return `${current.status === 'planting' ? 'finish' : 'start'} ${current.id} (${current.ha} ha of this year's program)`;
  }
  const fill = (program.fill || []).find((opening) => !opening.done);
  if (fill) return `fill plant ${fill.id} (${fill.year}, ${fill.ha} ha, ${fill.stockedSph} sph against MSS ${fill.mss})`;
  const brush = (program.brush || []).find((opening) => opening.treated < opening.ha);
  if (brush) return `release treatment on ${brush.id} (${brush.year}, ${brush.ha} ha)`;
  const fg = journey.surveys.freeGrowingComplete < journey.surveys.freeGrowingTarget ? getSurveyableOpening(journey) : null;
  if (fg) return `free-growing survey on ${fg.id} (${fg.year}, ${fg.ha} ha)`;
  return silvicultureState.lastAction ? 'closing out the file' : 'the program binder';
}

/**
 * Reference material, free and behind "More context".
 */
function buildSilvicultureContextLines(journey, seasonInfo, silvicultureState, zoneProfile) {
  const lines = [];
  const standStrip = buildStandStrip(journey);
  if (standStrip) lines.push(standStrip);

  const standard = getStockingStandard(journey.program?.becCode || journey.area?.becCode);
  lines.push(`Four vintages, one crew: this year's blocks (plant, inspect), last year's openings (fill), the ${journey.program.year - 5}–${journey.program.year - 2} stands (release), the ${describeFgYears(journey.program)} openings (free-growing survey). New seedlings do not become free-growing this season.`);
  lines.push(`Stocking standard ${describeStockingStandard(standard)}.`);
  lines.push(`Program: ${describeProgramLine(journey)} | ${zoneProfile.summary}`);
  lines.push(`Budget: ${describeBudgetPlan(journey, getReleaseAccess(journey, silvicultureState))}`);
  const roster = getSilvicultureContractorRoster(journey, zoneProfile);
  lines.push(`Roster: ${roster.summary}`);

  const scrutinyPressure = getScrutinyPressure(journey);
  if (scrutinyPressure > 0) {
    lines.push(`${getScrutinyLabel(journey)}: ${Math.round(scrutinyPressure)}%`);
  }
  const standing = describeSprayStanding(journey, silvicultureState);
  if (standing) lines.push(standing);
  const areaSituation = getAreaSituationSummary(journey);
  if (areaSituation) lines.push(`Area: ${areaSituation}`);
  const discoveryNotes = getDiscoveryTagNotes(journey, journey.roleId || 'silviculture', 2);
  if (discoveryNotes.length > 0) lines.push(`Carry-forward: ${discoveryNotes.join(' | ')}`);

  return lines.filter(Boolean);
}

function describeFgYears(program) {
  const years = (program?.freeGrowing || []).map((opening) => opening.year);
  if (!years.length) return 'older';
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? String(min) : `${min}–${max}`;
}

function describeProgramLine(journey) {
  const summary = summarizeProgram(journey.program);
  const brushPct = Math.round(safeRatio(journey.brushing.hectaresComplete, journey.brushing.hectaresTarget) * 100);
  return `planted ${journey.planting.blocksPlanted}/${journey.planting.blocksToPlant} (${summary.blocksInspected} inspected) · fill ${summary.fillDone}/${summary.fillTotal} · release ${brushPct}% · free-growing ${Math.min(journey.surveys.freeGrowingComplete, journey.surveys.freeGrowingTarget)}/${journey.surveys.freeGrowingTarget}`;
}

function updateSilvicultureMissionStatus(ui, journey, seasonInfo, zoneProfile) {
  const plantPct = Math.round(Math.min(1, journey.planting.seedlingsPlanted / journey.planting.seedlingsAllocated) * 100);
  const brushPct = Math.round(Math.min(1, journey.brushing.hectaresComplete / journey.brushing.hectaresTarget) * 100);
  const surveyPct = Math.round(Math.min(1, journey.surveys.freeGrowingComplete / journey.surveys.freeGrowingTarget) * 100);
  const plantDone = journey.planting.blocksPlanted >= journey.planting.blocksToPlant;
  const surveyDone = journey.surveys.freeGrowingComplete >= journey.surveys.freeGrowingTarget;
  const roster = getSilvicultureContractorRoster(journey, zoneProfile);
  const summary = summarizeProgram(journey.program);

  const facts = [];
  if (seasonInfo) {
    facts.push({ label: 'Season', value: `${seasonInfo.name} · Y${seasonInfo.year}` });
  }
  facts.push({ label: 'Release', value: `${brushPct}% of ${journey.brushing.hectaresTarget} ha` });
  if (summary.fillTotal) facts.push({ label: 'Fill', value: `${summary.fillDone}/${summary.fillTotal} openings` });
  facts.push({ label: 'Roster', value: roster.summary });

  const releaseOpen = (journey.program?.brush || []).some((opening) => opening.treated < opening.ha);
  const checklist = [
    {
      label: `this year's planting ${plantPct}% (${Math.min(journey.planting.blocksPlanted, journey.planting.blocksToPlant)}/${journey.planting.blocksToPlant} blocks, ${summary.blocksInspected} inspected)`,
      done: plantDone && summary.blocksInspected >= journey.planting.blocksToPlant
    },
    summary.fillTotal ? {
      label: `fill planting (${summary.fillDone}/${summary.fillTotal} of last year's openings)`,
      done: summary.fillDone >= summary.fillTotal
    } : null,
    {
      label: `release treatments ${brushPct}% (${Math.round(journey.brushing.hectaresComplete)}/${journey.brushing.hectaresTarget} ha)`,
      done: !releaseOpen && journey.brushing.hectaresComplete >= journey.brushing.hectaresTarget
    },
    {
      label: `free-growing declarations ${surveyPct}% (${Math.min(journey.surveys.freeGrowingComplete, journey.surveys.freeGrowingTarget)}/${journey.surveys.freeGrowingTarget})`,
      done: surveyDone
    }
  ].filter(Boolean);

  const alerts = [];
  const vegetationPressure = getVegetationPressure(journey);
  if (vegetationPressure > 0.25) {
    alerts.push({ level: 'warn', text: `Release is behind the calendar - the older stands are losing the height race to ${describeBrush(journey)}.` });
  }
  if (getBlockAwaitingInspection(journey.program)) {
    alerts.push({ level: 'info', text: 'A planted block is waiting on its quality plots; the contractor gets paid on them.' });
  }
  if (seasonInfo?.id === 'winter') {
    alerts.push({ level: 'warn', text: 'Winter lockout: ground is frozen - planting waits for spring.' });
  }

  ui.setMissionStatus?.({
    objective: 'Plant and inspect this year\'s blocks, fill last year\'s openings, release the older stands, and get this year\'s free-growing declarations into RESULTS.',
    meter: { label: 'Planting', value: plantPct, text: `${plantPct}%` },
    facts,
    checklist,
    alerts
  });
}

/**
 * The full program binder, on demand.
 */
function displaySilvicultureBriefing(ui, journey, silvicultureState, zoneProfile) {
  const program = journey.program;
  const standard = getStockingStandard(program.becCode);
  ui.write('');
  ui.writeHeader('PROGRAM BINDER REVIEW');

  ui.write(`Stocking standard ${describeStockingStandard(standard)}.`);
  ui.write(`Program: ${describeProgramLine(journey)} | ${zoneProfile.summary}`);
  ui.write(`Budget: ${describeBudgetPlan(journey, getReleaseAccess(journey, silvicultureState))}`);
  ui.write('');
  ui.write(`This year's blocks (${program.year}):`);
  for (const block of program.blocks) {
    const status = block.status === 'inspected'
      ? `inspected ${block.quality}% quality`
      : block.status === 'planted'
        ? 'planted, plots pending'
        : block.status === 'planting'
          ? `${block.planted.toLocaleString()} of ${block.trees.toLocaleString()} planted`
          : 'pending';
    ui.write(`  ${describeBlock(block)}: ${status}`);
  }
  if (program.fill.length) {
    ui.write(`Fill plant (${program.year - 1} openings below MSS):`);
    for (const opening of program.fill) {
      ui.write(`  ${opening.id} (${opening.ha} ha, ${opening.stockedSph} sph vs MSS ${opening.mss}, ${opening.trees.toLocaleString()} trees): ${opening.done ? 'filled' : 'open'}`);
    }
  }
  ui.write('Release program:');
  for (const opening of program.brush) {
    const tag = opening.fgId ? ' [free-growing candidate, must be released first]' : '';
    const size = opening.openingHa > opening.ha ? `${opening.ha} of ${opening.openingHa} ha` : `${opening.ha} ha`;
    ui.write(`  ${opening.id} (${opening.year}, ${size})${tag}: ${Math.round(opening.treated)}/${opening.ha} ha${opening.method ? ` by ${describeBrushMethod(opening.method)}` : ''}`);
  }
  ui.write('Free-growing survey candidates:');
  for (const opening of program.freeGrowing) {
    const status = opening.surveyed && opening.result === 'pass'
      ? 'declared free-growing'
      : opening.surveyed
        ? `FAILED; ${opening.released ? 'released' : 'treatment prescribed'}, resurvey ${opening.resurveyYear || program.year + FG_RESURVEY_YEARS}`
        : opening.needsRelease && !opening.released
          ? 'under brush - release before survey'
          : opening.needsRelease && opening.releaseReadyDay > journey.day
            ? `released, readable from day ${opening.releaseReadyDay}`
            : 'ready for survey';
    ui.write(`  ${opening.id} (${opening.year}, ${opening.ha} ha): ${status}`);
  }

  if (zoneProfile.likelyFinds.length > 0) {
    ui.write(`Likely pressure: ${zoneProfile.likelyFinds[0]}`);
  }
  const scrutinyPressure = getScrutinyPressure(journey);
  if (scrutinyPressure > 0) {
    ui.write(`${getScrutinyLabel(journey)}: ${Math.round(scrutinyPressure)}%`);
  }
  const standing = describeSprayStanding(journey, silvicultureState);
  if (standing) ui.write(standing);
  const areaSituation = getAreaSituationSummary(journey);
  if (areaSituation) {
    ui.write(`Area Situation: ${areaSituation}`);
  }
  const discoveryNotes = getDiscoveryTagNotes(journey, journey.roleId || 'silviculture', 2);
  if (discoveryNotes.length > 0) {
    ui.write(`Carry-forward: ${discoveryNotes.join(' | ')}`);
  }

  const roster = getSilvicultureContractorRoster(journey, zoneProfile);
  ui.write(`Contractors: ${roster.lines.join(' | ')}`);
  for (const note of program.notes.slice(-3)) {
    ui.write(`Note: ${note}`);
  }

  const vegetationPressure = getVegetationPressure(journey);
  if (vegetationPressure > 0.1 && vegetationPressure <= 0.25) {
    ui.write('Release pressure: MODERATE - keep the brushing crew moving through the older stands.');
  }
}

// ── Actions ─────────────────────────────────────────────────────────────────

/**
 * Build the day's available actions. Each is a full day of program work;
 * the gates are seasonal and per-vintage.
 */
function buildSilvicultureActions(journey, currentSeason, seasonMods, silvicultureState, zoneProfile) {
  const actionOptions = [];
  const program = journey.program;
  const roster = getSilvicultureContractorRoster(journey, zoneProfile);
  const awaitingInspection = getBlockAwaitingInspection(program);
  const currentBlock = getCurrentPlantingBlock(program);
  const plantingRemaining = journey.planting.blocksPlanted < journey.planting.blocksToPlant && currentBlock;
  const plantingEff = seasonMods?.plantingEfficiency ?? 1.0;

  // Plant (this year's blocks)
  if (plantingRemaining && !awaitingInspection &&
      plantingEff > 0 &&
      journey.resources.seedlings > 0 &&
      journey.resources.contractorCapacity > 0) {
    const seasonNote = plantingEff >= 1.2 ? ' (planting window)' : plantingEff < 1.0 ? ' (off-season)' : '';
    actionOptions.push({
      label: `Plant (this year's blocks)${seasonNote}`,
      description: `Send the planting contractor onto ${currentBlock.status === 'planting' ? 'the rest of' : 'the next block of this year\'s program,'} ${currentBlock.id} (${currentBlock.ha} ha, ${currentBlock.speciesMix}) - ${getSilvicultureTaskSummary(journey, zoneProfile, 'plant')}`,
      value: 'plant'
    });
  }
  // Held planting (frozen ground, plots pending) is explained on the card
  // body (describeHeldWork), not offered as an option that does nothing.

  // Planting quality inspection (this year's blocks): your own crew walks it.
  if (awaitingInspection) {
    actionOptions.push({
      label: 'Planting quality inspection (this year\'s blocks)',
      description: `Walk quality plots on ${awaitingInspection.id}, ${describePlantedWhen(journey, awaitingInspection)}: spacing, depth, J-roots, % excess. Payment holdback rides on it - ${describeInspectionTeam(journey)}`,
      value: 'inspect'
    });
  }

  // Fill plant (last year's blocks)
  const fillOpening = (program.fill || []).find((opening) => !opening.done);
  if (fillOpening &&
      plantingEff > 0 &&
      journey.resources.seedlings > 0 &&
      journey.resources.contractorCapacity > 0) {
    actionOptions.push(awaitingInspection
      // The planters wait on the plots before they go anywhere else; the
      // task stays on the card with the reason instead of vanishing.
      ? {
        label: 'Fill plant (last year\'s blocks)',
        description: `Waits for the quality plots on ${awaitingInspection.id}: the planters go nowhere else until they are walked.`,
        value: 'fill',
        disabled: true,
      }
      : {
        label: 'Fill plant (last year\'s blocks)',
        description: `Top up ${fillOpening.id} (${fillOpening.year}, ${fillOpening.ha} ha) where the year-1 survival survey fell to ${fillOpening.stockedSph} sph against MSS ${fillOpening.mss} - ${fillOpening.trees.toLocaleString()} trees; ${getSilvicultureTaskSummary(journey, zoneProfile, 'fill')}`,
        value: 'fill'
      });
  }

  // Brush (2–5 year old stands)
  const brushingEff = seasonMods?.brushingEfficiency ?? 1.0;
  const brushOpening = (program.brush || []).find((opening) => opening.treated < opening.ha);
  // Gated on the release queue, not the hectare target: a free-growing
  // candidate that failed on competition joins the queue after the target
  // may already be met, and it still has to be released.
  if (brushOpening &&
      journey.resources.contractorCapacity > 0 &&
      currentSeason !== 'winter') {
    const seasonNote = brushingEff >= 1.2 ? ' (release window)' : '';
    actionOptions.push({
      label: `Brush (release the older stands)${seasonNote}`,
      description: `Release the older plantations from ${describeBrush(journey)} before they lose the height race; next up ${brushOpening.id} (${brushOpening.year}, ${Math.round(brushOpening.ha - brushOpening.treated)} ha left)${brushOpening.fgId ? ', a free-growing candidate' : ''} - ${getSilvicultureTaskSummary(journey, zoneProfile, 'brush')}`,
      value: 'brush'
    });
  }

  // Free-growing survey (8–15 year old stands)
  const surveyEff = seasonMods?.surveyEfficiency ?? 1.0;
  if (currentSeason !== 'winter' &&
      journey.surveys.freeGrowingComplete < journey.surveys.freeGrowingTarget) {
    const seasonNote = surveyEff >= 1.2 ? ' (survey window)' : '';
    const surveyable = getSurveyableOpening(journey);
    if (surveyable) {
      actionOptions.push({
        label: `Free-growing survey (${describeFgYears(program)} openings)${seasonNote}`,
        description: `Assess ${surveyable.id} (${surveyable.year}, ${surveyable.ha} ha) against the site plan's stocking standard: well-spaced, healthy, acceptable species, free of competition${getVegetationPressure(journey) > 0.25 ? '. The release program is behind the calendar and the plots will read the brush' : ''} - ${getSilvicultureTaskSummary(journey, zoneProfile, 'survey')}`,
        value: 'survey'
      });
    }
    // Blocked surveys are explained on the card body (describeHeldWork).
  }

  if (roster.rotatableCount > 0) {
    actionOptions.push({
      label: 'Contractor Rotation',
      description: `Put an available crew on the block or stand a tired one down (${roster.rotationSummary})`,
      value: 'rotation'
    });
  }

  if (getMeetableContractors(journey, zoneProfile).length > 0) {
    actionOptions.push({
      label: 'Contractor Meeting',
      description: 'Sit down with a foreman over the plot cards and the pay sheet',
      value: 'meeting'
    });
  }

  if (journey.crew && journey.crew.length > 0) {
    actionOptions.push({
      label: 'Team Briefing',
      description: 'Tailgate meeting with your own crew: the week\'s plots, the radio plan, the ETV',
      value: 'team_briefing'
    });
  }

  // Someone gone for the season: say what the crew can no longer do, and
  // offer the way back.
  for (const role of getVacantCrewRoles(journey)) {
    const unaffordable = describeUnaffordableReplacement(journey, role);
    actionOptions.push({
      label: `Bring up a replacement ${role.noun}`,
      description: unaffordable || `${role.lost} A day on the road to town and ${formatMoney(SILVICULTURE_REPLACEMENT_COST[role.id])}.`,
      value: `replace:${role.id}`,
      ...(unaffordable ? { disabled: true } : {}),
    });
  }

  // A task held back today keeps its row and its reason even when the card
  // would no longer list it (the stock ran out between the card and the call).
  const heldToday = silvicultureState?.heldToday || {};
  for (const [value, reason] of Object.entries(heldToday)) {
    const label = HELD_TASK_LABELS[value]?.(program);
    if (label && !actionOptions.some((option) => option.value === value)) {
      actionOptions.push({ label, description: reason, value, disabled: true });
    }
  }

  actionOptions.push({
    label: 'Review the Program Binder',
    description: 'Block records, stocking standard, release queue, contractor economics',
    value: 'briefing'
  });

  actionOptions.push({
    label: roster.rotatableCount === 0 ? 'Rest crews and plan tomorrow' : 'Let the crews work',
    description: roster.rotatableCount === 0
      ? 'Use this day for recovery; contractors on days off become available again'
      : 'No new commitments today - let the crews work and the seedlings settle',
    value: 'end'
  });

  // A field task whose crew is on days off stays on the card, disabled, with
  // the day the crew is back. It used to vanish with no reason given.
  const fieldTasks = { plant: 'plant', fill: 'fill', brush: 'brush', survey: 'survey' };
  const hasAccreditedSurveyor = crewHasRole(journey.crew || [], 'surveyor');
  return actionOptions.map((option) => {
    if (heldToday[option.value] && !option.disabled) return { ...option, disabled: true, description: heldToday[option.value] };
    const task = fieldTasks[option.value];
    if (!task || option.disabled) return option;
    if (task === 'survey' && hasAccreditedSurveyor) return option;
    if (getSilvicultureTaskContractors(journey, zoneProfile, task, false).length > 0) return option;
    return { ...option, disabled: true, description: describeCrewWait(journey, zoneProfile, task) };
  });
}

/** The card rows a held task keeps (holdChosenTask), by action value. */
const HELD_TASK_LABELS = {
  plant: () => 'Plant (this year\'s blocks)',
  inspect: () => 'Planting quality inspection (this year\'s blocks)',
  fill: () => 'Fill plant (last year\'s blocks)',
  brush: () => 'Brush (release the older stands)',
  survey: (program) => `Free-growing survey (${describeFgYears(program)} openings)`,
  rotation: () => 'Contractor Rotation',
  meeting: () => 'Contractor Meeting',
};

const TASK_CREWS = {
  plant: 'planting crew',
  fill: 'planting crew',
  brush: 'saw crew',
  survey: 'accredited surveyor',
};

/**
 * Why a field task cannot go out today: "Waits for Wetbelt Brushing Co, on
 * days off until day 25."
 * @param {Object} journey
 * @param {Object} zoneProfile
 * @param {string} task - plant | fill | brush | survey
 * @returns {string}
 */
export function describeCrewWait(journey, zoneProfile, task) {
  const outfits = (journey.contractors || []).filter((contractor) => matchesSilvicultureTask(contractor, task));
  const resting = outfits.filter((contractor) => {
    const state = ensureSilvicultureContractorState(contractor, journey, zoneProfile);
    return state.status === 'recovering' || state.cooldownDays > 0;
  });
  const ownSurveyorGone = task === 'survey' && (journey.crew || []).some((member) => member.role === 'surveyor' && !member.isActive);
  const tail = ownSurveyorGone ? ' Your own accredited surveyor is off the crew.' : '';
  if (!outfits.length) return `No ${TASK_CREWS[task] || 'crew'} on the program.${tail}`;
  if (!resting.length) return `Waits: no ${TASK_CREWS[task] || 'crew'} is available today.${tail}`;
  const back = Math.max(...resting.map((contractor) => journey.day + Math.max(1, contractor.silvicultureState?.cooldownDays || 1)));
  return `Waits for ${formatList(resting.map((contractor) => contractor.name))}, on days off until day ${back}.${tail}`;
}

function getSurveyableOpening(journey) {
  const context = { year: journey?.program?.year, day: journey?.day };
  return (journey?.program?.freeGrowing || []).find((opening) => isFreeGrowingSurveyable(opening, context)) || null;
}

/**
 * A task that turns out not to go once it is chosen (the roster or the stock
 * moved after the card was drawn) says why, and the redrawn card keeps the
 * reason on that task's row, disabled, for the rest of the day. The line it
 * printed used to be wiped by the redraw, which offered the same task again
 * as if nothing had happened.
 * @returns {false} the day is not spent
 */
function holdChosenTask(ui, journey, actionId, reason, write = 'writeWarning') {
  ui[write]?.(reason);
  const state = journey.silvicultureState;
  if (state) state.heldToday = { ...(state.heldToday || {}), [actionId]: reason };
  return false;
}

/** The brush this zone's stands are losing the height race to. */
function describeBrush(journey) {
  return formatBrushSpecies(getStockingStandard(journey?.program?.becCode || journey?.area?.becCode));
}

function describeInspectionTeam(journey) {
  const crew = journey.crew || [];
  if (crewHasRole(crew, 'checker')) return 'your checker walks the plots';
  if (crewHasRole(crew, 'surveyor')) return 'your surveyor walks the plots';
  return 'you walk the plots yourself';
}

async function processAction(game, actionId, currentSeason, seasonMods, silvicultureState, zoneProfile) {
  const { ui, journey } = game;

  if (String(actionId).startsWith('replace:')) {
    if (handleCrewReplacement(game, String(actionId).slice('replace:'.length))) spendDay(journey);
    return;
  }

  switch (actionId) {
    case 'plant':
      if (await handlePlanting(game, seasonMods, silvicultureState, zoneProfile)) spendDay(journey);
      break;

    case 'brush':
      if (await handleBrushTreatment(game, seasonMods, silvicultureState, zoneProfile)) spendDay(journey);
      break;

    case 'survey':
      if (await handleFreeGrowingSurvey(game, seasonMods, silvicultureState, zoneProfile)) spendDay(journey);
      break;

    case 'inspect':
      if (await handleQualityInspection(game, seasonMods, silvicultureState, zoneProfile)) spendDay(journey);
      break;

    case 'fill':
      if (await handleFillPlanting(game, seasonMods, silvicultureState, zoneProfile)) spendDay(journey);
      break;

    case 'meeting':
      if (await handleContractorMeeting(game, zoneProfile)) spendDay(journey);
      break;

    case 'briefing':
      displaySilvicultureBriefing(ui, journey, silvicultureState, zoneProfile);
      await ui.promptChoice('', [{ label: 'Close the binder', value: 'next' }]);
      break;

    case 'team_briefing':
      handleTeamBriefing(game);
      spendDay(journey);
      break;

    case 'rotation':
      if (await handleContractorRotation(game, silvicultureState, zoneProfile)) spendDay(journey);
      break;

    default:
      break;
  }
}

// ── Plant ───────────────────────────────────────────────────────────────────

/**
 * A day of planting on this year's program. The contractor's planters set the
 * output; the invoice is trees × price less the holdback, which rides on the
 * quality plots the next morning.
 */
async function handlePlanting(game, seasonMods, silvicultureState, zoneProfile) {
  const { ui, journey } = game;
  const program = journey.program;
  const plantingEff = seasonMods?.plantingEfficiency ?? 1.0;
  const pressure = zoneProfile || getSilvicultureZoneProfile(journey, silvicultureState);
  const block = getCurrentPlantingBlock(program);

  if (!block || journey.planting.blocksPlanted >= journey.planting.blocksToPlant) {
    return holdChosenTask(ui, journey, 'plant', 'This year\'s blocks are all in the ground. Shift the day to the older vintages.', 'write');
  }
  if (getBlockAwaitingInspection(program)) {
    return holdChosenTask(ui, journey, 'plant', 'Close the quality plots on yesterday\'s block before the planters move on.');
  }

  const crew = getSilvicultureTaskContractors(journey, pressure, 'plant', true, ui);
  if (crew.length === 0) {
    return holdChosenTask(ui, journey, 'plant', 'No planting contractor is available. Put an available crew on the block first.');
  }

  const output = estimatePlantingOutput(crew, pressure, plantingEff);
  const remainingAllocation = Math.max(0, journey.planting.seedlingsAllocated - journey.planting.seedlingsPlanted);
  let toPlant = Math.min(output, journey.resources.seedlings, remainingAllocation);
  if (toPlant <= 0) {
    return holdChosenTask(ui, journey, 'plant', 'No seedlings remain for this year\'s blocks. Check the reefer and the nursery order.');
  }

  const contractor = crew[0];
  const price = Number(contractor.pricePerTree) || 0.32;
  const holdbackPct = Number(contractor.holdbackPct) || 0;
  const completed = [];
  const touched = [];
  let planted = 0;
  let holdback = 0;

  // The day's trees go onto the current block; a crew that finishes a block
  // moves onto the next in the afternoon, and goes no further than that
  // until the plots on the finished block are walked. Stopping at the block
  // line used to spend whole days planting the last few dozen trees.
  while (toPlant > 0) {
    const target = getCurrentPlantingBlock(program);
    if (!target) break;
    const room = target.trees - target.planted;
    const put = Math.min(room, toPlant);
    target.planted += put;
    target.status = 'planting';
    // The holdback rides on the block the trees went into.
    const blockHoldback = Math.round(put * price * (holdbackPct / 100));
    target.holdback += blockHoldback;
    holdback += blockHoldback;
    planted += put;
    toPlant -= put;
    touched.push(target);
    if (target.planted >= target.trees) {
      target.status = 'planted';
      target.plantedDay = journey.day;
      completed.push(target);
    }
    if (completed.length > 0 && target !== completed[0]) break;
  }

  journey.planting.seedlingsPlanted = Math.min(journey.planting.seedlingsAllocated, journey.planting.seedlingsPlanted + planted);
  journey.resources.seedlings -= planted;
  journey.resources.contractorCapacity -= 4;
  const invoice = Math.round(planted * price) - holdback;
  journey.resources.budget -= invoice;

  for (const block of touched) {
    ui.write(`${describeBlock(block)}: ${block.planted.toLocaleString()} of ${block.trees.toLocaleString()} planted (${Math.round((block.planted / block.trees) * 100)}%).`);
  }
  ui.write(`${contractor.name}: ${planted.toLocaleString()} trees at $${price.toFixed(2)}/tree - invoice $${invoice.toLocaleString()}${holdbackPct ? `, $${holdback.toLocaleString()} held back pending plots` : ''}.`);
  if (journey.day <= 7 && plantingEff >= 1.2) {
    ui.writePositive('Early-season ground: cool soil, moisture in the rooting zone, the planters hit their numbers.');
  } else if (plantingEff < 1.0 && plantingEff > 0) {
    ui.writeWarning('Off-season planting: hot, dry ground slows the crew and stresses the stock.');
  }
  if (pressure.survivalPenalty > 0.04 || pressure.accessPressure > 0.08) {
    ui.writeWarning(pressure.summary);
  }

  for (const done of completed) {
    journey.planting.blocksPlanted = Math.min(journey.planting.blocksToPlant, journey.planting.blocksPlanted + 1);
    const next = getCurrentPlantingBlock(program);
    ui.writePositive(`${done.id} planted out (${done.trees.toLocaleString()} trees on ${done.ha} ha). Quality plots tomorrow before the crew goes further${next && next.planted > 0 ? ` than ${next.id}` : ''}.`);
  }

  applySilvicultureContractorUsage(journey, crew, pressure, 'plant');
  silvicultureState.lastAction = 'plant';
  return true;
}

function estimatePlantingOutput(crew, pressure, plantingEff) {
  let total = 0;
  for (const contractor of crew) {
    const fit = getSilvicultureContractorFit(contractor, pressure, 'plant');
    const planters = Number(contractor.planters) || Number(contractor.crewSize) || 10;
    total += planters * 950 * (contractor.productivity / 100) * fit;
  }
  const zoneDrag = Math.min(0.15, pressure.survivalPenalty + pressure.accessPressure * 0.4);
  return Math.round(total * plantingEff * (1 - zoneDrag));
}

// ── Inspect ─────────────────────────────────────────────────────────────────

/**
 * Quality plots on the block planted yesterday. Your crew walks them (the
 * planting contractor never inspects its own work). Output is a quality
 * percentage and what happens to the holdback.
 */
async function handleQualityInspection(game, seasonMods, silvicultureState, zoneProfile) {
  const { ui, journey } = game;
  const program = journey.program;
  const pressure = zoneProfile || getSilvicultureZoneProfile(journey, silvicultureState);
  const block = getBlockAwaitingInspection(program);
  if (!block) {
    return holdChosenTask(ui, journey, 'inspect', 'No block is waiting on quality plots.', 'write');
  }

  const contractor = (journey.contractors || []).find((c) => c.specialty === 'planting') || journey.contractors[0];
  const contractorState = contractor ? ensureSilvicultureContractorState(contractor, journey, pressure) : null;
  const hasChecker = crewHasRole(journey.crew || [], 'checker') || crewHasRole(journey.crew || [], 'surveyor');
  const noise = hasChecker ? Math.round(-4 + Math.random() * 7) : Math.round(-6 + Math.random() * 9);
  const wetDrag = Math.round(pressure.survivalPenalty * 40);
  const fatigueDrag = contractorState && contractorState.fatigue >= 4 ? 3 : 0;
  const lift = Number(silvicultureState.qualityLift) || 0;
  const penalty = Number(silvicultureState.qualityPenaltyNext) || 0;
  const quality = Math.max(70, Math.min(99, Math.round((Number(contractor?.qualityPct) || 92) + noise - wetDrag - fatigueDrag + lift - penalty)));
  silvicultureState.qualityPenaltyNext = 0;
  silvicultureState.qualityLift = 0;

  const spacingSph = Math.round(block.sph * (0.9 + (quality - 85) / 150));
  const jRoots = Math.max(0, Math.round((96 - quality) / 2.5));
  const excess = Math.max(0, Math.round((94 - quality) / 3));

  block.status = 'inspected';
  block.quality = quality;
  block.inspectedDay = journey.day;
  const qualities = program.blocks.filter((b) => b.quality !== null).map((b) => b.quality);
  journey.planting.qualityAverage = Math.round(qualities.reduce((sum, q) => sum + q, 0) / qualities.length);
  // The campaign's forest-health bridge reads survivalRate; planting quality
  // is the best proxy this season has for how the block will survive.
  journey.planting.survivalRate = journey.planting.qualityAverage;

  ui.writeHeader('PLANTING QUALITY INSPECTION');
  if (silvicultureState.falseCardsPending) {
    silvicultureState.falseCardsPending = false;
    ui.writeWarning('Your checker\'s plots do not match the cards you signed for the foreman. Anyone who pulls both will see it.');
  }
  ui.write(`${describeBlock(block)}: ${quality}% quality on ${hasChecker ? 'your checker\'s' : 'your'} plots - spacing ${spacingSph.toLocaleString()} sph against ${block.sph.toLocaleString()} target, ${jRoots}% J-roots, ${excess}% excess.`);

  const holdback = block.holdback || 0;
  if (quality >= 90) {
    journey.resources.budget -= holdback;
    block.holdback = 0;
    ui.writePositive(`Plots pass. Holdback of $${holdback.toLocaleString()} released to ${contractor?.name || 'the contractor'}.`);
    if (contractor) contractor.morale = Math.min(100, contractor.morale + 3);
    // A clean block is the tighter spacing the marginal ones were held for.
    const retained = program.blocks.filter((other) => other !== block && other.status === 'inspected' && other.quality >= 85 && other.holdback > 0);
    const owed = retained.reduce((sum, other) => sum + other.holdback, 0);
    if (owed > 0) {
      journey.resources.budget -= owed;
      for (const other of retained) other.holdback = 0;
      ui.write(`The crew tightened up: $${owed.toLocaleString()} held back on ${retained.map((other) => other.id).join(', ')} goes out with it.`);
    }
  } else if (quality >= 85) {
    ui.writeWarning(`Plots pass at the margin. Holdback of $${holdback.toLocaleString()} stays held until the crew passes clean plots on a later block.`);
    if (contractor) contractor.morale = Math.max(0, contractor.morale - 6);
    program.notes.push(`${block.id}: ${quality}% quality, holdback retained.`);
  } else {
    ui.writeWarning(`Plots fail. Replant order on the low plots - ${contractor?.name || 'the contractor'} fixes them at their own cost before the crew moves on. Holdback of $${holdback.toLocaleString()} stays held.`);
    if (contractor) {
      contractor.morale = Math.max(0, contractor.morale - 10);
      contractor.productivity = Math.max(20, contractor.productivity - 5);
    }
    program.notes.push(`${block.id}: ${quality}% quality, replant order issued.`);
    addDiscoveryTags(journey, ['regen_gap'], {
      source: 'silviculture:quality_inspection',
      severity: 2,
      note: 'Planting quality on this year\'s blocks will show up in the year-1 survival survey.'
    });
  }
  if (wetDrag > 0) ui.write(`${SURVIVAL_CAUSE_PLOT_NOTE[pressure.survivalCause] || 'Difficult microsites cost spacing and depth on this ground'}. ${pressure.summary}`);
  if (getScrutinyPressure(journey) > 0 && quality < 85) adjustScrutiny(journey, 1);

  silvicultureState.lastAction = 'inspect';
  return true;
}

// ── Fill ────────────────────────────────────────────────────────────────────

/**
 * Fill plant one of last year's openings back above minimum stocking.
 */
async function handleFillPlanting(game, seasonMods, silvicultureState, zoneProfile) {
  const { ui, journey } = game;
  const program = journey.program;
  const plantingEff = seasonMods?.plantingEfficiency ?? 1.0;
  const pressure = zoneProfile || getSilvicultureZoneProfile(journey, silvicultureState);
  const opening = (program.fill || []).find((o) => !o.done);
  if (!opening) {
    return holdChosenTask(ui, journey, 'fill', 'Last year\'s openings are all back above minimum stocking.', 'write');
  }
  const crew = getSilvicultureTaskContractors(journey, pressure, 'fill', true, ui);
  if (crew.length === 0) {
    return holdChosenTask(ui, journey, 'fill', 'No contractor is available for fill work. Put an available crew on the program first.');
  }
  const output = Math.round(estimatePlantingOutput(crew, pressure, plantingEff) * (1 - Math.min(0.22, pressure.fillPressure + pressure.survivalPenalty * 0.5)));
  const trees = Math.min(opening.trees, journey.resources.seedlings);
  if (trees <= 0) {
    return holdChosenTask(ui, journey, 'fill', 'No fill stock left in the reefer for this opening.');
  }
  const contractor = crew[0];
  const price = (Number(contractor.pricePerTree) || 0.32) + FILL_PRICE_PREMIUM;
  const invoice = Math.round(trees * price);
  journey.resources.seedlings -= trees;
  journey.resources.budget -= invoice;
  journey.resources.contractorCapacity -= 3;
  opening.done = true;
  journey.planting.fillComplete = (journey.planting.fillComplete || 0) + 1;

  ui.write(`Fill plant on ${opening.id} (${opening.year}, ${opening.ha} ha): ${trees.toLocaleString()} trees into the gaps take the opening from ${opening.stockedSph} sph back above MSS ${opening.mss}.`);
  ui.write(`${contractor.name}: fill work at $${price.toFixed(2)}/tree - invoice $${invoice.toLocaleString()}.`);
  if (output < trees) {
    ui.write('Fill work is slow walking: the crew hunts gaps between live seedlings instead of planting lines.');
  }
  const fillLeft = (program.fill || []).filter((o) => !o.done).length;
  ui.write(fillLeft === 0
    ? 'Last year\'s openings are all back above minimum stocking.'
    : `${fillLeft === 1 ? 'One' : fillLeft} of last year's openings ${fillLeft === 1 ? 'is' : 'are'} still below minimum stocking.`);
  if (pressure.fillPressure > 0.05) ui.writeWarning(pressure.summary);

  applySilvicultureContractorUsage(journey, crew, pressure, 'fill');
  silvicultureState.lastAction = 'fill';
  if (getScrutinyPressure(journey) > 0) adjustScrutiny(journey, 1);
  return true;
}

// ── Brush ───────────────────────────────────────────────────────────────────

const BRUSH_METHOD_LABELS = {
  manual: 'manual release',
  cylinder: 'cylinder release',
  glyphosate: 'glyphosate under the PMP',
  sheep: 'sheep grazing',
};

function describeBrushMethod(method) {
  return BRUSH_METHOD_LABELS[method] || String(method || 'release');
}

function areaHasTag(journey, ...tags) {
  const areaTags = new Set(Array.isArray(journey?.area?.tags) ? journey.area.tags : []);
  return tags.some((tag) => areaTags.has(tag));
}

/**
 * Spray days on interface or watershed ground before the Nation asks,
 * through the referral, for no more spraying this season.
 */
export const SENSITIVE_SPRAY_DAYS = 3;
/** Relationship standing a spray day on sensitive ground costs. */
const SPRAY_RELATIONSHIP_COST = 3;

/**
 * Which release methods this program can use today. Sheep are an interior
 * practice where the road and the ground allow a herder; glyphosate needs
 * the applicator ticket, and on interface or watershed ground it stops
 * after the Nation objects.
 * @param {Object} journey
 * @param {Object} [silvicultureState]
 */
function getReleaseAccess(journey, silvicultureState = journey?.silvicultureState) {
  const standard = getStockingStandard(journey?.program?.becCode || journey?.area?.becCode);
  const brushers = (journey?.contractors || []).find((c) => c.specialty === 'brushing');
  const sensitive = areaHasTag(journey, 'community-interface', 'watershed', 'community-water', 'salmon', 'visuals');
  const sprayDays = Number(silvicultureState?.sensitiveSprayDays) || 0;
  const hasApplicator = contractorHasCert(brushers, 'PMP-applicator');
  const sprayClosed = sensitive && sprayDays >= SENSITIVE_SPRAY_DAYS;
  return {
    sensitive,
    sprayDays,
    hasApplicator,
    sprayClosed,
    sprayAllowed: hasApplicator && !sprayClosed,
    sheepAllowed: standard.sheepGrazing !== false
      && areaHasTag(journey, 'community-interface', 'watershed', 'community-water', 'visuals')
      && !areaHasTag(journey, 'remote-camps', 'glacial', 'winter-road'),
  };
}

/** The spray days' cost to the Nation and the watershed group, for the binder. */
function describeSprayStanding(journey, silvicultureState) {
  const days = Number(silvicultureState?.sensitiveSprayDays) || 0;
  if (!days) return null;
  const closed = days >= SENSITIVE_SPRAY_DAYS;
  return `Spray maps: ${days} spray day${days === 1 ? '' : 's'} on interface and watershed ground, relationships -${days * SPRAY_RELATIONSHIP_COST}${closed ? '; the Nation has asked for no more spraying this season' : `; ${SENSITIVE_SPRAY_DAYS - days} more before the Nation asks for no more`}.`;
}

/**
 * How the day's ground and weather sit with the saw crews, 0.8-1.2. Rolled
 * once a day on the day's own dice and kept, so backing out of the release
 * menu and opening it again quotes the same hectares instead of a fresh roll.
 * @param {Object} journey
 * @param {Object} silvicultureState
 * @returns {number}
 */
export function getReleaseDayFactor(journey, silvicultureState = journey?.silvicultureState) {
  const kept = silvicultureState?.releaseDay;
  if (kept && kept.day === journey.day && Number.isFinite(kept.factor)) return kept.factor;
  const factor = 0.8 + getDayRng(journey, 'release-day')() * 0.4;
  if (silvicultureState) silvicultureState.releaseDay = { day: journey.day, factor };
  return factor;
}

/**
 * Release treatment on the older stands. The choice is the real one: saw
 * crews on the whole opening or round each crop tree, glyphosate under the
 * pest management plan, or sheep where the ground and the road allow it.
 * Each method is priced against what the budget has free, and the day's
 * area and invoice are confirmed before the crews go out.
 */
async function handleBrushTreatment(game, seasonMods, silvicultureState, zoneProfile) {
  const { ui, journey } = game;
  const program = journey.program;
  const brushingEff = seasonMods?.brushingEfficiency ?? 1.0;
  const pressure = zoneProfile || getSilvicultureZoneProfile(journey, silvicultureState);
  const queue = (program.brush || []).filter((o) => o.treated < o.ha);

  if (!queue.length) {
    return holdChosenTask(ui, journey, 'brush', 'The release program is treated for the year.', 'write');
  }
  const crew = getSilvicultureTaskContractors(journey, pressure, 'brush', true, ui);
  if (crew.length === 0) {
    return holdChosenTask(ui, journey, 'brush', 'No brushing contractor is available. Put an available crew on the program first.');
  }
  const contractor = crew.find((c) => c.specialty === 'brushing') || crew[0];
  const access = getReleaseAccess(journey, silvicultureState);
  const hasApplicator = contractorHasCert(contractor, 'PMP-applicator');
  const standard = getStockingStandard(program.becCode || journey.area?.becCode);
  const costs = estimateProgramCosts(journey);
  const queueCost = (method) => ` The rest of the queue this way: about ${formatMoney(roundTo(costs.release[method], 1000))}.`;

  ui.write(`Release budget: ${Math.round(costs.releaseHa)} ha left in the queue and about ${formatMoney(roundTo(costs.freeForRelease, 1000))} free once planting, fill, surveys and overhead are paid.`);

  const options = [
    {
      label: `Manual brushing (saw crews, ~$${BRUSH_RATES.manual}/ha)`,
      description: `The whole opening, no PMP, nothing in the water. ${standard.manualRelease || `The crews cut ${describeBrush(journey)} below the seedling leaders.`}${queueCost('manual')}`,
      value: 'manual',
    },
    {
      label: `Cylinder release (saw crews, ~$${BRUSH_RATES.cylinder}/ha)`,
      description: `The crews clear a ring round each crop tree instead of the whole opening: cheaper, slower going, no chemicals. The ring is the competition a free-growing surveyor reads.${queueCost('cylinder')}`,
      value: 'cylinder',
    },
  ];
  if (hasApplicator) {
    const sprayOption = {
      label: `Glyphosate under the PMP (~$${BRUSH_RATES.glyphosate}/ha)`,
      description: `Backpack or aerial; fastest and cheapest per hectare. 10 m pesticide-free zones on every stream${access.sensitive ? `; this is interface/watershed ground, the community and the Nation read the spray maps, and each spray day here costs relationships (${Math.max(0, SENSITIVE_SPRAY_DAYS - access.sprayDays)} before the Nation asks for no more)` : ''}.${queueCost('glyphosate')}`,
      value: 'glyphosate',
    };
    if (access.sprayClosed) {
      sprayOption.disabled = true;
      sprayOption.description = `Off the table: after ${SENSITIVE_SPRAY_DAYS} spray days on this ground the Nation asked, through the referral, for no more spraying this season, and the licensee agreed.`;
    }
    options.push(sprayOption);
  }
  if (access.sheepAllowed) {
    options.push({
      label: `Sheep grazing (herder contract, ~$${BRUSH_RATES.sheep}/ha)`,
      description: `No chemicals, no saws; slow, needs the road open and a herder with dogs. Reads well on interface ground.${queueCost('sheep')}`,
      value: 'sheep',
    });
  }
  options.push({ label: 'Never mind', description: 'Leave the release program for another day.', value: 'cancel' });

  const avgProductivity = crew.reduce((sum, c) => sum + (c.productivity * getSilvicultureContractorFit(c, pressure, 'brush')), 0) / crew.length;
  const remaining = queue.reduce((sum, opening) => sum + (opening.ha - opening.treated), 0);
  // The day's ground is set by the crews and the weather before the method
  // is chosen, so the confirmation can quote the real area and invoice.
  const dayFactor = getReleaseDayFactor(journey, silvicultureState);
  const hectaresFor = (method) => {
    const pfzLoss = method === 'glyphosate' && areaHasTag(journey, 'salmon', 'watershed', 'community-water') ? 0.92 : 1;
    const base = BRUSH_DAILY_HA[method] || BRUSH_DAILY_HA.manual;
    // A strong crew on a good day beats the base by a quarter at most.
    return Math.min(remaining, Math.round(Math.min(base * 1.25, base * (avgProductivity / 100) * brushingEff * pfzLoss * dayFactor)));
  };

  let method = null;
  while (!method) {
    const choice = await ui.promptChoice(`Release treatment on ${queue[0].id} (${queue[0].year}, ${queue[0].ha} ha): how?`, options);
    if (!choice || choice.value === 'cancel' || choice.disabled) {
      ui.write('The brushing crew waits for a call.');
      return false;
    }
    const ha = hectaresFor(choice.value);
    if (ha <= 0) {
      return holdChosenTask(ui, journey, 'brush', 'No release hectares remain on the program map.', 'write');
    }
    const rate = BRUSH_RATES[choice.value] || BRUSH_RATES.manual;
    const invoice = Math.round(ha * rate);
    const budget = Number(journey.resources.budget) || 0;
    const confirm = await ui.promptChoice(
      `Today's release by ${describeBrushMethod(choice.value)}: ${ha} ha at $${rate}/ha, ${formatMoney(invoice)} against ${formatMoney(budget)} left. Send the crews?`,
      [
        {
          label: `Send the crews (${formatMoney(invoice)})`,
          description: invoice > budget
            ? 'More than the program has left: the invoice goes unpaid and the program is cancelled.'
            : invoice > costs.freeForRelease
              ? `${ha} ha of the ${Math.round(remaining)} ha queue; ${formatMoney(budget - invoice)} left after it. This eats into the money planting, fill and surveys still need: only about ${formatMoney(roundTo(Math.max(0, costs.freeForRelease), 1000))} was free for release.`
              : `${ha} ha of the ${Math.round(remaining)} ha queue; ${formatMoney(budget - invoice)} left after it.`,
          value: 'confirm',
        },
        { label: 'Choose another method', description: 'Back to the release options.', value: 'back' },
        { label: 'Not today', description: 'Leave the release program for another day.', value: 'cancel' },
      ],
    );
    if (confirm?.value === 'confirm') method = choice.value;
    else if (confirm?.value !== 'back') {
      ui.write('The brushing crew waits for a call.');
      return false;
    }
  }
  let hectares = hectaresFor(method);

  // Walk the queue: the free-growing candidate under brush sits at the head.
  const treated = [];
  let left = hectares;
  for (const opening of queue) {
    if (left <= 0) break;
    const room = opening.ha - opening.treated;
    const put = Math.min(room, left);
    opening.treated += put;
    opening.method = method;
    left -= put;
    treated.push({ opening, ha: put });
    if (opening.treated >= opening.ha && opening.fgId) {
      const fg = (program.freeGrowing || []).find((candidate) => candidate.id === opening.fgId);
      if (fg) {
        fg.released = true;
        fg.releaseMethod = method;
        fg.releasedDay = journey.day;
        fg.releaseReadyDay = journey.day + (RELEASE_TAKES_DAYS[method] ?? 1);
      }
    }
  }
  hectares = treated.reduce((sum, entry) => sum + entry.ha, 0);

  const rate = BRUSH_RATES[method] || BRUSH_RATES.manual;
  const invoice = Math.round(hectares * rate);
  journey.brushing.hectaresComplete = Math.min(journey.brushing.hectaresTarget, journey.brushing.hectaresComplete + hectares);
  journey.resources.contractorCapacity -= 2;
  journey.resources.budget -= invoice;

  const openingsText = treated.map((entry) => `${entry.opening.id} (${entry.opening.year}): ${Math.round(entry.ha)} of ${Math.round(entry.opening.ha)} ha`).join(' and ');
  const yearsText = [...new Set(treated.map((entry) => entry.opening.year))].sort().join('/');
  if (method === 'manual') {
    ui.write(`Treated ${Math.round(hectares)} ha of ${yearsText} openings by manual release - ${formatReleaseTargets(standard)} cut below the seedling leaders.`);
  } else if (method === 'cylinder') {
    ui.write(`Treated ${Math.round(hectares)} ha of ${yearsText} openings by cylinder release - ${formatReleaseTargets(standard)} cut back in a ring round every crop tree.`);
  } else if (method === 'glyphosate') {
    const pmp = silvicultureState.pmpNumber ||= `402-0${700 + Math.floor(Math.random() * 90)}`;
    silvicultureState.sprayDays = (Number(silvicultureState.sprayDays) || 0) + 1;
    ui.write(`${hectares >= 60 ? 'Aerial' : 'Backpack'} glyphosate on ${Math.round(hectares)} ha of ${yearsText} openings under PMP ${pmp}. 10 m pesticide-free zones flagged on every stream.`);
    if (access.sensitive) {
      silvicultureState.sensitiveSprayDays = (Number(silvicultureState.sensitiveSprayDays) || 0) + 1;
      ui.writeWarning(`The First Nation's guardian program asks for the spray maps, and so does the community watershed group. Relationships -${SPRAY_RELATIONSHIP_COST}; scrutiny climbs.`);
      adjustRelationships(journey, -SPRAY_RELATIONSHIP_COST);
      adjustScrutiny(journey, 2);
      program.notes.push(`Spray maps for PMP ${pmp} sent to the Guardians and the watershed group.`);
      if (silvicultureState.sensitiveSprayDays >= SENSITIVE_SPRAY_DAYS) {
        ui.writeWarning('The Nation writes through the referral asking for no more spraying on this ground this season. The licensee agrees: the rest of the release goes by saw or sheep.');
      }
    } else {
      ui.write('The Nation\'s guardian program asks for the spray maps; the RPF signs the treatment record.');
    }
  } else {
    ui.write(`Sheep grazing on ${Math.round(hectares)} ha of ${yearsText} openings - the herder camps on the landing, the dogs keep the flock off the seedlings.`);
  }
  ui.write(`Release treatment: ${openingsText}. ${contractor.name}: $${rate}/ha - invoice $${invoice.toLocaleString()}.`);
  const releasedFg = treated.map((entry) => entry.opening).filter((opening) => opening.fgId && opening.treated >= opening.ha);
  for (const opening of releasedFg) {
    const fg = (program.freeGrowing || []).find((candidate) => candidate.id === opening.fgId);
    if (fg?.surveyed && fg.result === 'fail') {
      ui.writePositive(`Prescribed release done on ${opening.id}. The stand goes back on the free-growing list for its ${fg.resurveyYear} resurvey.`);
    } else if (method === 'glyphosate') {
      ui.writePositive(`Release treatment done on the ${opening.year} opening ${opening.id}. The sprayed brush browns out over the next weeks; the surveyor can read the stand from day ${fg?.releaseReadyDay}.`);
    } else {
      ui.writePositive(`Release treatment done on the ${opening.year} opening ${opening.id}. That stand is back on track for its free-growing survey.`);
    }
  }
  const young = treated.map((entry) => entry.opening).filter((opening) => !opening.fgId && opening.treated >= opening.ha);
  if (young.length) {
    ui.writePositive(`Release treatment done on ${young.map((o) => `${o.id} (${o.year})`).join(', ')}. ${young.length === 1 ? 'That stand is' : 'Those stands are'} back on track for ${young.length === 1 ? 'its' : 'their'} free-growing date.`);
  }
  if (pressure.brushPressure > 0.05) ui.writeWarning(pressure.summary);
  if (brushingEff >= 1.2) ui.write('The summer release window: full leaf on the brush, the treatment takes.');

  applySilvicultureContractorUsage(journey, crew, pressure, 'brush');
  silvicultureState.lastAction = 'brush';
  silvicultureState.lastBrushMethod = method;
  return true;
}

// ── Free-growing survey ─────────────────────────────────────────────────────

/**
 * A free-growing survey on one of the older openings, against the site
 * plan's stocking standard. The result is the stand's condition, not a roll:
 * released stands pass, stands under brush fail on competition.
 */
async function handleFreeGrowingSurvey(game, seasonMods, silvicultureState, zoneProfile) {
  const { ui, journey } = game;
  const program = journey.program;
  const standard = getStockingStandard(program.becCode);
  const surveyEff = seasonMods?.surveyEfficiency ?? 1.0;
  const pressure = zoneProfile || getSilvicultureZoneProfile(journey, silvicultureState);
  const vegetationPressure = getVegetationPressure(journey);
  const scrutinyPressure = getScrutinyPressure(journey);

  if (journey.surveys.freeGrowingComplete >= journey.surveys.freeGrowingTarget) {
    return holdChosenTask(ui, journey, 'survey', 'This year\'s free-growing declarations are all in RESULTS.', 'write');
  }
  const opening = getSurveyableOpening(journey);
  if (!opening) {
    return holdChosenTask(ui, journey, 'survey', describeHeldWork(journey, 'spring').find((line) => /survey|release/i.test(line))
      || 'No stand on the free-growing list can be surveyed today.');
  }

  const hasAccreditedSurveyor = crewHasRole(journey.crew || [], 'surveyor');
  const contractors = getSilvicultureTaskContractors(journey, pressure, 'survey', !hasAccreditedSurveyor, ui)
    .filter((c) => contractorHasCert(c, 'surveyor-accredited'));
  if (contractors.length === 0 && !hasAccreditedSurveyor) {
    return holdChosenTask(ui, journey, 'survey', 'Free-growing surveys need an accredited silviculture surveyor - your own, or the survey contractor. Nobody unaccredited signs a declaration.');
  }

  const contractor = contractors[0] || null;
  const surveyCost = contractor ? (Number(contractor.dayRate) || SURVEY_DAY_RATE) : 0;
  journey.surveys.regenerationSurveys++;
  journey.resources.budget -= surveyCost;
  opening.attempts += 1;

  // The stand's condition, as the plots read it today. Zone pressure and a
  // release program behind the calendar cost plots; a stand that has had
  // its release treatment reads clean - the brush is below the leaders.
  // A failure now costs the stand its place on this year's list, so the
  // plots read the stand and the program, not the dice.
  let plotPct = opening.fgPlotPct;
  plotPct -= Math.round(pressure.surveyPressure * 30);
  plotPct -= Math.round(Math.max(0, vegetationPressure - 0.25) * 40);
  plotPct += Math.round(-2 + Math.random() * 5);
  if (surveyEff >= 1.2) plotPct += 2;
  if (opening.needsRelease && opening.released) plotPct = Math.max(plotPct + 30, 84 + Math.round(Math.random() * 8));
  plotPct = Math.max(20, Math.min(100, plotPct));
  const wellSpaced = opening.wellSpacedSph;
  const stocked = wellSpaced >= standard.mss;
  const pass = stocked && plotPct >= 80;

  ui.writeHeader('FREE-GROWING SURVEY');
  ui.write(`${opening.id} (${opening.year}, ${opening.ha} ha, ${program.becCode}) surveyed by ${contractor ? `${contractor.name} (accredited)` : 'your accredited surveyor'}${surveyCost ? ` - day rate $${surveyCost.toLocaleString()}` : ''}.`);
  ui.write(`Well-spaced: ${wellSpaced.toLocaleString()} sph (MSS ${standard.mss}) - ${stocked ? 'stocked' : 'NOT STOCKED'}. Free-growing: ${plotPct}% of plots - ${pass ? 'PASS' : 'FAIL'}${pass ? '' : `: ${describeFailure(opening, standard, stocked, plotPct)}`}.`);

  if (pass) {
    opening.surveyed = true;
    opening.result = 'pass';
    journey.surveys.freeGrowingComplete = Math.min(journey.surveys.freeGrowingTarget, journey.surveys.freeGrowingComplete + 1);
    ui.writePositive(`${opening.id} declared free-growing: ${standard.preferred.join('/')} above ${standard.fgHeightMin} m, clear of the ${standard.competitionRatio}% competition ratio. Declaration submitted to RESULTS.`);
    if (surveyEff >= 1.2) ui.write('Fall conditions: leaves off the brush, every stem readable.');
    // A second team clears a second opening on a good day.
    const second = getSurveyableOpening(journey);
    if (second && hasAccreditedSurveyor && contractor && surveyEff >= 1.1 && journey.surveys.freeGrowingComplete < journey.surveys.freeGrowingTarget) {
      second.surveyed = true;
      second.result = 'pass';
      second.attempts += 1;
      journey.surveys.freeGrowingComplete = Math.min(journey.surveys.freeGrowingTarget, journey.surveys.freeGrowingComplete + 1);
      ui.writePositive(`Two survey teams on the ground: ${second.id} (${second.year}) also declared free-growing.`);
    }
  } else {
    // A failed stand is treated and waits out its resurvey interval; it does
    // not go back in front of the surveyor this season. The treatment is
    // still this season's obligation.
    opening.surveyed = true;
    opening.result = 'fail';
    opening.resurveyYear = program.year + FG_RESURVEY_YEARS;
    if (!stocked) {
      const trees = Math.round(opening.ha * (standard.mss - wellSpaced) * 1.4);
      ui.write(`Prescription: fill plant ${opening.id} to MSS this season and resurvey in ${opening.resurveyYear}. The opening leaves this year's declaration list.`);
      program.fill.push({ id: opening.id, year: opening.year, ha: opening.ha, stockedSph: wellSpaced, mss: standard.mss, trees, done: false });
      journey.planting.fillTarget = program.fill.length;
      journey.resources.seedlings += trees; // fill stock ordered off the nursery's surplus
    } else {
      const ha = Math.min(opening.ha, 24);
      ui.write(`Prescription: ${pressure.brushPressure > 0.05 ? 'manual' : 'manual or chemical'} release this season, resurvey in ${opening.resurveyYear}. The opening leaves this year's declaration list; the release crew takes it next.`);
      opening.needsRelease = true;
      opening.released = false;
      opening.releaseReadyDay = null;
      if (!program.brush.some((entry) => entry.fgId === opening.id && entry.treated < entry.ha)) {
        program.brush.unshift({ id: opening.id, year: opening.year, ha, openingHa: opening.ha, treated: 0, method: null, fgId: opening.id });
        journey.brushing.hectaresTarget += ha;
      }
    }
    const spares = (program.freeGrowing || []).filter((candidate) => !candidate.surveyed).length;
    const needed = journey.surveys.freeGrowingTarget - journey.surveys.freeGrowingComplete;
    if (spares < needed) {
      ui.writeWarning(`The free-growing list is now ${spares} opening${spares === 1 ? '' : 's'} for ${needed} declaration${needed === 1 ? '' : 's'}. This year's declarations will come up short.`);
    }
    addDiscoveryTags(journey, ['regen_gap'], {
      source: 'silviculture:survey',
      severity: 2,
      note: `${opening.id} failed free-growing on ${stocked ? 'competition' : 'stocking'}; prescription written.`
    });
    if (scrutinyPressure > 0 && opening.attempts > 1) adjustScrutiny(journey, 1);
    if (pressure.surveyPressure > 0.05) ui.writeWarning(pressure.summary);
  }

  if (contractor) applySilvicultureContractorUsage(journey, [contractor], pressure, 'survey');
  silvicultureState.lastAction = 'survey';
  return true;
}

function describeFailure(opening, standard, stocked, plotPct) {
  if (!stocked) return `well-spaced stems below MSS ${standard.mss}`;
  const brush = standard.brushSpecies || ['aspen'];
  if (opening.needsRelease && !opening.released) {
    return `${brush[0]} competition in the draws exceeds the ${standard.competitionRatio}% height ratio`;
  }
  return `${brush[1] || brush[0]} overtopping in ${100 - plotPct}% of plots`;
}

// ── Meetings, briefings, contractor calls ───────────────────────────────────

/** Foremen you can sit down with today: anyone not on days off. */
function getMeetableContractors(journey, zoneProfile) {
  return (journey.contractors || []).filter((contractor) => {
    const state = ensureSilvicultureContractorState(contractor, journey, zoneProfile);
    return state.status !== 'recovering' && !(state.cooldownDays > 0);
  });
}

/**
 * Contractor meeting: the plot cards and the pay sheet. The foreman of a crew
 * on the block or available for it comes in; a crew on days off does not.
 * @returns {Promise<boolean>} whether a meeting happened (and spent the day)
 */
async function handleContractorMeeting(game, zoneProfile = null) {
  const { ui, journey } = game;
  const meetable = getMeetableContractors(journey, zoneProfile || getSilvicultureZoneProfile(journey));

  if (meetable.length === 0) {
    return holdChosenTask(ui, journey, 'meeting', 'Every crew is on days off; there is no foreman to sit down with today.', 'write');
  }

  const options = meetable.map(c => ({
    label: `${c.name} (${c.specialty})`,
    description: `${c.isActive ? 'on the block' : 'available'} | ${describeContractorEconomics(c)} | productivity ${c.productivity}% | morale ${c.morale}%`,
    value: c.id
  }));
  options.push({ label: 'Never mind', description: 'Keep the day for the program.', value: 'cancel' });

  const choice = await ui.promptChoice('Meet with which contractor?', options);
  const contractor = journey.contractors.find(c => c.id === choice.value);
  if (!contractor) return false;
  const before = { morale: contractor.morale, productivity: contractor.productivity, quality: contractor.qualityPct };

  if (contractor.specialty === 'planting') {
    const retained = (journey.program?.blocks || []).filter((block) => block.status === 'inspected' && block.quality < 90 && block.holdback > 0);
    if (retained.length) {
      const release = retained.reduce((sum, block) => sum + block.holdback, 0);
      journey.resources.budget -= release;
      for (const block of retained) block.holdback = 0;
      contractor.morale = Math.min(100, contractor.morale + 12);
      contractor.qualityPct = Math.min(99, (contractor.qualityPct || 92) + 1);
      ui.write(`You walk the plot cards with ${contractor.name}'s foreman and agree the pay sheet: the crew re-spaced the low plots, so $${release.toLocaleString()} of held-back payment goes out. Morale up, and the foreman knows what the plots look for.`);
    } else {
      contractor.morale = Math.min(100, contractor.morale + 8);
      contractor.qualityPct = Math.min(99, (contractor.qualityPct || 92) + 1);
      ui.write(`Plot cards and pay sheet with ${contractor.name}: nothing in dispute, the foreman sees the quality numbers before the invoice does. Quality expectations up a point.`);
    }
  } else if (contractor.specialty === 'brushing') {
    contractor.morale = Math.min(100, contractor.morale + 8);
    contractor.productivity = Math.min(100, contractor.productivity + 6);
    ui.write(`You go over the treatment maps with ${contractor.name}: block boundaries, the pesticide-free zones, where the saw crews start. Fewer wasted mornings.`);
  } else {
    contractor.morale = Math.min(100, contractor.morale + 6);
    contractor.productivity = Math.min(100, contractor.productivity + 6);
    ui.write(`You set the plot layout and the standards unit map with ${contractor.name} before they walk the openings. The survey cards will match the site plan.`);
  }
  if (contractor.morale < 50) {
    contractor.morale = Math.min(100, contractor.morale + 7);
    ui.write(`${contractor.name} appreciated the time as much as the numbers.`);
  }
  // What the day bought, in the numbers the crew is judged on.
  const moves = [
    ['morale', before.morale, contractor.morale],
    ['productivity', before.productivity, contractor.productivity],
    ['plot quality', before.quality, contractor.qualityPct],
  ].filter(([, from, to]) => Number.isFinite(from) && Number.isFinite(to) && from !== to)
    .map(([label, from, to]) => `${label} ${from}% → ${to}%`);
  if (moves.length) ui.writePositive(`${contractor.name}: ${moves.join(', ')}.`);
  return true;
}

function handleTeamBriefing(game) {
  const { ui, journey } = game;
  if (!journey.crew) return;

  const active = journey.crew.filter((member) => member.isActive);
  const average = () => Math.round(active.reduce((sum, member) => sum + (member.morale || 0), 0) / Math.max(1, active.length));
  const before = average();
  for (const member of active) {
    member.morale = Math.min(100, (member.morale || 50) + 15);
  }

  ui.write('Tailgate meeting: the week\'s plot schedule, radio channels, the ETV route and the fire danger rating. Your crew is set for the day.');
  if (active.length) ui.writePositive(`Crew morale ${before}% → ${average()}% on average.`);
}

/**
 * A foreman's call before the crews go out, answered from the card.
 * @param {Object} game - { ui, journey }
 * @param {Object} cEvent - one of CONTRACTOR_EVENTS
 * @param {Object} contractor - the outfit calling
 * @param {Function} [rng] - the day's call dice
 */
export async function handleContractorEvent(game, cEvent, contractor, rng = Math.random) {
  const { ui, journey } = game;
  const zoneProfile = getSilvicultureZoneProfile(journey);
  const silvicultureState = ensureSilvicultureState(journey);

  ui.clear();
  // The panel beside the call shows today's program, not yesterday's.
  updateSilvicultureMissionStatus(ui, journey, nextSeasonInfoOf(journey), zoneProfile);
  ui.writeHeader(`CONTRACTOR CALL: ${cEvent.title}`);
  ui.write(cEvent.getText(contractor, journey, rng));
  ui.write('Brief response; the day\'s work continues.');
  ui.write('');

  const options = cEvent.options.map(opt => ({
    label: opt.label,
    description: (typeof opt.description === 'function' ? opt.description(contractor) : opt.description) || '',
    value: opt.value
  }));

  const choice = await ui.promptChoice('How do you respond?', options);
  const selected = cEvent.options.find(o => o.value === choice.value);
  if (!selected) return;
  const note = (text) => silvicultureState.dayNotes?.push(text);
  silvicultureState.contractorCallToday = true;

  if (selected.cost > 0) {
    if (journey.resources.budget < selected.cost) {
      ui.writeWarning(`Not enough budget! ($${selected.cost.toLocaleString()} needed)`);
      contractor.morale = Math.max(0, contractor.morale - 10);
      startSilvicultureContractorRecovery(contractor, 1, 'budget');
      note(`${cEvent.title}: no money for it, so ${contractor.name} takes the day off unhappy.`);
      return;
    }
    journey.resources.budget -= selected.cost;
  }
  if (selected.settles) {
    const state = ensureSilvicultureContractorState(contractor, journey, zoneProfile);
    state.settledCalls = { ...state.settledCalls };
    for (const callId of selected.settles) state.settledCalls[callId] = journey.day;
  }
  contractor.morale = Math.max(0, Math.min(100, contractor.morale + selected.moraleGain));
  contractor.productivity = Math.max(20, Math.min(100, contractor.productivity + selected.prodGain));
  note(`${cEvent.title}: ${selected.label.charAt(0).toLowerCase()}${selected.label.slice(1)}; ${contractor.name} morale ${selected.moraleGain >= 0 ? 'up' : 'down'}.`);

  if (selected.qualityLift) {
    silvicultureState.qualityLift = (silvicultureState.qualityLift || 0) + selected.qualityLift;
  }
  if (selected.fraud) {
    silvicultureState.qualityPenaltyNext = (silvicultureState.qualityPenaltyNext || 0) + 5;
    silvicultureState.falseCardsPending = true;
    adjustScrutiny(journey, 3);
    adjustCompliance(journey, -4);
    // Your own checker's next plots will not match the cards: noticed, and
    // likely to surface when the district checks the season.
    recordProgramShortcut(journey, {
      id: 'signed-foreman-plot-cards',
      title: 'Plot cards signed for the foreman',
      kind: 'false-record',
      status: 'noticed',
      source: 'contractor-call',
    });
    ui.writeWarning('You sign plot cards you did not walk. The holdback goes out, the next inspection will read what the crew actually did, and the file now carries a false record an NRO would find in an hour.');
    note('The plot cards you signed for the foreman are a false record on file.');
  }
  if (selected.priceLift) {
    contractor.pricePerTree = Math.round(((Number(contractor.pricePerTree) || 0.32) + selected.priceLift) * 100) / 100;
    ui.write(`${contractor.name} now bills $${contractor.pricePerTree.toFixed(2)}/tree for the rest of the program.`);
  }
  if (selected.plantersLost) {
    contractor.planters = Math.max(4, Math.round((contractor.planters || 12) * (1 - selected.plantersLost)));
    ui.writeWarning(`${contractor.name} sends half the crew to the other contract: ${contractor.planters} planters stay on your program.`);
  }
  if (selected.scrutiny) adjustScrutiny(journey, selected.scrutiny);
  if (selected.incidentRisk && rng() < selected.incidentRisk) {
    // The reason for the stand-down was real: someone on the crew gets hurt,
    // the employer's report goes in, and the prevention officer reads why
    // the crew was on the block.
    contractor.productivity = Math.max(20, contractor.productivity - 10);
    adjustScrutiny(journey, 6);
    adjustCompliance(journey, -4);
    ui.writeWarning(`One of ${possessive(contractor.name)} ${crewNoun(contractor)} is hurt on the block. The employer's incident report goes to WorkSafeBC, and the file asks why the crew was out there. Scrutiny +6, compliance -4.`);
    note(`${contractor.name}: a ${crewNoun(contractor).replace(/s$/, '')} hurt after you kept the crew on the block through the stand-down; WorkSafeBC has the report.`);
  }

  if (selected.moraleGain > 0) {
    ui.writePositive(`${contractor.name}: crew morale up.`);
    if (selected.value === 'rest') {
      startSilvicultureContractorRecovery(contractor, 1, 'rest');
      if (getScrutinyPressure(journey) > 0 && zoneProfile.accessPressure > 0.08) {
        adjustScrutiny(journey, -1);
      }
    }
  } else if (selected.moraleGain < 0) {
    ui.writeWarning(`${contractor.name} is unhappy with the call.`);
  }
}

// ── Program state ───────────────────────────────────────────────────────────

function safeRatio(current, target) {
  if (!Number.isFinite(target) || target <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, (Number(current) || 0) / target));
}

/**
 * How far the release program is behind the calendar. The older stands lose
 * the height race the longer brushing waits; nothing here is about this
 * year's seedlings.
 */
function getVegetationPressure(journey) {
  const brushRatio = safeRatio(journey?.brushing?.hectaresComplete, journey?.brushing?.hectaresTarget);
  const deadline = Number.isFinite(journey?.deadline) ? journey.deadline : 42;
  const calendar = safeRatio(journey?.day, deadline);
  return Math.max(0, calendar - brushRatio);
}

/**
 * Program records for a journey that predates them (older saves) or that was
 * built by a caller other than the factory.
 */
function ensureSilvicultureProgram(journey) {
  if (!journey.program || !Array.isArray(journey.program.blocks)) {
    journey.program = buildSilvicultureProgram(journey);
    // Reconcile with whatever the counters already say.
    let planted = journey.planting.seedlingsPlanted || 0;
    let blocks = journey.planting.blocksPlanted || 0;
    for (const block of journey.program.blocks) {
      if (blocks > 0) {
        block.planted = block.trees;
        block.status = 'inspected';
        block.quality = journey.planting.survivalRate || 90;
        blocks -= 1;
        planted = Math.max(0, planted - block.trees);
      } else if (planted > 0) {
        block.planted = Math.min(block.trees, planted);
        block.status = block.planted >= block.trees ? 'planted' : 'planting';
        planted -= block.planted;
      }
    }
    let brushed = journey.brushing.hectaresComplete || 0;
    for (const opening of journey.program.brush) {
      const put = Math.min(opening.ha, brushed);
      opening.treated = put;
      if (put > 0) opening.method = 'manual';
      brushed -= put;
      if (opening.fgId && opening.treated >= opening.ha) {
        const fg = journey.program.freeGrowing.find((candidate) => candidate.id === opening.fgId);
        if (fg) fg.released = true;
      }
    }
    let surveyed = journey.surveys.freeGrowingComplete || 0;
    for (const opening of journey.program.freeGrowing) {
      if (surveyed <= 0) break;
      if (opening.needsRelease && !opening.released) continue;
      opening.surveyed = true;
      opening.result = 'pass';
      surveyed -= 1;
    }
    journey.planting.fillTarget ??= journey.program.fill.length;
    journey.planting.fillComplete ??= 0;
  }
  journey.program.notes ||= [];
  return journey.program;
}

function ensureSilvicultureState(journey) {
  if (!journey.silvicultureState) {
    journey.silvicultureState = {
      phase: 'plant',
      cycle: 1,
      lastAction: null,
      lastSurvivalRate: null,
      zonePressure: null,
      zombieDays: 0,
      qualityLift: 0,
      qualityPenaltyNext: 0,
    };
  } else {
    journey.silvicultureState.phase ||= 'plant';
    journey.silvicultureState.cycle ||= 1;
    journey.silvicultureState.zombieDays ||= 0;
    journey.silvicultureState.qualityLift ||= 0;
    journey.silvicultureState.qualityPenaltyNext ||= 0;
  }

  if (!journey.silvicultureState.zonePressure) {
    journey.silvicultureState.zonePressure = getSilvicultureZoneProfile(journey);
  }

  return journey.silvicultureState;
}

/**
 * Program schedule banked by events (js/events/resolution.js routes event
 * progress here rather than into planted blocks). A whole day ahead buys the
 * release crew an extra shift; a whole day behind costs crew-days.
 */
function settleProgramSchedule(journey, ui) {
  const schedule = journey.programSchedule;
  if (!schedule || !Number.isFinite(schedule.days)) return;
  while (schedule.days >= 1) {
    schedule.days -= 1;
    journey.resources.contractorCapacity += 2;
    // The extra shift goes onto the young stands in the queue, and only what
    // it actually treats is counted: crediting the counter with hectares no
    // opening took left the meter at 100% with a stand still open. A
    // free-growing candidate's release is left for a deliberate treatment.
    let bonus = 0;
    for (const opening of journey.program?.brush || []) {
      if (bonus >= 6 || opening.fgId) continue;
      const put = Math.min(6 - bonus, Math.max(0, opening.ha - opening.treated));
      opening.treated += put;
      bonus += put;
    }
    journey.brushing.hectaresComplete = Math.min(journey.brushing.hectaresTarget, journey.brushing.hectaresComplete + bonus);
    ui.writePositive(`A day ahead of schedule: the release crew squeezes in an extra shift${bonus ? ` (+${bonus} ha)` : ''} and the roster gains two crew-days.`);
  }
  while (schedule.days <= -1) {
    schedule.days += 1;
    journey.resources.contractorCapacity = Math.max(0, journey.resources.contractorCapacity - 3);
    for (const contractor of journey.contractors || []) {
      if (!contractor.isActive) continue;
      const state = ensureSilvicultureContractorState(contractor, journey, null);
      state.fatigue = Math.min(6, (state.fatigue || 0) + 1);
    }
    ui.writeWarning('A day behind schedule: three crew-days gone and the foremen feel it.');
  }
}

// The program runs on a budget, not a fuel cache, a grub box or a first-aid
// kit count. An event that spends fuel or food spends money here instead
// (crummy and reefer fuel, camp groceries). A fuel or food *gain* is stock
// the program does not carry, so it is dropped rather than paid out: buying
// smoked meat costs the $120 on the label, it does not earn $600. The card's
// preview and the outcome read the same adapted numbers.
const FUEL_UNIT_COST = 25;  // $ per authored fuel unit
const FOOD_UNIT_COST = 60;  // $ per person-day of camp groceries
const EVENT_EFFECT_BANDS = ['effects', 'partialEffects', 'failureEffects'];
/** Stocks the program does not track; their effects are dropped. */
const UNTRACKED_STOCKS = ['firstAid'];

// Cards written for a crew on a traverse: slinging supplies to the next
// block, flying the route, relocating a block. There is no route here.
const TRAVERSE_ONLY_EVENTS = new Set(['helicopter_available', 'sasquatch_sighting']);
// Novelty cards from the old deck (a dance trend, a celebrity, first
// contact) have no place in a supervisor's program either.
const NOVELTY_EVENTS = new Set(['social_media_viral', 'celebrity_endorsement', 'alien_landing']);

// An option whose own words take the day ("Spend the day prepping", "Rest
// day for the sick", a tour that "takes most of the day") spends it here,
// rather than reading "brief response; work continues".
const TAKES_THE_DAY = /\b(spend|take|use) the day\b|\brest day\b|\btakes (most of|the rest of) the day\b|\btakes the day\b/i;
// A card whose own setup says the day is gone ("No one's working today")
// takes it whatever the answer, setting it aside included.
const DAY_IS_LOST = /\bno one'?s working today\b|\bnobody (works|is working) today\b/i;

function adaptEffects(effects) {
  const hasStock = typeof effects.fuel === 'number' || typeof effects.food === 'number';
  const hasUntracked = UNTRACKED_STOCKS.some((key) => key in effects);
  if (!hasStock && !hasUntracked && !('timeUsed' in effects)) return effects;
  const rest = { ...effects };
  const cost = Math.min(0, Number(rest.fuel) || 0) * FUEL_UNIT_COST + Math.min(0, Number(rest.food) || 0) * FOOD_UNIT_COST;
  for (const key of ['fuel', 'food', 'timeUsed', ...UNTRACKED_STOCKS]) delete rest[key];
  const budget = (Number(rest.budget) || 0) + cost;
  if (budget) rest.budget = budget;
  else delete rest.budget;
  return rest;
}

/**
 * A copy of the day's event fitted to the program: fuel and food costs
 * priced into the budget, stock gains and first-aid counts dropped, the
 * traverse's time setback removed (there is no next leg), and an option
 * that says it takes the day (or a card that says nobody works today)
 * marked as spending it. Traverse-only and novelty cards return null. The
 * authored event is left alone.
 * @param {Object} event
 * @returns {Object|null}
 */
export function adaptEventForProgram(event) {
  if (TRAVERSE_ONLY_EVENTS.has(event?.id) || NOVELTY_EVENTS.has(event?.id)) return null;
  if (!Array.isArray(event?.options)) return event;
  const dayLost = DAY_IS_LOST.test(event.description || '');
  let changed = dayLost;
  const options = event.options.map((option) => {
    if (!option) return option;
    let adapted = option;
    const copy = () => {
      if (adapted === option) adapted = { ...option };
      changed = true;
    };
    for (const band of EVENT_EFFECT_BANDS) {
      const effects = option[band];
      if (!effects) continue;
      const fitted = adaptEffects(effects);
      if (fitted === effects) continue;
      copy();
      adapted[band] = fitted;
    }
    if ('timeUsed' in option) {
      copy();
      delete adapted.timeUsed;
    }
    if (typeof option.spendsDay !== 'boolean' && !option.timeCost
        && (dayLost || TAKES_THE_DAY.test(option.label || '') || TAKES_THE_DAY.test(option.outcome || ''))) {
      copy();
      adapted.spendsDay = true;
    }
    return adapted;
  });
  if (!changed) return event;
  return dayLost ? { ...event, options, dayLost } : { ...event, options };
}

// ── Program facts ───────────────────────────────────────────────────────────

/**
 * What the program still owes and who is on it, for content that has to fit
 * the day: a shortcut about the planting contract when every block is in the
 * ground, or "the surveyor quit" with an accredited surveyor on the crew,
 * reads as nonsense (js/data/illegalActs.js `onlyWhen`). Plain numbers and
 * flags, safe to read on any journey; a journey with no program reads as
 * nothing owed.
 * @param {Object} journey
 * @returns {{
 *   plantingRemaining: number,      // trees still to plant on this year's blocks
 *   blocksRemaining: number,        // this year's blocks not yet planted out
 *   fillRemaining: number,          // last year's openings still below MSS
 *   releaseQueueRemaining: number,  // ha of release still untreated
 *   surveysRemaining: number,       // free-growing declarations still owed
 *   seedlingsOnHand: number,        // trees in the reefer
 *   plantersOnStandDown: boolean,   // no planting crew can work today
 *   surveyorOnCrew: boolean,        // your own accredited surveyor is active
 *   accreditedSurveyor: boolean,    // any accredited surveyor, crew or contractor
 *   firstAidAttendant: boolean,     // your own OFA 3 is active
 *   sprayClosed: boolean,           // glyphosate is off the table this season
 * }}
 */
export function getSilvicultureFacts(journey) {
  const program = journey?.program || {};
  const blocks = Array.isArray(program.blocks) ? program.blocks : [];
  const crew = journey?.crew || [];
  const contractors = journey?.contractors || [];
  const resting = (contractor) => contractor.silvicultureState?.status === 'recovering'
    || contractor.silvicultureState?.cooldownDays > 0;
  const planters = contractors.filter((contractor) => contractor.specialty === 'planting');
  const surveyorOnCrew = crewHasRole(crew, 'surveyor');
  return {
    plantingRemaining: blocks.reduce((sum, block) => sum + Math.max(0, (block.trees || 0) - (block.planted || 0)), 0),
    blocksRemaining: Math.max(0, (journey?.planting?.blocksToPlant || 0) - (journey?.planting?.blocksPlanted || 0)),
    fillRemaining: (program.fill || []).filter((opening) => !opening.done).length,
    releaseQueueRemaining: Math.round((program.brush || []).reduce((sum, opening) => sum + Math.max(0, opening.ha - opening.treated), 0)),
    surveysRemaining: Math.max(0, (journey?.surveys?.freeGrowingTarget || 0) - (journey?.surveys?.freeGrowingComplete || 0)),
    seedlingsOnHand: Math.max(0, Number(journey?.resources?.seedlings) || 0),
    plantersOnStandDown: planters.length > 0 && planters.every(resting),
    surveyorOnCrew,
    accreditedSurveyor: surveyorOnCrew || contractors.some((contractor) => matchesSilvicultureTask(contractor, 'survey')),
    firstAidAttendant: hasActiveFirstAidAttendant(crew),
    sprayClosed: Boolean(journey && getReleaseAccess(journey).sprayClosed),
  };
}

// ── Casualties ─────────────────────────────────────────────────────────────

/**
 * Situations where the one hurt is a contractor's worker. Your crew checks,
 * surveys, drives and patches; it does not run the saws.
 */
const CONTRACTOR_CASUALTY_EVENTS = { chainsaw_cut: 'brushing' };

/** Each band's crew effect, with the text that narrates it. */
const CREW_EFFECT_BANDS = [
  ['crewEffect', 'outcome'],
  ['partialCrewEffect', 'partialOutcome'],
  ['failureCrewEffect', 'failureOutcome'],
];

function hurtsSomeone(crewEffect) {
  return Boolean(crewEffect && (crewEffect.injury || crewEffect.evacuate));
}

/** How they go out, read from the band's own words rather than drawn at random. */
function describeDeparture(text, withAttendant) {
  if (/helicopter|medevac|air ambulance|flown|flight/i.test(text)) return '{name} is flown out. WorkSafeBC is notified and the shift stops.';
  if (/\bETV\b/.test(text)) {
    return withAttendant
      ? '{name} goes out in the ETV with the attendant. WorkSafeBC gets the call from the truck.'
      : '{name} goes out in the ETV. WorkSafeBC gets the call from the truck.';
  }
  if (/supply run|to town|driven|truck/i.test(text)) return '{name} is driven to town. The doctor pulls them for the season.';
  return '{name} is off the crew for the season. WorkSafeBC is notified.';
}

function roleOf(member) {
  return SILVICULTURE_CREW_ROLES.find((role) => role.id === member?.role) || null;
}

/**
 * The day's injury card, fitted to who is actually on the block. The one hurt
 * is named once, on the day's dice, and every band lands on them: a saw
 * kickback is one of the brushing contractor's cutters, anything else is one
 * of your own crew (the attendant only when nobody else is out there). The
 * way they leave follows the option taken: a medevac is flown out, not sent
 * off in the ETV. With your own attendant gone the options stop calling on
 * them. The authored event is left alone.
 * @param {Object} journey
 * @param {Object|null} event - already fitted by adaptEventForProgram
 * @returns {Object|null}
 */
export function fitEventToCrew(journey, event) {
  if (!Array.isArray(event?.options)) return event;
  const crew = journey.crew || [];
  const attendant = hasActiveFirstAidAttendant(crew);
  const rename = (text) => (attendant || typeof text !== 'string'
    ? text
    : text.replace(/\b([Tt])he OFA 3\b/g, (match, t) => `${t}he contractor's attendant`));
  const hurts = event.options.some((option) => CREW_EFFECT_BANDS.some(([key]) => hurtsSomeone(option?.[key])));
  if (!hurts && attendant) return event;

  const rng = getDayRng(journey, `casualty:${event.id || 'event'}`);
  const outfit = CONTRACTOR_CASUALTY_EVENTS[event.id];
  const contractor = hurts && outfit
    ? (journey.contractors || []).filter((c) => c.specialty === outfit).sort((a, b) => Number(b.isActive) - Number(a.isActive))[0] || null
    : null;
  const active = crew.filter((member) => member.isActive);
  const field = active.filter((member) => member.role !== 'medic');
  const pool = field.length ? field : active;
  const victim = hurts && !contractor && pool.length ? pool[Math.floor(rng() * pool.length)] : null;

  const fitted = { ...event };
  if (contractor) {
    const who = `one of ${possessive(contractor.name)} cutters`;
    fitted.description = /^A saw kicks back on the block\./.test(event.description || '')
      ? event.description.replace(/^A saw kicks back on the block\./, `A saw kicks back on the block: ${who}.`)
      : `${event.description || ''} It is ${who}.`.trim();
  } else if (victim) {
    const noun = roleOf(victim)?.noun || 'crew';
    fitted.description = String(event.description || '').replace(/^A crew member\b/, `${victim.name}, your ${noun},`);
  }
  fitted.options = event.options.map((option) => {
    if (!option) return option;
    const copy = { ...option };
    for (const key of ['label', 'outcome', 'partialOutcome', 'failureOutcome', 'description']) {
      if (typeof option[key] === 'string') copy[key] = rename(option[key]);
    }
    for (const [key, textKey] of CREW_EFFECT_BANDS) {
      const crewEffect = option[key];
      if (!hurtsSomeone(crewEffect)) continue;
      if (contractor) {
        const { injury: _injury, evacuate, ...rest } = crewEffect;
        copy[key] = { ...rest, contractorCasualty: contractor.id, evacuated: Boolean(evacuate) };
      } else if (victim) {
        const withAttendant = attendant && victim.role !== 'medic';
        copy[key] = { ...crewEffect, victimId: victim.id, departure: describeDeparture(String(option[textKey] || option.outcome || ''), withAttendant) };
      }
    }
    return copy;
  });
  return fitted;
}

/**
 * A contractor's worker hurt on the day's card: the outfit runs short. Read
 * from the band the event resolved to (its log line).
 * @param {Object} journey
 * @param {Object} event - the card as fitted by fitEventToCrew
 * @returns {string|null} the day note, or null when no contractor was hurt
 */
export function settleContractorCasualty(journey, event) {
  const entry = (journey.log || []).at(-1);
  if (!entry || entry.setAside || entry.eventId !== event?.id || entry.day !== journey.day) return null;
  const option = (event.options || []).find((candidate) => candidate?.label === entry.optionLabel);
  if (!option) return null;
  const crewEffect = entry.band === 'partial' ? option.partialCrewEffect
    : entry.band === 'bad' ? option.failureCrewEffect
      : option.crewEffect;
  if (!crewEffect?.contractorCasualty) return null;
  const contractor = (journey.contractors || []).find((c) => c.id === crewEffect.contractorCasualty);
  if (!contractor) return null;
  const loss = crewEffect.evacuated ? 8 : 4;
  contractor.productivity = Math.max(20, contractor.productivity - loss);
  contractor.morale = Math.max(0, contractor.morale - 5);
  return crewEffect.evacuated
    ? `${possessive(contractor.name)} cutter is out for the season; the saw crews run a hand short (productivity -${loss}, morale -5).`
    : `${possessive(contractor.name)} cutter is on light duty; the saw crews run light for a while (productivity -${loss}, morale -5).`;
}

/**
 * What the crew can no longer do with this person gone, and the way back:
 * a replacement from town, on the day card.
 * @param {Object} member - evacuated or quit
 * @returns {string|null}
 */
export function describeLostCrewRole(member) {
  const role = roleOf(member);
  if (!role?.lost) return null;
  const cost = SILVICULTURE_REPLACEMENT_COST[role.id];
  return `${member.name} was your ${role.noun}. ${role.lost} A replacement can come up from town: a day and ${formatMoney(cost)}.`;
}

/** Roles on the crew with nobody left to fill them. */
function getVacantCrewRoles(journey) {
  const crew = journey.crew || [];
  return SILVICULTURE_CREW_ROLES.filter((role) => crew.some((member) => member.role === role.id && !member.isActive)
    && !crewHasRole(crew, role.id));
}

/** Why the program cannot bring a replacement up, or null when it can. */
function describeUnaffordableReplacement(journey, role) {
  const cost = SILVICULTURE_REPLACEMENT_COST[role.id];
  const budget = Number(journey.resources?.budget) || 0;
  if (budget >= cost) return null;
  return `The program cannot carry a replacement ${role.noun}: ${formatMoney(cost)} against ${formatMoney(Math.max(0, budget))} left.`;
}

/** Bring a replacement for a vacant role up from town. Spends the day. */
function handleCrewReplacement(game, roleId) {
  const { ui, journey } = game;
  const role = SILVICULTURE_CREW_ROLES.find((candidate) => candidate.id === roleId);
  if (!role || crewHasRole(journey.crew || [], roleId)) return false;
  const cost = SILVICULTURE_REPLACEMENT_COST[roleId];
  const unaffordable = describeUnaffordableReplacement(journey, role);
  if (unaffordable) return holdChosenTask(ui, journey, `replace:${roleId}`, unaffordable);
  journey.resources.budget -= cost;
  const replacement = generateCrewMember('field', role);
  const names = new Set(journey.crew.map((member) => member.name));
  let guard = 0;
  while (names.has(replacement.name) && guard++ < 20) replacement.name = generateCrewMember('field', role).name;
  journey.crew.push(replacement);
  ui.writeHeader('REPLACEMENT');
  ui.writePositive(`You drive to town and bring ${replacement.name} back up, ${role.noun}. ${formatMoney(cost)} on the program.`);
  if (roleId === 'medic') ui.write('Your own first aid coverage and the ETV are back on the block.');
  return true;
}

/**
 * Whether setting this situation aside still costs the day. An imposed
 * situation lands its cheapest answer when it is set aside
 * (js/events/deferral.js); when that answer is a day's work, keeping the day
 * made walking away cheaper than dealing with it: a washed-out road set
 * aside cost the bypass's dollars and equipment and left the day free for
 * plots. The day now goes with the rest of it.
 * @param {Object} journey
 * @param {Object} event - the day's situation, fitted to the program
 * @returns {boolean}
 */
export function setAsideCostsTheDay(journey, event) {
  if (!event || event.type === 'temptation') return false;
  if (event.dayLost) return true;
  const budgetBase = Number(journey.budgetStart) > 0 ? journey.budgetStart : journey.resources?.budget;
  const deferred = pickDeferredCost(event, situationWeight(event), { budgetBase, journey });
  return Boolean(deferred && optionSpendsDay(event, deferred.option, journey.journeyType));
}

/**
 * A shortcut the day's situation just took goes on the integrity ledger.
 * Two falsifications on file and the licensee pulls you off the program.
 * @returns {boolean} whether the run ended
 */
function settleShortcut(journey, event) {
  if (!recordTemptationOutcome(journey, event)) return false;
  return pullProgramIfFalsified(journey);
}

/**
 * Enough falsified records on file and the program is not delivered, however
 * much of it is in the ground: the declarations it rests on are under review.
 * @returns {boolean} whether the program was pulled
 */
function pullProgramIfFalsified(journey) {
  if (!summarizeIntegrity(journey).programPulled) return false;
  if (journey.isGameOver && !journey.isComplete) return true;
  journey.isComplete = false;
  journey.endReason = null;
  journey.isGameOver = true;
  // The debrief opens with this reason; printing it here as well put it on
  // screen twice.
  journey.gameOverReason = 'C&E has falsified records with your signature on them. The licensee pulls you off the program and your declarations go under review.';
  return true;
}

/** The district's check on the season's file, once, when the season ends. */
function closeOutSeason(journey, ui) {
  const lines = runSeasonCloseAudit(journey);
  if (!lines.length) return;
  ui.write('');
  ui.writeHeader('SEASON CLOSE: DISTRICT CHECK');
  for (const line of lines) ui.writeWarning(line);
  if (pullProgramIfFalsified(journey)) ui.writeDanger('The district now holds falsified records with your signature on them.');
}

/**
 * Nothing left that can move any track, and the resources to finish are gone.
 */
function isSilvicultureUnwinnable(journey) {
  const remainingBlocks = journey.planting.blocksToPlant - (journey.planting.blocksPlanted || 0);
  const remainingBrush = journey.brushing.hectaresTarget - journey.brushing.hectaresComplete;
  const remainingSurveys = journey.surveys.freeGrowingTarget - journey.surveys.freeGrowingComplete;
  const remainingFill = (journey.program?.fill || []).filter((opening) => !opening.done).length;
  const stillHasWorkToDo = remainingBlocks > 0 || remainingBrush > 0 || remainingSurveys > 0 || remainingFill > 0;
  if (!stillHasWorkToDo) return false;

  const capacityExhausted = journey.resources.contractorCapacity <= 0 && (remainingBlocks > 0 || remainingBrush > 0 || remainingFill > 0);
  const seedlingsExhausted = journey.resources.seedlings <= 0 && journey.planting.seedlingsPlanted < journey.planting.seedlingsAllocated;
  // The cheapest step left is a survey day; below that nothing can move.
  const budgetCantAffordNextStep = journey.resources.budget < SURVEY_DAY_RATE && stillHasWorkToDo;

  return capacityExhausted || seedlingsExhausted || budgetCantAffordNextStep;
}

function getSilvicultureZoneProfile(journey, silvicultureState = null) {
  const area = journey?.area || null;
  const briefing = getRoleAreaBriefing('silviculture', area, { maxFinds: 4 });
  const tags = new Set(Array.isArray(area?.tags) ? area.tags : []);
  const becCode = String(area?.becCode || '').toLowerCase();
  const discoveryIds = new Set(getJourneyDiscoveryTags(journey).map((tag) => tag.id));
  const likelyFinds = briefing.likelyFinds.slice(0, 2);
  const pressure = {
    survivalPenalty: 0,
    fillPressure: 0,
    brushPressure: 0,
    surveyPressure: 0,
    accessPressure: 0,
  };
  // Why survival suffers here: 'wet' (peat and seepage), 'drought' (drybelt
  // south aspects) or 'cold' (frost pockets and short seasons).
  let survivalCause = null;

  if (tags.has('peatland') || tags.has('wetland') || becCode.startsWith('bwbs')) {
    pressure.survivalPenalty += 0.05;
    pressure.fillPressure += 0.06;
    survivalCause = 'wet';
  }

  if (becCode.startsWith('idf')) {
    // Drybelt: summer drought on the south aspects kills more seedlings than
    // brush does, and fill planting chases the dead spots.
    pressure.survivalPenalty += 0.03;
    survivalCause = 'drought';
  } else if (becCode.startsWith('ich')) {
    // Wetbelt: alder and thimbleberry come back hard in the cedar seepage.
    pressure.brushPressure += 0.05;
  } else if (becCode.startsWith('cwh')) {
    // Coast: salmonberry and red alder outgrow a seedling in two seasons.
    pressure.brushPressure += 0.06;
  }

  if (tags.has('karst') || tags.has('salmon') || tags.has('community-water')) {
    pressure.surveyPressure += 0.05;
    pressure.accessPressure += 0.04;
  }

  if (tags.has('remote-camps') || tags.has('winter-road') || tags.has('glacial')) {
    pressure.accessPressure += 0.08;
    pressure.surveyPressure += 0.04;
  }

  if (tags.has('wildfire') || tags.has('beetle-recovery')) {
    pressure.brushPressure += 0.07;
    pressure.surveyPressure += 0.03;
  }

  if (tags.has('community-interface') || tags.has('visuals')) {
    pressure.brushPressure += 0.03;
    pressure.surveyPressure += 0.03;
  }

  if (becCode.startsWith('swb')) {
    pressure.survivalPenalty += 0.04;
    pressure.accessPressure += 0.04;
    survivalCause ||= 'cold';
  }

  if (discoveryIds.has('regen_gap')) {
    pressure.survivalPenalty += 0.05;
    pressure.fillPressure += 0.08;
    pressure.surveyPressure += 0.04;
  }
  if (discoveryIds.has('watershed_watch')) {
    pressure.surveyPressure += 0.04;
    pressure.accessPressure += 0.03;
  }
  if (discoveryIds.has('access_rehab') || discoveryIds.has('winter_access') || discoveryIds.has('heli_access')) {
    pressure.accessPressure += 0.05;
  }
  if (discoveryIds.has('smoke_pressure')) {
    pressure.brushPressure += 0.05;
    pressure.surveyPressure += 0.03;
  }
  if (discoveryIds.has('community_visibility')) {
    pressure.brushPressure += 0.02;
    pressure.surveyPressure += 0.03;
  }

  const summaryPieces = [];
  if (pressure.accessPressure > 0.08) summaryPieces.push('access is tight');
  if (pressure.survivalPenalty > 0.04 || survivalCause === 'drought') {
    summaryPieces.push(SURVIVAL_CAUSE_SUMMARY[survivalCause] || 'survival is less forgiving');
  }
  if (pressure.fillPressure > 0.05) summaryPieces.push('fill planting will matter');
  if (pressure.brushPressure > 0.05) summaryPieces.push('brush pressure is high');
  if (pressure.surveyPressure > 0.05) summaryPieces.push('survey credibility is under more scrutiny');

  const summary = summaryPieces.length
    ? `Zone pressure: ${summaryPieces.join('; ')}.`
    : briefing.zoneSummary || 'Zone pressure: standard silviculture ground.';

  if (silvicultureState) {
    silvicultureState.zonePressure = pressure;
  }

  return {
    ...pressure,
    survivalCause,
    summary,
    likelyFinds,
    zoneSummary: briefing.zoneSummary || '',
  };
}

const SURVIVAL_CAUSE_SUMMARY = {
  wet: 'wet microsites make survival less forgiving',
  drought: 'summer drought on the south aspects will cost survival',
  cold: 'frost pockets and a short season make survival less forgiving',
};

const SURVIVAL_CAUSE_PLOT_NOTE = {
  wet: 'Wet microsites cost spacing and depth on this ground',
  drought: 'Dry south aspects cost spacing: the planters hunt shade and mineral soil on this ground',
  cold: 'Frost pockets cost spacing: the planters hunt raised microsites on this ground',
};

function getScrutinyLabel(journey) {
  return Number.isFinite(Number(journey?.scrutiny))
    ? 'Scrutiny'
    : Number.isFinite(Number(journey?.heat))
      ? 'Heat'
      : 'Scrutiny';
}

function getScrutinyPressure(journey) {
  const scrutiny = Number(journey?.scrutiny);
  if (Number.isFinite(scrutiny)) {
    return Math.max(0, scrutiny);
  }
  const heat = Number(journey?.heat);
  if (Number.isFinite(heat)) {
    return Math.max(0, heat);
  }
  return 0;
}

function adjustScrutiny(journey, delta) {
  if (!Number.isFinite(delta) || delta === 0) {
    return;
  }

  if (Number.isFinite(Number(journey?.scrutiny))) {
    journey.scrutiny = Math.max(0, Math.min(100, Number(journey.scrutiny) + delta));
    return;
  }

  if (Number.isFinite(Number(journey?.heat))) {
    journey.heat = Math.max(0, Math.min(100, Number(journey.heat) + delta));
  }
}

function adjustCompliance(journey, delta) {
  if (!journey || !Number.isFinite(delta) || delta === 0) return;
  if (journey.metrics && Number.isFinite(Number(journey.metrics.compliance))) {
    journey.metrics.compliance = Math.max(0, Math.min(100, Number(journey.metrics.compliance) + delta));
  }
  // A silviculture journey keeps no compliance meter of its own; the loss
  // lands where event outcomes put it, the standing ledger the season
  // review reads. It used to land nowhere.
  journey.standingLedger ||= { relationships: 0, compliance: 0 };
  journey.standingLedger.compliance = (Number(journey.standingLedger.compliance) || 0) + delta;
}

/**
 * Relationship standing lands where the campaign's season review reads it
 * (the same ledger event outcomes write, js/events/resolution.js), and on
 * the relationship meter when the journey carries one.
 */
function adjustRelationships(journey, delta) {
  if (!journey || !Number.isFinite(delta) || delta === 0) return;
  if (journey.metrics && Number.isFinite(Number(journey.metrics.relationships))) {
    journey.metrics.relationships = Math.max(0, Math.min(100, Number(journey.metrics.relationships) + delta));
  }
  journey.standingLedger ||= { relationships: 0, compliance: 0 };
  journey.standingLedger.relationships = (Number(journey.standingLedger.relationships) || 0) + delta;
}

// ── Contractors ─────────────────────────────────────────────────────────────

/** "Mountain Pine Planters — 12 planters · $0.32/tree · quality 94% (2% holdback)" */
function describeContractorEconomics(contractor) {
  if (!contractor) return '';
  const specialty = String(contractor.specialty || '').toLowerCase();
  if (specialty === 'planting') {
    return `${contractor.planters || contractor.crewSize} planters · $${(Number(contractor.pricePerTree) || 0).toFixed(2)}/tree · quality ${contractor.qualityPct}% (${contractor.holdbackPct}% holdback)`;
  }
  if (specialty === 'brushing') {
    return `${contractor.sawCrews || 4} saw crews · $${contractor.ratePerHa}/ha manual, $${BRUSH_RATES.cylinder}/ha cylinder, $${contractor.herbicideRatePerHa}/ha glyphosate · ${contractorHasCert(contractor, 'PMP-applicator') ? 'PMP applicator' : 'no applicator ticket'}`;
  }
  return `${contractor.surveyors || 2} surveyors · $${(contractor.dayRate || SURVEY_DAY_RATE).toLocaleString()}/day · ${contractorHasCert(contractor, 'surveyor-accredited') ? 'accredited' : 'not accredited'}`;
}

function describeFit(contractor, zoneProfile, task) {
  const fit = getSilvicultureContractorFit(contractor, zoneProfile, task);
  const traits = contractor.silvicultureState?.traits || [];
  const flavour = traits.map((trait) => TRAIT_LABELS[trait]).filter(Boolean)[0];
  const grade = fit >= 1.05 ? 'strong' : fit >= 0.95 ? 'fair' : 'weak';
  return `site fit: ${grade}${flavour ? ` (${flavour})` : ''}`;
}

function getSilvicultureTaskSummary(journey, zoneProfile, task) {
  const contractors = getSilvicultureTaskContractors(journey, zoneProfile, task, false);
  const ready = journey.contractors.filter(c => {
    const state = ensureSilvicultureContractorState(c, journey, zoneProfile);
    return !c.isActive && state.status === 'ready' && matchesSilvicultureTask(c, task);
  });
  const offDays = journey.contractors.filter(c => {
    const state = ensureSilvicultureContractorState(c, journey, zoneProfile);
    return state.status === 'recovering' || state.cooldownDays > 0;
  }).length;
  const fitText = contractors.length
    ? contractors.map((contractor) => `${contractor.isActive ? 'on the block' : 'available, goes on the block'}: ${contractor.name} - ${describeContractorEconomics(contractor)} · ${describeFit(contractor, zoneProfile, task)}`).join('; ')
    : task === 'survey' && crewHasRole(journey.crew || [], 'surveyor')
      ? 'your accredited surveyor'
      : 'no available contractor';
  const counts = [ready.length ? `${ready.length} available` : null, offDays ? `${offDays} on days off` : null].filter(Boolean);
  return [fitText, ...counts].join(' | ');
}

function getSilvicultureContractorRoster(journey, zoneProfile) {
  const onBlock = [];
  const available = [];
  const offDays = [];

  for (const contractor of journey.contractors || []) {
    const state = ensureSilvicultureContractorState(contractor, journey, zoneProfile);
    const fitLabel = describeFit(contractor, zoneProfile, contractor.specialty === 'brushing' ? 'brush' : contractor.specialty === 'survey' ? 'survey' : 'plant');
    if (state.status === 'recovering' || state.cooldownDays > 0) {
      offDays.push(`${contractor.name}: days off (${state.cooldownDays || 1}d)`);
      continue;
    }
    if (contractor.isActive) {
      onBlock.push(`${contractor.name}: on the block - ${describeContractorEconomics(contractor)} · ${fitLabel}`);
      continue;
    }
    available.push(`${contractor.name}: available - ${describeContractorEconomics(contractor)} · ${fitLabel}`);
  }

  const lines = [...onBlock, ...available, ...offDays];
  const summary = `${onBlock.length} on the block, ${available.length} available, ${offDays.length} on days off`;
  const rotationSummary = onBlock.length > 0
    ? 'stand down or rest tired crews'
    : 'put available crews on the block';

  return { lines, summary, rotationSummary, rotatableCount: onBlock.length + available.length };
}

function getSilvicultureTaskContractors(journey, zoneProfile, task, deployMissing = true, ui = null) {
  const contractors = Array.isArray(journey?.contractors) ? journey.contractors : [];
  const taskTraits = CONTRACTOR_TASK_TRAITS[task] || [];
  const eligible = [];
  const ready = [];

  for (const contractor of contractors) {
    const state = ensureSilvicultureContractorState(contractor, journey, zoneProfile);
    if (state.status === 'recovering' || state.cooldownDays > 0) {
      continue;
    }

    const fit = getSilvicultureContractorFit(contractor, zoneProfile, task);
    const specialtyMatch = matchesSilvicultureTask(contractor, task);

    if (contractor.isActive && specialtyMatch) {
      eligible.push({ contractor, fit });
      continue;
    }

    if (!contractor.isActive && specialtyMatch) {
      ready.push({ contractor, fit });
    }
    // Each outfit works its own contract. A saw crew planting while the
    // planters were stood down billed at no contract rate, held nothing back
    // for plots, and broke the "no planting today" the call had just agreed.
  }

  const selected = eligible.length > 0
    ? eligible.sort((a, b) => b.fit - a.fit)
    : [...ready]
      .sort((a, b) => b.fit - a.fit)
      .slice(0, Math.max(1, Math.min(2, taskTraits.length > 0 ? 2 : 1)));
  if (deployMissing) {
    for (const entry of selected) {
      if (!entry.contractor.isActive) {
        deploySilvicultureContractor(entry.contractor, zoneProfile, task);
        ui?.writePositive?.(`${entry.contractor.name} goes on the block for this.`);
      }
    }
    if (selected.length > 0) {
      ui?.write?.(`Working crew: ${selected.map((entry) => entry.contractor.name).join(', ')}.`);
    }
  }
  return selected.map(entry => entry.contractor);
}

function matchesSilvicultureTask(contractor, task) {
  if (!contractor) {
    return false;
  }

  // Plant and fill are the planters' work alone.
  if (task === 'survey') {
    return (contractor.specialty === 'survey' || contractor.specialty === 'surveyor') && contractorHasCert(contractor, 'surveyor-accredited');
  }

  if (task === 'brush') {
    return contractor.specialty === 'brushing';
  }

  return contractor.specialty === 'planting';
}

function getSilvicultureContractorFit(contractor, zoneProfile, task) {
  const state = contractor.silvicultureState || {};
  const traits = Array.isArray(state.traits) ? state.traits : [];
  const fitTraits = CONTRACTOR_TASK_TRAITS[task] || CONTRACTOR_TASK_TRAITS.plant;
  let fit = 0.85;

  if (matchesSilvicultureTask(contractor, task)) {
    fit += 0.12;
  }

  for (const trait of traits) {
    if (fitTraits.includes(trait)) {
      fit += 0.05;
    }
  }

  if (zoneProfile?.accessPressure > 0.08 && traits.includes('remote-ready')) {
    fit += 0.04;
  } else if (zoneProfile?.accessPressure > 0.08) {
    fit -= 0.05;
  }

  if (zoneProfile?.brushPressure > 0.05 && (traits.includes('brush-specialist') || task === 'brush' || task === 'fill')) {
    fit += 0.05;
  }

  if (zoneProfile?.surveyPressure > 0.05 && (traits.includes('survey-minded') || traits.includes('process-cautious') || task === 'survey')) {
    fit += 0.06;
  }

  if (zoneProfile?.survivalPenalty > 0.04 && (traits.includes('wet-ground') || traits.includes('terrain-aware'))) {
    fit += 0.04;
  }

  if (zoneProfile?.likelyFinds?.some((find) => typeof find === 'string' && find.toLowerCase().includes('access'))) {
    fit += traits.includes('remote-ready') ? 0.03 : 0;
  }

  if (contractor.morale < 40) {
    fit -= 0.05;
  }
  if (state.fatigue > 3) {
    fit -= 0.08;
  }
  if (state.cooldownDays > 0) {
    fit -= 0.2;
  }

  return Math.max(0.55, Math.min(1.25, fit));
}

function ensureSilvicultureContractorState(contractor, journey, zoneProfile = null) {
  if (!contractor) {
    return null;
  }

  if (!contractor.silvicultureState) {
    contractor.silvicultureState = {
      status: contractor.isActive ? 'deployed' : 'ready',
      cooldownDays: 0,
      fatigue: 0,
      deploymentDays: 0,
      lastTask: null,
      traits: getSilvicultureContractorTraits(contractor, journey, zoneProfile),
      zoneFit: 1,
    };
  }

  contractor.silvicultureState.traits ||= getSilvicultureContractorTraits(contractor, journey, zoneProfile);
  if (contractor.silvicultureState.cooldownDays > 0) {
    contractor.silvicultureState.status = 'recovering';
    contractor.isActive = false;
  } else if (contractor.isActive) {
    contractor.silvicultureState.status = 'deployed';
  } else if (contractor.silvicultureState.status === 'recovering') {
    contractor.silvicultureState.status = 'ready';
  }

  return contractor.silvicultureState;
}

function getSilvicultureContractorTraits(contractor, journey, zoneProfile = null) {
  const traits = new Set();
  const specialty = String(contractor?.specialty || '').toLowerCase();
  const area = journey?.area || null;
  const briefing = zoneProfile || getSilvicultureZoneProfile(journey, null);
  const areaTags = new Set(Array.isArray(area?.tags) ? area.tags : []);
  const likelyFinds = Array.isArray(briefing?.likelyFinds) ? briefing.likelyFinds : [];

  if (specialty === 'planting') {
    traits.add('planting-specialist');
    traits.add('terrain-aware');
  } else if (specialty === 'brushing') {
    traits.add('brush-specialist');
    traits.add('heat-hard');
  } else if (specialty === 'survey' || specialty === 'surveyor' || specialty === 'spotter') {
    traits.add('survey-minded');
    traits.add('process-cautious');
  }

  if (areaTags.has('peatland') || areaTags.has('wetland') || likelyFinds.some((find) => /water|wet|muskeg/i.test(find))) {
    traits.add('wet-ground');
  }
  if (areaTags.has('remote-camps') || areaTags.has('winter-road') || areaTags.has('glacial') || likelyFinds.some((find) => /access|road|remote/i.test(find))) {
    traits.add('remote-ready');
  }
  if (areaTags.has('wildfire') || areaTags.has('beetle-recovery')) {
    traits.add('heat-hard');
    traits.add('brush-specialist');
  }
  if (areaTags.has('community-interface') || areaTags.has('visuals')) {
    traits.add('community-facing');
    traits.add('process-cautious');
  }
  if (areaTags.has('salmon') || areaTags.has('community-water') || areaTags.has('karst')) {
    traits.add('process-cautious');
    traits.add('terrain-aware');
  }

  return [...traits];
}

function deploySilvicultureContractor(contractor, zoneProfile, task = 'plant') {
  if (!contractor) {
    return;
  }

  contractor.isActive = true;
  const state = contractor.silvicultureState || {};
  state.status = 'deployed';
  state.cooldownDays = 0;
  state.lastTask = task;
  state.deploymentDays = 0;
  state.zoneFit = getSilvicultureContractorFit(contractor, zoneProfile, task);
  contractor.silvicultureState = state;
}

function startSilvicultureContractorRecovery(contractor, days = 1, reason = 'fatigue') {
  if (!contractor) {
    return;
  }

  const state = contractor.silvicultureState || {};
  state.status = 'recovering';
  state.cooldownDays = Math.max(Number.isFinite(state.cooldownDays) ? state.cooldownDays : 0, Math.max(1, days));
  state.lastTask = `recover:${reason}`;
  contractor.silvicultureState = state;
  contractor.isActive = false;
}

function tickSilvicultureContractorRecovery(journey, zoneProfile) {
  for (const contractor of journey.contractors || []) {
    const state = ensureSilvicultureContractorState(contractor, journey, zoneProfile);
    if (!state) {
      continue;
    }

    if (state.cooldownDays > 0) {
      state.cooldownDays -= 1;
      state.fatigue = Math.max(0, (state.fatigue || 0) - DAY_OFF_RECOVERY);
      if (state.cooldownDays <= 0) {
        state.cooldownDays = 0;
        state.status = 'ready';
        contractor.isActive = false;
        contractor.productivity = Math.min(100, contractor.productivity + 3);
        contractor.morale = Math.min(100, contractor.morale + 4);
      }
      continue;
    }

    if (!contractor.isActive && state.status === 'deployed') {
      state.status = 'ready';
    }
  }
}

function applySilvicultureContractorUsage(journey, contractors, zoneProfile, task) {
  if (!Array.isArray(contractors) || contractors.length === 0) {
    return;
  }

  const scrutinyPressure = getScrutinyPressure(journey);
  const taskPressure = zoneProfile?.accessPressure > 0.08 || zoneProfile?.surveyPressure > 0.05 || zoneProfile?.fillPressure > 0.05;

  for (const contractor of contractors) {
    if (!contractor) {
      continue;
    }

    const state = ensureSilvicultureContractorState(contractor, journey, zoneProfile);
    const fit = getSilvicultureContractorFit(contractor, zoneProfile, task);
    state.lastTask = task;
    state.lastWorkedDay = journey.day;
    state.zoneFit = fit;
    // A shift on the block: hard ground adds to it, a crew that suits the
    // ground carries it. Days off take it back off (DAY_OFF_RECOVERY).
    state.fatigue = Math.max(0, Math.min(6, (state.fatigue || 0) + 1 + (taskPressure ? 1 : 0) - (fit > 1.05 ? 1 : 0)));

    contractor.productivity = Math.max(20, Math.min(100, contractor.productivity + (fit > 1 ? 2 : -1)));
    contractor.morale = Math.max(0, Math.min(100, contractor.morale + (fit > 1 ? 1 : 0) - (state.fatigue >= 4 ? 1 : 0)));

    // The days off start tomorrow: the count includes tonight.
    if (state.fatigue >= 4 || contractor.morale < 30) {
      startSilvicultureContractorRecovery(contractor, (state.fatigue >= 5 ? 2 : 1) + 1, 'workload');
    } else if (scrutinyPressure > 0 && task === 'survey' && fit < 0.95) {
      adjustScrutiny(journey, 1);
    }
  }
}

async function handleContractorRotation(game, silvicultureState = null, zoneProfile = null) {
  const { ui, journey } = game;
  const activeState = silvicultureState || ensureSilvicultureState(journey);
  const pressure = zoneProfile || getSilvicultureZoneProfile(journey, activeState);
  // Contractors on days off cannot be rotated, so they are not offered.
  const options = (journey.contractors || [])
    .filter((contractor) => {
      const state = ensureSilvicultureContractorState(contractor, journey, pressure);
      return state.status !== 'recovering' && !(state.cooldownDays > 0);
    })
    .map((contractor) => {
      const state = ensureSilvicultureContractorState(contractor, journey, pressure);
      const task = contractor.specialty === 'brushing' ? 'brush' : contractor.specialty === 'survey' ? 'survey' : 'plant';
      const statusLabel = contractor.isActive ? 'on the block' : 'available';
      return {
        label: `${contractor.name} (${contractor.specialty})`,
        description: `${statusLabel} | ${describeFit(contractor, pressure, task)} | ${state.traits.slice(0, 2).map((trait) => TRAIT_LABELS[trait] || trait).join(', ') || 'general'}`,
        value: contractor.id,
      };
    });

  if (options.length === 0) {
    return holdChosenTask(ui, journey, 'rotation', 'No contractors are available to rotate right now.', 'write');
  }

  // Always offer a way out.
  options.push({
    label: 'Never mind',
    description: 'Leave the roster as-is.',
    value: 'cancel',
  });

  const choice = await ui.promptChoice('Adjust which contractor?', options);
  if (choice.value === 'cancel') {
    ui.write('Roster left as-is.');
    return false;
  }
  const contractor = journey.contractors.find((c) => c.id === choice.value);
  if (!contractor) {
    return false;
  }

  const state = ensureSilvicultureContractorState(contractor, journey, pressure);
  if (state.status === 'recovering' || state.cooldownDays > 0) {
    ui.writeWarning(`${contractor.name} is on days off for ${state.cooldownDays || 1} more day${(state.cooldownDays || 1) === 1 ? '' : 's'}.`);
    return false;
  }

  if (contractor.isActive) {
    const restDays = Math.max(1, Math.min(3, 1 + Math.floor((state.fatigue || 0) / 2) + (pressure.accessPressure > 0.08 ? 1 : 0)));
    const confirmChoice = await ui.promptChoice(
      `Stand down ${contractor.name}? They will be on days off for ${restDays} day${restDays > 1 ? 's' : ''}.`,
      [
        { label: `Confirm - stand down ${contractor.name}`, description: `Costs ${restDays} day${restDays > 1 ? 's' : ''} of availability.`, value: 'confirm' },
        { label: 'Never mind, keep them on the block', description: '', value: 'cancel' },
      ]
    );
    if (confirmChoice.value !== 'confirm') {
      ui.write(`${contractor.name} stays on the block.`);
      return false;
    }
    // The stand-down takes the rest of today; the days off start tomorrow.
    startSilvicultureContractorRecovery(contractor, restDays + 1, 'rotation');
    ui.write(`${contractor.name} is stood down for ${restDays} day${restDays > 1 ? 's' : ''} off.`);
    if (getScrutinyPressure(journey) > 0 && (pressure.surveyPressure > 0.05 || pressure.brushPressure > 0.05)) {
      adjustScrutiny(journey, -1);
    }
    return true;
  }

  // Calling a crew onto the block is a radio call, not the day's work: the
  // day still goes to whatever they are called on for.
  deploySilvicultureContractor(contractor, pressure, contractor.specialty === 'brushing' ? 'brush' : 'plant');
  ui.writePositive(`${contractor.name} goes back on the block.`);
  activeState.dayNotes?.push(`${contractor.name} called onto the block.`);
  // A crew on the block can change what the card holds back.
  activeState.heldToday = {};
  return false;
}
