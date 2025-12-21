/**
 * Resource Management System
 * Handles resource depletion, resupply, and consequences
 */

// Field resource definitions
export const FIELD_RESOURCES = {
  budget: {
    id: 'budget',
    name: 'Cash',
    unit: '$',
    shortLabel: 'CASH',
    baseDaily: 0,
    max: 8000,
    warning: 1500,
    critical: 400
  },
  fuel: {
    id: 'fuel',
    name: 'Fuel',
    unit: 'gallons',
    shortLabel: 'FUEL',
    baseDaily: 3,          // Base daily consumption (reduced from 5)
    max: 200,              // Maximum capacity (increased from 150)
    warning: 40,           // Warning threshold
    critical: 15,          // Critical threshold
    paceModifiers: {
      resting: 0,
      camp_work: 0.8,
      slow: 2,             // Reduced from 3
      normal: 3,           // Reduced from 5
      fast: 5,             // Reduced from 8
      grueling: 8          // Reduced from 12
    },
    terrainModifiers: {
      flat: 1.0,
      hilly: 1.2,
      steep: 1.4,
      muskeg: 1.5,
      river: 1.3
    }
  },
  food: {
    id: 'food',
    name: 'Food Rations',
    unit: 'person-days',
    shortLabel: 'FOOD',
    baseDaily: 0.8,        // Per crew member per day (reduced from 1)
    max: 80,               // Maximum storage (increased from 60)
    warning: 20,
    critical: 8,
    // Food consumed faster in cold
    weatherModifiers: {
      hot: 0.8,
      warm: 1.0,
      cool: 1.05,
      cold: 1.15,
      freezing: 1.3
    }
  },
  equipment: {
    id: 'equipment',
    name: 'Equipment Condition',
    unit: '%',
    shortLabel: 'EQUIP',
    baseDaily: 2,          // Base condition loss per travel day
    max: 100,
    warning: 40,
    critical: 20,
    paceModifiers: {
      resting: 0,
      camp_work: 0.4,
      slow: 1,
      normal: 2,
      fast: 3,
      grueling: 5
    },
    terrainModifiers: {
      flat: 1.0,
      hilly: 1.2,
      steep: 1.5,
      muskeg: 1.8,
      river: 1.3
    }
  },
  firstAid: {
    id: 'firstAid',
    name: 'First Aid Kits',
    unit: 'kits',
    shortLabel: 'MEDS',
    baseDaily: 0,          // Only consumed on use
    max: 15,
    warning: 3,
    critical: 1
  }
};

// Desk resource definitions
export const DESK_RESOURCES = {
  budget: {
    id: 'budget',
    name: 'Budget',
    unit: '$',
    shortLabel: 'BUDGET',
    baseDaily: 1000,       // Daily operational cost
    max: 100000,
    warning: 15000,
    critical: 5000
  },
  politicalCapital: {
    id: 'politicalCapital',
    name: 'Political Capital',
    unit: 'points',
    shortLabel: 'POL.CAP',
    baseDaily: 1,          // Natural decay per day
    max: 100,
    warning: 25,
    critical: 10
  },
  energy: {
    id: 'energy',
    name: 'Energy',
    unit: '%',
    shortLabel: 'ENERGY',
    baseDaily: 0,          // Regenerates daily
    dailyRegen: 80,        // Restore this much overnight
    max: 100,
    warning: 20,
    critical: 5
  }
};

/**
 * Create initial field resources
 * @param {Object} options - Starting amounts (optional overrides)
 * @returns {Object} Resource state
 */
export function createFieldResources(options = {}) {
  return {
    budget: options.budget ?? 3000,
    fuel: options.fuel ?? 150,      // Increased from 100
    food: options.food ?? 60,       // Increased from 40
    equipment: options.equipment ?? 100,
    firstAid: options.firstAid ?? 10  // Increased from 8
  };
}

/**
 * Create initial desk resources
 * @param {Object} options - Starting amounts (optional overrides)
 * @returns {Object} Resource state
 */
export function createDeskResources(options = {}) {
  return {
    budget: options.budget ?? 50000,
    politicalCapital: options.politicalCapital ?? 50,
    energy: options.energy ?? 100
  };
}

/**
 * Calculate field resource consumption for a day
 * @param {Object} conditions - Current conditions
 * @param {number} crewCount - Number of active crew
 * @returns {Object} Resource consumption amounts
 */
export function calculateFieldConsumption(conditions = {}, crewCount = 5) {
  const { pace = 'normal', terrain = 'flat', weather = 'cool', weatherCondition = null } = conditions;
  const consumption = {};

  // Weather modifiers for fuel and equipment
  // Bad weather means more idling, slower driving, more wear
  const weatherFuelModifiers = {
    clear: 1.0,
    overcast: 1.0,
    light_rain: 1.1,
    heavy_rain: 1.25,
    fog: 1.15,
    light_snow: 1.2,
    heavy_snow: 1.4,
    freezing: 1.35,
    storm: 1.5
  };
  const weatherEquipModifiers = {
    clear: 1.0,
    overcast: 1.0,
    light_rain: 1.1,
    heavy_rain: 1.3,
    fog: 1.05,
    light_snow: 1.15,
    heavy_snow: 1.4,
    freezing: 1.3,
    storm: 1.5
  };

  // Fuel consumption
  const fuelDef = FIELD_RESOURCES.fuel;
  let fuelUse = fuelDef.paceModifiers[pace] ?? fuelDef.baseDaily;
  fuelUse *= fuelDef.terrainModifiers[terrain] ?? 1;
  // Apply weather modifier
  const weatherId = weatherCondition?.id || weather;
  fuelUse *= weatherFuelModifiers[weatherId] ?? 1;
  consumption.fuel = Math.round(fuelUse * 10) / 10;

  // Food consumption (uses temperature via weather param)
  const foodDef = FIELD_RESOURCES.food;
  let foodUse = crewCount * foodDef.baseDaily;
  foodUse *= foodDef.weatherModifiers[weather] ?? 1;
  consumption.food = Math.round(foodUse * 10) / 10;

  // Equipment wear (only when traveling)
  if (pace !== 'resting') {
    const equipDef = FIELD_RESOURCES.equipment;
    let equipWear = equipDef.paceModifiers[pace] ?? equipDef.baseDaily;
    equipWear *= equipDef.terrainModifiers[terrain] ?? 1;
    // Apply weather modifier
    equipWear *= weatherEquipModifiers[weatherId] ?? 1;
    consumption.equipment = Math.round(equipWear * 10) / 10;
  } else {
    consumption.equipment = 0;
  }

  // First aid is not consumed daily
  consumption.firstAid = 0;

  return consumption;
}

/**
 * Calculate desk resource consumption for a day
 * @param {Object} conditions - Current conditions
 * @returns {Object} Resource consumption/changes
 */
export function calculateDeskConsumption(conditions = {}) {
  const { overtime = 0, meetings = 0, crisisMode = false } = conditions;
  const consumption = {};

  // Budget consumption
  let budgetUse = DESK_RESOURCES.budget.baseDaily;
  if (crisisMode) budgetUse *= 1.5;
  if (overtime > 0) budgetUse += overtime * 200;
  consumption.budget = Math.round(budgetUse);

  // Political capital drain
  let polCapDrain = DESK_RESOURCES.politicalCapital.baseDaily;
  if (crisisMode) polCapDrain += 2;
  consumption.politicalCapital = polCapDrain;

  // Energy consumption (will be offset by regen)
  consumption.energy = overtime * 10;

  return consumption;
}

/**
 * Apply resource consumption to current state
 * @param {Object} resources - Current resource state
 * @param {Object} consumption - Consumption amounts
 * @param {Object} definitions - Resource definitions (FIELD_RESOURCES or DESK_RESOURCES)
 * @returns {Object} Result with updated resources and warnings
 */
export function applyConsumption(resources, consumption, definitions) {
  const updated = { ...resources };
  const warnings = [];
  const critical = [];

  for (const [key, amount] of Object.entries(consumption)) {
    if (typeof updated[key] !== 'number') continue;

    updated[key] = Math.max(0, updated[key] - amount);

    const def = definitions[key];
    if (def) {
      if (updated[key] <= def.critical && updated[key] > 0) {
        critical.push({
          resource: def.name,
          value: updated[key],
          unit: def.unit
        });
      } else if (updated[key] <= def.warning) {
        warnings.push({
          resource: def.name,
          value: updated[key],
          unit: def.unit
        });
      }
    }
  }

  return { resources: updated, warnings, critical };
}

/**
 * Check resource status and return alerts
 * @param {Object} resources - Current resources
 * @param {Object} definitions - Resource definitions
 * @returns {Object} Status with depleted, critical, and warning arrays
 */
export function checkResourceStatus(resources, definitions) {
  const depleted = [];
  const critical = [];
  const warnings = [];

  for (const [key, value] of Object.entries(resources)) {
    const def = definitions[key];
    if (!def) continue;

    if (value <= 0) {
      depleted.push({ resource: def.name, id: key });
    } else if (value <= def.critical) {
      critical.push({ resource: def.name, value, unit: def.unit, id: key });
    } else if (value <= def.warning) {
      warnings.push({ resource: def.name, value, unit: def.unit, id: key });
    }
  }

  return { depleted, critical, warnings };
}

/**
 * Get formatted resource status for display
 * @param {Object} resources - Current resources
 * @param {Object} definitions - Resource definitions
 * @returns {Object} Formatted status for each resource
 */
export function getFormattedResourceStatus(resources, definitions) {
  const status = {};

  for (const [key, value] of Object.entries(resources)) {
    const def = definitions[key];
    if (!def) continue;

    let level = 'ok';
    if (value <= 0) {
      level = 'depleted';
    } else if (value <= def.critical) {
      level = 'critical';
    } else if (value <= def.warning) {
      level = 'low';
    }

    // Format display value
    let display;
    if (def.unit === '$') {
      display = '$' + Math.round(value).toLocaleString();
    } else if (def.unit === '%') {
      display = Math.round(value) + '%';
    } else {
      display = `${Math.round(value)} ${def.unit}`;
    }

    status[key] = {
      id: key,
      label: def.name,
      shortLabel: def.shortLabel,
      value: Math.round(value),
      display,
      level,
      percentage: getResourcePercentage(value, def)
    };
  }

  return status;
}

/**
 * Apply daily regeneration for desk resources
 * @param {Object} resources - Current desk resources
 * @returns {Object} Updated resources
 */
export function applyDeskRegen(resources) {
  const updated = { ...resources };

  // Energy regenerates overnight
  const energyDef = DESK_RESOURCES.energy;
  updated.energy = Math.min(
    energyDef.max,
    updated.energy + energyDef.dailyRegen
  );

  return updated;
}

/**
 * Resupply resources at a supply point
 * @param {Object} resources - Current resources
 * @param {Object} purchase - Items to purchase { resourceId: amount }
 * @param {Object} definitions - Resource definitions
 * @param {Object} prices - Price per unit for each resource
 * @returns {Object} Result with updated resources and cost
 */
export function resupply(resources, purchase, definitions, prices = {}) {
  const updated = { ...resources };
  let totalCost = 0;

  for (const [key, amount] of Object.entries(purchase)) {
    const def = definitions[key];
    if (!def) continue;

    const unitPrice = prices[key] ?? getDefaultPrice(key);
    const cost = amount * unitPrice;

    updated[key] = Math.min(def.max, (updated[key] ?? 0) + amount);
    totalCost += cost;
  }

  return { resources: updated, cost: totalCost };
}

/**
 * Get default price for a resource
 * @param {string} resourceId - Resource ID
 * @returns {number} Price per unit
 */
function getDefaultPrice(resourceId) {
  const prices = {
    fuel: 5,           // per gallon
    food: 8,           // per person-day
    equipment: 50,     // per % point repair
    firstAid: 25       // per kit
  };
  return prices[resourceId] ?? 10;
}

/**
 * Get supply store inventory and prices
 * @param {string} journeyType - 'field' or 'desk'
 * @param {string} locationId - Current location
 * @returns {Object[]} Array of purchasable items
 */
export function getSupplyStoreItems(journeyType, locationId = null) {
  if (journeyType === 'field') {
    return [
      {
        id: 'fuel',
        name: 'Fuel',
        unit: 'gallons',
        price: 5,
        max: 50,
        description: 'Diesel for trucks and equipment'
      },
      {
        id: 'food',
        name: 'Food Rations',
        unit: 'person-days',
        price: 8,
        max: 30,
        description: 'Provisions for the crew'
      },
      {
        id: 'firstAid',
        name: 'First Aid Kit',
        unit: 'kits',
        price: 25,
        max: 10,
        description: 'Medical supplies'
      },
      {
        id: 'equipment',
        name: 'Spare Parts',
        unit: '% repair',
        price: 50,
        max: 50,
        description: 'Parts to repair equipment'
      }
    ];
  }

  // Desk supplies
  return [
    {
      id: 'overtime',
      name: 'Overtime Budget',
      unit: 'hours',
      price: 200,
      max: 20,
      description: 'Pay for extra work hours'
    },
    {
      id: 'consultant',
      name: 'Consultant Day',
      unit: 'days',
      price: 1500,
      max: 5,
      description: 'Hire temporary expert help'
    },
    {
      id: 'stakeholderGift',
      name: 'Stakeholder Appreciation',
      unit: 'events',
      price: 500,
      max: 3,
      description: 'Improves political capital',
      effect: { politicalCapital: 10 }
    }
  ];
}

/**
 * Get consequences for depleted resources
 * @param {string} resourceId - Depleted resource ID
 * @param {string} journeyType - 'field' or 'desk'
 * @returns {Object} Consequence description and effects
 */
export function getDepletedConsequence(resourceId, journeyType) {
  const consequences = {
    field: {
      fuel: {
        title: 'OUT OF FUEL',
        message: 'Your vehicles have run dry. The crew is stranded.',
        canContinue: false,
        effect: 'Cannot travel until resupplied'
      },
      food: {
        title: 'OUT OF FOOD',
        message: 'The crew is going hungry. Health and morale plummet.',
        canContinue: true,
        effect: 'All crew lose 10 health and 15 morale per day'
      },
      equipment: {
        title: 'EQUIPMENT FAILURE',
        message: 'Critical equipment has broken down completely.',
        canContinue: false,
        effect: 'Cannot travel safely until repaired'
      },
      firstAid: {
        title: 'NO MEDICAL SUPPLIES',
        message: 'The first aid kit is empty.',
        canContinue: true,
        effect: 'Cannot treat injuries. Conditions may worsen.'
      }
    },
    desk: {
      budget: {
        title: 'BUDGET DEPLETED',
        message: 'Funds have run out. Operations must cease.',
        canContinue: false,
        effect: 'GAME OVER'
      },
      politicalCapital: {
        title: 'POLITICAL CAPITAL EXHAUSTED',
        message: 'You\'ve burned every bridge. Management has lost faith.',
        canContinue: false,
        effect: 'GAME OVER - Terminated'
      },
      energy: {
        title: 'EXHAUSTED',
        message: 'The team is too tired to continue today.',
        canContinue: true,
        effect: 'Forced rest day. No work possible.'
      }
    }
  };

  const journeyConsequences = consequences[journeyType] || consequences.field;
  return journeyConsequences[resourceId] || {
    title: 'RESOURCE DEPLETED',
    message: 'A critical resource has run out.',
    canContinue: true,
    effect: 'Unknown consequences'
  };
}

/**
 * Calculate resource percentage for display
 * @param {number} current - Current value
 * @param {Object} definition - Resource definition with max
 * @returns {number} Percentage 0-100
 */
export function getResourcePercentage(current, definition) {
  if (!definition || !definition.max) return 0;
  return Math.round((current / definition.max) * 100);
}

/**
 * Format resource value for display
 * @param {string} resourceId - Resource ID
 * @param {number} value - Current value
 * @param {Object} definitions - Resource definitions
 * @returns {string} Formatted display string
 */
export function formatResourceValue(resourceId, value, definitions) {
  const def = definitions[resourceId];
  if (!def) return String(value);

  if (def.unit === '$') {
    return '$' + Math.round(value).toLocaleString();
  }
  if (def.unit === '%') {
    return Math.round(value) + '%';
  }

  return `${Math.round(value)} ${def.unit}`;
}
