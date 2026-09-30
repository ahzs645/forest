/**
 * Graded outcome bands.
 *
 * An event option used to resolve one of two ways: its authored `outcome` and
 * `effects`, or — for the two options in the whole corpus that carried
 * `chanceSuccess` — a flat coin flip into `failureOutcome`/`failureEffects`.
 * Nothing shifted those odds. A 60% chance was 60% whether the crew was fresh
 * or wrecked, whether the file was clean or already under review.
 *
 * This module adds a third band and makes the odds depend on the state the
 * player has actually been building. It follows the pattern `js/risk.js` has
 * used for the seasonal engine since it shipped — base chance, shifted by
 * things the player controls, clamped so nothing is ever certain.
 *
 * Backwards compatible by construction:
 *   - no `chanceSuccess`            -> always the good band (today's behaviour
 *                                     for 387 of 389 options)
 *   - `chanceSuccess`, no partial   -> binary, exactly as before
 *   - `chanceSuccess` + `chancePartial` -> three bands
 */

/** Bands, best to worst. */
export const OUTCOME_BANDS = ['good', 'partial', 'bad'];

/**
 * Every predicate `matchesOddsCondition` implements.
 *
 * Exported so scripts/lint-events.mjs can check authored content against the
 * engine rather than against a restated copy of this list — a `when` string the
 * switch below does not handle returns false forever, which reads in the deck
 * as an odds shift that simply never fires. tests/gradedOutcomes.test.mjs
 * exercises every name here, so adding one without implementing it fails.
 */
export const ODDS_PREDICATE_NAMES = [
  'weather', 'season', 'pace', 'difficulty', 'terrain', 'crewHasRole',
  'scrutinyAbove', 'scrutinyBelow', 'equipmentBelow', 'avgMoraleBelow',
  'avgMoraleAbove', 'relationshipsAbove', 'shortRationStreak', 'priorShortcuts',
  'hasFlag', 'accessGroundTruthed',
];

/**
 * Flags the temptation lane (js/events/selection.js) leaves behind on a
 * noticed or caught band. They shift later odds via `hasFlag:`, the shortcut
 * card names the ones that moved today's odds, the mission panel lists them
 * while they stand (js/events/shortcutRecord.js), and a campaign carries
 * them into the next season. applyConsequenceFlags prints the sentence the
 * day a flag first lands.
 */
export const TEMPTATION_ODDS_FLAGS = Object.freeze({
  ce_watching: 'C&E is reading everything with your name on it.',
  fpb_watching: 'The Forest Practices Board has your file on its list.',
  fpbc_watching: 'Forest Professionals BC has a note with your name in it.',
  fn_watching: "The Nation's referrals office has a note with your name in it.",
  worksafe_watching: "WorkSafeBC's prevention officer has the site on a list.",
  bcws_watching: 'BC Wildfire Service has the block on a list.',
  cos_watching: 'A conservation officer has your plate number.',
  env_watching: 'An environmental protection officer has the block on a list.',
  dfo_watching: 'A DFO fishery officer has the crossing on a list.',
  arch_watching: 'The Archaeology Branch has the block on a list.',
  pricing_watching: 'Timber Pricing has your cruises and scale on the check list.',
  rcmp_watching: 'The RCMP have a note with your name in it.',
  cvse_watching: 'CVSE has the hauling contractor on a list.',
  contractor_owns_you: 'The person who did it for you now owns a piece of you.',
  fpbc_file_open: 'Forest Professionals BC has a file open under your name.',
  rcmp_file: 'There is an RCMP file with the company name on it.',
});

/** The same flags as a short status line: who has you on a list. */
export const TEMPTATION_FLAG_LABELS = Object.freeze({
  ce_watching: 'C&E is watching your files',
  fpb_watching: 'the Forest Practices Board is watching your file',
  fpbc_watching: 'Forest Professionals BC is watching your signature',
  fn_watching: "the Nation's referrals office is watching",
  worksafe_watching: 'WorkSafeBC has the site on a list',
  bcws_watching: 'BC Wildfire Service has the block on a list',
  cos_watching: 'the Conservation Officer Service is watching',
  env_watching: 'ENV has the block on a list',
  dfo_watching: 'DFO is watching the crossings',
  arch_watching: 'the Archaeology Branch is watching the block',
  pricing_watching: 'Timber Pricing is checking your cruises',
  rcmp_watching: 'the RCMP have your name',
  cvse_watching: 'CVSE is watching the trucks',
  contractor_owns_you: 'someone who did it for you owns a piece of you',
  fpbc_file_open: 'an FPBC complaint file is open',
  rcmp_file: 'an RCMP file is open',
});

/**
 * The watch flags: each institution's own, so a DFO finding does not read
 * on the mission panel as C&E, and only the institution that would catch an
 * act reads that act's next attempt closely. The open professional and
 * criminal files (fpbc_file_open, rcmp_file) are not watches; they stand on
 * their own.
 */
export const TEMPTATION_WATCH_FLAGS = Object.freeze(
  Object.keys(TEMPTATION_FLAG_LABELS).filter((flag) => !['fpbc_file_open', 'rcmp_file'].includes(flag))
);

/**
 * Read a numeric threshold off a `when` string like "scrutinyAbove:55".
 * @returns {number} NaN when the predicate carries no argument
 */
function thresholdOf(when) {
  const raw = String(when).split(':')[1];
  return raw === undefined ? NaN : Number(raw);
}

function averageCrewMorale(journey) {
  const crew = (journey?.crew || []).filter((member) => member.isActive);
  if (!crew.length) return null;
  return crew.reduce((sum, member) => sum + (member.morale || 0), 0) / crew.length;
}

/**
 * Evaluate one `when` predicate against the run.
 *
 * Kept as data-interpreted strings rather than functions so an option can
 * declare its own odds shifts inline in the content decks, and so a content
 * author never has to open a JS file to say "this is worse in the rain".
 *
 * @param {string} when
 * @param {Object} journey
 * @returns {boolean}
 */
export function matchesOddsCondition(when, journey) {
  if (!when || !journey) return false;
  const key = String(when).split(':')[0];
  const threshold = thresholdOf(when);
  const scrutiny = Number(journey.scrutiny ?? journey.heat ?? 0);

  switch (key) {
    case 'weather':
      return String(journey.weather?.id || '') === String(when).split(':')[1];
    case 'season':
      return String(journey.season?.currentSeason || '') === String(when).split(':')[1];
    case 'pace':
      return String(journey.paceSetting || journey.pace || '') === String(when).split(':')[1];
    case 'difficulty':
      return String(journey.difficulty || '') === String(when).split(':')[1];
    case 'terrain': {
      const block = journey.blocks?.[journey.currentBlockIndex];
      return String(block?.terrain || '') === String(when).split(':')[1];
    }
    case 'crewHasRole':
      return (journey.crew || []).some(
        (member) => member.isActive && member.role === String(when).split(':')[1]
      );
    case 'scrutinyAbove':
      return Number.isFinite(threshold) && scrutiny >= threshold;
    case 'scrutinyBelow':
      return Number.isFinite(threshold) && scrutiny <= threshold;
    case 'equipmentBelow':
      return Number.isFinite(threshold) && Number(journey.resources?.equipment ?? 100) <= threshold;
    case 'avgMoraleBelow': {
      const morale = averageCrewMorale(journey);
      return morale !== null && Number.isFinite(threshold) && morale <= threshold;
    }
    case 'avgMoraleAbove': {
      const morale = averageCrewMorale(journey);
      return morale !== null && Number.isFinite(threshold) && morale >= threshold;
    }
    case 'relationshipsAbove':
      return Number.isFinite(threshold) && Number(journey.resources?.politicalCapital ?? 0) >= threshold;
    case 'shortRationStreak':
      return Number.isFinite(threshold)
        && Number(journey.rationPlan?.shortRationStreak || 0) >= threshold;
    case 'priorShortcuts':
      // Shortcuts the player actually took (or let stand once somebody went
      // around them). Offers that were declined or set aside do not count:
      // saying no to a contractor cannot be what gets you caught later.
      return Number.isFinite(threshold)
        && (journey.temptationMemory?.takenActIds?.length || 0) >= threshold;
    case 'hasFlag':
      // Consequence flags left by earlier bad bands (js/events/consequences.js).
      // This is what closes the loop: a failure does not just cost something
      // once, it changes the odds on everything the player gambles afterwards.
      // A soured local network really does make the next dealing with locals
      // worse, rather than being a line of prose about it.
      return Array.isArray(journey.consequenceFlags)
        && journey.consequenceFlags.includes(String(when).split(':')[1]);
    case 'accessGroundTruthed': {
      const block = journey.blocks?.[journey.currentBlockIndex];
      const intel = block?.id ? journey.reconIntel?.byBlock?.[block.id] : null;
      return Boolean(intel?.accessGroundTruthed);
    }
    default:
      return false;
  }
}

/**
 * Build this option's band probabilities for this run.
 *
 * Each modifier moves probability mass from one band to another, so the three
 * always sum to 1 — you cannot author a shift that quietly inflates or loses
 * probability. Nothing is ever certain: every band keeps a floor once it is in
 * play, because a game where the shortcut is guaranteed to work is the game we
 * are replacing.
 *
 * @param {Object} option
 * @param {Object} journey
 * @returns {{good: number, partial: number, bad: number}}
 */
export function computeBandOdds(option, journey) {
  const hasRoll = typeof option?.chanceSuccess === 'number';
  if (!hasRoll) return { good: 1, partial: 0, bad: 0 };

  const good = Math.max(0, Math.min(1, option.chanceSuccess));
  const partial = typeof option.chancePartial === 'number'
    ? Math.max(0, Math.min(1 - good, option.chancePartial))
    : 0;
  const bands = { good, partial, bad: Math.max(0, 1 - good - partial) };

  for (const modifier of option.oddsModifiers || []) {
    if (!modifier?.when || !matchesOddsCondition(modifier.when, journey)) continue;
    const from = OUTCOME_BANDS.includes(modifier.from) ? modifier.from : null;
    const to = OUTCOME_BANDS.includes(modifier.to) ? modifier.to : null;
    if (!from || !to || from === to) continue;
    // Never move more than the source band actually holds, so a stack of
    // modifiers cannot drive a band negative.
    const moved = Math.min(Math.max(0, Number(modifier.move) || 0), bands[from]);
    bands[from] -= moved;
    bands[to] += moved;
  }

  // A gamble can carry its own floor on the bad band (`badFloor`): a careful
  // record buys cover, but it cannot make burying a diesel spill safe. The
  // floor is taken from the good band first, then the middle one, so the
  // odds still sum to 1 and the card can print them as they are.
  const badFloor = Math.max(0, Math.min(0.9, Number(option.badFloor) || 0));
  if (bands.bad < badFloor) {
    let short = badFloor - bands.bad;
    for (const from of ['good', 'partial']) {
      const moved = Math.min(short, bands[from]);
      bands[from] -= moved;
      bands.bad += moved;
      short -= moved;
    }
  }

  // Floors, so a run that has gone badly cannot make a gamble a certainty in
  // either direction.
  if (bands.bad > 0 || bands.partial > 0) {
    bands.good = Math.max(0.05, Math.min(0.95, bands.good));
  }
  const total = bands.good + bands.partial + bands.bad;
  return total > 0
    ? { good: bands.good / total, partial: bands.partial / total, bad: bands.bad / total }
    : { good: 1, partial: 0, bad: 0 };
}

/**
 * Roll an option's outcome band and hand back what that band actually means.
 *
 * @param {Object} option
 * @param {Object} journey
 * @param {Function} [rng]
 * @returns {{band: string, outcome: string, effects: Object, crewEffect: Object|null, odds: Object}}
 */
export function resolveOutcomeBand(option, journey, rng = Math.random) {
  const odds = computeBandOdds(option, journey);
  const roll = rng();

  let band = 'good';
  if (roll >= odds.good + odds.partial) band = 'bad';
  else if (roll >= odds.good) band = 'partial';

  if (band === 'partial') {
    return {
      band,
      // A partial band with nothing authored falls back to the bad band rather
      // than the good one: the middle is a worse outcome than success, and
      // silently promoting it would make an unfinished option read as a win.
      outcome: option.partialOutcome || option.failureOutcome || option.outcome,
      effects: option.partialEffects || option.failureEffects || option.effects,
      crewEffect: option.partialCrewEffect || null,
      flags: option.partialFlags || [],
      schedulesEvent: option.partialSchedulesEvent || null,
      odds,
    };
  }

  if (band === 'bad') {
    return {
      band,
      outcome: option.failureOutcome || option.outcome,
      effects: option.failureEffects || option.effects,
      crewEffect: option.failureCrewEffect || null,
      flags: option.failureFlags || [],
      schedulesEvent: option.failureSchedulesEvent || null,
      odds,
    };
  }

  return {
    band,
    outcome: option.outcome,
    effects: option.effects,
    crewEffect: null,
    flags: option.flags || [],
    schedulesEvent: option.goodSchedulesEvent || null,
    odds,
  };
}
