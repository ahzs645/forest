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
    await offer_ceo_hiring(state, write, terminal, input);
  } else {
    write(`Current CEO: ${state.ceo.name}`);
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

  const ceo_candidates = [
    new CEOProfile({
      name: "Margaret Chen",
      background: "Former BC Ministry of Forests executive",
      annual_fee: 200000,
      profit_cut: 0.3,
      decision_making: 0.6,
      risk_tolerance: "conservative",
      strengths: ["Regulatory expertise"],
      weaknesses: ["Slow to innovate"],
    }),
    new CEOProfile({
      name: "James Running Bear",
      background: "Indigenous forestry leader",
      annual_fee: 180000,
      profit_cut: 0.3,
      decision_making: 0.6,
      risk_tolerance: "moderate",
      strengths: ["First Nations relations"],
      weaknesses: ["Limited international markets"],
    }),
  ];

  const options = ceo_candidates.map((ceo) => `Hire ${ceo.name}`);
  options.push("Continue without CEO");

  const choice = await askChoice("CEO hiring decision:", options, terminal, input);

  if (choice < ceo_candidates.length) {
    const chosen_ceo = ceo_candidates[choice];
    if (state.budget < chosen_ceo.annual_fee) {
      write("Insufficient budget!");
      return;
    }
    state.budget -= chosen_ceo.annual_fee;
    state.ceo = chosen_ceo;
    write(`${chosen_ceo.name} hired as CEO!`);
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
  
  // Risk-based decision making
  if (state.ceo.risk_tolerance === "high" && state.budget > 500000) {
    if (Math.random() < 0.3) {
      const investmentAmount = Math.floor(state.budget * 0.2);
      state.budget -= investmentAmount;
      actions.push(`Invested ${formatCurrency(investmentAmount)} in high-risk expansion`);
    }
  }
  
  // Cost-cutting decisions
  if (state.ceo.decision_making === "cost-cutting" && state.quarterly_profit < 0) {
    const cutAmount = Math.floor(state.operating_cost_per_m3 * 0.1);
    state.operating_cost_per_m3 -= cutAmount;
    actions.push(`Reduced operating costs by ${formatCurrency(cutAmount)}/m³`);
    state.safety_violations++; // Cost cutting affects safety
  }
  
  // Relationship building
  if (state.ceo.decision_making === "relationship-focused") {
    state.first_nations.forEach(fn => {
      if (fn.relationship_level < 0.5) {
        fn.relationship_level += 0.05;
        actions.push(`Improved relations with ${fn.name} (+5%)`);
      }
    });
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
