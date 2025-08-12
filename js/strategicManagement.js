import { ask, askChoice, formatCurrency, formatVolume } from "./utils.js";
import { forest_management_planning } from "./forestManagementPlanning.js";
import { strategic_permit_submission } from "./permits.js";
import { liaison_management } from "./liaison.js";

// Quarterly Management Capacity System
export const MANAGEMENT_CAPACITY = {
  SMALL_COMPANY: { actions_per_quarter: 2, staff_cost: 50000 },
  MEDIUM_COMPANY: { actions_per_quarter: 3, staff_cost: 120000 },
  LARGE_COMPANY: { actions_per_quarter: 4, staff_cost: 200000 },
  ENTERPRISE: { actions_per_quarter: 5, staff_cost: 350000 }
};

// Strategic Management Activities with prerequisites and effects
export const MANAGEMENT_ACTIVITIES = {
  PERMIT_FOCUS: {
    name: "Strategic Permit Management",
    cost: 25000,
    duration: 1, // quarters
    prerequisites: { staff_level: "SMALL_COMPANY" },
    effects: { permit_efficiency: 0.15 },
    description: "Focus management attention on permit applications and approvals",
    action: "permit_management"
  },
  FN_ENGAGEMENT: {
    name: "First Nations Relationship Building",
    cost: 35000,
    duration: 1,
    prerequisites: { staff_level: "SMALL_COMPANY" },
    effects: { fn_relations: 0.12, community_support: 0.08 },
    description: "Comprehensive engagement with First Nations communities",
    action: "fn_engagement"
  },
  STRATEGIC_PLANNING: {
    name: "Strategic Business Planning", 
    cost: 45000,
    duration: 2,
    prerequisites: { staff_level: "MEDIUM_COMPANY" },
    effects: { planning_bonus: 0.1, efficiency: 0.08 },
    description: "Long-term strategic planning and business optimization",
    action: "strategic_planning"
  },
  MARKET_DEVELOPMENT: {
    name: "Market Development & Sales",
    cost: 60000,
    duration: 1,
    prerequisites: { staff_level: "MEDIUM_COMPANY" },
    effects: { price_premium: 0.12, customer_relations: 0.15 },
    description: "Develop new markets and strengthen customer relationships",
    action: "market_development"
  },
  ENVIRONMENTAL_STEWARDSHIP: {
    name: "Environmental Stewardship Program",
    cost: 75000,
    duration: 2,
    prerequisites: { staff_level: "MEDIUM_COMPANY" },
    effects: { reputation: 0.2, permit_bonus: 0.1, biodiversity_score: 0.15 },
    description: "Comprehensive environmental protection and enhancement",
    action: "environmental_program"
  },
  INNOVATION_RD: {
    name: "Innovation & Research Development",
    cost: 85000,
    duration: 3,
    prerequisites: { staff_level: "LARGE_COMPANY", budget_minimum: 500000 },
    effects: { efficiency: 0.2, technology_bonus: 0.15, competitive_advantage: 0.1 },
    description: "Invest in new technologies and operational innovations",
    action: "innovation_rd"
  },
  SUPPLY_CHAIN: {
    name: "Supply Chain Optimization",
    cost: 55000,
    duration: 2,
    prerequisites: { staff_level: "MEDIUM_COMPANY" },
    effects: { cost_reduction: 0.08, operational_efficiency: 0.12 },
    description: "Optimize logistics, equipment, and operational processes",
    action: "supply_chain"
  },
  RISK_MANAGEMENT: {
    name: "Enterprise Risk Management",
    cost: 70000,
    duration: 2,
    prerequisites: { staff_level: "LARGE_COMPANY" },
    effects: { disaster_resilience: 0.25, insurance_discount: 0.15 },
    description: "Comprehensive risk assessment and mitigation strategies",
    action: "risk_management"
  },
  WORKFORCE_DEVELOPMENT: {
    name: "Workforce Training & Development", 
    cost: 40000,
    duration: 1,
    prerequisites: { staff_level: "MEDIUM_COMPANY" },
    effects: { safety_bonus: 0.2, productivity: 0.1, employee_retention: 0.15 },
    description: "Invest in employee skills and safety training",
    action: "workforce_development"
  },
  TECHNOLOGY_UPGRADE: {
    name: "Technology Modernization",
    cost: 120000,
    duration: 2,
    prerequisites: { staff_level: "MEDIUM_COMPANY" },
    effects: { operating_cost_reduction: 0.15, harvest_efficiency: 0.1, technology_level: 1 },
    description: "Upgrade equipment and operational technology to reduce costs",
    action: "technology_upgrade"
  },
  CARBON_CREDITS: {
    name: "Carbon Credits Program",
    cost: 50000,
    duration: 1,
    prerequisites: { staff_level: "SMALL_COMPANY", reputation_minimum: 0.4 },
    effects: { carbon_credits_enrolled: true, reputation: 0.15 },
    description: "Enroll in carbon credit program for preserved forest areas",
    action: "carbon_credits"
  },
  INSURANCE_COVERAGE: {
    name: "Comprehensive Insurance",
    cost: 0, // Premium paid quarterly
    duration: 1,
    prerequisites: { staff_level: "SMALL_COMPANY" },
    effects: { insurance_coverage: true, disaster_protection: 0.5 },
    description: "Purchase insurance to protect against disasters and accidents",
    action: "insurance"
  },
  JOINT_VENTURE: {
    name: "Joint Venture Partnership",
    cost: 75000,
    duration: 3,
    prerequisites: { staff_level: "MEDIUM_COMPANY", reputation_minimum: 0.5 },
    effects: { cost_sharing: 0.3, market_access: 0.2 },
    description: "Form partnership to share costs and access new markets",
    action: "joint_venture"
  },
  CLIMATE_ADAPTATION: {
    name: "Climate Adaptation Program",
    cost: 80000,
    duration: 2,
    prerequisites: { staff_level: "MEDIUM_COMPANY" },
    effects: { aac_decline_reduction: 0.005, weather_resilience: 0.2 },
    description: "Implement climate adaptation strategies to preserve AAC",
    action: "climate_adaptation"
  },
  GOVERNMENT_RELATIONS: {
    name: "Government Relations & Lobbying",
    cost: 90000,
    duration: 1,
    prerequisites: { staff_level: "LARGE_COMPANY", reputation_minimum: 0.6 },
    effects: { regulatory_influence: 0.2, permit_bonus: 0.15, policy_access: 0.1 },
    description: "Build relationships with government officials and policymakers",
    action: "government_relations"
  },
  CRISIS_MANAGEMENT: {
    name: "Crisis Communication & Management",
    cost: 65000,
    duration: 1,
    prerequisites: { staff_level: "MEDIUM_COMPANY" },
    effects: { reputation_protection: 0.3, media_relations: 0.2 },
    description: "Prepare for and manage potential crises and PR challenges",
    action: "crisis_management"
  }
};

/**
 * Initialize strategic management tracking
 */
export function initializeStrategicManagement(state) {
  if (!state.strategic_management) {
    state.strategic_management = {
      company_size: "SMALL_COMPANY",
      quarterly_actions_used: 0,
      quarterly_actions_available: MANAGEMENT_CAPACITY.SMALL_COMPANY.actions_per_quarter,
      staff_cost: MANAGEMENT_CAPACITY.SMALL_COMPANY.staff_cost,
      
      // Active initiatives
      active_initiatives: [],
      completed_initiatives: [],
      
      // Strategic bonuses
      bonuses: {
        permit_efficiency: 0,
        planning_bonus: 0,
        price_premium: 0,
        cost_reduction: 0,
        operational_efficiency: 0,
        technology_bonus: 0,
        competitive_advantage: 0,
        disaster_resilience: 0,
        safety_bonus: 0,
        productivity: 0,
        regulatory_influence: 0,
        reputation_protection: 0
      },
      
      // Performance tracking
      initiative_success_rate: 0.75,
      management_effectiveness: 0.6,
      last_quarter_reset: { year: state.year, quarter: state.quarter }
    };
  }
}

/**
 * Main strategic management interface
 */
export async function strategic_management_decisions(state, write, terminal, input) {
  initializeStrategicManagement(state);
  
  // Reset quarterly actions at start of new quarter
  resetQuarterlyActions(state, write);
  
  const sm = state.strategic_management;
  
  write("--- 🎯 STRATEGIC MANAGEMENT DECISIONS ---");
  write(`🏢 Company Size: ${sm.company_size.replace('_', ' ')}`);
  write(`⚡ Actions Available: ${sm.quarterly_actions_available - sm.quarterly_actions_used}/${sm.quarterly_actions_available}`);
  write(`💰 Quarterly Staff Cost: ${formatCurrency(sm.staff_cost / 4)}`);
  
  if (sm.quarterly_actions_used >= sm.quarterly_actions_available) {
    write("❌ No management capacity remaining this quarter!");
    write("💡 Consider: Expand management team, delegate to CEO, or wait for next quarter");
    await offer_capacity_expansion(state, write, terminal, input);
    return;
  }
  
  // Show active initiatives
  if (sm.active_initiatives.length > 0) {
    write("\n📋 Active Initiatives:");
    sm.active_initiatives.forEach(initiative => {
      const progress = Math.min(100, (initiative.progress / initiative.duration) * 100);
      write(`  🔄 ${initiative.name}: ${progress.toFixed(0)}% complete`);
    });
  }
  
  // Offer management activities
  await selectManagementActivity(state, write, terminal, input);
}

/**
 * Reset quarterly action counters
 */
function resetQuarterlyActions(state, write) {
  const sm = state.strategic_management;
  const lastReset = sm.last_quarter_reset;
  
  if (state.year !== lastReset.year || state.quarter !== lastReset.quarter) {
    sm.quarterly_actions_used = 0;
    sm.last_quarter_reset = { year: state.year, quarter: state.quarter };
    
    // Pay quarterly staff costs
    const quarterly_cost = sm.staff_cost / 4;
    if (state.budget >= quarterly_cost) {
      state.budget -= quarterly_cost;
    } else {
      // Cannot afford staff - reduce capacity
      write("⚠️  Cannot afford full management staff - reducing capacity");
      sm.quarterly_actions_available = Math.max(1, sm.quarterly_actions_available - 1);
    }
    
    // Progress active initiatives
    progressActiveInitiatives(state, write);
  }
}

/**
 * Progress active initiatives
 */
function progressActiveInitiatives(state, write) {
  const sm = state.strategic_management;
  const completed = [];
  
  sm.active_initiatives.forEach(initiative => {
    initiative.progress++;
    
    if (initiative.progress >= initiative.duration) {
      completed.push(initiative);
      
      // Apply benefits
      const activity = MANAGEMENT_ACTIVITIES[initiative.activity_key];
      Object.entries(activity.effects).forEach(([effect, value]) => {
        // Handle special effects
        if (effect === 'carbon_credits_enrolled') {
          state.carbon_credits_enrolled = value;
          write("🌳 Carbon credits program activated - will generate revenue quarterly");
        } else if (effect === 'insurance_coverage') {
          state.insurance_coverage = value;
          write("🛡️ Insurance coverage activated - quarterly premium will be charged");
        } else if (effect === 'technology_level') {
          state.technology_level += value;
          write(`🔧 Technology level increased to ${state.technology_level}`);
        } else if (effect === 'operating_cost_reduction') {
          state.operating_cost_per_m3 *= (1 - value);
          write(`💰 Operating costs reduced by ${(value * 100).toFixed(0)}%`);
        } else if (effect === 'aac_decline_reduction') {
          state.aac_decline_rate = Math.max(0.005, state.aac_decline_rate - value);
          write(`🌲 AAC decline rate reduced to ${(state.aac_decline_rate * 100).toFixed(1)}% per year`);
        } else if (sm.bonuses.hasOwnProperty(effect)) {
          sm.bonuses[effect] += value;
        } else if (state.hasOwnProperty(effect)) {
          state[effect] += value;
        }
      });
      
      sm.completed_initiatives.push({
        ...initiative,
        completed_year: state.year,
        completed_quarter: state.quarter
      });
    }
  });
  
  // Remove completed initiatives
  sm.active_initiatives = sm.active_initiatives.filter(init => !completed.includes(init));
  
  if (completed.length > 0 && typeof write === 'function') {
    write(`\n✅ Completed Initiatives: ${completed.map(i => i.name).join(", ")}`);
  }
}

/**
 * Select management activity for the quarter
 */
async function selectManagementActivity(state, write, terminal, input) {
  const sm = state.strategic_management;
  
  // Filter available activities based on prerequisites
  const availableActivities = Object.entries(MANAGEMENT_ACTIVITIES)
    .filter(([key, activity]) => checkPrerequisites(state, activity))
    .map(([key, activity]) => ({
      key,
      ...activity,
      display: `${activity.name} (${formatCurrency(activity.cost)}, ${activity.duration}Q) - ${activity.description}`
    }));
  
  const activityOptions = [
    ...availableActivities.map(a => a.display),
    "🌲 Forest Management Planning",
    "📋 Strategic Permit Management", 
    "🤝 First Nations Liaison Management",
    "👔 CEO Management Activities",
    "📊 Company Performance Review",
    "🏢 Expand Management Capacity",
    "❌ Skip management activities this quarter"
  ];
  
  const choice = await askChoice("Choose strategic action:", activityOptions, terminal, input);
  
  if (choice < availableActivities.length) {
    // Regular management activity
    const selectedActivity = availableActivities[choice];
    await executeManagementActivity(state, write, terminal, input, selectedActivity);
    
  } else if (choice === availableActivities.length) {
    // Forest Management Planning
    await forest_management_planning(state, write, terminal, input);
    sm.quarterly_actions_used++;
    
  } else if (choice === availableActivities.length + 1) {
    // Strategic Permit Management
    await strategic_permit_submission(state, write, terminal, input);
    sm.quarterly_actions_used++;
    
  } else if (choice === availableActivities.length + 2) {
    // First Nations Liaison Management
    await liaison_management(state, write, terminal, input);
    sm.quarterly_actions_used++;
    
  } else if (choice === availableActivities.length + 3) {
    // CEO Management
    await delegateToCSO(state, write, terminal, input);
    
  } else if (choice === availableActivities.length + 4) {
    // Performance Review
    await companyPerformanceReview(state, write);
    sm.quarterly_actions_used++;
    
  } else if (choice === availableActivities.length + 5) {
    // Expand Capacity
    await expandManagementCapacity(state, write, terminal, input);
    
  } else {
    write("Skipping management activities this quarter.");
  }
}

/**
 * Check if prerequisites are met for an activity
 */
function checkPrerequisites(state, activity) {
  const sm = state.strategic_management;
  const prereqs = activity.prerequisites;
  
  // Staff level check
  if (prereqs.staff_level) {
    const levels = ["SMALL_COMPANY", "MEDIUM_COMPANY", "LARGE_COMPANY", "ENTERPRISE"];
    const current_level = levels.indexOf(sm.company_size);
    const required_level = levels.indexOf(prereqs.staff_level);
    if (current_level < required_level) return false;
  }
  
  // Budget check
  if (prereqs.budget_minimum && state.budget < prereqs.budget_minimum) {
    return false;
  }
  
  // Reputation check
  if (prereqs.reputation_minimum && state.reputation < prereqs.reputation_minimum) {
    return false;
  }
  
  return true;
}

/**
 * Execute a management activity
 */
async function executeManagementActivity(state, write, terminal, input, activity) {
  const sm = state.strategic_management;
  
  if (state.budget < activity.cost) {
    write(`❌ Insufficient budget for ${activity.name}`);
    return;
  }
  
  write(`\n🎯 INITIATING: ${activity.name.toUpperCase()}`);
  write(`💰 Cost: ${formatCurrency(activity.cost)}`);
  write(`⏱️  Duration: ${activity.duration} quarter${activity.duration > 1 ? 's' : ''}`);
  write(`📋 ${activity.description}`);
  
  const confirm = await askChoice("Proceed with this initiative?", ["Yes", "No"], terminal, input);
  
  if (confirm === 0) {
    state.budget -= activity.cost;
    sm.quarterly_actions_used++;
    
    const initiative = {
      name: activity.name,
      activity_key: activity.key,
      cost: activity.cost,
      duration: activity.duration,
      progress: 0,
      started_year: state.year,
      started_quarter: state.quarter
    };
    
    if (activity.duration === 1) {
      // Immediate completion
      Object.entries(activity.effects).forEach(([effect, value]) => {
        // Handle special effects
        if (effect === 'carbon_credits_enrolled') {
          state.carbon_credits_enrolled = value;
          write("🌳 Carbon credits program activated - will generate revenue quarterly");
        } else if (effect === 'insurance_coverage') {
          state.insurance_coverage = value;
          write("🛡️ Insurance coverage activated - quarterly premium will be charged");
        } else if (effect === 'technology_level') {
          state.technology_level += value;
          write(`🔧 Technology level increased to ${state.technology_level}`);
        } else if (effect === 'operating_cost_reduction') {
          state.operating_cost_per_m3 *= (1 - value);
          write(`💰 Operating costs reduced by ${(value * 100).toFixed(0)}%`);
        } else if (effect === 'aac_decline_reduction') {
          state.aac_decline_rate = Math.max(0.005, state.aac_decline_rate - value);
          write(`🌲 AAC decline rate reduced to ${(state.aac_decline_rate * 100).toFixed(1)}% per year`);
        } else if (sm.bonuses.hasOwnProperty(effect)) {
          sm.bonuses[effect] += value;
        } else if (state.hasOwnProperty(effect)) {
          state[effect] += value;
        }
      });
      
      sm.completed_initiatives.push({
        ...initiative,
        completed_year: state.year,
        completed_quarter: state.quarter
      });
      
      write(`✅ ${activity.name} completed immediately!`);
      displayActivityEffects(activity.effects, write);
      
    } else {
      // Multi-quarter initiative
      sm.active_initiatives.push(initiative);
      write(`🔄 ${activity.name} initiated - will complete over ${activity.duration} quarters`);
    }
    
    write(`💰 Budget remaining: ${formatCurrency(state.budget)}`);
  }
}

/**
 * Display effects of completed activity
 */
function displayActivityEffects(effects, write) {
  write("\n📈 BENEFITS GAINED:");
  Object.entries(effects).forEach(([effect, value]) => {
    const displayValue = (value * 100).toFixed(1);
    const effectName = effect.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
    write(`  • ${effectName}: +${displayValue}%`);
  });
}

/**
 * Offer capacity expansion options
 */
async function offer_capacity_expansion(state, write, terminal, input) {
  const sm = state.strategic_management;
  const current_size = sm.company_size;
  
  if (current_size === "ENTERPRISE") {
    write("Already at maximum management capacity.");
    return;
  }
  
  const expansionOptions = [];
  
  if (current_size === "SMALL_COMPANY") {
    expansionOptions.push("Upgrade to Medium Company ($200,000) - 3 actions/quarter");
  }
  if (current_size === "MEDIUM_COMPANY") {
    expansionOptions.push("Upgrade to Large Company ($350,000) - 4 actions/quarter");
  }
  if (current_size === "LARGE_COMPANY") {
    expansionOptions.push("Upgrade to Enterprise ($500,000) - 5 actions/quarter");
  }
  
  expansionOptions.push("Hire temporary consultants ($75,000) - +1 action this quarter only");
  expansionOptions.push("No expansion");
  
  const choice = await askChoice("Management capacity expansion:", expansionOptions, terminal, input);
  
  if (choice === 0 && expansionOptions.length > 1) {
    await expandToNextLevel(state, write, current_size);
  } else if (choice === expansionOptions.length - 2) {
    await hireTemporaryCapacity(state, write);
  }
}

/**
 * Expand company to next management level
 */
async function expandToNextLevel(state, write, currentSize) {
  const sm = state.strategic_management;
  let cost, newSize, newCapacity;
  
  if (currentSize === "SMALL_COMPANY") {
    cost = 200000; newSize = "MEDIUM_COMPANY"; newCapacity = MANAGEMENT_CAPACITY.MEDIUM_COMPANY;
  } else if (currentSize === "MEDIUM_COMPANY") {
    cost = 350000; newSize = "LARGE_COMPANY"; newCapacity = MANAGEMENT_CAPACITY.LARGE_COMPANY;
  } else if (currentSize === "LARGE_COMPANY") {
    cost = 500000; newSize = "ENTERPRISE"; newCapacity = MANAGEMENT_CAPACITY.ENTERPRISE;
  }
  
  if (state.budget < cost) {
    write(`❌ Insufficient budget for expansion (need ${formatCurrency(cost)})`);
    return;
  }
  
  state.budget -= cost;
  sm.company_size = newSize;
  sm.quarterly_actions_available = newCapacity.actions_per_quarter;
  sm.staff_cost = newCapacity.staff_cost;
  
  write(`✅ Expanded to ${newSize.replace('_', ' ')}!`);
  write(`📈 Management capacity: ${newCapacity.actions_per_quarter} actions/quarter`);
  write(`💰 New staff cost: ${formatCurrency(newCapacity.staff_cost)} annually`);
}

/**
 * Hire temporary management capacity
 */
async function hireTemporaryCapacity(state, write) {
  const cost = 75000;
  
  if (state.budget < cost) {
    write(`❌ Insufficient budget for temporary consultants (need ${formatCurrency(cost)})`);
    return;
  }
  
  state.budget -= cost;
  state.strategic_management.quarterly_actions_available += 1;
  
  write(`✅ Temporary consultants hired for this quarter`);
  write(`📈 +1 management action available`);
  write(`💰 Budget remaining: ${formatCurrency(state.budget)}`);
}

/**
 * Expand management capacity interface
 */
async function expandManagementCapacity(state, write, terminal, input) {
  await offer_capacity_expansion(state, write, terminal, input);
  state.strategic_management.quarterly_actions_used++;
}

/**
 * Delegate to CEO (if available)
 */
async function delegateToCSO(state, write, terminal, input) {
  if (!state.ceo) {
    write("❌ No CEO hired to delegate management activities to");
    return;
  }
  
  write("\n👔 CEO DELEGATION");
  write(`Delegate management tasks to ${state.ceo.name}`);
  const ceoEffectiveness = (state.ceo.performance_rating ?? 0.6);
  write(`CEO Effectiveness: ${(ceoEffectiveness * 100).toFixed(0)}%`);
  
  const delegationOptions = [
    "Delegate permit management (90% effectiveness)",
    "Delegate stakeholder relations (80% effectiveness)", 
    "Delegate operational efficiency (95% effectiveness)",
    "Delegate strategic planning (70% effectiveness)",
    "No delegation"
  ];
  
  const choice = await askChoice("Choose delegation:", delegationOptions, terminal, input);
  
  if (choice < 4) {
    const effectiveness = [0.9, 0.8, 0.95, 0.7][choice];
    const tasks = ["Permit Management", "Stakeholder Relations", "Operational Efficiency", "Strategic Planning"];
    
    write(`✅ ${tasks[choice]} delegated to ${state.ceo.name}`);
    write(`📊 Effectiveness: ${(effectiveness * ceoEffectiveness * 100).toFixed(0)}%`);
    
    // Apply reduced benefits based on CEO effectiveness
    const baseBonus = 0.1;
    const actualBonus = baseBonus * effectiveness * ceoEffectiveness;
    
    if (choice === 0) {
      state.permit_bonus += actualBonus;
    } else if (choice === 1) {
      state.community_support += actualBonus;
    } else if (choice === 2) {
      state.strategic_management.bonuses.operational_efficiency += actualBonus;
    } else if (choice === 3) {
      state.strategic_management.bonuses.planning_bonus += actualBonus;
    }
    
    // CEO delegation counts as using an action but with reduced cost
    const delegationCost = 15000; // Reduced cost vs direct management
    if (state.budget >= delegationCost) {
      state.budget -= delegationCost;
      state.strategic_management.quarterly_actions_used++;
      write(`💰 Delegation cost: ${formatCurrency(delegationCost)}`);
    } else {
      write("❌ Insufficient budget for CEO delegation");
    }
  }
}

/**
 * Company performance review
 */
async function companyPerformanceReview(state, write) {
  const sm = state.strategic_management;
  
  write("\n📊 COMPANY PERFORMANCE REVIEW");
  write(`🎯 Management Effectiveness: ${(sm.management_effectiveness * 100).toFixed(1)}%`);
  write(`📈 Initiative Success Rate: ${(sm.initiative_success_rate * 100).toFixed(1)}%`);
  write(`✅ Completed Initiatives: ${sm.completed_initiatives.length}`);
  write(`🔄 Active Initiatives: ${sm.active_initiatives.length}`);
  
  write("\n🏆 STRATEGIC BONUSES ACTIVE:");
  Object.entries(sm.bonuses).forEach(([bonus, value]) => {
    if (value > 0) {
      const bonusName = bonus.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
      write(`  • ${bonusName}: +${(value * 100).toFixed(1)}%`);
    }
  });
  
  // Performance recommendations
  write("\n💡 PERFORMANCE RECOMMENDATIONS:");
  if (sm.quarterly_actions_used / sm.quarterly_actions_available < 0.5) {
    write("  • Consider more aggressive management approach");
  }
  if (state.reputation < 0.6) {
    write("  • Focus on reputation and stakeholder relations");
  }
  if (state.budget > 1000000 && sm.company_size === "SMALL_COMPANY") {
    write("  • Consider expanding management capacity");
  }
  if (sm.completed_initiatives.length < 3) {
    write("  • Increase strategic initiative completion rate");
  }
}

/**
 * Apply strategic bonuses to relevant game mechanics
 */
export function applyStrategicBonuses(state, operation, baseValue) {
  const sm = state.strategic_management;
  if (!sm) return baseValue;
  
  let modifiedValue = baseValue;
  
  switch (operation) {
    case "permit_approval":
      modifiedValue *= (1 + sm.bonuses.permit_efficiency);
      break;
    case "harvest_efficiency": 
      modifiedValue *= (1 + sm.bonuses.operational_efficiency + sm.bonuses.technology_bonus);
      break;
    case "cost_reduction":
      modifiedValue *= (1 - sm.bonuses.cost_reduction);
      break;
    case "market_price":
      modifiedValue *= (1 + sm.bonuses.price_premium);
      break;
    case "disaster_resilience":
      modifiedValue *= (1 + sm.bonuses.disaster_resilience);
      break;
    case "safety_performance":
      modifiedValue *= (1 + sm.bonuses.safety_bonus);
      break;
    case "productivity":
      modifiedValue *= (1 + sm.bonuses.productivity);
      break;
  }
  
  return modifiedValue;
}

/**
 * Get management capacity status for UI
 */
export function getManagementStatus(state) {
  initializeStrategicManagement(state);
  const sm = state.strategic_management;
  
  return {
    company_size: sm.company_size.replace('_', ' '),
    actions_used: sm.quarterly_actions_used,
    actions_available: sm.quarterly_actions_available,
    active_initiatives: sm.active_initiatives.length,
    quarterly_staff_cost: sm.staff_cost / 4,
    management_effectiveness: sm.management_effectiveness
  };
}
