import { GameState, FirstNation, HarvestBlock } from './gameModels.js';
import { ask, askChoice, formatVolume, formatCurrency, safeAddBudget, safeNumber } from './utils.js';
import { natural_disasters_during_harvest } from './events.js';
import { ceo_management } from './ceo.js';
import { get_output_penalty_multiplier } from './scenarios.js';

/**
 * Initial region selection with region-specific setup.
 * @param {GameState} state The game state.
 * @param {(text: string) => void} write
 */
export async function choose_region(state, write, terminal = null, input = null) {
  if (!terminal || !input) {
    try {
      terminal = terminal || document.getElementById("terminal");
      input = input || document.getElementById("input");
    } catch {}
  }
  const idx = await askChoice("Where will you operate?", [
    "Sub-Boreal Spruce (SBS) - High AAC, declining fast due to beetle kill",
    "Interior Douglas-fir (IDF) - Moderate AAC, wildfire risk",
    "Montane Spruce (MS) - Lower AAC, complex First Nations territories",
  ], terminal, input);

  const regions = ["SBS", "IDF", "MS"];
  state.region = regions[idx];

  if (idx === 0) {
    state.annual_allowable_cut = 200000;
    state.aac_decline_rate = 0.015; // reduced base decline
    state.first_nations.push(
      new FirstNation({ name: "Carrier Nation", relationship_level: 0.6, treaty_area: false }),
      new FirstNation({ name: "Takla Nation", relationship_level: 0.4, treaty_area: false })
    );
  } else if (idx === 1) {
    state.annual_allowable_cut = 120000;
    state.aac_decline_rate = 0.012; // reduced base decline
    state.first_nations.push(
      new FirstNation({ name: "Secwepemc Nation", relationship_level: 0.5, treaty_area: true }),
      new FirstNation({ name: "Okanagan Nation", relationship_level: 0.3, treaty_area: true })
    );
  } else {
    state.annual_allowable_cut = 80000;
    state.aac_decline_rate = 0.01; // reduced base decline
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
export async function initial_setup(state, write, terminal = null, input = null) {
  if (!terminal || !input) {
    try {
      terminal = terminal || document.getElementById("terminal");
      input = input || document.getElementById("input");
    } catch {}
  }
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
  natural_disasters_during_harvest(state, approved_blocks, write);

  let total_volume = 0;
  let total_revenue = 0;
  const harvest_details = {
    sawlogs: { volume: 0, revenue: 0 },
    pulp: { volume: 0, revenue: 0 },
    firewood: { volume: 0, revenue: 0 },
  };

  const weatherMultiplier = state.weather?.harvest_multiplier ?? 1.0;
  const outputPenalty = get_output_penalty_multiplier(state);
  for (const block of approved_blocks) {
    let effective_volume = block.volume_m3;
    if (block.disaster_affected) {
      effective_volume *= (1 - block.volume_loss_percent);
    }
    // Apply production modifiers from operations pace and morale
    const paceVolumeMultiplier = state.operations_pace === 'cautious' ? 0.9 : (state.operations_pace === 'aggressive' ? 1.12 : 1.0);
    let moraleMultiplier = 1.0;
    if (state.crew_morale > 0.7) moraleMultiplier = 1.05;
    if (state.crew_morale < 0.3) moraleMultiplier = 0.9;
    if (state.supplies_boost) moraleMultiplier += 0.02; // small temporary boost
    effective_volume *= paceVolumeMultiplier * moraleMultiplier * weatherMultiplier * outputPenalty;
    total_volume += effective_volume;

    for (const grade in block.log_grade_distribution) {
      const grade_volume = effective_volume * block.log_grade_distribution[grade];
      const grade_revenue = grade_volume * state.log_prices[grade];
      harvest_details[grade].volume += grade_volume;
      harvest_details[grade].revenue += grade_revenue;
      total_revenue += grade_revenue;
    }
  }

  const costs = total_volume * state.operating_cost_per_m3;
  const net_profit = total_revenue - costs;

  state.budget += net_profit;
  state.total_revenue += total_revenue;
  state.total_costs += costs;
  state.quarterly_profit = net_profit;

  if (net_profit > 0) {
    state.consecutive_profitable_years++;
  } else {
    state.consecutive_profitable_years = 0;
  }

  write(`TOTAL HARVESTED: ${formatVolume(total_volume)}`);
  write("--- Grade Breakdown ---");
  for (const grade in harvest_details) {
    if (harvest_details[grade].volume > 0) {
      write(`  ${grade.charAt(0).toUpperCase() + grade.slice(1)}: ${formatVolume(harvest_details[grade].volume)} -> ${formatCurrency(harvest_details[grade].revenue)}`);
    }
  }
  write("-----------------------");
  write(`Total Revenue: ${formatCurrency(total_revenue)}`);
  write(`Operating Costs: ${formatCurrency(costs)}`);
  write(`Net Profit: ${formatCurrency(net_profit)}`);

  state.harvest_blocks = state.harvest_blocks.filter(
    (b) => b.permit_status !== "approved"
  );
}

/**
 * Oregon Trail-style quarterly operations setup: pace, rations, supplies.
 * @param {GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function quarterly_operations_setup(state, write, terminal, input) {
  write("\n--- QUARTERLY OPERATIONS SETUP ---");
  // Operations pace selection
  const paceOptions = [
    `Cautious (safer, -10% output)`,
    `Normal (balanced)`,
    `Aggressive (faster, +12% output, higher risk)`,
    `Keep current (${state.operations_pace})`
  ];
  const paceChoice = await askChoice("Set operations pace:", paceOptions, terminal, input);
  if (paceChoice === 0) state.operations_pace = 'cautious';
  if (paceChoice === 1) state.operations_pace = 'normal';
  if (paceChoice === 2) state.operations_pace = 'aggressive';
  write(`Pace set to: ${state.operations_pace}`);

  // Update morale based on pace only (remove rations mechanics)
  let moraleDelta = 0;
  if (state.operations_pace === 'cautious') moraleDelta += 0.02;
  if (state.operations_pace === 'aggressive') moraleDelta -= 0.05;
  state.crew_morale = Math.max(0, Math.min(1, state.crew_morale + moraleDelta));
  write(`Crew morale adjusted: ${(state.crew_morale * 100).toFixed(0)}%`);

  // Disable any leftover supplies boost
  state.supplies_boost = false;
}

/**
 * Handle First Nations engagement options.
 * @param {GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
async function handle_first_nations_engagement(state, write, terminal, input) {
  write("\n--- FIRST NATIONS ENGAGEMENT ---");
  const engagement_options = [
    "Community contribution ($25,000)",
    "Offer Revenue Sharing (5% of quarterly profit)",
    "Fund a Guardian Program ($100,000)",
    "Cancel"
  ];

  const choice = await askChoice(
    "Choose an engagement strategy:",
    engagement_options,
    terminal,
    input
  );

  switch (choice) {
    case 0: // Community contribution
      if (state.budget >= 25000) {
        state.budget -= 25000;
        state.first_nations.forEach(fn => {
          fn.relationship_level = Math.min(1.0, fn.relationship_level + 0.05);
        });
        write("💰 Made a community contribution. Relationship with all nations slightly improved.");
      } else {
        write("Insufficient funds for a community contribution.");
      }
      break;
    case 1: // Revenue Sharing
      // This is a policy decision that will affect future profits.
      // For simplicity, we'll represent this as a one-time larger relationship boost and reputation gain.
      // A more complex implementation could track this as an ongoing commitment.
      if (state.quarterly_profit > 0) {
        const share = state.quarterly_profit * 0.05;
        if (state.budget >= share) {
            state.budget -= share;
            state.first_nations.forEach(fn => {
                fn.relationship_level = Math.min(1.0, fn.relationship_level + 0.15);
            });
            state.reputation += 0.1;
            write(`💸 Shared ${formatCurrency(share)} with First Nations. Relationship and reputation significantly improved.`);
        } else {
            write("Insufficient funds to cover the revenue share this quarter.");
        }
      } else {
        write("No profits to share this quarter.");
      }
      break;
    case 2: // Guardian Program
      if (state.budget >= 100000) {
        state.budget -= 100000;
        state.first_nations.forEach(fn => {
          fn.relationship_level = Math.min(1.0, fn.relationship_level + 0.1);
        });
        state.reputation += 0.15;
        write("🌳 Funded a Guardian Program. Relationships and reputation improved significantly.");
      } else {
        write("Insufficient funds to establish a Guardian Program.");
      }
      break;
    case 3: // Cancel
      write("No action taken on First Nations engagement.");
      break;
  }
}

/**
 * Handle Silviculture investment options.
 * @param {GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
async function handle_silviculture_investments(state, write, terminal, input) {
    write("\n--- SILVICULTURE INVESTMENTS ---");
    const investment_options = [
        "Basic Reforestation ($50,000)",
        "Enhanced Silviculture ($150,000)",
        "Fertilization Trial ($75,000)",
        "Cancel"
    ];

    const choice = await askChoice(
        "Choose a silviculture investment:",
        investment_options,
        terminal,
        input
    );

    switch (choice) {
        case 0: // Basic Reforestation
            if (state.budget >= 50000) {
                state.budget -= 50000;
                state.aac_decline_rate = Math.max(0, state.aac_decline_rate - 0.005);
                write("🌲 Basic reforestation funded. Future AAC decline slightly reduced.");
            } else {
                write("Insufficient funds for reforestation.");
            }
            break;
        case 1: // Enhanced Silviculture
            if (state.budget >= 150000) {
                state.budget -= 150000;
                state.aac_decline_rate = Math.max(0, state.aac_decline_rate - 0.015);
                state.reputation += 0.05;
                write("🌳 Enhanced silviculture program initiated. AAC decline significantly reduced and reputation improved.");
            } else {
                write("Insufficient funds for enhanced silviculture.");
            }
            break;
        case 2: // Fertilization Trial
            if (state.budget >= 75000) {
                state.budget -= 75000;
                if (Math.random() < 0.6) {
                    // Positive outcome
                    state.log_prices.sawlogs *= 1.05; // Simulate higher quality timber in future
                    state.reputation += 0.02;
                    write("📈 Fertilization trial successful! Future sawlog quality expected to increase slightly.");
                } else {
                    // Negative outcome
                    state.reputation -= 0.1;
                    write("📉 Fertilization trial resulted in unexpected ecological damage. Reputation harmed.");
                }
            } else {
                write("Insufficient funds for a fertilization trial.");
            }
            break;
        case 3: // Cancel
            write("No silviculture investments made.");
            break;
    }
}

/**
 * Annual management decisions
 * @param {GameState} state The game state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function annual_management_decisions(state, write, terminal, input) {
  // Quarterly management decisions (every quarter)
  write("\n--- QUARTERLY MANAGEMENT ---");
  write("Choose your focus for this quarter:");
  
  const managementOptions = [
    "Focus on permit applications",
    "Engage with First Nations",
    "CEO management and hiring",
    "Silviculture Investments",
    "Pursue forest certification ($50,000)",
    "Conduct forest health monitoring ($30,000)",
    "Conduct voluntary safety audit ($15,000)",
    "Skip management activities this quarter"
  ];
  
  const choice = await askChoice(
    "Choose quarterly activity:",
    managementOptions,
    terminal,
    input
  );
  
  switch (choice) {
    case 0: // Permit applications
      if (state.harvest_blocks.filter(b => b.permit_status === "pending").length > 0) {
        write("Focusing on permit applications...");
        state.harvest_blocks.forEach(block => {
          if (block.permit_status === "pending" && Math.random() < 0.7) { // Increased chance
            block.permit_status = "approved";
            write(`Permit approved for block ${block.id}`);
          }
        });
      } else {
        write("No pending permits to work on.");
      }
      break;
      
    case 1: // First Nations relationship
      await handle_first_nations_engagement(state, write, terminal, input);
      break;
      
    case 2: // CEO management
      await ceo_management(state, write, terminal, input);
      break;

    case 3: // Silviculture Investments
      await handle_silviculture_investments(state, write, terminal, input);
      break;
      
    case 4: // Forest certification
      if (state.budget >= 50000 && !state.certifications.includes("FSC")) {
        state.budget -= 50000;
        if (Math.random() < 0.7) {
          state.certifications.push("FSC");
          state.reputation += 0.15;
          write("FSC certification obtained! Reputation improved.");
        } else {
          write("Certification application pending review.");
        }
      } else if (state.certifications.includes("FSC")) {
        write("Already FSC certified.");
      } else {
        write("Insufficient funds for certification.");
      }
      break;
      
    case 5: // Forest health monitoring
      if (state.budget >= 30000) {
        state.budget -= 30000;
        state.reputation += 0.05;
        write("Forest health monitoring completed. Slight reputation boost.");
      } else {
        write("Insufficient funds for monitoring.");
      }
      break;
      
    case 6: // Safety audit
      if (state.budget >= 15000) {
        state.budget -= 15000;
        if (state.safety_violations > 0) {
          state.safety_violations = Math.max(0, state.safety_violations - 1);
          write("Safety audit completed. Violations reduced.");
        } else {
          write("Safety audit completed. No violations found.");
        }
      } else {
        write("Insufficient funds for safety audit.");
      }
      break;
      
    case 7: // Skip
      write("No management activities this quarter.");
      break;
  }
  
  // Annual-specific decisions in Q4
  if (state.quarter === 4) {
    write("\n--- ANNUAL MANAGEMENT DECISIONS ---");
    
    // AAC decline
    state.annual_allowable_cut *= (1 - state.aac_decline_rate);
    write(`📉 AAC declined by ${(state.aac_decline_rate * 100).toFixed(1)}% to ${formatVolume(state.annual_allowable_cut)}`);
    
    // Equipment maintenance
    const maintenanceCost = 50000;
    if (state.budget >= maintenanceCost) {
      const maintenanceChoice = await askChoice(
        "Annual equipment maintenance ($50,000)?",
        ["Yes - maintain equipment", "No - defer maintenance"],
        terminal,
        input
      );
      if (maintenanceChoice === 0) {
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
export async function quarter_end_summary(state, write, terminal, input) {
  write("\n--- QUARTER SUMMARY ---");
  
  // Calculate upkeep with reduced operations mode
  let upkeep = 100000;
  if (state.reduced_operations_mode && state.reduced_operations_quarters > 0) {
    upkeep = 50000; // Half upkeep in reduced mode
    state.reduced_operations_quarters--;
    write(`⚠️ Reduced operations mode: ${state.reduced_operations_quarters} quarters remaining`);
    if (state.reduced_operations_quarters === 0) {
      state.reduced_operations_mode = false;
      write("Returning to normal operations next quarter.");
    }
  }
  
  // Apply loan interest
  if (state.loans_balance > 0) {
    const interest = Math.floor(state.loans_balance * state.loan_interest_rate);
    state.loans_balance += interest;
    write(`💸 Loan interest: ${formatCurrency(interest)} (Balance: ${formatCurrency(state.loans_balance)})`);
  }
  
  // Safe budget operations
  safeAddBudget(state, -upkeep, write, 'operational upkeep');
  write(`Operational upkeep: ${formatCurrency(upkeep)}`);
  
  // Carbon credits revenue
  if (state.carbon_credits_enrolled) {
    const carbonRevenue = Math.floor(state.annual_allowable_cut * 0.1 * 15); // $15 per m³ preserved
    safeAddBudget(state, carbonRevenue, write, 'carbon credits');
    write(`🌳 Carbon credits revenue: ${formatCurrency(carbonRevenue)}`);
  }
  
  // Insurance premium
  if (state.insurance_coverage) {
    safeAddBudget(state, -state.insurance_premium, write, 'insurance premium');
    write(`🛡️ Insurance premium: ${formatCurrency(state.insurance_premium)}`);
  }
  
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
  
  // Emergency options if budget is negative
  if (state.budget < 0 && terminal && input) {
    write("\n⚠️ WARNING: Your company is in debt!");
    const options = [];
    
    if (state.emergency_loans_taken < 3) {
      options.push(`Take emergency loan ($500,000 at 8% quarterly interest)`);
    }
    
    if (!state.reduced_operations_mode) {
      options.push("Enter reduced operations mode (50% upkeep for 4 quarters, -20% efficiency)");
    }
    
    if (!state.asset_liquidation_used) {
      options.push("Liquidate equipment ($300,000 immediate, +20% operating costs)");
    }
    
    if (state.loans_balance > 0) {
      options.push("Declare bankruptcy (Game Over)");
    }
    
    options.push("Continue without assistance (risky)");
    
    const choice = await askChoice("Choose emergency action:", options, terminal, input);
    
    if (options[choice].includes("emergency loan")) {
      const loanAmount = 500000;
      safeAddBudget(state, loanAmount, write, 'emergency loan');
      state.loans_balance += loanAmount;
      state.emergency_loans_taken++;
      write(`💰 Emergency loan received: ${formatCurrency(loanAmount)}`);
      write(`Total debt: ${formatCurrency(state.loans_balance)}`);
    } else if (options[choice].includes("reduced operations")) {
      state.reduced_operations_mode = true;
      state.reduced_operations_quarters = 4;
      state.operating_cost_per_m3 *= 1.2; // 20% efficiency loss
      write("📉 Entering reduced operations mode for 4 quarters");
      write("Upkeep costs halved, but efficiency reduced by 20%");
    } else if (options[choice].includes("Liquidate")) {
      const liquidationAmount = 300000;
      safeAddBudget(state, liquidationAmount, write, 'asset liquidation');
      state.asset_liquidation_used = true;
      state.operating_cost_per_m3 *= 1.2; // Permanent 20% increase
      write(`💵 Equipment liquidated for ${formatCurrency(liquidationAmount)}`);
      write("⚠️ Operating costs permanently increased by 20%");
    } else if (options[choice].includes("bankruptcy")) {
      state.budget = -1000000; // Trigger game over
      write("💀 Company declares bankruptcy...");
    }
  }
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
