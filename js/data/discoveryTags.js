/**
 * Discovery Tags
 * Persistent field findings that carry forward across role modes.
 */

const DISCOVERY_TAG_DEFINITIONS = {
  access_rehab: {
    id: 'access_rehab',
    label: 'Access rehab',
    summary: 'Access or engineering issues are going to keep coming back until the route is cleaned up.',
    roleNotes: {
      planner: 'Access rehab issues are narrowing your clean block sequence.',
      permitter: 'Expect drainage, road, and file-defensibility questions on access work.',
      silviculture: 'Crews will keep losing time until the rough access is stabilized.',
      recce: 'The route looks passable only with rehab or a slower travel plan.'
    },
    fieldTypeMultipliers: {
      terrain: 1.3,
      equipment: 1.15
    },
    deskTypeMultipliers: {
      technical: 1.25,
      compliance: 1.1
    }
  },
  winter_access: {
    id: 'winter_access',
    label: 'Winter-only access',
    summary: 'This ground really wants frozen conditions before it behaves.',
    roleNotes: {
      planner: 'Winter-only access is constraining your operating window.',
      permitter: 'Timing language and access assumptions need to match a frozen-ground window.',
      silviculture: 'Warm-season work will stay awkward until access firms up.',
      recce: 'The block reads like a winter-only approach.'
    },
    fieldTypeMultipliers: {
      weather: 1.2,
      terrain: 1.1
    },
    deskTypeMultipliers: {
      technical: 1.15,
      compliance: 1.05
    }
  },
  heli_access: {
    id: 'heli_access',
    label: 'Heli access',
    summary: 'Ground access is weak enough that aviation keeps entering the conversation.',
    roleNotes: {
      planner: 'Heli-dependent access is raising cost and sequencing pressure.',
      permitter: 'Expect more scrutiny on access logic and remote-operability assumptions.',
      silviculture: 'Remote access is making deployment and recovery less stable.',
      recce: 'The safest read is heli-only access.'
    },
    fieldTypeMultipliers: {
      weather: 1.2,
      supply: 1.15
    },
    deskTypeMultipliers: {
      technical: 1.2,
      political: 1.05
    }
  },
  watershed_watch: {
    id: 'watershed_watch',
    label: 'Watershed watch',
    summary: 'Water, fish passage, or drainage detail is sensitive enough to stay live across phases.',
    roleNotes: {
      planner: 'Water and crossing constraints are shaping the next clean block choices.',
      permitter: 'The file needs stronger hydrology and protection language to stay defensible.',
      silviculture: 'Treatments will stay under a microscope near water and fish values.',
      recce: 'Crossings and riparian ground need cleaner notes before anyone commits.'
    },
    fieldTypeMultipliers: {
      weather: 1.15,
      terrain: 1.1
    },
    deskTypeMultipliers: {
      technical: 1.3,
      compliance: 1.2
    }
  },
  cultural_hold: {
    id: 'cultural_hold',
    label: 'Cultural hold',
    summary: 'Consultation, archaeology, or cultural-value questions are active on the ground.',
    roleNotes: {
      planner: 'Consultation-sensitive ground is reducing how aggressively you can sequence blocks.',
      permitter: 'Accommodation and consultation notes will need a cleaner trail.',
      silviculture: 'Operational choices will need to respect cultural timing and site care.',
      recce: 'Ground indicators suggest a cultural or consultation hold is possible.'
    },
    fieldTypeMultipliers: {
      social: 1.2,
      terrain: 1.05
    },
    deskTypeMultipliers: {
      stakeholder: 1.25,
      compliance: 1.15
    }
  },
  community_visibility: {
    id: 'community_visibility',
    label: 'Community visibility',
    summary: 'The work is sitting close enough to people, viewsheds, or recreation use that it stays public-facing.',
    roleNotes: {
      planner: 'Visible ground is raising the cost of sloppy sequencing.',
      permitter: 'Expect more public-facing map and visual-quality pressure.',
      silviculture: 'Visible ground means contractor sloppiness will get noticed faster.',
      recce: 'This block is likely to generate visible community reaction if it goes sideways.'
    },
    fieldTypeMultipliers: {
      morale: 1.1,
      social: 1.15
    },
    deskTypeMultipliers: {
      stakeholder: 1.2,
      political: 1.15
    }
  },
  smoke_pressure: {
    id: 'smoke_pressure',
    label: 'Smoke pressure',
    summary: 'Smoke and wildfire-operability pressure are active enough to shape daily work.',
    roleNotes: {
      planner: 'Wildfire pressure is reshaping priorities faster than the schedule likes.',
      permitter: 'Expect more pressure around operability, timing, and public risk.',
      silviculture: 'Smoke pressure is chewing through crew stability and work windows.',
      recce: 'Smoke is likely to close or distort field windows.'
    },
    fieldTypeMultipliers: {
      weather: 1.3,
      morale: 1.1
    },
    deskTypeMultipliers: {
      political: 1.2,
      compliance: 1.05
    }
  },
  regen_gap: {
    id: 'regen_gap',
    label: 'Regeneration gap',
    summary: 'Survival or regen quality is soft enough that later stand-tending work will feel it.',
    roleNotes: {
      planner: 'Poor regeneration history is affecting how cleanly the landscape story hangs together.',
      permitter: 'Weak regeneration outcomes make the file easier to challenge on execution quality.',
      silviculture: 'The stand needs fill work and cleaner follow-through before survey will land.',
      recce: 'Field notes suggest this ground will come back as a regen problem.'
    },
    fieldTypeMultipliers: {
      terrain: 1.05,
      forest_health: 1.2
    },
    deskTypeMultipliers: {
      technical: 1.15,
      team: 1.1
    }
  }
};

function clampMultiplier(value) {
  return Math.max(0.75, Math.min(2, value));
}

function normalizeDiscoveryId(tagId) {
  return String(tagId || '').trim().toLowerCase();
}

function sanitizeDetails(details = {}) {
  const result = {};
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined || value === null || value === '') continue;
    result[key] = value;
  }
  return result;
}

export function getDiscoveryTagDefinition(tagId) {
  return DISCOVERY_TAG_DEFINITIONS[normalizeDiscoveryId(tagId)] || null;
}

export function listDiscoveryTagDefinitions() {
  return Object.values(DISCOVERY_TAG_DEFINITIONS);
}

export function ensureDiscoveryTagState(journey) {
  if (!Array.isArray(journey.discoveryTags)) {
    journey.discoveryTags = [];
  }
  return journey.discoveryTags;
}

export function upsertDiscoveryTag(journey, tagId, options = {}) {
  const definition = getDiscoveryTagDefinition(tagId);
  if (!definition || !journey) {
    return null;
  }

  const tags = ensureDiscoveryTagState(journey);
  const existing = tags.find((tag) => tag.id === definition.id);
  const day = Number.isFinite(options.day) ? options.day : journey.day || 0;
  const details = sanitizeDetails(options.details);
  const source = options.source || 'system';
  const severity = Math.max(1, Number(options.severity || 1));

  if (existing) {
    existing.count = (existing.count || 1) + 1;
    existing.lastDay = day;
    existing.severity = Math.max(existing.severity || 1, severity);
    existing.sources = Array.from(new Set([...(existing.sources || []), source]));
    existing.details = { ...(existing.details || {}), ...details };
    if (options.note) {
      existing.note = options.note;
    }
    return existing;
  }

  const created = {
    id: definition.id,
    label: definition.label,
    summary: definition.summary,
    firstDay: day,
    lastDay: day,
    severity,
    count: 1,
    areaId: options.areaId || journey.areaId || null,
    sourceRole: options.roleId || journey.roleId || null,
    sources: source ? [source] : [],
    note: options.note || null,
    details
  };
  tags.push(created);
  return created;
}

export function addDiscoveryTags(journey, tagIds = [], options = {}) {
  const created = [];
  for (const tagId of tagIds) {
    const tag = upsertDiscoveryTag(journey, tagId, options);
    if (tag) created.push(tag);
  }
  return created;
}

export function getJourneyDiscoveryTags(journey, options = {}) {
  const tags = ensureDiscoveryTagState(journey);
  const ids = Array.isArray(options.ids) ? options.ids.map(normalizeDiscoveryId) : null;

  const filtered = tags.filter((tag) => {
    if (ids && !ids.includes(tag.id)) return false;
    return true;
  });

  return filtered
    .map((tag) => ({
      ...tag,
      definition: getDiscoveryTagDefinition(tag.id)
    }))
    .sort((a, b) => (b.severity || 0) - (a.severity || 0) || (b.lastDay || 0) - (a.lastDay || 0));
}

export function getDiscoveryTagNotes(journey, roleId, maxNotes = 2) {
  return getJourneyDiscoveryTags(journey)
    .map((tag) => tag.definition?.roleNotes?.[roleId] || tag.note || tag.summary)
    .filter(Boolean)
    .slice(0, Math.max(0, maxNotes));
}

export function getDiscoveryEventTypeMultipliers(journey, scope = 'desk') {
  const key = scope === 'field' ? 'fieldTypeMultipliers' : 'deskTypeMultipliers';
  const merged = {};

  for (const tag of getJourneyDiscoveryTags(journey)) {
    const multipliers = tag.definition?.[key];
    if (!multipliers) continue;
    for (const [type, value] of Object.entries(multipliers)) {
      const current = merged[type] || 1;
      merged[type] = clampMultiplier(current * Number(value || 1));
    }
  }

  return merged;
}

export function inferDiscoveryTagsFromAccess(block, verdict, weather = null) {
  const tags = new Set();
  const features = new Set((block?.features || []).map((feature) => String(feature || '').toLowerCase()));
  const hazards = new Set((block?.hazards || []).map((hazard) => String(hazard || '').toLowerCase()));
  const verdictId = normalizeDiscoveryId(verdict?.id);
  const weatherId = normalizeDiscoveryId(weather?.id);

  if (verdictId === 'rehab_needed' || verdictId === 'no_go') {
    tags.add('access_rehab');
  }
  if (verdictId === 'winter_only') {
    tags.add('winter_access');
  }
  if (verdictId === 'heli_only') {
    tags.add('heli_access');
  }

  if (
    features.has('community_water')
    || features.has('watershed')
    || features.has('salmon_river')
    || features.has('fish_habitat')
    || hazards.has('river_crossing')
    || hazards.has('fish_timing')
  ) {
    tags.add('watershed_watch');
  }

  if (
    features.has('first_nation')
    || features.has('cultural_site')
    || features.has('culturally_modified_trees')
    || hazards.has('cultural_protocol')
  ) {
    tags.add('cultural_hold');
  }

  if (features.has('visual_quality_zone') || hazards.has('visual_constraint')) {
    tags.add('community_visibility');
  }

  if (weatherId === 'smoke' || weatherId === 'heavy_smoke' || weatherId === 'wildfire_smoke') {
    tags.add('smoke_pressure');
  }

  return [...tags];
}

const EVENT_DISCOVERY_TAGS = {
  peat_crossing_pumping: ['access_rehab'],
  salmon_crossing_red_flag: ['watershed_watch'],
  smoke_hold: ['smoke_pressure'],
  regen_stress_patch: ['regen_gap'],
  community_watershed_red_flag: ['watershed_watch'],
  caribou_window_revision: ['winter_access'],
  archaeology_screening_gap: ['cultural_hold'],
  visual_quality_redraft: ['community_visibility']
};

export function inferDiscoveryTagsFromEvent(event) {
  const eventId = normalizeDiscoveryId(event?.id);
  return [...(EVENT_DISCOVERY_TAGS[eventId] || [])];
}
