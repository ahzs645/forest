/**
 * The day's situation, shared by every deployment mode.
 *
 * Recon proved the shape (docs/day_as_situation.md): the authored event opens
 * the day, the player answers it or sets it aside, and setting it aside hands
 * the shift back at a cost. This module is that logic with the recon-specific
 * parts lifted out, so planning, permitting, silviculture and manager play by
 * the same rules instead of each inventing its own relationship to events.
 *
 * The two rules that matter:
 *
 *   1. Declining is always available, and always costs something. If it were
 *      free it would be the only choice anyone made; if it were unavailable
 *      the day's work could never get done on a high event rate.
 *   2. Answering only costs the day when the thing was actually a day's work.
 *      Minor and positive situations are dealt with and the shift carries on.
 */

import { handleEvent } from '../modes/shared/handleEvent.js';

/**
 * Whether answering this situation is the whole day.
 *
 * Severities across the authored decks are minor / moderate / severe /
 * positive (js/data/fieldEvents.js, js/data/deskEvents.js). Only the middle
 * two are a day's work; the rest are dealt with and the day carries on.
 * @param {Object} event
 * @returns {boolean}
 */
export function situationCostsTheDay(event) {
  const severity = String(event?.severity || 'minor').toLowerCase();
  return severity === 'moderate' || severity === 'severe' || severity === 'critical';
}

/**
 * How much walking away from this one hurts.
 * @param {Object} event
 * @returns {number} 1-3
 */
export function situationWeight(event) {
  const severity = String(event?.severity || 'minor').toLowerCase();
  if (severity === 'severe' || severity === 'critical') return 3;
  if (severity === 'moderate') return 2;
  return 1;
}

/**
 * Charge the player for a situation they declined to handle.
 *
 * Scrutiny always — the file notices what you did not do. The human cost lands
 * on whoever is actually carrying the run: a field crew's morale, or a desk
 * protagonist's stress. Only for things that mattered, though: a player
 * triaging well declines a dozen-plus situations in a season, and charging for
 * every deferred phone call turns judgement into an attrition spiral.
 *
 * @param {Object} ui
 * @param {Object} journey
 * @param {Object} event
 */
export function applySetAsideCost(ui, journey, event) {
  const weight = situationWeight(event);
  journey.scrutiny = Math.min(100, (journey.scrutiny || 0) + weight);

  const humanCost = weight >= 2 ? weight : 0;
  if (humanCost > 0) {
    const crew = Array.isArray(journey.crew) ? journey.crew.filter((m) => m.isActive) : [];
    if (crew.length > 0) {
      for (const member of crew) {
        member.morale = Math.max(0, member.morale - humanCost);
      }
    } else if (journey.protagonist) {
      journey.protagonist.stress = Math.min(100, (journey.protagonist.stress || 0) + humanCost);
    }
  }

  ui.write('');
  ui.writeWarning(humanCost > 0
    ? `You leave it. Scrutiny +${weight}, and it costs you something to do it.`
    : `You leave it for another day. Scrutiny +${weight}.`);
}

/**
 * Run the day's situation.
 *
 * @param {Object} game - { ui, journey }
 * @param {Object} event
 * @param {Object} [options]
 * @param {Object} [options.frame] - dayHeader/statusLine/context for the card
 * @param {string} [options.setAsideLabel]
 * @param {string} [options.setAsideDescription]
 * @returns {Promise<{setAside: boolean, spendsDay: boolean, gameOver: boolean}>}
 */
export async function runDaySituation(game, event, options = {}) {
  const { ui, journey } = game;
  const frame = options.frame || {};

  const outcome = await handleEvent(game, event, {
    ...frame,
    extraOptions: [{
      label: options.setAsideLabel || 'Set it aside',
      description: options.setAsideDescription
        || 'Not today. Take the day back and spend it on your own work.',
      tag: 'TRADEOFF',
      value: 'set_aside',
    }],
  });

  if (game.gameOver) {
    return { setAside: false, spendsDay: false, gameOver: true };
  }

  if (!outcome.resolved) {
    applySetAsideCost(ui, journey, event);
    return { setAside: true, spendsDay: false, gameOver: false };
  }

  const spendsDay = situationCostsTheDay(event);
  if (!spendsDay) {
    ui.write('Handled without losing the day.', 'term-dim');
  }
  return { setAside: false, spendsDay, gameOver: false };
}
