/**
 * Silviculture Mode Runner
 * Crew + contractor management for reforestation operations
 * Multi-action days with seasonal gating and contractor events
 */

import { checkForEvent, resolveEvent, formatEventForDisplay } from '../events.js';
import { getCurrentSeasonInfo, advanceDay as advanceSeasonDay, getSeasonModifiers } from '../season.js';
import { crewHasRole } from '../crew.js';
import { getOperationalProgress, recordProgressMilestones } from '../journey.js';
import { getRoleAreaBriefing } from '../data/roleAreaIntel.js';
import { addDiscoveryTags, getDiscoveryTagNotes, getJourneyDiscoveryTags } from '../data/discoveryTags.js';
import { getAreaSituationSummary } from '../data/areaSituations.js';

// Contractor event templates (Phase 4.2)
const CONTRACTOR_EVENTS = [
  {
    id: 'camp_demand',
    trigger: (c) => c.morale < 60,
    title: 'Camp Facilities Demand',
    getText: (c) => `${c.name} is complaining about camp conditions and wants better facilities.`,
    options: [
      { label: 'Upgrade camp ($3,000)', value: 'pay', cost: 3000, moraleGain: 15, prodGain: 5 },
      { label: 'Deny request', value: 'deny', cost: 0, moraleGain: -15, prodGain: -5 }
    ]
  },
  {
    id: 'quality_dispute',
    trigger: (c) => c.specialty === 'planting',
    title: 'Planting Quality Dispute',
    getText: (c) => `Spot-check reveals ${c.name} has been cutting corners on spacing.`,
    options: [
      { label: 'Inspect & retrain (3h)', value: 'inspect', cost: 0, moraleGain: -5, prodGain: 10, hours: 3 },
      { label: 'Let it slide', value: 'slide', cost: 0, moraleGain: 5, prodGain: 0 }
    ]
  },
  {
    id: 'crew_illness',
    trigger: () => Math.random() < 0.3,
    title: 'Contractor Crew Illness',
    getText: (c) => `Several workers from ${c.name} called in sick. Operations slowed.`,
    options: [
      { label: 'Send medic (1h)', value: 'medic', cost: 500, moraleGain: 5, prodGain: 0, hours: 1 },
      { label: 'Push through', value: 'push', cost: 0, moraleGain: -10, prodGain: -10 }
    ]
  },
  {
    id: 'weather_delay',
    trigger: () => true,
    title: 'Weather Delay Request',
    getText: (c) => `${c.name} wants to take the day off due to rain. "Safety first," they say.`,
    options: [
      { label: 'Grant rest day', value: 'rest', cost: 0, moraleGain: 10, prodGain: 0 },
      { label: 'Push through', value: 'push', cost: 0, moraleGain: -8, prodGain: -5 }
    ]
  },
  {
    id: 'poaching',
    trigger: (c) => c.productivity > 85,
    title: 'Contractor Bidding on Another Job',
    getText: (c) => `${c.name} has been offered a contract elsewhere. They want a $5,000 retention bonus.`,
    options: [
      { label: 'Pay retention ($5,000)', value: 'pay', cost: 5000, moraleGain: 10, prodGain: 5 },
      { label: 'Let them consider', value: 'wait', cost: 0, moraleGain: -5, prodGain: -10 }
    ]
  }
];

const CONTRACTOR_TASK_TRAITS = {
  plant: ['planting-specialist', 'wet-ground', 'remote-ready', 'terrain-aware'],
  fill: ['planting-specialist', 'brush-specialist', 'wet-ground', 'terrain-aware'],
  brush: ['brush-specialist', 'heat-hard', 'remote-ready', 'terrain-aware'],
  survey: ['survey-minded', 'process-cautious', 'community-facing', 'remote-ready'],
  inspect: ['survey-minded', 'process-cautious', 'terrain-aware'],
};

/**
 * Run a silviculture day with multi-action system
 * @param {Object} game - Game instance
 */
export async function runSilvicultureDay(game) {
  const { ui, journey } = game;
  const silvicultureState = ensureSilvicultureState(journey);
  const zoneProfile = getSilvicultureZoneProfile(journey, silvicultureState);
  tickSilvicultureContractorRecovery(journey, zoneProfile);
  const seasonInfo = journey.season ? getCurrentSeasonInfo(journey.season) : null;
  const currentSeason = seasonInfo?.id || 'summer';
  const vegetationPressure = getVegetationPressure(journey);
  const progressBeforeDay = getOperationalProgress(journey);

  // Initialize hours for the day
  if (!journey.hoursRemaining || journey.hoursRemaining <= 0) {
    journey.hoursRemaining = 10;
  }

  // Apply daily contractor productivity decay (Phase 4.2)
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

  // Apply daily overhead cost
  journey.resources.budget -= 850;

  // Check for contractor event (higher when morale/productivity is slipping)
  const activeContractors = journey.contractors.filter(c => c.isActive);
  const contractorStress = activeContractors.some(c => c.morale < 55 || c.productivity < 60);
  if (Math.random() < (contractorStress ? 0.40 : 0.30)) {
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

  // Check for random event
  const event = checkForEvent(journey);
  if (event) {
    displaySilvicultureHeader(ui, journey, seasonInfo, silvicultureState, zoneProfile);
    await handleEvent(game, event);
    if (game.gameOver) return;
  }

  // Multi-action loop
  while (journey.hoursRemaining > 0) {
    displaySilvicultureHeader(ui, journey, seasonInfo, silvicultureState, zoneProfile);

    // Get seasonal modifiers
    const seasonMods = journey.season
      ? getSeasonModifiers(currentSeason, 'silviculture')
      : {};

    // Build action options based on season and hours
    const actionOptions = buildSilvicultureActions(journey, currentSeason, seasonMods, silvicultureState, zoneProfile);

    const action = await ui.promptChoice(`${journey.hoursRemaining}h remaining:`, actionOptions);

    ui.write('');

    if (action.value === 'end') {
      break;
    }

    // Process action
    await processAction(game, action.value, currentSeason, seasonMods, silvicultureState, zoneProfile);

    ui.updateAllStatus(journey);

  }

  // End of day processing
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

  // Check contractor walkoffs (below 10 morale)
  for (const contractor of journey.contractors) {
    if (contractor.isActive && contractor.morale <= 10 && Math.random() < 0.4) {
      contractor.isActive = false;
      ui.writeDanger(`${contractor.name} has walked off the job!`);
    }
  }

  // Check victory conditions
  if (journey.planting.blocksPlanted >= journey.planting.blocksToPlant &&
      journey.surveys.freeGrowingComplete >= journey.surveys.freeGrowingTarget) {
    journey.isComplete = true;
    journey.endReason = 'Regeneration targets achieved!';
  }

  // Check game over
  if (journey.resources.budget <= 0) {
    journey.isGameOver = true;
    journey.gameOverReason = 'Budget exhausted';
  }

  // Reset hours for next day
  journey.hoursRemaining = 0;

  ui.updateAllStatus(journey);

  const milestoneMessages = [];
  recordProgressMilestones(journey, progressBeforeDay, milestoneMessages, Math.max(1, journey.day - 1));
  for (const message of milestoneMessages) {
    ui.writePositive(message);
  }

  // Contextual continue (Phase 6.1)
  const nextSeasonInfo = journey.season ? getCurrentSeasonInfo(journey.season) : null;
  const contractorHint = journey.contractors.filter(c => c.isActive && c.morale < 40).length;
  const continueLabel = contractorHint > 0
    ? `Continue... (Day ${journey.day}, ${nextSeasonInfo?.name || ''}, ${contractorHint} unhappy contractor${contractorHint > 1 ? 's' : ''})`
    : `Continue... (Day ${journey.day}, ${nextSeasonInfo?.name || ''})`;
  await ui.promptChoice('', [{ label: continueLabel, value: 'next' }]);
}

/**
 * Display compact silviculture header (Phase 6.2)
 */
function displaySilvicultureHeader(ui, journey, seasonInfo, silvicultureState, zoneProfile) {
  ui.clear();
  ui.writeHeader(`DAY ${journey.day} - SILVICULTURE OPERATIONS`);

  if (seasonInfo) {
    ui.write(`${seasonInfo.icon} ${seasonInfo.name} - Year ${seasonInfo.year} | Hours: ${journey.hoursRemaining}h`);
  }
  ui.write('');

  ui.write(`Sequence: ${formatSilviculturePhase(silvicultureState.phase)} | ${zoneProfile.summary}`);
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
  ui.write('');

  // Compact program status
  const plantPct = Math.round(Math.min(1, journey.planting.seedlingsPlanted / journey.planting.seedlingsAllocated) * 100);
  const brushPct = Math.round(Math.min(1, journey.brushing.hectaresComplete / journey.brushing.hectaresTarget) * 100);
  const surveyPct = Math.round(Math.min(1, journey.surveys.freeGrowingComplete / journey.surveys.freeGrowingTarget) * 100);

  ui.write(`Plant: ${plantPct}% (${Math.min(journey.planting.blocksPlanted, journey.planting.blocksToPlant)}/${journey.planting.blocksToPlant} blocks) | Brush: ${brushPct}% | Survey: ${surveyPct}% (${Math.min(journey.surveys.freeGrowingComplete, journey.surveys.freeGrowingTarget)}/${journey.surveys.freeGrowingTarget})`);

  // Compact contractors
  const roster = getSilvicultureContractorRoster(journey, zoneProfile);
  ui.write(`Roster: ${roster.summary}`);
  ui.write(`Contractors: ${roster.lines.join(' | ')}`);

  // Resources
  ui.write(`Budget: $${journey.resources.budget.toLocaleString()} | Seedlings: ${journey.resources.seedlings.toLocaleString()} | Capacity: ${journey.resources.contractorCapacity} days`);
  const vegetationPressure = getVegetationPressure(journey);
  if (vegetationPressure > 0.25) {
    ui.write('Vegetation pressure: HIGH - brushing is lagging well behind planted ground.');
  } else if (vegetationPressure > 0.1) {
    ui.write('Vegetation pressure: MODERATE - keep brushing close to planting progress.');
  }
  ui.write('');
}

/**
 * Build available actions based on season and hours
 */
function buildSilvicultureActions(journey, currentSeason, seasonMods, silvicultureState, zoneProfile) {
  const actionOptions = [];
  const hoursLeft = journey.hoursRemaining;
  const sequencePhase = silvicultureState.phase;
  const roster = getSilvicultureContractorRoster(journey, zoneProfile);
  const { plantRatio, brushRatio } = getSilvicultureRatios(journey);
  const surveyReady = brushRatio >= Math.max(0.35, plantRatio - 0.05) || sequencePhase === 'survey';
  const plantingOpen = sequencePhase === 'plant';
  const fillOpen = sequencePhase === 'fill';
  const survivalOpen = sequencePhase === 'survival' && journey.planting.blocksPlanted > 0;

  // Planting - primarily spring, marginally in summer/fall, impossible in winter
  const plantingEff = seasonMods?.plantingEfficiency ?? 1.0;
  if (plantingOpen &&
      plantingEff > 0 &&
      journey.resources.seedlings > 0 &&
      journey.resources.contractorCapacity > 0 &&
      journey.planting.blocksPlanted < journey.planting.blocksToPlant &&
      hoursLeft >= 4) {
    const seasonNote = plantingEff >= 1.2 ? ' (peak season!)' : plantingEff < 1.0 ? ' (reduced efficiency)' : '';
    actionOptions.push({
      label: `Plant Block (4h)${seasonNote}`,
      description: `Send contractors to establish the next block (${getSilvicultureTaskSummary(journey, zoneProfile, 'plant')})`,
      value: 'plant'
    });
  } else if (plantingEff <= 0 && hoursLeft >= 4) {
    // Show disabled option so player knows why
    actionOptions.push({
      label: 'Plant Block (FROZEN)',
      description: 'Ground is frozen. Planting impossible in winter.',
      value: 'plant_disabled'
    });
  }

  // Survival check - should follow planting before fill/brush work
  if (survivalOpen && hoursLeft >= 2 && journey.planting.blocksPlanted > 0) {
    actionOptions.push({
      label: `Survival Check (2h)`,
      description: `Assess planted blocks before fill work (${getSilvicultureTaskSummary(journey, zoneProfile, 'inspect')})`,
      value: 'inspect'
    });
  }

  // Fill planting - only meaningful after a survival check or when pressure is high
  if (journey.resources.seedlings > 0 &&
      journey.resources.contractorCapacity > 0 &&
      journey.planting.blocksPlanted > 0 &&
      hoursLeft >= 3) {
    const fillReady = fillOpen && journey.planting.seedlingsPlanted < journey.planting.seedlingsAllocated;
    if (fillReady) {
      actionOptions.push({
        label: 'Fill Planting (3h)',
        description: `Top up mortality gaps before brush control (${getSilvicultureTaskSummary(journey, zoneProfile, 'fill')})`,
        value: 'fill'
      });
    }
  }

  // Brush control - primarily summer
  const brushingEff = seasonMods?.brushingEfficiency ?? 1.0;
  if (journey.resources.contractorCapacity > 0 &&
      journey.brushing.hectaresComplete < journey.brushing.hectaresTarget &&
      hoursLeft >= 3 &&
      currentSeason !== 'winter') {
    const seasonNote = brushingEff >= 1.2 ? ' (peak season!)' : '';
    actionOptions.push({
      label: `Brush Treatment (3h)${seasonNote}`,
      description: `Protect planted ground and prepare the stand for survey (${getSilvicultureTaskSummary(journey, zoneProfile, 'brush')})`,
      value: 'herbicide'
    });
  }

  // Survey - best in fall, not in winter
  const surveyEff = seasonMods?.surveyEfficiency ?? 1.0;
  if (currentSeason !== 'winter' &&
      journey.surveys.freeGrowingComplete < journey.surveys.freeGrowingTarget &&
      hoursLeft >= 3) {
    const seasonNote = surveyEff >= 1.2 ? ' (peak season!)' : '';
    if (surveyReady) {
      actionOptions.push({
        label: `Survey Free-Growing (3h)${seasonNote}`,
        description: `Check planting survival after the stand has been tended (${getSilvicultureTaskSummary(journey, zoneProfile, 'survey')})`,
        value: 'survey'
      });
    } else {
      actionOptions.push({
        label: 'Survey Free-Growing (NEEDS BRUSH)',
        description: 'Bring brushing closer to planted ground before trying to declare free-growing.',
        value: 'survey_blocked'
      });
    }
  }

  if (journey.contractors.length > 0 && hoursLeft >= 1) {
    actionOptions.push({
      label: 'Contractor Rotation (1h)',
      description: `Deploy rested contractors or stand down tired ones (${roster.rotationSummary})`,
      value: 'rotation'
    });
  }

  // Contractor meeting - choose specific contractor (Phase 4.2)
  if (hoursLeft >= 2) {
    actionOptions.push({
      label: 'Contractor Meeting (2h)',
      description: 'Meet with a specific contractor',
      value: 'meeting'
    });
  }

  // Team briefing
  if (journey.crew && journey.crew.length > 0 && hoursLeft >= 1) {
    actionOptions.push({
      label: 'Team Briefing (1h)',
      description: 'Boost crew morale',
      value: 'briefing'
    });
  }

  actionOptions.push({
    label: 'End Day',
    description: 'Wrap up and rest',
    value: 'end'
  });

  return actionOptions;
}

/**
 * Process a selected action with seasonal modifiers
 */
async function processAction(game, actionId, currentSeason, seasonMods, silvicultureState, zoneProfile) {
  const { ui, journey } = game;

  switch (actionId) {
    case 'plant':
      if (await handlePlanting(game, seasonMods, 'plant', silvicultureState, zoneProfile)) {
        journey.hoursRemaining -= 4;
      }
      break;

    case 'plant_disabled':
      ui.writeWarning('Ground is frozen. Planting is impossible in winter.');
      break;

    case 'herbicide':
      if (await handleHerbicide(game, seasonMods, silvicultureState, zoneProfile)) {
        journey.hoursRemaining -= 3;
      }
      break;

    case 'survey':
      if (await handleSurvey(game, seasonMods, silvicultureState, zoneProfile)) {
        journey.hoursRemaining -= 3;
      }
      break;

    case 'survey_blocked':
      ui.writeWarning('Survey work is premature. Brush treatment needs to catch up before the file will hold a clean free-growing call.');
      break;

    case 'inspect':
      if (await handleSurvivalCheck(game, seasonMods, silvicultureState, zoneProfile)) {
        journey.hoursRemaining -= 2;
      }
      break;

    case 'fill':
      if (await handlePlanting(game, seasonMods, 'fill', silvicultureState, zoneProfile)) {
        journey.hoursRemaining -= 3;
      }
      break;

    case 'meeting':
      await handleContractorMeeting(game);
      journey.hoursRemaining -= 2;
      break;

    case 'briefing':
      handleTeamBriefing(game);
      journey.hoursRemaining -= 1;
      break;

    case 'rotation':
      if (await handleContractorRotation(game, silvicultureState, zoneProfile)) {
        journey.hoursRemaining -= 1;
      }
      break;

    default:
      break;
  }
}

/**
 * Handle planting with seasonal efficiency
 */
async function handlePlanting(game, seasonMods, stage = 'plant', silvicultureState = null, zoneProfile = null) {
  const { ui, journey } = game;
  const plantingEff = seasonMods?.plantingEfficiency ?? 1.0;
  const vegetationPressure = getVegetationPressure(journey);
  const activeState = silvicultureState || ensureSilvicultureState(journey);
  const pressure = zoneProfile || getSilvicultureZoneProfile(journey, activeState);
  const taskContractors = getSilvicultureTaskContractors(journey, pressure, stage);

  if (stage !== 'fill' && journey.planting.blocksPlanted >= journey.planting.blocksToPlant) {
    ui.write('All planting blocks are already complete. Shift effort elsewhere.');
    return false;
  }

  const activeContractors = taskContractors.length > 0
    ? taskContractors
    : journey.contractors.filter(c => c.isActive && (c.specialty === 'planting' || (stage === 'fill' && c.specialty === 'brushing')));
  const avgProductivity = activeContractors.length > 0
    ? activeContractors.reduce((sum, c) => {
      const profile = getSilvicultureContractorFit(c, pressure, stage);
      return sum + (c.productivity * profile);
    }, 0) / activeContractors.length
    : 50;

  const baseSeedlings = stage === 'fill' ? 7000 : 12500;
  const crowdingFactor = vegetationPressure > 0.15
    ? 1 - Math.min(0.18, vegetationPressure * 0.35)
    : 1;
  const zoneDrag = stage === 'fill'
    ? Math.min(0.22, pressure.fillPressure + pressure.survivalPenalty * 0.5)
    : Math.min(0.15, pressure.survivalPenalty + pressure.accessPressure * 0.4);
  const remainingAllocation = Math.max(0, journey.planting.seedlingsAllocated - journey.planting.seedlingsPlanted);
  const seedlingsRemaining = remainingAllocation;
  const seedlingsToPlant = Math.min(
    Math.round(baseSeedlings * (avgProductivity / 100) * plantingEff * crowdingFactor * (1 - zoneDrag)),
    journey.resources.seedlings,
    seedlingsRemaining
  );

  if (seedlingsToPlant <= 0) {
    ui.writeWarning(stage === 'fill'
      ? 'No viable fill planting remains for the current stand.'
      : 'No seedlings remain for this planting block.');
    return false;
  }

  journey.planting.seedlingsPlanted = Math.min(
    journey.planting.seedlingsAllocated,
    journey.planting.seedlingsPlanted + seedlingsToPlant
  );
  journey.resources.seedlings -= seedlingsToPlant;
  journey.resources.contractorCapacity -= 4;
  journey.resources.budget -= 2800;

  ui.write(stage === 'fill'
    ? `Filled ${seedlingsToPlant.toLocaleString()} seedlings into mortality gaps.`
    : `Planted ${seedlingsToPlant.toLocaleString()} seedlings.`);
  if (vegetationPressure > 0.15) {
    ui.writeWarning('Untreated brush is starting to crowd planted ground and slow the crew.');
  }
  if (plantingEff >= 1.2) {
    ui.writePositive('Spring conditions boosted planting efficiency!');
  } else if (plantingEff < 1.0 && plantingEff > 0) {
    ui.writeWarning('Off-season planting reduced efficiency.');
  }
  if (stage === 'fill') {
    ui.write('Fill planting tightens up the stand before brushing and survey work.');
  }
  if (pressure.survivalPenalty > 0.04 || pressure.accessPressure > 0.08) {
    ui.writeWarning(pressure.summary);
  }

  // Check if block is complete
  const plantingRatio = journey.planting.seedlingsAllocated > 0
    ? journey.planting.seedlingsPlanted / journey.planting.seedlingsAllocated
    : 0;
  const blocksCompleted = journey.planting.seedlingsPlanted >= journey.planting.seedlingsAllocated
    ? journey.planting.blocksToPlant
    : Math.floor(plantingRatio * journey.planting.blocksToPlant);

  if (blocksCompleted > journey.planting.blocksPlanted) {
    journey.planting.blocksPlanted = Math.min(blocksCompleted, journey.planting.blocksToPlant);
    ui.writePositive(`Block ${journey.planting.blocksPlanted} planting complete!`);
  }

  applySilvicultureContractorUsage(journey, activeContractors, pressure, stage);
  activeState.phase = stage === 'fill' ? 'brush' : 'survival';
  activeState.lastAction = stage;
  if (stage === 'fill' && getScrutinyPressure(journey) > 0) {
    adjustScrutiny(journey, 1);
  }

  return true;
}

/**
 * Handle brush control with seasonal efficiency
 */
async function handleHerbicide(game, seasonMods, silvicultureState = null, zoneProfile = null) {
  const { ui, journey } = game;
  const brushingEff = seasonMods?.brushingEfficiency ?? 1.0;
  const vegetationPressure = getVegetationPressure(journey);
  const activeState = silvicultureState || ensureSilvicultureState(journey);
  const pressure = zoneProfile || getSilvicultureZoneProfile(journey, activeState);
  const activeContractors = getSilvicultureTaskContractors(journey, pressure, 'brush');

  if (journey.brushing.hectaresComplete >= journey.brushing.hectaresTarget) {
    ui.write('Competing vegetation target already treated. Save the spray budget.');
    return false;
  }

  const avgProductivity = activeContractors.length > 0
    ? activeContractors.reduce((sum, c) => sum + (c.productivity * getSilvicultureContractorFit(c, pressure, 'brush')), 0) / activeContractors.length
    : 50;

  const baseHectares = 45;
  const brushBoost = vegetationPressure > 0.12 ? 1.2 : 1;
  const hectaresTreated = Math.min(
    Math.max(0, journey.brushing.hectaresTarget - journey.brushing.hectaresComplete),
    Math.round((baseHectares + 20) * (avgProductivity / 100) * brushingEff * brushBoost * (0.8 + Math.random() * 0.4))
  );

  if (hectaresTreated <= 0) {
    ui.write('No brushing hectares remain on the current program map.');
    return false;
  }

  journey.brushing.hectaresComplete = Math.min(
    journey.brushing.hectaresTarget,
    journey.brushing.hectaresComplete + hectaresTreated
  );
  journey.resources.contractorCapacity -= 2;
  journey.resources.budget -= 1800;

  ui.write(`Treated ${hectaresTreated} hectares of competing vegetation.`);
  if (pressure.brushPressure > 0.05) {
    ui.writeWarning(pressure.summary);
  }
  if (brushingEff >= 1.2) {
    ui.writePositive('Summer heat improved herbicide effectiveness!');
  }
  if (vegetationPressure > 0.15) {
    ui.writePositive('Brush control reopened planted ground and improved your survey outlook.');
  }

  applySilvicultureContractorUsage(journey, activeContractors, pressure, 'brush');
  activeState.phase = 'survey';
  activeState.lastAction = 'brush';

  return true;
}

/**
 * Handle survey with seasonal efficiency
 */
async function handleSurvey(game, seasonMods, silvicultureState = null, zoneProfile = null) {
  const { ui, journey } = game;
  const surveyEff = seasonMods?.surveyEfficiency ?? 1.0;
  const { plantRatio, brushRatio } = getSilvicultureRatios(journey);
  const vegetationPressure = getVegetationPressure(journey);
  const activeState = silvicultureState || ensureSilvicultureState(journey);
  const pressure = zoneProfile || getSilvicultureZoneProfile(journey, activeState);
  const scrutinyPressure = getScrutinyPressure(journey);
  const activeContractors = getSilvicultureTaskContractors(journey, pressure, 'survey');
  const rushedSurvey = activeState.phase !== 'survey' || brushRatio < Math.max(0.2, plantRatio - 0.08);

  if (journey.surveys.freeGrowingComplete >= journey.surveys.freeGrowingTarget) {
    ui.write('Free-growing survey target already met. Better spend the day planting or stabilizing contractors.');
    return false;
  }

  journey.surveys.regenerationSurveys++;
  journey.resources.budget -= 900;

  const hasSurveyor = journey.crew
    ? (crewHasRole(journey.crew, 'surveyor') || crewHasRole(journey.crew, 'spotter'))
    : false;
  const contractorSurveySupport = activeContractors.some((contractor) => {
    const specialty = String(contractor?.specialty || '').toLowerCase();
    return specialty === 'survey' || specialty === 'surveyor' || specialty === 'spotter';
  });
  const contractorLift = activeContractors.length > 0
    ? Math.min(0.1, activeContractors.reduce((sum, c) => sum + getSilvicultureContractorFit(c, pressure, 'survey'), 0) / (activeContractors.length * 20))
    : 0;
  const baseChance = (hasSurveyor || contractorSurveySupport) ? 0.7 : 0.56;
  const brushingSupport = brushRatio >= Math.max(0.35, plantRatio - 0.05) ? 0.1 : 0;
  let successChance = Math.min(0.9, baseChance * surveyEff + brushingSupport + contractorLift);
  if (rushedSurvey) {
    successChance = Math.max(0.18, successChance - 0.1);
  }
  if (vegetationPressure > 0.15) {
    successChance = Math.max(0.22, successChance - Math.min(0.18, vegetationPressure * 0.35));
  }
  if (scrutinyPressure > 0) {
    successChance = Math.max(0.18, successChance - Math.min(0.12, scrutinyPressure * 0.02));
  }

  if (Math.random() < successChance) {
    const surveyGain = (!rushedSurvey && surveyEff >= 1.1 && activeContractors.length > 0) ? 2 : 1;
    journey.surveys.freeGrowingComplete = Math.min(
      journey.surveys.freeGrowingTarget,
      journey.surveys.freeGrowingComplete + surveyGain
    );
    ui.writePositive(`Survey complete - ${surveyGain > 1 ? `${surveyGain} blocks` : 'block'} declared free-growing!`);
    if (rushedSurvey) {
      ui.writeWarning('The survey passes, but the rushed stand-tending sequence leaves extra scrutiny on the file.');
      adjustScrutiny(journey, 1);
    }
    if (surveyEff >= 1.2) {
      ui.write('Fall conditions provided ideal assessment conditions.');
    }
  } else {
    ui.write('Survey complete - more monitoring needed.');
    addDiscoveryTags(journey, ['regen_gap'], {
      source: 'silviculture:survey',
      severity: rushedSurvey ? 3 : 2,
      note: 'Survey results suggest the stand is not cleanly through the regen sequence yet.'
    });
    if (rushedSurvey) {
      ui.writeWarning('Rushed stand-tending is making the free-growing call harder to defend.');
      adjustScrutiny(journey, 1);
    }
    if (vegetationPressure > 0.15) {
      ui.writeWarning('Brush competition is making free-growing declarations harder to land.');
    }
    if (pressure.surveyPressure > 0.05) {
      ui.writeWarning(pressure.summary);
    }
  }

  applySilvicultureContractorUsage(journey, activeContractors, pressure, 'survey');
  activeState.phase = journey.surveys.freeGrowingComplete >= journey.surveys.freeGrowingTarget
    ? 'plant'
    : (brushRatio < Math.max(0.35, plantRatio - 0.05) ? 'brush' : 'survey');
  activeState.lastAction = 'survey';

  return true;
}

/**
 * Handle survival check (inspection equivalent)
 */
async function handleSurvivalCheck(game, seasonMods, silvicultureState = null, zoneProfile = null) {
  const { ui, journey } = game;
  const activeState = silvicultureState || ensureSilvicultureState(journey);
  const pressure = zoneProfile || getSilvicultureZoneProfile(journey, activeState);
  const plantingEff = seasonMods?.plantingEfficiency ?? 1.0;
  const activeContractors = getSilvicultureTaskContractors(journey, pressure, 'inspect');
  const baseSurvival = 70 + Math.floor(Math.random() * 25);
  const zoneDrag = Math.round((pressure.survivalPenalty + pressure.accessPressure * 0.35 + pressure.fillPressure * 0.25) * 100);
  const contractorLift = activeContractors.length > 0
    ? Math.min(5, Math.round(activeContractors.reduce((sum, c) => sum + getSilvicultureContractorFit(c, pressure, 'inspect'), 0)))
    : 0;
  const seasonalLift = plantingEff >= 1.15 ? 4 : plantingEff < 1 ? -3 : 0;
  const survivalRate = Math.max(50, Math.min(97, baseSurvival - zoneDrag + seasonalLift + contractorLift));
  journey.planting.survivalRate = survivalRate;
  activeState.lastSurvivalRate = survivalRate;
  activeState.phase = survivalRate < 88 || pressure.fillPressure > 0.05 ? 'fill' : 'brush';

  ui.writeHeader('SITE INSPECTION');
  ui.write(`Estimated survival rate: ${survivalRate}%`);
  if (pressure.survivalPenalty > 0.04 || pressure.accessPressure > 0.08) {
    ui.writeWarning(pressure.summary);
  }

  if (survivalRate >= 85) {
    ui.writePositive('Excellent survival! Planting quality is high.');
  } else if (survivalRate >= 70) {
    ui.write('Acceptable survival. Some fill planting may be needed.');
  } else {
    ui.writeWarning('Poor survival. Consider replanting affected areas.');
    addDiscoveryTags(journey, ['regen_gap'], {
      source: 'silviculture:survival_check',
      severity: 2,
      note: 'Survival checks suggest the stand will need more fill work before it settles.'
    });
  }

  if (getScrutinyPressure(journey) > 0 && survivalRate < 75) {
    adjustScrutiny(journey, 1);
  }

  applySilvicultureContractorUsage(journey, activeContractors, pressure, 'inspect');
  return true;
}

/**
 * Handle contractor meeting - choose specific contractor (Phase 4.2)
 */
async function handleContractorMeeting(game) {
  const { ui, journey } = game;
  const activeContractors = journey.contractors.filter(c => c.isActive);

  if (activeContractors.length === 0) {
    ui.write('No active contractors to meet with.');
    return;
  }

  const options = activeContractors.map(c => ({
    label: `${c.name} (${c.specialty})`,
    description: `Productivity: ${c.productivity}% | Morale: ${c.morale}%`,
    value: c.id
  }));

  const choice = await ui.promptChoice('Meet with which contractor?', options);
  const contractor = journey.contractors.find(c => c.id === choice.value);
  if (!contractor) return;

  // Meeting effects depend on contractor state
  if (contractor.morale < 40) {
    contractor.morale = Math.min(100, contractor.morale + 15);
    contractor.productivity = Math.min(100, contractor.productivity + 5);
    ui.write(`${contractor.name} appreciated the attention. Morale improved significantly.`);
  } else {
    contractor.morale = Math.min(100, contractor.morale + 8);
    contractor.productivity = Math.min(100, contractor.productivity + 8);
    ui.write(`Good meeting with ${contractor.name}. Relations and productivity improved.`);
  }
}

/**
 * Handle team briefing (for crew)
 */
function handleTeamBriefing(game) {
  const { ui, journey } = game;
  if (!journey.crew) return;

  for (const member of journey.crew) {
    if (member.isActive) {
      member.morale = Math.min(100, (member.morale || 50) + 15);
    }
  }

  ui.write('Team morale boosted. Your crew is ready to tackle the day.');
}

/**
 * Handle contractor event (Phase 4.2)
 */
async function handleContractorEvent(game, cEvent, contractor) {
  const { ui, journey } = game;
  const contractorState = ensureSilvicultureContractorState(contractor, journey, getSilvicultureZoneProfile(journey));
  const zoneProfile = getSilvicultureZoneProfile(journey);

  ui.clear();
  ui.writeHeader(`CONTRACTOR EVENT: ${cEvent.title}`);
  ui.write(cEvent.getText(contractor));
  ui.write('');

  const options = cEvent.options.map(opt => ({
    label: opt.label,
    description: '',
    value: opt.value
  }));

  const choice = await ui.promptChoice('How do you respond?', options);
  const selected = cEvent.options.find(o => o.value === choice.value);

  if (selected) {
    if (selected.cost > 0) {
      if (journey.resources.budget < selected.cost) {
        ui.writeWarning(`Not enough budget! ($${selected.cost} needed)`);
        // Apply the negative effect instead
        contractor.morale = Math.max(0, contractor.morale - 10);
        startSilvicultureContractorRecovery(contractor, 1, 'budget');
        return;
      }
      journey.resources.budget -= selected.cost;
    }
    contractor.morale = Math.max(0, Math.min(100, contractor.morale + selected.moraleGain));
    contractor.productivity = Math.max(20, Math.min(100, contractor.productivity + selected.prodGain));
    contractorState.fatigue = Math.max(0, contractorState.fatigue - 1);

    if (selected.hours) {
      journey.hoursRemaining = Math.max(0, journey.hoursRemaining - selected.hours);
    }

    if (selected.moraleGain > 0) {
      ui.writePositive(`${contractor.name} morale improved.`);
      if (selected.value === 'rest') {
        startSilvicultureContractorRecovery(contractor, 1, 'rest');
        if (getScrutinyPressure(journey) > 0 && zoneProfile.accessPressure > 0.08) {
          adjustScrutiny(journey, -1);
        }
      }
    } else if (selected.moraleGain < 0) {
      ui.writeWarning(`${contractor.name} is unhappy with the decision.`);
    }
  }
}

/**
 * Handle an event
 */
async function handleEvent(game, event) {
  const { ui, journey } = game;
  const formatted = formatEventForDisplay(event, journey.journeyType);

  ui.write('');
  ui.writeHeader(`EVENT: ${formatted.title}`);
  ui.write(formatted.description);
  ui.write('');

  const options = formatted.options.map((opt, index) => {
    const raw = event.options[index] || {};
    const requirement = raw.requiresRole ? `Requires ${formatRoleName(raw.requiresRole)}` : '';
    const pieces = [];
    if (opt.hint) pieces.push(opt.hint);
    if (requirement) pieces.push(requirement);
    return {
      label: opt.label,
      description: pieces.length ? `[${pieces.join(' | ')}]` : '',
      value: index
    };
  });

  let selectedOption = null;
  while (!selectedOption) {
    const choice = await ui.promptChoice('What do you do?', options);
    const optionIndex = typeof choice.value === 'number' ? choice.value : 0;
    const candidate = event.options[optionIndex];
    if (candidate?.requiresRole && journey.crew && !crewHasRole(journey.crew, candidate.requiresRole)) {
      ui.writeWarning(`You need a ${formatRoleName(candidate.requiresRole)} to do that.`);
      continue;
    }
    selectedOption = candidate;
  }

  const result = resolveEvent(journey, event, selectedOption);

  ui.write('');
  for (const msg of result.messages) {
    ui.write(msg);
  }

  if (selectedOption.gameOver) {
    game.gameOver = true;
    journey.endReason = selectedOption.gameOverReason || 'Event outcome';
  }
}

function formatRoleName(roleId) {
  if (!roleId) return 'specialist';
  const formatted = roleId.replace(/[_-]+/g, ' ').trim();
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function safeRatio(current, target) {
  if (!Number.isFinite(target) || target <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, (Number(current) || 0) / target));
}

function getSilvicultureRatios(journey) {
  return {
    plantRatio: safeRatio(journey?.planting?.blocksPlanted, journey?.planting?.blocksToPlant),
    brushRatio: safeRatio(journey?.brushing?.hectaresComplete, journey?.brushing?.hectaresTarget),
    surveyRatio: safeRatio(journey?.surveys?.freeGrowingComplete, journey?.surveys?.freeGrowingTarget),
  };
}

function getVegetationPressure(journey) {
  const { plantRatio, brushRatio } = getSilvicultureRatios(journey);
  return Math.max(0, plantRatio - brushRatio);
}

function ensureSilvicultureState(journey) {
  if (!journey.silvicultureState) {
    journey.silvicultureState = {
      phase: getInitialSilviculturePhase(journey),
      cycle: 1,
      lastAction: null,
      lastSurvivalRate: null,
      zonePressure: null,
    };
  } else {
    journey.silvicultureState.phase ||= getInitialSilviculturePhase(journey);
    journey.silvicultureState.cycle ||= 1;
  }

  if (!journey.silvicultureState.zonePressure) {
    journey.silvicultureState.zonePressure = getSilvicultureZoneProfile(journey);
  }

  return journey.silvicultureState;
}

function getSilvicultureZonePressure(journey) {
  return getSilvicultureZoneProfile(journey);
}

function getInitialSilviculturePhase(journey) {
  if ((journey?.planting?.blocksPlanted || 0) < (journey?.planting?.blocksToPlant || 0)) {
    return 'plant';
  }
  if ((journey?.planting?.survivalRate || 0) < 88) {
    return 'fill';
  }
  if ((journey?.brushing?.hectaresComplete || 0) < (journey?.brushing?.hectaresTarget || 0)) {
    return 'brush';
  }
  if ((journey?.surveys?.freeGrowingComplete || 0) < (journey?.surveys?.freeGrowingTarget || 0)) {
    return 'survey';
  }
  return 'survey';
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

function getSilvicultureTaskSummary(journey, zoneProfile, task) {
  const contractors = getSilvicultureTaskContractors(journey, zoneProfile, task, false);
  const readyCount = journey.contractors.filter(c => {
    const state = ensureSilvicultureContractorState(c, journey, zoneProfile);
    return !c.isActive && state.status === 'ready';
  }).length;
  const recoveringCount = journey.contractors.filter(c => {
    const state = ensureSilvicultureContractorState(c, journey, zoneProfile);
    return state.status === 'recovering' || state.cooldownDays > 0;
  }).length;
  const bestFit = contractors[0];
  const fitText = bestFit
    ? `${bestFit.name.split(' ')[0]} fit ${Math.round(getSilvicultureContractorFit(bestFit, zoneProfile, task) * 100)}%`
    : 'no deployed specialist';
  return `${fitText} | ready ${readyCount} | recovering ${recoveringCount}`;
}

function getSilvicultureContractorRoster(journey, zoneProfile) {
  const deployed = [];
  const ready = [];
  const recovering = [];

  for (const contractor of journey.contractors || []) {
    const state = ensureSilvicultureContractorState(contractor, journey, zoneProfile);
    const fit = Math.round(getSilvicultureContractorFit(contractor, zoneProfile, contractor.specialty === 'brushing' ? 'brush' : 'plant') * 100);
    const traitLabel = state.traits.slice(0, 2).join(',');
    if (state.status === 'recovering' || state.cooldownDays > 0) {
      recovering.push(`${contractor.name.split(' ')[0]}: REST ${state.cooldownDays || 1}d [${traitLabel || 'general'}]`);
      continue;
    }
    if (contractor.isActive) {
      deployed.push(`${contractor.name.split(' ')[0]}: ${contractor.productivity}%P/${contractor.morale}%M (${fit}% fit)`);
      continue;
    }
    ready.push(`${contractor.name.split(' ')[0]}: READY (${fit}% fit)`);
  }

  const lines = [
    ...deployed,
    ...ready,
    ...recovering,
  ];
  const summary = `${deployed.length} deployed, ${ready.length} ready, ${recovering.length} recovering`;
  const rotationSummary = deployed.length > 0
    ? `stand down or rest tired crews`
    : `deploy ready contractors`;

  return { lines, summary, rotationSummary };
}

function getSilvicultureTaskContractors(journey, zoneProfile, task, deployMissing = true) {
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

    if (contractor.isActive) {
      fallback.push({ contractor, fit });
    }
  }

  const autoDeployPool = ready.length > 0 ? ready : fallback;
  if (deployMissing && eligible.length === 0 && autoDeployPool.length > 0) {
    const chosen = [...autoDeployPool]
      .sort((a, b) => b.fit - a.fit)
      .slice(0, Math.max(1, Math.min(2, taskTraits.length > 0 ? 2 : 1)));
    for (const entry of chosen) {
      deploySilvicultureContractor(entry.contractor, zoneProfile, task);
    }
    return chosen.map(entry => entry.contractor);
  }

  return eligible
    .sort((a, b) => b.fit - a.fit)
    .map(entry => entry.contractor);
}

function matchesSilvicultureTask(contractor, task) {
  if (!contractor) {
    return false;
  }

  if (task === 'fill') {
    return contractor.specialty === 'planting' || contractor.specialty === 'brushing';
  }

  if (task === 'inspect') {
    return contractor.specialty === 'survey' || contractor.specialty === 'surveyor' || contractor.specialty === 'spotter' || contractor.specialty === 'planting';
  }

  if (task === 'survey') {
    return contractor.specialty === 'survey' || contractor.specialty === 'surveyor' || contractor.specialty === 'spotter';
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

  if (zoneProfile?.surveyPressure > 0.05 && (traits.includes('survey-minded') || traits.includes('process-cautious') || task === 'survey' || task === 'inspect')) {
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
  const options = (journey.contractors || []).map((contractor) => {
    const state = ensureSilvicultureContractorState(contractor, journey, pressure);
    const fit = Math.round(getSilvicultureContractorFit(contractor, pressure, contractor.specialty === 'brushing' ? 'brush' : 'plant') * 100);
    const statusLabel = state.status === 'recovering'
      ? `rest ${state.cooldownDays || 1}d`
      : contractor.isActive
        ? 'deployed'
        : 'ready';
    return {
      label: `${contractor.name} (${contractor.specialty})`,
      description: `${statusLabel} | ${fit}% fit | ${state.traits.slice(0, 2).join(', ') || 'general'}`,
      value: contractor.id,
    };
  });

  if (options.length === 0) {
    ui.write('No contractors to rotate.');
    return false;
  }

  const choice = await ui.promptChoice('Adjust which contractor?', options);
  const contractor = journey.contractors.find((c) => c.id === choice.value);
  if (!contractor) {
    return false;
  }

  const state = ensureSilvicultureContractorState(contractor, journey, pressure);
  if (state.status === 'recovering' || state.cooldownDays > 0) {
    ui.writeWarning(`${contractor.name} is still recovering for ${state.cooldownDays || 1} day${(state.cooldownDays || 1) === 1 ? '' : 's'}.`);
    if (getScrutinyPressure(journey) > 0 && pressure.accessPressure > 0.08) {
      adjustScrutiny(journey, -1);
    }
    return false;
  }

  if (contractor.isActive) {
    const restDays = Math.max(1, Math.min(3, 1 + Math.floor((state.fatigue || 0) / 2) + (pressure.accessPressure > 0.08 ? 1 : 0)));
    startSilvicultureContractorRecovery(contractor, restDays, 'rotation');
    ui.write(`${contractor.name} is stood down for ${restDays} day${restDays > 1 ? 's' : ''} of recovery.`);
    if (getScrutinyPressure(journey) > 0 && (pressure.surveyPressure > 0.05 || pressure.brushPressure > 0.05)) {
      adjustScrutiny(journey, -1);
    }
    return true;
  }

  deploySilvicultureContractor(contractor, pressure, contractor.specialty === 'brushing' ? 'brush' : 'plant');
  ui.writePositive(`${contractor.name} is deployed back onto the crew.`);
  if (getScrutinyPressure(journey) > 0 && pressure.accessPressure > 0.08) {
    adjustScrutiny(journey, -1);
  }
  return true;
}

function formatSilviculturePhase(phase) {
  switch (phase) {
    case 'plant':
      return 'Plant';
    case 'survival':
      return 'Survival Check';
    case 'fill':
      return 'Fill Planting';
    case 'brush':
      return 'Brush';
    case 'survey':
      return 'Survey';
    default:
      return 'Plant';
  }
}
