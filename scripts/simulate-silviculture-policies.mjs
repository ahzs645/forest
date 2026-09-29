/**
 * Silviculture policy comparison.
 *
 * Drives the real silviculture day runner with three players and grades each
 * run the way the debrief does (calculateScore plus the final report):
 *
 *   competent  plants, plots, fills, releases and surveys; says no to every
 *              shortcut; files the report as surveyed; sprays only when the
 *              budget will not carry the saws
 *   honest     the competent program, never a spray day: saws while the
 *              budget carries them, then cylinder release or sheep
 *   neglect    a contractor meeting, one early survey, then idles and sets
 *              every situation aside
 *   shortcuts  the competent program, with every shortcut offered taken, the
 *              foreman's plot cards signed, and the report spun
 *   fraud      delivers the planting and the declarations but skips fill,
 *              sprays half the release program, takes every shortcut, signs
 *              the foreman's plot cards, and spins the report
 *
 * The point is that they separate: competent and honest play deliver on
 * every area and difficulty without running out of money, fraud that gets
 * caught is punished, neglect fails.
 *
 *   node scripts/simulate-silviculture-policies.mjs                 # every area and difficulty, 6 seeds
 *   node scripts/simulate-silviculture-policies.mjs --runs 12 --area kootenay-wetbelt --difficulty hard
 *   node scripts/simulate-silviculture-policies.mjs --policy honest --scale campaign
 */

import { createSilvicultureJourney } from '../js/journey/factory.js';
import { runSilvicultureDay } from '../js/modes/silviculture.js';
import { checkEndConditions } from '../js/modes/shared/endConditions.js';
import { calculateScore, getLetterGrade } from '../js/scoring.js';
import { resolveFinalReport } from '../js/game/debrief.js';
import { summarizeIntegrity } from '../js/modes/silvicultureIntegrity.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';
import { applyDifficultyMultipliers } from '../js/game/ForestryTrailGame.js';

const HARD_DAY_CAP = 150;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick(options, wanted) {
  for (const want of wanted) {
    const found = options.find((option) => option?.value === want);
    if (found) return found;
  }
  return null;
}

const byLabel = (options, prefix) => options.find((option) => String(option?.label || '').startsWith(prefix)) || null;

/** Whether any stand in the release queue is still open. */
function queueOpen(journey) {
  return (journey.program?.brush || []).some((opening) => opening.treated < opening.ha);
}

function brushRatio(journey) {
  return (journey.brushing?.hectaresComplete || 0) / Math.max(1, journey.brushing?.hectaresTarget || 1);
}

function calendar(journey) {
  return Math.min(1, (journey.day || 1) / (journey.deadline || 42));
}

/** The competent supervisor's day, shared by the competent and fraud players. */
function programDay(journey, options, { skipFill = false, releaseCap = 1 } = {}) {
  const behind = calendar(journey) - brushRatio(journey);
  const releaseOpen = queueOpen(journey) && (releaseCap >= 1 || brushRatio(journey) < releaseCap);
  const wanted = ['inspect'];
  if (behind < 0.2) wanted.push('survey');
  if (behind > 0.12 && releaseOpen) wanted.push('brush');
  wanted.push('plant', 'survey');
  if (!skipFill) wanted.push('fill');
  if (releaseOpen) wanted.push('brush');
  const canDeploy = (journey.contractors || []).some((contractor) => {
    const state = contractor.silvicultureState;
    return !contractor.isActive && state?.status !== 'recovering' && !(state?.cooldownDays > 0);
  });
  if (canDeploy) wanted.push('rotation');
  wanted.push('end');
  return pick(options, wanted);
}

function answerSituation(journey, options) {
  const setAside = options.find((option) => option.value === 'set_aside');
  const planted = (journey.planting?.blocksPlanted || 0) / (journey.planting?.blocksToPlant || 1);
  if (setAside && planted < calendar(journey)) return setAside;
  return options.find((option) => typeof option.value === 'number') || options[0];
}

function subPrompt(journey, options, prompt, { method = null, call = [], noHerbicide = false } = {}) {
  if (prompt.startsWith('Stand down ')) return pick(options, ['cancel']) || options[0];
  if (prompt === 'Adjust which contractor?') {
    return options.find((option) => /^(ready|available)/.test(option.description || '')) || pick(options, ['cancel']);
  }
  if (prompt === 'Meet with which contractor?') return options[0];
  if (prompt === 'How do you respond?') return pick(options, call) || options[0];
  if (prompt.startsWith('Release treatment on ')) {
    if (method) return pick(options, [method, 'manual']) || options[0];
    const remainingHa = Math.max(0, (journey.brushing?.hectaresTarget || 0) - (journey.brushing?.hectaresComplete || 0));
    const remainingTrees = Math.max(0, (journey.planting?.seedlingsAllocated || 0) - (journey.planting?.seedlingsPlanted || 0));
    const daysLeft = Math.max(0, (journey.deadline || 42) - (journey.day || 1));
    const restOfProgram = remainingTrees * 0.36 + daysLeft * 550 + 4 * 1800 + 15000;
    const manual = (journey.resources?.budget || 0) > remainingHa * 900 + restOfProgram;
    // An honest supervisor never sprays: saws while the budget carries
    // them, then the cheaper chemical-free treatments.
    const order = noHerbicide
      ? (manual ? ['manual', 'cylinder', 'sheep'] : ['cylinder', 'sheep', 'manual'])
      : (manual ? ['manual', 'glyphosate', 'cylinder', 'sheep'] : ['glyphosate', 'cylinder', 'sheep', 'manual']);
    return pick(options, order) || options[0];
  }
  // The day's release, costed: go ahead.
  if (prompt.startsWith('Today\'s release')) return pick(options, ['confirm']) || options[0];
  return null;
}

export const POLICIES = {
  competent: {
    report: 'integrity',
    choose(journey, options, prompt) {
      const sub = subPrompt(journey, options, prompt, { call: ['inspect', 'inspect_camp', 'rest', 'pay'] });
      if (sub) return sub;
      if (options.some((option) => option.value === 'set_aside')) {
        return byLabel(options, 'Say no') || answerSituation(journey, options);
      }
      if (options.some((option) => option.value === 'end')) return programDay(journey, options);
      return options[0];
    },
  },
  // Competent, and never sprays: the chemical-free route has to be
  // affordable on every area and difficulty.
  honest: {
    report: 'integrity',
    choose(journey, options, prompt) {
      const sub = subPrompt(journey, options, prompt, { call: ['inspect', 'inspect_camp', 'rest', 'pay'], noHerbicide: true });
      if (sub) return sub;
      if (options.some((option) => option.value === 'set_aside')) {
        return byLabel(options, 'Say no') || answerSituation(journey, options);
      }
      if (options.some((option) => option.value === 'end')) return programDay(journey, options);
      return options[0];
    },
  },
  neglect: {
    report: 'people',
    choose(journey, options, prompt, memory) {
      const sub = subPrompt(journey, options, prompt, { call: ['push', 'deny', 'wait'] });
      if (sub) return sub;
      if (options.some((option) => option.value === 'set_aside')) return pick(options, ['set_aside']);
      if (options.some((option) => option.value === 'end')) {
        if (journey.day === 1 && !memory.met) {
          memory.met = true;
          const meeting = pick(options, ['meeting']);
          if (meeting) return meeting;
        }
        if (!memory.surveyed) {
          const survey = pick(options, ['survey']);
          if (survey) { memory.surveyed = true; return survey; }
        }
        return pick(options, ['end']);
      }
      return options[0];
    },
  },
  // The whole program delivered, with every shortcut on the way.
  shortcuts: {
    report: 'spin',
    choose(journey, options, prompt) {
      const sub = subPrompt(journey, options, prompt, { call: ['slide', 'inspect', 'rest', 'pay'] });
      if (sub) return sub;
      if (options.some((option) => option.value === 'set_aside')) {
        return byLabel(options, 'Take the shortcut') || byLabel(options, 'Let it stand') || answerSituation(journey, options);
      }
      if (options.some((option) => option.value === 'end')) return programDay(journey, options);
      return options[0];
    },
  },
  fraud: {
    report: 'spin',
    choose(journey, options, prompt) {
      const sub = subPrompt(journey, options, prompt, { method: 'glyphosate', call: ['slide', 'push', 'deny', 'wait'] });
      if (sub) return sub;
      if (options.some((option) => option.value === 'set_aside')) {
        return byLabel(options, 'Take the shortcut') || byLabel(options, 'Let it stand') || answerSituation(journey, options);
      }
      if (options.some((option) => option.value === 'end')) return programDay(journey, options, { skipFill: true, releaseCap: 0.56 });
      return options[0];
    },
  },
};

function makeUi(journey, policy) {
  const noop = () => {};
  const memory = {};
  return {
    write: noop, writeHeader: noop, writeWarning: noop, writePositive: noop, writeDanger: noop,
    writeInfo: noop, writeSuccess: noop, writeBox: noop, writeDivider: noop, clear: noop,
    updateAllStatus: noop, playEventVignette: noop, playScene: noop, setMissionStatus: noop,
    clearMissionStatus: noop,
    async promptText() { return 'x'; },
    async promptChoice(prompt, options = []) {
      // A disabled option is on the card with its reason, but it is not a choice.
      const live = options.filter((option) => !option?.disabled);
      if (!live.length) return { value: undefined };
      if (live.length === 1) return live[0];
      return policy.choose(journey, live, String(prompt || ''), memory) || live[0];
    },
  };
}

/**
 * One graded run.
 * @returns {{area, policy, seed, won, days, reason, score, grade, integrity}}
 */
export async function runPolicy(policyName, areaId, seed, { scale, difficulty = 'normal' } = {}) {
  const policy = POLICIES[policyName];
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    const journey = createSilvicultureJourney({ areaId, scale });
    journey.difficulty = difficulty;
    applyDifficultyMultipliers(journey, difficulty);
    const game = { ui: makeUi(journey, policy), journey, gameOver: false };
    let outcome = null;
    let days = 0;
    while (!outcome && !game.gameOver && days < HARD_DAY_CAP) {
      await runSilvicultureDay(game);
      days += 1;
      outcome = checkEndConditions(journey);
    }
    const won = Boolean(outcome?.victory);
    const score = calculateScore(journey, won);
    const report = resolveFinalReport(policy.report, journey);
    const total = Math.max(0, Math.min(100, score.totalScore + report.delta));
    return {
      area: areaId,
      policy: policyName,
      seed,
      difficulty,
      won,
      days: journey.day - 1,
      budget: Math.round(journey.resources?.budget || 0),
      sprayed: (Number(journey.silvicultureState?.sprayDays) || 0) > 0,
      reason: outcome?.reason || null,
      score: total,
      grade: getLetterGrade(total),
      integrity: summarizeIntegrity(journey),
    };
  } finally {
    Math.random = original;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
  const runs = Number(arg('--runs')) || 6;
  const areas = arg('--area') ? [arg('--area')] : OPERATING_AREAS.map((area) => area.id);
  const scale = arg('--scale') || undefined;
  const difficultyArg = arg('--difficulty') || 'all';
  const difficulties = difficultyArg === 'all' ? ['easy', 'normal', 'hard'] : [difficultyArg];
  const policies = arg('--policy') ? [arg('--policy')] : Object.keys(POLICIES);

  const totals = {};
  const failures = [];
  console.log(`${'area'.padEnd(26)} ${'diff'.padEnd(6)} ${'policy'.padEnd(10)} wins  grades        mean  days  min $    caught  pulled`);
  for (const areaId of areas) {
    for (const difficulty of difficulties) {
      for (const policyName of policies) {
        const results = [];
        for (let i = 0; i < runs; i += 1) {
          results.push(await runPolicy(policyName, areaId, 4000 + i * 53, { scale, difficulty }));
        }
        const wins = results.filter((r) => r.won).length;
        const grades = results.map((result) => result.grade).sort().join('');
        const mean = Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length);
        const days = Math.round(results.reduce((sum, result) => sum + result.days, 0) / results.length);
        const minBudget = Math.min(...results.map((result) => result.budget));
        const caught = results.filter((result) => result.integrity.caughtFalseRecords + result.integrity.caughtShortcuts > 0).length;
        const pulled = results.filter((result) => result.integrity.programPulled).length;
        const total = totals[policyName] ||= { wins: 0, runs: 0, broke: 0 };
        total.wins += wins;
        total.runs += results.length;
        total.broke += results.filter((result) => result.budget <= 0).length;
        for (const result of results) {
          if (['competent', 'honest'].includes(policyName) && !result.won) failures.push(result);
        }
        console.log(`${areaId.padEnd(26)} ${difficulty.padEnd(6)} ${policyName.padEnd(10)} ${String(wins).padStart(2)}/${runs}  ${grades.padEnd(12)}  ${String(mean).padStart(4)}  ${String(days).padStart(4)}  ${String(Math.round(minBudget / 1000)).padStart(5)}k  ${String(caught).padStart(6)}  ${String(pulled).padStart(6)}`);
      }
    }
  }
  console.log('');
  for (const [policyName, total] of Object.entries(totals)) {
    console.log(`${policyName.padEnd(10)} ${total.wins}/${total.runs} wins, ${total.broke} ran out of budget`);
  }
  for (const failure of failures) {
    console.log(`  lost: ${failure.policy} ${failure.area} ${failure.difficulty} seed ${failure.seed} day ${failure.days} $${failure.budget}: ${failure.reason}`);
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  main();
}
