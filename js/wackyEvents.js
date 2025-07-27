import { askChoice, formatCurrency } from "./utils.js";

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function quarterly_wacky_events(state, write, terminal, input) {
  if (Math.random() > 0.4) {
    return;
  }

  write("--- BIZARRE QUARTERLY EVENTS ---");

  const wacky_events = [
    sasquatch_sighting,
    social_media_viral,
    celebrity_endorsement,
    alien_landing,
  ];

  const event = wacky_events[Math.floor(Math.random() * wacky_events.length)];
  await event(state, write, terminal, input);
}

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
async function sasquatch_sighting(state, write, terminal, input) {
  write("BREAKING: Sasquatch Family Establishes Homestead in Harvest Block!");
  if (state.harvest_blocks.length > 0) {
    const block = state.harvest_blocks[0];
    write(`   Location: ${block.id}`);

    const choice = await askChoice(
      "How do you handle the Sasquatch situation?",
      [
        "Negotiate with Sasquatch family for coexistence",
        "Hire cryptozoologist to study them",
        "Sell documentary rights and relocate block",
        "Ignore it and hope they leave",
      ],
      terminal,
      input
    );

    if (choice === 0) {
      state.budget -= 50000;
      state.reputation += 0.2;
      write("Sasquatch family agrees to sustainable coexistence!");
    } else if (choice === 1) {
      state.budget -= 75000;
      state.biodiversity_score += 0.15;
      write("Cryptozoologist discovers Sasquatch are excellent forest managers.");
    } else if (choice === 2) {
      state.budget += 100000;
      state.harvest_blocks.shift();
      write("Netflix deal signed! Block relocated.");
    } else {
      state.reputation -= 0.1;
      write("Sasquatch family moves on, leaving a 1-star review.");
    }
  }
}

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 */
function social_media_viral(state, write) {
  write("A TikTok dance trend starts among forestry workers.");
  state.budget += 30000;
  state.reputation += 0.15;
  write(`Merchandise sales generate ${formatCurrency(30000)}.`);
}

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 */
function celebrity_endorsement(state, write) {
  write("Ryan Reynolds makes sarcastic commercials about your sustainable logging.");
  state.budget += 150000;
  state.reputation += 0.25;
}

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
async function alien_landing(state, write, terminal, input) {
  write("FIRST CONTACT: Alien Spacecraft Lands in Logging Road!");

  const choice = await askChoice(
    "How do you respond to alien contact?",
    [
      "Trade alien technology for Earth wood samples",
      "Offer aliens jobs in forest management",
      "Ask aliens for advice on sustainable practices",
    ],
    terminal,
    input
  );

  if (choice === 0) {
    write("Aliens give you a matter replicator.");
    state.operating_cost_per_m3 *= 0.5;
  } else if (choice === 1) {
    write("Aliens join workforce as 'Interdimensional Forest Consultants'.");
    state.jobs_created += 100;
    state.reputation += 0.2;
  } else {
    write("Aliens share advanced ecological knowledge.");
    state.biodiversity_score += 0.3;
  }
}
