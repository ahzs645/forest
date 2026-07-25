/**
 * Headless expedition balance harness.
 *
 * Drives the real mode day-runners (js/modes/*.js) with a competent-player
 * policy per role and reports how many days a deployment takes and how often
 * it lands. This is the tool that sized the deployments after a day became a
 * single action (js/journey/dayPlan.js): with one decision per day instead of
 * three or four, day counts and daily upkeep had to be re-measured rather
 * than guessed.
 *
 *   node scripts/simulate-expeditions.mjs                  # all roles, full length
 *   node scripts/simulate-expeditions.mjs --scale campaign # campaign-season deployments
 *   node scripts/simulate-expeditions.mjs --role recon --runs 12 --verbose
 *
 * Exits non-zero when a role's win rate falls under --min-win-rate, so it can
 * gate a rebalance.
 */

import {
  createReconJourney,
  createPlanningJourney,
  createPermittingJourney,
  createSilvicultureJourney
} from '../js/journey/factory.js';
import { runReconDay } from '../js/modes/recon.js';
import { runPlanningDay } from '../js/modes/planning.js';
import { runPermittingDay } from '../js/modes/permitting.js';
import { runSilvicultureDay } from '../js/modes/silviculture.js';
import { checkEndConditions } from '../js/modes/shared/endConditions.js';

const DEFAULT_AREA = 'fraser-plateau';
const HARD_DAY_CAP = 150;

function parseArgs(argv) {
  const args = { runs: 8, scale: undefined, role: null, verbose: false, minWinRate: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--runs') args.runs = Number(argv[++i]);
    else if (flag === '--scale') args.scale = argv[++i];
    else if (flag === '--role') args.role = argv[++i];
    else if (flag === '--verbose') args.verbose = true;
    else if (flag === '--min-win-rate') args.minWinRate = Number(argv[++i]);
  }
  return args;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function withSeed(seed, fn) {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

/** Find the first option whose value matches one of `wanted`, in order. */
function pick(options, wanted) {
  for (const want of wanted) {
    const index = options.findIndex((option) => {
      const value = String(option?.value ?? '');
      return want.endsWith(':') ? value.startsWith(want) : value === want;
    });
    if (index !== -1) return options[index];
  }
  return null;
}

/**
 * A UI that answers prompts from a role policy. Sub-prompts (route choice,
 * resupply, crossing) fall through to `fallback`, which prefers the safe,
 * supply-preserving option so a run fails on balance rather than on the
 * driver doing something a player never would.
 */
function makeUi(journey, policy, tally) {
  const noop = () => {};
  return {
    write: noop, writeHeader: noop, writeWarning: noop, writePositive: noop,
    writeDanger: noop, writeBox: noop, writeDivider: noop, clear: noop,
    updateAllStatus: noop, playEventVignette: noop, playScene: noop,
    playTravelStrip: noop, playRadioAction: noop, setMissionStatus: noop,
    clearMissionStatus: noop, writeSuccess: noop,
    async promptText() { return 'They loved this country'; },
    async promptChoice(prompt, options = []) {
      if (!options.length) return { value: undefined };
      if (options.length === 1) return options[0];
      const chosen = policy(journey, options, String(prompt || '')) || options[0];
      tally[chosen.value] = (tally[chosen.value] || 0) + 1;
      return chosen;
    }
  };
}

// ── Role policies ───────────────────────────────────────────────────────────

function reconPolicy(journey, options, prompt) {
  const crew = journey.crew || [];
  const hurting = crew.filter((member) => member.isActive && member.health < 45).length;
  const food = journey.resources?.food ?? 0;
  const equipment = journey.resources?.equipment ?? 100;
  const atShiftMenu = options.some((option) => option.value === 'end_shift');
  const inSupportMenu = options.some((option) => option.value === 'support_back');

  // The camp submenu. Never back out empty-handed: the shift menu would just
  // send us straight back in and the run would spin instead of simulating.
  if (inSupportMenu) {
    const wanted = [];
    if (food <= 12) wanted.push('food_cache');
    if (hurting >= 1) wanted.push('triage');
    wanted.push('maintain', 'food_cache', 'triage', 'scout');
    return pick(options, wanted) || options[0];
  }

  // Ration policy: short rations the moment the pantry is thin.
  if (!atShiftMenu && options.some((option) => option.value === 'full')) {
    return pick(options, food <= 15 ? ['short', 'full'] : ['full', 'short']);
  }

  // Other sub-prompts (route, crossing, resupply) — prefer the safe line.
  if (!atShiftMenu) {
    const sub = pick(options, ['detour', 'mainline', 'scout', 'ford', 'rations', 'done', 'cancel', 'next', 'continue']);
    if (sub) return sub;
  }

  // A crew that is falling over covers no ground; recovering is the work.
  if (hurting >= 2) {
    const care = pick(options, ['end_shift']);
    if (care) return care;
  }
  if (food <= 12) {
    const feed = pick(options, ['resupply', 'support_menu']);
    if (feed) return feed;
  }
  if (equipment <= 30) {
    const fix = pick(options, ['support_menu']);
    if (fix) return fix;
  }

  // Otherwise: finish the package under foot, then move on.
  return pick(options, [
    'ground_truth', 'values_sweep', 'field_notebook',
    'normal', 'slow', 'fast', 'end_shift', 'next', 'continue'
  ]);
}

function planningPolicy(journey, options) {
  const protagonist = journey.protagonist;
  if (protagonist && (protagonist.energy <= 25 || protagonist.stress >= 75)) {
    const rest = pick(options, ['rest']);
    if (rest) return rest;
  }
  return pick(options, [
    'submit', 'stakeholder', 'analyze', 'gather_data', 'outreach',
    'fom_review', 'values', 'balanced', 'professional_admin',
    'network', 'email', 'rest', 'end', 'next', 'continue'
  ]);
}

function permittingPolicy(journey, options) {
  const protagonist = journey.protagonist;
  const inSupportMenu = options.some((option) => option.value === 'support_back');
  if (inSupportMenu) {
    return pick(options, ['rest', 'team_morale', 'stakeholder_meeting', 'support_back']) || options[0];
  }
  if (protagonist && (protagonist.energy <= 20 || protagonist.stress >= 80)) {
    const rest = pick(options, ['support_menu']);
    if (rest) return rest;
  }

  // Deficiencies are answered when they stack up, not the instant one lands —
  // chasing every ticket the day it arrives starves the pipeline that produces
  // the approvals in the first place.
  const permits = journey.permits || {};
  if ((permits.needsRevision || 0) >= 3) {
    const revise = pick(options, ['revise_permit:']);
    if (revise) return revise;
  }

  return pick(options, [
    'follow_up_referrals', 'process_permits', 'submit_permit', 'draft_permit',
    'revise_permit:', 'professional_admin', 'support_menu', 'end_day',
    'next', 'continue'
  ]);
}

function silviculturePolicy(journey, options, prompt) {
  if (prompt.startsWith('Stand down ')) {
    return pick(options, ['cancel']) || options[0];
  }
  if (prompt === 'Adjust which contractor?') {
    const ready = options.find((option) => option.description?.startsWith('ready'));
    return ready || pick(options, ['cancel']) || options[options.length - 1];
  }
  if (prompt === 'Meet with which contractor?') {
    let best = options[0];
    let lowest = Infinity;
    for (const option of options) {
      const contractor = journey.contractors?.find((candidate) => candidate.id === option.value);
      if (contractor && contractor.morale < lowest) { lowest = contractor.morale; best = option; }
    }
    return best;
  }

  const canDeploy = (journey.contractors || []).some((contractor) => {
    const state = contractor.silvicultureState;
    return !contractor.isActive && state?.status !== 'recovering' && !(state?.cooldownDays > 0);
  });
  const wanted = ['plant', 'inspect', 'fill', 'herbicide', 'survey'];
  if (canDeploy) wanted.push('rotation');
  wanted.push('meeting', 'team_briefing', 'end', 'next', 'continue');
  return pick(options, wanted);
}

const ROLES = {
  recon: { create: createReconJourney, run: runReconDay, policy: reconPolicy, roleId: 'recce' },
  planning: { create: createPlanningJourney, run: runPlanningDay, policy: planningPolicy, roleId: 'planner' },
  permitting: { create: createPermittingJourney, run: runPermittingDay, policy: permittingPolicy, roleId: 'permitter' },
  silviculture: { create: createSilvicultureJourney, run: runSilvicultureDay, policy: silviculturePolicy, roleId: 'silviculture' }
};

/** A one-line read on how far a deployment actually got. */
function summarizeState(journey) {
  if (journey.permits) {
    const p = journey.permits;
    return `approved ${p.approved}/${p.target} backlog ${p.backlog} draft ${p.drafting} sub ${p.submitted}`
      + ` referral ${p.inReferral} review ${p.inReview} revisions ${p.needsRevision}`;
  }
  if (journey.plan) {
    return `data ${Math.round(journey.plan.dataCompleteness)} analysis ${Math.round(journey.plan.analysisQuality)}`
      + ` buyin ${Math.round(journey.plan.stakeholderBuyIn)} confidence ${Math.round(journey.plan.ministerialConfidence)}`;
  }
  if (journey.planting) {
    return `planted ${journey.planting.blocksPlanted}/${journey.planting.blocksToPlant}`
      + ` brush ${Math.round(journey.brushing.hectaresComplete)}/${journey.brushing.hectaresTarget}`
      + ` surveys ${journey.surveys.freeGrowingComplete}/${journey.surveys.freeGrowingTarget}`;
  }
  if (journey.blocks) {
    return `packages ${journey.blocksAssessed || 0}/${journey.blocks.length}`
      + ` km ${Math.round(journey.distanceTraveled)}/${Math.round(journey.totalDistance)}`
      + ` food ${Math.round(journey.resources?.food ?? 0)} fuel ${Math.round(journey.resources?.fuel ?? 0)}`;
  }
  return '';
}

async function simulateRun(roleName, seed, scale) {
  const role = ROLES[roleName];
  return withSeed(seed, async () => {
    const journey = role.create({ areaId: DEFAULT_AREA, roleId: role.roleId, scale });
    const tally = {};
    const game = {
      ui: makeUi(journey, role.policy, tally),
      journey,
      gameOver: false,
      checkpoint() {}
    };

    // The day runners only set isComplete for the wins they own; the main game
    // loop asks checkEndConditions after every day, so the harness must too or
    // a finished deployment reads as a run that simply stopped.
    let days = 0;
    let error = null;
    let outcome = null;
    while (!outcome && !game.gameOver && days < HARD_DAY_CAP) {
      try {
        await role.run(game);
      } catch (cause) {
        error = cause.message;
        break;
      }
      days += 1;
      outcome = checkEndConditions(journey);
    }

    return {
      seed,
      days,
      deadline: Number.isFinite(journey.deadline) ? journey.deadline : null,
      won: Boolean(outcome?.victory),
      reason: outcome?.reason || (error ? `error: ${error}` : null),
      state: summarizeState(journey),
      tally
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const roleNames = args.role ? [args.role] : Object.keys(ROLES);
  let failed = false;

  for (const roleName of roleNames) {
    if (!ROLES[roleName]) {
      console.error(`unknown role: ${roleName}`);
      process.exitCode = 2;
      return;
    }
    const results = [];
    for (let i = 0; i < args.runs; i += 1) {
      results.push(await simulateRun(roleName, 1000 + i * 37, args.scale));
    }

    const wins = results.filter((result) => result.won);
    const winRate = wins.length / results.length;
    const winDays = wins.map((result) => result.days).sort((a, b) => a - b);
    const median = winDays.length ? winDays[Math.floor(winDays.length / 2)] : null;
    const label = `${roleName}${args.scale ? ` (${args.scale})` : ''}`;

    console.log(
      `${label.padEnd(26)} win ${String(wins.length).padStart(2)}/${results.length}`
      + `  days ${winDays.length ? `${winDays[0]}-${winDays[winDays.length - 1]} (median ${median})` : '—'}`
      + `  deadline ${results[0].deadline ?? '—'}`
    );

    if (args.verbose) {
      for (const result of results) {
        const top = Object.entries(result.tally)
          .sort((a, b) => b[1] - a[1]).slice(0, 6)
          .map(([key, count]) => `${key}:${count}`).join(' ');
        console.log(`  seed ${result.seed} days=${result.days} won=${result.won} ${result.reason || ''}`);
        console.log(`    ${result.state}`);
        console.log(`    ${top}`);
      }
    } else {
      const losses = results.filter((result) => !result.won);
      const reasons = [...new Set(losses.map((result) => result.reason || 'ran out of days'))];
      if (reasons.length) console.log(`${' '.repeat(26)} losses: ${reasons.join(' | ')}`);
    }

    if (winRate < args.minWinRate) failed = true;
  }

  if (failed) process.exitCode = 1;
}

main();
