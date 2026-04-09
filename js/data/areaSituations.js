/**
 * Area Situations
 * Recurring zone-specific pressure that colors event selection over time.
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
    }
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
    }
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
    }
  },
  {
    id: 'fraser_smoke_push',
    title: 'Smoke push',
    summary: 'Wildfire smoke and community risk are compressing the useful work window.',
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
    }
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
    }
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
    }
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
