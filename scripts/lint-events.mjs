#!/usr/bin/env node
/**
 * Content lint for the event libraries.
 * Run via `npm run lint:events` (also gated in CI before deploys).
 *
 * Checks, across js/data/json/{field,desk}/events.json and the legacy pools:
 *  - unique event ids
 *  - required fields (id, title, description, type, probability, options)
 *  - probability in (0, 1]
 *  - roles / journeyTypes values come from the known vocabulary
 *  - every option has a label; option.schedulesEvent targets resolve in some pool
 */

import { FIELD_EVENTS } from '../js/data/fieldEvents.js';
import { DESK_EVENTS } from '../js/data/deskEvents.js';

const VALID_ROLES = new Set(['planner', 'permitter', 'recce', 'silviculture', 'manager']);
const VALID_JOURNEY_TYPES = new Set(['field', 'recon', 'silviculture', 'desk', 'planning', 'permitting', 'manager']);

const ALL = [
  ...FIELD_EVENTS.map((e) => ({ pool: 'field', event: e })),
  ...DESK_EVENTS.map((e) => ({ pool: 'desk', event: e })),
];

const errors = [];
const ids = new Map();

for (const { pool, event } of ALL) {
  const where = `${pool}:${event.id || event.title || '(unnamed)'}`;

  for (const field of ['id', 'title', 'description', 'type']) {
    if (!event[field]) errors.push(`${where}: missing required field "${field}"`);
  }

  if (event.id) {
    if (ids.has(event.id)) errors.push(`${where}: duplicate id (also in ${ids.get(event.id)})`);
    ids.set(event.id, pool);
  }

  // probability 0 is legal for chain payoffs (drawn only via schedulesEvent);
  // reachability for those is verified below.
  if (typeof event.probability !== 'number' || event.probability < 0 || event.probability > 1) {
    errors.push(`${where}: probability must be a number in [0, 1], got ${event.probability}`);
  }

  for (const role of event.roles || []) {
    if (!VALID_ROLES.has(role)) errors.push(`${where}: unknown role "${role}"`);
  }
  for (const jt of event.journeyTypes || []) {
    if (!VALID_JOURNEY_TYPES.has(jt)) errors.push(`${where}: unknown journeyType "${jt}"`);
  }

  if (!Array.isArray(event.options) || event.options.length === 0) {
    errors.push(`${where}: needs at least one option`);
    continue;
  }
  for (const [i, option] of event.options.entries()) {
    if (!option.label) errors.push(`${where}: option ${i + 1} missing label`);
  }
}

// Chain resolvability: schedulesEvent targets must exist in some pool
const allIds = new Set(ids.keys());
const scheduledIds = new Set();
for (const { pool, event } of ALL) {
  for (const option of event.options || []) {
    if (option.schedulesEvent) {
      scheduledIds.add(option.schedulesEvent);
      if (!allIds.has(option.schedulesEvent)) {
        errors.push(`${pool}:${event.id}: schedulesEvent "${option.schedulesEvent}" resolves in no pool`);
      }
    }
  }
}

// Zero-probability events must be reachable through a chain, or they are dead content
for (const { pool, event } of ALL) {
  if (event.probability === 0 && event.id && !scheduledIds.has(event.id)) {
    errors.push(`${pool}:${event.id}: probability 0 but nothing schedules it — unreachable content`);
  }
}

if (errors.length) {
  console.error(`Event content lint FAILED (${errors.length} issue${errors.length > 1 ? 's' : ''}):`);
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}
console.log(`Event content lint passed: ${ALL.length} events, ${allIds.size} unique ids.`);
