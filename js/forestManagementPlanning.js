import { ask, askChoice, formatCurrency, formatVolume } from "./utils.js";

// Forest Management Plan phases and requirements
export const FMP_PHASES = {
  PLANNING: {
    name: "Strategic Planning Phase",
    duration_quarters: 2,
    cost: 150000,
    activities: ["Inventory assessment", "Stakeholder consultation", "Environmental baseline"],
    description: "Develop comprehensive 20-year forest management strategy"
  },
  DEVELOPMENT: {
    name: "Plan Development Phase", 
    duration_quarters: 3,
    cost: 250000,
    activities: ["Detailed planning", "Impact assessments", "Public consultation"],
    description: "Create detailed tactical plans and operational procedures"
  },
  APPROVAL: {
    name: "Government Approval Phase",
    duration_quarters: 2,
    cost: 75000,
    activities: ["Government review", "Final public comment", "Regulatory approval"],
    description: "Submit plan for government approval and public review"
  },
  IMPLEMENTATION: {
    name: "Implementation Phase",
    duration_quarters: 4,
    cost: 100000,
    activities: ["Staff training", "System setup", "Operational procedures"],
    description: "Implement approved management plan and monitoring systems"
  },
  MONITORING: {
    name: "Monitoring & Adaptive Management",
    duration_quarters: 20, // 5 years
    cost: 50000, // Per year
    activities: ["Performance monitoring", "Adaptive management", "Annual reporting"],
    description: "Monitor plan effectiveness and adapt strategies as needed"
  }
};

// FMP Requirements based on Canadian standards
export const FMP_REQUIREMENTS = {
  INVENTORY_COMPLETION: 0.85, // Must have 85% forest inventory completed
  STAKEHOLDER_CONSULTATION: 3, // Minimum consultation sessions
  ENVIRONMENTAL_ASSESSMENT: true, // Must complete environmental baseline
  FIRST_NATIONS_ENGAGEMENT: 2, // Minimum FN engagement sessions
  PUBLIC_CONSULTATION: 60, // 60 days public review period
  SCIENTIFIC_REVIEW: true, // Independent scientific review required
};

// Management Planning Activities
export const FMP_ACTIVITIES = {
  FOREST_INVENTORY: {
    name: "Forest Inventory & Assessment",
    cost: 85000,
    duration_quarters: 1,
    improves: ["inventory_completion", "planning_quality"],
    description: "Detailed assessment of forest resources and ecosystem conditions"
  },
  STAKEHOLDER_CONSULTATION: {
    name: "Multi-Stakeholder Consultation",
    cost: 45000,
    duration_quarters: 1,
    improves: ["stakeholder_relations", "social_license"],
    description: "Engage with industry, environmental groups, and communities"
  },
  ENVIRONMENTAL_BASELINE: {
    name: "Environmental Baseline Study",
    cost: 120000,
    duration_quarters: 2,
    improves: ["environmental_data", "regulatory_compliance"],
    description: "Comprehensive environmental assessment and monitoring setup"
  },
  FIRST_NATIONS_ENGAGEMENT: {
    name: "First Nations Co-Management Planning",
    cost: 75000,
    duration_quarters: 1,
    improves: ["fn_relations", "cultural_integration"],
    description: "Collaborative planning with First Nations communities"
  },
  SCIENTIFIC_REVIEW: {
    name: "Independent Scientific Review",
    cost: 60000,
    duration_quarters: 1,
    improves: ["plan_credibility", "approval_likelihood"],
    description: "Third-party scientific validation of management approaches"
  },
  ADAPTIVE_MANAGEMENT: {
    name: "Adaptive Management Framework",
    cost: 40000,
    duration_quarters: 1,
    improves: ["management_flexibility", "long_term_success"],
    description: "Develop systems for continuous improvement and adaptation"
  }
};

/**
 * Initialize Forest Management Planning in game state
 */
export function initializeFMP(state) {
  if (!state.forest_management_plan) {
    state.forest_management_plan = {
      status: "NOT_STARTED", // NOT_STARTED, PLANNING, DEVELOPMENT, APPROVAL, IMPLEMENTATION, ACTIVE
      current_phase: null,
      phase_progress: 0,
      completion_percentage: 0,
      quality_score: 0.5,
      approval_likelihood: 0.3,
      
      // Requirements tracking
      inventory_completion: 0.2, // Starting inventory level
      stakeholder_consultations_completed: 0,
      environmental_assessment_complete: false,
      fn_engagement_sessions: 0,
      public_consultation_days: 0,
      scientific_review_complete: false,
      
      // Plan attributes
      planning_horizon_years: 20,
      sustainable_yield_calculated: false,
      ecosystem_management_integrated: false,
      climate_adaptation_included: false,
      
      // Operational impacts
      annual_management_cost: 0,
      harvest_efficiency_bonus: 0,
      permit_approval_bonus: 0,
      stakeholder_support_bonus: 0,
      
      // Timeline
      plan_started_year: 0,
      plan_started_quarter: 0,
      estimated_completion_quarter: 0,
      
      // Investment tracking
      total_invested: 0,
      activities_completed: []
    };
  }
}

/**
 * Main Forest Management Planning interface
 */
export async function forest_management_planning(state, write, terminal, input) {
  initializeFMP(state);
  
  const fmp = state.forest_management_plan;
  
  write("--- 🌲 FOREST MANAGEMENT PLANNING ---");
  write(`📋 Plan Status: ${fmp.status.replace('_', ' ')}`);
  write(`📊 Completion: ${(fmp.completion_percentage * 100).toFixed(1)}%`);
  write(`⭐ Quality Score: ${(fmp.quality_score * 100).toFixed(1)}%`);
  write(`📈 Approval Likelihood: ${(fmp.approval_likelihood * 100).toFixed(1)}%`);
  
  if (fmp.status === "NOT_STARTED") {
    await initiate_fmp_process(state, write, terminal, input);
  } else if (fmp.status === "PLANNING" || fmp.status === "DEVELOPMENT") {
    await continue_fmp_development(state, write, terminal, input);
  } else if (fmp.status === "APPROVAL") {
    await handle_fmp_approval_process(state, write, terminal, input);
  } else if (fmp.status === "IMPLEMENTATION") {
    await handle_fmp_implementation(state, write, terminal, input);
  } else if (fmp.status === "ACTIVE") {
    await manage_active_fmp(state, write, terminal, input);
  }
}

/**
 * Initiate the Forest Management Planning process
 */
async function initiate_fmp_process(state, write, terminal, input) {
  const fmp = state.forest_management_plan;
  
  write("\\n🚀 INITIATING FOREST MANAGEMENT PLAN");
  write("In Canada, forest management planning is mandatory for all commercial operations on public lands.");
  write("Your plan must cover a 20-year horizon and meet strict regulatory requirements.\\n");
  
  // Check prerequisites
  const prerequisites_met = check_fmp_prerequisites(state, write);
  if (!prerequisites_met) {
    write("❌ Prerequisites not met. Address these issues before starting FMP development.");
    return;
  }
  
  write("✅ Prerequisites satisfied. Ready to begin planning process.");
  
  const planning_options = [
    "🎯 Comprehensive Planning Approach ($400,000 - highest quality)",
    "⚖️  Balanced Planning Approach ($280,000 - good quality)", 
    "💰 Cost-Efficient Planning Approach ($180,000 - meets minimum requirements)",
    "📊 Review planning requirements without starting",
    "❌ Defer planning to later"
  ];
  
  const choice = await askChoice("Choose your Forest Management Planning approach:", planning_options, terminal, input);
  
  if (choice === 0) {
    await start_comprehensive_planning(state, write, terminal, input);
  } else if (choice === 1) {
    await start_balanced_planning(state, write, terminal, input);
  } else if (choice === 2) {
    await start_cost_efficient_planning(state, write, terminal, input);
  } else if (choice === 3) {
    await display_planning_requirements(state, write);
  } else {
    write("Forest Management Planning deferred. Note: You cannot harvest on public lands without an approved FMP.");
  }
}

/**
 * Check prerequisites for starting FMP
 */
function check_fmp_prerequisites(state, write) {
  let prerequisites_met = true;
  
  write("\\n📋 FMP Prerequisites Check:");
  
  // Budget check
  const min_budget_required = 180000;
  if (state.budget < min_budget_required) {
    write(`❌ Insufficient budget (need ${formatCurrency(min_budget_required)}, have ${formatCurrency(state.budget)})`);
    prerequisites_met = false;
  } else {
    write(`✅ Budget sufficient (${formatCurrency(state.budget)} available)`);
  }
  
  // Operational history
  if (state.years_operated < 1) {
    write("⚠️  New company - plan review may take longer");
  } else {
    write(`✅ Operational experience: ${state.years_operated} years`);
  }
  
  // Regulatory compliance
  if (state.safety_violations > 5) {
    write("⚠️  Safety violations may impact plan approval");
  } else {
    write("✅ Safety record acceptable");
  }
  
  // Stakeholder relationships
  if (state.community_support < 0.3) {
    write("⚠️  Low community support may complicate consultation process");
  } else {
    write("✅ Community relations adequate for planning process");
  }
  
  return prerequisites_met;
}

/**
 * Start comprehensive planning approach
 */
async function start_comprehensive_planning(state, write, terminal, input) {
  const total_cost = 400000;
  
  if (state.budget < total_cost) {
    write(`❌ Insufficient budget for comprehensive approach.`);
    return;
  }
  
  write("\\n🎯 COMPREHENSIVE PLANNING APPROACH SELECTED");
  write("This approach includes all optional components and ensures highest approval likelihood.");
  write(`💰 Total Investment: ${formatCurrency(total_cost)}`);
  write("📅 Estimated Timeline: 11 quarters (2.75 years)");
  write("⭐ Expected Quality Score: 90-95%");
  write("📈 Approval Likelihood: 85-95%");
  
  const confirm = await askChoice("Proceed with comprehensive planning?", ["Yes", "No"], terminal, input);
  
  if (confirm === 0) {
    state.budget -= total_cost;
    const fmp = state.forest_management_plan;
    
    fmp.status = "PLANNING";
    fmp.current_phase = "PLANNING";
    fmp.quality_score = 0.9;
    fmp.approval_likelihood = 0.9;
    fmp.plan_started_year = state.year;
    fmp.plan_started_quarter = state.quarter;
    fmp.estimated_completion_quarter = state.quarter + 11;
    fmp.total_invested = total_cost;
    
    write(`✅ Comprehensive FMP development initiated!`);
    write(`💰 Budget remaining: ${formatCurrency(state.budget)}`);
    
    // Start first activities
    await initiate_planning_activities(state, write, "comprehensive");
  }
}

/**
 * Start balanced planning approach
 */
async function start_balanced_planning(state, write, terminal, input) {
  const total_cost = 280000;
  
  if (state.budget < total_cost) {
    write(`❌ Insufficient budget for balanced approach.`);
    return;
  }
  
  write("\\n⚖️  BALANCED PLANNING APPROACH SELECTED");
  write("This approach includes key components while managing costs effectively.");
  write(`💰 Total Investment: ${formatCurrency(total_cost)}`);
  write("📅 Estimated Timeline: 9 quarters (2.25 years)");
  write("⭐ Expected Quality Score: 75-85%");
  write("📈 Approval Likelihood: 70-85%");
  
  const confirm = await askChoice("Proceed with balanced planning?", ["Yes", "No"], terminal, input);
  
  if (confirm === 0) {
    state.budget -= total_cost;
    const fmp = state.forest_management_plan;
    
    fmp.status = "PLANNING";
    fmp.current_phase = "PLANNING";
    fmp.quality_score = 0.8;
    fmp.approval_likelihood = 0.75;
    fmp.plan_started_year = state.year;
    fmp.plan_started_quarter = state.quarter;
    fmp.estimated_completion_quarter = state.quarter + 9;
    fmp.total_invested = total_cost;
    
    write(`✅ Balanced FMP development initiated!`);
    write(`💰 Budget remaining: ${formatCurrency(state.budget)}`);
    
    await initiate_planning_activities(state, write, "balanced");
  }
}

/**
 * Start cost-efficient planning approach  
 */
async function start_cost_efficient_planning(state, write, terminal, input) {
  const total_cost = 180000;
  
  if (state.budget < total_cost) {
    write(`❌ Insufficient budget for cost-efficient approach.`);
    return;
  }
  
  write("\\n💰 COST-EFFICIENT PLANNING APPROACH SELECTED");
  write("This approach meets minimum regulatory requirements at lowest cost.");
  write(`💰 Total Investment: ${formatCurrency(total_cost)}`);
  write("📅 Estimated Timeline: 7 quarters (1.75 years)");
  write("⭐ Expected Quality Score: 60-70%");  
  write("📈 Approval Likelihood: 50-70%");
  write("⚠️  Higher risk of approval delays or additional requirements");
  
  const confirm = await askChoice("Proceed with cost-efficient planning?", ["Yes", "No"], terminal, input);
  
  if (confirm === 0) {
    state.budget -= total_cost;
    const fmp = state.forest_management_plan;
    
    fmp.status = "PLANNING";
    fmp.current_phase = "PLANNING";
    fmp.quality_score = 0.65;
    fmp.approval_likelihood = 0.6;
    fmp.plan_started_year = state.year;
    fmp.plan_started_quarter = state.quarter;
    fmp.estimated_completion_quarter = state.quarter + 7;
    fmp.total_invested = total_cost;
    
    write(`✅ Cost-efficient FMP development initiated!`);
    write(`💰 Budget remaining: ${formatCurrency(state.budget)}`);
    
    await initiate_planning_activities(state, write, "cost_efficient");
  }
}

/**
 * Display detailed planning requirements
 */
async function display_planning_requirements(state, write) {
  write("\\n📋 FOREST MANAGEMENT PLAN REQUIREMENTS");
  write("Based on Canadian forest management standards:\\n");
  
  write("🏛️  REGULATORY REQUIREMENTS:");
  write("  • 20-year strategic planning horizon");
  write("  • Sustainable yield calculations");
  write("  • Ecosystem-based management approach");
  write("  • Climate change adaptation strategies");
  write("  • Biodiversity conservation measures");
  write("  • Soil and water protection protocols\\n");
  
  write("👥 CONSULTATION REQUIREMENTS:");
  write("  • Minimum 3 stakeholder consultation sessions");
  write("  • First Nations engagement (minimum 2 sessions)");  
  write("  • 60-day public review period");
  write("  • Government agency consultations\\n");
  
  write("📊 TECHNICAL REQUIREMENTS:");
  write("  • Forest inventory completion (minimum 85%)");
  write("  • Environmental baseline assessment");
  write("  • Independent scientific review");
  write("  • Monitoring and adaptive management framework\\n");
  
  write("⏱️  APPROVAL PROCESS:");
  write("  • Government technical review (60-90 days)");
  write("  • Public consultation period (60 days)");
  write("  • Final government approval (30-60 days)");
  write("  • Implementation phase (6 months)");
}

/**
 * Initiate planning activities based on approach
 */
async function initiate_planning_activities(state, write, approach) {
  const fmp = state.forest_management_plan;
  
  write("\\n📋 PLANNING ACTIVITIES INITIATED:");
  
  if (approach === "comprehensive") {
    fmp.activities_completed.push("Advanced Forest Inventory");
    fmp.activities_completed.push("Comprehensive Stakeholder Consultation");
    fmp.activities_completed.push("Detailed Environmental Assessment");
    fmp.activities_completed.push("First Nations Co-Management Planning");
    fmp.activities_completed.push("Independent Scientific Review");
    fmp.activities_completed.push("Climate Adaptation Framework");
    
    fmp.inventory_completion = 0.95;
    fmp.stakeholder_consultations_completed = 4;
    fmp.environmental_assessment_complete = true;
    fmp.fn_engagement_sessions = 3;
    fmp.scientific_review_complete = true;
    
  } else if (approach === "balanced") {
    fmp.activities_completed.push("Standard Forest Inventory");
    fmp.activities_completed.push("Multi-Stakeholder Consultation");
    fmp.activities_completed.push("Environmental Baseline Study");
    fmp.activities_completed.push("First Nations Engagement");
    fmp.activities_completed.push("Scientific Review");
    
    fmp.inventory_completion = 0.88;
    fmp.stakeholder_consultations_completed = 3;
    fmp.environmental_assessment_complete = true;
    fmp.fn_engagement_sessions = 2;
    fmp.scientific_review_complete = true;
    
  } else if (approach === "cost_efficient") {
    fmp.activities_completed.push("Basic Forest Inventory");
    fmp.activities_completed.push("Minimum Stakeholder Consultation");
    fmp.activities_completed.push("Basic Environmental Assessment");
    fmp.activities_completed.push("Required First Nations Consultation");
    
    fmp.inventory_completion = 0.85;
    fmp.stakeholder_consultations_completed = 3;
    fmp.environmental_assessment_complete = true;
    fmp.fn_engagement_sessions = 2;
    fmp.scientific_review_complete = false;
  }
  
  fmp.activities_completed.forEach(activity => {
    write(`  ✅ ${activity} scheduled`);
  });
  
  write("\\n🎯 Planning phase will progress automatically over the coming quarters.");
  write("📈 You can enhance the plan quality with additional investments during development.");
}

/**
 * Continue FMP development during planning/development phases
 */
async function continue_fmp_development(state, write, terminal, input) {
  const fmp = state.forest_management_plan;
  
  // Progress calculation
  const quarters_elapsed = ((state.year - fmp.plan_started_year) * 4) + (state.quarter - fmp.plan_started_quarter);
  const progress_percentage = Math.min(1.0, quarters_elapsed / fmp.estimated_completion_quarter);
  
  fmp.completion_percentage = progress_percentage;
  
  write(`\\n📊 FMP Development Progress: ${(progress_percentage * 100).toFixed(1)}%`);
  write(`⏱️  Quarters Elapsed: ${quarters_elapsed} / ${fmp.estimated_completion_quarter}`);
  write(`📋 Current Phase: ${fmp.current_phase.replace('_', ' ')}`);
  
  if (progress_percentage >= 0.3 && fmp.current_phase === "PLANNING") {
    fmp.current_phase = "DEVELOPMENT";
    write("🔄 Phase transition: Moving to Development Phase");
  }
  
  if (progress_percentage >= 0.8 && fmp.current_phase === "DEVELOPMENT") {
    fmp.current_phase = "APPROVAL";
    fmp.status = "APPROVAL";
    write("🔄 Phase transition: Ready for Government Approval");
  }
  
  // Optional enhancement opportunities
  if (progress_percentage < 0.8) {
    await offer_fmp_enhancements(state, write, terminal, input);
  }
}

/**
 * Offer optional FMP enhancements during development
 */
async function offer_fmp_enhancements(state, write, terminal, input) {
  const fmp = state.forest_management_plan;
  
  write("\\n💡 OPTIONAL FMP ENHANCEMENTS AVAILABLE:");
  
  const enhancement_options = [
    "🔬 Advanced Ecological Modeling ($65,000) - +15% approval likelihood",
    "🤝 Additional Stakeholder Workshops ($35,000) - +10% community support",
    "📱 Digital Monitoring Systems ($85,000) - +20% operational efficiency",
    "🌡️ Climate Risk Assessment ($45,000) - Future-proof against climate change",
    "🦌 Wildlife Habitat Enhancement Plan ($55,000) - +biodiversity score",
    "❌ No enhancements this quarter"
  ];
  
  const choice = await askChoice("Select enhancement (if any):", enhancement_options, terminal, input);
  
  if (choice === 0 && state.budget >= 65000) {
    state.budget -= 65000;
    fmp.approval_likelihood += 0.15;
    fmp.total_invested += 65000;
    write("✅ Advanced ecological modeling added to FMP");
  } else if (choice === 1 && state.budget >= 35000) {
    state.budget -= 35000;
    state.community_support += 0.1;
    fmp.total_invested += 35000;
    write("✅ Additional stakeholder workshops scheduled");
  } else if (choice === 2 && state.budget >= 85000) {
    state.budget -= 85000;
    fmp.harvest_efficiency_bonus += 0.2;
    fmp.total_invested += 85000;
    write("✅ Digital monitoring systems integrated into plan");
  } else if (choice === 3 && state.budget >= 45000) {
    state.budget -= 45000;
    fmp.climate_adaptation_included = true;
    fmp.total_invested += 45000;
    write("✅ Climate risk assessment completed");
  } else if (choice === 4 && state.budget >= 55000) {
    state.budget -= 55000;
    state.biodiversity_score += 0.1;
    fmp.total_invested += 55000;
    write("✅ Wildlife habitat enhancement plan developed");
  } else if (choice < 5) {
    write("❌ Insufficient budget for selected enhancement");
  }
}

/**
 * Handle FMP approval process
 */
async function handle_fmp_approval_process(state, write, terminal, input) {
  const fmp = state.forest_management_plan;
  
  write("\\n🏛️  GOVERNMENT APPROVAL PROCESS");
  write("Your Forest Management Plan has been submitted for regulatory approval.");
  
  // Calculate approval outcome
  let approval_chance = fmp.approval_likelihood;
  
  // External factors affecting approval
  if (state.reputation < 0.4) {
    approval_chance -= 0.2;
    write("⚠️  Company reputation concerns may impact approval");
  }
  
  if (state.community_support < 0.5) {
    approval_chance -= 0.15;
    write("⚠️  Community opposition may delay approval");
  }
  
  if (state.safety_violations > 3) {
    approval_chance -= 0.1;
    write("⚠️  Safety record concerns noted by regulators");
  }
  
  // Certification bonus
  const cert_bonus = Math.min(0.1, state.get_active_certifications().length * 0.05);
  approval_chance += cert_bonus;
  
  write(`\\n📊 Final Approval Likelihood: ${(approval_chance * 100).toFixed(1)}%`);
  
  const approval_options = [
    "📋 Submit plan for formal approval",
    "⏰ Wait another quarter for better conditions",
    "🔧 Request plan modifications to improve approval chances",
    "❌ Withdraw application (restart planning process)"
  ];
  
  const choice = await askChoice("Choose approval strategy:", approval_options, terminal, input);
  
  if (choice === 0) {
    await process_fmp_approval(state, write, approval_chance);
  } else if (choice === 1) {
    write("⏳ Approval submission delayed to next quarter");
  } else if (choice === 2) {
    await request_plan_modifications(state, write, terminal, input);
  } else {
    write("❌ FMP application withdrawn. Planning process must restart.");
    fmp.status = "NOT_STARTED";
    fmp.completion_percentage = 0;
  }
}

/**
 * Process FMP approval decision
 */
async function process_fmp_approval(state, write, approval_chance) {
  const fmp = state.forest_management_plan;
  const approved = Math.random() < approval_chance;
  
  if (approved) {
    write("\\n🎉 FOREST MANAGEMENT PLAN APPROVED!");
    write("✅ Your 20-year FMP has received government approval");
    write("📋 Plan is now legally binding and operational");
    
    fmp.status = "IMPLEMENTATION";
    fmp.current_phase = "IMPLEMENTATION";
    
    // Apply benefits
    state.permit_bonus += 0.2; // Easier permit approvals
    state.reputation += 0.15;
    state.annual_allowable_cut *= 1.1; // 10% AAC increase
    
    write("\\n📈 BENEFITS ACTIVATED:");
    write("  • +20% permit approval rates");
    write("  • +15% company reputation");
    write("  • +10% Annual Allowable Cut");
    write("  • Access to sustainable forestry markets");
    
  } else {
    write("\\n❌ FOREST MANAGEMENT PLAN CONDITIONAL APPROVAL");
    
    const issues = [
      "Additional First Nations consultation required",
      "Enhanced environmental mitigation measures needed",
      "Inadequate climate adaptation strategies",
      "Insufficient biodiversity protection measures",
      "Unclear sustainable yield calculations"
    ];
    
    const required_issue = issues[Math.floor(Math.random() * issues.length)];
    write(`📋 Issue: ${required_issue}`);
    write("💰 Additional cost to address: $120,000");
    write("⏱️  Additional time required: 2 quarters");
    
    fmp.approval_likelihood += 0.3; // Higher chance on resubmission
    
    // Offer to address issues
    write("\\nOptions:");
    write("1. Pay to address issues and resubmit");
    write("2. Appeal the decision (longer process, same cost)");
    write("3. Accept limited approval (reduced benefits)");
  }
}

/**
 * Request plan modifications to improve approval chances
 */
async function request_plan_modifications(state, write, terminal, input) {
  write("\\n🔧 PLAN MODIFICATION OPTIONS");
  write("Available modifications to improve approval likelihood:");
  
  const modification_options = [
    "🌿 Enhanced Environmental Protection ($75,000) - +25% approval",
    "🤝 Extended Community Consultation ($45,000) - +15% approval", 
    "📊 Additional Scientific Review ($60,000) - +20% approval",
    "🏛️  Government Liaison Services ($90,000) - +30% approval",
    "❌ Submit plan without modifications"
  ];
  
  const choice = await askChoice("Choose modification:", modification_options, terminal, input);
  
  const fmp = state.forest_management_plan;
  
  if (choice === 0 && state.budget >= 75000) {
    state.budget -= 75000;
    fmp.approval_likelihood += 0.25;
    write("✅ Enhanced environmental protection measures added");
  } else if (choice === 1 && state.budget >= 45000) {
    state.budget -= 45000;
    fmp.approval_likelihood += 0.15;
    write("✅ Extended community consultation scheduled");
  } else if (choice === 2 && state.budget >= 60000) {
    state.budget -= 60000;
    fmp.approval_likelihood += 0.20;
    write("✅ Additional scientific review commissioned");
  } else if (choice === 3 && state.budget >= 90000) {
    state.budget -= 90000;
    fmp.approval_likelihood += 0.30;
    write("✅ Government liaison services engaged");
  } else if (choice < 4) {
    write("❌ Insufficient budget for selected modification");
  }
}

/**
 * Handle FMP implementation phase
 */
async function handle_fmp_implementation(state, write, terminal, input) {
  const fmp = state.forest_management_plan;
  
  write("\\n🚀 FMP IMPLEMENTATION PHASE");
  write("Implementing approved Forest Management Plan across operations.");
  
  // Implementation activities
  const impl_activities = [
    "Staff training on new procedures",
    "Monitoring system deployment", 
    "Operational protocol updates",
    "Stakeholder communication systems",
    "Adaptive management framework setup"
  ];
  
  write("\\n📋 Implementation Activities:");
  impl_activities.forEach(activity => {
    write(`  ✅ ${activity}`);
  });
  
  // Implementation is automatic - takes 4 quarters
  const impl_progress = Math.min(1.0, fmp.phase_progress / 4);
  
  if (impl_progress >= 1.0) {
    fmp.status = "ACTIVE";
    fmp.current_phase = "MONITORING";
    write("\\n🎯 FMP IMPLEMENTATION COMPLETE!");
    write("✅ Forest Management Plan is now fully operational");
    write("📊 Beginning 5-year monitoring and adaptive management cycle");
    
    // Full benefits now active
    fmp.annual_management_cost = 50000;
    write(`\\n💰 Annual FMP management cost: ${formatCurrency(fmp.annual_management_cost)}`);
  } else {
    write(`\\n📊 Implementation Progress: ${(impl_progress * 100).toFixed(1)}%`);
    fmp.phase_progress++;
  }
}

/**
 * Manage active Forest Management Plan
 */
async function manage_active_fmp(state, write, terminal, input) {
  const fmp = state.forest_management_plan;
  
  write("\\n🌲 ACTIVE FOREST MANAGEMENT PLAN");
  write(`📅 Plan Year: ${state.year - fmp.plan_started_year + 1} of 20`);
  write(`⭐ Plan Performance: ${(fmp.quality_score * 100).toFixed(1)}%`);
  write(`💰 Annual Management Cost: ${formatCurrency(fmp.annual_management_cost)}`);
  
  // Annual FMP review and adaptive management
  if (state.quarter === 4) {
    await annual_fmp_review(state, write, terminal, input);
  }
  
  // Optional activities
  const fmp_activities = [
    "📊 Conduct mid-term plan review ($25,000)",
    "🔬 Commission additional research ($40,000)",
    "🤝 Stakeholder engagement refresh ($30,000)",
    "🌿 Ecosystem restoration project ($75,000)",
    "📈 Plan performance optimization ($50,000)",
    "❌ No additional activities this quarter"
  ];
  
  const choice = await askChoice("Select FMP activity:", fmp_activities, terminal, input);
  
  // Handle activities
  if (choice === 0 && state.budget >= 25000) {
    state.budget -= 25000;
    fmp.quality_score += 0.05;
    write("✅ Mid-term plan review completed - quality improved");
  } else if (choice === 1 && state.budget >= 40000) {
    state.budget -= 40000;
    fmp.approval_likelihood += 0.1;
    write("✅ Additional research commissioned - credibility enhanced");
  } else if (choice === 2 && state.budget >= 30000) {
    state.budget -= 30000;
    state.community_support += 0.08;
    write("✅ Stakeholder engagement refreshed - community support improved");
  } else if (choice === 3 && state.budget >= 75000) {
    state.budget -= 75000;
    state.biodiversity_score += 0.12;
    write("✅ Ecosystem restoration project initiated");
  } else if (choice === 4 && state.budget >= 50000) {
    state.budget -= 50000;
    fmp.harvest_efficiency_bonus += 0.1;
    write("✅ Plan performance optimization completed");
  }
}

/**
 * Annual FMP review and renewal considerations
 */
async function annual_fmp_review(state, write, terminal, input) {
  const fmp = state.forest_management_plan;
  const plan_age = state.year - fmp.plan_started_year;
  
  write("\\n📋 ANNUAL FMP PERFORMANCE REVIEW");
  
  // Deduct annual management costs
  if (state.budget >= fmp.annual_management_cost) {
    state.budget -= fmp.annual_management_cost;
    write(`💰 Annual FMP management cost: ${formatCurrency(fmp.annual_management_cost)} paid`);
  } else {
    write("❌ Cannot afford FMP management costs - plan effectiveness declining");
    fmp.quality_score -= 0.1;
    state.permit_bonus -= 0.05;
  }
  
  // Plan renewal considerations (every 5 years minimum)
  if (plan_age >= 5 && plan_age % 5 === 0) {
    write("\\n🔄 FMP RENEWAL OPPORTUNITY");
    write("Your Forest Management Plan is eligible for renewal/revision.");
    write("Benefits of renewal:");
    write("  • Updated to current scientific standards");
    write("  • Incorporates lessons learned");
    write("  • Addresses changing environmental conditions");
    write("  • Maintains regulatory compliance");
    
    const renewal_options = [
      `🔄 Full Plan Renewal (${formatCurrency(200000)}) - Reset to latest standards`,
      `⚡ Plan Update (${formatCurrency(80000)}) - Minor revisions only`,
      "⏰ Defer renewal to next year",
      "❌ Continue with current plan (declining effectiveness)"
    ];
    
    const choice = await askChoice("FMP Renewal Decision:", renewal_options, terminal, input);
    
    if (choice === 0 && state.budget >= 200000) {
      state.budget -= 200000;
      fmp.quality_score = 0.9;
      fmp.approval_likelihood = 0.85;
      write("✅ Full FMP renewal completed - plan effectiveness restored");
    } else if (choice === 1 && state.budget >= 80000) {
      state.budget -= 80000;
      fmp.quality_score += 0.1;
      write("✅ FMP update completed - minor improvements implemented");
    } else if (choice === 3) {
      fmp.quality_score -= 0.05;
      state.permit_bonus -= 0.02;
      write("⚠️  Plan aging - effectiveness gradually declining");
    }
  }
}

/**
 * Check FMP requirements for permit approvals
 */
export function check_fmp_requirements_for_permits(state) {
  const fmp = state.forest_management_plan;
  
  if (!fmp || fmp.status !== "ACTIVE") {
    return {
      has_approved_fmp: false,
      permit_penalty: -0.8, // Massive penalty for no FMP
      message: "No approved Forest Management Plan - commercial harvesting not permitted"
    };
  }
  
  return {
    has_approved_fmp: true,
    permit_bonus: state.permit_bonus,
    harvest_efficiency_bonus: fmp.harvest_efficiency_bonus,
    message: "Active FMP supports permit applications"
  };
}

/**
 * Get FMP status summary for UI
 */
export function get_fmp_status_summary(state) {
  const fmp = state.forest_management_plan;
  
  if (!fmp || fmp.status === "NOT_STARTED") {
    return {
      status: "Not Started",
      warning: "FMP required for commercial operations",
      color: "red"
    };
  }
  
  const status_display = {
    "PLANNING": { text: "In Planning", color: "yellow" },
    "DEVELOPMENT": { text: "In Development", color: "yellow" }, 
    "APPROVAL": { text: "Awaiting Approval", color: "orange" },
    "IMPLEMENTATION": { text: "Implementing", color: "blue" },
    "ACTIVE": { text: "Active", color: "green" }
  };
  
  const display = status_display[fmp.status];
  
  return {
    status: display.text,
    completion: `${(fmp.completion_percentage * 100).toFixed(1)}%`,
    quality: `${(fmp.quality_score * 100).toFixed(1)}%`,
    color: display.color,
    annual_cost: fmp.status === "ACTIVE" ? fmp.annual_management_cost : 0
  };
}