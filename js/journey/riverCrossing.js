/**
 * Water Crossings
 * The classic trail decision, BC forestry edition — except a layout crew does
 * not wade a river in flood. What the crew can do depends on what is actually
 * there: a ford on a gravel bar, a steel or log bridge, a reaction ferry, or a
 * culvert in a road prism that may or may not still have fill over it. Pure
 * state logic — the recon loop owns presentation and the scene layer owns art.
 *
 * Gauge and risk both read existing systems (weather, season, equipment,
 * crew capacity) rather than rolling their own dice, so a spring storm on a
 * glacial creek is genuinely more dangerous than an August trickle.
 */

import { applyRandomInjury, applyStatusEffect, getActiveCrewCount } from '../crew.js';

export const CROSSING_HAZARDS = new Set([
  'river_crossing',
  'flood',
  'glacial_current',
  'glacial_outburst',
  'washout',
]);

/** Water level at which nobody walks a crew or a truck into the channel. */
export const FLOOD_GAUGE_INDEX = 3;

/** Printed by the caller whenever the gauge reads FLOOD. */
export const FLOOD_HOLD_MESSAGE = 'Nobody walks a crew into that. Wait it out, go around, or call it.';

const GAUGE_LEVELS = [
  { id: 'low', label: 'LOW', description: 'Gravel bars showing. Low water, easy wheel tracks.', baseRisk: 0.03 },
  { id: 'moderate', label: 'MODERATE', description: 'Knee-deep and pushy in the channel.', baseRisk: 0.10 },
  { id: 'high', label: 'HIGH', description: 'Thigh-deep, fast, and cold. Anything not chained down swims.', baseRisk: 0.30 },
  { id: 'flood', label: 'FLOOD', description: 'Brown water carrying debris. This is a river with opinions.', baseRisk: 0.58 },
];

/** What a crossing physically is, read off the block's features. */
export const CROSSING_MODES = {
  ford: { id: 'ford', label: 'ford' },
  bridge: { id: 'bridge', label: 'bridge' },
  ferry: { id: 'ferry', label: 'ferry' },
  culvert: { id: 'culvert', label: 'culvert' },
};

/** Fuel, in litres, for going the long way around a crossing. */
const REROUTE_FUEL_L = 24;
/** Fuel, in litres, a winch line crossing burns. */
const WINCH_FUEL_L = 16;

/**
 * Does entering this block put a crossing in the crew's way?
 * @param {Object} block
 * @returns {boolean}
 */
export function blockHasCrossing(block) {
  if (!block) return false;
  if (block.terrain === 'river') return true;
  return Array.isArray(block.hazards) && block.hazards.some((h) => CROSSING_HAZARDS.has(h));
}

/**
 * Read what kind of crossing this is from the block's features and hazards.
 * A bridged river is crossed on the bridge; a washout is a road prism, not a
 * channel; everything else is a ford.
 * @param {Object} block
 * @returns {'ford'|'bridge'|'ferry'|'culvert'}
 */
export function getCrossingMode(block) {
  const features = new Set((block?.features || []).map((f) => String(f || '').toLowerCase()));
  const hazards = new Set((block?.hazards || []).map((h) => String(h || '').toLowerCase()));
  if (features.has('ferry')) return 'ferry';
  if (features.has('bridge')) return 'bridge';
  if (features.has('culvert') || hazards.has('washout') || hazards.has('glacial_outburst')) return 'culvert';
  return 'ford';
}

/**
 * Read the water level from world state.
 * @param {Object} journey
 * @param {Object} block
 * @returns {number} 0..3 index into GAUGE_LEVELS
 */
function readGauge(journey, block) {
  let gauge = 1;
  const weatherId = journey?.weather?.id || '';
  if (/heavy_rain|storm/.test(weatherId)) gauge += 2;
  else if (/light_rain|fog/.test(weatherId)) gauge += 1;
  else if (/freezing|snow/.test(weatherId)) gauge -= 1;

  const season = journey?.season?.currentSeason;
  if (season === 'spring') gauge += 1;          // freshet
  else if (season === 'winter') gauge -= 1;     // locked up

  if (block?.hazards?.includes('glacial_current') || block?.hazards?.includes('glacial_outburst')) {
    gauge += 1;
  }
  if (block?.hazards?.includes('flood')) gauge += 1;

  return Math.max(0, Math.min(GAUGE_LEVELS.length - 1, gauge));
}

/**
 * Build the crossing context for a block the crew just reached, or null when
 * there is nothing to cross.
 * @param {Object} journey
 * @param {Object} block
 * @returns {Object|null}
 */
export function getCrossingContext(journey, block) {
  if (!blockHasCrossing(block)) return null;

  const mode = getCrossingMode(block);
  const gaugeIndex = readGauge(journey, block);
  const gauge = GAUGE_LEVELS[gaugeIndex];
  const hazards = new Set((block?.hazards || []).map((h) => String(h || '').toLowerCase()));
  const scouted = journey?.crossingScouted === block?.id;
  const undercut = journey?.crossingUndercut === block?.id;
  const condemned = (journey?.condemnedCrossings || []).includes(block?.id);

  let risk;
  if (mode === 'bridge') {
    risk = 0.02 + gaugeIndex * 0.04 + (hazards.has('bridge_weight') ? 0.12 : 0);
  } else if (mode === 'culvert') {
    risk = 0.05 + gaugeIndex * 0.08;
  } else if (mode === 'ferry') {
    risk = 0;
  } else {
    risk = gauge.baseRisk;
    if ((journey?.resources?.equipment || 0) <= 20) risk += 0.08;
    if (getActiveCrewCount(journey?.crew || []) <= 2) risk += 0.08;
  }
  if (scouted) risk *= 0.5;

  const flood = gaugeIndex >= FLOOD_GAUGE_INDEX;
  const high = gaugeIndex === 2;

  // What the crew may physically attempt today. A vehicle ford at HIGH only
  // after a scout; nothing enters a channel at FLOOD; a ferry is the
  // operator's call; a culvert is driven only while the fill is sound.
  let canCross;
  if (mode === 'ferry') canCross = !flood;
  else if (mode === 'bridge') canCross = !condemned && (!flood || scouted);
  else if (mode === 'culvert') canCross = !undercut && (gaugeIndex <= 1 || (scouted && high));
  else canCross = gaugeIndex <= 1 || (scouted && high);

  return {
    blockId: block.id,
    blockName: block.name,
    mode,
    gaugeIndex,
    gaugeId: gauge.id,
    gaugeLabel: gauge.label,
    gaugeDescription: gauge.description,
    risk: Math.min(0.85, risk),
    scouted,
    undercut,
    condemned,
    flood,
    canCross,
    canWinch: mode === 'ford' && !flood
      && (journey?.resources?.equipment || 0) > 10
      && (journey?.resources?.fuel || 0) > WINCH_FUEL_L,
    holdMessage: flood ? FLOOD_HOLD_MESSAGE : null,
  };
}

/**
 * The menu for a crossing, by mode and water level. Values are stable so the
 * balance harness and the recon loop can steer by them.
 * @param {Object} ctx
 * @returns {Array<{label: string, description: string, value: string}>}
 */
export function getCrossingOptions(ctx) {
  const options = [];
  if (!ctx) return options;

  if (ctx.mode === 'ferry') {
    options.push(ctx.flood
      ? { label: 'Radio the ferry operator', description: 'The cable is up in this water. Nobody crosses today.', value: 'ferry' }
      : { label: 'Wait for the ferry window', description: 'The reaction ferry runs on the current; the trucks go over chained down', value: 'ferry' });
  } else if (ctx.mode === 'bridge') {
    if (ctx.condemned) {
      options.push({ label: 'Look at the bridge', description: 'It is off the list for loaded traffic. Nothing to inspect.', value: 'noop' });
    } else {
      if (!ctx.scouted) {
        options.push({
          label: 'Inspect the structure',
          description: 'Walk the deck, check the load rating and the inspection tag, look at the approach fill',
          value: 'scout',
        });
      }
      if (ctx.canCross) {
        options.push({
          label: 'Cross one vehicle at a time',
          description: ctx.flood
            ? 'The deck is clear of the water; the approach fill is the question'
            : 'Walking speed, driver only in the cab, nobody on the deck',
          value: 'cross',
        });
      }
    }
    options.push({ label: 'Find another crossing', description: `Go the long way around (fuel -${REROUTE_FUEL_L} L, a late start tomorrow)`, value: 'reroute' });
  } else if (ctx.mode === 'culvert') {
    if (!ctx.scouted) {
      options.push({
        label: 'Walk the road prism',
        description: 'Assess the fill and the outlet on foot before a truck goes near it',
        value: 'scout',
      });
    }
    if (ctx.canCross) {
      options.push({
        label: 'Ease the trucks across the fill',
        description: 'One at a time, slow, spotter on the outlet side',
        value: 'cross',
      });
    }
    options.push({
      label: ctx.undercut ? 'Turn back — the fill is undercut' : 'Turn back and go around',
      description: `Take the old spur around (fuel -${REROUTE_FUEL_L} L, a late start tomorrow)`,
      value: 'reroute',
    });
  } else {
    if (ctx.canCross) {
      options.push({
        label: ctx.gaugeIndex >= 2 ? 'Take the trucks across the bar' : 'Ford it',
        description: ctx.gaugeIndex >= 2
          ? 'Low range, spotter on the hood, one truck in the other’s wheel tracks'
          : 'Take the crossing as it stands',
        value: 'ford',
      });
    }
    if (!ctx.scouted && !ctx.flood) {
      options.push({
        label: 'Walk the line first',
        description: 'Probe the bar on foot and read the current — halves the risk',
        value: 'scout',
      });
    }
    if (ctx.canWinch) {
      options.push({
        label: 'Rig a winch line (fuel & gear)',
        description: 'Slow and costly, but the water never gets a vote',
        value: 'winch',
      });
    }
    options.push({ label: 'Go around', description: `Take the long road (fuel -${REROUTE_FUEL_L} L, a late start tomorrow)`, value: 'reroute' });
  }

  options.push({
    label: 'Camp and wait for the level to drop',
    description: 'Give up the rest of the shift; tomorrow is another river',
    value: 'wait',
  });
  return options;
}

/**
 * Walk the line / inspect the structure / walk the prism: costs nothing but
 * halves the risk for this block and tells the crew what they are looking at.
 * @param {Object} journey
 * @param {Object} ctx - crossing context
 * @returns {{messages: string[]}}
 */
export function scoutCrossing(journey, ctx) {
  journey.crossingScouted = ctx.blockId;

  if (ctx.mode === 'bridge') {
    return {
      messages: [
        'You walk the deck end to end and read the inspection tag on the abutment.',
        ctx.gaugeIndex >= 2
          ? 'Load rating is legible and current. The far approach fill is soft where the water has been at it — one truck at a time, walking speed.'
          : 'Load rating is legible and current, stringers sound, no scour at the piers. It will take the trucks one at a time.',
      ],
    };
  }

  if (ctx.mode === 'culvert') {
    if (ctx.gaugeIndex >= 2) {
      journey.crossingUndercut = ctx.blockId;
      return {
        messages: [
          'You walk the prism with a probe. The outlet is undercut — you can see daylight under the fill.',
          'Nothing drives over that. You photograph it for the road permit holder and turn the trucks around.',
        ],
      };
    }
    return {
      messages: [
        'You walk the prism with a probe. The fill is saturated but the culvert is passing water and the outlet is intact.',
        'Drive it slow, one truck at a time, and note the pipe size for the road file.',
      ],
    };
  }

  return {
    messages: [
      'You walk the crossing line, probing with a stick and reading the current.',
      ctx.gaugeIndex >= 2
        ? 'There is a diagonal bar upstream that keeps the trucks out of the deepest channel.'
        : 'The bed is sound. A clean line shows itself.',
    ],
  };
}

/**
 * Rig a winch line: slow and costly, but nearly safe.
 * @param {Object} journey
 * @param {Object} ctx
 * @param {Function} [rand]
 * @returns {{messages: string[], mishap: boolean, crossed: boolean}}
 */
export function winchCrossing(journey, ctx, rand = Math.random) {
  journey.resources.fuel = Math.max(0, (journey.resources.fuel || 0) - WINCH_FUEL_L);
  journey.resources.equipment = Math.max(0, (journey.resources.equipment || 0) - 3);

  const messages = [
    'The crew rigs a winch line off the big cottonwood and walks the trucks across on the cable, one at a time.',
  ];
  let mishap = false;
  if (ctx.gaugeIndex >= 2 && rand() < 0.15) {
    mishap = true;
    journey.resources.equipment = Math.max(0, journey.resources.equipment - 4);
    messages.push('A snatch block lets go mid-haul — gear grinds across the cobble before the line is recovered. Equipment takes a beating.');
  } else {
    messages.push('Slow, wet, and completely under control. Everything reaches the far bank.');
  }
  return { messages, mishap, crossed: true, severity: mishap ? 'soaked' : 'none', victimName: null };
}

/**
 * A vehicle ford, and what the water does about it. Refused at FLOOD, and at
 * HIGH unless the line has been walked first.
 * @param {Object} journey
 * @param {Object} ctx
 * @param {Function} [rand]
 * @returns {{messages: string[], mishap: boolean, crossed: boolean, severity: 'none'|'soaked'|'swept'|'refused', victimName: string|null}}
 */
export function fordCrossing(journey, ctx, rand = Math.random) {
  if (ctx.flood || !ctx.canCross) {
    return {
      messages: [ctx.flood ? FLOOD_HOLD_MESSAGE : 'Not at this level without walking the line first.'],
      mishap: false,
      crossed: false,
      severity: 'refused',
      victimName: null,
    };
  }

  const messages = [];
  const roll = rand();

  if (roll >= ctx.risk) {
    messages.push(ctx.gaugeIndex >= 2
      ? 'The lead truck idles across the bar in low range with a spotter on the hood calling the line. The second follows in its wheel tracks. Cold water over the floorboards, but everyone is across.'
      : 'A clean ford. The trucks take the bar in low range and the boots stay dry.');
    return { messages, mishap: false, crossed: true, severity: 'none', victimName: null };
  }

  // Mishap. High water swings toward the severe outcome.
  const severe = rand() < (ctx.gaugeIndex >= 2 ? 0.55 : 0.25);
  if (!severe) {
    const foodLoss = 8 + Math.round(rand() * 10);
    journey.resources.food = Math.max(0, (journey.resources.food || 0) - foodLoss);
    journey.resources.equipment = Math.max(0, (journey.resources.equipment || 0) - 4);
    for (const member of journey.crew) {
      if (member.isActive) member.morale = Math.max(0, member.morale - 4);
    }
    return {
      messages: [
        'Halfway across, the lead truck drops a wheel into a scour hole. An hour of wet rope work winches it back onto the bar.',
        `A food crate on the tailgate goes downstream (-${foodLoss} food). Gear knocked around. The crew crosses angry.`,
      ],
      mishap: true,
      crossed: true,
      severity: 'soaked',
      victimName: null,
    };
  }

  const active = journey.crew.filter((m) => m.isActive);
  const victim = active.length ? active[Math.floor(rand() * active.length)] : null;
  const foodLoss = 15 + Math.round(rand() * 10);
  journey.resources.food = Math.max(0, (journey.resources.food || 0) - foodLoss);
  journey.resources.equipment = Math.max(0, (journey.resources.equipment || 0) - 8);
  if (victim) {
    applyRandomInjury(victim, 'moderate');
    applyStatusEffect(victim, 'hypothermia');
  }
  return {
    messages: [
      'The truck stalls mid-channel and the crew wades out on the sling line.',
      victim
        ? `${victim.name} loses footing in the channel and goes under. The crew hauls them out fifty metres downstream, blue-lipped and coughing.`
        : 'The channel nearly takes someone. The crew barely holds the line.',
      `A rations crate is simply gone (-${foodLoss} food). The truck is out, eventually, and worse for it.`,
      victim ? `${victim.name} is hurt and hypothermic. Dry clothes, warm cab, and the attendant does not leave their side.` : '',
    ].filter(Boolean),
    mishap: true,
    crossed: true,
    severity: 'swept',
    victimName: victim?.name || null,
  };
}

/**
 * Cross a bridge one vehicle at a time. The failure mode is the structure or
 * its approach, never the crew — a bridge that fails is condemned for loaded
 * traffic and costs every later leg (js/events/consequences.js).
 * @param {Object} journey
 * @param {Object} ctx
 * @param {Function} [rand]
 * @returns {{messages: string[], mishap: boolean, crossed: boolean, severity: string, victimName: null}}
 */
export function bridgeCrossing(journey, ctx, rand = Math.random) {
  if (!ctx.canCross) {
    return {
      messages: [ctx.condemned
        ? 'That bridge is finished for loaded traffic. Go around.'
        : 'Not in this water without inspecting the structure first.'],
      mishap: false,
      crossed: false,
      severity: 'refused',
      victimName: null,
    };
  }

  if (rand() >= ctx.risk) {
    return {
      messages: [
        'One truck at a time, walking speed, nobody in the cab but the driver. The stringers take it without a word.',
        'You note the inspection tag and the load rating for the road file.',
      ],
      mishap: false,
      crossed: true,
      severity: 'none',
      victimName: null,
    };
  }

  journey.resources.equipment = Math.max(0, (journey.resources.equipment || 0) - 6);
  journey.scrutiny = Math.min(100, (journey.scrutiny || 0) + 1);
  journey.condemnedCrossings = journey.condemnedCrossings || [];
  if (!journey.condemnedCrossings.includes(ctx.blockId)) journey.condemnedCrossings.push(ctx.blockId);
  return {
    messages: [
      'The approach fill on the far side slumps under the second truck. It claws out onto the road on its own, but a stringer has moved and the deck is no longer square.',
      'The bridge goes on the road permit holder’s list as unsafe for loaded traffic. Anything coming back this way goes the long road. Equipment -6, scrutiny +1.',
    ],
    mishap: true,
    crossed: true,
    severity: 'condemned',
    victimName: null,
  };
}

/**
 * Take the reaction ferry. The operator's call, not the crew's: at FLOOD the
 * cable is up and nobody crosses.
 * @param {Object} journey
 * @param {Object} ctx
 * @returns {{messages: string[], mishap: boolean, crossed: boolean, severity: string, victimName: null}}
 */
export function ferryCrossing(journey, ctx) {
  if (ctx.flood) {
    return {
      messages: ['The operator has the cable up and the ferry tied off on the far side. Nobody crosses today.'],
      mishap: false,
      crossed: false,
      severity: 'refused',
      victimName: null,
    };
  }
  return {
    messages: [
      'The reaction ferry swings across on the current with the trucks chained down and the crew out of the cabs.',
      'Twenty minutes and no drama. The operator waves you off the far ramp.',
    ],
    mishap: false,
    crossed: true,
    severity: 'none',
    victimName: null,
  };
}

/**
 * Drive a road prism over a culvert. Refused while the fill is undercut or
 * the water is up; a failure cuts the road, not the crew.
 * @param {Object} journey
 * @param {Object} ctx
 * @param {Function} [rand]
 * @returns {{messages: string[], mishap: boolean, crossed: boolean, severity: string, victimName: null}}
 */
export function culvertCrossing(journey, ctx, rand = Math.random) {
  if (!ctx.canCross) {
    return {
      messages: [ctx.undercut
        ? 'The fill is undercut. Nothing drives over that.'
        : 'Not in this water without walking the prism first.'],
      mishap: false,
      crossed: false,
      severity: 'refused',
      victimName: null,
    };
  }

  if (rand() >= ctx.risk) {
    return {
      messages: [
        'The fill holds. One truck, then the other, with a spotter watching the outlet for fresh scour.',
        'You note the pipe size and the scour for the road permit holder.',
      ],
      mishap: false,
      crossed: true,
      severity: 'none',
      victimName: null,
    };
  }

  journey.resources.equipment = Math.max(0, (journey.resources.equipment || 0) - 10);
  journey.scrutiny = Math.min(100, (journey.scrutiny || 0) + 2);
  return {
    messages: [
      'The fill lets go under the rear wheels. The truck is winched back onto solid road, but a slug of fill is in the creek and the road is cut.',
      'You photograph it, call it in to the road permit holder, and the crew works the near side while the culvert is replaced. Equipment -10, scrutiny +2.',
    ],
    mishap: true,
    crossed: true,
    severity: 'washout',
    victimName: null,
  };
}

/**
 * Go the long way around. Spends fuel and a slice of tomorrow's leg; leaves
 * the crew intact and on the far side.
 * @param {Object} journey
 * @param {Object} ctx
 * @returns {{messages: string[], mishap: boolean, crossed: boolean, severity: string, victimName: null}}
 */
export function rerouteCrossing(journey, ctx) {
  journey.resources.fuel = Math.max(0, (journey.resources.fuel || 0) - REROUTE_FUEL_L);
  journey.pendingTravelSetback = Math.min(0.75, (journey.pendingTravelSetback || 0) + 0.35);
  const line = ctx.mode === 'culvert'
    ? 'You take the old spur around the washout.'
    : ctx.mode === 'bridge'
      ? 'You find another crossing on the map and drive to it.'
      : 'You take the long road around the crossing.';
  return {
    messages: [
      line,
      `Fuel -${REROUTE_FUEL_L} L, and tomorrow's leg starts late. The crew is dry, bored, and intact.`,
    ],
    mishap: false,
    crossed: true,
    severity: 'none',
    victimName: null,
  };
}

/**
 * Resolve a chosen crossing action against its mode.
 * @param {Object} journey
 * @param {Object} ctx
 * @param {string} value - option value from getCrossingOptions
 * @param {Function} [rand]
 * @returns {Object} result with messages/mishap/crossed/severity/victimName
 */
export function resolveCrossingChoice(journey, ctx, value, rand = Math.random) {
  switch (value) {
    case 'scout':
      return { ...scoutCrossing(journey, ctx), mishap: false, crossed: false, severity: 'scouted', victimName: null };
    case 'winch':
      return winchCrossing(journey, ctx, rand);
    case 'ford':
      return fordCrossing(journey, ctx, rand);
    case 'cross':
      return ctx.mode === 'bridge' ? bridgeCrossing(journey, ctx, rand) : culvertCrossing(journey, ctx, rand);
    case 'ferry':
      return ferryCrossing(journey, ctx);
    case 'reroute':
      return rerouteCrossing(journey, ctx);
    default:
      return { messages: [], mishap: false, crossed: false, severity: 'none', victimName: null };
  }
}
