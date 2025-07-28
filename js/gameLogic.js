import { GameState, FirstNation, HarvestBlock } from './gameModels.js';
import { ask, askChoice, formatVolume } from './utils.js';
import { natural_disasters_during_harvest } from './events.js';

/**
 * Initial region selection with region-specific setup.
 * @param {GameState} state The game state.
 * @param {(text: string) => void} write
 */
export async function choose_region(state, write) {
  const terminal = document.getElementById("terminal");
  const input = document.getElementById("input");
  const idx = await askChoice("Where will you operate?", [
    "Sub-Boreal Spruce (SBS) - High AAC, declining fast due to beetle kill",
    "Interior Douglas-fir (IDF) - Moderate AAC, wildfire risk",
    "Montane Spruce (MS) - Lower AAC, complex First Nations territories",
  ], terminal, input);

  const regions = ["SBS", "IDF", "MS"];
  state.region = regions[idx];

  if (idx === 0) {
    state.annual_allowable_cut = 200000;
    state.aac_decline_rate = 0.05;
    state.first_nations.push(
      new FirstNation({ name: "Carrier Nation", relationship_level: 0.6, treaty_area: false }),
      new FirstNation({ name: "Takla Nation", relationship_level: 0.4, treaty_area: false })
    );
  } else if (idx === 1) {
    state.annual_allowable_cut = 120000;
    state.aac_decline_rate = 0.025;
    state.first_nations.push(
      new FirstNation({ name: "Secwepemc Nation", relationship_level: 0.5, treaty_area: true }),
      new FirstNation({ name: "Okanagan Nation", relationship_level: 0.3, treaty_area: true })
    );
  } else {
    state.annual_allowable_cut = 80000;
    state.aac_decline_rate = 0.02;
    state.disturbance_cap = 30000;
    state.first_nations.push(
      new FirstNation({ name: "Treaty 8 Nation", relationship_level: 0.3, treaty_area: true }),
      new FirstNation({ name: "Kaska Nation", relationship_level: 0.4, treaty_area: false })
    );
  }
}

/**
 * Initial company setup and planning decisions.
 * @param {GameState} state The game state.
 * @param {(text: string) => void} write
 */
export async function initial_setup(state, write) {
  const terminal = document.getElementById("terminal");
  const input = document.getElementById("input");
  const fspIdx = await askChoice(
    "How detailed will your Forest Stewardship Plan be?",
    [
      "Minimal plan (cheaper, less commitment)",
      "Comprehensive plan with ecosystem commitments",
    ],
    terminal,
    input
  );

  if (fspIdx === 0) {
    state.budget -= 10000;
    state.reputation -= 0.1;
  } else {
    state.budget -= 30000;
    state.reputation += 0.1;
    state.permit_bonus += 0.05;
  }

  const heritageIdx = await askChoice(
    "Archaeological assessments under the Heritage Conservation Act?",
    [
      "Minimal survey ($5,000)",
      "Full assessment ($15,000)",
    ],
    terminal,
    input
  );

  if (heritageIdx === 0) {
    state.budget -= 5000;
    state.reputation -= 0.05;
    state.permit_bonus -= 0.1;
  } else {
    state.budget -= 15000;
    state.reputation += 0.05;
    state.permit_bonus += 0.05;
  }
}

/**
 * @param {GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function plan_harvest_schedule(state, write, terminal, input) {
  write(`--- HARVEST PLANNING (Year ${state.year}) ---`);
  write(`Current Annual Allowable Cut: ${formatVolume(state.annual_allowable_cut)}`);

  const available_cut = Math.min(state.annual_allowable_cut, state.mill_capacity);
  const idx = await askChoice(
    "How much volume do you want to schedule for harvest?",
    [
      `Conservative: ${formatVolume(available_cut * 0.6)}`,
      `Moderate: ${formatVolume(available_cut * 0.8)}`,
      `Aggressive: ${formatVolume(available_cut)}`,
    ],
    terminal,
    input
  );

  const volumes = [available_cut * 0.6, available_cut * 0.8, available_cut];
  const planned_volume = volumes[idx];

  let remaining_volume = planned_volume;
  let block_count = 0;
  while (remaining_volume > 0 && block_count < 20) {
    block_count++;
    const target_size = Math.min(remaining_volume, Math.random() * 40000 + 10000);
    const block = new HarvestBlock({
      id: `${state.region}-${state.year}Q${state.quarter}-${block_count}`,
      volume_m3: target_size,
      year_planned: state.year,
      old_growth_affected: Math.random() < 0.3,
    });
    state.harvest_blocks.push(block);
    remaining_volume -= target_size;
  }
}

/**
 * @param {GameState} state
 * @param {(text: string) => void} write
 */
export function conduct_harvest_operations(state, write) {
  const approved_blocks = state.harvest_blocks.filter(
    (b) => b.permit_status === "approved"
  );
  if (!approved_blocks.length) {
    write("No approved blocks to harvest.");
    return;
  }

  write("--- HARVEST OPERATIONS ---");
  const volume_loss_factor = natural_disasters_during_harvest(state, approved_blocks, write);
  let total_volume = 0;
  for (const block of approved_blocks) {
    let effective_volume = block.volume_m3;
    if (block.disaster_affected) {
      effective_volume *= 1 - block.volume_loss_percent;
    }
    total_volume += effective_volume;
  }

  const revenue = total_volume * state.revenue_per_m3;
  const costs = total_volume * state.operating_cost_per_m3;
  const net_profit = revenue - costs;

  state.budget += net_profit;
  state.total_revenue += revenue;
  state.total_costs += costs;
  state.quarterly_profit = net_profit;

  if (net_profit > 0) {
    state.consecutive_profitable_years++;
  } else {
    state.consecutive_profitable_years = 0;
  }

  write(`Harvested ${formatVolume(total_volume)}`);
  write(`Revenue: ${formatVolume(revenue)}`);
  write(`Costs: ${formatVolume(costs)}`);
  write(`Net profit: ${formatVolume(net_profit)}`);

  state.harvest_blocks = state.harvest_blocks.filter(
    (b) => b.permit_status !== "approved"
  );
}

/**
 * Annual management decisions
 * @param {GameState} state The game state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function annual_management_decisions(state, write, terminal, input) {
  if (state.quarter === 4) {
    write("\n--- ANNUAL MANAGEMENT DECISIONS ---");
    
    // AAC decline
    state.annual_allowable_cut *= (1 - state.aac_decline_rate);
    write(`📉 AAC declined by ${(state.aac_decline_rate * 100).toFixed(1)}% to ${formatVolume(state.annual_allowable_cut)}`);
    
    // Equipment maintenance
    const maintenanceCost = 50000;
    if (state.budget >= maintenanceCost) {
      const choice = await askChoice(
        "Annual equipment maintenance ($50,000)?",
        ["Yes - maintain equipment", "No - defer maintenance"],
        terminal,
        input
      );
      if (choice === 0) {
        state.budget -= maintenanceCost;
        state.equipment_condition = Math.min(1.0, state.equipment_condition + 0.2);
        write("✅ Equipment maintained");
      } else {
        state.equipment_condition = Math.max(0.3, state.equipment_condition - 0.3);
        state.safety_violations++;
        write("⚠️ Equipment condition deteriorating");
      }
    }
  }
}

/**
 * Quarter end summary
 * @param {GameState} state The game state
 * @param {(text: string) => void} write
 */
export async function quarter_end_summary(state, write) {
  write("\n--- QUARTER SUMMARY ---");
  write(`Budget: ${formatCurrency(state.budget)}`);
  write(`Reputation: ${state.reputation.toFixed(2)}`);
  write(`Safety record: ${state.safety_violations} violations`);
  
  if (state.quarterly_profit !== 0) {
    const profitEmoji = state.quarterly_profit > 0 ? "📈" : "📉";
    write(`${profitEmoji} Quarterly profit: ${formatCurrency(state.quarterly_profit)}`);
  }
  
  // First Nations relationships
  let avgRelationship = 0;
  state.first_nations.forEach(fn => {
    avgRelationship += fn.relationship_level;
  });
  avgRelationship /= state.first_nations.length;
  write(`First Nations relations: ${(avgRelationship * 100).toFixed(0)}%`);
}

/**
 * Check win/loss conditions
 * @param {GameState} state The game state
 * @returns {[boolean, string]} [gameOver, message]
 */
export function check_win_conditions(state) {
  // Loss conditions
  if (state.budget < -500000) {
    return [true, "GAME OVER: Company bankrupt! Debts exceed $500,000"];
  }
  
  if (state.reputation <= 0) {
    return [true, "GAME OVER: Company reputation destroyed! Social license revoked"];
  }
  
  if (state.safety_fatalities >= 3) {
    return [true, "GAME OVER: Too many workplace fatalities! Operations shut down"];
  }
  
  // Check if all First Nations relationships are below 20%
  const allRelationshipsBad = state.first_nations.every(fn => fn.relationship_level < 0.2);
  if (allRelationshipsBad) {
    return [true, "GAME OVER: All First Nations oppose your operations! Blockades prevent any work"];
  }
  
  // Win conditions
  if (state.year >= 10 && state.budget > 5000000) {
    return [true, "VICTORY: You've built a successful forestry empire! Over $5M in assets after 10 years"];
  }
  
  if (state.consecutive_profitable_years >= 8) {
    return [true, "VICTORY: 8 consecutive profitable years! You've mastered sustainable forestry"];
  }
  
  return [false, ""];
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-CA', { 
    style: 'currency', 
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}
