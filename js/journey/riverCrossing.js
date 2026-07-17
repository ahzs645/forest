/**
 * River Crossings
 * The classic trail decision, BC forestry edition: when the traverse hits a
 * water crossing, the crew chooses between fording now, walking the line
 * first, rigging a winch line, or camping to wait the level out. Pure state
 * logic — the recon loop owns presentation and the scene layer owns art.
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

const GAUGE_LEVELS = [
  { id: 'low', label: 'LOW', description: 'Gravel bars showing. An easy wade.', baseRisk: 0.04 },
  { id: 'moderate', label: 'MODERATE', description: 'Knee-deep and pushy in the channel.', baseRisk: 0.14 },
  { id: 'high', label: 'HIGH', description: 'Thigh-deep, fast, and cold. Loads will swim.', baseRisk: 0.34 },
  { id: 'flood', label: 'FLOOD', description: 'Brown water carrying debris. This is a river with opinions.', baseRisk: 0.58 },
];

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

  const gaugeIndex = readGauge(journey, block);
  const gauge = GAUGE_LEVELS[gaugeIndex];

  let risk = gauge.baseRisk;
  if ((journey?.resources?.equipment || 0) <= 20) risk += 0.08;
  if (getActiveCrewCount(journey?.crew || []) <= 2) risk += 0.08;
  if (journey?.crossingScouted === block?.id) risk *= 0.5;

  return {
    blockId: block.id,
    blockName: block.name,
    gaugeIndex,
    gaugeId: gauge.id,
    gaugeLabel: gauge.label,
    gaugeDescription: gauge.description,
    risk: Math.min(0.85, risk),
    scouted: journey?.crossingScouted === block?.id,
    canWinch: (journey?.resources?.equipment || 0) > 10 && (journey?.resources?.fuel || 0) > 4,
  };
}

/**
 * Walk the line: costs time, halves the ford risk for this block.
 * @param {Object} journey
 * @param {Object} ctx - crossing context
 * @returns {{messages: string[]}}
 */
export function scoutCrossing(journey, ctx) {
  journey.crossingScouted = ctx.blockId;
  return {
    messages: [
      'You walk the crossing line, probing with a stick and reading the current.',
      ctx.gaugeIndex >= 2
        ? 'There is a diagonal bar upstream that keeps the crew out of the deepest channel.'
        : 'The bed is sound. A clean line shows itself.',
    ],
  };
}

/**
 * Rig a winch line: slow and costly, but nearly safe.
 * @param {Object} journey
 * @param {Object} ctx
 * @param {Function} [rand]
 * @returns {{messages: string[], mishap: boolean}}
 */
export function winchCrossing(journey, ctx, rand = Math.random) {
  journey.resources.fuel = Math.max(0, (journey.resources.fuel || 0) - 4);
  journey.resources.equipment = Math.max(0, (journey.resources.equipment || 0) - 3);

  const messages = [
    'The crew rigs a winch line off the big cottonwood and ferries loads across, one lashed bundle at a time.',
  ];
  let mishap = false;
  if (ctx.gaugeIndex >= 3 && rand() < 0.15) {
    mishap = true;
    journey.resources.equipment = Math.max(0, journey.resources.equipment - 4);
    messages.push('A snatch block lets go mid-haul — gear grinds across the cobble before the line is recovered. Equipment takes a beating.');
  } else {
    messages.push('Slow, wet, and completely under control. Everything reaches the far bank.');
  }
  return { messages, mishap };
}

/**
 * Ford the crossing and resolve what the water does about it.
 * @param {Object} journey
 * @param {Object} ctx
 * @param {Function} [rand]
 * @returns {{messages: string[], mishap: boolean, severity: 'none'|'soaked'|'swept', victimName: string|null}}
 */
export function fordCrossing(journey, ctx, rand = Math.random) {
  const messages = [];
  const roll = rand();

  if (roll >= ctx.risk) {
    messages.push(ctx.gaugeIndex >= 2
      ? 'The crew locks arms and takes the channel at the bar. Cold to the ribs, but everyone walks out the far side.'
      : 'A clean ford. Boots wet, loads dry.');
    if (ctx.gaugeIndex >= 2) {
      for (const member of journey.crew) {
        if (member.isActive) member.morale = Math.min(100, member.morale + 3);
      }
      messages.push('The crew is loud with relief on the far bank. Morale rises.');
    }
    return { messages, mishap: false, severity: 'none', victimName: null };
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
        'Halfway across, a pack sling lets go. The current takes its share before anyone can grab the strap.',
        `Rations soaked or gone (-${foodLoss} food). Gear knocked around. The crew crosses angry.`,
      ],
      mishap: true,
      severity: 'soaked',
      victimName: null,
    };
  }

  const active = journey.crew.filter((m) => m.isActive);
  const victim = active.length ? active[Math.floor(rand() * active.length)] : null;
  const foodLoss = 15 + Math.round(rand() * 10);
  journey.resources.food = Math.max(0, (journey.resources.food || 0) - foodLoss);
  if (victim) {
    applyRandomInjury(victim, ctx.gaugeIndex >= 3 ? 'severe' : 'moderate');
    applyStatusEffect(victim, 'hypothermia');
  }
  return {
    messages: [
      victim
        ? `${victim.name} loses footing in the channel and goes under. The crew hauls them out fifty metres downstream, blue-lipped and coughing.`
        : 'The channel nearly takes someone. The crew barely holds the line.',
      `A rations crate is simply gone (-${foodLoss} food).`,
      victim ? `${victim.name} is injured and hypothermic. They need care, soon.` : '',
    ].filter(Boolean),
    mishap: true,
    severity: 'swept',
    victimName: victim?.name || null,
  };
}
