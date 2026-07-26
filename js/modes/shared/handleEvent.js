/**
 * Shared Event Handler
 * One presentation/decision/resolution path for events across all journey
 * modes (previously five near-identical copies). Crew role gating applies
 * only when the journey actually has a crew.
 *
 * Events render through the shared day card (js/journey/dayCard.js) so an
 * authored situation reads as the day itself rather than as an interruption
 * to a chore the player already picked. See docs/day_as_situation.md.
 */

import { formatEventForDisplay, resolveEvent } from '../../events.js';
import { crewHasRole } from '../../crew.js';
import { presentDayCard, buildEventCardContent } from '../../journey/dayCard.js';

function formatRoleName(roleId) {
  if (!roleId) return 'specialist';
  const formatted = roleId.replace(/[_-]+/g, ' ').trim();
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/**
 * Present an event, gather the player's decision, and resolve it.
 * @param {Object} game - ForestryTrailGame instance ({ ui, journey, gameOver })
 * @param {Object} event - Event definition
 * @param {Object} [frame] - Day framing from the calling mode
 * @param {string} [frame.dayHeader] - "SHIFT 6 - HIGHWAY CAMP"
 * @param {string} [frame.statusLine] - the day's drumbeat line
 * @param {string[]} [frame.context] - free background behind "More context"
 * @param {Array} [frame.extraOptions] - mode-supplied ways out of the situation
 *   that are not authored event options (recon's "leave it and keep moving").
 *   Their values must not be numbers, which is how they are told apart from
 *   the authored options' indices.
 * @returns {Promise<{resolved: boolean, choice?: *}>} `resolved: false` means
 *   the player took one of `extraOptions` and the caller owns what happens.
 */
export async function handleEvent(game, event, frame = {}) {
  const { ui, journey } = game;
  const formatted = formatEventForDisplay(event, journey.journeyType);

  const hasCrew = Array.isArray(journey.crew) && journey.crew.length > 0;

  // A role-gated option the crew cannot fulfill is a dead end, not a choice —
  // presenting it only to reject the selection traps the player on the prompt.
  // Hide those so every offered option is actually actionable.
  const isUnavailable = (raw) =>
    hasCrew && raw?.requiresRole && !crewHasRole(journey.crew, raw.requiresRole);

  const entries = formatted.options.map((opt, index) => ({
    opt,
    raw: event.options[index] || {},
    index
  }));
  const actionable = entries.filter(({ raw }) => !isUnavailable(raw));
  // Defensive: no event ships with every option gated, but never leave the
  // player with zero choices if one somehow did.
  const usable = actionable.length ? actionable : entries;

  const content = buildEventCardContent(formatted, event, usable);
  const card = {
    ...content,
    options: [...content.options, ...(frame.extraOptions || [])],
    dayHeader: frame.dayHeader || null,
    statusLine: frame.statusLine || null,
    context: frame.context || [],
    onRender: () => {
      if (typeof ui.playEventVignette === 'function') ui.playEventVignette(event);
    },
  };

  const picked = await presentDayCard(ui, card);

  // Authored options resolve here; anything else is a mode-supplied way out
  // and belongs to the caller, unresolved and with whatever that costs.
  if (typeof picked !== 'number') {
    return { resolved: false, choice: picked };
  }

  const optionIndex = picked;
  const selectedOption = event.options[optionIndex] || event.options[usable[0].index];

  const result = resolveEvent(journey, event, selectedOption);
  game.checkpoint?.();

  ui.write('');
  ui.writeHeader('OUTCOME');
  for (const msg of result.messages) {
    ui.write(msg);
  }

  if (selectedOption.gameOver) {
    game.gameOver = true;
    journey.endReason = selectedOption.gameOverReason || 'Event outcome';
  }

  // Keep the result on screen until the player explicitly acknowledges it.
  // Otherwise end-of-shift effects or another event can immediately displace
  // the very consequence that makes this decision meaningful.
  await ui.promptChoice('', [{
    label: 'Acknowledge outcome and continue',
    description: 'Return to the shift after reviewing the result',
    value: 'continue'
  }]);

  return { resolved: true };
}
