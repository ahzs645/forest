import { askChoice, formatCurrency } from "./utils.js";

class LiaisonType {
  constructor({ name, cost, effectiveness, bias, description }) {
    this.name = name;
    this.cost = cost;
    this.effectiveness = effectiveness;
    this.bias = bias;
    this.description = description;
  }
}

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function liaison_management(state, write, terminal, input) {
  if (!state.fn_liaison) {
    write("No First Nations liaison currently employed.");
    await offer_liaison_hiring(state, write, terminal, input);
  } else {
    write(`Current liaison: ${state.fn_liaison.name}`);
    // liaison_suggestions logic would go here
  }
}

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
async function offer_liaison_hiring(state, write, terminal, input) {
  write("--- FIRST NATIONS LIAISON SERVICES ---");

  const liaison_types = [
    new LiaisonType({
      name: "Indigenous Relations Specialist",
      cost: 80000,
      effectiveness: 0.9,
      bias: "indigenous",
      description: "First Nations member with deep cultural knowledge.",
    }),
    new LiaisonType({
      name: "Corporate Consultant",
      cost: 60000,
      effectiveness: 0.6,
      bias: "corporate",
      description: "Consultant with business focus.",
    }),
  ];

  const options = liaison_types.map((liaison) => `Hire ${liaison.name}`);
  options.push("Skip liaison hiring");

  const choice = await askChoice("Choose liaison approach:", options, terminal, input);

  if (choice < liaison_types.length) {
    const chosen_liaison = liaison_types[choice];
    if (state.budget < chosen_liaison.cost) {
      write("Insufficient budget!");
      return;
    }
    state.budget -= chosen_liaison.cost;
    state.fn_liaison = chosen_liaison;
    write(`${chosen_liaison.name} hired!`);
  }
}
