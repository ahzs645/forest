/**
 * Persistent route constraints for physical obstructions.
 *
 * These are plain JSON records so old saves simply behave as having no active
 * constraints, and new saves serialize without a migration layer.
 */

import { getCurrentBlock, getNextBlock } from './blockNav.js';

const OBSTRUCTION_EVENT_PROFILES = {
  road_washout: {
    kind: 'washout',
    title: 'Road washout',
    summary: 'The road ahead has collapsed and blocks the next leg.',
    clear: { fuel: -4, equipment: -8, scrutiny: -1 },
    detour: { fuel: -7, equipment: -4, scrutiny: 1, travelSetback: 0.25 },
  },
  landslide: {
    kind: 'landslide',
    title: 'Landslide debris',
    summary: 'Slide debris is still across the route ahead.',
    clear: { fuel: -6, equipment: -10, scrutiny: -1 },
    detour: { fuel: -5, equipment: -5, scrutiny: 1, travelSetback: 0.2 },
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

export function resolveRouteConstraint(journey, constraintId, mode = 'clear') {
  const constraint = ensureRouteConstraints(journey).find((entry) =>
    entry?.id === constraintId && entry.status === 'active'
  );
  if (!constraint) {
    return { resolved: false, messages: ['No active route constraint was found.'] };
  }

  const profile = OBSTRUCTION_EVENT_PROFILES[constraint.eventId] || OBSTRUCTION_EVENT_PROFILES[constraint.kind] || {};
  const selectedMode = mode === 'detour' ? 'detour' : 'clear';
  applyConstraintEffects(journey, profile[selectedMode] || {});
  constraint.status = 'resolved';
  constraint.resolvedDay = journey.day || 0;
  constraint.resolution = selectedMode;

  const messages = selectedMode === 'detour'
    ? [
        `Detour marked around ${constraint.title} between ${constraint.fromBlockName} and ${constraint.toBlockName}.`,
        'The route is passable again, but the next travel leg will be slower and rougher.',
      ]
    : [
        `${constraint.title} cleared between ${constraint.fromBlockName} and ${constraint.toBlockName}.`,
        'The route constraint is off the board; travel can resume from here.',
      ];
  return { resolved: true, constraint, mode: selectedMode, messages };
}
