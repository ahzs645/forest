/**
 * Persistent route constraints for physical obstructions.
 *
 * These are plain JSON records so old saves simply behave as having no active
 * constraints, and new saves serialize without a migration layer.
 */

import { getCurrentBlock, getNextBlock } from './blockNav.js';

// A layout crew does not rebuild roads. Cutting a bypass with the saws is
// unauthorized road construction under the road permit and the FPPR, so the
// two honest answers are to report the failure and work the near side while
// the road crew comes, or to walk/drive the old line around it. Fuel is in
// litres.
const OBSTRUCTION_EVENT_PROFILES = {
  road_washout: {
    kind: 'washout',
    title: 'Road washout',
    summary: 'The road ahead has collapsed and blocks the next leg.',
    report: { fuel: -8, scrutiny: -1, travelSetback: 0.5 },
    detour: { fuel: -28, equipment: -4, scrutiny: 0, travelSetback: 0.25 },
    reportNote: 'You flag the failure, photograph it, call it in to the road permit holder and work the near-side blocks. The road crew will be days.',
    detourNote: 'You walk in from the last sound approach and take the old spur around with the trucks. Slower, rougher, and nobody had to build anything.',
  },
  landslide: {
    kind: 'landslide',
    title: 'Landslide debris',
    summary: 'Slide debris is still across the route ahead.',
    report: { fuel: -8, scrutiny: -1, travelSetback: 0.5 },
    detour: { fuel: -20, equipment: -5, scrutiny: 0, travelSetback: 0.2 },
    reportNote: 'You photograph the slide, flag the road closed and call it in. A geotech looks before anyone clears it; you work the near-side blocks meanwhile.',
    detourNote: 'You take the old spur around the toe of the slide. Slower, rougher, and nobody had to touch the debris.',
  },
};

function normalizeEventId(event) {
  return String(event?.id || '').replace(/^legacy_/, '');
}

export function isRouteObstructionEvent(event) {
  return Boolean(OBSTRUCTION_EVENT_PROFILES[normalizeEventId(event)]);
}

export function ensureRouteConstraints(journey) {
  if (!Array.isArray(journey.routeConstraints)) {
    journey.routeConstraints = [];
  }
  return journey.routeConstraints;
}

export function addRouteConstraintFromEvent(journey, event) {
  if (!journey || !Array.isArray(journey.blocks) || !isRouteObstructionEvent(event)) return null;
  const profile = OBSTRUCTION_EVENT_PROFILES[normalizeEventId(event)];
  const current = getCurrentBlock(journey);
  const next = getNextBlock(journey);
  const constraints = ensureRouteConstraints(journey);
  const id = `${profile.kind}:${current?.id || journey.currentBlockIndex || 0}:${next?.id || 'end'}`;
  const existing = constraints.find((constraint) => constraint.id === id && constraint.status !== 'resolved');
  if (existing) return existing;

  const created = {
    id,
    eventId: normalizeEventId(event),
    kind: profile.kind,
    title: event?.title || profile.title,
    summary: profile.summary,
    fromBlockId: current?.id || null,
    fromBlockName: current?.name || 'Current block',
    toBlockId: next?.id || null,
    toBlockName: next?.name || 'the next block',
    createdDay: journey.day || 0,
    status: 'active',
  };
  constraints.push(created);
  return created;
}

export function getActiveRouteConstraint(journey) {
  const current = getCurrentBlock(journey);
  const next = getNextBlock(journey);
  return ensureRouteConstraints(journey).find((constraint) =>
    constraint?.status === 'active'
    && constraint.fromBlockId === (current?.id || null)
    && constraint.toBlockId === (next?.id || null)
  ) || null;
}

function applyConstraintEffects(journey, effects = {}) {
  const resources = journey.resources || {};
  for (const key of ['fuel', 'equipment', 'food', 'firstAid', 'budget']) {
    if (typeof effects[key] !== 'number' || typeof resources[key] !== 'number') continue;
    resources[key] = Math.max(0, resources[key] + effects[key]);
  }
  if (typeof effects.scrutiny === 'number') {
    journey.scrutiny = Math.max(0, Math.min(100, (journey.scrutiny || 0) + effects.scrutiny));
  }
  if (typeof effects.travelSetback === 'number') {
    journey.pendingTravelSetback = Math.min(0.75, (journey.pendingTravelSetback || 0) + effects.travelSetback);
  }
}

export function resolveRouteConstraint(journey, constraintId, mode = 'report') {
  const constraint = ensureRouteConstraints(journey).find((entry) =>
    entry?.id === constraintId && entry.status === 'active'
  );
  if (!constraint) {
    return { resolved: false, messages: ['No active route constraint was found.'] };
  }

  const profile = OBSTRUCTION_EVENT_PROFILES[constraint.eventId] || OBSTRUCTION_EVENT_PROFILES[constraint.kind] || {};
  // 'clear' is the pre-rename spelling from older saves and callers; it is
  // the report path now, never a chainsaw bypass.
  const selectedMode = mode === 'detour' ? 'detour' : 'report';
  applyConstraintEffects(journey, profile[selectedMode] || {});
  constraint.status = 'resolved';
  constraint.resolvedDay = journey.day || 0;
  constraint.resolution = selectedMode;

  const messages = selectedMode === 'detour'
    ? [
        `Detour marked around ${constraint.title} between ${constraint.fromBlockName} and ${constraint.toBlockName}.`,
        profile.detourNote || 'The route is passable again, but the next travel leg will be slower and rougher.',
      ]
    : [
        `${constraint.title} reported between ${constraint.fromBlockName} and ${constraint.toBlockName}.`,
        profile.reportNote || 'You flag the failure, photograph it and call it in to the road permit holder.',
        'The road crew opens it; travel can resume, late, on the next leg.',
      ];
  return { resolved: true, constraint, mode: selectedMode, messages };
}
