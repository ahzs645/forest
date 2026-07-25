/**
 * One action a day.
 *
 * Deployments used to run an hour budget: a shift opened with 8-10 hours and
 * the player spent it two and three hours at a time, three or four actions
 * deep, before the calendar rolled over. Against a season that reads wrong.
 * A season is not a stack of micromanaged shifts — it is a run of days where
 * you get one good swing at the work and then live with the weather, the
 * radio call, and whatever the day brings.
 *
 * So a day is one substantive action plus whatever finds you. Reference
 * lookups — the area map, the briefing, the file you already wrote — stay
 * free, because reading your own notes is not how a day gets spent.
 *
 * Modes drive this through three calls: `startDay` when the day opens,
 * `spendDay` when a substantive action resolves, and `dayIsSpent` to close
 * the loop. Free lookups simply never call `spendDay`.
 */

/** Substantive actions available per day. */
export const ACTIONS_PER_DAY = 1;

/**
 * How many free look-ups a day tolerates before it closes itself.
 *
 * A day loop runs until its action is spent, and free choices — the map, the
 * briefing, a blocked action that only prints why it is blocked — deliberately
 * leave it unspent. Without a ceiling, a menu where every reachable option is
 * free spins forever. Twelve is far past any real use of the reference
 * material, so hitting it means the day has nothing left to offer.
 */
export const FREE_LOOKUPS_PER_DAY = 12;

/**
 * Open a fresh day's action budget. Idempotent for a day already in progress
 * so a restored checkpoint does not hand back an action the player has spent.
 * @param {Object} journey
 * @param {Object} [options]
 * @param {boolean} [options.resuming] - restoring a checkpoint mid-day
 */
export function startDay(journey, { resuming = false } = {}) {
  if (!journey) return;
  if (resuming && Number.isFinite(journey.actionsRemaining)) return;
  journey.actionsRemaining = ACTIONS_PER_DAY;
}

/**
 * Spend the day on the action just taken.
 * @param {Object} journey
 */
export function spendDay(journey) {
  if (!journey) return;
  const remaining = Number.isFinite(journey.actionsRemaining)
    ? journey.actionsRemaining
    : ACTIONS_PER_DAY;
  journey.actionsRemaining = Math.max(0, remaining - 1);
}

/**
 * Whether the day's action has been used. Days that a forced beat consumed
 * (a storm, a crisis, an exhaustion day) call `spendDay` too, so this is the
 * single question every mode's day loop asks.
 * @param {Object} journey
 * @returns {boolean}
 */
export function dayIsSpent(journey) {
  if (!journey) return true;
  const remaining = Number.isFinite(journey.actionsRemaining)
    ? journey.actionsRemaining
    : ACTIONS_PER_DAY;
  return remaining <= 0;
}

/**
 * Guard a day loop against menus made entirely of free choices.
 *
 * Call once per pass through a mode's day loop, after the chosen action has
 * resolved. Returns true when the day has been closed out — either because
 * the action was spent normally, or because FREE_LOOKUPS_PER_DAY free choices
 * went by without one, which means there was nothing left to do today.
 * @param {Object} journey
 * @param {{count: number}} tally - per-day free-choice counter
 * @param {Object} [ui] - written to when the guard closes the day
 * @returns {boolean} whether the day is over
 */
export function settleDayPass(journey, tally, ui = null) {
  if (dayIsSpent(journey)) return true;
  tally.count = (tally.count || 0) + 1;
  if (tally.count < FREE_LOOKUPS_PER_DAY) return false;
  spendDay(journey);
  ui?.write?.('The light goes before the work does. Whatever was left is tomorrow\'s.', 'term-dim');
  return true;
}

/**
 * The prompt above a day's menu. Every mode asks the same question now, so
 * they ask it in the same words. The day and the deadline are already on the
 * mode's own header and in the status strip, so the prompt does not repeat
 * them — it just names the decision.
 * @returns {string}
 */
export function dayPrompt() {
  return 'What gets the day?';
}
