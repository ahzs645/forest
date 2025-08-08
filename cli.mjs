#!/usr/bin/env node

// CLI runner for Forestry Simulator (headless auto-play)

import { GameState } from './js/gameModels.js';
import {
  choose_region,
  initial_setup,
  plan_harvest_schedule,
  conduct_harvest_operations,
  annual_management_decisions,
  quarter_end_summary,
  check_win_conditions,
  quarterly_operations_setup
} from './js/gameLogic.js';
import { EventsRouter } from './js/events.js';
import { process_permits } from './js/permits.js';
import { ongoing_first_nations_consultation } from './js/firstNations.js';
import { maintain_certifications } from './js/certification.js';
import { random_illegal_opportunities_event, ongoing_criminal_consequences, continue_illegal_operations } from './js/illegalActivities.js';
import { quarterly_wacky_events } from './js/wackyEvents.js';
import { ceo_automated_decisions, ceo_quarterly_report, pay_ceo_annual_costs } from './js/ceo.js';
import { random_first_nations_anger_events, check_anger_event_triggers } from './js/firstNationsAnger.js';
import { workplace_safety_incidents, ongoing_safety_consequences } from './js/workplaceSafety.js';
import { competitive_market_events } from './js/competitiveMarket.js';
import { story_progression } from './js/storyEvents.js';
import { strategic_management_decisions } from './js/strategicManagement.js';
import { ask } from './js/utils.js';
import { generate_quarter_weather } from './js/weather.js';
import { quarterly_special_scenarios, decay_temporary_effects } from './js/scenarios.js';

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return def;
};

const runs = parseInt(getArg('--runs', '3'), 10);
const maxQuarters = parseInt(getArg('--quarters', '16'), 10);
const profile = getArg('--profile', 'balanced');
const step = args.includes('--step');
const logAll = args.includes('--log') || args.includes('--log-full');

// Minimal terminal/input stubs
function createIO() {
  return {
    terminal: { textContent: '', scrollTop: 0, scrollHeight: 0 },
    input: { style: { display: 'none' }, value: '', focus: () => {} },
    write: (terminal) => (text) => { terminal.textContent += text + '\n'; }
  };
}

// Auto decision logic
function makeAuto(profile) {
  return {
    enabled: true,
    nextText: () => '',
    nextIndex: (q, options) => {
      // Some light heuristics
      const Q = (q || '').toLowerCase();
      const opts = options || [];
      const find = (s) => opts.findIndex(o => o.toLowerCase().includes(s));
      if (Q.includes('where will you operate')) return 0; // SBS
      if (Q.includes('stewardship plan')) return profile === 'aggressive' ? find('minimal') : find('comprehensive');
      if (Q.includes('archaeological') || Q.includes('heritage')) return profile === 'aggressive' ? find('minimal') : find('full');
      if (Q.includes('operations pace')) return profile === 'aggressive' ? find('aggressive') : find('normal');
      if (Q.includes('harvest') && Q.includes('schedule')) return profile === 'aggressive' ? opts.length - 1 : 1; // aggressive/moderate
      if (Q.includes('annual equipment maintenance')) return 0; // yes
      if (Q.includes('choose quarterly activity')) return 0; // permits focus by default
      if (Q.includes('continue to')) return 0; // yes continue
      // default random
      return Math.floor(Math.random() * opts.length);
    }
  };
}

async function runSimulation(runId, profile) {
  // Expose AUTO_PLAY for ui helpers
  global.window = { AUTO_PLAY: makeAuto(profile), innerWidth: 1024 };
  if (step) { global.window.AUTO_PLAY.enabled = false; }
  global.CLI_INTERACTIVE = step;
  global.requestAnimationFrame = (fn) => setTimeout(fn, 0);

  const { terminal, input, write: makeWrite } = createIO();
  const write = makeWrite(terminal);
  const state = new GameState();

  const eventsRouter = new EventsRouter();

  // Company name
  state.companyName = `CLI Co ${runId}`;

  await choose_region(state, write, terminal, input);
  await initial_setup(state, write, terminal, input);

  let quarterCount = 0;
  while (quarterCount < maxQuarters) {
    quarterCount++;
    // Setup
    await quarterly_operations_setup(state, write, terminal, input);
    const weather = generate_quarter_weather(state);
    write(`Weather: ${weather.description}`);

    // Seasonal actions
    if (state.quarter === 1) {
      await eventsRouter.random_policy_events(state, write, terminal, input);
      await ongoing_first_nations_consultation(state, write, terminal, input);
      await story_progression(state, write, terminal, input);
      await plan_harvest_schedule(state, write, terminal, input);
    } else if (state.quarter === 2 || state.quarter === 3) {
      await process_permits(state, write, terminal, input);
      await conduct_harvest_operations(state, write);
    } else {
      await maintain_certifications(state, write, terminal, input);
      await eventsRouter.market_fluctuations(state, write, terminal, input);
      if (state.fn_liaison) {
        const liaisonCost = state.fn_liaison.cost;
        if (state.budget >= liaisonCost) {
          state.budget -= liaisonCost;
          write(`Liaison fee paid: $${liaisonCost}`);
        } else {
          write(`Cannot afford liaison: ${state.fn_liaison.name} terminated`);
          state.fn_liaison = null;
        }
      }
      await pay_ceo_annual_costs(state, write);
    }

    await annual_management_decisions(state, write, terminal, input);
    await workplace_safety_incidents(state, write, terminal, input);
    await random_illegal_opportunities_event(state, write, terminal, input);
    await competitive_market_events(state, write, terminal, input);
    const angerChance = Math.max(0.05, 0.25 - state.community_support * 0.15);
    if (check_anger_event_triggers(state) || Math.random() < angerChance) {
      await random_first_nations_anger_events(state, write, terminal, input);
    }
    await ceo_automated_decisions(state, write);
    await ongoing_criminal_consequences(state, write);
    await ongoing_safety_consequences(state, write);
    await continue_illegal_operations(state, write, terminal, input);
    await strategic_management_decisions(state, write, terminal, input);
    await ceo_quarterly_report(state, write);
    await quarter_end_summary(state, write, terminal, input);
    decay_temporary_effects(state, write);

    if (step) {
      await ask('Press Enter to continue to next quarter...', terminal, input);
    }

    // Check win/loss
    const [gameOver] = check_win_conditions(state);
    if (gameOver) break;

    // advance time
    state.quarter++;
    if (state.quarter > 4) { state.quarter = 1; state.year++; }
  }

  return {
    log: terminal.textContent,
    budget: state.budget,
    reputation: state.reputation,
    community: state.community_support,
    year: state.year,
    quarter: state.quarter,
    safety_violations: state.safety_violations,
    certifications: state.certifications,
    region: state.region,
  };
}

async function main() {
  const results = [];
  for (let i = 0; i < runs; i++) {
    const res = await runSimulation(i + 1, profile);
    results.push(res);
    console.log(`\n=== RUN #${i + 1} SUMMARY ===`);
    console.log(`Year ${res.year} Q${res.quarter}`);
    console.log(`Budget: ${res.budget.toFixed(0)}`);
    console.log(`Reputation: ${(res.reputation * 100).toFixed(0)}%  Community: ${(res.community * 100).toFixed(0)}%`);
    console.log(`Safety violations: ${res.safety_violations}`);
    console.log(`Region: ${res.region}`);
    console.log('------------------------------');
    if (logAll) {
      console.log(`\n=== RUN #${i + 1} LOG ===`);
      console.log(res.log);
      console.log('=== END LOG ===');
    }
  }

  // Aggregate insights
  const avgBudget = results.reduce((s, r) => s + r.budget, 0) / results.length;
  const avgRep = results.reduce((s, r) => s + r.reputation, 0) / results.length;
  console.log(`\n=== AGGREGATE ===`);
  console.log(`Avg budget: ${avgBudget.toFixed(0)}`);
  console.log(`Avg reputation: ${(avgRep * 100).toFixed(0)}%`);
}

main().catch(err => { console.error(err); process.exit(1); });
