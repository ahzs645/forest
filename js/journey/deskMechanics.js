/**
 * Desk Mechanics
 * Desk day execution, permit processing, meetings, and crises
 */

import {
  calculateDeskConsumption,
  applyConsumption,
  applyDeskRegen,
  checkResourceStatus,
  DESK_RESOURCES
} from '../resources.js';
import { getActiveCrewCount, processDailyUpdate } from '../crew.js';

function applyDeskEffort(journey, { energy = 0, stress = 0 }) {
  if (journey.protagonist) {
    if (energy) {
      journey.protagonist.energy = Math.max(0, (journey.protagonist.energy || 0) - energy);
    }
    if (stress) {
      journey.protagonist.stress = Math.min(100, (journey.protagonist.stress || 0) + stress);
    }
    return;
  }

  if (typeof journey.resources?.energy === 'number' && energy) {
    journey.resources.energy = Math.max(0, journey.resources.energy - energy);
  }
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
  applyDeskEffort(journey, { energy: 10, stress: 4 });

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
  applyDeskEffort(journey, { energy: 15, stress: 6 });
  journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 2);

  const sh = journey.stakeholders?.[stakeholder];
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
  } else if (journey.relationships && Object.keys(journey.relationships).length > 0) {
    const relationshipKey = stakeholder === 'community' ? 'agencies' : stakeholder;
    if (typeof journey.relationships[relationshipKey] === 'number') {
      const moodChange = 6 + Math.floor(Math.random() * 8);
      journey.relationships[relationshipKey] = Math.min(100, journey.relationships[relationshipKey] + moodChange);
      messages.push(`Met with ${stakeholder}. Working relationship improved by ${moodChange}.`);
    } else {
      messages.push(`Met with ${stakeholder}. The conversation bought you a little more breathing room.`);
    }

    const capitalGain = stakeholder === 'ministry' ? 4 : 2;
    journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + capitalGain);
    messages.push(`Political capital stabilized (+${capitalGain}).`);

    if (journey.permits?.inReview > 0 && Math.random() < 0.25) {
      journey.permits.inReview--;
      journey.permits.approved = Math.min(journey.permits.target, journey.permits.approved + 1);
      messages.push('The meeting helped push a permit through!');
    } else if ((journey.permits?.inReferral || 0) > 0 && Math.random() < 0.35) {
      journey.permits.inReferral--;
      journey.permits.inReview++;
      messages.push('The meeting unstuck one referral and moved it into review.');
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
  applyDeskEffort(journey, { energy: 30, stress: 14 });

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
  journey.resources.budget = Math.max(0, journey.resources.budget - 100);

  if (journey.crew?.length) {
    for (const member of journey.crew) {
      if (member.isActive) {
        member.morale = Math.min(100, member.morale + 15);
      }
    }
    messages.push('Team morale has improved.');
  } else if (journey.protagonist) {
    journey.protagonist.energy = Math.min(100, (journey.protagonist.energy || 0) + 8);
    journey.protagonist.stress = Math.max(0, (journey.protagonist.stress || 0) - 6);
    messages.push('You calm the office, reset expectations, and recover a little energy.');
  }
  return { journey, messages };
}

/**
 * End the desk day
 */
function endDeskDay(journey) {
  const messages = [];

  // Daily resource consumption
  const meetings = journey.stakeholders
    ? Object.values(journey.stakeholders).reduce((sum, s) => sum + s.meetings, 0)
    : 0;

  const consumption = calculateDeskConsumption({
    overtime: 8 - journey.hoursRemaining > 8 ? 8 - journey.hoursRemaining - 8 : 0,
    meetings
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
