/**
 * Delayed catches: the determination behind a caught shortcut.
 *
 * Every act in js/data/illegalActs.js carries `catch.lagDays`, the rough time
 * between the thing being found and the institution deciding what it costs.
 * The caught band used to settle the whole bill the same afternoon the option
 * was chosen, while its own paragraph said the letter "arrives six weeks
 * later". Now the band itself is the finding (no payoff, the watch flag, a
 * first bump of scrutiny) and the determination waits here, to land as its
 * own card on the day it is due (js/events/selection.js takes it from this
 * queue ahead of any new offer).
 *
 * Kept as plain data on the journey, so it saves, reloads and crosses a
 * campaign season boundary like any other journey state.
 */

/**
 * The queue of determinations still to land.
 * @param {Object} journey
 * @returns {Array}
 */
export function getPendingFallout(journey) {
  const memory = journey.temptationMemory || (journey.temptationMemory = {});
  if (!Array.isArray(memory.pendingCatches)) memory.pendingCatches = [];
  return memory.pendingCatches;
}

/**
 * Queue a caught shortcut's determination. It lands `dueIn` days (months for
 * a GM) from today, and never after the run's own deadline: a letter that
 * would arrive after the season lands on its last day instead, and one the
 * run ends before is settled at close (js/events/shortcutRecord.js).
 * @param {Object} journey
 * @param {Object} fallout - { actId, title, institution, dueIn, effects, flags, variant }
 * @returns {Object} the queued entry
 */
export function queueFallout(journey, fallout) {
  const day = Number(journey?.day) || 1;
  let dueDay = day + Math.max(1, Math.round(Number(fallout?.dueIn) || 1));
  const deadline = Number(journey?.deadline);
  if (Number.isFinite(deadline) && deadline > day) dueDay = Math.min(dueDay, deadline);
  const entry = {
    actId: fallout.actId,
    title: fallout.title,
    institution: fallout.institution,
    effects: { ...(fallout.effects || {}) },
    flags: [...(fallout.flags || [])],
    variant: Number(fallout.variant) || 0,
    takenDay: day,
    dueDay,
  };
  getPendingFallout(journey).push(entry);
  return entry;
}

/**
 * Take the first determination due today, if any.
 * @param {Object} journey
 * @returns {Object|null}
 */
export function takeDueFallout(journey) {
  const queue = getPendingFallout(journey);
  const day = Number(journey?.day) || 1;
  const index = queue.findIndex((entry) => Number(entry?.dueDay) <= day);
  if (index === -1) return null;
  return queue.splice(index, 1)[0];
}
