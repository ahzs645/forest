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
import { optionSpendsDay } from '../events/timePolicy.js';
import { resolveTemptationSetAside } from '../events/selection.js';
import { applyDeferredSituation } from '../events/deferral.js';
import { applyEventEffects } from '../events/resolution.js';
import { applyConsequenceFlags } from '../events/consequences.js';
import { getDayRng } from '../events/dayRng.js';
import {
  addRouteConstraintFromEvent,
  isRouteObstructionEvent
} from './routeConstraints.js';

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
 * Scrutiny always — the file notices what you did not do — and, sized to the
 * situation, the people carrying the run and whatever an imposed situation
 * lands regardless (js/events/deferral.js). The deferral is logged as a
 * situation so the compliance tally counts it.
 *
 * @param {Object} ui
 * @param {Object} journey
 * @param {Object} event
 * @param {Object} [options]
 * @param {boolean} [options.imposedCost=true] - false when the mode carries
 *   the deferral forward itself (a recon obstruction stays on the route)
 */
export function applySetAsideCost(ui, journey, event, { imposedCost = true } = {}) {
  // A temptation is somebody else's proposal, not a situation the file will
  // notice you ignored. Setting it aside costs nothing on the meters; what it
  // costs is that the proposer decides what your silence meant (they drop it,
  // ask again with a deadline, or go around you). The exception is a thing
  // already done: silence about a go-around is condoning it, and that costs
  // the file (js/events/selection.js GO_AROUND_SILENCE_COST).
  if (event?.type === 'temptation') {
    const reply = resolveTemptationSetAside(journey, event, getDayRng(journey, `set-aside:${event.id || 'event'}`));
    ui.write('');
    ui.write(reply.message, 'term-dim');
    if (reply.effects || reply.flags) {
      const messages = [];
      if (reply.effects) applyEventEffects(journey, reply.effects, messages);
      if (reply.flags) applyConsequenceFlags(journey, reply.flags, messages);
      for (const message of messages) ui.writeWarning(message);
    }
    return;
  }

  const { messages } = applyDeferredSituation(journey, event, {
    weight: situationWeight(event),
    imposedCost,
  });
  ui.write('');
  for (const [index, message] of messages.entries()) {
    if (index === 0 || index === messages.length - 1) ui.writeWarning(message);
    else ui.write(message);
  }
}

/**
 * The button that closes a deferral. Without it the next card's redraw wiped
 * the cost line before anyone could read it.
 */
function setAsideAcknowledgement(journey) {
  const label = ['recon', 'field'].includes(journey.journeyType)
    ? 'Take the shift back'
    : journey.journeyType === 'manager'
      ? 'Back to the month'
      : 'Take the day back';
  return [{
    label,
    description: 'Leave it where it is and get on with your own work.',
    value: 'continue',
  }];
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
  ui.updateAllStatus?.(journey);
  frame.onRender?.();
  const obstruction = ['recon', 'field'].includes(journey.journeyType)
    && isRouteObstructionEvent(event);
  const travelSetbackBefore = Number(journey.travelSetback || 0);

  const goAround = event?.type === 'temptation' && event?.temptationStage === 'goaround';
  const outcome = await handleEvent(game, event, {
    ...frame,
    extraOptions: [{
      label: options.setAsideLabel || 'Set it aside',
      description: obstruction
        ? 'Defer the call. The route stays blocked until you clear it or mark a detour.'
        : goAround
          ? 'Say nothing. It stands, and the file will read your silence as consent.'
          : options.setAsideDescription
        || 'Not today. Take the day back and spend it on your own work.',
      tag: 'TRADEOFF',
      value: 'set_aside',
    }],
  });

  if (game.gameOver) {
    return { setAside: false, spendsDay: false, gameOver: true };
  }

  if (!outcome.resolved) {
    applySetAsideCost(ui, journey, event, { imposedCost: !obstruction });
    if (obstruction) {
      const constraint = addRouteConstraintFromEvent(journey, event);
      if (constraint) {
        ui.writeWarning(`${constraint.title} remains active between ${constraint.fromBlockName} and ${constraint.toBlockName}. Clear it or mark a detour before travelling that leg.`);
      }
    }
    journey.recentSituationContext = {
      day: journey.day,
      title: event?.title || 'the situation',
      setAside: true,
    };
    ui.updateAllStatus?.(journey);
    frame.onRender?.();
    // Keep the cost on screen until the player has read it; the quiet card
    // that follows clears the terminal.
    await ui.promptChoice('', setAsideAcknowledgement(journey));
    return { setAside: true, spendsDay: false, gameOver: false };
  }

  const spendsDay = optionSpendsDay(event, outcome.option, journey.journeyType);
  if (spendsDay && Number(journey.travelSetback || 0) > travelSetbackBefore) {
    const setbackDelta = Number(journey.travelSetback || 0) - travelSetbackBefore;
    journey.travelSetback = travelSetbackBefore;
    journey.pendingTravelSetback = Math.min(0.75, (journey.pendingTravelSetback || 0) + setbackDelta);
  }
  // A GM's month runs whatever lands on the desk; there is no day to lose.
  if (!spendsDay && journey.journeyType !== 'manager') {
    ui.write('Handled without losing the day.', 'term-dim');
  }
  journey.recentSituationContext = {
    day: journey.day,
    title: event?.title || 'the situation',
    setAside: false,
  };
  ui.updateAllStatus?.(journey);
  frame.onRender?.();
  return { setAside: false, spendsDay, gameOver: false };
}
