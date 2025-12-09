/**
 * Crew Name Pools and Role Definitions
 * Names and roles for generating crew members
 */

// First names - mix of common Canadian names
export const FIRST_NAMES = [
  // Male names
  'Mike', 'Dave', 'John', 'Chris', 'Pat', 'Tom', 'Dan', 'Steve',
  'Brian', 'Kevin', 'Mark', 'Jeff', 'Rob', 'Tim', 'Scott', 'Craig',
  'Jim', 'Doug', 'Gary', 'Wayne', 'Terry', 'Gord', 'Rick', 'Brad',
  // Female names
  'Sarah', 'Maria', 'Linda', 'Karen', 'Lisa', 'Susan', 'Nancy', 'Betty',
  'Helen', 'Sandra', 'Donna', 'Carol', 'Ruth', 'Sharon', 'Michelle', 'Laura',
  'Amanda', 'Melissa', 'Deborah', 'Stephanie', 'Rebecca', 'Janet', 'Margaret', 'Diane',
  // Gender-neutral
  'Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie',
  // Indigenous names (BC First Nations)
  'Charlie', 'George', 'Tommy', 'Billy', 'Joseph', 'William', 'Frank', 'Henry'
];

// Field crew roles (for Recon/Silviculture)
export const FIELD_ROLES = [
  {
    id: 'faller',
    name: 'Faller',
    description: 'Operates chainsaw to fall trees',
    skills: ['cutting', 'safety'],
    baseHealth: 100,
    baseMorale: 70
  },
  {
    id: 'bucker',
    name: 'Bucker',
    description: 'Bucks fallen trees into logs',
    skills: ['processing', 'measurement'],
    baseHealth: 100,
    baseMorale: 75
  },
  {
    id: 'spotter',
    name: 'Spotter',
    description: 'Surveys terrain and spots hazards',
    skills: ['navigation', 'observation'],
    baseHealth: 90,
    baseMorale: 80
  },
  {
    id: 'driver',
    name: 'Driver',
    description: 'Operates trucks and heavy equipment',
    skills: ['driving', 'mechanics'],
    baseHealth: 95,
    baseMorale: 70
  },
  {
    id: 'medic',
    name: 'First Aid',
    description: 'Handles medical emergencies',
    skills: ['medical', 'safety'],
    baseHealth: 85,
    baseMorale: 85
  },
  {
    id: 'mechanic',
    name: 'Mechanic',
    description: 'Repairs and maintains equipment',
    skills: ['repair', 'mechanics'],
    baseHealth: 95,
    baseMorale: 75
  }
];

// Desk crew roles (for Planner/Permitter)
export const DESK_ROLES = [
  {
    id: 'analyst',
    name: 'Analyst',
    description: 'Processes data and prepares reports',
    skills: ['analysis', 'documentation'],
    baseHealth: 100,
    baseMorale: 70
  },
  {
    id: 'coordinator',
    name: 'Coordinator',
    description: 'Manages schedules and communications',
    skills: ['organization', 'communication'],
    baseHealth: 100,
    baseMorale: 75
  },
  {
    id: 'admin',
    name: 'Admin',
    description: 'Handles paperwork and filing',
    skills: ['administration', 'typing'],
    baseHealth: 100,
    baseMorale: 65
  },
  {
    id: 'technician',
    name: 'Technician',
    description: 'Operates GIS and technical systems',
    skills: ['technical', 'mapping'],
    baseHealth: 100,
    baseMorale: 80
  },
  {
    id: 'liaison',
    name: 'Liaison',
    description: 'Manages stakeholder relationships',
    skills: ['diplomacy', 'communication'],
    baseHealth: 100,
    baseMorale: 70
  }
];

// Possible traits that affect crew performance
export const TRAITS = {
  positive: [
    { id: 'experienced', name: 'Experienced', effect: 'performance', modifier: 1.15 },
    { id: 'hardy', name: 'Hardy', effect: 'health_loss', modifier: 0.8 },
    { id: 'cheerful', name: 'Cheerful', effect: 'morale_bonus', modifier: 1.2 },
    { id: 'careful', name: 'Careful', effect: 'injury_chance', modifier: 0.7 },
    { id: 'efficient', name: 'Efficient', effect: 'resource_use', modifier: 0.9 },
    { id: 'leader', name: 'Natural Leader', effect: 'team_morale', modifier: 1.1 }
  ],
  negative: [
    { id: 'greenhorn', name: 'Greenhorn', effect: 'performance', modifier: 0.85 },
    { id: 'frail', name: 'Frail', effect: 'health_loss', modifier: 1.3 },
    { id: 'grumpy', name: 'Grumpy', effect: 'morale_bonus', modifier: 0.8 },
    { id: 'reckless', name: 'Reckless', effect: 'injury_chance', modifier: 1.4 },
    { id: 'wasteful', name: 'Wasteful', effect: 'resource_use', modifier: 1.15 },
    { id: 'loner', name: 'Loner', effect: 'team_morale', modifier: 0.9 }
  ]
};

// Status effects that can afflict crew members
export const STATUS_EFFECTS = {
  // Injuries (field)
  broken_leg: {
    name: 'Broken Leg',
    duration: 7,
    healthDrain: 0,
    moraleEffect: -5,
    workCapacity: 0,
    description: 'Cannot work. Requires rest.',
    canTravel: true
  },
  broken_arm: {
    name: 'Broken Arm',
    duration: 5,
    healthDrain: 0,
    moraleEffect: -3,
    workCapacity: 0.3,
    description: 'Limited work capacity.',
    canTravel: true
  },
  sprained_ankle: {
    name: 'Sprained Ankle',
    duration: 3,
    healthDrain: 0,
    moraleEffect: -2,
    workCapacity: 0.5,
    description: 'Slowed movement.',
    canTravel: true
  },
  concussion: {
    name: 'Concussion',
    duration: 4,
    healthDrain: 2,
    moraleEffect: -4,
    workCapacity: 0,
    description: 'Must rest. Health declining.',
    canTravel: true
  },

  // Illnesses
  flu: {
    name: 'Flu',
    duration: 5,
    healthDrain: 3,
    moraleEffect: -3,
    workCapacity: 0.2,
    description: 'Feverish and weak.',
    canTravel: true,
    contagious: true
  },
  cold: {
    name: 'Bad Cold',
    duration: 3,
    healthDrain: 1,
    moraleEffect: -1,
    workCapacity: 0.7,
    description: 'Sniffles and coughing.',
    canTravel: true,
    contagious: true
  },
  food_poisoning: {
    name: 'Food Poisoning',
    duration: 2,
    healthDrain: 5,
    moraleEffect: -5,
    workCapacity: 0,
    description: 'Violently ill. Cannot work.',
    canTravel: false
  },
  hypothermia: {
    name: 'Hypothermia',
    duration: 2,
    healthDrain: 8,
    moraleEffect: -6,
    workCapacity: 0,
    description: 'Dangerously cold. Needs warmth.',
    canTravel: false
  },
  exhaustion: {
    name: 'Exhaustion',
    duration: 2,
    healthDrain: 2,
    moraleEffect: -4,
    workCapacity: 0.3,
    description: 'Completely worn out.',
    canTravel: true
  },

  // Desk-specific
  burnout: {
    name: 'Burnout',
    duration: 5,
    healthDrain: 0,
    moraleEffect: -8,
    workCapacity: 0.4,
    description: 'Mentally exhausted.',
    canTravel: true
  },
  stressed: {
    name: 'Stressed',
    duration: 3,
    healthDrain: 0,
    moraleEffect: -4,
    workCapacity: 0.7,
    description: 'Anxious and overwhelmed.',
    canTravel: true
  }
};

// Death/departure messages
export const DEPARTURE_MESSAGES = {
  death_injury: [
    '{name} succumbed to their injuries.',
    '{name} didn\'t make it through the night.',
    'Despite everyone\'s efforts, {name} passed away.'
  ],
  death_illness: [
    '{name} died from illness.',
    '{name} grew weaker each day until they were gone.',
    'The sickness took {name} from us.'
  ],
  quit_morale: [
    '{name} packed their bags and left camp.',
    '{name} said "I\'ve had enough" and walked away.',
    '{name} quit without notice.',
    '{name} demanded to be taken back to town.'
  ],
  quit_fear: [
    '{name} refused to continue after seeing the conditions.',
    '{name} said this job isn\'t worth dying for.',
    'After the incident, {name} wouldn\'t get back in the truck.'
  ]
};

// Recovery messages
export const RECOVERY_MESSAGES = [
  '{name} is feeling much better today.',
  '{name} has recovered and is ready to work.',
  '{name}\'s condition has improved significantly.',
  '{name} is back on their feet.'
];
