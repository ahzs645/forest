/**
 * Desk Mechanics
 * Desk day execution, permit queue work, meetings, and crises.
 *
 * The queue itself lives in js/journey/permitPipeline.js — one pipeline for
 * every desk, with named files, lanes, and clocks. This module is the day
 * around it.
 */

import {
  calculateDeskConsumption,
  applyConsumption,
  applyDeskRegen,
  checkResourceStatus,
  DESK_RESOURCES
} from '../resources.js';
import { getActiveCrewCount, processDailyUpdate } from '../crew.js';
import {
  applyProfessionalComplianceShift,
  ensureProfessionalComplianceState,
} from '../engine.js';
import { startDay, spendDay, dayIsSpent } from './dayPlan.js';
import {
  DAILY_PERMIT_THROUGHPUT,
  advancePermitClocks,
  describeLane,
  draftPermits,
  getChaseableFiles,
  getPermitFilesInLane,
  planQueueWork,
  reconcilePermitFiles,
  resubmitPermitFile,
  shortenPermitClock,
  submitPermits,
} from './permitPipeline.js';

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

function labelsOf(files) {
  return files.map((file) => file.label).join(', ');
}

/**
 * Work the permit queue for a day: draft the backlog, submit what is drafted,
 * otherwise chase the closest district clock. One pipeline for every desk
 * (js/journey/permitPipeline.js); the Permitting Specialist's mode wraps the
 * same steps with its own copy and deficiency letters.
 */
function processPermitWork(journey) {
  const messages = [];
  const professional = ensureProfessionalComplianceState(journey);

  if (dayIsSpent(journey)) {
    messages.push('The day is already committed elsewhere.');
    return { journey, messages };
  }

  reconcilePermitFiles(journey);
  const plan = planQueueWork(journey);
  if (!plan.step) {
    // Nothing to draft, submit, or chase: the day is not spent, so the desk
    // can turn to the deficiency letters instead.
    messages.push('Nothing is moving in the district queue until the deficiency letters are answered.');
    return { journey, messages };
  }

  spendDay(journey);
  applyDeskEffort(journey, { energy: 10, stress: 4 });

  if (plan.step === 'draft') {
    const drafted = draftPermits(journey, DAILY_PERMIT_THROUGHPUT);
    messages.push(`Drafted ${labelsOf(drafted)}.`);
    applyProfessionalComplianceShift(journey, { paperworkLoad: 2, auditExposure: 1 });
  } else if (plan.step === 'submit') {
    const submitted = submitPermits(journey, DAILY_PERMIT_THROUGHPUT);
    messages.push(`Submitted ${labelsOf(submitted)} to the district.`);
    applyProfessionalComplianceShift(journey, { paperworkLoad: 2, auditExposure: 1 });
  } else {
    const file = shortenPermitClock(journey, ['screening', 'decision']);
    if (file) messages.push(`Chased the district on ${file.label}: ${describeLane(file, journey).charAt(0).toUpperCase()}${describeLane(file, journey).slice(1)}.`);
    applyProfessionalComplianceShift(journey, { paperworkLoad: 1 });
  }

  // A desk without a Permitting Specialist's deficiency queue still answers
  // its letters, one a day, when the file is in good enough shape to refile.
  const deficiency = getPermitFilesInLane(journey, 'deficiency');
  if (deficiency.length > 0 && !Array.isArray(journey.permits.revisionQueue)) {
    const registrationBonus = professional?.registrationStatus === 'active' ? 0.2 : 0;
    const burdenPenalty = Math.min(0.3, (professional?.paperworkLoad || 0) / 100);
    const successChance = 0.45 + registrationBonus - burdenPenalty;
    if (Math.random() < successChance) {
      const file = resubmitPermitFile(journey, deficiency[0].id, {
        completeness: deficiency[0].deficiencyProfileId === 'package-completeness',
      });
      if (file) {
        messages.push(`Answered the deficiency letter on ${file.label}: ${describeLane(file, journey).charAt(0).toUpperCase()}${describeLane(file, journey).slice(1)}.`);
        applyProfessionalComplianceShift(journey, { paperworkLoad: -1, auditExposure: -1 });
      }
    }
  }

  if (professional?.registrationStatus !== 'active') {
    messages.push('Registration is not current, so the file carries extra scrutiny.');
  }

  return { journey, messages };
}

const MEETING_LABELS = {
  ministry: 'the district office',
  nations: 'the Nation',
  agencies: 'the agencies (DFO / ENV)',
  community: 'the community',
  licensees: 'the mill',
};

/**
 * Meet the district, the Nation, or the agencies. Each meeting moves its own
 * clock: the district can confirm a file complete and issue one that is due,
 * the Nation's referral coordinator can bring a response in early, and the
 * agencies can settle an in-stream work window before it becomes a letter.
 */
function holdStakeholderMeeting(journey, stakeholder = 'ministry') {
  const messages = [];

  if (dayIsSpent(journey)) {
    messages.push('The day is already committed elsewhere.');
    return { journey, messages };
  }

  spendDay(journey);
  applyDeskEffort(journey, { energy: 15, stress: 6 });
  journey.resources.politicalCapital = Math.max(0, journey.resources.politicalCapital - 2);
  applyProfessionalComplianceShift(journey, { paperworkLoad: -1, auditExposure: -1 });

  const who = MEETING_LABELS[stakeholder] || stakeholder;
  const sh = journey.stakeholders?.[stakeholder];
  if (sh) {
    sh.meetings++;
    const moodChange = 10 + Math.floor(Math.random() * 10);
    sh.mood = Math.min(100, sh.mood + moodChange);
    messages.push(`Met with ${who}. Relations improved by ${moodChange}.`);
  } else if (journey.relationships && Object.keys(journey.relationships).length > 0) {
    const relationshipKey = stakeholder === 'community' ? 'agencies' : stakeholder;
    if (typeof journey.relationships[relationshipKey] === 'number') {
      const moodChange = 6 + Math.floor(Math.random() * 8);
      journey.relationships[relationshipKey] = Math.min(100, journey.relationships[relationshipKey] + moodChange);
      messages.push(`Met with ${who}. Working relationship improved by ${moodChange}.`);
    } else {
      messages.push(`Met with ${who}. The conversation bought you a little more breathing room.`);
    }

    const capitalGain = stakeholder === 'ministry' ? 4 : 2;
    journey.resources.politicalCapital = Math.min(100, journey.resources.politicalCapital + capitalGain);
    messages.push(`District goodwill steadied (+${capitalGain}).`);
  }

  if (!journey.permits) {
    return { journey, messages };
  }

  reconcilePermitFiles(journey);
  if (stakeholder === 'ministry') {
    const due = getChaseableFiles(journey, ['decision'])
      .filter((file) => !Number.isFinite(file.wsaClockCloses) || file.wsaClockCloses <= (journey.day || 1));
    if (due.length > 0 && Math.random() < 0.6) {
      const file = due[0];
      file.clockCloses = journey.day || 1;
      const result = advancePermitClocks(journey, { approvalRate: 1, completenessReturnRate: 0 });
      const issued = result.issued.find((entry) => entry.file.id === file.id);
      if (issued) messages.push(`The district confirms the file is complete and ${file.label} is issued.`);
    } else {
      const file = shortenPermitClock(journey, ['screening', 'decision']);
      if (file) messages.push(`District staff walk ${file.label} through completeness with you: ${describeLane(file, journey)}.`);
    }
  } else if (stakeholder === 'nations') {
    const file = shortenPermitClock(journey, ['referral']);
    if (file) {
      messages.push(`The referral coordinator agrees to turn ${file.label} around early: ${describeLane(file, journey)}.`);
    } else {
      messages.push('Nothing is out on referral today; the visit banks goodwill for the next one.');
    }
  } else {
    const stream = getChaseableFiles(journey, ['screening', 'referral', 'decision'])
      .find((file) => Number.isFinite(file.wsaClockCloses) && file.wsaClockCloses > (journey.day || 1));
    if (stream) {
      stream.wsaClockCloses = Math.max(journey.day || 1, stream.wsaClockCloses - 1);
      messages.push(`DFO and ENV settle the in-stream work window on ${stream.label}; the WSA s.11 window now closes Day ${stream.wsaClockCloses}.`);
    } else {
      messages.push('No crossing questions are open; the agencies note the licensee is easy to reach.');
    }
  }

  return { journey, messages };
}

/**
 * Handle a crisis
 */
function handleCrisis(journey, crisis = {}) {
  const messages = [];

  spendDay(journey); // A crisis is what the day turned out to be
  applyDeskEffort(journey, { energy: 30, stress: 14 });

  messages.push('Spent the day on the urgent file.');

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

  if (dayIsSpent(journey)) {
    messages.push('The day is already committed elsewhere.');
    return { journey, messages };
  }

  spendDay(journey);
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
    messages.push('You clear the whiteboard, reset the mill on its dates, and recover a little energy.');
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

  // Overtime was the leftover of an hour budget; a one-action day has none.
  const consumption = calculateDeskConsumption({ meetings });

  const result = applyConsumption(journey.resources, consumption, DESK_RESOURCES);
  journey.resources = result.resources;

  // Apply regeneration
  journey.resources = applyDeskRegen(journey.resources);

  // Reset daily values
  startDay(journey);
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
    journey.gameOverReason = 'DISTRICT GOODWILL EXHAUSTED - The licensee pulls you off the file.';
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
