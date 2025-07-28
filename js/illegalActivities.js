import { askChoice, formatCurrency } from "./utils.js";

class IllegalAct {
  constructor({
    name,
    description,
    cost_savings,
    detection_risk,
    reputation_penalty,
    fine_amount,
  }) {
    this.name = name;
    this.description = description;
    this.cost_savings = cost_savings;
    this.detection_risk = detection_risk;
    this.reputation_penalty = reputation_penalty;
    this.fine_amount = fine_amount;
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

  write("--- UNDER-THE-TABLE OPPORTUNITIES ---");
  write("WARNING: These activities violate forest practices regulations!");

  const all_illegal_acts = [
    new IllegalAct({
      name: "The Cathedral Grove Heist",
      description: "Harvest ancient trees from a protected old-growth area.",
      cost_savings: 850000,
      detection_risk: 0.6,
      reputation_penalty: 0.7,
      fine_amount: 2500000,
    }),
    new IllegalAct({
      name: "The Midnight Burial Ground Operation",
      description: "Harvest around indigenous burial sites.",
      cost_savings: 420000,
      detection_risk: 0.4,
      reputation_penalty: 0.8,
      fine_amount: 1800000,
    }),
    new IllegalAct({
      name: "Operation Timber Smuggler",
      description: "Create a secret timber laundering operation.",
      cost_savings: 1200000,
      detection_risk: 0.3,
      reputation_penalty: 0.6,
      fine_amount: 4500000,
    }),
  ];

  const available_acts = all_illegal_acts.slice(0, 2); // Simplified

  const options = available_acts.map((act) => `Commit to ${act.name}`);
  options.push("Decline all illegal activities");

  const choice = await askChoice("Choose your approach:", options, terminal, input);

  if (choice === available_acts.length) {
    write("Maintaining legal compliance and ethical standards");
    state.reputation += 0.05;
    return false;
  }

  const chosen_act = available_acts[choice];
  write(`Proceeding with: ${chosen_act.name}`);

  return execute_illegal_act(state, chosen_act, write);
}

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {IllegalAct} act
 * @param {(text: string) => void} write
 */
function execute_illegal_act(state, act, write) {
  write("--- ROLLING THE DICE ---");

  const detection_risk = act.detection_risk;
  write(`Final detection risk: ${(detection_risk * 100).toFixed(0)}%`);
  state.budget += act.cost_savings;
  write(`Gained ${formatCurrency(act.cost_savings)} from illegal activity`);

  const detected = Math.random() < detection_risk;

  if (detected) {
    write("ILLEGAL ACTIVITY DETECTED!");
    return handle_detection(state, act, write);
  } else {
    write("Activity went unnoticed... for now");
    state.reputation -= 0.1;
    return true;
  }
}

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {IllegalAct} act
 * @param {(text: string) => void} write
 */
function handle_detection(state, act, write) {
  write("--- FOREST PRACTICES BOARD INVESTIGATION ---");

  const fine = act.fine_amount;
  const reputation_damage = act.reputation_penalty;

  write(`Fine imposed: ${formatCurrency(fine)}`);
  write(`Reputation damage: -${reputation_damage.toFixed(1)}`);

  state.budget -= fine;
  state.reputation -= reputation_damage;

  if (state.budget < 0) {
    write("Company bankruptcy due to fines and legal costs!");
    return false;
  }

  if (state.reputation < 0.1) {
    write("Total loss of social license to operate!");
    return false;
  }

  return true;
}

/**
 * Process ongoing criminal consequences
 * @param {import("./gameModels.js").GameState} state 
 * @param {(text: string) => void} write 
 */
export async function ongoing_criminal_consequences(state, write) {
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
