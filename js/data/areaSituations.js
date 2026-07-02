/**
 * Area Situations
 * Recurring zone-specific constraints that color event selection over time.
 */

const AREA_SITUATIONS = [
  {
    id: 'peace_industrial_traffic',
    title: 'Industrial traffic pulse',
    summary: 'Linear disturbance and heavy industrial traffic are making access and coordination noisier than usual.',
    areaTags: ['peace-region', 'gas-interface'],
    seasons: ['winter', 'spring', 'summer'],
    fieldEventMultiplier: 1.1,
    fieldTypeMultipliers: {
      terrain: 1.15,
      equipment: 1.1,
      supply: 1.05
    },
    deskStressMultiplier: 1.08,
    deskTypeMultipliers: {
      technical: 1.15,
      compliance: 1.1
    },
    options: [
      {
        stance: 'cautious',
        label: 'Stagger shifts and share the road schedule',
        outcome: 'You coordinate hauling windows with gas-field traffic, keeping rigs and logging trucks out of each other\'s way.',
        effects: { progress: 0, compliance: 3, relationships: 1, budget: -1 }
      },
      {
        stance: 'balanced',
        label: 'Use radio escorts through the busiest corridors',
        outcome: 'Traffic keeps moving with escorts and call-ins; a few delays, but no serious conflicts.',
        effects: { progress: 2, compliance: 1 }
      },
      {
        stance: 'aggressive',
        label: 'Run convoys through peak industrial windows',
        outcome: 'You squeeze more fibre out but create dust-ups with other operators and near-miss reports.',
        effects: { progress: 4, compliance: -3, forestHealth: -2, relationships: -1 }
      }
    ]
  },
  {
    id: 'muskwa_runoff_slump',
    title: 'Foothill runoff slump',
    summary: 'Steep drainages and thaw-sensitive fills are making old access assumptions feel optimistic.',
    areaTags: ['steep', 'remote-camps'],
    seasons: ['spring'],
    fieldEventMultiplier: 1.18,
    fieldTypeMultipliers: {
      weather: 1.1,
      terrain: 1.2
    },
    deskStressMultiplier: 1.06,
    deskTypeMultipliers: {
      technical: 1.15
    },
    options: [
      {
        stance: 'cautious',
        label: 'Stand down until geotech clears the slopes',
        outcome: 'Work waits while slopes are assessed; contractors grumble, but nothing slides.',
        effects: { progress: 0, compliance: 3, relationships: 1, budget: -1 }
      },
      {
        stance: 'balanced',
        label: 'Shift to ridge-top spurs and dry benches',
        outcome: 'You avoid the worst drainages and keep lighter crews moving on safer ground.',
        effects: { progress: 2, compliance: 1 }
      },
      {
        stance: 'aggressive',
        label: 'Push the existing road before thaw deepens',
        outcome: 'Hauling continues until a fill slumps, turning a schedule win into a cleanup bill.',
        effects: { progress: 4, compliance: -3, forestHealth: -2, relationships: -1 }
      }
    ]
  },
  {
    id: 'bulkley_visual_backlash',
    title: 'Visual backlash',
    summary: 'Visible ground and community-use corridors are keeping public optics tied to every move.',
    areaTags: ['community-interface', 'visuals'],
    seasons: ['summer', 'fall'],
    fieldEventMultiplier: 1.05,
    fieldTypeMultipliers: {
      social: 1.2,
      morale: 1.1
    },
    deskStressMultiplier: 1.1,
    deskTypeMultipliers: {
      stakeholder: 1.2,
      political: 1.15
    },
    options: [
      {
        stance: 'cautious',
        label: 'Post the work and hold a public walk-through',
        outcome: 'You slow down and invite community observers; optics improve even if the schedule slips.',
        effects: { progress: 0, compliance: 3, relationships: 1, budget: -1 }
      },
      {
        stance: 'balanced',
        label: 'Add visual buffers and keep moving',
        outcome: 'Retained edges and screening keep the public-facing slopes from looking raw.',
        effects: { progress: 2, compliance: 1 }
      },
      {
        stance: 'aggressive',
        label: 'Clear the visible face before opposition organizes',
        outcome: 'You get the timber out but photos of the fresh cut circulate quickly.',
        effects: { progress: 4, compliance: -3, forestHealth: -2, relationships: -1 }
      }
    ]
  },
  {
    id: 'fraser_smoke_push',
    title: 'Smoke push',
    summary: 'Wildfire smoke and nearby community risk are compressing the useful work window.',
    areaTags: ['wildfire', 'beetle-recovery'],
    seasons: ['summer', 'fall'],
    fieldEventMultiplier: 1.2,
    fieldTypeMultipliers: {
      weather: 1.25,
      morale: 1.1
    },
    deskStressMultiplier: 1.12,
    deskTypeMultipliers: {
      political: 1.2,
      compliance: 1.08
    },
    options: [
      {
        stance: 'cautious',
        label: 'Stand down until air quality and fire risk improve',
        outcome: 'Crews stay safe at camp; the community notices you put people ahead of volume.',
        effects: { progress: 0, compliance: 3, relationships: 1, budget: -1 }
      },
      {
        stance: 'balanced',
        label: 'Work early mornings and monitor smoke indices',
        outcome: 'You keep a limited window open while staying inside safe air-quality thresholds.',
        effects: { progress: 2, compliance: 1 }
      },
      {
        stance: 'aggressive',
        label: 'Push crews through heavy smoke to beat closure',
        outcome: 'Production holds, but morale drops and the district flags health-and-safety concerns.',
        effects: { progress: 4, compliance: -3, forestHealth: -2, relationships: -1 }
      }
    ]
  },
  {
    id: 'skeena_crossing_stress',
    title: 'Crossing stress',
    summary: 'Fish-bearing crossings and saturated ground are making rushed access choices expensive.',
    areaTags: ['cwh', 'salmon'],
    becCodes: ['CWHws2'],
    seasons: ['spring', 'summer', 'fall'],
    fieldEventMultiplier: 1.16,
    fieldTypeMultipliers: {
      weather: 1.15,
      terrain: 1.2
    },
    deskStressMultiplier: 1.1,
    deskTypeMultipliers: {
      technical: 1.25,
      compliance: 1.15
    },
    options: [
      {
        stance: 'cautious',
        label: 'Defer crossing work until a fisheries window opens',
        outcome: 'You protect the spawning channel and keep the file clean, even though access waits.',
        effects: { progress: 0, compliance: 3, relationships: 1, budget: -1 }
      },
      {
        stance: 'balanced',
        label: 'Install temporary crossings with habitat oversight',
        outcome: 'A monitored culvert or bridge gets crews across without dewatering the channel.',
        effects: { progress: 2, compliance: 1 }
      },
      {
        stance: 'aggressive',
        label: 'Ford the creek to keep the hauling schedule',
        outcome: 'You move fibre now, but sediment and redd damage trigger a compliance order.',
        effects: { progress: 4, compliance: -3, forestHealth: -2, relationships: -1 }
      }
    ]
  },
  {
    id: 'tahltan_supply_lag',
    title: 'Supply-line lag',
    summary: 'Remote cold-country logistics are making every mobilization and schedule promise more fragile.',
    areaTags: ['glacial', 'remote-camps'],
    seasons: ['spring', 'fall'],
    fieldEventMultiplier: 1.12,
    fieldTypeMultipliers: {
      supply: 1.2,
      weather: 1.1
    },
    deskStressMultiplier: 1.07,
    deskTypeMultipliers: {
      technical: 1.1,
      team: 1.1
    },
    options: [
      {
        stance: 'cautious',
        label: 'Pre-position supplies before the weather window closes',
        outcome: 'You spend upfront to stage fuel, food, and parts; contractors can keep working through the lag.',
        effects: { progress: 0, compliance: 3, relationships: 1, budget: -1 }
      },
      {
        stance: 'balanced',
        label: 'Consolidate trips and extend camp rotations',
        outcome: 'Fewer hauls mean less exposure to road delays; crews work longer hitches.',
        effects: { progress: 2, compliance: 1 }
      },
      {
        stance: 'aggressive',
        label: 'Run lean and single-trip everything',
        outcome: 'You save hauling costs until a blown tire strands a crew without spares.',
        effects: { progress: 4, compliance: -3, forestHealth: -2, relationships: -1 }
      }
    ]
  },
  {
    id: 'island_storm_window',
    title: 'Storm-window squeeze',
    summary: 'Rainfall and fish-stream timing are shrinking the set of coastal tasks that are honestly ready to move.',
    areaTags: ['cwh', 'salmon', 'visuals'],
    seasons: ['fall', 'winter'],
    fieldEventMultiplier: 1.14,
    fieldTypeMultipliers: {
      weather: 1.2,
      terrain: 1.1
    },
    deskStressMultiplier: 1.08,
    deskTypeMultipliers: {
      technical: 1.15,
      stakeholder: 1.1
    },
    options: [
      {
        stance: 'cautious',
        label: 'Park equipment until the storm track passes',
        outcome: 'You sit out the worst rains; creeks stay clear and the public sees restraint.',
        effects: { progress: 0, compliance: 3, relationships: 1, budget: -1 }
      },
      {
        stance: 'balanced',
        label: 'Work upland blocks and leave streamside for later',
        outcome: 'You keep some crews busy on drier ground while sensitive crossings recover.',
        effects: { progress: 2, compliance: 1 }
      },
      {
        stance: 'aggressive',
        label: 'Push through the wet window before streams peak',
        outcome: 'You move more fibre but leave rutted roads and turbidity complaints behind.',
        effects: { progress: 4, compliance: -3, forestHealth: -2, relationships: -1 }
      }
    ]
  },
  {
    id: 'wetbelt_runoff_scrutiny',
    title: 'Wetbelt runoff scrutiny',
    summary: 'Community-water and steep-road concerns are making drainage mistakes far more visible than usual.',
    areaTags: ['watershed', 'steep', 'community-interface'],
    seasons: ['spring', 'summer', 'fall'],
    fieldEventMultiplier: 1.12,
    fieldTypeMultipliers: {
      terrain: 1.18,
      weather: 1.1
    },
    deskStressMultiplier: 1.09,
    deskTypeMultipliers: {
      technical: 1.18,
      compliance: 1.1
    },
    options: [
      {
        stance: 'cautious',
        label: 'Pause work and audit every culvert and ditch',
        outcome: 'You find and fix several minor drainage issues before the community notices.',
        effects: { progress: 0, compliance: 3, relationships: 1, budget: -1 }
      },
      {
        stance: 'balanced',
        label: 'Add sediment controls and keep lower-risk blocks moving',
        outcome: 'Silt fencing and spillways keep most runoff contained while work continues.',
        effects: { progress: 2, compliance: 1 }
      },
      {
        stance: 'aggressive',
        label: 'Trust the existing drainage and push the road',
        outcome: 'A plugged culvert sends sediment toward the community water intake.',
        effects: { progress: 4, compliance: -3, forestHealth: -2, relationships: -1 }
      }
    ]
  },
  {
    id: 'drybelt_interface_smoke',
    title: 'Drybelt interface smoke',
    summary: 'Heat, smoke, and visible interface work are narrowing both safe production choices and public tolerance for sloppy execution.',
    areaTags: ['wildfire', 'community-interface', 'visuals'],
    seasons: ['summer', 'fall'],
    fieldEventMultiplier: 1.18,
    fieldTypeMultipliers: {
      weather: 1.22,
      social: 1.12
    },
    deskStressMultiplier: 1.1,
    deskTypeMultipliers: {
      political: 1.18,
      stakeholder: 1.15
    },
    options: [
      {
        stance: 'cautious',
        label: 'Suspend interface operations during high fire danger',
        outcome: 'Homes stay safe and the public sees caution; the schedule takes a hit.',
        effects: { progress: 0, compliance: 3, relationships: 1, budget: -1 }
      },
      {
        stance: 'balanced',
        label: 'Work night shifts when humidity recovers',
        outcome: 'Cooler nights keep ignition risk down while maintaining some production.',
        effects: { progress: 2, compliance: 1 }
      },
      {
        stance: 'aggressive',
        label: 'Cut close to houses to beat an expected fire ban',
        outcome: 'You get more out before the ban, but residents and the district react strongly.',
        effects: { progress: 4, compliance: -3, forestHealth: -2, relationships: -1 }
      }
    ]
  }
];

function clampMultiplier(value) {
  return Math.max(0.75, Math.min(2, value));
}

function getJourneySeasonId(journey) {
  return journey?.season?.currentSeason || null;
}

function scoreSituationMatch(situation, journey) {
  const areaTags = new Set(Array.isArray(journey?.area?.tags) ? journey.area.tags : []);
  const becCode = journey?.area?.becCode || null;
  const seasonId = getJourneySeasonId(journey);
  let score = 0;

  for (const tag of situation.areaTags || []) {
    if (areaTags.has(tag)) score += 3;
  }

  if (Array.isArray(situation.becCodes) && becCode && situation.becCodes.includes(becCode)) {
    score += 4;
  }

  if (Array.isArray(situation.seasons) && seasonId && situation.seasons.includes(seasonId)) {
    score += 2;
  } else if (Array.isArray(situation.seasons) && seasonId) {
    score -= 2;
  }

  return score;
}

export function getAreaSituationForJourney(journey) {
  const ranked = AREA_SITUATIONS
    .map((situation) => ({ situation, score: scoreSituationMatch(situation, journey) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.situation || null;
}

export function getAreaSituationSummary(journey) {
  const situation = getAreaSituationForJourney(journey);
  if (!situation) return null;
  return `${situation.title}: ${situation.summary}`;
}

export function getAreaSituationMultipliers(journey, scope = 'desk') {
  const situation = getAreaSituationForJourney(journey);
  if (!situation) {
    return {
      situation: null,
      eventMultiplier: 1,
      typeMultipliers: {}
    };
  }

  if (scope === 'field') {
    return {
      situation,
      eventMultiplier: clampMultiplier(Number(situation.fieldEventMultiplier || 1)),
      typeMultipliers: { ...(situation.fieldTypeMultipliers || {}) }
    };
  }

  return {
    situation,
    eventMultiplier: clampMultiplier(Number(situation.deskStressMultiplier || 1)),
    typeMultipliers: { ...(situation.deskTypeMultipliers || {}) }
  };
}
