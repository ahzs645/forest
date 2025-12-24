/**
 * Shared Journey Utilities
 * Common functions used across all journey types
 */

import { getActiveCrewCount, getAverageMorale } from '../crew.js';

/**
 * Create base journey state shared across all types
 * @param {Object} options - Setup options
 * @returns {Object} Base journey state
 */
export function createBaseJourneyState(options = {}) {
  const { roleId, areaId, companyName, crewName, role, area } = options;

  return {
    companyName: companyName || crewName || 'Unnamed Crew',
    roleId: roleId || role?.id,
    areaId: areaId || area?.id,
    role,
    area,

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
 * Log an entry to journey history
 * @param {Object} journey - Journey state
 * @param {Object} entry - Log entry
 */
export function logJourneyEntry(journey, entry) {
  if (!journey.log) journey.log = [];

  journey.log.push({
    timestamp: Date.now(),
    ...entry
  });
}

/**
 * Get journey status summary (common fields)
 * @param {Object} journey - Journey state
 * @returns {Object} Common status fields
 */
export function getCommonStatus(journey) {
  return {
    crewActive: getActiveCrewCount(journey.crew),
    crewTotal: journey.crew?.length || 0,
    morale: Math.round(getAverageMorale(journey.crew)),
    isComplete: journey.isComplete,
    isGameOver: journey.isGameOver
  };
}

/**
 * Check if journey has ended (victory or game over)
 * @param {Object} journey - Journey state
 * @returns {boolean} Whether journey has ended
 */
export function isJourneyEnded(journey) {
  return journey.isComplete || journey.isGameOver;
}

/**
 * Format log entries for display with journey type context
 * @param {Object} journey - Journey state
 * @param {string} dayLabel - Label for day/shift (e.g., "Shift", "Day")
 * @returns {Object[]} Formatted log entries
 */
export function formatLog(journey, dayLabel = 'Day') {
  if (!journey.log || journey.log.length === 0) {
    return [];
  }

  const typeIcons = {
    travel: '→',
    event: '!',
    milestone: '★',
    arrival: '◆',
    action: '●',
    season: '◐',
    contract: '✓',
    planting: '🌱',
    survey: '📋',
    permit: '📄',
    meeting: '👥'
  };

  return journey.log.map(entry => ({
    day: entry.day,
    dayLabel,
    icon: typeIcons[entry.type] || '·',
    type: entry.type,
    summary: entry.summary || entry.eventTitle || entry.action || 'Unknown',
    detail: entry.detail || entry.optionLabel || entry.weather || ''
  }));
}

/**
 * Apply crew-wide effect
 * @param {Object[]} crew - Crew array
 * @param {string} stat - Stat to modify ('health' or 'morale')
 * @param {number} amount - Amount to change (positive or negative)
 * @returns {string[]} Messages about the effect
 */
export function applyCrewEffect(crew, stat, amount) {
  const messages = [];

  for (const member of crew) {
    if (!member.isActive) continue;

    const oldValue = member[stat];
    member[stat] = Math.max(0, Math.min(100, member[stat] + amount));

    // Only message on significant changes
    if (Math.abs(member[stat] - oldValue) >= 5) {
      const direction = amount > 0 ? 'improved' : 'declined';
      messages.push(`${member.name}'s ${stat} ${direction}.`);
    }
  }

  return messages;
}

/**
 * Calculate progress percentage given current and total values
 * @param {number} current - Current value
 * @param {number} total - Total target value
 * @returns {number} Progress 0-100
 */
export function calculateProgress(current, total) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}
