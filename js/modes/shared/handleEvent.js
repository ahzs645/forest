/**
 * Shared Event Handler
 * One presentation/decision/resolution path for events across all journey
 * modes (previously five near-identical copies). Crew role gating applies
 * only when the journey actually has a crew.
 */

import { formatEventForDisplay, resolveEvent } from '../../events.js';
import { crewHasRole } from '../../crew.js';

function formatRoleName(roleId) {
  if (!roleId) return 'specialist';
  const formatted = roleId.replace(/[_-]+/g, ' ').trim();
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/**
 * Present an event, gather the player's decision, and resolve it.
 * @param {Object} game - ForestryTrailGame instance ({ ui, journey, gameOver })
 * @param {Object} event - Event definition
 */
export async function handleEvent(game, event) {
  const { ui, journey } = game;
  const formatted = formatEventForDisplay(event, journey.journeyType);

  ui.write('');
  const headerLabel = event.reporter ? 'RADIO CHECK' : 'EVENT';
  ui.writeHeader(`${headerLabel}: ${formatted.title}`);
  if (typeof ui.playEventVignette === 'function') {
    ui.playEventVignette(event);
  }
  ui.write(formatted.description);
  ui.write('');

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

  const options = usable.map(({ opt, raw, index }) => {
    const pieces = [];
    if (opt.hint) pieces.push(opt.hint);
    if (isUnavailable(raw)) pieces.push(`Requires ${formatRoleName(raw.requiresRole)}`);
    return {
      label: opt.label,
      description: pieces.length ? `[${pieces.join(' | ')}]` : '',
      value: index
    };
  });

  const choice = await ui.promptChoice('What do you do?', options);
  const optionIndex = typeof choice.value === 'number' ? choice.value : usable[0].index;
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
}
