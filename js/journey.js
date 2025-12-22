/**
 * Journey State Machine
 * Manages field travel and desk timeline progression
 */

import { generateCrew, processDailyUpdate, getActiveCrewCount, getAverageMorale } from './crew.js';
import {
  createFieldResources,
  createDeskResources,
  calculateFieldConsumption,
  calculateDeskConsumption,
  applyConsumption,
  applyDeskRegen,
  checkResourceStatus,
  FIELD_RESOURCES,
  DESK_RESOURCES
} from './resources.js';
import { getBlocksForArea, getTotalDistance, getRandomWeather, getTemperature, TERRAIN_TYPES } from './data/blocks.js';

const BASE_DAILY_TRAVEL_KM = 16;
const DAILY_TRAVEL_VARIANCE = 0.12;

// Pace definitions
export const PACE_OPTIONS = {
  resting: {
    id: 'resting',
    name: 'Rest',
    description: 'Stay put and recover',
    distanceMultiplier: 0,
    healthBonus: 10,
    moraleBonus: 8,
    eventRisk: 0.05
  },
  camp_work: {
    id: 'camp_work',
    name: 'Camp Work',
    description: 'Stay put and handle camp tasks',
    distanceMultiplier: 0,
    healthBonus: 2,
    moraleBonus: -1,
    eventRisk: 0.10
  },
  slow: {
    id: 'slow',
    name: 'Slow & Steady',
    description: 'Take it easy, conserve resources',
    distanceMultiplier: 0.6,
    healthBonus: 2,
    moraleBonus: 2,
    eventRisk: 0.10
  },
  normal: {
    id: 'normal',
    name: 'Normal Pace',
    description: 'Standard travel speed',
    distanceMultiplier: 1.0,
    healthBonus: 0,
    moraleBonus: 0,
    eventRisk: 0.20
  },
  fast: {
    id: 'fast',
    name: 'Push Hard',
    description: 'Cover more ground, wear down faster',
    distanceMultiplier: 1.4,
    healthBonus: -3,
    moraleBonus: -5,
    eventRisk: 0.30
  },
  grueling: {
    id: 'grueling',
    name: 'Grueling',
    description: 'Maximum speed at great cost',
    distanceMultiplier: 1.8,
    healthBonus: -8,
    moraleBonus: -12,
    eventRisk: 0.45
  }
};

// Desk action definitions
export const DESK_ACTIONS = {
  process_permits: {
    id: 'process_permits',
    name: 'Process Permits',
    description: 'Work on permit paperwork and reviews',
    hoursRequired: 2,
    energyCost: 10
  },
  stakeholder_meeting: {
    id: 'stakeholder_meeting',
    name: 'Stakeholder Meeting',
    description: 'Meet with ministry, nations, or community',
    hoursRequired: 3,
    energyCost: 15
  },
  crisis_management: {
    id: 'crisis_management',
    name: 'Handle Crisis',
    description: 'Deal with urgent issues (uses whole day)',
    hoursRequired: 8,
    energyCost: 30
  },
  team_morale: {
    id: 'team_morale',
    name: 'Team Building',
    description: 'Boost crew morale with coffee and encouragement',
    hoursRequired: 2,
    energyCost: 5
  },
  end_day: {
    id: 'end_day',
    name: 'End Day',
    description: 'Wrap up and head home',
    hoursRequired: 0,
    energyCost: 0
  }
};

/**
 * Create initial field journey state
 * @param {Object} options - Setup options
 * @returns {Object} Field journey state
 */
export function createFieldJourney(options = {}) {
  const { roleId, areaId, companyName, crewName, crew, role, area } = options;
  const effectiveAreaId = areaId || area?.id;
  const blocks = getBlocksForArea(effectiveAreaId);
  const totalDistance = getTotalDistance(effectiveAreaId);

  return {
    journeyType: 'field',
    companyName: companyName || crewName || 'Unnamed Crew',
    roleId: roleId || role?.id,
    areaId: effectiveAreaId,
    role,
    area,

    // Progress
    day: 1,
    currentBlockIndex: 0,
    distanceTraveled: 0,
    totalDistance,
    blocks,

    // Current conditions
    pace: 'normal',
    weather: getRandomWeather(blocks[0], 1),
    temperature: 'cool',
    travelDelayHours: 0,

    // Party
    crew: crew || generateCrew(5, 'field'),
    resources: createFieldResources(),

    // State flags
    isComplete: false,
    isGameOver: false,
    gameOverReason: null,

    // History
    log: [],
    decisions: []
  };
}

/**
 * Create initial desk journey state
 * @param {Object} options - Setup options
 * @returns {Object} Desk journey state
 */
export function createDeskJourney(options = {}) {
  const { roleId, areaId, companyName, crewName, crew, role, area } = options;
  const effectiveAreaId = areaId || area?.id;
  const targetPermits = 10;
  const submittedPermits = 8;
  const backlogPermits = Math.max(0, targetPermits - submittedPermits);

  return {
    journeyType: 'desk',
    companyName: companyName || crewName || 'Unnamed Team',
    roleId: roleId || role?.id,
    areaId: effectiveAreaId,
    role,
    area,

    // Progress
    day: 1,
    deadline: 30,
    currentPhase: 'planning', // planning, review, approval, crunch

    // Permit pipeline
    permits: {
      target: targetPermits,
      submitted: submittedPermits,
      backlog: backlogPermits,
      inReview: 0,
      needsRevision: 0,
      approved: 0,
      rejected: 0
    },

    // Stakeholders
    stakeholders: {
      ministry: { mood: 50, meetings: 0 },
      nations: { mood: 50, meetings: 0 },
      community: { mood: 50, meetings: 0 }
    },

    // Party
    crew: crew || generateCrew(5, 'desk'),
    resources: createDeskResources(),

    // Daily time tracking
    hoursRemaining: 8,

    // State flags
    isComplete: false,
    isGameOver: false,
    gameOverReason: null,

    // History
    log: [],
    decisions: []
  };
}

/**
 * Get current block for field journey
 * @param {Object} journey - Field journey state
 * @returns {Object} Current block
 */
export function getCurrentBlock(journey) {
  return journey.blocks[journey.currentBlockIndex] || journey.blocks[0];
}

/**
 * Get next block for field journey
 * @param {Object} journey - Field journey state
 * @returns {Object|null} Next block or null if at end
 */
export function getNextBlock(journey) {
  const nextIndex = journey.currentBlockIndex + 1;
  return journey.blocks[nextIndex] || null;
}

function getCumulativeDistanceToIndex(blocks, index) {
  let sum = 0;
  for (let i = 0; i <= index && i < blocks.length; i++) {
    sum += blocks[i]?.distance || 0;
  }
  return sum;
}

function getCurrentSegmentLength(blocks, currentIndex) {
  const nextBlock = blocks[currentIndex + 1];
  return nextBlock?.distance || 0;
}

function getDistanceIntoCurrentSegment(journey) {
  const blocks = journey.blocks || [];
  const currentIndex = Math.max(0, Math.min(blocks.length - 1, journey.currentBlockIndex || 0));
  const distanceAtCurrentBlock = getCumulativeDistanceToIndex(blocks, currentIndex);
  return Math.max(0, journey.distanceTraveled - distanceAtCurrentBlock);
}

function travelDistanceForDay(journey, paceId) {
  const pace = PACE_OPTIONS[paceId] || PACE_OPTIONS.normal;
  if (!pace.distanceMultiplier || pace.distanceMultiplier <= 0) {
    return 0;
  }

  const currentBlock = getCurrentBlock(journey);
  const terrain = TERRAIN_TYPES[currentBlock?.terrain] || TERRAIN_TYPES.flat;
  const weatherMod = journey.weather?.travelModifier || 1;

  const delayHours = Math.min(8, Math.max(0, journey.travelDelayHours || 0));
  const timeModifier = Math.max(0, 1 - delayHours / 8);
  const variance = 1 + (Math.random() * 2 - 1) * DAILY_TRAVEL_VARIANCE;
  const distance = BASE_DAILY_TRAVEL_KM * pace.distanceMultiplier * terrain.speed * weatherMod * variance * timeModifier;
  return Math.max(0, distance);
}

function advanceBlocksForDistance(journey) {
  const blocks = journey.blocks || [];
  const arrivals = [];

  while (journey.currentBlockIndex < blocks.length - 1) {
    const nextIndex = journey.currentBlockIndex + 1;
    const distanceToNextCumulative = getCumulativeDistanceToIndex(blocks, nextIndex);
    if (journey.distanceTraveled + 1e-6 >= distanceToNextCumulative) {
      journey.currentBlockIndex = nextIndex;
      arrivals.push(blocks[nextIndex]);
      continue;
    }
    break;
  }

  return arrivals;
}

/**
 * Calculate travel distance for a day
 * @param {Object} journey - Journey state
 * @param {string} paceId - Selected pace
 * @returns {Object} Distance info
 */
export function calculateTravelDistance(journey, paceId) {
  const currentBlock = getCurrentBlock(journey);
  const nextBlock = getNextBlock(journey);
  const terrain = TERRAIN_TYPES[currentBlock?.terrain] || TERRAIN_TYPES.flat;

  const distance = travelDistanceForDay(journey, paceId);

  if (!nextBlock) {
    return { distance: 0, reachesBlock: false, blockName: null };
  }

  const segmentLength = getCurrentSegmentLength(journey.blocks, journey.currentBlockIndex);
  const distanceIntoSegment = getDistanceIntoCurrentSegment(journey);
  const remaining = Math.max(0, segmentLength - distanceIntoSegment);
  const reachesBlock = distance >= remaining && remaining > 0;

  return {
    distance: Math.round(distance * 10) / 10,
    reachesBlock: Boolean(reachesBlock),
    blockName: reachesBlock ? nextBlock.name : null,
    terrain: terrain.name,
    weatherEffect: journey.weather?.name
  };
}

/**
 * Execute a day of field travel
 * @param {Object} journey - Journey state
 * @param {string} paceId - Selected pace
 * @returns {Object} Result with updated journey and messages
 */
export function executeFieldDay(journey, paceId) {
  const messages = [];
  let effectivePaceId = paceId;
  let pace = PACE_OPTIONS[paceId] || PACE_OPTIONS.normal;

  // Track previous progress for milestone detection
  const prevProgress = Math.round((journey.distanceTraveled / journey.totalDistance) * 100);
  const dayNumber = journey.day;
  const startBlock = getCurrentBlock(journey);
  const weatherToday = journey.weather;

  // Block travel if fuel or equipment is depleted
  if (pace.distanceMultiplier > 0) {
    if (journey.resources.fuel <= 0) {
      messages.push('No fuel left. The crew stays in camp.');
      effectivePaceId = 'camp_work';
      pace = PACE_OPTIONS.camp_work;
    } else if (journey.resources.equipment <= 0) {
      messages.push('Critical equipment failure. The crew stays in camp.');
      effectivePaceId = 'camp_work';
      pace = PACE_OPTIONS.camp_work;
    }
  }

  // Calculate travel
  const travelInfo = calculateTravelDistance(journey, effectivePaceId);

  // Update distance
  journey.distanceTraveled = Math.min(journey.totalDistance, journey.distanceTraveled + travelInfo.distance);
  journey.pace = effectivePaceId;

  // Calculate new progress
  const newProgress = Math.round((journey.distanceTraveled / journey.totalDistance) * 100);

  if (travelInfo.distance > 0) {
    messages.push(`Traveled ${travelInfo.distance} km at ${pace.name} pace.`);
  } else {
    if (effectivePaceId === 'resting') {
      messages.push('The crew made camp and rested for the day.');
    } else {
      messages.push('The crew stayed in camp for the day.');
    }
  }

  // Check for milestone achievements
  if (!journey.milestonesReached) journey.milestonesReached = [];

  const milestones = [
    { threshold: 25, message: 'Quarter of the journey complete! The crew is settling into the routine.' },
    { threshold: 50, message: 'Halfway there! The destination feels within reach.' },
    { threshold: 75, message: 'Three-quarters done! The end is in sight.' },
    { threshold: 90, message: 'Almost there! Just a little further...' }
  ];

  for (const milestone of milestones) {
    if (prevProgress < milestone.threshold && newProgress >= milestone.threshold &&
        !journey.milestonesReached.includes(milestone.threshold)) {
      messages.push(`*** MILESTONE: ${milestone.message} ***`);
      journey.milestonesReached.push(milestone.threshold);
    }
  }

  const arrivals = advanceBlocksForDistance(journey);
  if (arrivals.length > 0) {
    for (const block of arrivals) {
      if (!block) continue;
      messages.push(`Arrived at ${block.name}.`);
      if (block.description) {
        messages.push(block.description);
      }
    }
  }

  // Check for victory
  if (journey.distanceTraveled >= journey.totalDistance || journey.currentBlockIndex >= journey.blocks.length - 1) {
    journey.isComplete = true;
    messages.push('You have reached your destination!');
  }

  // Calculate resource consumption
  const currentBlock = getCurrentBlock(journey);
  const terrain = currentBlock?.terrain || 'flat';
  const consumption = calculateFieldConsumption(
    {
      pace: effectivePaceId,
      terrain,
      weather: journey.temperature,
      weatherCondition: journey.weather
    },
    getActiveCrewCount(journey.crew)
  );

  // Apply consumption
  const consumptionResult = applyConsumption(
    journey.resources,
    consumption,
    FIELD_RESOURCES
  );
  journey.resources = consumptionResult.resources;

  // Add consumption warnings
  for (const warning of consumptionResult.warnings) {
    messages.push(`Warning: ${warning.resource} is running low (${warning.value} ${warning.unit}).`);
  }
  for (const critical of consumptionResult.critical) {
    messages.push(`CRITICAL: ${critical.resource} is almost gone! (${critical.value} ${critical.unit})`);
  }

  // Process crew daily updates
  const conditions = {
    restDay: effectivePaceId === 'resting',
    gruelingPace: effectivePaceId === 'grueling',
    lowFood: journey.resources.food <= 5,
    coldWeather: journey.temperature === 'cold' || journey.temperature === 'freezing'
  };

  for (const member of journey.crew) {
    // Apply pace effects
    if (pace.healthBonus !== 0) {
      member.health = Math.max(0, Math.min(100, member.health + pace.healthBonus));
    }
    if (pace.moraleBonus !== 0) {
      member.morale = Math.max(0, Math.min(100, member.morale + pace.moraleBonus));
    }

    // Apply weather morale effects
    if (weatherToday?.moraleEffect) {
      member.morale = Math.max(0, Math.min(100, member.morale + weatherToday.moraleEffect));
    }

    // Apply health risk from extreme weather
    if (weatherToday?.healthRisk && !conditions.restDay) {
      const healthLoss = Math.floor(Math.random() * 5) + 2; // 2-6 health loss
      member.health = Math.max(0, member.health - healthLoss);
      if (healthLoss > 3) {
        messages.push(`${member.name} suffers from the ${weatherToday.name.toLowerCase()}.`);
      }
    }

    const updateResult = processDailyUpdate(member, conditions);
    messages.push(...updateResult.messages);
  }

  // Check for game over conditions
  const resourceStatus = checkResourceStatus(journey.resources, FIELD_RESOURCES);

  if (resourceStatus.depleted.some(d => d.id === 'fuel') && (PACE_OPTIONS[effectivePaceId]?.distanceMultiplier ?? 1) > 0) {
    journey.isGameOver = true;
    journey.gameOverReason = 'OUT OF FUEL - The crew is stranded.';
    messages.push(journey.gameOverReason);
  }

  if (getActiveCrewCount(journey.crew) === 0) {
    journey.isGameOver = true;
    journey.gameOverReason = 'ALL CREW LOST - No one remains to continue the journey.';
    messages.push(journey.gameOverReason);
  }

  // Update weather for next day
  journey.day++;
  journey.weather = getRandomWeather(getCurrentBlock(journey), journey.day);
  journey.temperature = getTemperature(journey.weather, getCurrentBlock(journey));
  journey.travelDelayHours = 0;

  // Log the day with more detail
  journey.log.push({
    day: dayNumber,
    type: 'travel',
    action: pace.name,
    distance: travelInfo.distance,
    location: getCurrentBlock(journey)?.name || startBlock?.name || 'Unknown',
    weather: weatherToday?.name || 'Unknown',
    summary: travelInfo.distance > 0
      ? `Traveled ${travelInfo.distance} km (${pace.name})`
      : (paceId === 'resting' ? 'Rested for the day' : 'Camp work day')
  });

  // Log milestone if reached
  const lastMilestone = journey.milestonesReached?.[journey.milestonesReached.length - 1];
  if (lastMilestone && !journey.log.some(l => l.type === 'milestone' && l.threshold === lastMilestone)) {
    journey.log.push({
      day: dayNumber,
      type: 'milestone',
      threshold: lastMilestone,
      summary: `Reached ${lastMilestone}% of journey`
    });
  }

  // Log block arrival
  if (arrivals.length > 0) {
    const arrivedBlock = arrivals[arrivals.length - 1] || getCurrentBlock(journey);
    journey.log.push({
      day: dayNumber,
      type: 'arrival',
      location: arrivedBlock?.name || 'New location',
      summary: `Arrived at ${arrivedBlock?.name || 'new location'}`
    });
  }

  return { journey, messages };
}

/**
 * Execute a desk day action
 * @param {Object} journey - Desk journey state
 * @param {string} actionId - Selected action
 * @param {Object} actionParams - Additional parameters
 * @returns {Object} Result with updated journey and messages
 */
export function executeDeskDay(journey, actionId, actionParams = {}) {
  const messages = [];

  // Process based on action
  switch (actionId) {
    case 'process_permits':
      return processPermitWork(journey);

    case 'stakeholder_meeting':
      return holdStakeholderMeeting(journey, actionParams.stakeholder);

    case 'crisis_management':
      return handleCrisis(journey, actionParams.crisis);

    case 'team_morale':
      return boostTeamMorale(journey);

    case 'end_day':
      return endDeskDay(journey);

    default:
      messages.push('Unknown action.');
      return { journey, messages };
  }
}

/**
 * Process permit paperwork
 */
function processPermitWork(journey) {
  const messages = [];
  const hoursUsed = 2;

  if (journey.hoursRemaining < hoursUsed) {
    messages.push('Not enough time remaining today.');
    return { journey, messages };
  }

  journey.hoursRemaining -= hoursUsed;
  journey.resources.energy = Math.max(0, journey.resources.energy - 10);

  // Move permits through pipeline
  if (journey.permits.submitted > 0) {
    journey.permits.submitted--;
    journey.permits.inReview++;
    messages.push('Submitted a permit package for review.');
  } else if (journey.permits.backlog > 0) {
    journey.permits.backlog--;
    journey.permits.submitted++;
    messages.push('Prepared a new permit package for submission.');
  }

  // Random chance to advance review
  if (journey.permits.inReview > 0 && Math.random() < 0.4) {
    journey.permits.inReview--;
    if (Math.random() < 0.7) {
      journey.permits.approved = Math.min(journey.permits.target, journey.permits.approved + 1);
      messages.push('A permit was approved!');
    } else {
      journey.permits.needsRevision++;
      messages.push('A permit needs revision.');
    }
  }

  // Fix revisions
  if (journey.permits.needsRevision > 0 && Math.random() < 0.5) {
    journey.permits.needsRevision--;
    journey.permits.inReview++;
    messages.push('Resubmitted a revised permit.');
  }

  return { journey, messages };
}

/**
 * Hold a stakeholder meeting
 */
function holdStakeholderMeeting(journey, stakeholder = 'ministry') {
  const messages = [];
  const hoursUsed = 3;

  if (journey.hoursRemaining < hoursUsed) {
    messages.push('Not enough time for a meeting today.');
    return { journey, messages };
  }

  journey.hoursRemaining -= hoursUsed;
  journey.resources.energy = Math.max(0, journey.resources.energy - 15);
  journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 2);

  const sh = journey.stakeholders[stakeholder];
  if (sh) {
    sh.meetings++;
    const moodChange = 10 + Math.floor(Math.random() * 10);
    sh.mood = Math.min(100, sh.mood + moodChange);
    messages.push(`Met with ${stakeholder}. Relations improved by ${moodChange}.`);

    // Good relations speed up permits
    if (sh.mood >= 70 && journey.permits.inReview > 0 && Math.random() < 0.3) {
      journey.permits.inReview--;
      journey.permits.approved = Math.min(journey.permits.target, journey.permits.approved + 1);
      messages.push('The meeting helped push a permit through!');
    }
  }

  return { journey, messages };
}

/**
 * Handle a crisis
 */
function handleCrisis(journey, crisis = {}) {
  const messages = [];

  journey.hoursRemaining = 0; // Crises consume the day
  journey.resources.energy = Math.max(0, journey.resources.energy - 30);

  messages.push('Spent the day managing the crisis.');

  // Crises have variable outcomes
  if (Math.random() < 0.6) {
    messages.push('The situation was contained.');
    journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 5);
  } else {
    messages.push('The crisis escalated despite your efforts.');
    journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 10);
    journey.resources.budget = Math.max(0, journey.resources.budget - 2000);
  }

  return { journey, messages };
}

/**
 * Boost team morale
 */
function boostTeamMorale(journey) {
  const messages = [];
  const hoursUsed = 2;

  if (journey.hoursRemaining < hoursUsed) {
    messages.push('Not enough time for team building.');
    return { journey, messages };
  }

  journey.hoursRemaining -= hoursUsed;
  journey.resources.budget = Math.max(0, journey.resources.budget - 100); // Coffee and snacks

  for (const member of journey.crew) {
    if (member.isActive) {
      member.morale = Math.min(100, member.morale + 15);
    }
  }

  messages.push('Team morale has improved.');
  return { journey, messages };
}

/**
 * End the desk day
 */
function endDeskDay(journey) {
  const messages = [];

  // Daily resource consumption
  const consumption = calculateDeskConsumption({
    overtime: 8 - journey.hoursRemaining > 8 ? 8 - journey.hoursRemaining - 8 : 0,
    meetings: Object.values(journey.stakeholders).reduce((sum, s) => sum + s.meetings, 0)
  });

  const result = applyConsumption(journey.resources, consumption, DESK_RESOURCES);
  journey.resources = result.resources;

  // Apply regeneration
  journey.resources = applyDeskRegen(journey.resources);

  // Reset daily values
  journey.hoursRemaining = 8;
  journey.day++;

  // Check deadline
  const daysRemaining = journey.deadline - journey.day;
  if (daysRemaining <= 5 && daysRemaining > 0) {
    messages.push(`WARNING: Only ${daysRemaining} days until deadline!`);
  }

  // Check victory
  const approvalRate = journey.permits.approved / journey.permits.target;
  if (journey.day >= journey.deadline) {
    if (approvalRate >= 0.8) {
      journey.isComplete = true;
      messages.push('Deadline reached with sufficient permits approved!');
    } else {
      journey.isGameOver = true;
      journey.gameOverReason = `DEADLINE MISSED - Only ${Math.round(approvalRate * 100)}% of permits approved.`;
      messages.push(journey.gameOverReason);
    }
  }

  // Check game over
  const resourceStatus = checkResourceStatus(journey.resources, DESK_RESOURCES);
  if (resourceStatus.depleted.some(d => d.id === 'budget')) {
    journey.isGameOver = true;
    journey.gameOverReason = 'BUDGET DEPLETED - Operations must cease.';
    messages.push(journey.gameOverReason);
  }
  if (resourceStatus.depleted.some(d => d.id === 'politicalCapital')) {
    journey.isGameOver = true;
    journey.gameOverReason = 'POLITICAL CAPITAL EXHAUSTED - You have been terminated.';
    messages.push(journey.gameOverReason);
  }

  // Process crew
  for (const member of journey.crew) {
    const updateResult = processDailyUpdate(member, {});
    messages.push(...updateResult.messages);
  }

  if (getActiveCrewCount(journey.crew) === 0) {
    journey.isGameOver = true;
    journey.gameOverReason = 'ALL STAFF QUIT - No one remains.';
    messages.push(journey.gameOverReason);
  }

  return { journey, messages };
}

/**
 * Get journey progress percentage
 * @param {Object} journey - Journey state
 * @returns {number} Progress 0-100
 */
export function getJourneyProgress(journey) {
  if (journey.journeyType === 'field') {
    return Math.round((journey.distanceTraveled / journey.totalDistance) * 100);
  } else {
    const target = journey.permits?.target || 0;
    if (target <= 0) return 0;
    return Math.round((journey.permits.approved / target) * 100);
  }
}

/**
 * Get detailed progress info for field journey
 * @param {Object} journey - Field journey state
 * @returns {Object} Detailed progress info
 */
export function getFieldProgressInfo(journey) {
  const currentBlock = getCurrentBlock(journey);
  const nextBlock = getNextBlock(journey);

  const segmentLength = getCurrentSegmentLength(journey.blocks, journey.currentBlockIndex);
  const distanceIntoSegment = getDistanceIntoCurrentSegment(journey);
  const distanceToNextBlock = nextBlock ? Math.max(0, segmentLength - distanceIntoSegment) : 0;

  const overallProgress = Math.round((journey.distanceTraveled / journey.totalDistance) * 100);
  const blockProgress = segmentLength > 0
    ? Math.round((distanceIntoSegment / segmentLength) * 100)
    : 100;

  return {
    overallProgress,
    distanceTraveled: journey.distanceTraveled,
    totalDistance: journey.totalDistance,
    currentBlock: currentBlock?.name || 'Unknown',
    nextBlock: nextBlock?.name || 'Destination',
    distanceToNextBlock: Math.round(distanceToNextBlock * 10) / 10,
    blocksCompleted: journey.currentBlockIndex,
    totalBlocks: journey.blocks.length,
    blockProgress: Math.min(100, blockProgress)
  };
}

/**
 * Sync block index with total distance traveled
 * @param {Object} journey - Journey state
 * @returns {Object|null} Current block
 */
export function syncBlocksFromDistance(journey) {
  const blocks = journey.blocks || [];
  if (!blocks.length) return null;

  let latestIndex = 0;
  for (let i = 0; i < blocks.length; i++) {
    const distanceToBlock = getCumulativeDistanceToIndex(blocks, i);
    if (journey.distanceTraveled + 1e-6 >= distanceToBlock) {
      latestIndex = i;
      continue;
    }
    break;
  }

  journey.currentBlockIndex = latestIndex;
  return blocks[latestIndex] || blocks[0] || null;
}

/**
 * Format journey log for display
 * @param {Object} journey - Journey state
 * @returns {Object[]} Formatted log entries
 */
export function formatJourneyLog(journey) {
  if (!journey.log || journey.log.length === 0) {
    return [];
  }

  const typeIcons = {
    travel: '→',
    event: '!',
    milestone: '★',
    arrival: '◆'
  };

  return journey.log.map(entry => ({
    day: entry.day,
    icon: typeIcons[entry.type] || '·',
    type: entry.type,
    summary: entry.summary || entry.eventTitle || entry.action || 'Unknown',
    detail: entry.optionLabel || entry.weather || ''
  }));
}

/**
 * Get summary of journey status
 * @param {Object} journey - Journey state
 * @returns {Object} Status summary
 */
export function getJourneySummary(journey) {
  if (journey.journeyType === 'field') {
    const block = getCurrentBlock(journey);
    return {
      type: 'field',
      day: journey.day,
      location: block?.name || 'Unknown',
      progress: getJourneyProgress(journey),
      distanceTraveled: journey.distanceTraveled,
      totalDistance: journey.totalDistance,
      weather: journey.weather?.name || 'Unknown',
      crewActive: getActiveCrewCount(journey.crew),
      crewTotal: journey.crew.length,
      morale: Math.round(getAverageMorale(journey.crew))
    };
  } else {
    return {
      type: 'desk',
      day: journey.day,
      deadline: journey.deadline,
      daysRemaining: journey.deadline - journey.day,
      progress: getJourneyProgress(journey),
      permitsApproved: journey.permits.approved,
      permitsTarget: journey.permits.target,
      crewActive: getActiveCrewCount(journey.crew),
      crewTotal: journey.crew.length,
      morale: Math.round(getAverageMorale(journey.crew))
    };
  }
}
