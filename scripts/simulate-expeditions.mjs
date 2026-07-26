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
      const picked = policy(journey, options, String(prompt || ''));
      // A policy that returns nothing has gone blind — usually because an
      // option value was renamed underneath it. The old fallback to options[0]
      // hid that completely: renaming walk_away to set_aside silently took
      // recon from 17/24 to 5/24 and looked like a balance regression rather
      // than a broken policy. Count it so the harness can report it.
      // Only a NAMED menu counts. Authored event cards carry numeric option
      // indices that no policy has vocabulary for by design, so counting those
      // buries the signal under expected misses.
      // The day card appends a free "More context" option whose value is a
      // Symbol sentinel (js/journey/dayCard.js). Ignoring it matters: testing
      // every option for a string value excluded every card from the metric
      // and left only dynamic sub-prompts, which reported planning as 100%
      // blind when its real menus were being handled fine.
      const named = options.filter((option) => typeof option?.value !== 'symbol');
      const namedMenu = named.length > 0 && named.every((option) => typeof option.value === 'string');
      if (!picked && namedMenu) {
        tally.__fellThrough = (tally.__fellThrough || 0) + 1;
      }
      if (namedMenu) {
        tally.__namedDecisions = (tally.__namedDecisions || 0) + 1;
      }
      const chosen = picked || options[0];
      tally[chosen.value] = (tally[chosen.value] || 0) + 1;
      return chosen;
    }
  };
}

/**
 * Triage: should this policy decline the day's situation?
 *
 * Every mode's day can now open with an authored situation that costs the day
 * to answer, plus an explicit way to decline it (js/journey/daySituation.js).
 * A policy that answers everything spends its whole season on the radio and
 * delivers nothing, so model the call a competent professional makes: when the
 * file is running behind the calendar, wear the scrutiny and keep the day.
 *
 * @param {Object} journey
 * @param {Array} options
 * @param {number} progress - 0-1, how much of the mode's actual job is done
 * @returns {Object|null} the set-aside option, or null to answer the situation
 */
function maybeSetAside(journey, options, progress) {
  const setAside = options.find((option) => option.value === 'set_aside');
  if (!setAside) return null;
  const deadline = journey.deadline || 30;
  const elapsed = (journey.day || 1) / deadline;
  return progress < elapsed ? setAside : null;
}

/**
 * The option values each policy steers by.
 *
 * Every policy here picks options by `value` string, so renaming one in a mode
 * silently blinds the policy: it stops recognising the decision and takes
 * whatever is first on the list instead. That reads as a balance regression -
 * renaming walk_away to set_aside moved recon from 17/24 to 5/24 and looked
 * like the content had got harder.
 *
 * Counting fall-through does not catch it, because these policies end in an
 * explicit `options[0]` rather than returning null. So the vocabulary is
 * declared here and tests/policyVocabulary.test.mjs drives each mode for real
 * and asserts every value below still appears in the menus. Rename an option
 * and that test names it immediately.
 */
export const POLICY_VOCABULARY = {
  recon: ['set_aside', 'set_tempo', 'travel', 'ground_truth', 'camp_menu', 'end_shift'],
  planning: ['set_aside', 'desk_menu', 'end', 'professional_admin'],
  permitting: ['set_aside', 'end_day'],
  silviculture: ['set_aside', 'end'],
};

// ── Role policies ───────────────────────────────────────────────────────────

function reconPolicy(journey, options, prompt) {
  const crew = journey.crew || [];
  const hurting = crew.filter((member) => member.isActive && member.health < 45).length;
  const food = journey.resources?.food ?? 0;
  const equipment = journey.resources?.equipment ?? 100;
  // The quiet-shift card is the only prompt carrying 'set_tempo'. Detect on
  // that rather than on 'end_shift', which lives in the camp submenu now.
  const atQuietCard = options.some((option) => option.value === 'set_tempo');

  // The camp & crew submenu. Never back out empty-handed: the quiet card
  // would send us straight back in and the run would spin instead of
  // simulating.
  if (options.some((option) => option.value === 'camp_back')) {
    const wanted = [];
    // A crew that is falling over needs the shift off, not a kit. Standing
    // down is the only action that restores health and morale together, and
    // triage is gated on first-aid kits that a long run has usually spent.
    if (hurting >= 2) wanted.push('end_shift', 'triage');
    else if (hurting >= 1) wanted.push('triage', 'end_shift');
    if (food <= 12) wanted.push('food_cache');
    if (equipment <= 30) wanted.push('maintain');
    wanted.push('maintain', 'triage', 'food_cache', 'scout', 'end_shift');
    return pick(options, wanted) || options[0];
  }

  if (!atQuietCard) {
    // Ration policy: short rations only when the pantry is genuinely thin.
    // Two prompts ask this with different vocabularies - the forced low-food
    // beat offers full/short, the voluntary tempo prompt offers normal/short -
    // so resolve which word means "feed them properly" before picking, or the
    // fallback silently starves the crew on every single day.
    if (options.some((option) => option.value === 'short')) {
      const generous = options.some((option) => option.value === 'full') ? 'full' : 'normal';
      return pick(options, food <= 15 ? ['short', generous] : [generous, 'short']);
    }
    // Route, crossing, resupply, acknowledgements — prefer the safe line.
    const sub = pick(options, [
      'detour', 'mainline', 'scout', 'ford', 'keep',
      'rations', 'done', 'cancel', 'lean', 'skip', 'next', 'continue'
    ]);
    if (sub) return sub;
    // An authored event card. A competent crew lead does not deal with
    // everything: when the season is running ahead of the file, they drive on
    // and wear the scrutiny. Model that, or the policy spends every day of the
    // run answering the radio and finishes three blocks out of eleven.
    const setAside = maybeSetAside(
      journey,
      options,
      (journey.blocksAssessed || 0) / (journey.blocks?.length || 1)
    );
    if (setAside) return setAside;
    // Otherwise take the authored default.
    return options[0];
  }

  // A crew that is falling over covers no ground; recovering is the work.
  // Stand down, triage, maintenance and the ration cache all sit behind
  // 'camp_menu' now, so upkeep means opening that door.
  if (hurting >= 1 || equipment <= 30) {
    const care = pick(options, ['camp_menu']);
    if (care) return care;
  }
  if (food <= 12) {
    const feed = pick(options, ['resupply', 'camp_menu']);
    if (feed) return feed;
  }

  // Otherwise: finish the package under foot, then cover ground. Never picks
  // the free options (set_tempo, consult_map, briefing) — a policy that did
  // would spin the day against FREE_LOOKUPS_PER_DAY instead of simulating.
  return pick(options, [
    'ground_truth', 'values_sweep', 'travel', 'field_notebook',
    'end_shift', 'next', 'continue'
  ]);
}

function planningPolicy(journey, options) {
  const plan = journey.plan || {};
  const gates = (Math.min(1, (plan.dataCompleteness || 0) / 80)
    + Math.min(1, (plan.analysisQuality || 0) / 80)
    + Math.min(1, (plan.stakeholderBuyIn || 0) / 75)
    + Math.min(1, (plan.ministerialConfidence || 0) / 80)) / 4;
  const setAside = maybeSetAside(journey, options, gates);
  if (setAside) return setAside;

  const protagonist = journey.protagonist;
  if (protagonist && (protagonist.energy <= 25 || protagonist.stress >= 75)) {
    // Rest lives behind 'desk_menu' now, alongside the inbox and networking.
    const rest = pick(options, ['rest', 'desk_menu']);
    if (rest) return rest;
  }
  // Inside the desk submenu: never back out empty-handed or the day spins.
  if (options.some((option) => option.value === 'desk_back')) {
    const wanted = protagonist && (protagonist.energy <= 25 || protagonist.stress >= 75)
      ? ['rest', 'network', 'email']
      : ['network', 'email', 'rest'];
    return pick(options, wanted) || options[0];
  }
  return pick(options, [
    'submit', 'stakeholder', 'analyze', 'gather_data', 'outreach',
    'fom_review', 'values', 'balanced', 'professional_admin',
    'network', 'email', 'rest', 'end', 'next', 'continue'
  ]);
}

function permittingPolicy(journey, options) {
  const permits = journey.permits || {};
  const setAside = maybeSetAside(journey, options, (permits.approved || 0) / (permits.target || 1));
  if (setAside) return setAside;

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
  const planting = journey.planting || {};
  const setAside = maybeSetAside(
    journey,
    options,
    (planting.blocksPlanted || 0) / (planting.blocksToPlant || 1)
  );
  if (setAside) return setAside;

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

    // A blind policy reads as a balance regression, so say it out loud. Every
    // decision the policy failed to recognise was answered by taking the first
    // option on the list, which is not a competent player and not a measurement
    // of anything.
    const blind = results.reduce((sum, result) => sum + (result.tally.__fellThrough || 0), 0);
    const decisions = results.reduce((sum, result) => sum + (result.tally.__namedDecisions || 0), 0);
    const blindRate = decisions > 0 ? blind / decisions : 0;
    if (blind > 0) {
      const pct = (blindRate * 100).toFixed(1);
      console.log(`${' '.repeat(26)} POLICY BLIND on ${blind}/${decisions} decisions (${pct}%) — option values likely renamed underneath it`);
      // Reported, not enforced. Some fall-through is legitimate: block-selection
      // and triage sub-prompts carry dynamic values (block ids, contractor ids)
      // that no fixed vocabulary can cover, and taking the first option there is
      // a reasonable default rather than a bug. The hard guard against a
      // renamed option is tests/policyVocabulary.test.mjs, which drives the real
      // modes and names the missing value.
    }

    if (winRate < args.minWinRate) failed = true;
  }

  if (failed) process.exitCode = 1;
}

// Only run when invoked as a script. tests/policyVocabulary.test.mjs imports
// POLICY_VOCABULARY from here, and an unguarded main() meant importing a
// constant silently ran every simulation and set a failing exit code.
const invokedDirectly = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  main();
}

