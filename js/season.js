/**
 * Season System Module
 * Manages seasonal progression and year-based gameplay
 */

// Season definitions
export const SEASONS = {
  spring: {
    id: 'spring',
    name: 'Spring',
    icon: '🌱',
    months: [3, 4, 5], // March, April, May
    daysPerSeason: 90,
    description: 'Thaw and renewal. Planting season begins.'
  },
  summer: {
    id: 'summer',
    name: 'Summer',
    icon: '☀️',
    months: [6, 7, 8], // June, July, August
    daysPerSeason: 90,
    description: 'Peak field season. Long days and active operations.'
  },
  fall: {
    id: 'fall',
    name: 'Fall',
    icon: '🍂',
    months: [9, 10, 11], // September, October, November
    daysPerSeason: 90,
    description: 'Harvest and assessment. Weather turns unpredictable.'
  },
  winter: {
    id: 'winter',
    name: 'Winter',
    icon: '❄️',
    months: [12, 1, 2], // December, January, February
    daysPerSeason: 90,
    description: 'Planning and preparation. Limited field access.'
  }
};

export const SEASON_ORDER = ['spring', 'summer', 'fall', 'winter'];

// Starting seasons by role (which season makes sense to start)
export const ROLE_START_SEASONS = {
  recce: 'summer',        // Recon starts in peak field season
  silviculture: 'spring', // Silviculture starts at planting
  planner: 'fall',        // Planning starts before fiscal year
  permitter: 'spring'     // Permitting starts with new fiscal year
};

// Seasonal modifiers by role - affects gameplay mechanics
export const SEASONAL_MODIFIERS = {
  recce: {
    spring: {
      travelSpeed: 0.7,      // Snow melt, muddy roads
      eventChance: 1.2,      // More hazards
      description: 'Spring melt makes access challenging'
    },
    summer: {
      travelSpeed: 1.0,      // Normal operations
      eventChance: 1.0,
      description: 'Peak survey season'
    },
    fall: {
      travelSpeed: 0.85,     // Early snow possible
      eventChance: 1.1,
      description: 'Weather windows closing'
    },
    winter: {
      travelSpeed: 0.5,      // Limited access
      eventChance: 0.5,      // Fewer events (less activity)
      description: 'Minimal field activity'
    }
  },
  silviculture: {
    spring: {
      plantingEfficiency: 1.2,  // Prime planting
      contractorMorale: 1.0,
      description: 'Critical planting window'
    },
    summer: {
      plantingEfficiency: 0.6,  // Too hot/dry
      brushingEfficiency: 1.2,  // Good for herbicide
      contractorMorale: 0.9,
      description: 'Brushing and herbicide season'
    },
    fall: {
      plantingEfficiency: 0.8,  // Fall planting possible
      surveyEfficiency: 1.2,    // Good for survival surveys
      contractorMorale: 0.85,
      description: 'Survey and assessment season'
    },
    winter: {
      plantingEfficiency: 0,    // No planting
      planningEfficiency: 1.3,  // Good for next year planning
      contractorMorale: 0.7,
      description: 'Planning for next season'
    }
  },
  planner: {
    spring: {
      stakeholderAvailability: 0.9,
      ministryResponseTime: 1.0,
      description: 'New fiscal year begins'
    },
    summer: {
      stakeholderAvailability: 0.7,  // Vacation season
      ministryResponseTime: 1.3,     // Slower responses
      description: 'Summer slowdown in approvals'
    },
    fall: {
      stakeholderAvailability: 1.0,
      ministryResponseTime: 0.9,
      description: 'Active planning cycle'
    },
    winter: {
      stakeholderAvailability: 0.8,  // Holidays
      ministryResponseTime: 1.2,
      description: 'Year-end deadlines'
    }
  },
  permitter: {
    spring: {
      referralWindow: 30,
      processingSpeed: 1.0,
      description: 'Standard processing'
    },
    summer: {
      referralWindow: 45,           // Extended due to slowdowns
      processingSpeed: 0.8,
      description: 'Summer delays in referrals'
    },
    fall: {
      referralWindow: 30,
      processingSpeed: 1.1,
      description: 'Push before year-end'
    },
    winter: {
      referralWindow: 60,           // Holiday delays
      processingSpeed: 0.7,
      description: 'Holiday processing delays'
    }
  }
};

/**
 * Create initial season state
 * @param {string} roleId - The forester role ID
 * @param {number} year - Starting year (default 1)
 * @returns {object} Season state object
 */
export function createSeasonState(roleId, year = 1) {
  const startSeason = ROLE_START_SEASONS[roleId] || 'spring';

  return {
    currentSeason: startSeason,
    year: year,
    dayInSeason: 1,
    totalDaysInSeason: SEASONS[startSeason].daysPerSeason,
    totalDaysPlayed: 0,
    seasonTransitions: 0
  };
}

/**
 * Advance the day counter and check for season/year transitions
 * @param {object} seasonState - Current season state
 * @returns {object} Updated state with transition info
 */
export function advanceDay(seasonState) {
  const newState = { ...seasonState };
  newState.dayInSeason++;
  newState.totalDaysPlayed++;

  const transition = {
    seasonChanged: false,
    yearChanged: false,
    previousSeason: seasonState.currentSeason,
    previousYear: seasonState.year,
    newSeason: null,
    newYear: null
  };

  // Check for season transition
  if (newState.dayInSeason > newState.totalDaysInSeason) {
    const currentIndex = SEASON_ORDER.indexOf(newState.currentSeason);
    const nextIndex = (currentIndex + 1) % SEASON_ORDER.length;

    newState.currentSeason = SEASON_ORDER[nextIndex];
    newState.dayInSeason = 1;
    newState.totalDaysInSeason = SEASONS[newState.currentSeason].daysPerSeason;
    newState.seasonTransitions++;

    transition.seasonChanged = true;
    transition.newSeason = newState.currentSeason;

    // Check for year transition (winter -> spring)
    if (nextIndex === 0) {
      newState.year++;
      transition.yearChanged = true;
      transition.newYear = newState.year;
    }
  }

  return { state: newState, transition };
}

/**
 * Get seasonal modifiers for a specific role
 * @param {string} season - Current season ID
 * @param {string} roleId - The forester role ID
 * @returns {object} Modifiers object
 */
export function getSeasonModifiers(season, roleId) {
  const roleModifiers = SEASONAL_MODIFIERS[roleId];
  if (!roleModifiers) {
    return { description: 'Standard operations' };
  }

  return roleModifiers[season] || { description: 'Standard operations' };
}

/**
 * Get the current season object with all details
 * @param {object} seasonState - Season state
 * @returns {object} Full season details
 */
export function getCurrentSeasonInfo(seasonState) {
  const season = SEASONS[seasonState.currentSeason];
  return {
    ...season,
    year: seasonState.year,
    dayInSeason: seasonState.dayInSeason,
    daysRemaining: seasonState.totalDaysInSeason - seasonState.dayInSeason,
    progress: Math.round((seasonState.dayInSeason / seasonState.totalDaysInSeason) * 100)
  };
}

/**
 * Check if an action is valid for the current season
 * @param {string} actionSeason - Season requirement (or array of seasons)
 * @param {string} currentSeason - Current season ID
 * @returns {boolean} Whether action is valid
 */
export function isSeasonValid(actionSeason, currentSeason) {
  if (!actionSeason) return true; // No restriction

  if (Array.isArray(actionSeason)) {
    return actionSeason.includes(currentSeason);
  }

  return actionSeason === currentSeason;
}

/**
 * Get display string for season
 * @param {object} seasonState - Season state
 * @returns {string} Display string like "🌱 Spring Y1"
 */
export function getSeasonDisplayString(seasonState) {
  const season = SEASONS[seasonState.currentSeason];
  return `${season.icon} ${season.name} Y${seasonState.year}`;
}

/**
 * Calculate days until end of current season
 * @param {object} seasonState - Season state
 * @returns {number} Days remaining
 */
export function getDaysRemaining(seasonState) {
  return seasonState.totalDaysInSeason - seasonState.dayInSeason;
}

/**
 * Check if we're in the final days of a season (for warnings)
 * @param {object} seasonState - Season state
 * @param {number} threshold - Days threshold (default 7)
 * @returns {boolean} Whether we're near season end
 */
export function isNearSeasonEnd(seasonState, threshold = 7) {
  return getDaysRemaining(seasonState) <= threshold;
}

/**
 * Get the next season info
 * @param {string} currentSeason - Current season ID
 * @returns {object} Next season details
 */
export function getNextSeason(currentSeason) {
  const currentIndex = SEASON_ORDER.indexOf(currentSeason);
  const nextIndex = (currentIndex + 1) % SEASON_ORDER.length;
  return SEASONS[SEASON_ORDER[nextIndex]];
}
