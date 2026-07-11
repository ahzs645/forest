/**
 * Field Radio Module
 * The sidebar's animated art pane — the main game's counterpart to the
 * seasonal TUI's FieldRadio. Idles on an ambient scene picked from the
 * journey (weather in the field, the role's desk otherwise) and cuts to a
 * short action animation (chainsaw, drone, boots...) when the player picks
 * a matching option, then falls back to ambient.
 *
 * All decks come from the existing library: js/animations/* and
 * js/ascii_art.js. Honors prefers-reduced-motion with a still frame.
 */

import * as Anim from '../animations/index.js';
import { ASCII_ART, ANIMATIONS } from '../ascii_art.js';

const AMBIENT_DELAY = 400;

function still(art) {
  return art ? [art] : null;
}

/** Weather / season ambience for field journeys. */
function weatherDeck(weatherName = '') {
  const w = weatherName.toLowerCase();
  if (/rain|storm|drizzle|wet/.test(w)) return { frames: still(ASCII_ART.rain), delay: AMBIENT_DELAY };
  if (/snow|blizzard|frost|freez/.test(w)) return { frames: still(ASCII_ART.snow), delay: AMBIENT_DELAY };
  if (/fog|mist|overcast|cloud/.test(w)) return { frames: Anim.riverAnimation, delay: 500 };
  if (/wind/.test(w)) return { frames: Anim.eagleAnimation, delay: 450 };
  return { frames: Anim.sunrisesetAnimation, delay: 600 };
}

/** Desk ambience per journey type. */
const DESK_DECKS = {
  planning: () => ({ frames: Anim.mapAnimation, delay: 500 }),
  permitting: () => ({ frames: Anim.walkieTalkieAnimation, delay: 450 }),
  silviculture: () => ({ frames: Anim.treePlantingAnimation, delay: 450 }),
  manager: () => ({ frames: Anim.compassAnimation, delay: 500 })
};

/** Option label → a short action animation. */
function actionDeck(label = '') {
  const l = label.toLowerCase();
  if (/chainsaw|maintenance|repair/.test(l)) return { frames: Anim.chainsawAnimation, delay: 200 };
  if (/harvest|fell|cut/.test(l)) return { frames: ANIMATIONS.treeFalling, delay: 200 };
  if (/haul|truck|transport|resupply/.test(l)) return { frames: ANIMATIONS.truckDriving, delay: 200 };
  if (/helicopter|heli|fly/.test(l)) return { frames: Anim.helicopterAnimation, delay: 200 };
  if (/plant|seedling/.test(l)) return { frames: Anim.treePlantingAnimation, delay: 250 };
  if (/drone|survey|sweep/.test(l)) return { frames: Anim.droneAnimation, delay: 200 };
  if (/radio|call|referral|outreach|meeting|stakeholder|network/.test(l)) return { frames: Anim.walkieTalkieAnimation, delay: 250 };
  if (/map|plot|plan|consult/.test(l)) return { frames: Anim.mapAnimation, delay: 300 };
  if (/compass|navigate|scout/.test(l)) return { frames: Anim.compassAnimation, delay: 250 };
  if (/recon|traverse|walk|hike|ground-truth|detour|mainline|shortcut/.test(l)) return { frames: Anim.bootAnimation, delay: 250 };
  if (/forage|hunt/.test(l)) return { frames: Anim.mooseAnimation, delay: 300 };
  if (/camp|rest|end shift|end day|break/.test(l)) return { frames: still(ASCII_ART.campfire), delay: 400 };
  if (/river|water|crossing/.test(l)) return { frames: Anim.riverAnimation, delay: 250 };
  if (/fire|burn/.test(l)) return { frames: Anim.wildfireAnimation, delay: 200 };
  return null;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const RadioMixin = {
  /**
   * Pick the ambient scene from journey state. Called on every
   * updateAllStatus, so the radio follows weather and mode changes.
   */
  updateRadioFromJourney(journey) {
    if (!this.radioPanel || !journey) return;
    const deck = (journey.journeyType === 'field' || journey.journeyType === 'recon')
      ? weatherDeck(journey.weather?.name)
      : (DESK_DECKS[journey.journeyType]?.() || weatherDeck(''));
    this._radioAmbient = deck;
    if (!this._radioActionUntil || Date.now() >= this._radioActionUntil) {
      this._radioPlay(deck);
    }
  },

  /**
   * Cut to a short action animation for a chosen option, then resume the
   * ambient scene. No-op when the label matches nothing.
   */
  playRadioAction(label) {
    if (!this.radioPanel) return;
    const deck = actionDeck(label);
    if (!deck?.frames?.length) return;
    const runMs = Math.max(1600, deck.frames.length * deck.delay * 3);
    this._radioActionUntil = Date.now() + runMs;
    this._radioPlay(deck);
    clearTimeout(this._radioResumeTimer);
    this._radioResumeTimer = setTimeout(() => {
      this._radioActionUntil = 0;
      if (this._radioAmbient) this._radioPlay(this._radioAmbient);
    }, runMs);
  },

  stopRadio() {
    clearInterval(this._radioTimer);
    clearTimeout(this._radioResumeTimer);
    this._radioTimer = null;
    this._radioActionUntil = 0;
    if (this.radioSection) this.radioSection.hidden = true;
  },

  /** @private */
  _radioPlay(deck) {
    if (!this.radioPanel || !deck?.frames?.length) return;
    if (this.radioSection) this.radioSection.hidden = false;

    clearInterval(this._radioTimer);
    this._radioTimer = null;

    let index = 0;
    this.radioPanel.textContent = deck.frames[0];
    if (deck.frames.length < 2 || prefersReducedMotion()) return;

    this._radioTimer = setInterval(() => {
      index = (index + 1) % deck.frames.length;
      this.radioPanel.textContent = deck.frames[index];
    }, deck.delay);
  }
};
