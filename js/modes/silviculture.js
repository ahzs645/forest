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
import { runDaySituation } from '../journey/daySituation.js';
import { presentDayCard, formatStatusLine } from '../journey/dayCard.js';
import { getCurrentSeasonInfo, advanceDay as advanceSeasonDay, getSeasonModifiers } from '../season.js';
import { crewHasRole } from '../crew.js';
import { getOperationalProgress, recordProgressMilestones } from '../journey.js';
import { getRoleAreaBriefing } from '../data/roleAreaIntel.js';
import { addDiscoveryTags, getDiscoveryTagNotes, getJourneyDiscoveryTags } from '../data/discoveryTags.js';
import { getAreaSituationSummary } from '../data/areaSituations.js';
import { buildStandStrip } from '../scene/forest.js';
import { startDay, spendDay, dayIsSpent, dayPrompt, settleDayPass } from '../journey/dayPlan.js';
import { checkSilvicultureEndConditions } from './shared/endConditions.js';
import { getStockingStandard, describeStockingStandard } from '../data/stockingStandards.js';
import {
  buildSilvicultureProgram,
  ensureContractorEconomics,
  contractorHasCert,
  getCurrentPlantingBlock,
  getBlockAwaitingInspection,
  describeBlock,
  summarizeProgram,
  BRUSH_RATES,
  FILL_PRICE_PREMIUM,
  SURVEY_DAY_RATE,
  SUPERVISOR_OVERHEAD_PER_DAY,
} from '../data/silvicultureProgram.js';

// Contractor events. Each one is a call from a foreman that needs an answer
// before the crews go out; answering is brief and never spends the day.
const STAND_DOWN_REASONS = [
  'the danger rating went to Extreme at noon yesterday and the block is a hazard abatement file waiting to happen',
  'lightning is forecast on the ridge all afternoon and the crew is carrying steel',
  'smoke from the fire to the west has the air quality index past the crew\'s WorkSafeBC limit',
  'a grizzly with cubs is working the cache on the landing and nobody wants to be the second person to find her',
  'the heat warning has the humidex past 40 by mid-morning and two planters went down with heat stress yesterday',
];

const CONTRACTOR_EVENTS = [
  {
    id: 'camp_demand',
    trigger: (c) => c.morale < 60,
    title: 'Camp Conditions',
    getText: (c) => `${c.name}'s foreman calls from the camp: the cook shack water test came back cloudy, the drying tent leaks, and the crew is talking about it. They want the camp brought up before the next shift.`,
    options: [
      { label: 'Upgrade the camp ($3,000)', description: 'Water, a real drying tent, a second hand-wash station', value: 'pay', cost: 3000, moraleGain: 15, prodGain: 5 },
      { label: 'Tell them the camp meets the standard', description: 'It does, on paper', value: 'deny', cost: 0, moraleGain: -15, prodGain: -5 },
    ],
  },
  {
    id: 'quality_dispute',
    trigger: (c) => c.specialty === 'planting',
    title: 'Planting Quality Dispute',
    getText: (c) => `Your checker's plots on yesterday's block came in wide on spacing with J-roots in the wet ground. ${c.name}'s foreman says the plots are wrong, the ground is wrong, and the holdback should be released today.`,
    options: [
      { label: 'Re-plot with the foreman and retrain the crew', description: 'A morning of quality plots; the crew fixes what the plots find', value: 'inspect', cost: 0, moraleGain: -5, prodGain: 10, qualityLift: 3 },
      { label: 'Sign the foreman\'s numbers and release the holdback', description: 'Signing plot cards you did not walk is a false record; scrutiny climbs and the next inspection reads it', value: 'slide', cost: 0, moraleGain: 5, prodGain: 0, fraud: true },
    ],
  },
  {
    id: 'crew_illness',
    trigger: () => Math.random() < 0.3,
    title: 'Sickness in Camp',
    getText: (c) => `Several planters from ${c.name} are down with a stomach bug and the rest are eating standing up. The foreman thinks it is the water; the cook thinks it is the foreman.`,
    options: [
      { label: 'Call a camp inspection ($800)', description: 'Water test, kitchen, hand-wash stations; the crew works a short day', value: 'inspect_camp', cost: 800, moraleGain: 5, prodGain: 0 },
      { label: 'Stand the camp down for a day', description: 'No planting; the bug runs its course', value: 'rest', cost: 0, moraleGain: 8, prodGain: 0 },
      { label: 'Push through', description: 'Trees in the ground either way', value: 'push', cost: 0, moraleGain: -10, prodGain: -10 },
    ],
  },
  {
    id: 'stand_down',
    trigger: (c) => c.specialty === 'planting' || c.specialty === 'brushing',
    title: 'Stand-Down Call',
    getText: (c) => `${c.name}'s foreman calls a stand-down: ${STAND_DOWN_REASONS[Math.floor(Math.random() * STAND_DOWN_REASONS.length)]}. Planters plant in rain; this is not rain.`,
    options: [
      { label: 'Back the stand-down', description: 'Crew off the block today; the tailgate meeting covers it tomorrow', value: 'rest', cost: 0, moraleGain: 10, prodGain: 0 },
      { label: 'Keep them on the block', description: 'Production today; a WorkSafeBC prevention officer would call it differently', value: 'push', cost: 0, moraleGain: -8, prodGain: -5, scrutiny: 1 },
    ],
  },
  {
    id: 'reprice',
    trigger: (c) => c.productivity > 85 && c.specialty === 'planting',
    title: 'Contractor Wants to Split the Crew',
    getText: (c) => `${c.name} has a coastal contract starting early. They want to release half the crew to it and re-price the remaining trees on your program at +$0.04/tree for a smaller crew that stays.`,
    options: [
      { label: 'Accept the re-price (+$0.04/tree)', description: 'Full crew stays; every tree left in the program costs four cents more', value: 'pay', cost: 0, moraleGain: 10, prodGain: 5, priceLift: 0.04 },
      { label: 'Hold them to the contract price', description: 'Half the crew leaves for the coast; daily output drops', value: 'wait', cost: 0, moraleGain: -5, prodGain: -10, plantersLost: 0.4 },
    ],
  },
];

const CONTRACTOR_TASK_TRAITS = {
  plant: ['planting-specialist', 'wet-ground', 'remote-ready', 'terrain-aware'],
  fill: ['planting-specialist', 'brush-specialist', 'wet-ground', 'terrain-aware'],
  brush: ['brush-specialist', 'heat-hard', 'remote-ready', 'terrain-aware'],
  survey: ['survey-minded', 'process-cautious', 'community-facing', 'remote-ready'],
};

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

  // Daily contractor productivity and morale drift.
  for (const contractor of journey.contractors) {
    const contractorState = ensureSilvicultureContractorState(contractor, journey, zoneProfile);
    const fit = getSilvicultureContractorFit(contractor, zoneProfile, 'plant');

    if (contractorState.status === 'recovering') {
      contractor.productivity = Math.min(100, contractor.productivity + (fit > 1 ? 2 : 1));
      contractor.morale = Math.min(100, contractor.morale + 2);
      continue;
    }

    if (contractor.isActive) {
      const productivityDecay = currentSeason === 'summer' ? 3 : 2;
      const moraleDecay = currentSeason === 'summer' ? 2 : 1;
      const accessDrag = zoneProfile.accessPressure > 0.12 ? 1 : 0;
      const fitDrag = fit < 0.9 ? 1 : 0;
      contractor.productivity = Math.max(20, contractor.productivity - productivityDecay - (vegetationPressure > 0.25 ? 1 : 0) - accessDrag - fitDrag);
      contractor.morale = Math.max(0, contractor.morale - moraleDecay - accessDrag - (fit < 0.85 ? 1 : 0));
      contractorState.deploymentDays = (contractorState.deploymentDays || 0) + 1;
      contractorState.fatigue = Math.min(6, (contractorState.fatigue || 0) + 1 + (accessDrag ? 1 : 0));
      contractorState.status = 'deployed';
      contractorState.zoneFit = fit;
      if (contractorState.fatigue >= 4 || contractor.morale <= 28) {
        startSilvicultureContractorRecovery(contractor, contractorState.fatigue >= 5 ? 2 : 1, 'fatigue');
      }
    } else {
      contractorState.status ||= contractorState.cooldownDays > 0 ? 'recovering' : 'ready';
    }
  }

  // Supervisor overhead: truck, camp, radio, your time.
  journey.resources.budget -= SUPERVISOR_OVERHEAD_PER_DAY;
  if (journey.day === 1) {
    ui.write(`Supervisor overhead runs $${SUPERVISOR_OVERHEAD_PER_DAY}/day against the program budget (truck, camp, radio, your time). Contractors invoice per tree and per hectare on top of it.`);
  }

  // Contractor call before the crews go out (never on day 1).
  const activeContractors = journey.contractors.filter(c => c.isActive);
  const contractorStress = activeContractors.some(c => c.morale < 55 || c.productivity < 60);
  if (journey.day > 1 && Math.random() < (contractorStress ? 0.40 : 0.30)) {
    if (activeContractors.length > 0) {
      const targetContractor = activeContractors[Math.floor(Math.random() * activeContractors.length)];
      const applicableEvents = CONTRACTOR_EVENTS.filter(e => e.trigger(targetContractor));
      if (applicableEvents.length > 0) {
        const cEvent = applicableEvents[Math.floor(Math.random() * applicableEvents.length)];
        await handleContractorEvent(game, cEvent, targetContractor);
        if (game.gameOver) return;
      }
    }
  }

  // The day's situation. Day 1 stays event-free so the program loop is
  // legible before disruptions begin.
  const event = journey.day > 1 ? checkForEvent(journey) : null;
  if (event) {
    const outcome = await runDaySituation(game, event, {
      frame: {
        dayHeader: buildSilvicultureDayHeader(journey),
        statusLine: buildSilvicultureStatusLine(journey),
        onRender: () => updateSilvicultureMissionStatus(ui, journey, seasonInfo, zoneProfile),
      },
      setAsideDescription: 'Not today. Keep the day for the program.',
    });
    if (outcome.gameOver) return;
    if (outcome.spendsDay) spendDay(journey);
  }

  const seasonMods = journey.season
    ? getSeasonModifiers(currentSeason, 'silviculture')
    : {};

  // Zombie-tail tracking: a day that opens with nothing that can move any
  // of the five tracks counts toward calling an unwinnable run.
  const advancingActionValues = new Set(['plant', 'fill', 'brush', 'survey', 'inspect']);
  const dayOpeningOptions = buildSilvicultureActions(journey, currentSeason, seasonMods, silvicultureState, zoneProfile);
  const hasAdvancingAction = dayOpeningOptions.some((option) => advancingActionValues.has(option.value));
  silvicultureState.zombieDays = hasAdvancingAction ? 0 : (silvicultureState.zombieDays || 0) + 1;

  const freeChoices = { count: 0 };
  while (!dayIsSpent(journey)) {
    const actionOptions = buildSilvicultureActions(journey, currentSeason, seasonMods, silvicultureState, zoneProfile);

    const actionId = await presentDayCard(ui, {
      dayHeader: buildSilvicultureDayHeader(journey),
      statusLine: buildSilvicultureStatusLine(journey),
      label: 'MORNING CHECK-INS',
      title: buildSilvicultureQuietTitle(journey, seasonInfo),
      body: buildSilvicultureQuietBody(journey, seasonInfo, silvicultureState),
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

  if (!journey.isComplete && !journey.isGameOver &&
      (silvicultureState.zombieDays || 0) >= 4 &&
      isSilvicultureUnwinnable(journey)) {
    journey.isGameOver = true;
    journey.gameOverReason = 'The program can no longer reach its targets - the season is called.';
  }

  ui.updateAllStatus(journey);

  // Milestones read oddly on the winning day ("last declaration in sight"
  // after the last declaration), so they are recorded but not printed then.
  const milestoneMessages = [];
  recordProgressMilestones(journey, progressBeforeDay, milestoneMessages, Math.max(1, journey.day - 1));
  if (!journey.isComplete) {
    for (const message of milestoneMessages) {
      ui.writePositive(message);
    }
  }

  const nextSeasonInfo = journey.season ? getCurrentSeasonInfo(journey.season) : null;
  const contractorHint = journey.contractors.filter(c => c.isActive && c.morale < 40).length;
  const continueLabel = contractorHint > 0
    ? `Continue... (Day ${journey.day}, ${nextSeasonInfo?.name || ''}, ${contractorHint} unhappy contractor${contractorHint > 1 ? 's' : ''})`
    : `Continue... (Day ${journey.day}, ${nextSeasonInfo?.name || ''})`;
  await ui.promptChoice('', [{ label: continueLabel, value: 'next' }]);
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
    `budget $${Math.round((journey.resources.budget || 0) / 1000)}k`,
  ]);
}

function buildSilvicultureQuietTitle(journey, seasonInfo) {
  const activeContractors = (journey.contractors || []).filter((c) => c.isActive);
  const readyContractors = (journey.contractors || []).filter((c) => {
    const state = ensureSilvicultureContractorState(c, journey, getSilvicultureZoneProfile(journey));
    return !c.isActive && state.status === 'ready';
  });
  if (seasonInfo?.id === 'winter') return 'FROZEN GROUND';
  if (getBlockAwaitingInspection(journey.program)) return 'PLOT CARDS BEFORE PLANTING';
  if (activeContractors.length === 0 && readyContractors.length > 0) return 'CREWS AVAILABLE';
  if (activeContractors.length === 0) return 'NOBODY ON THE GROUND';
  if (activeContractors.some((c) => c.morale < 40)) return 'A SHORT-TEMPERED CHECK-IN';
  if (getVegetationPressure(journey) > 0.25) return 'BRUSH COMING UP FAST';
  if ((journey.resources.budget || 0) < 15000) return 'THIN IN THE ACCOUNT';
  return 'ALL CREWS ACCOUNTED FOR';
}

function buildSilvicultureQuietBody(journey, seasonInfo, silvicultureState) {
  const activeContractors = (journey.contractors || []).filter((c) => c.isActive);
  const unhappy = activeContractors.find((c) => c.morale < 40);
  const parts = [];

  if (seasonInfo?.id === 'winter') {
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
  } else {
    parts.push('The foremen call in one by one and none of them has a problem for you. Whatever today is, it is yours to decide.');
  }

  if (seasonInfo?.id !== 'winter') {
    parts.push(`Next up: ${describeNextTask(journey, silvicultureState)}.`);
  }
  if (Number.isFinite(journey.deadline)) {
    const daysLeft = Math.max(0, journey.deadline - journey.day);
    if (daysLeft <= 5) {
      parts.push(`The season closes in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`);
    }
  }
  return parts.join(' ');
}

/** What a supervisor would say the program needs next, in vintage terms. */
function describeNextTask(journey, silvicultureState) {
  const program = journey.program;
  const awaiting = getBlockAwaitingInspection(program);
  if (awaiting) return `quality plots on ${awaiting.id}, planted yesterday`;
  const current = getCurrentPlantingBlock(program);
  if (current && journey.planting.blocksPlanted < journey.planting.blocksToPlant) {
    return `${current.status === 'planting' ? 'finish' : 'start'} ${current.id} (${current.ha} ha of this year's program)`;
  }
  const fill = (program.fill || []).find((opening) => !opening.done);
  if (fill) return `fill plant ${fill.id} (${fill.year}, ${fill.ha} ha, ${fill.stockedSph} sph against MSS ${fill.mss})`;
  const brush = (program.brush || []).find((opening) => opening.treated < opening.ha);
  if (brush) return `release treatment on ${brush.id} (${brush.year}, ${brush.ha} ha)`;
  const fg = (program.freeGrowing || []).find((opening) => !(opening.surveyed && opening.result === 'pass'));
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
  lines.push(`Five vintages, one crew: this year's blocks (plant, inspect), last year's openings (fill), the ${journey.program.year - 5}–${journey.program.year - 2} stands (release), the ${describeFgYears(journey.program)} openings (free-growing survey). New seedlings do not become free-growing this season.`);
  lines.push(`Stocking standard ${describeStockingStandard(standard)}.`);
  lines.push(`Program: ${describeProgramLine(journey)} | ${zoneProfile.summary}`);
  const roster = getSilvicultureContractorRoster(journey, zoneProfile);
  lines.push(`Roster: ${roster.summary}`);

  const scrutinyPressure = getScrutinyPressure(journey);
  if (scrutinyPressure > 0) {
    lines.push(`${getScrutinyLabel(journey)}: ${scrutinyPressure}`);
  }
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

  const checklist = [
    {
      label: `this year's planting ${plantPct}% (${Math.min(journey.planting.blocksPlanted, journey.planting.blocksToPlant)}/${journey.planting.blocksToPlant} blocks, ${summary.blocksInspected} inspected)`,
      done: plantDone
    },
    {
      label: `free-growing declarations ${surveyPct}% (${Math.min(journey.surveys.freeGrowingComplete, journey.surveys.freeGrowingTarget)}/${journey.surveys.freeGrowingTarget})`,
      done: surveyDone
    }
  ];

  const alerts = [];
  const vegetationPressure = getVegetationPressure(journey);
  if (vegetationPressure > 0.25) {
    alerts.push({ level: 'warn', text: 'Release is behind the calendar - the older stands are losing the height race to aspen and willow.' });
  }
  if (getBlockAwaitingInspection(journey.program)) {
    alerts.push({ level: 'info', text: 'A planted block is waiting on its quality plots; the contractor gets paid on them.' });
  }
  if (seasonInfo?.id === 'winter') {
    alerts.push({ level: 'warn', text: 'Winter lockout: ground is frozen - planting waits for spring.' });
  }

  ui.setMissionStatus?.({
    objective: 'Plant and inspect this year\'s blocks; get this year\'s free-growing declarations into RESULTS.',
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
    ui.write(`  ${opening.id} (${opening.year}, ${opening.ha} ha)${tag}: ${Math.round(opening.treated)}/${opening.ha} ha${opening.method ? ` by ${describeBrushMethod(opening.method)}` : ''}`);
  }
  ui.write('Free-growing survey candidates:');
  for (const opening of program.freeGrowing) {
    const status = opening.surveyed
      ? (opening.result === 'pass' ? 'declared free-growing' : `FAILED on competition; ${opening.released ? 'released, resurvey due' : 'release prescribed'}`)
      : (opening.needsRelease && !opening.released ? 'under brush - release before survey' : 'ready for survey');
    ui.write(`  ${opening.id} (${opening.year}, ${opening.ha} ha): ${status}`);
  }

  if (zoneProfile.likelyFinds.length > 0) {
    ui.write(`Likely pressure: ${zoneProfile.likelyFinds[0]}`);
  }
  const scrutinyPressure = getScrutinyPressure(journey);
  if (scrutinyPressure > 0) {
    ui.write(`${getScrutinyLabel(journey)}: ${scrutinyPressure}`);
  }
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
  } else if (plantingRemaining && plantingEff <= 0) {
    // A no-op entry so the player knows why; deliberately does not start
    // with "Plant (" so a greedy picker never latches onto it.
    actionOptions.push({
      label: 'Planting frozen (winter lockout)',
      description: 'Ground is frozen. Planting waits for spring.',
      value: 'plant_disabled'
    });
  } else if (plantingRemaining && awaitingInspection) {
    actionOptions.push({
      label: `Planting paused (plots pending on ${awaitingInspection.id})`,
      description: 'Planting stays paused until the inspection on the block you planted yesterday is closed - the contractor gets paid on it.',
      value: 'plant_blocked'
    });
  }

  // Planting quality inspection (this year's blocks): your own crew walks it.
  if (awaitingInspection) {
    actionOptions.push({
      label: 'Planting quality inspection (this year\'s blocks)',
      description: `Walk quality plots on ${awaitingInspection.id}, planted yesterday: spacing, depth, J-roots, % excess. Payment holdback rides on it - ${describeInspectionTeam(journey)}`,
      value: 'inspect'
    });
  }

  // Fill plant (last year's blocks)
  const fillOpening = (program.fill || []).find((opening) => !opening.done);
  if (fillOpening && !awaitingInspection &&
      plantingEff > 0 &&
      journey.resources.seedlings > 0 &&
      journey.resources.contractorCapacity > 0) {
    actionOptions.push({
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
      label: `Brush (${program.year - 5}–${program.year - 2} stands)${seasonNote}`,
      description: `Release the older plantations from aspen, willow and fireweed before they lose the height race; next up ${brushOpening.id} (${brushOpening.year}, ${brushOpening.ha} ha)${brushOpening.fgId ? ', a free-growing candidate' : ''} - ${getSilvicultureTaskSummary(journey, zoneProfile, 'brush')}`,
      value: 'brush'
    });
  }

  // Free-growing survey (8–15 year old stands)
  const surveyEff = seasonMods?.surveyEfficiency ?? 1.0;
  if (currentSeason !== 'winter' &&
      journey.surveys.freeGrowingComplete < journey.surveys.freeGrowingTarget) {
    const seasonNote = surveyEff >= 1.2 ? ' (survey window)' : '';
    const surveyable = getSurveyableOpening(program);
    const underBrush = (program.freeGrowing || []).find((opening) => !(opening.surveyed && opening.result === 'pass') && opening.needsRelease && !opening.released);
    if (surveyable) {
      actionOptions.push({
        label: `Free-growing survey (${describeFgYears(program)} openings)${seasonNote}`,
        description: `Assess ${surveyable.id} (${surveyable.year}, ${surveyable.ha} ha) against the site plan's stocking standard: well-spaced, healthy, acceptable species, free of competition - ${getSilvicultureTaskSummary(journey, zoneProfile, 'survey')}`,
        value: 'survey'
      });
    } else if (underBrush) {
      actionOptions.push({
        label: `Free-growing survey blocked (${underBrush.id} under brush)`,
        description: 'The stands due for free-growing survey are still under brush. Get the release treatment done first or the surveyor will fail them on competition.',
        value: 'survey_blocked'
      });
    }
  }

  if (roster.rotatableCount > 0) {
    actionOptions.push({
      label: 'Contractor Rotation',
      description: `Put an available crew on the block or stand a tired one down (${roster.rotationSummary})`,
      value: 'rotation'
    });
  }

  actionOptions.push({
    label: 'Contractor Meeting',
    description: 'Sit down with a foreman over the plot cards and the pay sheet',
    value: 'meeting'
  });

  if (journey.crew && journey.crew.length > 0) {
    actionOptions.push({
      label: 'Team Briefing',
      description: 'Tailgate meeting with your own crew: the week\'s plots, the radio plan, the ETV',
      value: 'team_briefing'
    });
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

  const fieldTasks = { plant: 'plant', fill: 'fill', brush: 'brush', survey: 'survey' };
  const hasAccreditedSurveyor = crewHasRole(journey.crew || [], 'surveyor');
  return actionOptions.filter((option) => {
    const task = fieldTasks[option.value];
    if (!task) return true;
    if (task === 'survey' && hasAccreditedSurveyor) return true;
    return getSilvicultureTaskContractors(journey, zoneProfile, task, false).length > 0;
  });
}

function getSurveyableOpening(program) {
  return (program?.freeGrowing || []).find((opening) =>
    !(opening.surveyed && opening.result === 'pass') && (!opening.needsRelease || opening.released)) || null;
}

function describeInspectionTeam(journey) {
  const crew = journey.crew || [];
  if (crewHasRole(crew, 'checker')) return 'your checker walks the plots';
  if (crewHasRole(crew, 'surveyor')) return 'your surveyor walks the plots';
  return 'you walk the plots yourself';
}

async function processAction(game, actionId, currentSeason, seasonMods, silvicultureState, zoneProfile) {
  const { ui, journey } = game;

  switch (actionId) {
    case 'plant':
      if (await handlePlanting(game, seasonMods, silvicultureState, zoneProfile)) spendDay(journey);
      break;

    case 'plant_disabled':
      ui.writeWarning('Ground is frozen. Planting waits for spring.');
      break;

    case 'plant_blocked': {
      const awaiting = getBlockAwaitingInspection(journey.program);
      ui.writeWarning(`Planting stays paused until the inspection on ${awaiting?.id || 'the block you planted yesterday'} is closed - the contractor gets paid on it.`);
      break;
    }

    case 'brush':
      if (await handleBrushTreatment(game, seasonMods, silvicultureState, zoneProfile)) spendDay(journey);
      break;

    case 'survey':
      if (await handleFreeGrowingSurvey(game, seasonMods, silvicultureState, zoneProfile)) spendDay(journey);
      break;

    case 'survey_blocked':
      ui.writeWarning('The stands due for free-growing survey are still under brush. Get the release treatment done first or the surveyor will fail them on competition.');
      break;

    case 'inspect':
      if (await handleQualityInspection(game, seasonMods, silvicultureState, zoneProfile)) spendDay(journey);
      break;

    case 'fill':
      if (await handleFillPlanting(game, seasonMods, silvicultureState, zoneProfile)) spendDay(journey);
      break;

    case 'meeting':
      await handleContractorMeeting(game);
      spendDay(journey);
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
    ui.write('This year\'s blocks are all in the ground. Shift the day to the older vintages.');
    return false;
  }
  if (getBlockAwaitingInspection(program)) {
    ui.writeWarning('Close the quality plots on yesterday\'s block before the planters move on.');
    return false;
  }

  const taskContractors = getSilvicultureTaskContractors(journey, pressure, 'plant', true, ui);
  const planters = taskContractors.filter((c) => c.specialty === 'planting');
  const crew = planters.length ? planters : taskContractors;
  if (crew.length === 0) {
    ui.writeWarning('No planting contractor is available. Put an available crew on the block first.');
    return false;
  }

  const output = estimatePlantingOutput(crew, pressure, plantingEff);
  const remainingAllocation = Math.max(0, journey.planting.seedlingsAllocated - journey.planting.seedlingsPlanted);
  let toPlant = Math.min(output, journey.resources.seedlings, remainingAllocation);
  if (toPlant <= 0) {
    ui.writeWarning('No seedlings remain for this year\'s blocks. Check the reefer and the nursery order.');
    return false;
  }

  const contractor = crew[0];
  const price = Number(contractor.pricePerTree) || 0.32;
  const holdbackPct = Number(contractor.holdbackPct) || 0;
  const completed = [];
  let planted = 0;

  // The day's trees go onto the current block; a crew that finishes a block
  // moves onto the next in the afternoon, and stops there until the plots
  // on the finished block are walked.
  while (toPlant > 0) {
    const target = getCurrentPlantingBlock(program);
    if (!target) break;
    const room = target.trees - target.planted;
    const put = Math.min(room, toPlant);
    target.planted += put;
    target.status = 'planting';
    planted += put;
    toPlant -= put;
    if (target.planted >= target.trees) {
      target.status = 'planted';
      completed.push(target);
      break; // planting pauses until this block is inspected
    }
  }

  journey.planting.seedlingsPlanted = Math.min(journey.planting.seedlingsAllocated, journey.planting.seedlingsPlanted + planted);
  journey.resources.seedlings -= planted;
  journey.resources.contractorCapacity -= 4;
  const invoice = Math.round(planted * price * (1 - holdbackPct / 100));
  const holdback = Math.round(planted * price * (holdbackPct / 100));
  journey.resources.budget -= invoice;
  for (const done of completed) done.holdback += holdback;
  const activeBlock = completed[0] || getCurrentPlantingBlock(program);
  if (activeBlock && !completed.length) activeBlock.holdback += holdback;

  const shown = completed[0] || activeBlock;
  ui.write(`${describeBlock(shown)}: ${shown.planted.toLocaleString()} of ${shown.trees.toLocaleString()} planted (${Math.round((shown.planted / shown.trees) * 100)}%).`);
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
    ui.writePositive(`${done.id} planted out (${done.trees.toLocaleString()} trees on ${done.ha} ha). Quality plots tomorrow before the crew moves on.`);
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
    const perPlanter = contractor.specialty === 'planting' ? 950 : 600;
    total += planters * perPlanter * (contractor.productivity / 100) * fit;
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
    ui.write('No block is waiting on quality plots.');
    return false;
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
  ui.write(`${describeBlock(block)}: ${quality}% quality on ${hasChecker ? 'your checker\'s' : 'your'} plots - spacing ${spacingSph.toLocaleString()} sph against ${block.sph.toLocaleString()} target, ${jRoots}% J-roots, ${excess}% excess.`);

  const holdback = block.holdback || 0;
  if (quality >= 90) {
    journey.resources.budget -= holdback;
    ui.writePositive(`Plots pass. Holdback of $${holdback.toLocaleString()} released to ${contractor?.name || 'the contractor'}.`);
    if (contractor) contractor.morale = Math.min(100, contractor.morale + 3);
  } else if (quality >= 85) {
    ui.writeWarning(`Plots pass at the margin. Holdback of $${holdback.toLocaleString()} stays held until the crew tightens spacing on the next block.`);
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
  if (wetDrag > 0) ui.write(`Wet microsites cost spacing and depth on this ground: ${pressure.summary}`);
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
    ui.write('Last year\'s openings are all back above minimum stocking.');
    return false;
  }
  const crew = getSilvicultureTaskContractors(journey, pressure, 'fill', true, ui);
  if (crew.length === 0) {
    ui.writeWarning('No contractor is available for fill work. Put an available crew on the program first.');
    return false;
  }
  const output = Math.round(estimatePlantingOutput(crew, pressure, plantingEff) * (1 - Math.min(0.22, pressure.fillPressure + pressure.survivalPenalty * 0.5)));
  const trees = Math.min(opening.trees, journey.resources.seedlings);
  if (trees <= 0) {
    ui.writeWarning('No fill stock left in the reefer for this opening.');
    return false;
  }
  const contractor = crew[0];
  const price = (Number(contractor.pricePerTree) || 0.32) + FILL_PRICE_PREMIUM;
  const invoice = Math.round(trees * price);
  journey.resources.seedlings -= trees;
  journey.resources.budget -= invoice;
  journey.resources.contractorCapacity -= 3;
  opening.done = true;
  journey.planting.fillComplete = (journey.planting.fillComplete || 0) + 1;

  ui.write(`Fill plant on ${opening.id} (${opening.year}, ${opening.ha} ha): ${trees.toLocaleString()} trees into the gaps, ${opening.stockedSph} sph back above MSS ${opening.mss}.`);
  ui.write(`${contractor.name}: fill work at $${price.toFixed(2)}/tree - invoice $${invoice.toLocaleString()}.`);
  if (output < trees) {
    ui.write('Fill work is slow walking: the crew hunts gaps between live seedlings instead of planting lines.');
  }
  ui.write('Last year\'s openings are back above minimum stocking.');
  if (pressure.fillPressure > 0.05) ui.writeWarning(pressure.summary);

  applySilvicultureContractorUsage(journey, crew, pressure, 'fill');
  silvicultureState.lastAction = 'fill';
  if (getScrutinyPressure(journey) > 0) adjustScrutiny(journey, 1);
  return true;
}

// ── Brush ───────────────────────────────────────────────────────────────────

const BRUSH_METHOD_LABELS = {
  manual: 'manual release',
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
 * Release treatment on the older stands. The choice is the real one: saw
 * crews, glyphosate under the pest management plan, or sheep where the
 * ground and the road allow it.
 */
async function handleBrushTreatment(game, seasonMods, silvicultureState, zoneProfile) {
  const { ui, journey } = game;
  const program = journey.program;
  const brushingEff = seasonMods?.brushingEfficiency ?? 1.0;
  const pressure = zoneProfile || getSilvicultureZoneProfile(journey, silvicultureState);
  const queue = (program.brush || []).filter((o) => o.treated < o.ha);

  if (!queue.length) {
    ui.write('The release program is treated for the year.');
    return false;
  }
  const crew = getSilvicultureTaskContractors(journey, pressure, 'brush', true, ui);
  if (crew.length === 0) {
    ui.writeWarning('No brushing contractor is available. Put an available crew on the program first.');
    return false;
  }
  const contractor = crew.find((c) => c.specialty === 'brushing') || crew[0];
  const sensitive = areaHasTag(journey, 'community-interface', 'watershed', 'community-water', 'salmon', 'visuals');
  const hasApplicator = contractorHasCert(contractor, 'PMP-applicator');
  const sheepAllowed = areaHasTag(journey, 'community-interface', 'watershed', 'community-water', 'visuals') && !areaHasTag(journey, 'remote-camps', 'glacial', 'winter-road');

  const options = [
    {
      label: `Manual brushing (saw crews, ~$${BRUSH_RATES.manual}/ha)`,
      description: 'Slower, no PMP, nothing in the water. The crews cut aspen and willow below the seedling leaders.',
      value: 'manual',
    },
  ];
  if (hasApplicator) {
    options.push({
      label: `Glyphosate under the PMP (~$${BRUSH_RATES.glyphosate}/ha)`,
      description: `Backpack or aerial; faster and cheaper per hectare. 10 m pesticide-free zones on every stream${sensitive ? '; this is interface/watershed ground and the community and the Nation will read the spray maps' : ''}.`,
      value: 'glyphosate',
    });
  }
  if (sheepAllowed) {
    options.push({
      label: `Sheep grazing (herder contract, ~$${BRUSH_RATES.sheep}/ha)`,
      description: 'No chemicals, no saws; slow, needs the road open and a herder with dogs. Reads well on interface ground.',
      value: 'sheep',
    });
  }
  options.push({ label: 'Never mind', description: 'Leave the release program for another day.', value: 'cancel' });

  const choice = await ui.promptChoice(`Release treatment on ${queue[0].id} (${queue[0].year}, ${queue[0].ha} ha): how?`, options);
  const method = choice.value;
  if (method === 'cancel') {
    ui.write('The brushing crew waits for a call.');
    return false;
  }

  const avgProductivity = crew.reduce((sum, c) => sum + (c.productivity * getSilvicultureContractorFit(c, pressure, 'brush')), 0) / crew.length;
  const baseHectares = method === 'glyphosate' ? 80 : method === 'sheep' ? 30 : 48;
  const pfzLoss = method === 'glyphosate' && areaHasTag(journey, 'salmon', 'watershed', 'community-water') ? 0.92 : 1;
  const remaining = queue.reduce((sum, opening) => sum + (opening.ha - opening.treated), 0);
  let hectares = Math.min(
    remaining,
    Math.round(baseHectares * (avgProductivity / 100) * brushingEff * pfzLoss * (0.8 + Math.random() * 0.4))
  );
  if (hectares <= 0) {
    ui.write('No release hectares remain on the program map.');
    return false;
  }

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
      }
    }
  }
  hectares = treated.reduce((sum, entry) => sum + entry.ha, 0);

  const rate = BRUSH_RATES[method] || BRUSH_RATES.manual;
  const invoice = Math.round(hectares * rate);
  journey.brushing.hectaresComplete = Math.min(journey.brushing.hectaresTarget, journey.brushing.hectaresComplete + hectares);
  journey.resources.contractorCapacity -= 2;
  journey.resources.budget -= invoice;

  const openingsText = treated.map((entry) => `${entry.opening.id} (${entry.opening.year}, ${Math.round(entry.ha)} ha)`).join(' and ');
  const yearsText = [...new Set(treated.map((entry) => entry.opening.year))].sort().join('/');
  if (method === 'manual') {
    ui.write(`Treated ${Math.round(hectares)} ha of ${yearsText} openings by manual release - aspen and willow cut below the seedling leaders.`);
  } else if (method === 'glyphosate') {
    const pmp = silvicultureState.pmpNumber ||= `402-0${700 + Math.floor(Math.random() * 90)}`;
    ui.write(`${hectares >= 60 ? 'Aerial' : 'Backpack'} glyphosate on ${Math.round(hectares)} ha of ${yearsText} openings under PMP ${pmp}. 10 m pesticide-free zones flagged on every stream.`);
    if (sensitive) {
      ui.writeWarning('The First Nation\'s guardian program asks for the spray maps, and so does the community watershed group. Relationships slip; scrutiny climbs.');
      adjustRelationships(journey, -3);
      adjustScrutiny(journey, 2);
      program.notes.push(`Spray maps for PMP ${pmp} sent to the Guardians and the watershed group.`);
    } else {
      ui.write('The Nation\'s guardian program asks for the spray maps; the RPF signs the treatment record.');
    }
  } else {
    ui.write(`Sheep grazing on ${Math.round(hectares)} ha of ${yearsText} openings - the herder camps on the landing, the dogs keep the flock off the seedlings.`);
  }
  ui.write(`Release treatment: ${openingsText} - ${Math.round(hectares)} ha. ${contractor.name}: $${rate}/ha - invoice $${invoice.toLocaleString()}.`);
  const releasedFg = treated.map((entry) => entry.opening).filter((opening) => opening.fgId && opening.treated >= opening.ha);
  for (const opening of releasedFg) {
    ui.writePositive(`Release treatment done on the ${opening.year} opening ${opening.id}. That stand is back on track for its free-growing survey.`);
  }
  const young = treated.map((entry) => entry.opening).filter((opening) => !opening.fgId && opening.treated >= opening.ha);
  if (young.length) {
    ui.writePositive(`Release treatment done on the ${[...new Set(young.map((o) => o.year))].sort().join('/')} openings. Those stands are back on track for their free-growing dates.`);
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
    ui.write('This year\'s free-growing declarations are all in RESULTS.');
    return false;
  }
  const opening = getSurveyableOpening(program);
  if (!opening) {
    ui.writeWarning('The stands due for free-growing survey are still under brush. Get the release treatment done first or the surveyor will fail them on competition.');
    return false;
  }

  const hasAccreditedSurveyor = crewHasRole(journey.crew || [], 'surveyor');
  const contractors = getSilvicultureTaskContractors(journey, pressure, 'survey', !hasAccreditedSurveyor, ui)
    .filter((c) => contractorHasCert(c, 'surveyor-accredited'));
  if (contractors.length === 0 && !hasAccreditedSurveyor) {
    ui.writeWarning('Free-growing surveys need an accredited silviculture surveyor - your own, or the survey contractor. Nobody unaccredited signs a declaration.');
    return false;
  }

  const contractor = contractors[0] || null;
  const surveyCost = contractor ? (Number(contractor.dayRate) || SURVEY_DAY_RATE) : 0;
  journey.surveys.regenerationSurveys++;
  journey.resources.budget -= surveyCost;
  opening.attempts += 1;

  // The stand's condition, as the plots read it today. Zone pressure and a
  // release program behind the calendar cost plots; a stand that has had
  // its release treatment reads clean - the brush is below the leaders.
  let plotPct = opening.fgPlotPct;
  plotPct -= Math.round(pressure.surveyPressure * 60);
  plotPct -= Math.round(Math.max(0, vegetationPressure - 0.25) * 40);
  plotPct += Math.round(-3 + Math.random() * 7);
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
    const second = getSurveyableOpening(program);
    if (second && hasAccreditedSurveyor && contractor && surveyEff >= 1.1 && journey.surveys.freeGrowingComplete < journey.surveys.freeGrowingTarget) {
      second.surveyed = true;
      second.result = 'pass';
      second.attempts += 1;
      journey.surveys.freeGrowingComplete = Math.min(journey.surveys.freeGrowingTarget, journey.surveys.freeGrowingComplete + 1);
      ui.writePositive(`Two survey teams on the ground: ${second.id} (${second.year}) also declared free-growing.`);
    }
  } else {
    opening.surveyed = true;
    opening.result = 'fail';
    if (!stocked) {
      ui.write(`Prescription: fill plant ${opening.id} to MSS and resurvey; the opening leaves this year's declaration list.`);
      opening.needsRelease = false;
      opening.released = true;
      opening.wellSpacedSph = standard.mss + 120;
      opening.fgPlotPct = Math.max(opening.fgPlotPct, 84);
    } else {
      ui.write(`Prescription: ${pressure.brushPressure > 0.05 ? 'manual' : 'manual or chemical'} release, resurvey in 2 years. The release crew takes it next.`);
      opening.needsRelease = true;
      opening.released = false;
      if (!program.brush.some((entry) => entry.fgId === opening.id && entry.treated < entry.ha)) {
        program.brush.unshift({ id: opening.id, year: opening.year, ha: Math.min(opening.ha, 24), treated: 0, method: null, fgId: opening.id });
      }
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

/**
 * Contractor meeting: the plot cards and the pay sheet.
 */
async function handleContractorMeeting(game) {
  const { ui, journey } = game;
  const activeContractors = journey.contractors.filter(c => c.isActive);

  if (activeContractors.length === 0) {
    ui.write('No contractor is on the block to meet with.');
    return;
  }

  const options = activeContractors.map(c => ({
    label: `${c.name} (${c.specialty})`,
    description: `${describeContractorEconomics(c)} | productivity ${c.productivity}% | morale ${c.morale}%`,
    value: c.id
  }));

  const choice = await ui.promptChoice('Meet with which contractor?', options);
  const contractor = journey.contractors.find(c => c.id === choice.value);
  if (!contractor) return;

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
}

function handleTeamBriefing(game) {
  const { ui, journey } = game;
  if (!journey.crew) return;

  for (const member of journey.crew) {
    if (member.isActive) {
      member.morale = Math.min(100, (member.morale || 50) + 15);
    }
  }

  ui.write('Tailgate meeting: the week\'s plot schedule, radio channels, the ETV route and the fire danger rating. Your crew is set for the day.');
}

async function handleContractorEvent(game, cEvent, contractor) {
  const { ui, journey } = game;
  const contractorState = ensureSilvicultureContractorState(contractor, journey, getSilvicultureZoneProfile(journey));
  const zoneProfile = getSilvicultureZoneProfile(journey);
  const silvicultureState = ensureSilvicultureState(journey);

  ui.clear();
  ui.writeHeader(`CONTRACTOR CALL: ${cEvent.title}`);
  ui.write(cEvent.getText(contractor));
  ui.write('Brief response; the day\'s work continues.');
  ui.write('');

  const options = cEvent.options.map(opt => ({
    label: opt.label,
    description: opt.description || '',
    value: opt.value
  }));

  const choice = await ui.promptChoice('How do you respond?', options);
  const selected = cEvent.options.find(o => o.value === choice.value);
  if (!selected) return;

  if (selected.cost > 0) {
    if (journey.resources.budget < selected.cost) {
      ui.writeWarning(`Not enough budget! ($${selected.cost.toLocaleString()} needed)`);
      contractor.morale = Math.max(0, contractor.morale - 10);
      startSilvicultureContractorRecovery(contractor, 1, 'budget');
      return;
    }
    journey.resources.budget -= selected.cost;
  }
  contractor.morale = Math.max(0, Math.min(100, contractor.morale + selected.moraleGain));
  contractor.productivity = Math.max(20, Math.min(100, contractor.productivity + selected.prodGain));
  contractorState.fatigue = Math.max(0, contractorState.fatigue - 1);

  if (selected.qualityLift) {
    silvicultureState.qualityLift = (silvicultureState.qualityLift || 0) + selected.qualityLift;
  }
  if (selected.fraud) {
    silvicultureState.qualityPenaltyNext = (silvicultureState.qualityPenaltyNext || 0) + 5;
    adjustScrutiny(journey, 3);
    adjustCompliance(journey, -4);
    ui.writeWarning('You sign plot cards you did not walk. The holdback goes out, the next inspection will read what the crew actually did, and the file now carries a false record an NRO would find in an hour.');
  }
  if (selected.priceLift) {
    contractor.pricePerTree = Math.round(((Number(contractor.pricePerTree) || 0.32) + selected.priceLift) * 100) / 100;
    ui.write(`${contractor.name} now bills $${contractor.pricePerTree.toFixed(2)}/tree for the rest of the program.`);
  }
  if (selected.plantersLost) {
    contractor.planters = Math.max(4, Math.round((contractor.planters || 12) * (1 - selected.plantersLost)));
    ui.writeWarning(`${contractor.name} sends half the crew to the coast: ${contractor.planters} planters stay on your program.`);
  }
  if (selected.scrutiny) adjustScrutiny(journey, selected.scrutiny);

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
    const bonus = Math.min(6, Math.max(0, journey.brushing.hectaresTarget - journey.brushing.hectaresComplete));
    if (bonus > 0) {
      journey.brushing.hectaresComplete += bonus;
      const opening = (journey.program?.brush || []).find((entry) => entry.treated < entry.ha);
      if (opening) opening.treated = Math.min(opening.ha, opening.treated + bonus);
    }
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

/**
 * Nothing left that can move any track, and the resources to finish are gone.
 */
function isSilvicultureUnwinnable(journey) {
  const remainingBlocks = journey.planting.blocksToPlant - (journey.planting.blocksPlanted || 0);
  const remainingBrush = journey.brushing.hectaresTarget - journey.brushing.hectaresComplete;
  const remainingSurveys = journey.surveys.freeGrowingTarget - journey.surveys.freeGrowingComplete;
  const stillHasWorkToDo = remainingBlocks > 0 || remainingBrush > 0 || remainingSurveys > 0;
  if (!stillHasWorkToDo) return false;

  const capacityExhausted = journey.resources.contractorCapacity <= 0 && (remainingBlocks > 0 || remainingBrush > 0);
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

  if (tags.has('peatland') || tags.has('wetland') || becCode.startsWith('bwbs')) {
    pressure.survivalPenalty += 0.05;
    pressure.fillPressure += 0.06;
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
  if (pressure.survivalPenalty > 0.04) summaryPieces.push('survival is less forgiving');
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
    summary,
    likelyFinds,
    zoneSummary: briefing.zoneSummary || '',
  };
}

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
    journey.scrutiny = Math.max(0, Number(journey.scrutiny) + delta);
    return;
  }

  if (Number.isFinite(Number(journey?.heat))) {
    journey.heat = Math.max(0, Number(journey.heat) + delta);
  }
}

function adjustCompliance(journey, delta) {
  if (journey?.metrics && Number.isFinite(Number(journey.metrics.compliance))) {
    journey.metrics.compliance = Math.max(0, Math.min(100, Number(journey.metrics.compliance) + delta));
  }
}

function adjustRelationships(journey, delta) {
  if (journey?.metrics && Number.isFinite(Number(journey.metrics.relationships))) {
    journey.metrics.relationships = Math.max(0, Math.min(100, Number(journey.metrics.relationships) + delta));
  }
  journey.communityStanding = Math.max(-20, Math.min(20, (Number(journey.communityStanding) || 0) + delta));
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
    return `${contractor.sawCrews || 3} saw crews · $${contractor.ratePerHa}/ha manual, $${contractor.herbicideRatePerHa}/ha glyphosate · ${contractorHasCert(contractor, 'PMP-applicator') ? 'PMP applicator' : 'no applicator ticket'}`;
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
  return `${fitText} | ${ready.length} available | ${offDays} on days off`;
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
  const fallback = [];

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
      continue;
    }

    if (contractor.isActive && task !== 'survey') {
      fallback.push({ contractor, fit });
    }
  }

  const autoDeployPool = ready.length > 0 ? ready : fallback;
  const selected = eligible.length > 0
    ? eligible.sort((a, b) => b.fit - a.fit)
    : [...autoDeployPool]
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

  if (task === 'fill') {
    return contractor.specialty === 'planting' || contractor.specialty === 'brushing';
  }

  if (task === 'survey') {
    return (contractor.specialty === 'survey' || contractor.specialty === 'surveyor') && contractorHasCert(contractor, 'surveyor-accredited');
  }

  if (task === 'brush') {
    return contractor.specialty === 'brushing' || contractor.specialty === 'planting';
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
    state.deploymentDays = (state.deploymentDays || 0) + 1;
    state.zoneFit = fit;
    state.fatigue = Math.min(6, (state.fatigue || 0) + 1 + (taskPressure ? 1 : 0) - (fit > 1.05 ? 1 : 0));

    contractor.productivity = Math.max(20, Math.min(100, contractor.productivity + (fit > 1 ? 2 : -1)));
    contractor.morale = Math.max(0, Math.min(100, contractor.morale + (fit > 1 ? 1 : 0) - (state.fatigue >= 4 ? 1 : 0)));

    if (state.fatigue >= 4 || contractor.morale < 30) {
      startSilvicultureContractorRecovery(contractor, state.fatigue >= 5 ? 2 : 1, 'workload');
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
    ui.write('No contractors are available to rotate right now.');
    return false;
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
    startSilvicultureContractorRecovery(contractor, restDays, 'rotation');
    ui.write(`${contractor.name} is stood down for ${restDays} day${restDays > 1 ? 's' : ''} off.`);
    if (getScrutinyPressure(journey) > 0 && (pressure.surveyPressure > 0.05 || pressure.brushPressure > 0.05)) {
      adjustScrutiny(journey, -1);
    }
    return true;
  }

  deploySilvicultureContractor(contractor, pressure, contractor.specialty === 'brushing' ? 'brush' : 'plant');
  ui.writePositive(`${contractor.name} goes back on the block.`);
  if (getScrutinyPressure(journey) > 0 && pressure.accessPressure > 0.08) {
    adjustScrutiny(journey, -1);
  }
  return true;
}
