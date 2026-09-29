/**
 * Scoring & Grading System
 * Calculates a letter grade (A-F) based on journey performance
 */

import { assessSilvicultureProgram } from './data/silvicultureProgram.js';
import { summarizeIntegrity } from './modes/silvicultureIntegrity.js';
import { PLANNING_DECISION_GATE, PLANNING_VALUES_FLOOR } from './journey/constants.js';
import { getPackageTarget, getPackagesFinalized } from './journey/packages.js';
import { formatDollars } from './resources.js';

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
      components.speed = scoreReconSpeed(journey, victory);
      components.crewWelfare = scoreReconCrewWelfare(journey);
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
      components.crewWelfare = scoreProtagonistWelfare(journey, victory);
      components.resourceEfficiency = scoreDeskResourceEfficiency(journey, victory);
      components.objectives = scorePlanningObjectives(journey, victory);
      components.compliance = scoreSituationsClosedClean(journey);
      break;

    case 'permitting':
    case 'desk':
      components.speed = scorePermittingSpeed(journey, victory);
      components.crewWelfare = scoreProtagonistWelfare(journey, victory);
      components.resourceEfficiency = scoreDeskResourceEfficiency(journey, victory);
      components.objectives = scorePermittingObjectives(journey, victory);
      components.compliance = scoreSituationsClosedClean(journey);
      break;

    case 'manager':
      components.speed = scoreManagerTerm(journey);
      components.crewWelfare = scoreCrewWelfare(journey);
      components.resourceEfficiency = scoreManagerResources(journey);
      components.objectives = scoreManagerObjectives(journey, victory);
      components.compliance = scoreManagerCompliance(journey);
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
  // A GM's win is already scored inside the components (the cut-control
  // band, the issued certificate, the reputation bar), so the flat bonus is
  // half: at ten it padded every competent year to 100, and the operating
  // posture and the certificate never showed in the grade. A recon win
  // already carries its weight in Objectives (a closed file against a partial
  // one), so it gets no flat bonus at all: +10 on top put every careful
  // season at 100/100.
  const bonusless = journey.journeyType === 'recon' || journey.journeyType === 'field';
  const victoryBonusCap = journey.journeyType === 'manager' ? 5 : 10;
  const victoryBonus = victory && !bonusless ? Math.min(victoryBonusCap, 100 - baseScore) : 0;
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
 * The ceiling on a field season that was not delivered. Crew welfare, a clean
 * file and unspent stores are easy to keep by doing nothing, so a failed
 * silviculture program or recon season tops out at D, and one that delivered
 * under half of its obligations at F. A recon crew that stood down until the
 * food ran out used to grade D 50 on a file of set-aside cards.
 * @returns {number|null}
 */
export function scoreFailureCap(journey, victory) {
  if (victory) return null;
  if (journey?.journeyType === 'silviculture') {
    return assessSilvicultureProgram(journey).delivered < 0.5 ? 40 : 54;
  }
  if (journey?.journeyType === 'recon') {
    const target = getPackageTarget(journey);
    const share = target > 0 ? getPackagesFinalized(journey) / target : 0;
    return share < 0.5 ? 40 : 54;
  }
  return null;
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

/**
 * Recon pace against the season. Two shifts a package and a shift a leg is a
 * clean run with nothing going wrong: full marks at or under it. Every shift
 * over it costs, measured against the clean run rather than the whole window,
 * down to a floor of 40 once the season has run 60% over; a 40-shift window
 * made seven extra shifts on an 18-shift route cost almost nothing.
 * A season that was not delivered earns no Time: collapsing on shift 13 used
 * to read as the fastest season on record.
 */
function scoreReconSpeed(journey, victory = true) {
  const daysUsed = journey.day - 1;
  const totalBlocks = journey.blocks?.length || 10;
  const packages = journey.journeyType === 'recon' ? getPackageTarget(journey) : 0;
  const optimalDays = journey.journeyType === 'recon'
    ? Math.ceil(packages * 2 + Math.max(0, totalBlocks - 1))
    : Math.ceil(totalBlocks * 0.8);
  if (!victory) {
    return { score: 0, label: `${daysUsed} shifts; season not delivered` };
  }
  const deadline = Number.isFinite(journey.deadline) && journey.deadline > optimalDays
    ? journey.deadline
    : Math.round(optimalDays * 1.6);
  const over = Math.max(0, Math.min(1, (daysUsed - optimalDays) / Math.max(1, optimalDays * 0.6)));
  const score = Math.round(100 - over * 60);
  return { score, label: `${daysUsed} shifts (clean run: ~${optimalDays}, window: ${deadline})` };
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
 * A recon crew's season, not just how it looked on the last shift. Everyone
 * home on their own feet and in good heart is full marks; what the season
 * cost them comes off it: an evacuation, a quit, a crew that drove out when
 * the food ran out, each injury the log recorded, and whatever health and
 * morale they finish short of. The old scale started at 80 for anyone not
 * evacuated, so a crew that spent the season hurt still read 95.
 * @param {Object} journey
 * @returns {{score: number, label: string}}
 */
function scoreReconCrewWelfare(journey) {
  const crew = journey.crew || [];
  if (crew.length === 0) return { score: 50, label: 'No crew' };

  const walkedOff = Boolean(journey.crewWalkedOff);
  const active = walkedOff ? [] : crew.filter((m) => m.isActive);
  const evacuated = crew.filter((m) => !m.isActive && !m.hasQuit);
  const left = walkedOff ? crew.filter((m) => m.isActive || m.hasQuit) : crew.filter((m) => m.hasQuit);
  const injuries = (journey.log || []).filter((entry) => entry.victimId || entry.victimName).length;

  let score = 100 - evacuated.length * 25 - left.length * 15 - Math.min(15, injuries * 3);
  if (active.length > 0) {
    const avgHealth = active.reduce((sum, m) => sum + m.health, 0) / active.length;
    const avgMorale = active.reduce((sum, m) => sum + m.morale, 0) / active.length;
    score -= Math.max(0, 100 - avgHealth) * 0.4 + Math.max(0, 100 - avgMorale) * 0.4;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const parts = walkedOff
    ? [`the crew drove out when the food ran out (${left.length} of ${crew.length})`]
    : [`${active.length}/${crew.length} active`, `${evacuated.length} evacuated`];
  if (!walkedOff && left.length) parts.push(`${left.length} quit`);
  if (injuries) parts.push(`${injuries} hurt on the job`);
  return { score, label: parts.join(', ') };
}

/**
 * The desk roles have no crew; the person carrying the file is the one whose
 * welfare the season spends. Stress that ends high and energy that ends low
 * both cost. A file that was not delivered scales the same way its unspent
 * budget does: being pulled off the file on day 11, or holding the line
 * from day 16, is not a restful season well spent.
 */
function scoreProtagonistWelfare(journey, victory = true) {
  if (journey.crew?.length) return scoreCrewWelfare(journey);
  const protagonist = journey.protagonist;
  if (!protagonist) return { score: 50, label: 'N/A' };
  const stress = Math.max(0, Math.min(100, Number(protagonist.stress) || 0));
  const energy = Math.max(0, Math.min(100, Number(protagonist.energy ?? 100)));
  let score = Math.max(0, Math.min(100, Math.round(100 - stress * 0.6 - Math.max(0, 50 - energy) * 0.6)));
  const deskRole = ['planning', 'permitting', 'desk'].includes(journey.journeyType);
  const undelivered = deskRole && !victory;
  if (undelivered) score = Math.round(score * deskDeliveredShare(journey));
  return {
    score,
    label: `Your stress ${Math.round(stress)}%, energy ${Math.round(energy)}%${undelivered ? '; file not delivered' : ''}`,
    name: 'Wellbeing',
  };
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

// What the run started with. Journeys record it at creation (and after the
// difficulty multipliers); older saves fall back to today's normal-difficulty
// stores. The old fixed divisors (fuel 320, food 40, budgets of 35-100k) were
// a fraction of the real starting stocks, so every run scored full marks.
function startingAmount(journey, key, fallback) {
  const start = Number(journey?.startingResources?.[key]);
  return start > 0 ? start : fallback;
}

const DESK_BUDGET_FALLBACK = { silviculture: 380000, planning: 82000, permitting: 58000 };

function scoreResourceEfficiency(journey) {
  const r = journey.resources || {};
  // A crew that comes home with a margin on every store scores full marks.
  let score = 60;

  const fuelPct = (r.fuel || 0) / startingAmount(journey, 'fuel', 520);
  const foodPct = (r.food || 0) / startingAmount(journey, 'food', 80);
  const equipPct = (r.equipment || 0) / startingAmount(journey, 'equipment', 90);

  // Share of the starting stores still on hand (see scoreSweetSpot).
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

  const budgetStart = Number.isFinite(journey.budgetStart) && journey.budgetStart > 0
    ? journey.budgetStart
    : startingAmount(journey, 'budget', DESK_BUDGET_FALLBACK[journey.journeyType] || 35000);
  const budgetPct = (r.budget || 0) / budgetStart;
  score += scoreSweetSpot(budgetPct) * 25;

  const polCapPct = (r.politicalCapital || 0) / startingAmount(journey, 'politicalCapital', 40);
  score += scoreSweetSpot(polCapPct) * 15;

  if (r.budget <= 0) score -= 20;
  if (r.politicalCapital <= 0) score -= 20;

  // Money left on a file that was never delivered was not saved, it was
  // unspent: an idle season kept its whole budget.
  const deskRole = ['planning', 'permitting', 'desk'].includes(journey.journeyType);
  if (deskRole && !victory) score *= deskDeliveredShare(journey);

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, label: `Budget: ${formatDollars(r.budget || 0)}` };
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
    label: `Budget: ${formatDollars(budget)} of ${formatDollars(start)} left`,
  };
}


// The treasury against the one the year opened with: a GM who ends the year
// where they started is average, half again is full marks, half gone is none.
function scoreManagerResources(journey) {
  const r = journey.resources || {};
  let score = 50;

  const start = Number(journey.ledger?.startTreasury) || startingAmount(journey, 'budget', 850000);
  const ratio = (r.budget || 0) / start;
  score += Math.max(-25, Math.min(25, Math.round((ratio - 1) * 50)));

  const polCapPct = (r.politicalCapital || 0) / startingAmount(journey, 'politicalCapital', 100);
  score += scoreSweetSpot(polCapPct) * 15;

  if (r.budget <= 0) score -= 20;

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, label: `Budget: ${formatDollars(r.budget || 0)}` };
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

// The recon file is its packages. Ground covered without them is driving; a
// season that closed none of them scores nothing here, however far it got.
function scoreReconObjectives(journey, victory) {
  const progress = journey.totalDistance > 0
    ? Math.min(1, journey.distanceTraveled / journey.totalDistance)
    : 0;
  if (journey.journeyType !== 'recon') {
    const score = Math.min(100, (victory ? 70 : 20) + Math.round(progress * 30));
    return { score, label: `${Math.round(progress * 100)}% traversed` };
  }
  const target = getPackageTarget(journey);
  const closed = getPackagesFinalized(journey);
  const share = target > 0 ? closed / target : 0;
  const score = victory ? 100 : Math.round(share * 70);
  return { score, label: `${closed}/${target} packages, ${Math.round(progress * 100)}% traversed` };
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

// Cut control is the GM's statutory objective: the band is worth a quarter
// of the objectives score, a finding a third of that, and a year that broke
// the limit nothing. Only a certificate the auditors actually issued counts;
// one that was withdrawn or suspended costs.
const MANAGER_CUT_POINTS = { in_band: 25, undercut: 8, overcut: 8, severe_undercut: 0, severe_overcut: 0 };

function scoreManagerObjectives(journey, victory) {
  let score = victory ? 45 : 10;
  const reputation = journey.metrics?.reputation ?? 50;
  score += Math.round((reputation / 100) * 20);
  const ledger = journey.ledger || {};
  const cutStatus = ledger.cutControlStatus;
  score += MANAGER_CUT_POINTS[cutStatus] ?? 0;
  const certs = journey.certifications || [];
  const certified = certs.filter((cert) => (cert.status || 'certified') === 'certified');
  const lost = certs.filter((cert) => ['withdrawn', 'suspended'].includes(cert.status));
  score += certified.length ? 10 : 0;
  score -= lost.length * 5;
  score = Math.max(0, Math.min(100, score));
  const cutLabel = ledger.cutControl ? `, cut ${ledger.cutControl}` : '';
  const certLabel = certs.length
    ? `, ${certs.map((cert) => `${cert.id || cert.name} ${cert.status || 'certified'}`).join(', ')}`
    : '';
  return { score, label: `Reputation ${Math.round(reputation)}%${cutLabel}${certLabel}` };
}

// --- Compliance Scoring ---

/**
 * A GM answers for the licensee's file, not only the situations that crossed
 * the desk: half the component is the compliance meter the auditors and C&E
 * read, so a clean-looking run of decisions over a caught offence and an
 * overcut cannot score near the top.
 */
function scoreManagerCompliance(journey) {
  const situations = scoreSituationsClosedClean(journey);
  const meter = Math.round(Math.max(0, Math.min(100, journey.metrics?.compliance ?? 50)));
  return {
    score: Math.round((situations.score + meter) / 2),
    label: `${situations.label}; compliance ${meter}%`,
  };
}

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
    const what = scoreResult.components?.objectives?.label?.includes('packages') ? 'a season' : 'a program';
    lines.push(`  ${'Not delivered'.padEnd(14)} ${what} that missed its obligations grades no higher than ${getLetterGrade(scoreResult.scoreCap)}`);
  }

  return lines;
}

function makeBar(value, width) {
  const filled = Math.round((value / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}
