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
      target: 10,
      submitted: 8,
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

/**
 * Calculate travel distance for a day
 * @param {Object} journey - Journey state
 * @param {string} paceId - Selected pace
 * @returns {Object} Distance info
 */
export function calculateTravelDistance(journey, paceId) {
  const pace = PACE_OPTIONS[paceId] || PACE_OPTIONS.normal;
  const currentBlock = getCurrentBlock(journey);
  const nextBlock = getNextBlock(journey);

  if (!nextBlock) {
    return { distance: 0, reachesBlock: false, blockName: null };
  }

  // Base distance from next block
  const baseDistance = nextBlock.distance;

  // Apply pace modifier
  let distance = baseDistance * pace.distanceMultiplier;

  // Apply terrain modifier
  const terrain = TERRAIN_TYPES[currentBlock.terrain] || TERRAIN_TYPES.flat;
  distance *= terrain.speed;

  // Apply weather modifier
  if (journey.weather) {
    distance *= journey.weather.travelModifier || 1;
  }

  // Check if we reach the next block
  const distanceToNextBlock = nextBlock.distance - (journey.distanceTraveled % nextBlock.distance);
  const reachesBlock = distance >= distanceToNextBlock;

  return {
    distance: Math.round(distance * 10) / 10,
    reachesBlock,
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
  const pace = PACE_OPTIONS[paceId] || PACE_OPTIONS.normal;

  // Track previous progress for milestone detection
  const prevProgress = Math.round((journey.distanceTraveled / journey.totalDistance) * 100);

  // Calculate travel
  const travelInfo = calculateTravelDistance(journey, paceId);

  // Update distance
  journey.distanceTraveled += travelInfo.distance;
  journey.pace = paceId;

  // Calculate new progress
  const newProgress = Math.round((journey.distanceTraveled / journey.totalDistance) * 100);

  if (travelInfo.distance > 0) {
    messages.push(`Traveled ${travelInfo.distance} km at ${pace.name} pace.`);
  } else {
    messages.push('The crew rested for the day.');
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

  // Check if reached next block
  if (travelInfo.reachesBlock) {
    journey.currentBlockIndex++;
    const newBlock = getCurrentBlock(journey);
    messages.push(`Arrived at ${newBlock.name}.`);

    // Add block description if available
    if (newBlock.description) {
      messages.push(newBlock.description);
    }

    // Check for victory (reached final block)
    if (journey.currentBlockIndex >= journey.blocks.length - 1) {
      journey.isComplete = true;
      messages.push('You have reached your destination!');
    }
  }

  // Calculate resource consumption
  const currentBlock = getCurrentBlock(journey);
  const terrain = currentBlock?.terrain || 'flat';
  const consumption = calculateFieldConsumption(
    {
      pace: paceId,
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
    restDay: paceId === 'resting',
    gruelingPace: paceId === 'grueling',
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
    if (journey.weather?.moraleEffect) {
      member.morale = Math.max(0, Math.min(100, member.morale + journey.weather.moraleEffect));
    }

    // Apply health risk from extreme weather
    if (journey.weather?.healthRisk && !conditions.restDay) {
      const healthLoss = Math.floor(Math.random() * 5) + 2; // 2-6 health loss
      member.health = Math.max(0, member.health - healthLoss);
      if (healthLoss > 3) {
        messages.push(`${member.name} suffers from the ${journey.weather.name.toLowerCase()}.`);
      }
    }

    const updateResult = processDailyUpdate(member, conditions);
    messages.push(...updateResult.messages);
  }

  // Check for game over conditions
  const resourceStatus = checkResourceStatus(journey.resources, FIELD_RESOURCES);

  if (resourceStatus.depleted.some(d => d.id === 'fuel') && paceId !== 'resting') {
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

  // Log the day with more detail
  journey.log.push({
    day: journey.day - 1,
    type: 'travel',
    action: pace.name,
    distance: travelInfo.distance,
    location: currentBlock?.name || 'Unknown',
    weather: journey.weather?.name || 'Unknown',
    summary: travelInfo.distance > 0
      ? `Traveled ${travelInfo.distance} km (${pace.name})`
      : 'Rested for the day'
  });

  // Log milestone if reached
  const lastMilestone = journey.milestonesReached?.[journey.milestonesReached.length - 1];
  if (lastMilestone && !journey.log.some(l => l.type === 'milestone' && l.threshold === lastMilestone)) {
    journey.log.push({
      day: journey.day - 1,
      type: 'milestone',
      threshold: lastMilestone,
      summary: `Reached ${lastMilestone}% of journey`
    });
  }

  // Log block arrival
  if (travelInfo.reachesBlock) {
    const arrivedBlock = getCurrentBlock(journey);
    journey.log.push({
      day: journey.day - 1,
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
  journey.resources.energy -= 10;

  // Move permits through pipeline
  if (journey.permits.submitted > 0) {
    journey.permits.submitted--;
    journey.permits.inReview++;
    messages.push('Submitted a permit package for review.');
  }

  // Random chance to advance review
  if (journey.permits.inReview > 0 && Math.random() < 0.4) {
    journey.permits.inReview--;
    if (Math.random() < 0.7) {
      journey.permits.approved++;
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
  journey.resources.energy -= 15;
  journey.resources.politicalCapital -= 2;

  const sh = journey.stakeholders[stakeholder];
  if (sh) {
    sh.meetings++;
    const moodChange = 10 + Math.floor(Math.random() * 10);
    sh.mood = Math.min(100, sh.mood + moodChange);
    messages.push(`Met with ${stakeholder}. Relations improved by ${moodChange}.`);

    // Good relations speed up permits
    if (sh.mood >= 70 && journey.permits.inReview > 0 && Math.random() < 0.3) {
      journey.permits.inReview--;
      journey.permits.approved++;
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
  journey.resources.energy -= 30;

  messages.push('Spent the day managing the crisis.');

  // Crises have variable outcomes
  if (Math.random() < 0.6) {
    messages.push('The situation was contained.');
    journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + 5);
  } else {
    messages.push('The crisis escalated despite your efforts.');
    journey.resources.politicalCapital -= 10;
    journey.resources.budget -= 2000;
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
  journey.resources.budget -= 100; // Coffee and snacks

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
    return Math.round((journey.day / journey.deadline) * 100);
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

  // Calculate distance within current block
  let distanceIntoBlock = journey.distanceTraveled;
  for (let i = 0; i < journey.currentBlockIndex; i++) {
    distanceIntoBlock -= journey.blocks[i].distance;
  }

  const distanceToNextBlock = nextBlock
    ? Math.max(0, currentBlock.distance - distanceIntoBlock)
    : 0;

  const overallProgress = Math.round((journey.distanceTraveled / journey.totalDistance) * 100);
  const blockProgress = currentBlock.distance > 0
    ? Math.round((distanceIntoBlock / currentBlock.distance) * 100)
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
