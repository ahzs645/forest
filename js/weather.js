// Enhanced seasonal weather system with severe impacts and cascading effects

export function generate_quarter_weather(state) {
  const season = state.quarter; // 1=Spring,2=Summer,3=Fall,4=Winter
  let condition = 'clear';
  let harvest_multiplier = 1.0;
  let safety_risk_multiplier = 1.0;
  let description = 'Clear conditions';
  let cascading_effects = null;

  const r = Math.random();
  
  // Check for extreme weather events (10% chance)
  if (r < 0.1) {
    if (season === 2) {
      // Summer wildfire
      condition = 'wildfire';
      harvest_multiplier = 0.4; // 60% reduction
      safety_risk_multiplier = 2.0;
      description = 'Major wildfire - operations severely restricted';
      cascading_effects = {
        type: 'wildfire',
        salvage_opportunity: Math.floor(state.annual_allowable_cut * 0.15), // Salvage logging opportunity
        reputation_bonus: 0.05, // If handled well
        fire_suppression_cost: 150000
      };
    } else if (season === 4) {
      // Winter ice storm
      condition = 'ice_storm';
      harvest_multiplier = 0.3; // 70% reduction
      safety_risk_multiplier = 2.5;
      description = 'Severe ice storm - dangerous conditions';
      cascading_effects = {
        type: 'ice_storm',
        equipment_damage_cost: 80000,
        road_repair_cost: 50000
      };
    }
  } else if (season === 1) {
    // Spring: rain, mud, and flooding
    if (r < 0.3) {
      condition = 'rain';
      harvest_multiplier = 0.75; // Increased from 0.92
      safety_risk_multiplier = 1.3;
      description = 'Heavy spring rains causing road washouts';
      if (r < 0.15) {
        cascading_effects = {
          type: 'flooding',
          road_repair_cost: 40000,
          permit_delays: 30 // days
        };
      }
    } else if (r < 0.4) {
      condition = 'storm';
      harvest_multiplier = 0.7; // Increased from 0.9
      safety_risk_multiplier = 1.4;
      description = 'Severe windstorms with tree blowdown';
    }
  } else if (season === 2) {
    // Summer: heatwaves, drought & fire risk
    if (r < 0.25) {
      condition = 'heatwave';
      harvest_multiplier = 0.8; // Increased from 0.95
      safety_risk_multiplier = 1.35;
      description = 'Extreme heat forcing reduced work hours';
      cascading_effects = {
        type: 'heatwave',
        crew_morale_penalty: 0.1,
        water_supply_cost: 15000
      };
    } else if (r < 0.35) {
      condition = 'drought';
      harvest_multiplier = 0.85; // Increased from 0.97
      safety_risk_multiplier = 1.25;
      description = 'Severe drought - fire ban in effect';
      cascading_effects = {
        type: 'drought',
        fire_watch_cost: 25000,
        operations_restricted: true
      };
    }
  } else if (season === 3) {
    // Fall: storms and early snow
    if (r < 0.25) {
      condition = 'storm';
      harvest_multiplier = 0.72; // Increased from 0.93
      safety_risk_multiplier = 1.35;
      description = 'Atmospheric river causing severe storms';
      cascading_effects = {
        type: 'atmospheric_river',
        landslide_risk: 0.2,
        emergency_response_cost: 35000
      };
    } else if (r < 0.35) {
      condition = 'rain';
      harvest_multiplier = 0.8; // Increased from 0.95
      safety_risk_multiplier = 1.15;
      description = 'Persistent fall rains delaying operations';
    }
  } else {
    // Winter: snow, cold snaps, and avalanches
    if (r < 0.35) {
      condition = 'snow';
      harvest_multiplier = 0.65; // Increased from 0.88
      safety_risk_multiplier = 1.5;
      description = 'Heavy snowfall requiring constant plowing';
      cascading_effects = {
        type: 'heavy_snow',
        snow_removal_cost: 30000,
        avalanche_risk: 0.15
      };
    } else if (r < 0.45) {
      condition = 'cold_snap';
      harvest_multiplier = 0.75; // Increased from 0.92
      safety_risk_multiplier = 1.25;
      description = 'Extreme cold causing equipment failures';
      cascading_effects = {
        type: 'cold_snap',
        equipment_repair_cost: 20000,
        heating_cost: 10000
      };
    }
  }

  const weather = { condition, harvest_multiplier, safety_risk_multiplier, description, cascading_effects };
  state.weather = weather;
  if (!state.weather_history) state.weather_history = [];
  state.weather_history.push({ year: state.year, quarter: state.quarter, ...weather });
  return weather;
}

