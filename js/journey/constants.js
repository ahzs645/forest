/**
 * Journey Constants
 * Pure data definitions for field/desk mechanics
 */

export const FIELD_DISTANCE_SCALE = 0.5;
// A shift is one job (js/journey/dayPlan.js), so a travel day is the whole
// day on the road rather than four hours of it wedged around camp chores.
export const BASE_DAILY_TRAVEL_KM = 12;
export const DAILY_TRAVEL_VARIANCE = 0.12;

// Role to journey type mapping
export const ROLE_JOURNEY_TYPES = {
  recce: 'recon',
  silviculture: 'silviculture',
  planner: 'planning',
  permitter: 'permitting',
  manager: 'manager'
};

export const JOURNEY_MILESTONES = [25, 50, 75, 90];

export const MILESTONE_COPY = {
  recon: {
    25: 'Quarter of the traverse complete. The crew is settling into the bush rhythm.',
    50: 'Halfway there. The route map finally looks beatable.',
    75: 'Three-quarters complete. Every fuel drum and dry sock matters now.',
    90: 'Final push. The extraction point is almost within sight.'
  },
  field: {
    25: 'Quarter of the traverse complete. The crew is settling into the bush rhythm.',
    50: 'Halfway there. The route map finally looks beatable.',
    75: 'Three-quarters complete. Every fuel drum and dry sock matters now.',
    90: 'Final push. The extraction point is almost within sight.'
  },
  silviculture: {
    25: 'First blocks in the ground and inspected; the year\'s program has a shape.',
    50: 'Half the program delivered: blocks inspected, release moving through the older stands.',
    75: 'The season is bending your way. Last blocks, last release openings, the surveyor booked.',
    90: 'Last block and last declaration in sight.'
  },
  planning: {
    25: 'The inventory wall has shape now. The operating area no longer feels theoretical.',
    50: 'Half the plan is standing. The Nations and the public can finally see where this is headed.',
    75: 'The FSP binder has shape. The District Manager\'s decision is in sight.',
    90: 'Last mile to sign-off. One clean submission could carry the plan over the line.'
  },
  permitting: {
    25: 'The permit queue is finally moving. The office can feel the pace change.',
    50: 'Half the permits are issued. The backlog is starting to blink first.',
    75: 'The deadline board looks winnable now. A few clean decisions could finish the job.',
    90: 'Final permit sprint. One more pass through the district queue could seal the season.'
  },
  desk: {
    25: 'The permit queue is finally moving. The office can feel the pace change.',
    50: 'Half the permits are issued. The backlog is starting to blink first.',
    75: 'The deadline board looks winnable now. A few clean decisions could finish the job.',
    90: 'Final permit sprint. One more pass through the district queue could seal the season.'
  },
  manager: {
    25: 'First quarter closes. Your strategic direction is taking root.',
    50: 'Mid-year review. Operations are balanced but challenges loom.',
    75: 'Entering Q4. Board pressure increases as targets approach.',
    90: 'Year-end wrap up. Final maneuvers to hit objectives.'
  }
};

// Pace definitions
export const PACE_OPTIONS = {
  resting: {
    id: 'resting',
    name: 'Rest & Reset',
    description: 'Stand down and recover',
    distanceMultiplier: 0,
    healthBonus: 10,
    moraleBonus: 8,
    eventRisk: 0.05
  },
  camp_work: {
    id: 'camp_work',
    name: 'Camp Tasks',
    description: 'Stationary prep and upkeep',
    distanceMultiplier: 0,
    healthBonus: 2,
    moraleBonus: -1,
    eventRisk: 0.10
  },
  slow: {
    id: 'slow',
    name: 'Cautious Recon',
    description: 'Lower coverage, lower risk',
    distanceMultiplier: 0.6,
    healthBonus: 2,
    moraleBonus: 2,
    eventRisk: 0.10
  },
  normal: {
    id: 'normal',
    name: 'Standard Recon',
    description: 'Typical shift coverage',
    distanceMultiplier: 1.0,
    healthBonus: 0,
    moraleBonus: 0,
    eventRisk: 0.20
  },
  fast: {
    id: 'fast',
    name: 'Extended Recon',
    description: 'Cover more ground, more wear',
    distanceMultiplier: 1.4,
    healthBonus: -3,
    moraleBonus: -5,
    eventRisk: 0.30
  },
  grueling: {
    id: 'grueling',
    name: 'Max Effort',
    description: 'Long shift at high cost',
    distanceMultiplier: 1.8,
    healthBonus: -8,
    moraleBonus: -12,
    eventRisk: 0.45
  }
};

// Desk action definitions. Each one is a day's work now (see
// js/journey/dayPlan.js) — what used to be a two-hour slice of a shift is the
// thing the desk did that day.
export const DESK_ACTIONS = {
  process_permits: {
    id: 'process_permits',
    name: 'Process Permits',
    description: 'Work the queue: draft the backlog, submit what is drafted, chase the closest clock',
    energyCost: 10
  },
  stakeholder_meeting: {
    id: 'stakeholder_meeting',
    name: 'Stakeholder Meeting',
    description: 'Meet the district office, the Nation, or the agencies',
    energyCost: 15
  },
  crisis_management: {
    id: 'crisis_management',
    name: 'Work the urgent file',
    description: 'Drop everything and deal with the file that cannot wait',
    energyCost: 30
  },
  team_morale: {
    id: 'team_morale',
    name: 'Reset the office',
    description: 'Clear the whiteboard, reset the mill on its dates, recover a little energy',
    energyCost: 5
  },
  end_day: {
    id: 'end_day',
    name: 'Call it a day',
    description: 'Head home early; the district clocks keep running',
    energyCost: 0
  }
};

/**
 * Planning file gates. The District Manager's decision needs the file's
 * readiness at DECISION_GATE; everything short of Prepare Submission (the
 * step that checks the FOM comment period, the water gate, the road file and
 * registration) tops out at PRE_SUBMISSION_CAP so only the submission crosses
 * the line. resolution.js reads these for the generic progress fallback.
 */
export const PLANNING_DECISION_GATE = 80;
export const PLANNING_PRE_SUBMISSION_CAP = 66;
