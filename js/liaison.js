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
    await provide_liaison_suggestions(state, write, terminal, input);
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

/**
 * Provide contextual suggestions based on liaison type and current game state
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
async function provide_liaison_suggestions(state, write, terminal, input) {
  const liaison = state.fn_liaison;
  write("\n--- LIAISON RECOMMENDATIONS ---");
  write(`Consultation with ${liaison.name}:`);
  
  const suggestions = generate_contextual_suggestions(state, liaison);
  
  // Display suggestions with numbers
  suggestions.forEach((suggestion, index) => {
    write(`${index + 1}. ${suggestion.title}`);
    write(`   ${suggestion.description}`);
    if (suggestion.cost > 0) {
      write(`   Cost: ${formatCurrency(suggestion.cost)}`);
    }
    write("");
  });
  
  const options = [
    ...suggestions.map(s => s.action_text),
    "Thank liaison and continue",
  ];
  
  const choice = await askChoice("Which recommendation would you like to pursue?", options, terminal, input);
  
  if (choice < suggestions.length) {
    await execute_suggestion(state, write, terminal, input, suggestions[choice]);
  }
}

/**
 * Generate contextual suggestions based on game state and liaison type
 */
function generate_contextual_suggestions(state, liaison) {
  const suggestions = [];
  
  // Calculate relationship status
  const avg_fn_relationship = state.first_nations.length > 0 
    ? state.first_nations.reduce((sum, fn) => sum + fn.relationship_level, 0) / state.first_nations.length 
    : 0.5;
    
  const nations_needing_consultation = state.first_nations.filter(fn => fn.needs_consultation(state.year));
  
  // Indigenous Relations Specialist suggestions (more culturally aware)
  if (liaison.bias === "indigenous") {
    
    if (avg_fn_relationship < 0.4) {
      suggestions.push({
        title: "Relationship Restoration Initiative",
        description: "Host a cultural sharing ceremony to rebuild trust. Shows genuine respect for traditional ways.",
        action_text: "Host cultural ceremony",
        cost: 15000,
        action: "cultural_ceremony",
        effectiveness: 0.9
      });
    }
    
    if (nations_needing_consultation.length > 0) {
      suggestions.push({
        title: "Traditional Protocol Consultation",
        description: "Follow proper traditional protocols for consultation. Takes longer but builds lasting relationships.",
        action_text: "Arrange traditional consultation",
        cost: nations_needing_consultation.length * 12000,
        action: "traditional_consultation",
        effectiveness: 0.95
      });
    }
    
    if (state.heritage_sites && state.heritage_sites.length > 0) {
      suggestions.push({
        title: "Sacred Site Protection Plan",
        description: "Develop comprehensive protection for cultural sites. Shows commitment beyond compliance.",
        action_text: "Create protection plan",
        cost: 20000,
        action: "heritage_protection",
        effectiveness: 0.85
      });
    }
    
    if (state.reputation < 0.3) {
      suggestions.push({
        title: "Community Partnership Program",
        description: "Establish ongoing partnership with local Indigenous businesses and training programs.",
        action_text: "Launch partnership program",
        cost: 30000,
        action: "community_partnership",
        effectiveness: 0.8
      });
    }
    
  } else { // Corporate Consultant suggestions (more business-focused)
    
    if (avg_fn_relationship < 0.4) {
      suggestions.push({
        title: "Compliance Enhancement Strategy",
        description: "Fast-track consultation processes to meet regulatory requirements efficiently.",
        action_text: "Accelerate compliance",
        cost: 8000,
        action: "compliance_strategy",
        effectiveness: 0.6
      });
    }
    
    if (nations_needing_consultation.length > 0) {
      suggestions.push({
        title: "Streamlined Consultation Process",
        description: "Use standardized consultation format to efficiently meet multiple nations' requirements.",
        action_text: "Implement streamlined process",
        cost: nations_needing_consultation.length * 7000,
        action: "streamlined_consultation",
        effectiveness: 0.7
      });
    }
    
    if (state.permit_bonus < 0.1) {
      suggestions.push({
        title: "Government Relations Enhancement",
        description: "Leverage government connections to improve permit processing times.",
        action_text: "Enhance government relations",
        cost: 12000,
        action: "government_relations",
        effectiveness: 0.65
      });
    }
    
    if (state.budget < 500000) {
      suggestions.push({
        title: "Cost-Efficient Engagement",
        description: "Minimize consultation costs while maintaining regulatory compliance.",
        action_text: "Optimize consultation costs",
        cost: 5000,
        action: "cost_optimization",
        effectiveness: 0.5
      });
    }
  }
  
  // Universal suggestions based on current challenges
  if (state.safety_violations > 0) {
    suggestions.push({
      title: "First Nations Safety Partnership",
      description: `${liaison.bias === "indigenous" ? "Work with traditional knowledge keepers" : "Partner with Indigenous safety consultants"} to improve workplace safety.`,
      action_text: "Establish safety partnership",
      cost: 10000,
      action: "safety_partnership",
      effectiveness: liaison.effectiveness * 0.8
    });
  }
  
  if (state.old_growth_affected) {
    suggestions.push({
      title: "Old Growth Stewardship Plan",
      description: `${liaison.bias === "indigenous" ? "Co-develop stewardship plan with traditional ecological knowledge" : "Create compliance plan for old growth requirements"}.`,
      action_text: "Develop stewardship plan",
      cost: 18000,
      action: "old_growth_plan",
      effectiveness: liaison.effectiveness * 0.75
    });
  }
  
  // Limit suggestions to most relevant ones
  return suggestions.slice(0, 4);
}

/**
 * Execute the chosen suggestion
 */
async function execute_suggestion(state, write, terminal, input, suggestion) {
  if (state.budget < suggestion.cost) {
    write("❌ Insufficient budget for this recommendation.");
    return;
  }
  
  write(`\n🎯 IMPLEMENTING: ${suggestion.title.toUpperCase()}`);
  write(`💰 Cost: ${formatCurrency(suggestion.cost)}`);
  
  state.budget -= suggestion.cost;
  
  switch (suggestion.action) {
    case "cultural_ceremony":
      state.first_nations.forEach(fn => {
        fn.relationship_level += 0.15 * suggestion.effectiveness;
        fn.relationship_level = Math.min(1.0, fn.relationship_level);
      });
      state.reputation += 0.1 * suggestion.effectiveness;
      state.community_support += 0.12 * suggestion.effectiveness;
      write("🌟 Cultural ceremony successful - relationships strengthened through respect for traditions");
      break;
      
    case "traditional_consultation":
      state.first_nations.forEach(fn => {
        if (fn.needs_consultation(state.year)) {
          fn.last_consultation_year = state.year;
          fn.relationship_level += 0.2 * suggestion.effectiveness;
          fn.agreement_signed = true;
          fn.relationship_level = Math.min(1.0, fn.relationship_level);
        }
      });
      state.permit_bonus += 0.1 * suggestion.effectiveness;
      state.community_support += 0.08 * suggestion.effectiveness;
      write("🤝 Traditional consultation protocols followed - strong agreements established");
      break;
      
    case "heritage_protection":
      state.reputation += 0.15 * suggestion.effectiveness;
      state.community_support += 0.1 * suggestion.effectiveness;
      state.permit_bonus += 0.05;
      write("🏛️ Cultural site protection plan established - showing commitment beyond compliance");
      break;
      
    case "community_partnership":
      state.community_support += 0.2 * suggestion.effectiveness;
      state.reputation += 0.12 * suggestion.effectiveness;
      state.jobs_created += 15;
      write("🤝 Community partnership program launched - creating opportunities for Indigenous businesses");
      break;
      
    case "compliance_strategy":
      state.first_nations.forEach(fn => {
        fn.relationship_level += 0.08 * suggestion.effectiveness;
        fn.relationship_level = Math.min(1.0, fn.relationship_level);
      });
      state.permit_bonus += 0.08;
      write("📋 Compliance strategy implemented - meeting regulatory requirements efficiently");
      break;
      
    case "streamlined_consultation":
      state.first_nations.forEach(fn => {
        if (fn.needs_consultation(state.year)) {
          fn.last_consultation_year = state.year;
          fn.relationship_level += 0.1 * suggestion.effectiveness;
          fn.relationship_level = Math.min(1.0, fn.relationship_level);
        }
      });
      state.permit_bonus += 0.06;
      write("⚡ Streamlined consultation process implemented - efficient and systematic approach");
      break;
      
    case "government_relations":
      state.permit_bonus += 0.12;
      state.permit_backlog_days -= 15;
      write("🏛️ Government relations enhanced - improved permit processing expected");
      break;
      
    case "cost_optimization":
      state.first_nations.forEach(fn => {
        fn.consultation_cost *= 0.85;
      });
      write("💰 Consultation costs optimized - maintaining compliance while reducing expenses");
      break;
      
    case "safety_partnership":
      state.safety_violations = Math.max(0, state.safety_violations - 1);
      state.reputation += 0.08 * suggestion.effectiveness;
      state.community_support += 0.06 * suggestion.effectiveness;
      write("🛡️ Safety partnership established - combining traditional knowledge with modern practices");
      break;
      
    case "old_growth_plan":
      state.reputation += 0.1 * suggestion.effectiveness;
      state.biodiversity_score += 0.05;
      state.permit_bonus += 0.04;
      write("🌲 Old growth stewardship plan developed - demonstrating environmental leadership");
      break;
      
    default:
      write("✅ Recommendation implemented successfully");
  }
  
  write(`\n${state.fn_liaison.name}: "I'm pleased to help guide these important decisions."`);
}
