import { askChoice } from "./utils.js";

/**
 * Handles progression of the narrative story arc.
 * Randomly selects a story arc on first run and advances it annually.
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function story_progression(state, write, terminal, input) {
  if (!state.story_arc) {
    const arcs = ["ancientGrove", "rivalCompany", "endangeredSpecies"];
    state.story_arc = arcs[Math.floor(Math.random() * arcs.length)];
    state.story_stage = 0;
  }

  switch (state.story_arc) {
    case "ancientGrove":
      await ancientGroveStory(state, write, terminal, input);
      break;
    case "rivalCompany":
      await rivalCompanyStory(state, write, terminal, input);
      break;
    case "endangeredSpecies":
      await endangeredSpeciesStory(state, write, terminal, input);
      break;
  }

  // Clamp values
  state.reputation = Math.min(1, Math.max(0, state.reputation));
  state.community_support = Math.min(1, Math.max(0, state.community_support));
}

async function ancientGroveStory(state, write, terminal, input) {
  switch (state.story_stage) {
    case 0:
      write("--- STORY EVENT: Discovery of the Ancient Grove ---");
      write(
        "Survey crews have found an untouched ancient cedar grove with trees older than 800 years. The community is eager to see what you do next."
      );
      {
        const choice = await askChoice(
          "How do you respond?",
          [
            "Protect the grove and seek heritage status",
            "Harvest the valuable timber",
          ],
          terminal,
          input
        );
        if (choice === 0) {
          state.story_branch = "protect";
          state.reputation += 0.05;
          state.community_support += 0.2;
          write(
            "You announce the grove will be protected. Locals praise your stewardship."
          );
        } else {
          state.story_branch = "harvest";
          state.budget += 50000;
          state.reputation -= 0.1;
          state.community_support -= 0.2;
          write(
            "You move to harvest the grove. Profits rise, but protests begin to stir."
          );
        }
        state.story_stage = 1;
      }
      break;
    case 1:
      if (state.story_branch === "protect") {
        write("--- STORY EVENT: Eco-tourism Opportunity ---");
        write(
          "A local entrepreneur wants to create an eco-tourism venture around the protected grove."
        );
        const choice = await askChoice(
          "Do you fund the project?",
          ["Invest $40,000", "Decline"],
          terminal,
          input
        );
        if (choice === 0) {
          if (state.budget >= 40000) {
            state.budget -= 40000;
            state.reputation += 0.1;
            state.community_support += 0.1;
            write(
              "The eco-tourism project thrives, bringing goodwill and visitors."
            );
          } else {
            write("You can't afford the investment right now.");
          }
        } else {
          state.community_support -= 0.05;
          write("The opportunity passes, disappointing some community members.");
        }
      } else if (state.story_branch === "harvest") {
        write("--- STORY EVENT: Environmental Protest ---");
        write(
          "Activists blockade the road to the grove, demanding its preservation."
        );
        const choice = await askChoice(
          "How do you respond?",
          [
            "Negotiate and offer partial protection",
            "Call law enforcement to clear the blockade",
          ],
          terminal,
          input
        );
        if (choice === 0) {
          state.reputation += 0.05;
          state.community_support += 0.1;
          write("You reach a compromise, easing tensions.");
        } else {
          state.reputation -= 0.15;
          state.community_support -= 0.15;
          state.budget -= 20000;
          write(
            "The confrontation leads to negative press and legal expenses."
          );
        }
      }
      state.story_stage = 2;
      break;
    case 2:
      write("--- STORY EVENT: Provincial Review ---");
      if (state.story_branch === "protect") {
        write(
          "The province recognizes your stewardship and awards a sustainability grant."
        );
        state.budget += 60000;
        state.reputation += 0.05;
      } else {
        write(
          "The province fines your company for inadequate consultation during the harvest."
        );
        state.budget -= 40000;
        state.reputation -= 0.05;
      }
      state.story_stage = 3;
      break;
    default:
      break;
  }
}

async function rivalCompanyStory(state, write, terminal, input) {
  switch (state.story_stage) {
    case 0:
      write("--- STORY EVENT: Rival Company Encroachment ---");
      write(
        "A rival logging firm has begun working near your tenure and wants to buy some of your cutting rights."
      );
      {
        const choice = await askChoice(
          "How do you respond?",
          ["Negotiate partnership", "Compete aggressively"],
          terminal,
          input
        );
        if (choice === 0) {
          state.story_branch = "partner";
          state.reputation += 0.05;
          state.community_support += 0.1;
          write("You open talks for a potential joint venture.");
        } else {
          state.story_branch = "compete";
          state.budget -= 20000;
          state.reputation -= 0.05;
          write("You vow to defend your territory and ramp up operations.");
        }
        state.story_stage = 1;
      }
      break;
    case 1:
      if (state.story_branch === "partner") {
        write("--- STORY EVENT: Joint Infrastructure Decision ---");
        write("The partner proposes a $50,000 investment in shared roads.");
        const choice = await askChoice(
          "Do you contribute?",
          ["Invest", "Decline"],
          terminal,
          input
        );
        if (choice === 0) {
          if (state.budget >= 50000) {
            state.budget -= 50000;
            state.reputation += 0.1;
            write("The project improves access for both companies.");
          } else {
            write("You can't afford to invest right now.");
          }
        } else {
          state.reputation -= 0.05;
          write("The partnership wavers due to lack of commitment.");
        }
      } else {
        write("--- STORY EVENT: Marketing Battle ---");
        write(
          "The rival launches a PR campaign criticizing your practices."
        );
        const choice = await askChoice(
          "Your move?",
          ["Counter with $30k campaign", "Ignore them"],
          terminal,
          input
        );
        if (choice === 0) {
          if (state.budget >= 30000) {
            state.budget -= 30000;
            state.reputation += 0.05;
            write("Your campaign restores some public trust.");
          } else {
            write("Insufficient funds to counter the campaign.");
          }
        } else {
          state.reputation -= 0.1;
          state.community_support -= 0.05;
          write("The rival's narrative gains traction.");
        }
      }
      state.story_stage = 2;
      break;
    case 2:
      if (state.story_branch === "partner") {
        write("--- STORY EVENT: Joint Venture Payoff ---");
        write("Regulators approve the partnership, unlocking new markets.");
        state.budget += 70000;
        state.reputation += 0.05;
      } else {
        write("--- STORY EVENT: Costly Competition ---");
        write("The price war drives up your costs and exhausts crews.");
        state.budget -= 40000;
        state.reputation += 0.02;
      }
      state.story_stage = 3;
      break;
    default:
      break;
  }
}

async function endangeredSpeciesStory(state, write, terminal, input) {
  switch (state.story_stage) {
    case 0:
      write("--- STORY EVENT: Endangered Species Habitat ---");
      write(
        "Biologists discover habitat of an endangered species in a planned cut block."
      );
      {
        const choice = await askChoice(
          "What do you do?",
          ["Set aside habitat (-$20k)", "Apply for exemption"],
          terminal,
          input
        );
        if (choice === 0) {
          state.story_branch = "protect";
          state.budget -= 20000;
          state.reputation += 0.1;
          state.community_support += 0.1;
          write("You reserve the area, earning praise from conservationists.");
        } else {
          state.story_branch = "exempt";
          state.budget += 50000;
          state.reputation -= 0.1;
          state.community_support -= 0.1;
          write("You seek an exemption to continue logging.");
        }
        state.story_stage = 1;
      }
      break;
    case 1:
      if (state.story_branch === "protect") {
        write("--- STORY EVENT: NGO Partnership ---");
        write("An environmental NGO proposes an education campaign.");
        const choice = await askChoice(
          "Fund $10k outreach effort?",
          ["Fund campaign", "Decline"],
          terminal,
          input
        );
        if (choice === 0) {
          if (state.budget >= 10000) {
            state.budget -= 10000;
            state.reputation += 0.1;
            write("The campaign boosts your green image.");
          } else {
            write("You lack funds for the campaign.");
          }
        } else {
          state.reputation -= 0.05;
          write("The NGO criticizes your lack of support.");
        }
      } else {
        write("--- STORY EVENT: Legal Threat ---");
        write("Environmental groups threaten a lawsuit over the exemption.");
        const choice = await askChoice(
          "How do you respond?",
          ["Settle ($40k)", "Fight in court"],
          terminal,
          input
        );
        if (choice === 0) {
          if (state.budget >= 40000) {
            state.budget -= 40000;
            state.reputation -= 0.05;
            write("You settle quietly, but the story leaks.");
          } else {
            write("You can't afford to settle.");
          }
        } else {
          state.budget -= 20000;
          state.reputation -= 0.1;
          write("The legal battle drags on, draining resources.");
        }
      }
      state.story_stage = 2;
      break;
    case 2:
      if (state.story_branch === "protect") {
        write("--- STORY EVENT: Conservation Grant ---");
        write("The province awards a grant for your stewardship.");
        state.budget += 40000;
        state.reputation += 0.05;
      } else {
        write("--- STORY EVENT: Court Ruling ---");
        write("The court restricts your operations and imposes penalties.");
        state.budget -= 30000;
        state.reputation -= 0.05;
      }
      state.story_stage = 3;
      break;
    default:
      break;
  }
}
