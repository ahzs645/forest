import { askChoice } from "./utils.js";

/**
 * Handles progression of the narrative story arc.
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function story_progression(state, write, terminal, input) {
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
      // story concluded
      break;
  }

  // Clamp values
  state.reputation = Math.min(1, Math.max(0, state.reputation));
  state.community_support = Math.min(1, Math.max(0, state.community_support));
}

