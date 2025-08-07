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
    const arcs = [
      "ancientGrove", "rivalCompany", "endangeredSpecies", "naturalDisaster", 
      "indigenousPartnership", "wildcatStrike", "marketCrash", "newTechnology",
      "politicalChange", "climateActivists", "fireDamage", "pesticideDebate",
      "touristConflict", "mediaCoverage", "scientificDiscovery"
    ];
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
    case "naturalDisaster":
      await naturalDisasterStory(state, write, terminal, input);
      break;
    case "indigenousPartnership":
      await indigenousPartnershipStory(state, write, terminal, input);
      break;
    case "wildcatStrike":
      await wildcatStrikeStory(state, write, terminal, input);
      break;
    case "marketCrash":
      await marketCrashStory(state, write, terminal, input);
      break;
    case "newTechnology":
      await newTechnologyStory(state, write, terminal, input);
      break;
    case "politicalChange":
      await politicalChangeStory(state, write, terminal, input);
      break;
    case "climateActivists":
      await climateActivistsStory(state, write, terminal, input);
      break;
    case "fireDamage":
      await fireDamageStory(state, write, terminal, input);
      break;
    case "pesticideDebate":
      await pesticideDebateStory(state, write, terminal, input);
      break;
    case "touristConflict":
      await touristConflictStory(state, write, terminal, input);
      break;
    case "mediaCoverage":
      await mediaCoverageStory(state, write, terminal, input);
      break;
    case "scientificDiscovery":
      await scientificDiscoveryStory(state, write, terminal, input);
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

async function naturalDisasterStory(state, write, terminal, input) {
  switch (state.story_stage) {
    case 0:
      write("--- STORY EVENT: Devastating Landslide ---");
      write("A massive landslide has blocked access roads and damaged equipment. Local media is watching your response.");
      const choice = await askChoice(
        "How do you respond to the crisis?",
        ["Immediately send aid to affected communities", "Focus on recovering your equipment first"],
        terminal, input
      );
      if (choice === 0) {
        state.story_branch = "community_first";
        state.budget -= 80000;
        state.reputation += 0.15;
        state.community_support += 0.25;
        write("You prioritize helping displaced families. The community remembers your generosity.");
      } else {
        state.story_branch = "business_first";
        state.budget -= 20000;
        state.reputation -= 0.1;
        state.community_support -= 0.1;
        write("You focus on business recovery. Some see this as callous during a tragedy.");
      }
      state.story_stage = 1;
      break;
    case 1:
      if (state.story_branch === "community_first") {
        write("--- STORY EVENT: Insurance Investigation ---");
        write("Insurance investigators are impressed by your community response and expedite your claim.");
        state.budget += 120000;
        state.reputation += 0.05;
        write("Your compassionate response pays dividends in faster claim processing.");
      } else {
        write("--- STORY EVENT: Public Backlash ---");
        write("Community groups organize boycotts of companies that buy your timber.");
        const choice = await askChoice(
          "How do you address the boycott?",
          ["Launch $50k community outreach campaign", "Ignore the protesters"],
          terminal, input
        );
        if (choice === 0) {
          if (state.budget >= 50000) {
            state.budget -= 50000;
            state.reputation += 0.08;
            state.community_support += 0.1;
            write("Your outreach campaign slowly rebuilds trust.");
          } else {
            write("You can't afford the campaign right now.");
          }
        } else {
          state.reputation -= 0.05;
          state.community_support -= 0.1;
          write("The boycott gains momentum as you remain silent.");
        }
      }
      state.story_stage = 2;
      break;
    default:
      break;
  }
}

async function wildcatStrikeStory(state, write, terminal, input) {
  switch (state.story_stage) {
    case 0:
      write("--- STORY EVENT: Wildcat Strike ---");
      write("Your crew walks off the job demanding better safety equipment and higher wages after a near-miss accident.");
      const choice = await askChoice(
        "How do you handle the strike?",
        ["Negotiate immediately with workers", "Hire replacement workers"],
        terminal, input
      );
      if (choice === 0) {
        state.story_branch = "negotiate";
        state.budget -= 120000;
        state.reputation += 0.1;
        write("You meet with workers and address their safety concerns. Trust improves.");
      } else {
        state.story_branch = "replacements";
        state.budget -= 80000;
        state.reputation -= 0.2;
        state.community_support -= 0.15;
        write("Replacement workers cross the picket line. Tensions boil over in town.");
      }
      state.story_stage = 1;
      break;
    default:
      break;
  }
}

// Additional story functions can be added here as needed
async function fireDamageStory(state, write, terminal, input) {
  switch (state.story_stage) {
    case 0:
      write("--- STORY EVENT: Forest Fire Outbreak ---");
      write("A wildfire threatens both your timber stands and the nearby town. Evacuation orders are in effect.");
      const choice = await askChoice(
        "How do you respond?",
        ["Donate equipment to firefighting efforts", "Focus on protecting your timber assets"],
        terminal, input
      );
      if (choice === 0) {
        state.story_branch = "help_community";
        state.budget -= 100000;
        state.reputation += 0.2;
        state.community_support += 0.3;
        write("You send bulldozers and crews to help create firebreaks. The town is saved.");
      } else {
        state.story_branch = "protect_assets";
        state.budget -= 50000;
        state.reputation -= 0.1;
        state.community_support -= 0.2;
        write("You focus on sprinkler systems for your timber. Some see this as selfish.");
      }
      state.story_stage = 1;
      break;
    default:
      break;
  }
}

async function climateActivistsStory(state, write, terminal, input) {
  switch (state.story_stage) {
    case 0:
      write("--- STORY EVENT: Climate Protesters ---");
      write("Environmental activists have chained themselves to trees in your most profitable cut block.");
      const choice = await askChoice(
        "How do you handle the protest?",
        ["Engage in dialogue with protesters", "Call police to remove them"],
        terminal, input
      );
      if (choice === 0) {
        state.story_branch = "dialogue";
        state.reputation += 0.1;
        write("You listen to their concerns and find common ground on sustainable practices.");
      } else {
        state.story_branch = "police";
        state.budget -= 30000;
        state.reputation -= 0.15;
        state.community_support -= 0.1;
        write("The arrests make national news and damage your environmental reputation.");
      }
      state.story_stage = 1;
      break;
    default:
      break;
  }
}

// Placeholder functions for remaining story types
async function indigenousPartnershipStory(state, write, terminal, input) {
  if (state.story_stage === 0) {
    write("--- STORY EVENT: Partnership Opportunity ---");
    write("A local First Nation proposes a joint venture for sustainable forestry practices.");
    const choice = await askChoice("Do you accept?", ["Yes, form partnership", "Decline politely"], terminal, input);
    if (choice === 0) {
      state.budget -= 75000;
      state.reputation += 0.15;
      state.community_support += 0.2;
      write("The partnership opens new markets and improves relationships.");
    }
    state.story_stage = 1;
  }
}

async function marketCrashStory(state, write, terminal, input) {
  if (state.story_stage === 0) {
    write("--- STORY EVENT: Market Volatility ---");
    write("Lumber prices have crashed 40% due to economic uncertainty.");
    state.budget -= 200000;
    write("You must adapt quickly to survive the downturn.");
    state.story_stage = 1;
  }
}

async function newTechnologyStory(state, write, terminal, input) {
  if (state.story_stage === 0) {
    write("--- STORY EVENT: Innovation Opportunity ---");
    write("A tech company offers you first access to AI-powered forest management tools.");
    const choice = await askChoice("Invest in new technology?", ["Yes, invest $150k", "No, too risky"], terminal, input);
    if (choice === 0 && state.budget >= 150000) {
      state.budget -= 150000;
      state.reputation += 0.1;
      write("The technology gives you a competitive edge in efficiency.");
    }
    state.story_stage = 1;
  }
}

async function politicalChangeStory(state, write, terminal, input) {
  if (state.story_stage === 0) {
    write("--- STORY EVENT: Election Results ---");
    write("A new government takes power with stricter environmental policies.");
    state.reputation -= 0.05;
    write("You'll need to adapt to the new regulatory environment.");
    state.story_stage = 1;
  }
}

async function pesticideDebateStory(state, write, terminal, input) {
  if (state.story_stage === 0) {
    write("--- STORY EVENT: Chemical Concerns ---");
    write("Environmentalists question your use of forest pesticides near water sources.");
    const choice = await askChoice("How do you respond?", ["Switch to organic alternatives", "Defend current practices"], terminal, input);
    if (choice === 0) {
      state.budget -= 60000;
      state.reputation += 0.1;
      write("The switch to organic methods costs more but improves your image.");
    } else {
      state.reputation -= 0.08;
      write("You defend your practices but face continued criticism.");
    }
    state.story_stage = 1;
  }
}

async function touristConflictStory(state, write, terminal, input) {
  if (state.story_stage === 0) {
    write("--- STORY EVENT: Recreation Conflict ---");
    write("Hikers and campers are angry about logging near popular trails.");
    const choice = await askChoice("How do you handle this?", ["Create buffer zones around trails", "Continue operations as planned"], terminal, input);
    if (choice === 0) {
      state.budget -= 40000;
      state.community_support += 0.15;
      write("Buffer zones preserve the recreational experience.");
    } else {
      state.community_support -= 0.1;
      write("Tourism groups organize opposition to your operations.");
    }
    state.story_stage = 1;
  }
}

async function mediaCoverageStory(state, write, terminal, input) {
  if (state.story_stage === 0) {
    write("--- STORY EVENT: Documentary Film ---");
    write("A filmmaker wants to document your operations for a nature documentary.");
    const choice = await askChoice("Allow filming?", ["Yes, showcase sustainable practices", "No, too much risk"], terminal, input);
    if (choice === 0) {
      state.reputation += 0.12;
      write("The documentary portrays you as a responsible steward of the forest.");
    } else {
      state.reputation -= 0.05;
      write("Your refusal creates suspicion about your practices.");
    }
    state.story_stage = 1;
  }
}

async function scientificDiscoveryStory(state, write, terminal, input) {
  if (state.story_stage === 0) {
    write("--- STORY EVENT: Archaeological Find ---");
    write("Researchers discover Indigenous artifacts in your harvest area that could rewrite local history.");
    const choice = await askChoice("What do you do?", ["Halt operations and support research", "Minimize delays and continue"], terminal, input);
    if (choice === 0) {
      state.budget -= 120000;
      state.reputation += 0.2;
      state.community_support += 0.25;
      write("Your support for the research earns widespread respect.");
    } else {
      state.reputation -= 0.15;
      state.community_support -= 0.2;
      write("Your impatience with the discovery damages cultural relationships.");
    }
    state.story_stage = 1;
  }
}
