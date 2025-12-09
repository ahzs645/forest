/**
 * Forest Block Definitions
 * 12 blocks per operating area for the field journey
 */

// Weather conditions
export const WEATHER_CONDITIONS = [
  { id: 'clear', name: 'Clear Skies', travelModifier: 1.0, moraleEffect: 2 },
  { id: 'overcast', name: 'Overcast', travelModifier: 1.0, moraleEffect: 0 },
  { id: 'light_rain', name: 'Light Rain', travelModifier: 0.9, moraleEffect: -1 },
  { id: 'heavy_rain', name: 'Heavy Rain', travelModifier: 0.7, moraleEffect: -3 },
  { id: 'fog', name: 'Dense Fog', travelModifier: 0.6, moraleEffect: -2 },
  { id: 'light_snow', name: 'Light Snow', travelModifier: 0.8, moraleEffect: -1 },
  { id: 'heavy_snow', name: 'Heavy Snow', travelModifier: 0.5, moraleEffect: -4 },
  { id: 'freezing', name: 'Freezing Conditions', travelModifier: 0.6, moraleEffect: -5, healthRisk: true },
  { id: 'storm', name: 'Storm', travelModifier: 0.3, moraleEffect: -5, dangerous: true }
];

// Temperature categories (affects food consumption)
export const TEMPERATURE_CATEGORIES = {
  hot: { label: 'Hot', foodModifier: 0.9 },
  warm: { label: 'Warm', foodModifier: 1.0 },
  cool: { label: 'Cool', foodModifier: 1.1 },
  cold: { label: 'Cold', foodModifier: 1.3 },
  freezing: { label: 'Freezing', foodModifier: 1.5 }
};

// Terrain types
export const TERRAIN_TYPES = {
  flat: { name: 'Flat Road', fuelModifier: 1.0, equipmentModifier: 1.0, speed: 1.0 },
  hilly: { name: 'Hilly Terrain', fuelModifier: 1.2, equipmentModifier: 1.2, speed: 0.9 },
  steep: { name: 'Steep Grade', fuelModifier: 1.4, equipmentModifier: 1.5, speed: 0.7 },
  muskeg: { name: 'Muskeg', fuelModifier: 1.5, equipmentModifier: 1.8, speed: 0.6 },
  river: { name: 'River Crossing', fuelModifier: 1.3, equipmentModifier: 1.3, speed: 0.5, dangerous: true },
  cutblock: { name: 'Active Cutblock', fuelModifier: 1.1, equipmentModifier: 1.2, speed: 0.8 }
};

// Block templates by area
const FORT_ST_JOHN_BLOCKS = [
  {
    id: 'fsj-1',
    name: 'Highway Camp',
    description: 'The staging area where Highway 97 meets the access road. Last chance for civilization.',
    distance: 0,
    terrain: 'flat',
    hasSupply: true,
    hazards: [],
    features: ['gas station', 'diner']
  },
  {
    id: 'fsj-2',
    name: 'Pipeline Crossing',
    description: 'The road crosses over the main gas pipeline. Heavy truck traffic.',
    distance: 12,
    terrain: 'flat',
    hasSupply: false,
    hazards: ['traffic', 'industrial'],
    features: ['pipeline']
  },
  {
    id: 'fsj-3',
    name: 'Muskeg Flats',
    description: 'Treacherous peatland that swallows machinery whole if you stray from the road.',
    distance: 18,
    terrain: 'muskeg',
    hasSupply: false,
    hazards: ['bog', 'subsidence'],
    features: ['wetland']
  },
  {
    id: 'fsj-4',
    name: 'Doig River Camp',
    description: 'Camp near Doig River First Nation territory. Community relations are key here.',
    distance: 15,
    terrain: 'flat',
    hasSupply: true,
    hazards: [],
    features: ['first_nation', 'river']
  },
  {
    id: 'fsj-5',
    name: 'Spruce Ridge',
    description: 'Climbing up through dense spruce forest. The grade gets steep.',
    distance: 14,
    terrain: 'steep',
    hasSupply: false,
    hazards: ['grade', 'deadfall'],
    features: ['spruce_forest']
  },
  {
    id: 'fsj-6',
    name: 'Plateau Summit',
    description: 'Top of the plateau. Wind howls across the exposed landscape.',
    distance: 10,
    terrain: 'flat',
    hasSupply: false,
    hazards: ['wind', 'exposure'],
    features: ['viewpoint']
  },
  {
    id: 'fsj-7',
    name: 'Block A-7 Landing',
    description: 'Active cutblock with equipment staging. Resupply possible from other crews.',
    distance: 16,
    terrain: 'cutblock',
    hasSupply: true,
    hazards: ['equipment', 'falling_timber'],
    features: ['active_harvest']
  },
  {
    id: 'fsj-8',
    name: 'Wetland Bypass',
    description: 'A long detour around sensitive wetland habitat.',
    distance: 20,
    terrain: 'hilly',
    hasSupply: false,
    hazards: ['moose', 'detour'],
    features: ['wetland_buffer']
  },
  {
    id: 'fsj-9',
    name: 'Gas Well Access',
    description: 'Industrial access road serving several gas wells. Watch for tanker trucks.',
    distance: 14,
    terrain: 'flat',
    hasSupply: false,
    hazards: ['traffic', 'h2s'],
    features: ['gas_wells']
  },
  {
    id: 'fsj-10',
    name: 'North Muskeg',
    description: 'More peatland. Someone got a Cat stuck here last spring.',
    distance: 16,
    terrain: 'muskeg',
    hasSupply: false,
    hazards: ['bog', 'old_equipment'],
    features: ['permafrost_edge']
  },
  {
    id: 'fsj-11',
    name: 'Caribou Flats',
    description: 'Open area frequented by caribou herds. Tread carefully during migration.',
    distance: 12,
    terrain: 'flat',
    hasSupply: false,
    hazards: ['caribou', 'wildlife'],
    features: ['caribou_habitat']
  },
  {
    id: 'fsj-12',
    name: 'Final Destination - Block A-12',
    description: 'You\'ve reached the target block. Time to set up base camp.',
    distance: 15,
    terrain: 'cutblock',
    hasSupply: true,
    hazards: [],
    features: ['destination']
  }
];

const MUSKWA_BLOCKS = [
  {
    id: 'msk-1',
    name: 'Fort Nelson Staging',
    description: 'The last town before wilderness. Stock up while you can.',
    distance: 0,
    terrain: 'flat',
    hasSupply: true,
    hazards: [],
    features: ['town', 'full_service']
  },
  {
    id: 'msk-2',
    name: 'Alaska Highway Turnoff',
    description: 'Leaving the main highway onto a forest service road.',
    distance: 25,
    terrain: 'flat',
    hasSupply: false,
    hazards: ['wildlife_crossing'],
    features: ['highway']
  },
  {
    id: 'msk-3',
    name: 'Prophet River',
    description: 'Major river crossing. Check water levels before attempting.',
    distance: 18,
    terrain: 'river',
    hasSupply: false,
    hazards: ['river_crossing', 'flood'],
    features: ['river', 'bridge']
  },
  {
    id: 'msk-4',
    name: 'Foothills Camp',
    description: 'Entering the foothills. Terrain gets rougher from here.',
    distance: 20,
    terrain: 'hilly',
    hasSupply: true,
    hazards: ['grade'],
    features: ['base_camp']
  },
  {
    id: 'msk-5',
    name: 'Permafrost Zone',
    description: 'Ground shifts and heaves. The road surface is unpredictable.',
    distance: 16,
    terrain: 'muskeg',
    hasSupply: false,
    hazards: ['permafrost', 'road_damage'],
    features: ['permafrost']
  },
  {
    id: 'msk-6',
    name: 'Caribou Corridor',
    description: 'Critical caribou migration route. Operations may be restricted.',
    distance: 15,
    terrain: 'flat',
    hasSupply: false,
    hazards: ['caribou', 'restrictions'],
    features: ['caribou_habitat', 'sensitive_area']
  },
  {
    id: 'msk-7',
    name: 'Mountain Pass',
    description: 'Steep climb through a narrow pass. No room for error.',
    distance: 12,
    terrain: 'steep',
    hasSupply: false,
    hazards: ['rockslide', 'grade', 'narrow'],
    features: ['pass']
  },
  {
    id: 'msk-8',
    name: 'Alpine Meadow',
    description: 'Brief respite in a high alpine meadow. Beautiful but exposed.',
    distance: 10,
    terrain: 'flat',
    hasSupply: false,
    hazards: ['exposure', 'weather'],
    features: ['alpine', 'viewpoint']
  },
  {
    id: 'msk-9',
    name: 'Remote Camp Alpha',
    description: 'Helicopter-supplied remote camp. Limited resupply possible.',
    distance: 18,
    terrain: 'hilly',
    hasSupply: true,
    hazards: [],
    features: ['remote_camp', 'helicopter']
  },
  {
    id: 'msk-10',
    name: 'Grizzly Creek',
    description: 'Named for obvious reasons. Stay alert.',
    distance: 14,
    terrain: 'river',
    hasSupply: false,
    hazards: ['grizzly', 'river_crossing'],
    features: ['creek', 'wildlife']
  },
  {
    id: 'msk-11',
    name: 'Final Ridge',
    description: 'Last climb before the destination. Crew is getting tired.',
    distance: 16,
    terrain: 'steep',
    hasSupply: false,
    hazards: ['grade', 'fatigue'],
    features: ['ridge']
  },
  {
    id: 'msk-12',
    name: 'Muskwa Summit Block',
    description: 'You\'ve made it to the most remote block in the district.',
    distance: 10,
    terrain: 'cutblock',
    hasSupply: true,
    hazards: [],
    features: ['destination', 'remote']
  }
];

// Map area IDs to block sets
export const AREA_BLOCKS = {
  'fort-st-john-plateau': FORT_ST_JOHN_BLOCKS,
  'muskwa-foothills': MUSKWA_BLOCKS,
  // Default blocks for other areas (using Fort St. John as template)
  'bulkley-valley': FORT_ST_JOHN_BLOCKS,
  'fraser-plateau': FORT_ST_JOHN_BLOCKS,
  'skeena-nass': MUSKWA_BLOCKS,
  'tahltan-highland': MUSKWA_BLOCKS
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
