/**
 * Scoring & Grading System
 * Calculates a letter grade (A-F) based on journey performance
 */

/**
 * Calculate final score for a completed journey
 * @param {Object} journey - Journey state at end of game
 * @param {boolean} victory - Whether the player won
 * @returns {Object} Score breakdown with letter grade
 */
export function calculateScore(journey, victory) {
  const components = {};

  switch (journey.journeyType) {
    case 'recon':
    case 'field':
      components.speed = scoreReconSpeed(journey);
      components.crewWelfare = scoreCrewWelfare(journey);
      components.resourceEfficiency = scoreResourceEfficiency(journey);
      components.objectives = scoreReconObjectives(journey, victory);
      components.events = scoreEventHandling(journey);
      break;

    case 'silviculture':
      components.speed = scoreSilvicultureSpeed(journey);
      components.crewWelfare = scoreCrewWelfare(journey);
      components.resourceEfficiency = scoreDeskResourceEfficiency(journey);
      components.objectives = scoreSilvicultureObjectives(journey, victory);
      components.events = scoreEventHandling(journey);
      break;

    case 'planning':
      components.speed = scorePlanningSpeed(journey);
      components.crewWelfare = { score: 50, label: 'N/A' }; // No crew
      components.resourceEfficiency = scoreDeskResourceEfficiency(journey);
      components.objectives = scorePlanningObjectives(journey, victory);
      components.events = scoreEventHandling(journey);
      break;

    case 'permitting':
    case 'desk':
      components.speed = scorePermittingSpeed(journey);
      components.crewWelfare = { score: 50, label: 'N/A' };
      components.resourceEfficiency = scoreDeskResourceEfficiency(journey);
      components.objectives = scorePermittingObjectives(journey, victory);
      components.events = scoreEventHandling(journey);
      break;
  }

  // Weighted total: Speed 25%, Crew 25%, Resources 20%, Objectives 20%, Events 10%
  const weights = { speed: 0.25, crewWelfare: 0.25, resourceEfficiency: 0.20, objectives: 0.20, events: 0.10 };
  let totalScore = 0;
  for (const [key, weight] of Object.entries(weights)) {
    totalScore += (components[key]?.score || 0) * weight;
  }

  // Victory bonus
  if (victory) totalScore = Math.min(100, totalScore + 10);

  totalScore = Math.round(totalScore);
  const grade = getLetterGrade(totalScore);

  return { totalScore, grade, components, victory };
}

function getLetterGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

// --- Speed Scoring ---

function scoreReconSpeed(journey) {
  const daysUsed = journey.day - 1;
  const totalBlocks = journey.blocks?.length || 10;
  const optimalDays = Math.ceil(totalBlocks * 0.8);
  const ratio = optimalDays / Math.max(1, daysUsed);
  const score = Math.min(100, Math.round(ratio * 80));
  return { score, label: `${daysUsed} shifts (optimal: ~${optimalDays})` };
}

function scoreSilvicultureSpeed(journey) {
  const daysUsed = journey.day - 1;
  const optimalDays = 30;
  const ratio = optimalDays / Math.max(1, daysUsed);
  const score = Math.min(100, Math.round(ratio * 75));
  return { score, label: `${daysUsed} days` };
}

function scorePlanningSpeed(journey) {
  const daysUsed = journey.day - 1;
  const optimalDays = 25;
  const ratio = optimalDays / Math.max(1, daysUsed);
  const score = Math.min(100, Math.round(ratio * 75));
  return { score, label: `${daysUsed} days` };
}

function scorePermittingSpeed(journey) {
  const daysUsed = journey.day - 1;
  const deadline = journey.deadline || 30;
  const daysRemaining = Math.max(0, deadline - daysUsed);
  const score = Math.min(100, Math.round((daysRemaining / deadline) * 100) + 20);
  return { score: Math.min(100, score), label: `${daysUsed}/${deadline} days used` };
}

// --- Crew Welfare Scoring ---

function scoreCrewWelfare(journey) {
  const crew = journey.crew || [];
  if (crew.length === 0) return { score: 50, label: 'No crew' };

  const active = crew.filter(m => m.isActive);
  const dead = crew.filter(m => m.isDead);
  const quit = crew.filter(m => m.hasQuit);

  let score = 50;

  // Bonus for keeping everyone alive and active
  if (dead.length === 0) score += 20;
  if (quit.length === 0) score += 10;
  score -= dead.length * 15;
  score -= quit.length * 8;

  // Average health and morale of survivors
  if (active.length > 0) {
    const avgHealth = active.reduce((s, m) => s + m.health, 0) / active.length;
    const avgMorale = active.reduce((s, m) => s + m.morale, 0) / active.length;
    score += Math.round((avgHealth - 50) / 5);
    score += Math.round((avgMorale - 50) / 5);
  }

  score = Math.max(0, Math.min(100, score));
  const label = `${active.length}/${crew.length} active, ${dead.length} lost`;
  return { score, label };
}

// --- Resource Efficiency Scoring ---

function scoreResourceEfficiency(journey) {
  const r = journey.resources || {};
  let score = 50;

  // Remaining resources are good (didn't waste), but having too much means journey was too easy
  const fuelPct = (r.fuel || 0) / 80;
  const foodPct = (r.food || 0) / 35;
  const equipPct = (r.equipment || 0) / 85;

  // Sweet spot: 10-40% remaining
  score += scoreSweetSpot(fuelPct) * 15;
  score += scoreSweetSpot(foodPct) * 15;
  score += scoreSweetSpot(equipPct) * 10;

  // Penalty for running out
  if (r.fuel <= 0) score -= 15;
  if (r.food <= 0) score -= 15;

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, label: `Fuel: ${Math.round(r.fuel || 0)}, Food: ${Math.round(r.food || 0)}` };
}

function scoreDeskResourceEfficiency(journey) {
  const r = journey.resources || {};
  let score = 50;

  const budgetStart = journey.journeyType === 'silviculture' ? 100000 :
                      journey.journeyType === 'planning' ? 50000 : 35000;
  const budgetPct = (r.budget || 0) / budgetStart;
  score += scoreSweetSpot(budgetPct) * 25;

  const polCapPct = (r.politicalCapital || 0) / 40;
  score += scoreSweetSpot(polCapPct) * 15;

  if (r.budget <= 0) score -= 20;
  if (r.politicalCapital <= 0) score -= 20;

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, label: `Budget: $${Math.round(r.budget || 0).toLocaleString()}` };
}

// Returns 0-1 where sweet spot is 10-40% remaining
function scoreSweetSpot(pct) {
  if (pct <= 0) return 0;
  if (pct < 0.1) return 0.3;
  if (pct <= 0.4) return 1.0;
  if (pct <= 0.7) return 0.7;
  return 0.4; // Had too much left, journey was underutilized
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

function scoreSilvicultureObjectives(journey, victory) {
  let score = victory ? 60 : 10;
  const p = journey.planting || {};
  const s = journey.surveys || {};
  const plantPct = p.blocksToPlant > 0 ? p.blocksPlanted / p.blocksToPlant : 0;
  const surveyPct = s.freeGrowingTarget > 0 ? s.freeGrowingComplete / s.freeGrowingTarget : 0;
  score += Math.round(plantPct * 20);
  score += Math.round(surveyPct * 20);
  score = Math.min(100, score);
  return { score, label: `${p.blocksPlanted}/${p.blocksToPlant} planted, ${s.freeGrowingComplete}/${s.freeGrowingTarget} surveys` };
}

function scorePlanningObjectives(journey, victory) {
  let score = victory ? 60 : 10;
  const plan = journey.plan || {};
  score += Math.round((plan.dataCompleteness || 0) / 10);
  score += Math.round((plan.analysisQuality || 0) / 10);
  score += Math.round((plan.stakeholderBuyIn || 0) / 10);
  score += Math.round((plan.ministerialConfidence || 0) / 10);
  score = Math.min(100, score);
  return { score, label: `Ministerial: ${plan.ministerialConfidence || 0}%` };
}

function scorePermittingObjectives(journey, victory) {
  let score = victory ? 60 : 10;
  const permits = journey.permits || {};
  const approvalRate = permits.target > 0 ? permits.approved / permits.target : 0;
  score += Math.round(approvalRate * 40);
  score = Math.min(100, score);
  return { score, label: `${permits.approved}/${permits.target} approved` };
}

// --- Event Handling Scoring ---

function scoreEventHandling(journey) {
  const log = journey.log || [];
  const eventEntries = log.filter(e => e.type === 'event');
  if (eventEntries.length === 0) return { score: 50, label: 'No events logged' };

  // Simple heuristic: more events handled = more experience
  const score = Math.min(100, 40 + eventEntries.length * 5);
  return { score, label: `${eventEntries.length} events handled` };
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
    speed: 'Speed',
    crewWelfare: 'Crew Welfare',
    resourceEfficiency: 'Resources',
    objectives: 'Objectives',
    events: 'Events'
  };

  const weights = { speed: 25, crewWelfare: 25, resourceEfficiency: 20, objectives: 20, events: 10 };

  for (const [key, component] of Object.entries(components)) {
    const name = labels[key] || key;
    const weight = weights[key] || 0;
    const bar = makeBar(component.score, 10);
    lines.push(`  ${name.padEnd(14)} [${bar}] ${component.score}/100 (${weight}%) - ${component.label}`);
  }

  return lines;
}

function makeBar(value, width) {
  const filled = Math.round((value / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

/**
 * Get a running grade estimate for in-game display
 * @param {Object} journey - Current journey state
 * @returns {string} Grade estimate like "B-" or "C+"
 */
export function getRunningGrade(journey) {
  if (!journey) return '?';

  // Simplified mid-game estimate based on available metrics
  let score = 50;

  // Crew welfare component
  const crew = journey.crew || [];
  const activeCrew = crew.filter(m => m.isActive);
  if (crew.length > 0) {
    const survivalRate = activeCrew.length / crew.length;
    score += (survivalRate - 0.5) * 20;
    if (activeCrew.length > 0) {
      const avgMorale = activeCrew.reduce((s, m) => s + m.morale, 0) / activeCrew.length;
      score += (avgMorale - 50) / 10;
    }
  }

  // Resource health
  const r = journey.resources || {};
  if (r.fuel !== undefined) {
    if (r.fuel > 20) score += 5;
    if (r.fuel <= 5) score -= 10;
  }
  if (r.food !== undefined) {
    if (r.food > 10) score += 5;
    if (r.food <= 3) score -= 10;
  }
  if (r.budget !== undefined) {
    if (r.budget > 5000) score += 5;
    if (r.budget <= 0) score -= 15;
  }

  // Progress bonus
  switch (journey.journeyType) {
    case 'recon':
    case 'field': {
      const progress = journey.totalDistance > 0 ? journey.distanceTraveled / journey.totalDistance : 0;
      const dayEfficiency = journey.day > 0 ? progress / (journey.day / 30) : 0;
      score += dayEfficiency * 15;
      break;
    }
    case 'permitting':
    case 'desk': {
      const permitRate = journey.permits?.target > 0 ? journey.permits.approved / journey.permits.target : 0;
      const dayRate = journey.deadline > 0 ? journey.day / journey.deadline : 1;
      if (permitRate >= dayRate) score += 10;
      else score -= 5;
      break;
    }
    case 'planning': {
      const conf = journey.plan?.ministerialConfidence || 0;
      score += conf / 10;
      break;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = getLetterGrade(score);
  const modifier = score % 15 > 10 ? '+' : score % 15 < 5 ? '-' : '';
  return `${grade}${modifier}`;
}

// ---- High Score Persistence ----

const HIGH_SCORE_KEY = 'forestryTrail_highScores';

/**
 * Save a high score to localStorage
 * @param {Object} scoreResult - From calculateScore()
 * @param {Object} journey - Journey state
 */
export function saveHighScore(scoreResult, journey) {
  try {
    const scores = getHighScores();
    scores.push({
      score: scoreResult.totalScore,
      grade: scoreResult.grade,
      victory: scoreResult.victory,
      role: journey.roleId || journey.journeyType,
      area: journey.area?.name || 'Unknown',
      crewName: journey.companyName || 'Unknown',
      day: journey.day,
      date: new Date().toISOString().split('T')[0]
    });
    // Keep top 10
    scores.sort((a, b) => b.score - a.score);
    scores.length = Math.min(scores.length, 10);
    localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(scores));
  } catch {
    // localStorage unavailable, silently fail
  }
}

/**
 * Get high scores from localStorage
 * @returns {Object[]} Array of high score entries
 */
export function getHighScores() {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
