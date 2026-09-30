/**
 * Headless General Manager balance harness.
 *
 * Drives the real month runner (js/modes/manager.js) through a whole operating
 * year under a named play style, on seeded randomness, at a chosen difficulty,
 * and reports how the year ended: outcome, cut control, treasury, reputation,
 * scrutiny and grade. The styles are the ones the GM playtest used to show the
 * mode rewarding the wrong things (a 114% overcut winning, honest board reports
 * losing while spin won), so the table is the regression check for that
 * rebalance.
 *
 *   node scripts/simulate-manager.mjs                     # every style, every difficulty
 *   node scripts/simulate-manager.mjs --runs 40 --style honest --difficulty hard
 *
 * tests/managerBalance.test.mjs imports simulateManagerYear from here.
 */

import { createManagerJourney } from '../js/journey/factory.js';
import { runManagerDay } from '../js/modes/manager.js';
import { checkEndConditions } from '../js/modes/shared/endConditions.js';
import { applyDifficultyMultipliers } from '../js/game/ForestryTrailGame.js';
import { calculateScore } from '../js/scoring.js';

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function byValue(options, wanted) {
  for (const want of wanted) {
    const found = options.find((option) => option.value === want);
    if (found) return found;
  }
  return null;
}

/** Event cards carry numeric values; the risk chip rides on the label. */
function byTag(options, tags) {
  for (const tag of tags) {
    const found = options.find((option) => typeof option.value === 'number' && option.label.endsWith(`[${tag}]`));
    if (found) return found;
  }
  return options.find((option) => typeof option.value === 'number') || null;
}

/**
 * Pace: take the woodlands manager's recommendation, which is always the
 * option that steers the projection back toward the middle of the band.
 */
function recommendedPace(options) {
  return options.find((option) => String(option.value).startsWith('pace:') && option.recommended) || null;
}

export const MANAGER_STYLES = {
  /**
   * A GM who knows the job: steady posture, a certification the meters can
   * carry, money on whichever division is weakest, steer the cut into the
   * band, tell the board the truth, answer situations the safe way.
   */
  competent(journey, options, prompt) {
    if (/operating posture/.test(prompt)) return byValue(options, ['steady']);
    if (/Certification/.test(prompt)) return byValue(options, ['SFI', 'none']);
    const pace = recommendedPace(options);
    if (pace) return pace;
    if (/Where does the money go/.test(prompt)) {
      const m = journey.metrics;
      if ((m.compliance ?? 50) <= (m.relationships ?? 50)) return byValue(options, ['compliance']);
      return byValue(options, ['pr']);
    }
    // Leave a situation with the division when cash is thin, unless the
    // set-aside line says the division stops work over it.
    const setAside = byValue(options, ['set_aside']);
    if (setAside && !/stop-work/.test(setAside.description || '')
      && (journey.resources.budget || 0) < (journey.ledger?.startTreasury || 850000) * 0.35) return setAside;
    return byValue(options, ['plan', 'visit', 'rehearse', 'transparent'])
      || byTag(options, ['SAFE', 'TRADEOFF']);
  },

  /**
   * The playtest's "honest but weak" run: no certification, no spending,
   * corrective plans, rehearsed numbers, full transparency every quarter.
   * Honest play has to be able to win.
   */
  honest(journey, options) {
    return byValue(options, ['steady', 'none', 'hold', 'plan', 'desk', 'rehearse', 'transparent'])
      || recommendedPace(options)
      || byTag(options, ['SAFE', 'TRADEOFF']);
  },

  /**
   * Push the cut and take every shortcut: growth posture, the dearest
   * certificate, operations money, wing the board and spin it, add shifts.
   */
  reckless(journey, options) {
    return byValue(options, ['growth', 'FSC', 'operations', 'intervene', 'visit', 'wing', 'spin', 'pace:1.1'])
      || byTag(options, ['OFF-BOOK', 'RISKY', 'TRADEOFF']);
  },

  /**
   * A sensible operator who manages the board rather than informs it: steady
   * posture and pace, but polish the deck and spin every quarter.
   */
  spin(journey, options, prompt) {
    if (/Certification/.test(prompt)) return byValue(options, ['SFI', 'none']);
    return byValue(options, ['steady', 'pr', 'back', 'visit', 'polish', 'spin'])
      || recommendedPace(options)
      || byTag(options, ['TRADEOFF', 'SAFE']);
  },

  /** The fuzzer: anything on the menu. */
  random(journey, options) {
    const actionable = options.filter((option) => typeof option.value !== 'symbol');
    return actionable[Math.floor(Math.random() * actionable.length)];
  },
};

function makeUi(journey, style, trace) {
  const noop = () => {};
  const write = (...parts) => trace?.(parts.filter((part) => typeof part === 'string').join(' '));
  return {
    write, writeHeader: write, writeWarning: write, writePositive: write, writeDanger: write,
    writeInfo: write, writeSuccess: write, writeDivider: write, writeBox: write,
    clear: noop, updateAllStatus: noop, playEventVignette: noop, playScene: async () => {},
    setMissionStatus: noop, clearMissionStatus: noop,
    async promptText() { return 'x'; },
    async promptChoice(prompt, options = []) {
      if (!options.length) return { value: undefined };
      if (options.length === 1) return options[0];
      const actionable = options.filter((option) => typeof option.value !== 'symbol');
      const chosen = style(journey, actionable, String(prompt || '')) || actionable[0];
      trace?.(`  > ${prompt} -> ${chosen.label}`);
      return chosen;
    },
  };
}

/**
 * One operating year under a style.
 * @param {number} seed
 * @param {string} styleName - a key of MANAGER_STYLES
 * @param {Object} [options]
 * @param {string} [options.difficulty] - easy | normal | hard
 * @param {string} [options.areaId]
 * @param {Function} [options.trace] - receives every written line
 */
export async function simulateManagerYear(seed, styleName, { difficulty = 'normal', areaId = 'fraser-plateau', trace = null } = {}) {
  const style = MANAGER_STYLES[styleName];
  if (!style) throw new Error(`unknown style: ${styleName}`);
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    const journey = createManagerJourney({ areaId, roleId: 'manager' });
    journey.difficulty = difficulty;
    applyDifficultyMultipliers(journey, difficulty);
    const game = { journey, ui: makeUi(journey, style, trace), gameOver: false, checkpoint() {} };
    let outcome = null;
    for (let month = 0; month < 16 && !outcome && !game.gameOver; month += 1) {
      await runManagerDay(game);
      outcome = checkEndConditions(journey);
    }
    const victory = Boolean(outcome?.victory);
    const score = calculateScore(journey, victory);
    return {
      seed,
      style: styleName,
      difficulty,
      victory,
      reason: outcome?.reason || 'no outcome',
      cutRatio: journey.ledger.aac ? journey.ledger.deliveredYtd / journey.ledger.aac : 0,
      cutControl: journey.ledger.cutControl,
      treasury: Math.round(journey.resources.budget),
      reputation: Math.round(journey.metrics.reputation),
      compliance: Math.round(journey.metrics.compliance),
      scrutiny: Math.round(journey.scrutiny || 0),
      certifications: (journey.certifications || []).map((cert) => `${cert.id}:${cert.status || 'held'}`),
      grade: score.grade,
      score: score.totalScore,
      journey,
    };
  } finally {
    Math.random = original;
  }
}

/** Summarise a batch: win rate, median score, cut-control spread. */
export function summarizeBatch(results) {
  const wins = results.filter((result) => result.victory).length;
  const scores = results.map((result) => result.score).sort((a, b) => a - b);
  const ratios = results.map((result) => result.cutRatio).sort((a, b) => a - b);
  const median = (list) => list[Math.floor(list.length / 2)];
  const reasons = {};
  for (const result of results.filter((entry) => !entry.victory)) {
    reasons[result.reason] = (reasons[result.reason] || 0) + 1;
  }
  return {
    runs: results.length,
    wins,
    winRate: wins / results.length,
    medianScore: median(scores),
    medianCut: median(ratios),
    minCut: ratios[0],
    maxCut: ratios[ratios.length - 1],
    medianTreasury: median(results.map((result) => result.treasury).sort((a, b) => a - b)),
    bankrupt: results.filter((result) => /Budget exhausted/.test(result.reason)).length,
    reasons,
  };
}

async function main() {
  const args = { runs: 24, style: null, difficulty: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--runs') args.runs = Number(argv[++i]);
    else if (argv[i] === '--style') args.style = argv[++i];
    else if (argv[i] === '--difficulty') args.difficulty = argv[++i];
    else if (argv[i] === '--transcript') args.transcript = true;
  }
  const styles = args.style ? [args.style] : Object.keys(MANAGER_STYLES);
  const difficulties = args.difficulty ? [args.difficulty] : ['easy', 'normal', 'hard'];
  for (const difficulty of difficulties) {
    for (const styleName of styles) {
      const results = [];
      for (let i = 0; i < args.runs; i += 1) {
        results.push(await simulateManagerYear(2000 + i * 53, styleName, {
          difficulty,
          trace: args.transcript ? console.log : null,
        }));
      }
      const s = summarizeBatch(results);
      const pct = (value) => `${(value * 100).toFixed(1)}%`;
      console.log(
        `${difficulty.padEnd(6)} ${styleName.padEnd(9)} win ${String(s.wins).padStart(2)}/${s.runs}`
        + `  score ${s.medianScore}  cut ${pct(s.minCut)}-${pct(s.maxCut)} (median ${pct(s.medianCut)})`
        + `  treasury $${s.medianTreasury.toLocaleString()}  bankrupt ${s.bankrupt}`
        + (Object.keys(s.reasons).length ? `  losses: ${Object.entries(s.reasons).map(([reason, n]) => `${n}x ${reason}`).join(' | ')}` : ''),
      );
    }
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  main();
}
