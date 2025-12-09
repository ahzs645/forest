/**
 * Crew Management System
 * Handles crew generation, health, morale, and status effects
 */

import {
  FIRST_NAMES,
  FIELD_ROLES,
  DESK_ROLES,
  TRAITS,
  STATUS_EFFECTS,
  DEPARTURE_MESSAGES,
  RECOVERY_MESSAGES
} from './data/crewNames.js';

let crewIdCounter = 0;

/**
 * Generate a unique crew member ID
 * @returns {string} Unique ID
 */
function generateId() {
  return `crew_${++crewIdCounter}`;
}

/**
 * Pick a random item from an array
 * @param {Array} arr - Array to pick from
 * @returns {*} Random item
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a crew member
 * @param {string} journeyType - 'field' or 'desk'
 * @param {Object} roleOverride - Optional specific role to assign
 * @returns {Object} Crew member object
 */
export function generateCrewMember(journeyType, roleOverride = null) {
  const roles = journeyType === 'field' ? FIELD_ROLES : DESK_ROLES;
  const role = roleOverride || pickRandom(roles);
  const name = pickRandom(FIRST_NAMES);

  // Random chance for traits
  const traits = [];
  if (Math.random() < 0.3) {
    traits.push(pickRandom(TRAITS.positive).id);
  }
  if (Math.random() < 0.15) {
    traits.push(pickRandom(TRAITS.negative).id);
  }

  // Slight randomization of base stats
  const healthVariance = Math.floor(Math.random() * 10) - 5;
  const moraleVariance = Math.floor(Math.random() * 15) - 5;

  return {
    id: generateId(),
    name,
    role: role.id,
    roleName: role.name,
    health: Math.min(100, Math.max(50, role.baseHealth + healthVariance)),
    maxHealth: 100,
    morale: Math.min(100, Math.max(30, role.baseMorale + moraleVariance)),
    traits,
    statusEffects: [], // Array of { effectId, daysRemaining }
    daysIncapacitated: 0,
    isActive: true,
    isDead: false,
    hasQuit: false
  };
}

/**
 * Generate a full crew
 * @param {number} count - Number of crew members
 * @param {string} journeyType - 'field' or 'desk'
 * @returns {Object[]} Array of crew members
 */
export function generateCrew(count, journeyType) {
  const roles = journeyType === 'field' ? FIELD_ROLES : DESK_ROLES;
  const crew = [];
  const usedNames = new Set();

  // Ensure we have at least one of the essential roles
  const essentialRoles = journeyType === 'field'
    ? [roles.find(r => r.id === 'driver'), roles.find(r => r.id === 'medic')]
    : [roles.find(r => r.id === 'analyst'), roles.find(r => r.id === 'coordinator')];

  for (const role of essentialRoles) {
    if (role && crew.length < count) {
      const member = generateCrewMember(journeyType, role);
      // Ensure unique name
      while (usedNames.has(member.name)) {
        member.name = pickRandom(FIRST_NAMES);
      }
      usedNames.add(member.name);
      crew.push(member);
    }
  }

  // Fill remaining slots with random roles
  while (crew.length < count) {
    const member = generateCrewMember(journeyType);
    // Ensure unique name
    while (usedNames.has(member.name)) {
      member.name = pickRandom(FIRST_NAMES);
    }
    usedNames.add(member.name);
    crew.push(member);
  }

  return crew;
}

/**
 * Apply a status effect to a crew member
 * @param {Object} member - Crew member
 * @param {string} effectId - Effect ID from STATUS_EFFECTS
 * @returns {Object} Updated member and message
 */
export function applyStatusEffect(member, effectId) {
  const effect = STATUS_EFFECTS[effectId];
  if (!effect) return { member, message: null };

  // Check if already has this effect
  const existing = member.statusEffects.find(e => e.effectId === effectId);
  if (existing) {
    // Reset duration
    existing.daysRemaining = effect.duration;
    return {
      member,
      message: `${member.name}'s ${effect.name} has worsened.`
    };
  }

  member.statusEffects.push({
    effectId,
    daysRemaining: effect.duration
  });

  return {
    member,
    message: `${member.name} now has ${effect.name}.`
  };
}

/**
 * Remove a status effect from a crew member
 * @param {Object} member - Crew member
 * @param {string} effectId - Effect ID to remove
 * @returns {Object} Updated member and message
 */
export function removeStatusEffect(member, effectId) {
  const index = member.statusEffects.findIndex(e => e.effectId === effectId);
  if (index === -1) return { member, message: null };

  const effect = STATUS_EFFECTS[effectId];
  member.statusEffects.splice(index, 1);

  const messageTemplate = pickRandom(RECOVERY_MESSAGES);
  return {
    member,
    message: messageTemplate.replace('{name}', member.name)
  };
}

/**
 * Process daily updates for a crew member
 * @param {Object} member - Crew member
 * @param {Object} conditions - Current conditions (weather, pace, etc.)
 * @returns {Object} Updated member and array of messages
 */
export function processDailyUpdate(member, conditions = {}) {
  const messages = [];

  if (!member.isActive) {
    return { member, messages };
  }

  // Process each status effect
  const effectsToRemove = [];
  for (const effect of member.statusEffects) {
    const effectDef = STATUS_EFFECTS[effect.effectId];
    if (!effectDef) continue;

    // Apply health drain
    if (effectDef.healthDrain > 0) {
      member.health -= effectDef.healthDrain;
      if (member.health < 0) member.health = 0;
    }

    // Apply morale effect
    member.morale += effectDef.moraleEffect;
    if (member.morale < 0) member.morale = 0;
    if (member.morale > 100) member.morale = 100;

    // Decrement duration
    effect.daysRemaining--;
    if (effect.daysRemaining <= 0) {
      effectsToRemove.push(effect.effectId);
    }
  }

  // Remove expired effects
  for (const effectId of effectsToRemove) {
    const result = removeStatusEffect(member, effectId);
    if (result.message) messages.push(result.message);
  }

  // Natural health recovery (if no serious effects)
  const hasSeriousEffect = member.statusEffects.some(e => {
    const def = STATUS_EFFECTS[e.effectId];
    return def && def.healthDrain > 0;
  });

  if (!hasSeriousEffect && member.health < member.maxHealth) {
    member.health = Math.min(member.maxHealth, member.health + 5);
  }

  // Morale adjustments based on conditions
  if (conditions.restDay) {
    member.morale = Math.min(100, member.morale + 10);
  }
  if (conditions.gruelingPace) {
    member.morale = Math.max(0, member.morale - 5);
  }
  if (conditions.lowFood) {
    member.morale = Math.max(0, member.morale - 3);
    member.health = Math.max(0, member.health - 2);
  }
  if (conditions.coldWeather && !conditions.shelter) {
    member.morale = Math.max(0, member.morale - 2);
  }

  // Check for death
  if (member.health <= 0) {
    member.isActive = false;
    member.isDead = true;
    const deathType = hasSeriousEffect ? 'death_illness' : 'death_injury';
    const template = pickRandom(DEPARTURE_MESSAGES[deathType]);
    messages.push(template.replace('{name}', member.name));
  }

  // Check for quitting (low morale)
  if (member.morale <= 10 && Math.random() < 0.3) {
    member.isActive = false;
    member.hasQuit = true;
    const template = pickRandom(DEPARTURE_MESSAGES.quit_morale);
    messages.push(template.replace('{name}', member.name));
  }

  return { member, messages };
}

/**
 * Get current work capacity of a crew member (0-1)
 * @param {Object} member - Crew member
 * @returns {number} Work capacity (0 = cannot work, 1 = full capacity)
 */
export function getWorkCapacity(member) {
  if (!member.isActive) return 0;

  let capacity = 1;

  // Health penalty below 50
  if (member.health < 50) {
    capacity *= member.health / 50;
  }

  // Status effects reduce capacity
  for (const effect of member.statusEffects) {
    const effectDef = STATUS_EFFECTS[effect.effectId];
    if (effectDef && typeof effectDef.workCapacity === 'number') {
      capacity *= effectDef.workCapacity;
    }
  }

  // Apply trait modifiers
  for (const traitId of member.traits) {
    const trait = [...TRAITS.positive, ...TRAITS.negative].find(t => t.id === traitId);
    if (trait && trait.effect === 'performance') {
      capacity *= trait.modifier;
    }
  }

  return Math.max(0, Math.min(1, capacity));
}

/**
 * Get total crew work capacity
 * @param {Object[]} crew - Array of crew members
 * @returns {number} Total work capacity
 */
export function getTotalWorkCapacity(crew) {
  return crew.reduce((sum, member) => sum + getWorkCapacity(member), 0);
}

/**
 * Get count of active crew members
 * @param {Object[]} crew - Array of crew members
 * @returns {number} Active crew count
 */
export function getActiveCrewCount(crew) {
  return crew.filter(m => m.isActive).length;
}

/**
 * Get average morale of active crew
 * @param {Object[]} crew - Array of crew members
 * @returns {number} Average morale (0-100)
 */
export function getAverageMorale(crew) {
  const active = crew.filter(m => m.isActive);
  if (active.length === 0) return 0;
  return active.reduce((sum, m) => sum + m.morale, 0) / active.length;
}

/**
 * Find crew member by role
 * @param {Object[]} crew - Array of crew members
 * @param {string} roleId - Role ID to find
 * @returns {Object|null} Crew member or null
 */
export function findCrewByRole(crew, roleId) {
  return crew.find(m => m.isActive && m.role === roleId) || null;
}

/**
 * Check if crew has a specific capability
 * @param {Object[]} crew - Array of crew members
 * @param {string} skill - Skill to check
 * @returns {boolean} True if any active member has the skill
 */
export function crewHasSkill(crew, skill) {
  const roles = [...FIELD_ROLES, ...DESK_ROLES];
  return crew.some(member => {
    if (!member.isActive) return false;
    const role = roles.find(r => r.id === member.role);
    return role && role.skills && role.skills.includes(skill);
  });
}

/**
 * Apply random injury to a crew member
 * @param {Object} member - Crew member
 * @param {string} severity - 'minor', 'moderate', or 'severe'
 * @returns {Object} Result with member and message
 */
export function applyRandomInjury(member, severity = 'moderate') {
  const injuries = {
    minor: ['sprained_ankle', 'cold'],
    moderate: ['broken_arm', 'flu', 'exhaustion'],
    severe: ['broken_leg', 'concussion', 'hypothermia']
  };

  const options = injuries[severity] || injuries.moderate;
  const injuryId = pickRandom(options);

  return applyStatusEffect(member, injuryId);
}

/**
 * Heal a crew member using first aid
 * @param {Object} member - Crew member to heal
 * @param {number} healAmount - Amount to heal
 * @returns {Object} Result with member and message
 */
export function healCrewMember(member, healAmount = 20) {
  const oldHealth = member.health;
  member.health = Math.min(member.maxHealth, member.health + healAmount);
  const healed = member.health - oldHealth;

  if (healed > 0) {
    return {
      member,
      message: `${member.name} was treated and recovered ${healed} health.`
    };
  }

  return {
    member,
    message: `${member.name} is already at full health.`
  };
}

/**
 * Boost crew morale
 * @param {Object[]} crew - Array of crew members
 * @param {number} amount - Morale boost amount
 * @returns {string} Message about morale boost
 */
export function boostMorale(crew, amount = 10) {
  for (const member of crew) {
    if (member.isActive) {
      member.morale = Math.min(100, member.morale + amount);
    }
  }
  return 'The crew\'s spirits have lifted.';
}

/**
 * Get a display-friendly status summary for a crew member
 * @param {Object} member - Crew member
 * @returns {Object} Display info
 */
export function getCrewDisplayInfo(member) {
  const effects = member.statusEffects.map(e => {
    const def = STATUS_EFFECTS[e.effectId];
    return def ? { name: def.name, daysLeft: e.daysRemaining } : null;
  }).filter(Boolean);

  let status = 'Good';
  if (!member.isActive) {
    status = member.isDead ? 'Deceased' : 'Left';
  } else if (effects.length > 0) {
    status = effects[0].name;
  } else if (member.health < 30) {
    status = 'Critical';
  } else if (member.health < 60) {
    status = 'Injured';
  } else if (member.morale < 30) {
    status = 'Unhappy';
  }

  return {
    name: member.name,
    role: member.roleName,
    health: member.health,
    morale: member.morale,
    status,
    effects,
    isActive: member.isActive,
    workCapacity: getWorkCapacity(member)
  };
}
