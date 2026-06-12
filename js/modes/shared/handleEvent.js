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

  const options = formatted.options.map((opt, index) => {
    const raw = event.options[index] || {};
    const requirement = hasCrew && raw.requiresRole ? `Requires ${formatRoleName(raw.requiresRole)}` : '';
    const pieces = [];
    if (opt.hint) pieces.push(opt.hint);
    if (requirement) pieces.push(requirement);
    return {
      label: opt.label,
      description: pieces.length ? `[${pieces.join(' | ')}]` : '',
      value: index
    };
  });

  let selectedOption = null;
  while (!selectedOption) {
    const choice = await ui.promptChoice('What do you do?', options);
    const optionIndex = typeof choice.value === 'number' ? choice.value : 0;
    const candidate = event.options[optionIndex];
    if (hasCrew && candidate?.requiresRole && !crewHasRole(journey.crew, candidate.requiresRole)) {
      ui.writeWarning(`You need a ${formatRoleName(candidate.requiresRole)} to do that.`);
      continue;
    }
    selectedOption = candidate;
  }

  const result = resolveEvent(journey, event, selectedOption);

  ui.write('');
  for (const msg of result.messages) {
    ui.write(msg);
  }

  if (selectedOption.gameOver) {
    game.gameOver = true;
    journey.endReason = selectedOption.gameOverReason || 'Event outcome';
  }
}
