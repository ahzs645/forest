/**
 * Headless campaign harness: "A Year in the District", start to Year in Review.
 *
 * Drives the real campaign loop (js/game/campaign.js) — briefings, the four
 * deployments through the mode day-runners, the season bridge, crisis cards
 * and round consequences — with three play styles, and reports where each
 * style's years land. The question it answers is whether the year tier tracks
 * how the year was played: a careful year should usually end Solid or better,
 * a year of shortcuts and walked-away situations should never reach Solid.
 *
 *   node scripts/simulate-campaign.mjs                     # 4 styles x 9 areas x 4 seeds
 *   node scripts/simulate-campaign.mjs --seeds 8 --verbose
 *   node scripts/simulate-campaign.mjs --areas bulkley-valley,fraser-plateau --difficulty hard
 *
 * Play styles:
 *   good     — "Run it careful" every season; the competent role policies from
 *              simulate-expeditions.mjs for the day's work; on an authored
 *              card, the option that best protects relationships and the file,
 *              and never the shortcut.
 *   average  — "Balance the season"; the competent policies most days, but a
 *              third of the work menus and every authored card picked at random.
 *   terrible — "Push for delivery"; takes every shortcut on offer, walks away
 *              from every situation it can, and picks the day's work at random.
 *   idle     — "Push for delivery", then does as little as the menus allow:
 *              sets everything aside, ends the day, spends nothing. The year
 *              that used to finish at Progress 50 with Budget credit for thrift.
 */

import { runCampaign } from '../js/game/campaign.js';
import { OPERATING_AREAS } from '../js/data/index.js';
import { handleEvent } from '../js/modes/shared/handleEvent.js';
import { ROLES } from './simulate-expeditions.mjs';

// Every operating area: the three southern areas have planning block data
// now, so their fall files can be delivered like the northern six.
const DEFAULT_AREAS = OPERATING_AREAS.map((area) => area.id);
const PROMPT_CAP = 20000;
const STANCE_PROMPTS = new Set(['How do you brief the crew?', 'How do you set the season up?']);
const POLICY_BY_JOURNEY = {
  recon: ROLES.recon.policy,
  field: ROLES.recon.policy,
  silviculture: ROLES.silviculture.policy,
  planning: ROLES.planning.policy,
  permitting: ROLES.permitting.policy,
  desk: ROLES.permitting.policy,
};

function parseArgs(argv) {
  const args = { seeds: 4, areas: DEFAULT_AREAS, difficulty: 'normal', verbose: false, styles: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--seeds') args.seeds = Number(argv[++i]);
    else if (flag === '--areas') args.areas = argv[++i].split(',');
    else if (flag === '--difficulty') args.difficulty = argv[++i];
    else if (flag === '--styles') args.styles = argv[++i].split(',');
    else if (flag === '--verbose') args.verbose = true;
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

/** Standing read off an option's preview: relations and compliance, shortcuts, risk. */
function scoreOption(option) {
  const text = `${option.label || ''} ${option.description || ''}`;
  let score = 0;
  for (const match of text.matchAll(/([+-]\d+)\s*(relations|compliance|capital|professional standing)/gi)) {
    // A planner's compliance prints as professional standing at half size.
    const weight = { compliance: 1.5, 'professional standing': 3 }[match[2].toLowerCase()] || 1;
    score += Number(match[1]) * weight;
  }
  for (const match of text.matchAll(/(Relationships|Compliance|Forest Health|Progress) ([+-]\d+)/g)) {
    score += Number(match[2]) * (match[1] === 'Progress' ? 0.5 : 1);
  }
  if (/offer:/i.test(text)) score -= 25;
  if (option.tag === 'RISKY' || /\[RISKY\]/.test(text)) score -= 3;
  return score;
}

const isShortcut = (option) => /offer:/i.test(option.description || '');
const realOptions = (options) => options.filter((option) => typeof option?.value !== 'symbol' && option.value !== 'detail');

function pickBest(options) {
  return options.reduce((best, option) => (scoreOption(option) > scoreOption(best) ? option : best), options[0]);
}

function pickWorst(options) {
  return options.reduce((worst, option) => (scoreOption(option) < scoreOption(worst) ? option : worst), options[0]);
}

const STYLES = {
  good: {
    stance: 0,
    card(options, rng, fallback) {
      const authored = options.filter((option) => typeof option.value === 'number');
      // A behind-schedule set-aside is still the competent call; otherwise
      // answer with the option that protects standing.
      if (fallback?.value === 'set_aside') return fallback;
      return authored.length ? pickBest(authored) : fallback;
    },
    menu: (options, rng, competent) => competent,
    crisis: (options) => pickBest(options),
  },
  average: {
    stance: 1,
    card(options, rng, fallback) {
      const pool = options.filter((option) => typeof option.value === 'number' || option.value === 'set_aside');
      return pool.length ? pool[Math.floor(rng() * pool.length)] : fallback;
    },
    menu: (options, rng, competent) => (rng() < 0.33 ? options[Math.floor(rng() * options.length)] : competent),
    crisis: (options, rng) => options[Math.floor(rng() * options.length)],
  },
  terrible: {
    stance: 2,
    card(options) {
      const shortcut = options.find(isShortcut);
      if (shortcut) return shortcut;
      const setAside = options.find((option) => option.value === 'set_aside');
      if (setAside) return setAside;
      const authored = options.filter((option) => typeof option.value === 'number');
      return authored.length ? pickWorst(authored) : options[0];
    },
    menu: (options, rng) => {
      const setAside = options.find((option) => option.value === 'set_aside');
      if (setAside) return setAside;
      return options[Math.floor(rng() * options.length)];
    },
    crisis: (options) => pickWorst(options),
  },
  idle: {
    stance: 2,
    card(options) {
      return options.find((option) => option.value === 'set_aside')
        || pickWorst(options.filter((option) => typeof option.value === 'number'))
        || options[0];
    },
    menu(options, rng) {
      const idle = options.find((option) => /^(set_aside|end|end_day|end_shift|rest|camp_back|desk_back|support_back|cancel|wait|done|continue|next)$/.test(String(option.value)));
      return idle || options[Math.floor(rng() * options.length)];
    },
    crisis: (options) => pickWorst(options),
  },
};

function makeCampaignUi(game, style, areaIndex, difficulty, rng, trace = null) {
  const noop = () => {};
  const write = trace ? (text) => { if (typeof text === 'string') trace(text); } : noop;
  let prompts = 0;
  const recent = [];
  let lastKey = '';
  let repeats = 0;
  return {
    campaignBanner: null,
    write, writeHeader: write, writeWarning: write, writePositive: write, writeDanger: write,
    writeBox: write, writeInfo: write, writeDivider: write, writeSuccess: write, clear: noop,
    updateAllStatus: noop, playEventVignette: noop, playTravelStrip: noop, playRadioAction: noop,
    setMissionStatus: undefined, clearMissionStatus: noop,
    async promptText() { return 'Harness Crew'; },
    async promptChoice(prompt, options = []) {
      prompts += 1;
      recent.push(`${game.journey?.journeyType || '-'} d${game.journey?.day ?? '-'} ${prompt} [${options.map((o) => String(o.value)).join('|')}]`);
      if (recent.length > 8) recent.shift();
      if (prompts > PROMPT_CAP) throw new Error(`prompt cap hit (${PROMPT_CAP}); last prompts:\n${recent.join('\n')}`);
      if (!options.length) return { value: undefined };
      if (options.length === 1) return options[0];
      if (prompt === 'Operating area:') return options[areaIndex];
      if (prompt === 'Difficulty:') return options.find((option) => option.value === difficulty) || options[1];
      if (STANCE_PROMPTS.has(prompt)) return options[style.stance];

      const choices = realOptions(options);
      const journey = game.journey;
      // The competent recon policy prefers the ferry, and a ferry refused at
      // flood re-asks the same question forever (Tahltan). A player waits.
      const key = `${journey?.day}|${prompt}|${choices.map((o) => String(o.value)).join('|')}`;
      repeats = key === lastKey ? repeats + 1 : 0;
      lastKey = key;
      if (repeats >= 3) return choices[repeats % choices.length];
      // Outside a deployment (the banner is cleared for the review): a crisis
      // card or the year-end summary.
      if (!this.campaignBanner || !journey) {
        if (choices.some((option) => /district office/i.test(option.label || ''))) return choices[0];
        return style.crisis(choices, rng) || choices[0];
      }

      const competentPolicy = POLICY_BY_JOURNEY[journey.journeyType] || ROLES.recon.policy;
      const competent = competentPolicy(journey, options, String(prompt || '')) || options[0];
      const authoredCard = choices.some((option) => typeof option.value === 'number');
      if (authoredCard) return style.card(choices, rng, competent) || competent;
      return style.menu(choices, rng, competent) || competent;
    },
  };
}

export async function simulateCampaign({ style = 'good', areaId = 'fraser-plateau', difficulty = 'normal', seed = 1, trace = null } = {}) {
  const areaIndex = Math.max(0, OPERATING_AREAS.findIndex((area) => area.id === areaId));
  const original = Math.random;
  Math.random = seededRandom(seed);
  const policyRng = seededRandom(seed ^ 0x5bd1e995);
  try {
    const game = { journey: null, gameOver: false, victory: false, checkpoint() {} };
    game._handleEvent = (event) => handleEvent(game, event);
    game.ui = makeCampaignUi(game, STYLES[style], areaIndex, difficulty, policyRng, trace);
    const result = await runCampaign(game);
    return { style, areaId, difficulty, seed, ...result };
  } finally {
    Math.random = original;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const styles = args.styles || Object.keys(STYLES);
  const TIERS = ['outstanding', 'solid', 'mixed', 'stumbled'];

  for (const style of styles) {
    const results = [];
    for (const areaId of args.areas) {
      for (let i = 0; i < args.seeds; i += 1) {
        const run = await simulateCampaign({ style, areaId, difficulty: args.difficulty, seed: 4000 + i * 131 });
        results.push(run);
        if (args.verbose) {
          const m = run.yearMetrics || {};
          console.log(`  ${style} ${areaId} seed ${run.seed}: ${run.tier} delivered ${run.delivered}/4`
            + `  P${Math.round(m.progress)} FH${Math.round(m.forestHealth)} R${Math.round(m.relationships)}`
            + ` C${Math.round(m.compliance)} B${Math.round(m.budget)}`);
        }
      }
    }
    const counts = Object.fromEntries(TIERS.map((tier) => [tier, results.filter((run) => run.tier === tier).length]));
    const mean = (key) => Math.round(results.reduce((sum, run) => sum + Number(run.yearMetrics?.[key] || 0), 0) / results.length);
    const delivered = results.reduce((sum, run) => sum + (run.delivered || 0), 0) / results.length;
    console.log(
      `${style.padEnd(9)} n=${results.length}  `
      + TIERS.map((tier) => `${tier} ${counts[tier]}`).join(' · ')
      + `  | mean P${mean('progress')} FH${mean('forestHealth')} R${mean('relationships')} C${mean('compliance')} B${mean('budget')}`
      + `  delivered ${delivered.toFixed(1)}/4`
    );
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  main();
}
