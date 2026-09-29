/**
 * Scoring & Grading System
 * Calculates a letter grade (A-F) based on journey performance
 */

import { assessSilvicultureProgram } from './data/silvicultureProgram.js';
import { summarizeIntegrity } from './modes/silvicultureIntegrity.js';
import { PLANNING_DECISION_GATE, PLANNING_VALUES_FLOOR } from './journey/constants.js';

/**
 * Calculate final score for a completed journey
 * @param {Object} journey - Journey state at end of game
 * @param {boolean} victory - Whether the player won
 * @returns {Object} Score breakdown with letter grade
 */
export const SCORE_WEIGHT_PERCENTS = { objectives: 30, compliance: 25, crewWelfare: 25, resourceEfficiency: 10, speed: 10 };

export function calculateScore(journey, victory) {
  const components = {};

  switch (journey.journeyType) {
    case 'recon':
    case 'field':
      components.speed = scoreReconSpeed(journey);
      components.crewWelfare = scoreCrewWelfare(journey);
      components.resourceEfficiency = scoreResourceEfficiency(journey);
      components.objectives = scoreReconObjectives(journey, victory);
      components.compliance = scoreSituationsClosedClean(journey);
      break;

    case 'silviculture':
      components.speed = scoreSilvicultureSpeed(journey, victory);
      components.crewWelfare = scoreCrewWelfare(journey);
      components.resourceEfficiency = scoreSilvicultureResources(journey);
      components.objectives = scoreSilvicultureObjectives(journey, victory);
      components.compliance = scoreSituationsClosedClean(journey);
      break;

    case 'planning':
      components.speed = scorePlanningSpeed(journey, victory);
      components.crewWelfare = scoreProtagonistWelfare(journey);
      components.resourceEfficiency = scoreDeskResourceEfficiency(journey, victory);
      components.objectives = scorePlanningObjectives(journey, victory);
      components.compliance = scoreSituationsClosedClean(journey);
      break;

    case 'permitting':
    case 'desk':
      components.speed = scorePermittingSpeed(journey, victory);
      components.crewWelfare = scoreProtagonistWelfare(journey);
      components.resourceEfficiency = scoreDeskResourceEfficiency(journey, victory);
      components.objectives = scorePermittingObjectives(journey, victory);
      components.compliance = scoreSituationsClosedClean(journey);
      break;

    case 'manager':
      components.speed = scoreManagerTerm(journey);
      components.crewWelfare = scoreCrewWelfare(journey);
      components.resourceEfficiency = scoreManagerResources(journey);
      components.objectives = scoreManagerObjectives(journey, victory);
      components.compliance = scoreSituationsClosedClean(journey);
      break;
  }

  // Weighted total: Objectives 30%, Compliance 25%, Crew 25%, Resources 10%,
  // Time 10%. Delivering the work and keeping the file clean carry the grade;
  // speed and leftover supplies are minor.
  const weights = { objectives: 0.30, compliance: 0.25, crewWelfare: 0.25, resourceEfficiency: 0.10, speed: 0.10 };
  let weighted = 0;
  for (const [key, weight] of Object.entries(weights)) {
    weighted += (components[key]?.score || 0) * weight;
  }

  // Victory bonus is reported separately so the displayed breakdown always
  // reconciles with the total (a silent +10 made "A (100/100)" contradict
  // components that summed to ~94).
  const baseScore = Math.round(weighted);
  const victoryBonus = victory ? Math.min(10, 100 - baseScore) : 0;
  const scrutinyPenalty = scoreScrutinyPenalty(journey);
  const integrityPenalty = scoreIntegrityPenalty(journey);
  const scoreCap = scoreFailureCap(journey, victory);
  const totalScore = Math.min(scoreCap ?? 100, Math.max(0, baseScore + victoryBonus - scrutinyPenalty - integrityPenalty));
  const grade = getLetterGrade(totalScore);

  return { totalScore, grade, components, victory, baseScore, victoryBonus, scrutinyPenalty, integrityPenalty, scoreCap };
}

/**
 * What a silviculture run's caught shortcuts cost, on top of scrutiny. A
 * falsified plot card or declaration the district has found is not a bad
 * day on the file; it is the file (js/modes/silvicultureIntegrity.js).
 * @param {Object} journey
 * @returns {number}
 */
export function scoreIntegrityPenalty(journey) {
  if (journey?.journeyType !== 'silviculture') return 0;
  return summarizeIntegrity(journey).penalty;
}

/**
 * The ceiling on a silviculture program that was not delivered. Crew welfare,
 * a clean file and an unspent budget are easy to keep by doing nothing, so a
 * failed program tops out at D, and one that delivered under half of its
 * obligations at F.
 * @returns {number|null}
 */
export function scoreFailureCap(journey, victory) {
  if (victory || journey?.journeyType !== 'silviculture') return null;
  return assessSilvicultureProgram(journey).delivered < 0.5 ? 40 : 54;
}

/**
 * What a run's accumulated scrutiny costs it at the end.
 *
 * Scrutiny is charged everywhere — moving without ground-truthing access,
 * closing a package from the notebook, and now declining the day's situation
 * (js/journey/daySituation.js) — but nothing in this file used to read it, so
 * a standalone expedition could finish with a file nobody would defend and
 * still score an A. It had partial teeth elsewhere (event frequency in
 * js/events/selection.js:239, a survey roll in js/modes/silviculture.js:795,
 * the campaign's season compliance in js/game/campaign.js:188) but never
 * touched the grade the player is actually shown.
 *
 * Reported separately rather than folded into the weights, so the displayed
 * breakdown still reconciles and the player can see exactly what the file cost
 * them. Below 30 is the normal working range and is free.
 * @param {Object} journey
 * @returns {number} 0-15
 */
export function scoreScrutinyPenalty(journey) {
  const scrutiny = Number(journey?.scrutiny ?? journey?.heat ?? 0);
  if (!Number.isFinite(scrutiny) || scrutiny <= 30) return 0;
  return Math.min(15, Math.round((scrutiny - 30) / 4.5));
}

export function getLetterGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

// --- Speed Scoring ---

function scoreReconSpeed(journey) {
  const daysUsed = journey.day - 1;
  // Two shifts a block plus the legs between stops is the competent pace.
  const totalBlocks = journey.blocks?.length || 10;
  const packages = Number.isFinite(journey.packageTarget) ? journey.packageTarget : totalBlocks;
  const optimalDays = journey.journeyType === 'recon'
    ? Math.ceil(packages * 2 + Math.max(0, totalBlocks - 1) * 0.8)
    : Math.ceil(totalBlocks * 0.8);
  const ratio = optimalDays / Math.max(1, daysUsed);
  const score = Math.min(100, Math.round(ratio * 80));
  return { score, label: `${daysUsed} shifts (optimal: ~${optimalDays})` };
}

// Pace only counts for work that got done: a program that ran out the season
// having delivered a third of itself was not fast, it was short.
function scoreSilvicultureSpeed(journey, victory) {
  const daysUsed = journey.day - 1;
  const optimalDays = 30;
  const ratio = optimalDays / Math.max(1, daysUsed);
  const pace = Math.min(100, Math.round(ratio * 75));
  if (victory) return { score: pace, label: `${daysUsed} days` };
  const delivered = assessSilvicultureProgram(journey).delivered;
  return { score: Math.round(pace * delivered), label: `${daysUsed} days, program not delivered` };
}

/**
 * Days spent only count for something when the file was delivered. Scoring
 * the unused calendar of a run that failed made being pulled off the file on
 * day 11 worth more Time than winning on day 18.
 */
function undeliveredSpeed(daysUsed, deadline) {
  return { score: 0, label: `${daysUsed}/${deadline} days used; not delivered` };
}

function scorePlanningSpeed(journey, victory = true) {
  const daysUsed = journey.day - 1;
  const deadline = journey.deadline || 18;
  if (!victory) return undeliveredSpeed(daysUsed, deadline);
  const optimalDays = Math.max(8, Math.round(deadline * 0.75));
  const ratio = optimalDays / Math.max(1, daysUsed);
  const score = Math.min(100, Math.round(ratio * 75));
  return { score, label: `${daysUsed}/${deadline} days used` };
}

function scorePermittingSpeed(journey, victory = true) {
  const daysUsed = journey.day - 1;
  const deadline = journey.deadline || 30;
  if (!victory) return undeliveredSpeed(daysUsed, deadline);
  const daysRemaining = Math.max(0, deadline - daysUsed);
  const score = Math.min(100, Math.round((daysRemaining / deadline) * 100) + 20);
  return { score: Math.min(100, score), label: `${daysUsed}/${deadline} days used` };
}

// Manager "speed" is staying power: surviving deeper into the term scores higher.
function scoreManagerTerm(journey) {
  const monthsServed = journey.day - 1;
  const deadline = journey.deadline || 12;
  const score = Math.min(100, Math.round((monthsServed / deadline) * 100));
  return { score, label: `${monthsServed}/${deadline} months served` };
}

// --- Crew Welfare Scoring ---

function scoreCrewWelfare(journey) {
  const crew = journey.crew || [];
  if (crew.length === 0) return { score: 50, label: 'No crew' };

  const active = crew.filter(m => m.isActive);
  // Nobody dies out here; the serious outcome is an evacuation (a medevac or
  // an ETV run, WorkSafeBC notified, off the crew for the season).
  const evacuated = crew.filter(m => !m.isActive && !m.hasQuit);
  const quit = crew.filter(m => m.hasQuit);

  let score = 50;

  // Bonus for bringing everyone home on their own feet
  if (evacuated.length === 0) score += 20;
  if (quit.length === 0) score += 10;
  score -= evacuated.length * 15;
  score -= quit.length * 8;

  // Average health and morale of survivors
  if (active.length > 0) {
    const avgHealth = active.reduce((s, m) => s + m.health, 0) / active.length;
    const avgMorale = active.reduce((s, m) => s + m.morale, 0) / active.length;
    score += Math.round((avgHealth - 50) / 5);
    score += Math.round((avgMorale - 50) / 5);
  }

  score = Math.max(0, Math.min(100, score));
  const label = `${active.length}/${crew.length} active, ${evacuated.length} evacuated`;
  return { score, label };
}

/**
 * The desk roles have no crew; the person carrying the file is the one whose
 * welfare the season spends. Stress that ends high and energy that ends low
 * both cost.
 */
function scoreProtagonistWelfare(journey) {
  if (journey.crew?.length) return scoreCrewWelfare(journey);
  const protagonist = journey.protagonist;
  if (!protagonist) return { score: 50, label: 'N/A' };
  const stress = Math.max(0, Math.min(100, Number(protagonist.stress) || 0));
  const energy = Math.max(0, Math.min(100, Number(protagonist.energy ?? 100)));
  const score = Math.max(0, Math.min(100, Math.round(100 - stress * 0.6 - Math.max(0, 50 - energy) * 0.6)));
  return { score, label: `Your stress ${Math.round(stress)}%, energy ${Math.round(energy)}%`, name: 'Wellbeing' };
}

/** Share of the desk's job that got done, 0-1. */
function deskDeliveredShare(journey) {
  if (journey.journeyType === 'planning') {
    const plan = journey.plan || {};
    const fomClosed = journey.blockPlanning?.fom?.status === 'closed' ? 1 : 0;
    return (Math.min(1, (plan.dataCompleteness || 0) / 80)
      + Math.min(1, (plan.analysisQuality || 0) / 80)
      + Math.min(1, (plan.stakeholderBuyIn || 0) / 75)
      + Math.min(1, (plan.ministerialConfidence || 0) / PLANNING_DECISION_GATE)
      + fomClosed) / 5;
  }
  const permits = journey.permits || {};
  return permits.target > 0 ? Math.min(1, (permits.approved || 0) / permits.target) : 0;
}

// --- Resource Efficiency Scoring ---

function scoreResourceEfficiency(journey) {
  const r = journey.resources || {};
  let score = 50;

  // Remaining resources are good (didn't waste), but having too much means journey was too easy
  const fuelPct = (r.fuel || 0) / 320;
  const foodPct = (r.food || 0) / 40;
  const equipPct = (r.equipment || 0) / 85;

  // Sweet spot: 10-40% remaining
  score += scoreSweetSpot(fuelPct) * 15;
  score += scoreSweetSpot(foodPct) * 15;
  score += scoreSweetSpot(equipPct) * 10;

  // Penalty for running out
  if (r.fuel <= 0) score -= 15;
  if (r.food <= 0) score -= 15;

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, label: `Fuel: ${Math.round(r.fuel || 0)} L, Food: ${Math.round(r.food || 0)} person-days` };
}

function scoreDeskResourceEfficiency(journey, victory = true) {
  const r = journey.resources || {};
  let score = 50;

  const budgetStart = Number.isFinite(journey.budgetStart) && journey.budgetStart > 0 ? journey.budgetStart
    : journey.journeyType === 'silviculture' ? 100000
      : journey.journeyType === 'planning' ? 50000 : 35000;
  const budgetPct = (r.budget || 0) / budgetStart;
  score += scoreSweetSpot(budgetPct) * 25;

  const polCapPct = (r.politicalCapital || 0) / 40;
  score += scoreSweetSpot(polCapPct) * 15;

  if (r.budget <= 0) score -= 20;
  if (r.politicalCapital <= 0) score -= 20;

  // Money left on a file that was never delivered was not saved, it was
  // unspent: an idle season kept its whole budget.
  const deskRole = ['planning', 'permitting', 'desk'].includes(journey.journeyType);
  if (deskRole && !victory) score *= deskDeliveredShare(journey);

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, label: `Budget: $${Math.round(r.budget || 0).toLocaleString()}` };
}

// The program budget against what it bought. Money left because the work
// was never done is not efficiency, so the margin is scaled by delivery.
function scoreSilvicultureResources(journey) {
  const budget = Number(journey.resources?.budget) || 0;
  const start = Number(journey.program?.budgetStart) || 380000;
  const delivered = assessSilvicultureProgram(journey).delivered;
  const margin = budget <= 0 ? 0 : 40 + scoreSweetSpot(budget / start) * 60;
  return {
    score: Math.max(0, Math.min(100, Math.round(margin * delivered))),
    label: `Budget: $${Math.round(budget).toLocaleString()} of $${Math.round(start).toLocaleString()} left`,
  };
}

function scoreManagerResources(journey) {
  const r = journey.resources || {};
  let score = 50;

  const budgetPct = (r.budget || 0) / 500000;
  score += scoreSweetSpot(budgetPct) * 25;

  const polCapPct = (r.politicalCapital || 0) / 100;
  score += scoreSweetSpot(polCapPct) * 15;

  if (r.budget <= 0) score -= 20;

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, label: `Budget: $${Math.round(r.budget || 0).toLocaleString()}` };
}

// Returns 0-1. Running out is the failure; carrying margin home is good
// practice, not "the journey was too easy", so there is no upper penalty.
export function scoreSweetSpot(pct) {
  if (pct <= 0) return 0;
  if (pct < 0.1) return 0.3;
  if (pct < 0.25) return 0.7;
  return 1.0;
}

// --- Objectives Scoring ---

function scoreReconObjectives(journey, victory) {
  let score = victory ? 70 : 20;
  const progress = journey.totalDistance > 0
    ? journey.distanceTraveled / journey.totalDistance
    : 0;
  score += Math.round(progress * 30);
  score = Math.min(100, score);
  return { score, label: `${Math.round(progress * 100)}% traversed` };
}

// Every obligation on the program counts: planting and its plots, fill,
// release, the declarations, and how well the trees went in
// (PROGRAM_TRACK_WEIGHTS in js/data/silvicultureProgram.js).
function scoreSilvicultureObjectives(journey) {
  const assessment = assessSilvicultureProgram(journey);
  return {
    score: Math.max(0, Math.min(100, Math.round(assessment.delivered * 100))),
    label: assessment.label,
  };
}

function scorePlanningObjectives(journey, victory) {
  let score = victory ? 60 : 10;
  const plan = journey.plan || {};
  score += Math.round((plan.dataCompleteness || 0) / 10);
  score += Math.round((plan.analysisQuality || 0) / 10);
  score += Math.round((plan.stakeholderBuyIn || 0) / 10);
  score += Math.round((plan.ministerialConfidence || 0) / 10);
  // A plan that answers every objective is a better plan than one that
  // clears the gate on timber alone; a package the District Manager's office
  // sent back unread is on the file.
  const values = journey.values || {};
  const weakest = Math.min(...['biodiversity', 'timberSupply', 'communityNeeds', 'firstNationsValues']
    .map((key) => Number(values[key] ?? 50)));
  score += Math.round((weakest - PLANNING_VALUES_FLOOR) / 4);
  const returned = plan.submissionsReturned || 0;
  score -= returned * 3;
  score = Math.max(0, Math.min(100, score));
  const returnedLabel = returned ? `, ${returned} submission${returned === 1 ? '' : 's'} returned` : '';
  return { score, label: `DM readiness ${Math.round(plan.ministerialConfidence || 0)}%, weakest value ${Math.round(weakest)}%${returnedLabel}` };
}

function scorePermittingObjectives(journey, victory) {
  let score = victory ? 60 : 10;
  const permits = journey.permits || {};
  const approvalRate = permits.target > 0 ? permits.approved / permits.target : 0;
  score += Math.round(approvalRate * 40);
  score = Math.min(100, score);
  return { score, label: `${permits.approved}/${permits.target} approved` };
}

function scoreManagerObjectives(journey, victory) {
  let score = victory ? 55 : 10;
  const reputation = journey.metrics?.reputation ?? 50;
  score += Math.round((reputation / 100) * 25);
  score += Math.min(20, (journey.certifications?.length || 0) * 10);
  score = Math.min(100, score);
  const certLabel = journey.certifications?.length
    ? `, ${journey.certifications.length} certification${journey.certifications.length > 1 ? 's' : ''}`
    : '';
  return { score, label: `Reputation ${Math.round(reputation)}%${certLabel}` };
}

// --- Compliance Scoring ---

/**
 * A situation is "closed clean" when the way it was handled cost no
 * compliance, raised no scrutiny, and hurt nobody. More situations are not
 * more experience — what counts is the share the file can defend.
 */
export function isSituationClosedClean(entry) {
  if (!entry || entry.type !== 'event') return false;
  if (entry.victimId || entry.victimName) return false;
  const effects = entry.effects || {};
  if (Number(effects.compliance || 0) < 0) return false;
  if (Number(effects.scrutiny || 0) > 0) return false;
  return true;
}

export function scoreSituationsClosedClean(journey) {
  const log = journey.log || [];
  const situations = log.filter((e) => e.type === 'event');
  if (situations.length === 0) return { score: 60, label: 'No situations logged' };

  const clean = situations.filter(isSituationClosedClean).length;
  const share = clean / situations.length;
  const score = Math.round(25 + share * 75);
  return { score, label: `${clean} of ${situations.length} situation${situations.length === 1 ? '' : 's'} closed clean` };
}

/**
 * Format score breakdown for display
 * @param {Object} scoreResult - Result from calculateScore()
 * @returns {string[]} Array of display lines
 */
export function formatScoreDisplay(scoreResult) {
  const lines = [];
  const { totalScore, grade, components } = scoreResult;

  lines.push(`FINAL GRADE: ${grade} (${totalScore}/100)`);
  lines.push('');

  const labels = {
    objectives: 'Objectives',
    compliance: 'Compliance',
    crewWelfare: 'Crew Welfare',
    resourceEfficiency: 'Resources',
    speed: 'Time',
  };

  const weights = SCORE_WEIGHT_PERCENTS;

  for (const key of Object.keys(labels)) {
    const component = components[key];
    if (!component) continue;
    const name = component.name || labels[key] || key;
    const weight = weights[key] || 0;
    const bar = makeBar(component.score, 10);
    lines.push(`  ${name.padEnd(14)} [${bar}] ${component.score}/100 (${weight}%) - ${component.label}`);
  }

  if (scoreResult.victoryBonus > 0) {
    lines.push(`  ${'Completed'.padEnd(14)} +${scoreResult.victoryBonus} bonus for finishing the expedition`);
  }

  if (scoreResult.scrutinyPenalty > 0) {
    lines.push(`  ${'Scrutiny'.padEnd(14)} -${scoreResult.scrutinyPenalty} for what the file carries`);
  }

  if (scoreResult.integrityPenalty > 0) {
    lines.push(`  ${'Integrity'.padEnd(14)} -${scoreResult.integrityPenalty} for shortcuts the district found`);
  }

  if (Number.isFinite(scoreResult.scoreCap)) {
    lines.push(`  ${'Not delivered'.padEnd(14)} a program that missed its obligations grades no higher than ${getLetterGrade(scoreResult.scoreCap)}`);
  }

  return lines;
}

function makeBar(value, width) {
  const filled = Math.round((value / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}
