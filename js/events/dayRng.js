/**
 * The day's dice, rolled once and kept on the journey.
 *
 * Every deployment mode draws the day's situation and resolves it with
 * Math.random, and the run is saved at the day boundary. A reload therefore
 * replayed the morning with fresh dice: a different event, a different band
 * on the same choice, a different night at the district office. That is a
 * save-scum, and it also undid the day's consequences.
 *
 * The fix is a seed per day, drawn at the boundary before the save and
 * stored on the journey. Anything random the day does asks for a generator
 * from that seed, keyed by what it is for ("draw", "resolve:<event>",
 * "night"), so a reload at any point re-rolls the same dice in the same
 * order. Different choices still lead to different places; the same choice
 * always leads to the same one.
 *
 * A journey with no seed for the current day (a fixture, an older save, a
 * harness that owns Math.random) gets Math.random back, so tests that stub
 * it keep working.
 */

import { makeRng } from '../engine/rng.js';

const UINT32 = 0x100000000;

function hashLabel(label) {
  // FNV-1a over the label, so "draw" and "night" fork the seed apart.
  let hash = 0x811c9dc5;
  const text = String(label || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Give the current day a seed if it has none. Called at the day boundary
 * before the run is saved, so the seed is in the save the next day resumes
 * from. Idempotent for a day already seeded.
 * @param {Object} journey
 * @returns {{day: number, seed: number}|null}
 */
export function ensureDaySeed(journey) {
  if (!journey) return null;
  const day = Number(journey.day) || 1;
  const current = journey.daySeed;
  if (current && current.day === day && Number.isFinite(current.seed)) return current;
  journey.daySeed = { day, seed: Math.floor(Math.random() * UINT32) >>> 0 };
  return journey.daySeed;
}

/**
 * A generator for one of today's random needs. The same journey, day and
 * label always give the same sequence.
 * @param {Object} journey
 * @param {string} label - what the dice are for
 * @returns {Function} rng in [0, 1)
 */
export function getDayRng(journey, label = '') {
  const seed = journey?.daySeed;
  const day = Number(journey?.day) || 1;
  if (!seed || seed.day !== day || !Number.isFinite(seed.seed)) return Math.random;
  return makeRng(((seed.seed >>> 0) ^ hashLabel(label)) >>> 0);
}
