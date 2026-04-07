/**
 * Journey Constants
 * Pure data definitions for field/desk mechanics
 */

export const FIELD_SHIFT_HOURS = 9;
export const FIELD_DISTANCE_SCALE = 0.5;
export const BASE_DAILY_TRAVEL_KM = 9;
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
    25: 'The first wave of regeneration is taking hold across the program.',
    50: 'Half the silviculture campaign is established. Momentum is finally visible.',
    75: 'The season is bending your way. One more strong push could finish the contract cleanly.',
    90: 'Final block pressure. Every contractor call and survey day matters now.'
  },
  planning: {
    25: 'The planning wall has shape now. The expedition no longer feels theoretical.',
    50: 'Half the plan is standing. Stakeholders can finally see where this is headed.',
    75: 'Cabinet binders are stacking up. Approval country is finally in sight.',
    90: 'Last mile to sign-off. One clean submission could carry the plan over the line.'
  },
  permitting: {
    25: 'The permit queue is finally moving. The office can feel the pace change.',
    50: 'Half the approvals are within reach. The backlog is starting to blink first.',
    75: 'The deadline board looks winnable now. A few clean reviews could finish the job.',
    90: 'Final permit sprint. One more run through the pipeline could seal the season.'
  },
  desk: {
    25: 'The permit queue is finally moving. The office can feel the pace change.',
    50: 'Half the approvals are within reach. The backlog is starting to blink first.',
    75: 'The deadline board looks winnable now. A few clean reviews could finish the job.',
    90: 'Final permit sprint. One more run through the pipeline could seal the season.'
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
