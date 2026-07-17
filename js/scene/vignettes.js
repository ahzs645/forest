/**
 * Event Vignettes
 * Matches an event to a frame deck from the art library so events render as
 * small animated illustrations instead of plain text. Pure module — the
 * terminal mixin owns playback.
 */

import { ASCII_ART, ANIMATIONS } from '../ascii_art.js';
import * as Anim from '../animations/index.js';
import { buildFireFrames } from './textmode/effects.js';

function deck(frames, delay) {
  if (!frames?.length) return null;
  return { frames, delay };
}

const KEYWORD_DECKS = [
  [/bear|grizzly/, () => deck(ASCII_ART.bear, 600)],
  [/moose|caribou|elk|deer/, () => deck(Anim.mooseAnimation, 500)],
  [/wolf|tracks|wildlife|nesting|raptor|eagle|bird/, () => deck(Anim.eagleAnimation, 400)],
  // Live cellular fire (ascii-anim port) rather than a hand-drawn loop.
  [/fire|burn|smoke/, () => deck(buildFireFrames({ cols: 44, rows: 9, frames: 18, seed: 11 }), 120)],
  [/storm|rain|wet|flood/, () => deck(ASCII_ART.rain, 300)],
  [/snow|cold|freez|winter|ice/, () => deck(ASCII_ART.snow, 400)],
  [/helicopter|airlift|medevac/, () => deck(Anim.helicopterAnimation, 200)],
  [/drone|flyover|aerial/, () => deck(Anim.droneAnimation, 200)],
  [/radio|call|phone|dispatch/, () => deck(Anim.walkieTalkieAnimation, 300)],
  [/chainsaw|saw|fall|cut|bucking/, () => deck(Anim.chainsawAnimation, 200)],
  [/plant|seedling|regen/, () => deck(Anim.treePlantingAnimation, 300)],
  [/river|creek|crossing|water|spring/, () => deck(Anim.riverAnimation, 350)],
  [/map|survey|boundary|marker/, () => deck(Anim.mapAnimation, 400)],
  [/compass|navigat|lost/, () => deck(Anim.compassAnimation, 300)],
  [/camp|tent|night|dark/, () => deck(Anim.tentAnimation, 400)],
  [/truck|haul|road|tire|engine|stuck/, () => deck(ANIMATIONS.truckDriving, 200)],
  [/hike|walk|traverse|boot/, () => deck(Anim.bootAnimation, 300)],
  [/grove|cedar|old-growth|tree/, () => deck(ASCII_ART.tree, 600)],
  [/morning|dawn|sunset|sunrise|fog/, () => deck(Anim.sunrisesetAnimation, 400)],
];

const TYPE_FALLBACKS = {
  wildlife: () => deck(ASCII_ART.bear, 600),
  weather: () => deck(ASCII_ART.rain, 300),
  terrain: () => deck(Anim.bootAnimation, 300),
  equipment: () => deck(ANIMATIONS.truckDriving, 200),
  supply: () => deck(ANIMATIONS.truckDriving, 250),
  morale: () => deck(ASCII_ART.campfire, 350),
  discovery: () => deck(Anim.compassAnimation, 300),
};

/**
 * Find a frame deck for an event, or null when nothing matches.
 * @param {Object} event - Event definition ({ id, title, description, type })
 * @returns {{frames: string[], delay: number}|null}
 */
export function matchEventVignette(event) {
  if (!event) return null;
  const haystack = `${event.id || ''} ${event.title || ''} ${event.description || ''}`.toLowerCase();
  for (const [pattern, make] of KEYWORD_DECKS) {
    if (pattern.test(haystack)) return make();
  }
  const fallback = TYPE_FALLBACKS[event.type];
  return fallback ? fallback() : null;
}
