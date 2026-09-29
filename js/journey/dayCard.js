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
  // OFF-BOOK marks the options that break a rule on a shortcut card.
  if (!['SAFE', 'RISKY', 'TRADEOFF', 'OFF-BOOK'].includes(upper)) return '';
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

/** Width of the closing rule under a marked card; fits a phone's log. */
const MARKER_RULE_WIDTH = 24;

/**
 * "== SHORTCUT · PHONE CALL ==" and, with no text, its closing rule. Plain
 * characters, no icon, so Classic, Modern, Grid and a screen reader all get
 * the same words.
 * @param {string} text
 * @returns {string}
 */
export function frameMarker(text) {
  return text ? `== ${text} ==` : '='.repeat(MARKER_RULE_WIDTH);
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
 * @param {string} [card.marker] - framed line above the label for a card that
 *   is a legal or ethical call ("SHORTCUT · OFF THE BOOKS")
 * @param {string[]} [card.stakes] - what each outcome costs, under the body
 * @param {string} [card.label] - small dim line above the title ("RADIO CHECK")
 * @param {string} card.title
 * @param {string} [card.body]
 * @param {string} [card.whyNow] - why this is landing today
 * @param {string[]} [card.context] - free background, behind "More context"
 * @param {string[]} [card.notes] - why an option is missing (it costs more
 *   cash than the crew has), shown under the body
 * @param {string} [card.prompt] - the decision prompt
 * @param {Array} card.options - [{ label, description, tag, value, disabled }]
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

    // A card that is a legal or ethical call says so before anything else,
    // framed in plain characters so it reads the same in every renderer and
    // theme. The frame is also the scroll anchor: the log opens on who is
    // asking, not on the tail of the pitch.
    // The marker and the label share one line, so a phone-height log still
    // shows who is asking under it.
    if (card.marker) ui.write(frameMarker([card.marker, card.label].filter(Boolean).join(' · ')), 'term-shortcut term-anchor');
    else if (card.label) ui.write(card.label, 'term-dim');
    if (card.title) ui.writeHeader(card.title);
    if (card.body) ui.write(card.body);
    const stakes = (card.stakes || []).filter(Boolean);
    for (const line of stakes) ui.write(line, 'term-stakes');
    if (card.marker) ui.write(frameMarker(''), 'term-shortcut');
    if (card.whyNow) {
      ui.write('');
      ui.write(`Why now: ${card.whyNow}`, 'term-dim');
    }
    const notes = (card.notes || []).filter(Boolean);
    if (notes.length) {
      ui.write('');
      for (const note of notes) ui.write(note, 'term-dim');
    }

    if (showContext && context.length) {
      ui.writeDivider?.('CONTEXT');
      for (const line of context) ui.write(line, 'term-dim');
    }
    ui.write('');

    // A disabled option stays on the card with its reason in the
    // description; the renderer shows it but will not take it.
    const choices = options.map((option) => ({
      label: `${option.label}${formatRiskTag(option.tag)}`,
      description: option.description || '',
      value: option.value,
      ...(option.disabled ? { disabled: true } : {}),
    }));
    if (context.length && !showContext) {
      choices.push({
        label: 'More context',
        description: 'Background on this decision (free)',
        value: DAY_CARD_CONTEXT,
      });
    }

    const picked = await ui.promptChoice(card.prompt || 'What do you do?', choices);
    // The anchor holds the card in view only while it is being decided; the
    // outcome that follows scrolls in as usual.
    ui.releaseScrollAnchor?.();
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
  // A temptation is not a radio call: field roles hear it at the tailgate,
  // desk roles read it or take the phone. The selection lane sets the label,
  // the marker that frames it as a shortcut, and the stakes under the pitch.
  return {
    marker: event.cardMarker || null,
    label: event.cardLabel || (event.reporter ? 'RADIO CHECK' : 'ON THE RADIO'),
    title: formatted.title,
    body: formatted.description,
    stakes: Array.isArray(event.stakes) ? event.stakes : [],
    whyNow: event.whyNow || null,
    prompt: 'What do you do?',
    options: usable.map(({ opt, index }) => ({
      label: opt.label,
      description: opt.hint || '',
      // Graded from the option's own downside by formatEventForDisplay. Without
      // this the chip renderer above had no input on event cards, so the only
      // tagged option a player ever saw was the one that declines to play.
      tag: opt.tag,
      value: index,
    })),
  };
}
