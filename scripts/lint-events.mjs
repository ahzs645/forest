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

// ── Decision-integrity checks ────────────────────────────────────────────────
// Guards against the content-generation failure modes found in the 2026-07
// audit: options that strictly dominate their siblings (no decision left),
// and labels that promise a downside the effects don't deliver
// (e.g. "Delay consultations (risk deteriorating relationships)" granting
// +30 relationships).

// Effect axes where higher is WORSE; everything else in VALID_EFFECT_KEYS is
// higher-is-better (budget is signed dollars).
const COST_EFFECT_KEYS = new Set(['timeUsed', 'scrutiny']);

// Options with any of these carry a downside or randomness the effect vector
// can't see, so dominance comparison against them is meaningless.
function hasHiddenDownside(option) {
  return Boolean(
    option.riskInjury || option.riskCompliance || option.riskRejection
    || option.crewEffect || option.schedulesEvent || option.gameOver
    || (typeof option.chanceSuccess === 'number' && option.chanceSuccess < 1),
  );
}

function effectVector(option) {
  const vec = {};
  for (const [key, value] of Object.entries(option.effects || {})) {
    if (typeof value !== 'number') continue;
    vec[key] = COST_EFFECT_KEYS.has(key) ? -value : value;
  }
  // timeUsed may also appear at the option level.
  if (typeof option.timeUsed === 'number') {
    vec.timeUsed = (vec.timeUsed || 0) - option.timeUsed;
  }
  return vec;
}

function dominates(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let strictlyBetter = false;
  for (const key of keys) {
    const av = a[key] || 0;
    const bv = b[key] || 0;
    if (av < bv) return false;
    if (av > bv) strictlyBetter = true;
  }
  return strictlyBetter;
}

for (const { pool, event } of ALL) {
  const options = event.options || [];
  if (options.length < 2) continue;
  if (options.some(hasHiddenDownside)) continue;
  const vectors = options.map(effectVector);
  for (let i = 0; i < options.length; i += 1) {
    const beatsAll = vectors.every((other, j) => j === i || dominates(vectors[i], other));
    if (beatsAll) {
      errors.push(
        `${pool}:${event.id} option ${i + 1} ("${options[i].label}") strictly dominates every`
        + ` alternative — the event is no longer a decision`,
      );
    }
  }
}

// Label ↔ effect contradictions.
const NET_REWARD = (option) => Object.values(effectVector(option))
  .reduce((sum, value) => sum + (Math.abs(value) >= 100 ? value / 1000 : value), 0);

for (const { pool, event } of ALL) {
  const options = event.options || [];
  if (!options.length) continue;
  const rewards = options.map(NET_REWARD);
  const maxReward = Math.max(...rewards);

  for (const [i, option] of options.entries()) {
    const text = `${option.label || ''} ${option.outcome || ''}`;
    const where = `${pool}:${event.id} option ${i + 1} ("${option.label}")`;

    // An explicitly illegal/corrupt option must never be the best deal on the
    // table, and must touch at least one professional-consequence axis.
    if (/\bILLEGAL\b|\bbribe\b/i.test(text)) {
      const fx = option.effects || {};
      if (options.length > 1 && rewards[i] >= maxReward) {
        errors.push(`${where}: illegal option has the best net effects in the event`);
      }
      if (!(fx.compliance < 0 || fx.scrutiny > 0 || fx.politicalCapital < 0)) {
        errors.push(`${where}: illegal option carries no compliance/scrutiny/political fallout`);
      }
    }

    // "…risk deteriorating relationships" style labels: the named metric must
    // not be rewarded.
    const threat = option.label && option.label.match(
      /(?:risk\w*|deteriorat\w*|worsen\w*|damag\w*|strain\w*|erod\w*)[^.]*?\b(relationship|reputation|trust|compliance|morale)/i,
    );
    if (threat) {
      const metricKey = { relationship: 'relationships', reputation: 'reputation', trust: 'relationships', compliance: 'compliance', morale: 'crew_morale' }[threat[1].toLowerCase()];
      if (metricKey && (option.effects?.[metricKey] || 0) > 0) {
        errors.push(`${where}: label warns about ${metricKey} but effects reward it (+${option.effects[metricKey]})`);
      }
    }

    // relationships and reputation both feed stakeholder standing (see
    // js/events/resolution.js), so stacked swings compound.
    const rel = Math.abs(option.effects?.relationships || 0);
    const rep = Math.abs(option.effects?.reputation || 0);
    if (rel && rep && rel + rep > 40) {
      errors.push(`${where}: relationships+reputation stack to ${rel + rep} (>40) — they compound on the same meter`);
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
