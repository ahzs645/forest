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
import STATUS_EFFECTS from '../js/data/json/shared/statusEffects.json' with { type: 'json' };

const VALID_ROLES = new Set(['planner', 'permitter', 'recce', 'silviculture', 'manager']);
const VALID_JOURNEY_TYPES = new Set(['field', 'recon', 'silviculture', 'desk', 'planning', 'permitting', 'manager']);

// Vocabulary the engine actually consumes (js/events/resolution.js,
// js/modes/shared/handleEvent.js). Anything outside these sets is a broken
// promise to the player — the option text implies a mechanic that never runs.
const VALID_OPTION_KEYS = new Set([
  'label', 'outcome', 'effects', 'crewEffect', 'riskInjury', 'riskCompliance',
  'riskRejection', 'timeUsed', 'schedulesEvent', 'scheduledDelay', 'requiresRole',
  'gameOver', 'gameOverReason', 'hiddenOutcome', 'chanceSuccess', 'failureOutcome',
  'failureEffects',
]);
const VALID_EFFECT_KEYS = new Set([
  'budget', 'fuel', 'food', 'equipment', 'firstAid', 'politicalCapital',
  'timeUsed', 'progress', 'crew_health', 'crew_morale', 'compliance',
  'relationships', 'scrutiny', 'reputation', 'permits_approved', 'data',
]);
const VALID_CREW_EFFECT_KEYS = new Set([
  'injury', 'illness', 'count', 'evacuate', 'evacuate_sick', 'rest',
  'lose_member', 'leave', 'riskWorsen',
]);
const VALID_STATUS_IDS = new Set(Object.keys(STATUS_EFFECTS));

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
    const optWhere = `${where} option ${i + 1}`;
    if (!option.label) errors.push(`${optWhere}: missing label`);

    for (const key of Object.keys(option)) {
      if (!VALID_OPTION_KEYS.has(key)) errors.push(`${optWhere}: unconsumed option key "${key}"`);
    }
    for (const key of Object.keys(option.effects || {})) {
      if (!VALID_EFFECT_KEYS.has(key)) errors.push(`${optWhere}: unconsumed effects key "${key}"`);
    }
    for (const key of Object.keys(option.failureEffects || {})) {
      if (!VALID_EFFECT_KEYS.has(key)) errors.push(`${optWhere}: unconsumed failureEffects key "${key}"`);
    }
    const crewEffect = option.crewEffect || {};
    for (const key of Object.keys(crewEffect)) {
      if (!VALID_CREW_EFFECT_KEYS.has(key)) errors.push(`${optWhere}: unconsumed crewEffect key "${key}"`);
    }
    for (const idKey of ['injury', 'illness']) {
      if (crewEffect[idKey] && !VALID_STATUS_IDS.has(crewEffect[idKey])) {
        errors.push(`${optWhere}: crewEffect.${idKey} "${crewEffect[idKey]}" is not a status effect id`);
      }
    }
    if (typeof option.chanceSuccess === 'number' && !option.failureOutcome) {
      errors.push(`${optWhere}: chanceSuccess without failureOutcome — half a gamble`);
    }
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
