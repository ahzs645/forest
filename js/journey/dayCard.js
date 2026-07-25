/**
 * The day card.
 *
 * A day is a situation you respond to, not a chore you pick off a list.
 *
 * The deployment modes used to open the day with a menu of verbs — ground-truth,
 * sweep, write up, four paces, a submenu — and fire an authored event *on top*
 * of whatever you picked, on the half of days that rolled one. That put roughly
 * five hundred authored situations behind a chore list and served about eleven
 * of them per run. See docs/day_as_situation.md.
 *
 * So the card comes first. Every day opens with something happening — a radio
 * call, a road that has changed, a contractor who wants an answer — and the
 * options are how you handle it. The old chore verbs did not disappear; they
 * became the answers. "Ground-truth the access" is no longer a thing you pick
 * out of nowhere, it is what you say to the dispatcher who wants to move a
 * lowbed in the morning.
 *
 * The shape is deliberately the one `promptSeasonalCard` already uses in
 * js/game/seasonalAdapter.js, because the seasonal mode has been playing this
 * way all along and there is no reason for the deployments to speak a second
 * dialect.
 */

/**
 * How many of the day's standing facts fit on a phone before the card body
 * gets squeezed. The status line is the drumbeat — where, what the weather is
 * doing, how much season is left — and it earns its row, but only one.
 */
const STATUS_SEGMENT_SEPARATOR = ' · ';

/**
 * Risk chips, matched to the seasonal card's vocabulary so a player moving
 * between modes reads the same tags.
 * @param {string} [tag]
 */
function formatRiskTag(tag) {
  if (!tag) return '';
  const upper = String(tag).toUpperCase();
  if (!['SAFE', 'RISKY', 'TRADEOFF'].includes(upper)) return '';
  return ` [${upper}]`;
}

/**
 * Build the one-line status drumbeat that sits under the card's day header.
 * @param {Array<string|null|undefined>} segments
 * @returns {string}
 */
export function formatStatusLine(segments = []) {
  return segments.filter(Boolean).join(STATUS_SEGMENT_SEPARATOR);
}

/** Sentinel for the free context re-render; never returned to a caller. */
export const DAY_CARD_CONTEXT = Symbol('day-card-context');

/**
 * Present a day card and resolve the player's choice.
 *
 * Handles the free "More context" loop internally: reading the background on a
 * decision is not how a day gets spent, so it never touches the day's action
 * budget and simply re-renders the card with the context section open.
 *
 * @param {Object} ui - TerminalUI (needs clear/write/writeHeader/promptChoice)
 * @param {Object} card
 * @param {string} [card.dayHeader] - "SHIFT 6 - HIGHWAY CAMP"
 * @param {string} [card.statusLine] - the drumbeat: distance, weather, days left
 * @param {string} [card.label] - small dim line above the title ("RADIO CHECK")
 * @param {string} card.title
 * @param {string} [card.body]
 * @param {string} [card.whyNow] - why this is landing today
 * @param {string[]} [card.context] - free background, behind "More context"
 * @param {string} [card.prompt] - the decision prompt
 * @param {Array} card.options - [{ label, description, tag, value }]
 * @param {Function} [card.onRender] - called before each render (scenes, panes)
 * @returns {Promise<*>} the chosen option's `value`
 */
export async function presentDayCard(ui, card = {}) {
  const options = Array.isArray(card.options) ? card.options.filter(Boolean) : [];
  if (options.length === 0) {
    throw new Error('presentDayCard: a day card needs at least one option');
  }

  const context = (card.context || []).filter(Boolean);
  let showContext = false;

  for (;;) {
    ui.clear?.();
    await card.onRender?.();

    if (card.dayHeader) ui.writeHeader(card.dayHeader);
    if (card.statusLine) ui.write(card.statusLine, 'term-dim');
    if (card.dayHeader || card.statusLine) ui.write('');

    if (card.label) ui.write(card.label, 'term-dim');
    if (card.title) ui.writeHeader(card.title);
    if (card.body) ui.write(card.body);
    if (card.whyNow) {
      ui.write('');
      ui.write(`Why now: ${card.whyNow}`, 'term-dim');
    }

    if (showContext && context.length) {
      ui.writeDivider?.('CONTEXT');
      for (const line of context) ui.write(line, 'term-dim');
    }
    ui.write('');

    const choices = options.map((option) => ({
      label: `${option.label}${formatRiskTag(option.tag)}`,
      description: option.description || '',
      value: option.value,
    }));
    if (context.length && !showContext) {
      choices.push({
        label: 'More context',
        description: 'Background on this decision (free)',
        value: DAY_CARD_CONTEXT,
      });
    }

    const picked = await ui.promptChoice(card.prompt || 'What do you do?', choices);
    if (picked.value === DAY_CARD_CONTEXT) {
      showContext = true;
      continue;
    }
    return picked.value;
  }
}

/**
 * Turn an authored event into the day's card.
 *
 * Events already carry everything a card needs — a title, a description, and
 * options with effect previews from `formatEventForDisplay`. What they lacked
 * was standing: they were an interruption to a chore the player had already
 * chosen. Here the event *is* the day.
 *
 * @param {Object} formatted - result of formatEventForDisplay(event, type)
 * @param {Object} event - the raw event (for reporter/whyNow/option gating)
 * @param {Array} usable - [{ opt, raw, index }] options that survived gating
 * @returns {Object} partial card: label/title/body/whyNow/prompt/options
 */
export function buildEventCardContent(formatted, event, usable) {
  return {
    label: event.reporter ? 'RADIO CHECK' : 'ON THE RADIO',
    title: formatted.title,
    body: formatted.description,
    whyNow: event.whyNow || null,
    prompt: 'What do you do?',
    options: usable.map(({ opt, index }) => ({
      label: opt.label,
      description: opt.hint || '',
      value: index,
    })),
  };
}
