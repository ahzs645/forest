/**
 * Forest Block Definitions
 * 12 blocks per operating area for the field journey
 */

// Import data from JSON files
import weatherData from './json/field/weather.json' with { type: 'json' };
import blocksData from './json/field/blocks.json' with { type: 'json' };

// Export weather conditions
export const WEATHER_CONDITIONS = weatherData.conditions;
export const TEMPERATURE_CATEGORIES = weatherData.temperatures;
export const TERRAIN_TYPES = weatherData.terrain;

// Export block data
export const FORT_ST_JOHN_BLOCKS = blocksData['fort-st-john-plateau'];
export const MUSKWA_BLOCKS = blocksData['muskwa-foothills'];

// Map area IDs to block sets
export const AREA_BLOCKS = {
  'fort-st-john-plateau': FORT_ST_JOHN_BLOCKS,
  'muskwa-foothills': MUSKWA_BLOCKS,
  // Default blocks for other areas (using mapping from JSON)
  'bulkley-valley': blocksData[blocksData.areaMapping['bulkley-valley']] || FORT_ST_JOHN_BLOCKS,
  'fraser-plateau': blocksData[blocksData.areaMapping['fraser-plateau']] || FORT_ST_JOHN_BLOCKS,
  'skeena-nass': blocksData[blocksData.areaMapping['skeena-nass']] || MUSKWA_BLOCKS,
  'tahltan-highland': blocksData[blocksData.areaMapping['tahltan-highland']] || MUSKWA_BLOCKS
};

/**
 * Get blocks for an operating area
 * @param {string} areaId - Operating area ID
 * @returns {Object[]} Array of block definitions
 */
export function getBlocksForArea(areaId) {
  return AREA_BLOCKS[areaId] || FORT_ST_JOHN_BLOCKS;
}

/**
 * Get total journey distance for an area
 * @param {string} areaId - Operating area ID
 * @returns {number} Total distance in km
 */
export function getTotalDistance(areaId) {
  const blocks = getBlocksForArea(areaId);
  return blocks.reduce((sum, block) => sum + block.distance, 0);
}

/**
 * Get random weather for a location
 * @param {Object} block - Current block
 * @param {number} day - Current day of journey
 * @returns {Object} Weather condition
 */
export function getRandomWeather(block, day) {
  // Weight towards mild weather, with seasonal effects
  const weights = {
    clear: 25,
    overcast: 30,
    light_rain: 15,
    heavy_rain: 8,
    fog: 10,
    light_snow: 5,
    heavy_snow: 3,
    freezing: 2,
    storm: 2
  };

  // Adjust for terrain/features
  if (block?.features?.includes('alpine') || block?.features?.includes('pass')) {
    weights.heavy_snow += 5;
    weights.freezing += 3;
    weights.storm += 2;
  }

  // Later in journey = worse weather potential
  if (day > 20) {
    weights.heavy_rain += 3;
    weights.heavy_snow += 3;
  }

  // Weighted random selection
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;

  for (const condition of WEATHER_CONDITIONS) {
    roll -= weights[condition.id] || 0;
    if (roll <= 0) return condition;
  }

  return WEATHER_CONDITIONS[0]; // Default to clear
}

/**
 * Get temperature category based on weather and terrain
 * @param {Object} weather - Weather condition
 * @param {Object} block - Current block
 * @returns {string} Temperature category ID
 */
export function getTemperature(weather, block) {
  // Base temperature from weather
  let temp = 'cool';

  if (weather.id === 'freezing' || weather.id === 'heavy_snow') {
    temp = 'freezing';
  } else if (weather.id === 'light_snow') {
    temp = 'cold';
  } else if (weather.id === 'clear') {
    temp = 'warm';
  }

  // Adjust for terrain
  if (block?.features?.includes('alpine')) {
    if (temp === 'warm') temp = 'cool';
    if (temp === 'cool') temp = 'cold';
  }

  return temp;
}

/**
 * Check if a block has any dangerous hazards active
 * @param {Object} block - Block to check
 * @param {Object} weather - Current weather
 * @returns {Object|null} Hazard info if dangerous, null otherwise
 */
export function checkBlockHazards(block, weather) {
  const hazards = [];

  // Weather hazards
  if (weather.dangerous) {
    hazards.push({
      type: 'weather',
      name: weather.name,
      severity: 'high',
      message: `${weather.name} makes travel extremely dangerous.`
    });
  }

  // Terrain hazards
  if (block?.terrain === 'river' && (weather.id === 'heavy_rain' || weather.id === 'storm')) {
    hazards.push({
      type: 'terrain',
      name: 'Flooded Crossing',
      severity: 'high',
      message: 'The river is running high. Crossing is risky.'
    });
  }

  if (block?.hazards?.includes('permafrost') && weather.id !== 'freezing') {
    hazards.push({
      type: 'terrain',
      name: 'Thawing Permafrost',
      severity: 'medium',
      message: 'The ground is soft and unstable.'
    });
  }

  return hazards.length > 0 ? hazards : null;
}
