import { askChoice, formatCurrency } from "./utils.js";

class CEOProfile {
  constructor({
    name,
    background,
    annual_fee,
    profit_cut,
    decision_making,
    risk_tolerance,
    strengths,
    weaknesses,
  }) {
    this.name = name;
    this.background = background;
    this.annual_fee = annual_fee;
    this.profit_cut = profit_cut;
    this.decision_making = decision_making;
    this.risk_tolerance = risk_tolerance;
    this.strengths = strengths;
    this.weaknesses = weaknesses;
    this.years_employed = 0;
    this.performance_rating = 0.5;
  }
}

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function ceo_management(state, write, terminal, input) {
  if (!state.ceo) {
    write("No CEO currently employed.");
    const result = await offer_ceo_hiring(state, write, terminal, input);
    return result; // Return GAME_OVER if Don Kayne was hired
  } else {
    write(`Current CEO: ${state.ceo.name}`);
    write(`Background: ${state.ceo.background}`);
    write(`Years employed: ${state.ceo.years_employed.toFixed(1)}`);
    write(`Performance rating: ${(state.ceo.performance_rating * 100).toFixed(0)}%`);
    // CEO management options would go here
  }
}

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
async function offer_ceo_hiring(state, write, terminal, input) {
  write("--- CEO HIRING OPPORTUNITIES ---");

  // All available CEO candidates
  const all_ceo_candidates = [
    new CEOProfile({
      name: "Margaret Chen",
      background: "Former BC Ministry of Forests executive",
      annual_fee: 200000,
      profit_cut: 0.3,
      decision_making: "regulatory-focused",
      risk_tolerance: "conservative",
      strengths: ["Regulatory expertise", "Government relations"],
      weaknesses: ["Slow to innovate", "Risk-averse"],
    }),
    new CEOProfile({
      name: "James Running Bear", 
      background: "Indigenous forestry leader",
      annual_fee: 180000,
      profit_cut: 0.3,
      decision_making: "relationship-focused",
      risk_tolerance: "moderate",
      strengths: ["First Nations relations", "Community trust"],
      weaknesses: ["Limited international markets", "Conservative growth"],
    }),
    new CEOProfile({
      name: "Victoria Cross",
      background: "Former Wall Street investment banker",
      annual_fee: 350000,
      profit_cut: 0.45,
      decision_making: "profit-maximizing",
      risk_tolerance: "high",
      strengths: ["Financial engineering", "Market expansion", "Aggressive growth"],
      weaknesses: ["Poor community relations", "Regulatory conflicts"],
    }),
    new CEOProfile({
      name: "Dr. Elena Vasquez",
      background: "Environmental scientist and sustainability expert",
      annual_fee: 220000,
      profit_cut: 0.25,
      decision_making: "sustainability-focused",
      risk_tolerance: "low",
      strengths: ["Environmental compliance", "Green certifications", "Research partnerships"],
      weaknesses: ["Lower profit margins", "Slower operations"],
    }),
    new CEOProfile({
      name: "Marcus 'Tank' Thompson",
      background: "Former logging crew chief turned executive",
      annual_fee: 160000,
      profit_cut: 0.35,
      decision_making: "operations-focused",
      risk_tolerance: "moderate",
      strengths: ["Operational efficiency", "Crew loyalty", "Cost control"],
      weaknesses: ["Limited strategic vision", "Regulatory blind spots"],
    }),
    new CEOProfile({
      name: "Hiroshi Tanaka",
      background: "International timber trade specialist",
      annual_fee: 280000,
      profit_cut: 0.4,
      decision_making: "market-expansion",
      risk_tolerance: "high",
      strengths: ["Asian markets", "Export logistics", "Currency hedging"],
      weaknesses: ["Local relationship gaps", "Overextension risk"],
    }),
    new CEOProfile({
      name: "Sarah McKenzie",
      background: "Technology startup founder",
      annual_fee: 250000,
      profit_cut: 0.35,
      decision_making: "innovation-focused",
      risk_tolerance: "high",
      strengths: ["Digital transformation", "Automation", "Data analytics"],
      weaknesses: ["Industry inexperience", "High tech costs"],
    }),
    new CEOProfile({
      name: "Don Kayne",
      background: "Mysterious figure with unclear credentials",
      annual_fee: 100000,
      profit_cut: 0.2,
      decision_making: "unknown",
      risk_tolerance: "extreme",
      strengths: ["Very low cost", "Claims 'special connections'"],
      weaknesses: ["Complete unknown", "Suspicious background"],
    }),
  ];

  // Randomly select 3 candidates plus Don Kayne sometimes appears
  const ceo_candidates = [];
  
  // Always include Don Kayne with 25% chance
  if (Math.random() < 0.25) {
    ceo_candidates.push(all_ceo_candidates.find(ceo => ceo.name === "Don Kayne"));
  }
  
  // Pick 3 random non-Don Kayne candidates
  const other_candidates = all_ceo_candidates.filter(ceo => ceo.name !== "Don Kayne");
  const shuffled = other_candidates.sort(() => Math.random() - 0.5);
  ceo_candidates.push(...shuffled.slice(0, 3));

  const options = ceo_candidates.map((ceo) => `Hire ${ceo.name}`);
  options.push("Continue without CEO");

  const choice = await askChoice("CEO hiring decision:", options, terminal, input);

  if (choice < ceo_candidates.length) {
    const chosen_ceo = ceo_candidates[choice];
    if (state.budget < chosen_ceo.annual_fee) {
      write("Insufficient budget!");
      return;
    }
    
    // Special case for Don Kayne - immediate game over
    if (chosen_ceo.name === "Don Kayne") {
      state.budget -= chosen_ceo.annual_fee;
      write(`${chosen_ceo.name} hired as CEO!`);
      write("\n" + "=".repeat(60));
      write("Three months later...");
      write("\n--- BREAKING NEWS ---");
      write("RCMP raids forestry company offices in massive fraud investigation!");
      write("CEO Don Kayne was actually Donald Kane, wanted for embezzlement in three provinces.");
      write("Your company assets have been frozen pending investigation.");
      write("All operations suspended indefinitely.");
      write("\n" + "=".repeat(60));
      write("GAME OVER: Your company has been destroyed by criminal association!");
      write("You should have been more careful about who you trusted...");
      
      // Trigger immediate game over
      state.game_over = true;
      state.game_over_reason = "Criminal CEO investigation";
      return "GAME_OVER";
    }
    
    state.budget -= chosen_ceo.annual_fee;
    state.ceo = chosen_ceo;
    write(`${chosen_ceo.name} hired as CEO!`);
    write(`Background: ${chosen_ceo.background}`);
    write(`Annual fee: ${formatCurrency(chosen_ceo.annual_fee)}`);
    write(`Profit cut: ${(chosen_ceo.profit_cut * 100).toFixed(1)}%`);
    write(`Strengths: ${chosen_ceo.strengths.join(", ")}`);
    write(`Weaknesses: ${chosen_ceo.weaknesses.join(", ")}`);
  }
}

/**
 * @param {import("./gameModels.js").GameState} state
 */
export function pay_ceo_annual_costs(state) {
  if (!state.ceo) {
    return;
  }
  if (state.budget >= state.ceo.annual_fee) {
    state.budget -= state.ceo.annual_fee;
  }
  if (state.quarterly_profit > 0) {
    state.budget -= state.quarterly_profit * state.ceo.profit_cut;
  }
  state.ceo.years_employed += 0.25;
}

/**
 * CEO makes automated decisions based on their profile
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @returns {string[]} Array of actions taken
 */
export async function ceo_automated_decisions(state, write) {
  if (!state.ceo) return [];
  
  const actions = [];
  
  // CEO-specific automated decisions based on their specialties
  switch (state.ceo.decision_making) {
    case "profit-maximizing":
      if (state.budget > 300000 && Math.random() < 0.4) {
        const investmentAmount = Math.floor(state.budget * 0.15);
        state.budget -= investmentAmount;
        state.quarterly_profit += investmentAmount * 0.3; // High return but risky
        actions.push(`Made aggressive investment (${formatCurrency(investmentAmount)}) for quick returns`);
        state.reputation -= 0.02; // Aggressive tactics hurt reputation
      }
      break;
      
    case "relationship-focused":
      if (state.first_nations && Math.random() < 0.5) {
        state.first_nations.forEach(fn => {
          if (fn.relationship_level < 0.7) {
            fn.relationship_level += 0.08;
            actions.push(`Strengthened relations with ${fn.name} (+8%)`);
          }
        });
      }
      break;
      
    case "sustainability-focused":
      if (state.budget > 50000 && Math.random() < 0.3) {
        state.budget -= 50000;
        state.reputation += 0.06;
        actions.push(`Invested in environmental initiatives (+6% reputation)`);
      }
      break;
      
    case "operations-focused":
      if (state.quarterly_profit < 0 && Math.random() < 0.4) {
        const savings = Math.floor(Math.random() * 30000) + 20000;
        state.budget += savings;
        actions.push(`Optimized operations for ${formatCurrency(savings)} savings`);
      }
      break;
      
    case "market-expansion":
      if (state.budget > 200000 && Math.random() < 0.3) {
        const investmentAmount = 150000;
        state.budget -= investmentAmount;
        state.annual_allowable_cut += 10000; // Expand to new markets
        actions.push(`Expanded into new markets (+10,000 m³ AAC)`);
      }
      break;
      
    case "innovation-focused":
      if (state.budget > 100000 && Math.random() < 0.35) {
        const techCost = 80000;
        state.budget -= techCost;
        state.operating_cost_per_m3 -= 5; // Technology efficiency
        actions.push(`Implemented new technology (-$5/m³ operating cost)`);
      }
      break;
      
    case "regulatory-focused":
      if (state.safety_violations > 0 && Math.random() < 0.6) {
        state.safety_violations = Math.max(0, state.safety_violations - 1);
        actions.push(`Resolved safety compliance issues (-1 violation)`);
      }
      break;
      
    case "unknown": // Don Kayne - this shouldn't happen as he triggers game over
      if (Math.random() < 0.1) {
        actions.push(`Made mysterious 'special arrangement' - details classified`);
        state.reputation -= 0.05;
      }
      break;
  }
  
  // High risk tolerance decisions
  if (state.ceo.risk_tolerance === "high" && state.budget > 500000) {
    if (Math.random() < 0.2) {
      const investmentAmount = Math.floor(state.budget * 0.25);
      state.budget -= investmentAmount;
      // 50/50 chance of big gain or loss
      if (Math.random() < 0.5) {
        const profit = investmentAmount * 1.5;
        state.budget += profit;
        actions.push(`High-risk investment paid off! Gained ${formatCurrency(profit)}`);
      } else {
        actions.push(`High-risk investment failed. Lost ${formatCurrency(investmentAmount)}`);
      }
    }
  }
  
  return actions;
}

/**
 * CEO provides quarterly performance report
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 */
export async function ceo_quarterly_report(state, write) {
  if (!state.ceo) return;
  
  write("\n--- CEO QUARTERLY REPORT ---");
  write(`From: ${state.ceo.name}, CEO`);
  
  // Performance assessment
  const profitStatus = state.quarterly_profit > 0 ? "profitable" : "unprofitable";
  write(`This quarter was ${profitStatus}.`);
  
  // Risk assessment
  if (state.reputation < 0.3) {
    write("⚠️ Critical: Company reputation is dangerously low");
  }
  
  if (state.budget < 100000) {
    write("⚠️ Warning: Cash reserves critically low");
  }
  
  // Recommendations based on CEO profile
  if (state.ceo.decision_making === "aggressive-growth") {
    write("📈 Recommendation: Expand operations aggressively");
  } else if (state.ceo.decision_making === "cost-cutting") {
    write("💰 Recommendation: Further cost reductions needed");
  } else if (state.ceo.decision_making === "relationship-focused") {
    write("🤝 Recommendation: Continue building stakeholder relationships");
  }
  
  // Update CEO performance rating
  if (state.quarterly_profit > 0) {
    state.ceo.performance_rating = Math.min(1.0, state.ceo.performance_rating + 0.05);
  } else {
    state.ceo.performance_rating = Math.max(0.0, state.ceo.performance_rating - 0.05);
  }
}
