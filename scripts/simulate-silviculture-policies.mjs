/**
 * Silviculture policy comparison.
 *
 * Drives the real silviculture day runner with three players and grades each
 * run the way the debrief does (calculateScore plus the final report):
 *
 *   competent  plants, plots, fills, releases and surveys; says no to every
 *              shortcut; files the report as surveyed
 *   neglect    a contractor meeting, one early survey, then idles and sets
 *              every situation aside
 *   shortcuts  the competent program, with every shortcut offered taken, the
 *              foreman's plot cards signed, and the report spun
 *   fraud      delivers the planting and the declarations but skips fill,
 *              sprays half the release program, takes every shortcut, signs
 *              the foreman's plot cards, and spins the report
 *
 * The point is that the three separate: competent grades A, fraud that gets
 * caught is punished, neglect fails.
 *
 *   node scripts/simulate-silviculture-policies.mjs                 # every area, 6 seeds
 *   node scripts/simulate-silviculture-policies.mjs --runs 12 --area kootenay-wetbelt
 */

import { createSilvicultureJourney } from '../js/journey/factory.js';
import { runSilvicultureDay } from '../js/modes/silviculture.js';
import { checkEndConditions } from '../js/modes/shared/endConditions.js';
import { calculateScore, getLetterGrade } from '../js/scoring.js';
import { resolveFinalReport } from '../js/game/debrief.js';
import { summarizeIntegrity } from '../js/modes/silvicultureIntegrity.js';
import { OPERATING_AREAS } from '../js/data/operatingAreas.js';

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

function brushRatio(journey) {
  return (journey.brushing?.hectaresComplete || 0) / Math.max(1, journey.brushing?.hectaresTarget || 1);
}

function calendar(journey) {
  return Math.min(1, (journey.day || 1) / (journey.deadline || 42));
}

/** The competent supervisor's day, shared by the competent and fraud players. */
function programDay(journey, options, { skipFill = false, releaseCap = 1 } = {}) {
  const behind = calendar(journey) - brushRatio(journey);
  const releaseOpen = brushRatio(journey) < releaseCap;
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

function subPrompt(journey, options, prompt, { method = null, call = [] } = {}) {
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
    return pick(options, manual ? ['manual', 'glyphosate', 'sheep'] : ['glyphosate', 'manual', 'sheep']) || options[0];
  }
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
      if (!options.length) return { value: undefined };
      if (options.length === 1) return options[0];
      return policy.choose(journey, options, String(prompt || ''), memory) || options[0];
    },
  };
}

/**
 * One graded run.
 * @returns {{area, policy, seed, won, days, reason, score, grade, integrity}}
 */
export async function runPolicy(policyName, areaId, seed, { scale } = {}) {
  const policy = POLICIES[policyName];
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    const journey = createSilvicultureJourney({ areaId, scale });
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
      won,
      days: journey.day - 1,
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
  const runs = Number(argv[argv.indexOf('--runs') + 1]) || 6;
  const areaArg = argv.includes('--area') ? argv[argv.indexOf('--area') + 1] : null;
  const scale = argv.includes('--scale') ? argv[argv.indexOf('--scale') + 1] : undefined;
  const areas = areaArg ? [areaArg] : OPERATING_AREAS.map((area) => area.id);

  console.log(`${'area'.padEnd(26)} ${'policy'.padEnd(10)} wins  grades            mean  caught  pulled`);
  for (const areaId of areas) {
    for (const policyName of Object.keys(POLICIES)) {
      const results = [];
      for (let i = 0; i < runs; i += 1) results.push(await runPolicy(policyName, areaId, 4000 + i * 53, { scale }));
      const grades = results.map((result) => result.grade).sort().join('');
      const mean = Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length);
      const caught = results.filter((result) => result.integrity.caughtFalseRecords + result.integrity.caughtShortcuts > 0).length;
      const pulled = results.filter((result) => result.integrity.programPulled).length;
      console.log(`${areaId.padEnd(26)} ${policyName.padEnd(10)} ${String(results.filter((r) => r.won).length).padStart(2)}/${runs}  ${grades.padEnd(16)}  ${String(mean).padStart(4)}  ${String(caught).padStart(6)}  ${String(pulled).padStart(6)}`);
    }
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  main();
}
