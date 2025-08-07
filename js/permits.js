import { PermitStatus } from "./gameModels.js";
import { ask, askChoice, formatCurrency, formatVolume } from "./utils.js";

// Advanced permit complexity system
const PERMIT_COMPLEXITY_FACTORS = {
  OLD_GROWTH: { cost: 15000, processing_days: 90, approval_penalty: -0.4 },
  HERITAGE_UNCLEARED: { cost: 8000, processing_days: 45, approval_penalty: -0.3 },
  FN_NO_AGREEMENT: { cost: 12000, processing_days: 120, approval_penalty: -0.5 },
  DISASTER_SALVAGE: { cost: 5000, processing_days: 30, approval_bonus: 0.2 },
  WATER_PROXIMITY: { cost: 10000, processing_days: 60, approval_penalty: -0.2 },
  WILDLIFE_HABITAT: { cost: 7000, processing_days: 40, approval_penalty: -0.15 },
  STEEP_TERRAIN: { cost: 6000, processing_days: 20, approval_penalty: -0.1 }
};

// Government capacity constraints
const QUARTERLY_PERMIT_LIMITS = {
  1: 8,  // Spring - high capacity
  2: 4,  // Summer - reduced capacity  
  3: 6,  // Fall - moderate capacity
  4: 3   // Winter - minimal capacity
};

// Application quality affects success
const APPLICATION_QUALITY_TIERS = {
  MINIMAL: { cost_multiplier: 0.5, approval_penalty: -0.3, name: "Minimal documentation" },
  STANDARD: { cost_multiplier: 1.0, approval_penalty: 0, name: "Standard application" },
  COMPREHENSIVE: { cost_multiplier: 1.8, approval_bonus: 0.2, name: "Comprehensive submission" },
  EXPERT_CONSULTATION: { cost_multiplier: 2.5, approval_bonus: 0.4, name: "Expert consultation" }
};

/**
 * Analyze block complexity and calculate permit requirements
 */
function analyzeBlockComplexity(block, state) {
  const complexity_factors = [];
  let base_cost = 5000;
  let processing_time = state.permit_backlog_days;
  let approval_modifier = 0;
  let risk_score = 1;

  if (block.old_growth_affected) {
    complexity_factors.push("old-growth concerns");
    const factor = PERMIT_COMPLEXITY_FACTORS.OLD_GROWTH;
    base_cost += factor.cost;
    processing_time += factor.processing_days;
    approval_modifier += factor.approval_penalty;
    risk_score += 4;
  }

  if (!block.heritage_cleared) {
    complexity_factors.push("heritage assessment required");
    const factor = PERMIT_COMPLEXITY_FACTORS.HERITAGE_UNCLEARED;
    base_cost += factor.cost;
    processing_time += factor.processing_days;
    approval_modifier += factor.approval_penalty;
    risk_score += 3;
  }

  if (!block.first_nations_agreement) {
    complexity_factors.push("First Nations consultation needed");
    const factor = PERMIT_COMPLEXITY_FACTORS.FN_NO_AGREEMENT;
    base_cost += factor.cost;
    processing_time += factor.processing_days;
    approval_modifier += factor.approval_penalty;
    risk_score += 5;
  }

  if (block.disaster_affected) {
    complexity_factors.push(`${block.disaster_type} salvage opportunity`);
    const factor = PERMIT_COMPLEXITY_FACTORS.DISASTER_SALVAGE;
    base_cost += factor.cost;
    processing_time += factor.processing_days;
    approval_modifier += factor.approval_bonus;
    risk_score -= 1; // Salvage is easier
  }

  // Environmental factors
  if (Math.random() < 0.3) { // 30% chance of water proximity
    complexity_factors.push("water body proximity");
    const factor = PERMIT_COMPLEXITY_FACTORS.WATER_PROXIMITY;
    base_cost += factor.cost;
    processing_time += factor.processing_days;
    approval_modifier += factor.approval_penalty;
    risk_score += 2;
  }

  if (Math.random() < 0.25) { // 25% chance of wildlife habitat
    complexity_factors.push("critical wildlife habitat");
    const factor = PERMIT_COMPLEXITY_FACTORS.WILDLIFE_HABITAT;
    base_cost += factor.cost;
    processing_time += factor.processing_days;
    approval_modifier += factor.approval_penalty;
    risk_score += 2;
  }

  if (Math.random() < 0.2) { // 20% chance of steep terrain
    complexity_factors.push("steep terrain challenges");
    const factor = PERMIT_COMPLEXITY_FACTORS.STEEP_TERRAIN;
    base_cost += factor.cost;
    processing_time += factor.processing_days;
    approval_modifier += factor.approval_penalty;
    risk_score += 1;
  }

  const risk_level = risk_score <= 3 ? "🟢 LOW" : 
                    risk_score <= 6 ? "🟡 MEDIUM" : 
                    risk_score <= 9 ? "🟠 HIGH" : "🔴 EXTREME";

  return {
    complexity_factors,
    base_cost,
    processing_time: Math.max(30, processing_time),
    approval_modifier,
    risk_score,
    risk_display: risk_level
  };
}

/**
 * Calculate permit decision based on multiple factors
 */
function calculatePermitDecision(block, state) {
  let approval_chance = 0.6; // Base approval rate
  
  // Company reputation effect
  approval_chance += (state.reputation - 0.5) * 0.4;
  
  // Permit bonus from investments/liaison
  approval_chance += state.permit_bonus;
  
  // Block-specific factors
  const analysis = analyzeBlockComplexity(block, state);
  approval_chance += analysis.approval_modifier;
  
  // Application quality effect
  if (block.application_quality) {
    const quality = APPLICATION_QUALITY_TIERS[block.application_quality];
    if (quality.approval_bonus) approval_chance += quality.approval_bonus;
    if (quality.approval_penalty) approval_chance += quality.approval_penalty;
  }
  
  // Policy environment effects
  if (block.old_growth_affected && state.old_growth_deferrals_expanded) {
    approval_chance -= 0.3;
  }
  
  // First Nations relationships
  if (!block.first_nations_agreement && state.community_support < 0.4) {
    approval_chance -= 0.2;
  }
  
  // Certification helps
  approval_chance += Math.min(0.15, state.get_active_certifications().length * 0.05);
  
  // Environmental compliance
  if (state.cumulative_disturbance > state.disturbance_cap * 0.8) {
    approval_chance -= 0.25;
  }
  
  const approved = Math.random() < Math.max(0.1, Math.min(0.95, approval_chance));
  
  let decision = {
    approved,
    conditions: [],
    denial_reason: "",
    reputation_loss: 0,
    can_appeal: true,
    appeal_cost: 25000
  };
  
  if (approved) {
    // Add conditions for marginal approvals
    if (approval_chance < 0.7) {
      const conditions = [
        "Enhanced wildlife protection measures required",
        "Additional environmental monitoring",
        "Reduced cut volume by 15%",
        "Extended reforestation timeline",
        "Third-party environmental oversight"
      ];
      decision.conditions = [conditions[Math.floor(Math.random() * conditions.length)]];
      
      if (decision.conditions[0].includes("volume")) {
        block.volume_m3 *= 0.85; // Reduce volume
      }
    }
  } else {
    // Generate realistic denial reasons
    const reasons = [];
    if (analysis.complexity_factors.includes("First Nations consultation needed")) {
      reasons.push("Inadequate First Nations consultation");
    }
    if (analysis.complexity_factors.includes("old-growth concerns")) {
      reasons.push("Conflicts with old-growth protection objectives");
    }
    if (state.cumulative_disturbance > state.disturbance_cap * 0.8) {
      reasons.push("Exceeds cumulative disturbance thresholds");
    }
    if (analysis.complexity_factors.includes("critical wildlife habitat")) {
      reasons.push("Unacceptable impacts to wildlife habitat");
    }
    
    decision.denial_reason = reasons.length > 0 ? reasons[0] : "Insufficient environmental protection measures";
    decision.reputation_loss = 0.03 + (analysis.risk_score * 0.01);
  }
  
  return decision;
}

/**
 * Advanced strategic permit submission system
 */
export async function strategic_permit_submission(state, write, terminal, input) {
  write("--- 📋 STRATEGIC PERMIT SUBMISSION ---");
  
  // Initialize quarterly tracking
  if (!state.permits_submitted_this_quarter) {
    state.permits_submitted_this_quarter = 0;
  }
  
  // Check government processing capacity
  const quarterly_limit = QUARTERLY_PERMIT_LIMITS[state.quarter];
  const remaining_capacity = quarterly_limit - state.permits_submitted_this_quarter;
  
  write(`🏛️  Government Capacity: ${remaining_capacity}/${quarterly_limit} permits available this quarter`);
  
  if (remaining_capacity <= 0) {
    write(`❌ No government capacity remaining this quarter!`);
    write(`💡 Consider: lobby for expedited processing, wait for next quarter, or explore alternative strategies`);
    return;
  }

  const blocks_to_submit = state.harvest_blocks.filter(
    (b) => b.permit_status === PermitStatus.PENDING
  );

  if (!blocks_to_submit.length) {
    write("No blocks requiring permits.");
    return;
  }

  write(`📈 Current government backlog: ${state.permit_backlog_days} days average`);
  write("\\n📊 Available blocks for permit application:");

  // Enhanced risk assessment
  const analyzed_blocks = blocks_to_submit.map((block, i) => {
    const analysis = analyzeBlockComplexity(block, state);
    const priority_text = ["🔴 Low", "🟡 Medium", "🟢 High"][block.priority - 1];
    
    write(`  ${i + 1}. ${block.id}: ${formatVolume(block.volume_m3)}`);
    write(`     Priority: ${priority_text} | Risk: ${analysis.risk_display} | Est. Cost: ${formatCurrency(analysis.base_cost)}`);
    if (analysis.complexity_factors.length > 0) {
      write(`     Issues: ${analysis.complexity_factors.join(", ")}`);
    }
    write(`     Est. Processing: ${analysis.processing_time} days\\n`);
    
    return { block, analysis, index: i };
  });

  // Strategic submission options
  const strategies = [
    "🎯 Submit highest priority blocks (limited by capacity)",
    "⚡ Submit fastest-approval blocks first", 
    "💰 Submit most profitable blocks",
    "🛡️  Submit lowest-risk blocks only",
    "🎲 Custom selection",
    "📊 Analyze all blocks without submitting",
    "❌ Skip permit submissions this quarter"
  ];

  const choice = await askChoice("\\nChoose your permit strategy:", strategies, terminal, input);

  let blocks_to_process = [];
  
  if (choice === 0) { // Highest priority
    blocks_to_process = analyzed_blocks
      .sort((a, b) => b.block.priority - a.block.priority)
      .slice(0, remaining_capacity)
      .map(item => item.block);
  } else if (choice === 1) { // Fastest approval
    blocks_to_process = analyzed_blocks
      .sort((a, b) => a.analysis.processing_time - b.analysis.processing_time)
      .slice(0, remaining_capacity)
      .map(item => item.block);
  } else if (choice === 2) { // Most profitable
    blocks_to_process = analyzed_blocks
      .sort((a, b) => b.block.volume_m3 - a.block.volume_m3)
      .slice(0, remaining_capacity)
      .map(item => item.block);
  } else if (choice === 3) { // Lowest risk
    blocks_to_process = analyzed_blocks
      .filter(item => item.analysis.risk_score <= 4)
      .slice(0, remaining_capacity)
      .map(item => item.block);
  } else if (choice === 4) { // Custom selection
    await customBlockSelection(analyzed_blocks, remaining_capacity, write, terminal, input);
    return;
  } else if (choice === 5) { // Analysis only
    await displayDetailedAnalysis(analyzed_blocks, write);
    return;
  } else {
    write("Skipping permit submissions this quarter.");
    return;
  }

  if (!blocks_to_process.length) {
    write("❌ No suitable blocks found for selected strategy.");
    return;
  }

  // Application quality selection
  await selectApplicationQuality(blocks_to_process, state, write, terminal, input);
}

/**
 * Select application quality level
 */
async function selectApplicationQuality(blocks, state, write, terminal, input) {
  write("\\n--- 📄 APPLICATION QUALITY SELECTION ---");
  write("Higher quality applications cost more but have better approval chances:");
  
  const quality_options = Object.entries(APPLICATION_QUALITY_TIERS).map(([key, tier]) => 
    `${tier.name} (${tier.cost_multiplier}x cost, ${tier.approval_bonus ? '+' + (tier.approval_bonus*100).toFixed(0) + '%' : tier.approval_penalty ? (tier.approval_penalty*100).toFixed(0) + '%' : '0%'} approval)`
  );
  
  const quality_choice = await askChoice("Choose application quality:", quality_options, terminal, input);
  const quality_key = Object.keys(APPLICATION_QUALITY_TIERS)[quality_choice];
  const quality_tier = APPLICATION_QUALITY_TIERS[quality_key];
  
  // Calculate total costs
  let total_cost = 0;
  for (const block of blocks) {
    const analysis = analyzeBlockComplexity(block, state);
    total_cost += analysis.base_cost * quality_tier.cost_multiplier;
    block.application_quality = quality_key;
  }
  
  write(`\\n💰 Total application cost: ${formatCurrency(total_cost)}`);
  write(`📊 Blocks selected: ${blocks.length}`);
  write(`📈 Total volume: ${formatVolume(blocks.reduce((sum, b) => sum + b.volume_m3, 0))}`);
  
  if (state.budget < total_cost) {
    write(`❌ Insufficient budget! Need ${formatCurrency(total_cost)}, have ${formatCurrency(state.budget)}`);
    return;
  }
  
  const confirm = await askChoice("Proceed with permit submissions?", ["Yes", "No"], terminal, input);
  
  if (confirm === 0) {
    state.budget -= total_cost;
    state.permits_submitted_this_quarter += blocks.length;
    
    for (const block of blocks) {
      const analysis = analyzeBlockComplexity(block, state);
      block.permit_submitted = state.year;
      block.processing_time = analysis.processing_time;
      block.permit_quarter_submitted = state.quarter;
      
      write(`✅ Submitted ${block.id} - Est. processing: ${analysis.processing_time} days`);
    }
    
    write(`💰 Budget remaining: ${formatCurrency(state.budget)}`);
    write(`🏛️  Government capacity used: ${state.permits_submitted_this_quarter}/${QUARTERLY_PERMIT_LIMITS[state.quarter]}`);
  }
}

/**
 * Custom block selection interface
 */
async function customBlockSelection(analyzed_blocks, capacity, write, terminal, input) {
  write("\\n--- 🎯 CUSTOM BLOCK SELECTION ---");
  write(`Select up to ${capacity} blocks by number (e.g., "1 3 5"):`);
  
  const selection = await ask("> ", terminal, input);
  
  try {
    const indices = selection.split(" ").map(x => parseInt(x.trim()) - 1);
    const valid_indices = indices.filter(i => i >= 0 && i < analyzed_blocks.length);
    
    if (valid_indices.length > capacity) {
      write(`❌ Too many blocks selected! Maximum: ${capacity}`);
      return;
    }
    
    const selected_blocks = valid_indices.map(i => analyzed_blocks[i].block);
    await selectApplicationQuality(selected_blocks, analyzed_blocks[0].block.state, write, terminal, input);
    
  } catch (error) {
    write("❌ Invalid selection format. Use numbers separated by spaces.");
  }
}

/**
 * Display detailed analysis without submitting
 */
async function displayDetailedAnalysis(analyzed_blocks, write) {
  write("\\n--- 📊 DETAILED PERMIT ANALYSIS ---");
  
  const risk_summary = {
    low: analyzed_blocks.filter(item => item.analysis.risk_score <= 3).length,
    medium: analyzed_blocks.filter(item => item.analysis.risk_score <= 6 && item.analysis.risk_score > 3).length,
    high: analyzed_blocks.filter(item => item.analysis.risk_score > 6).length
  };
  
  write(`Risk Distribution: 🟢 ${risk_summary.low} low | 🟡 ${risk_summary.medium} medium | 🔴 ${risk_summary.high} high risk blocks`);
  
  const total_volume = analyzed_blocks.reduce((sum, item) => sum + item.block.volume_m3, 0);
  const total_cost = analyzed_blocks.reduce((sum, item) => sum + item.analysis.base_cost, 0);
  
  write(`Total potential volume: ${formatVolume(total_volume)}`);
  write(`Total application costs (standard): ${formatCurrency(total_cost)}`);
  
  const avg_processing = analyzed_blocks.reduce((sum, item) => sum + item.analysis.processing_time, 0) / analyzed_blocks.length;
  write(`Average processing time: ${avg_processing.toFixed(0)} days`);
}

/**
 * Update government backlog based on permit decisions
 */
function updateGovernmentBacklog(state, processed_blocks) {
  // Government efficiency changes based on volume of applications
  const total_permits = processed_blocks.length;
  const complex_permits = processed_blocks.filter(item => item.decision.conditions.length > 0 || !item.decision.approved).length;
  
  if (complex_permits / total_permits > 0.5) {
    state.permit_backlog_days += 10; // Backlog increases with complex applications
  } else {
    state.permit_backlog_days = Math.max(60, state.permit_backlog_days - 5); // Improves with simple applications
  }
}

/**
 * Process pending permit applications with realistic government decisions
 */
export async function process_permits(state, write, terminal, input) {
  const pending_blocks = state.harvest_blocks.filter(
    (b) => b.permit_status === PermitStatus.PENDING && b.permit_submitted > 0
  );

  if (!pending_blocks.length) {
    return;
  }

  write("--- 🏛️  GOVERNMENT PERMIT DECISIONS ---");

  let decisions_made = false;
  const processed_blocks = [];
  
  for (const block of pending_blocks) {
    const years_elapsed = state.year - block.permit_submitted;
    const quarters_elapsed = (years_elapsed * 4) + (state.quarter - (block.permit_quarter_submitted || 1));
    const days_elapsed = quarters_elapsed * 90;
    
    if (days_elapsed >= block.processing_time) {
      decisions_made = true;
      const decision = calculatePermitDecision(block, state);
      
      if (decision.approved) {
        block.permit_status = PermitStatus.APPROVED;
        write(`🟢 ✅ PERMIT APPROVED: ${block.id}`);
        write(`   📊 Volume: ${formatVolume(block.volume_m3)}`);
        if (decision.conditions && decision.conditions.length > 0) {
          write(`   📋 Conditions: ${decision.conditions.join(", ")}`);
        }
      } else {
        block.permit_status = PermitStatus.DENIED;
        write(`🔴 ❌ PERMIT DENIED: ${block.id}`);
        write(`   📊 Volume: ${formatVolume(block.volume_m3)}`);
        write(`   📋 Reason: ${decision.denial_reason}`);
        write(`   📉 Reputation impact: -${decision.reputation_loss.toFixed(2)}`);
        state.reputation -= decision.reputation_loss;
        
        // Option to appeal or resubmit
        if (decision.can_appeal) {
          const appeal_choice = await askChoice(
            `Appeal denial of ${block.id}? (Cost: ${formatCurrency(decision.appeal_cost)})`,
            ["Yes, file appeal", "No, accept denial", "Resubmit with improvements"],
            terminal, input
          );
          
          if (appeal_choice === 0 && state.budget >= decision.appeal_cost) {
            state.budget -= decision.appeal_cost;
            block.permit_status = PermitStatus.PENDING;
            block.processing_time = 90; // Appeals take 3 months
            write(`   ⚖️  Appeal filed - ${formatCurrency(decision.appeal_cost)} paid`);
          } else if (appeal_choice === 2) {
            block.permit_status = PermitStatus.PENDING;
            block.permit_submitted = 0; // Reset for resubmission
            write(`   🔄 Block reset for resubmission with improvements`);
          }
        }
      }
      processed_blocks.push({ block, decision });
    }
  }

  if (!decisions_made) {
    write("⏳ No permit decisions ready this quarter.");
    
    // Show processing status for pending applications
    const in_process = pending_blocks.filter(b => b.permit_submitted > 0);
    if (in_process.length > 0) {
      write("\\n📋 Applications in process:");
      for (const block of in_process) {
        const years_elapsed = state.year - block.permit_submitted;
        const quarters_elapsed = (years_elapsed * 4) + (state.quarter - (block.permit_quarter_submitted || 1));
        const days_elapsed = quarters_elapsed * 90;
        const progress = Math.min(100, (days_elapsed / block.processing_time) * 100);
        write(`  ${block.id}: ${progress.toFixed(0)}% processed (${days_elapsed}/${block.processing_time} days)`);
      }
    }
  } else {
    updateGovernmentBacklog(state, processed_blocks);
  }
}

// Legacy function redirect
export async function selective_permit_submission(state, write, terminal, input) {
  return await strategic_permit_submission(state, write, terminal, input);
}