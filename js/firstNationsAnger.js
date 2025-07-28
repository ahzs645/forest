import { askChoice, formatCurrency } from "./utils.js";

class AngerEvent {
  constructor({
    title,
    description,
    trigger_reason,
    relationship_penalty,
    reputation_penalty,
    response_options,
  }) {
    this.title = title;
    this.description = description;
    this.trigger_reason = trigger_reason;
    this.relationship_penalty = relationship_penalty;
    this.reputation_penalty = reputation_penalty;
    this.response_options = response_options;
  }
}

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function random_first_nations_anger_events(
  state,
  write,
  terminal,
  input
) {
  if (Math.random() > 0.3) {
    return false;
  }
  if (!state.first_nations.length) {
    return false;
  }

  const angry_fn =
    state.first_nations[
      Math.floor(Math.random() * state.first_nations.length)
    ];
  write(`--- FIRST NATIONS ANGER EVENT - ${angry_fn.name} ---`);

  const anger_events = [
    new AngerEvent({
      title: "Social Media Outrage",
      description: `A viral TikTok video shows your equipment near a traditional fishing spot.`,
      trigger_reason: "Cultural site disrespect",
      relationship_penalty: 0.3,
      reputation_penalty: 0.2,
      response_options: [
        {
          description: "Issue public apology and relocate operations",
          cost: 25000,
          relationship_recovery: 0.2,
          reputation_recovery: 0.1,
          success_chance: 0.8,
        },
        {
          description: "Ignore the controversy",
          cost: 0,
          relationship_recovery: -0.1,
          reputation_recovery: -0.1,
          success_chance: 1.0,
        },
      ],
    }),
  ];

  const chosen_event = anger_events[0];
  write(`ANGER TRIGGER: ${chosen_event.trigger_reason}`);
  write(chosen_event.description);

  angry_fn.relationship_level -= chosen_event.relationship_penalty;
  state.reputation -= chosen_event.reputation_penalty;

  const choice = await askChoice(
    "Choose your response:",
    chosen_event.response_options.map((opt) => opt.description),
    terminal,
    input
  );
  const chosen_response = chosen_event.response_options[choice];

  write(`RESPONSE: ${chosen_response.description}`);

  if (chosen_response.cost > 0) {
    if (state.budget >= chosen_response.cost) {
      state.budget -= chosen_response.cost;
    } else {
      write("Insufficient budget! Response failed.");
      return true;
    }
  }

  if (Math.random() < chosen_response.success_chance) {
    write("RESPONSE SUCCESSFUL!");
    angry_fn.relationship_level += chosen_response.relationship_recovery;
    state.reputation += chosen_response.reputation_recovery;
  } else {
    write("RESPONSE FAILED!");
  }

  return true;
}

/**
 * Check if anger events should be triggered based on game state
 * @param {import("./gameModels.js").GameState} state
 * @returns {boolean}
 */
export function check_anger_event_triggers(state) {
  // Check if any First Nations have very low relationship levels
  const hasAngryNation = state.first_nations.some(fn => fn.relationship_level < 0.3);
  
  // Check for recent violations or issues
  const hasRecentViolations = state.safety_violations > 2 || state.criminal_convictions > 0;
  
  // Check if harvesting without proper consultation
  const lackOfConsultation = state.harvest_blocks.some(block => 
    block.permit_status === "approved" && !block.fn_consulted
  );
  
  return hasAngryNation || hasRecentViolations || lackOfConsultation;
}
