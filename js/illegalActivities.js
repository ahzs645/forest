import { askChoice, formatCurrency } from "./utils.js";

class SimpleIllegalAct {
  constructor({
    name,
    description,
    story,
    cost_savings,
    detection_risk,
    reputation_penalty,
    fine_amount,
  }) {
    this.name = name;
    this.description = description;
    this.story = story;
    this.cost_savings = cost_savings;
    this.detection_risk = detection_risk;
    this.reputation_penalty = reputation_penalty;
    this.fine_amount = fine_amount;
    this.type = "simple";
  }
}

class ComplexIllegalOperation {
  constructor({
    name,
    description,
    story,
    stages,
    total_profit,
    base_risk,
    complexity,
  }) {
    this.name = name;
    this.description = description;
    this.story = story;
    this.stages = stages;
    this.total_profit = total_profit;
    this.base_risk = base_risk;
    this.complexity = complexity;
    this.type = "complex";
    this.current_stage = 0;
    this.accumulated_risk = 0;
    this.accumulated_profit = 0;
  }
}

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function illegal_opportunities(state, write, terminal, input) {
  if (Math.random() > 0.6) {
    return false;
  }

  write("\n--- 🔴 ILLEGAL BUSINESS OPPORTUNITIES ---");
  write("💀 Various opportunities present themselves...");
  write("⚠️  Some are quick wins, others are complex operations");

  // Simple illegal operations
  const simple_operations = [
    new SimpleIllegalAct({
      name: "Harvest Buffer Zone Violation",
      description: "Cut trees within 30m of streams (Save: $180,000)",
      story: "Your crew supervisor suggests 'adjusting' the buffer zone boundaries. Those extra trees near the creek are worth serious money.",
      cost_savings: 180000,
      detection_risk: 0.4,
      reputation_penalty: 0.2,
      fine_amount: 450000,
    }),
    new SimpleIllegalAct({
      name: "Exceed Cut Block Boundaries",
      description: "Harvest beyond approved limits (Save: $220,000)",
      story: "GPS shows premium timber just 50m beyond your boundary. Your crew chief says nobody will notice.",
      cost_savings: 220000,
      detection_risk: 0.3,
      reputation_penalty: 0.15,
      fine_amount: 550000,
    }),
    new SimpleIllegalAct({
      name: "Underreport Harvest Volumes",
      description: "Scale logs smaller to reduce fees (Save: $320,000)",
      story: "The scaling supervisor hints that reported volumes could be 'conservative'. 20% underreporting saves massive stumpage fees.",
      cost_savings: 320000,
      detection_risk: 0.2,
      reputation_penalty: 0.1,
      fine_amount: 800000,
    }),
    new SimpleIllegalAct({
      name: "Bypass Archaeological Assessment",
      description: "Skip heritage clearance (Save: $150,000)",
      story: "Archaeological assessment has been pending for 6 months. Your crew leader suggests just proceeding.",
      cost_savings: 150000,
      detection_risk: 0.5,
      reputation_penalty: 0.4,
      fine_amount: 600000,
    }),
  ];

  // Complex multi-stage operations
  const complex_operations = [
    new ComplexIllegalOperation({
      name: "Government Contract Kickback Scheme",
      description: "Multi-year corruption operation (Profit: $8.5M)",
      story: "A government official offers preferential treatment for timber licenses in exchange for regular payments.",
      stages: [
        { name: "Initial Contact", cost: 50000, profit: 0, risk_increase: 0.1 },
        { name: "First Timber License", cost: 100000, profit: 2000000, risk_increase: 0.15 },
        { name: "Expand Operation", cost: 200000, profit: 3000000, risk_increase: 0.2 },
        { name: "Final Payoff", cost: 150000, profit: 4000000, risk_increase: 0.3 },
      ],
      total_profit: 8500000,
      base_risk: 0.2,
      complexity: "extreme",
    }),
    new ComplexIllegalOperation({
      name: "Cross-Border Timber Laundering",
      description: "International smuggling ring (Profit: $5.2M)",
      story: "Export restricted old-growth timber through shell companies to overseas buyers at premium prices.",
      stages: [
        { name: "Setup Shell Companies", cost: 80000, profit: 0, risk_increase: 0.05 },
        { name: "First Shipment", cost: 150000, profit: 1500000, risk_increase: 0.1 },
        { name: "Establish Route", cost: 100000, profit: 2000000, risk_increase: 0.15 },
        { name: "Scale Operations", cost: 200000, profit: 2200000, risk_increase: 0.25 },
      ],
      total_profit: 5200000,
      base_risk: 0.3,
      complexity: "high",
    }),
    new ComplexIllegalOperation({
      name: "Tax Evasion Network",
      description: "Offshore profit hiding scheme (Profit: $3.8M)",
      story: "Your accountant knows people who can make profits 'disappear' through Caribbean shell companies.",
      stages: [
        { name: "Offshore Setup", cost: 100000, profit: 0, risk_increase: 0.08 },
        { name: "First Transfer", cost: 0, profit: 1200000, risk_increase: 0.1 },
        { name: "Expand Network", cost: 50000, profit: 1500000, risk_increase: 0.12 },
        { name: "Final Harvest", cost: 0, profit: 1200000, risk_increase: 0.15 },
      ],
      total_profit: 3800000,
      base_risk: 0.25,
      complexity: "moderate",
    }),
  ];

  // Mix simple and complex operations randomly
  const all_operations = [];
  
  // Add 2-3 random simple operations
  const simpleCount = Math.floor(Math.random() * 2) + 2;
  for (let i = 0; i < simpleCount && simple_operations.length > 0; i++) {
    const index = Math.floor(Math.random() * simple_operations.length);
    all_operations.push(simple_operations.splice(index, 1)[0]);
  }
  
  // Add 1-2 random complex operations if conditions allow
  if (state.year >= 2 && state.reputation > 0.3) {
    const complexCount = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < complexCount && complex_operations.length > 0; i++) {
      const index = Math.floor(Math.random() * complex_operations.length);
      all_operations.push(complex_operations.splice(index, 1)[0]);
    }
  }

  // Shuffle the operations
  all_operations.sort(() => Math.random() - 0.5);

  // Present options
  const options = all_operations.map(op => {
    if (op.type === "simple") {
      return op.description;
    } else {
      return `${op.description} [COMPLEX ${op.stages.length}-STAGE]`;
    }
  });
  options.push("Decline all illegal activities");

  const choice = await askChoice("\nChoose your path:", options, terminal, input);

  if (choice === all_operations.length) {
    write("\n✅ Maintaining legal compliance and ethical standards");
    state.reputation += 0.05;
    return true;
  }

  const chosen_operation = all_operations[choice];
  
  if (chosen_operation.type === "simple") {
    return await execute_simple_illegal_act(state, chosen_operation, write, terminal, input);
  } else {
    return await execute_complex_operation(state, chosen_operation, write, terminal, input);
  }
}

/**
 * Execute a simple illegal act
 * @param {import("./gameModels.js").GameState} state
 * @param {SimpleIllegalAct} act
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
async function execute_simple_illegal_act(state, act, write, terminal, input) {
  write(`\n--- ${act.name.toUpperCase()} ---`);
  write(act.story);
  
  const confirmChoice = await askChoice(
    "\n⚠️  Final decision:",
    ["Proceed with illegal activity", "Back out now"],
    terminal,
    input
  );
  
  if (confirmChoice === 1) {
    write("\nOperation cancelled.");
    return true;
  }

  write("\n🎲 ROLLING THE DICE...");
  
  state.budget += act.cost_savings;
  write(`💰 Gained ${formatCurrency(act.cost_savings)} from illegal activity`);
  
  const detected = Math.random() < act.detection_risk;
  
  if (detected) {
    write("\n🚨 ILLEGAL ACTIVITY DETECTED!");
    write("📰 Media outlets are reporting on your violations");
    
    state.budget -= act.fine_amount;
    state.reputation -= act.reputation_penalty;
    state.under_criminal_investigation = true;
    
    write(`💸 Fine imposed: ${formatCurrency(act.fine_amount)}`);
    write(`📉 Reputation damage: -${(act.reputation_penalty * 100).toFixed(0)}%`);
    
    if (state.budget < 0) {
      write("\n💀 COMPANY BANKRUPTCY due to fines!");
      return false;
    }
  } else {
    write("\n✅ Activity went unnoticed... for now");
    state.reputation -= 0.05;
  }
  
  return true;
}

/**
 * Execute a complex multi-stage operation
 * @param {import("./gameModels.js").GameState} state
 * @param {ComplexIllegalOperation} operation
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
async function execute_complex_operation(state, operation, write, terminal, input) {
  write(`\n--- ${operation.name.toUpperCase()} ---`);
  write(`💀 COMPLEXITY: ${operation.complexity.toUpperCase()}`);
  write(operation.story);
  write(`\n📊 Total potential profit: ${formatCurrency(operation.total_profit)}`);
  write(`⚠️  Base detection risk: ${(operation.base_risk * 100).toFixed(0)}%`);
  
  const startChoice = await askChoice(
    "\n🎯 Begin this operation?",
    ["Yes - Begin the operation", "No - Too risky"],
    terminal,
    input
  );
  
  if (startChoice === 1) {
    write("\nOperation cancelled.");
    return true;
  }
  
  // Store operation in game state for tracking
  if (!state.active_illegal_operations) {
    state.active_illegal_operations = [];
  }
  
  // Execute first stage
  const stage = operation.stages[0];
  write(`\n--- STAGE 1: ${stage.name} ---`);
  
  if (stage.cost > 0) {
    if (state.budget < stage.cost) {
      write("❌ Insufficient funds to begin operation!");
      return true;
    }
    state.budget -= stage.cost;
    write(`💸 Investment: ${formatCurrency(stage.cost)}`);
  }
  
  if (stage.profit > 0) {
    state.budget += stage.profit;
    write(`💰 Profit gained: ${formatCurrency(stage.profit)}`);
  }
  
  operation.accumulated_risk += stage.risk_increase;
  const detected = Math.random() < (operation.base_risk + operation.accumulated_risk);
  
  if (detected) {
    write("\n🚨 OPERATION COMPROMISED!");
    return handle_complex_operation_failure(state, operation, write);
  }
  
  write("\n✅ Stage 1 complete! Operation continues...");
  operation.current_stage = 1;
  operation.accumulated_profit += stage.profit;
  
  // Save operation for future quarters
  state.active_illegal_operations.push(operation);
  
  return true;
}

/**
 * Handle failure of complex operation
 * @param {import("./gameModels.js").GameState} state
 * @param {ComplexIllegalOperation} operation
 * @param {(text: string) => void} write
 */
function handle_complex_operation_failure(state, operation, write) {
  const fine = Math.floor(operation.total_profit * 1.5);
  const reputation_hit = 0.3 + (operation.complexity === "extreme" ? 0.2 : 0);
  
  write("📰 MAJOR SCANDAL BREAKS!");
  write(`💸 Fine and damages: ${formatCurrency(fine)}`);
  write(`📉 Reputation destroyed: -${(reputation_hit * 100).toFixed(0)}%`);
  
  state.budget -= fine;
  state.reputation -= reputation_hit;
  state.under_criminal_investigation = true;
  state.criminal_convictions++;
  
  if (state.budget < 0) {
    write("\n💀 COMPANY BANKRUPTCY!");
    return false;
  }
  
  return true;
}

/**
 * Continue active illegal operations
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function continue_illegal_operations(state, write, terminal, input) {
  if (!state.active_illegal_operations || state.active_illegal_operations.length === 0) {
    return;
  }
  
  for (const operation of state.active_illegal_operations) {
    if (operation.current_stage < operation.stages.length) {
      write(`\n--- ONGOING: ${operation.name} ---`);
      const stage = operation.stages[operation.current_stage];
      write(`Stage ${operation.current_stage + 1}: ${stage.name}`);
      
      const continueChoice = await askChoice(
        "Continue this operation?",
        ["Yes - Proceed", "No - Abandon operation"],
        terminal,
        input
      );
      
      if (continueChoice === 1) {
        write("Operation abandoned. No refunds!");
        state.active_illegal_operations = state.active_illegal_operations.filter(op => op !== operation);
        continue;
      }
      
      // Execute stage
      if (stage.cost > 0) {
        if (state.budget < stage.cost) {
          write("❌ Insufficient funds! Operation stalled.");
          continue;
        }
        state.budget -= stage.cost;
        write(`💸 Cost: ${formatCurrency(stage.cost)}`);
      }
      
      if (stage.profit > 0) {
        state.budget += stage.profit;
        write(`💰 Profit: ${formatCurrency(stage.profit)}`);
      }
      
      operation.accumulated_risk += stage.risk_increase;
      const detected = Math.random() < (operation.base_risk + operation.accumulated_risk);
      
      if (detected) {
        write("\n🚨 OPERATION COMPROMISED!");
        handle_complex_operation_failure(state, operation, write);
        state.active_illegal_operations = state.active_illegal_operations.filter(op => op !== operation);
        continue;
      }
      
      operation.current_stage++;
      operation.accumulated_profit += stage.profit;
      
      if (operation.current_stage >= operation.stages.length) {
        write(`\n🎉 ${operation.name} COMPLETE!`);
        write(`Total profit: ${formatCurrency(operation.accumulated_profit)}`);
        state.active_illegal_operations = state.active_illegal_operations.filter(op => op !== operation);
      } else {
        write("✅ Stage complete! Operation continues next quarter.");
      }
    }
  }
}

/**
 * Process ongoing criminal consequences
 * @param {import("./gameModels.js").GameState} state 
 * @param {(text: string) => void} write 
 */
export async function ongoing_criminal_consequences(state, write) {
  // Check for ongoing complex operations
  if (state.active_illegal_operations && state.active_illegal_operations.length > 0) {
    write(`\n⚠️  ${state.active_illegal_operations.length} illegal operations in progress`);
  }
  
  // Check if company is under criminal investigation
  if (state.under_criminal_investigation) {
    write("\n🚔 ONGOING CRIMINAL INVESTIGATION");
    write("Company operations are under scrutiny");
    state.reputation -= 0.02;
    
    // Random chance of charges being laid
    if (Math.random() < 0.1) {
      const fine = Math.floor(Math.random() * 500000) + 200000;
      state.budget -= fine;
      write(`⚖️ Criminal charges laid! Fine: ${formatCurrency(fine)}`);
      state.under_criminal_investigation = false;
      state.criminal_convictions++;
    }
  }
  
  // Past criminal convictions affect reputation
  if (state.criminal_convictions > 0) {
    state.reputation -= 0.01 * state.criminal_convictions;
  }
}