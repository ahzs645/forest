import { ask, askChoice, formatCurrency, calculateAverageRevenue, safeAddBudget } from "./utils.js";

class SafetyIncident {
  constructor(
    incident_type,
    description,
    cause,
    immediate_costs,
    wsbc_fine,
    reputation_penalty,
    operational_impact,
    legal_consequences
  ) {
    this.incident_type = incident_type;
    this.description = description;
    this.cause = cause;
    this.immediate_costs = immediate_costs;
    this.wsbc_fine = wsbc_fine;
    this.reputation_penalty = reputation_penalty;
    this.operational_impact = operational_impact;
    this.legal_consequences = legal_consequences;
  }
}

async function workplace_safety_incidents(state, write, terminal, input) {
  const base_chance = 0.08; // 8% base chance per quarter
  let risk_multiplier = 1.0;

  if (state.operating_cost_per_m3 < 35) {
    risk_multiplier += 0.5;
  }
  if (state.reputation < 0.4) {
    risk_multiplier += 0.3;
  }
  if (state.safety_violations > 0) {
    risk_multiplier += 0.4;
  }
  // Oregon Trail-style modifiers
  if (state.operations_pace === 'aggressive') {
    risk_multiplier *= 1.3;
  } else if (state.operations_pace === 'cautious') {
    risk_multiplier *= 0.8;
  }
  if (state.rations === 'meager') {
    risk_multiplier *= 1.15;
  } else if (state.rations === 'generous') {
    risk_multiplier *= 0.9;
  }
  if (state.crew_morale < 0.3) {
    risk_multiplier *= 1.2;
  } else if (state.crew_morale > 0.7) {
    risk_multiplier *= 0.9;
  }

  // Weather risk modifier
  if (state.weather && state.weather.safety_risk_multiplier) {
    risk_multiplier *= state.weather.safety_risk_multiplier;
  }

  if (Math.random() > base_chance * risk_multiplier) {
    return false;
  }

  write("🚨 WORKPLACE SAFETY INCIDENT");

  const incidents = [
    new SafetyIncident(
      "FATALITY - Falling Tree",
      "A 28-year-old faller was struck and killed by a widow-maker during harvest operations",
      "Inadequate hazard assessment and communication failures",
      150000,
      500000,
      0.4,
      { operations_suspended: true, investigation_days: 45 },
      [
        "Criminal negligence investigation",
        "Coroner's inquest",
        "Media scrutiny",
      ]
    ),
    new SafetyIncident(
      "FATALITY - Equipment Accident",
      "Heavy equipment operator crushed when loader rolled over on steep terrain",
      "Equipment operated beyond safe slope limits, no rollover protection",
      200000,
      750000,
      0.5,
      {
        operations_suspended: true,
        investigation_days: 60,
        equipment_seized: true,
      },
      [
        "Crown counsel review",
        "Equipment manufacturer lawsuit",
        "Family wrongful death suit",
      ]
    ),
    new SafetyIncident(
      "FATALITY - Transportation Accident",
      "Logging truck driver killed in highway collision with loaded trailer",
      "Driver fatigue and inadequate vehicle maintenance",
      300000,
      400000,
      0.3,
      { transportation_suspended: true, investigation_days: 30 },
      [
        "Criminal negligence charges",
        "Commercial vehicle ban",
        "Public inquiry",
      ]
    ),
    new SafetyIncident(
      "SERIOUS INJURY - Chainsaw Accident",
      "Worker suffered severe leg lacerations requiring emergency helicopter evacuation",
      "Improper chainsaw safety procedures and inadequate first aid response",
      75000,
      150000,
      0.2,
      { safety_review: true, investigation_days: 15 },
      ["WorkSafeBC prosecution", "Safety program review"]
    ),
    new SafetyIncident(
      "MULTIPLE INJURIES - Helicopter Crash",
      "Helicopter carrying 4 workers crashed during crew transport, 2 critical injuries",
      "Pilot error in poor weather conditions, inadequate weather protocols",
      500000,
      800000,
      0.6,
      {
        operations_suspended: true,
        investigation_days: 90,
        aviation_ban: true,
      },
      ["Transport Canada investigation", "Criminal charges", "Aviation lawsuit"]
    ),
    new SafetyIncident(
      "CHEMICAL EXPOSURE Incident",
      "3 workers hospitalized after exposure to herbicide spray drift",
      "Inadequate wind monitoring and personal protective equipment failures",
      125000,
      250000,
      0.25,
      { chemical_operations_suspended: true, investigation_days: 25 },
      [
        "Health Canada investigation",
        "Environmental prosecution",
        "Worker compensation claims",
      ]
    ),
  ];

  let incident;
  if (state.operating_cost_per_m3 < 35) {
    incident = incidents[Math.floor(Math.random() * 3)]; // Fatalities more likely
  } else {
    incident = incidents[Math.floor(Math.random() * incidents.length)];
  }

  write(`💀 INCIDENT TYPE: ${incident.incident_type}`);
  write(`📰 ${incident.description}`);
  write(`🔍 Preliminary Cause: ${incident.cause}`);
  write("");
  write("⚠️  IMMEDIATE CONSEQUENCES:");
  write(`   💸 Emergency costs: ${formatCurrency(incident.immediate_costs)}`);
  write(`   🏛️  WorkSafeBC fine: ${formatCurrency(incident.wsbc_fine)}`);
  write(`   📉 Reputation damage: -${incident.reputation_penalty.toFixed(2)}`);

  // Apply budget protection for immediate costs
  const affordableImmediateCosts = Math.min(incident.immediate_costs, Math.max(0, state.budget * 0.4)); // Max 40% of budget
  safeAddBudget(state, -affordableImmediateCosts, write, 'immediate incident costs');
  
  if (affordableImmediateCosts < incident.immediate_costs) {
    const remainingCosts = incident.immediate_costs - affordableImmediateCosts;
    write(`   ⚠️  Emergency costs partially deferred: ${formatCurrency(remainingCosts)} to be paid over time`);
    if (!state.deferred_payments) state.deferred_payments = [];
    state.deferred_payments.push({
      amount: remainingCosts,
      quarterly_payment: Math.ceil(remainingCosts / 8), // 8 quarter payment plan
      remaining_quarters: 8,
      description: 'WorkSafeBC incident emergency costs'
    });
  }
  
  state.reputation = Math.max(0.0, state.reputation - incident.reputation_penalty);

  let operations_suspended_days = 0;
  if (incident.operational_impact.operations_suspended) {
    operations_suspended_days = incident.operational_impact.investigation_days || 30;
    write(`   ⏸️  All operations suspended for ${operations_suspended_days} days`);

    const avg_revenue = calculateAverageRevenue(state);
    const daily_revenue = (avg_revenue * state.annual_allowable_cut) / 365;
    const lost_revenue = daily_revenue * operations_suspended_days;
    
    // Apply budget protection for lost revenue too
    const affordableLostRevenue = Math.min(lost_revenue, Math.max(0, state.budget * 0.3)); // Max 30% of budget
    safeAddBudget(state, -Math.floor(affordableLostRevenue), write, 'lost revenue during suspension');
    write(`   💸 Lost revenue during suspension: ${formatCurrency(Math.floor(affordableLostRevenue))}`);
    
    if (affordableLostRevenue < lost_revenue) {
      const remainingRevenueLoss = lost_revenue - affordableLostRevenue;
      write(`   📋 Additional revenue impact deferred: ${formatCurrency(Math.floor(remainingRevenueLoss))}`);
    }
  }

  write("");
  write("🏛️  WORKSAFEBC INVESTIGATION INITIATED");
  write("📋 Legal consequences:");
  for (const consequence of incident.legal_consequences) {
    write(`   • ${consequence}`);
  }

  write("");
  write("🤔 How do you respond to this crisis?");

  const response_options = [
    {
      description: "Full cooperation with investigation, implement all safety recommendations",
      cost: 200000,
      fine_reduction: 0.3,
      reputation_recovery: 0.15,
      description_detail: "Hire external safety consultants, implement gold-standard protocols",
    },
    {
      description: "Standard compliance response, meet minimum legal requirements",
      cost: 75000,
      fine_reduction: 0.1,
      reputation_recovery: 0.05,
      description_detail: "Basic legal compliance, internal safety review",
    },
    {
      description: "Minimize response, challenge WorkSafeBC findings in court",
      cost: 150000, // Legal fees
      fine_reduction: -0.2, // Penalty for non-cooperation
      reputation_recovery: -0.1,
      description_detail: "Aggressive legal defense, minimal safety improvements",
    },
    {
      description: "🔴 Attempt to bribe WorkSafeBC inspectors to reduce penalties",
      cost: 100000,
      fine_reduction: 0.5, // If successful
      reputation_recovery: 0.0,
      description_detail: "ILLEGAL: Attempt to corrupt government officials",
      illegal: true,
      detection_risk: 0.6,
    },
  ];

  for (let i = 0; i < response_options.length; i++) {
    const option = response_options[i];
    const cost_text = ` (Cost: ${formatCurrency(option.cost)})`;
    const illegal_text = option.illegal ? " ⚠️ ILLEGAL ACTIVITY" : "";
    write(`${i + 1}. ${option.description}${cost_text}${illegal_text}`);
    write(`   📝 ${option.description_detail}`);
  }

  const choice = await askChoice("Choose your response:", response_options.map(opt => opt.description), terminal, input);
  const chosen_response = response_options[choice];

  write("");
  write(`🎯 RESPONSE: ${chosen_response.description}`);

  if (chosen_response.illegal) {
    const bribery_result = await _handle_worksafebc_bribery(state, incident, chosen_response, write, terminal, input);
    if (!bribery_result) {
      // User declined bribery, let them choose a legal response
      write("");
      write("🤔 Choose a legal response to this crisis:");
      
      const legal_options = response_options.filter(opt => !opt.illegal);
      for (let i = 0; i < legal_options.length; i++) {
        const option = legal_options[i];
        const cost_text = ` (Cost: ${formatCurrency(option.cost)})`;
        write(`${i + 1}. ${option.description}${cost_text}`);
        write(`   📝 ${option.description_detail}`);
      }
      
      const legal_choice = await askChoice("Choose your response:", legal_options.map(opt => opt.description), terminal, input);
      const chosen_legal_response = legal_options[legal_choice];
      
      write("");
      write(`🎯 RESPONSE: ${chosen_legal_response.description}`);
      
      // Process the legal response with budget protection
      const final_fine = Math.floor(incident.wsbc_fine * (1 - chosen_legal_response.fine_reduction));
      const total_cost = chosen_legal_response.cost + final_fine;
      
      if (state.budget >= total_cost) {
        // Can afford full payment
        safeAddBudget(state, -chosen_legal_response.cost, write, 'legal response cost');
        safeAddBudget(state, -final_fine, write, 'WorkSafeBC fine');
        write(`💰 Response cost: ${formatCurrency(chosen_legal_response.cost)} paid`);
        write(`🏛️  Final WorkSafeBC fine: ${formatCurrency(final_fine)} paid`);
      } else if (state.budget >= chosen_legal_response.cost) {
        // Can afford response cost but need payment plan for fine
        safeAddBudget(state, -chosen_legal_response.cost, write, 'legal response cost');
        write(`💰 Response cost: ${formatCurrency(chosen_legal_response.cost)} paid`);
        
        const affordableFine = Math.min(final_fine, Math.max(0, state.budget * 0.5)); // Max 50% of remaining budget
        safeAddBudget(state, -affordableFine, write, 'partial WorkSafeBC fine payment');
        
        if (affordableFine < final_fine) {
          const remainingFine = final_fine - affordableFine;
          if (!state.deferred_payments) state.deferred_payments = [];
          state.deferred_payments.push({
            amount: remainingFine,
            quarterly_payment: Math.ceil(remainingFine / 12), // 12 quarter payment plan for fines
            remaining_quarters: 12,
            description: 'WorkSafeBC fine payment plan'
          });
          write(`🏛️  WorkSafeBC fine: ${formatCurrency(affordableFine)} paid, ${formatCurrency(remainingFine)} on payment plan`);
          write(`   📋 Quarterly payments: ${formatCurrency(Math.ceil(remainingFine / 12))} for 3 years`);
        } else {
          write(`🏛️  Final WorkSafeBC fine: ${formatCurrency(final_fine)} paid`);
        }
      } else {
        // Cannot afford even the response cost
        write("❌ INSUFFICIENT BUDGET: Cannot afford response costs!");
        write("🤝 WorkSafeBC offers emergency payment plan for struggling companies");
        
        // Emergency payment plan for everything
        if (!state.deferred_payments) state.deferred_payments = [];
        
        const emergency_payment = Math.floor((total_cost * 0.1)); // 10% upfront
        const remaining_amount = total_cost - emergency_payment;
        
        if (state.budget >= emergency_payment) {
          safeAddBudget(state, -emergency_payment, write, 'emergency payment plan upfront');
          write(`💰 Emergency upfront payment: ${formatCurrency(emergency_payment)} paid`);
          
          state.deferred_payments.push({
            amount: remaining_amount,
            quarterly_payment: Math.ceil(remaining_amount / 16), // 16 quarter payment plan
            remaining_quarters: 16,
            description: 'WorkSafeBC emergency payment plan'
          });
          write(`📋 Remaining ${formatCurrency(remaining_amount)} on 4-year payment plan`);
          write(`   💸 Quarterly payments: ${formatCurrency(Math.ceil(remaining_amount / 16))}`);
        } else {
          // Truly bankrupt scenario
          write("🚨 COMPANY INSOLVENCY: WorkSafeBC may seize assets");
          state.deferred_payments.push({
            amount: total_cost,
            quarterly_payment: Math.ceil(total_cost / 20), // 20 quarter payment plan
            remaining_quarters: 20,
            description: 'WorkSafeBC insolvency payment plan'
          });
          write(`⚖️  Court-ordered payment plan: ${formatCurrency(Math.ceil(total_cost / 20))} quarterly for 5 years`);
        }
      }

      if (chosen_legal_response.reputation_recovery > 0) {
        state.reputation = Math.min(1.0, state.reputation + chosen_legal_response.reputation_recovery);
        write(`📈 Reputation recovery: +${chosen_legal_response.reputation_recovery.toFixed(2)}`);
      } else if (chosen_legal_response.reputation_recovery < 0) {
        state.reputation = Math.max(0.0, state.reputation + chosen_legal_response.reputation_recovery);
        write(`📉 Additional reputation damage: ${chosen_legal_response.reputation_recovery.toFixed(2)}`);
      }

        // Handle specific response types
        const legal_choice_index = response_options.findIndex(opt => opt === chosen_legal_response);
        if (legal_choice_index === 0) {
          // Full cooperation
          write("✅ WorkSafeBC commends company's proactive response");
          write("📈 Future inspection frequency reduced");
          if (!state.safety_violations) {
            state.safety_violations = 0;
          }
          state.safety_violations = Math.max(0, state.safety_violations - 1);
        } else if (legal_choice_index === 2) {
          // Challenge findings
          write("⚖️  Legal battle with WorkSafeBC ongoing");
          write("📰 Media portrays company as fighting safety regulations");
          write("🔍 Future inspections will be more frequent and thorough");
          if (!state.safety_violations) {
            state.safety_violations = 0;
          }
          state.safety_violations += 1;
        }
      } else {
        write("❌ INSUFFICIENT BUDGET: Cannot afford response costs!");
        write("🚨 Bankruptcy proceedings may be initiated");
        write(`💸 Full WorkSafeBC fine imposed: ${formatCurrency(incident.wsbc_fine)}`);
        state.budget -= incident.wsbc_fine;
      }
    }
    
    write("");
    write("📊 INDUSTRY IMPACT:");
    write("🔍 Increased regulatory scrutiny across BC forestry sector");
    write("📰 Media attention on forestry safety practices");
    write("⚖️  Potential for new safety regulations");

    if (!state.safety_violations) {
      state.safety_violations = 0;
    }
    state.safety_violations += 1;

    return true;
  }

  // Process main response (non-illegal path) with budget protection
  const final_fine = Math.floor(incident.wsbc_fine * (1 - chosen_response.fine_reduction));
  const total_cost = chosen_response.cost + final_fine;
  
  if (state.budget >= total_cost) {
    // Can afford full payment
    safeAddBudget(state, -chosen_response.cost, write, 'response cost');
    safeAddBudget(state, -final_fine, write, 'WorkSafeBC fine');
    write(`💰 Response cost: ${formatCurrency(chosen_response.cost)} paid`);
    write(`🏛️  Final WorkSafeBC fine: ${formatCurrency(final_fine)} paid`);
  } else if (state.budget >= chosen_response.cost) {
    // Can afford response cost but need payment plan for fine
    safeAddBudget(state, -chosen_response.cost, write, 'response cost');
    write(`💰 Response cost: ${formatCurrency(chosen_response.cost)} paid`);
    
    const affordableFine = Math.min(final_fine, Math.max(0, state.budget * 0.5)); // Max 50% of remaining budget
    safeAddBudget(state, -affordableFine, write, 'partial WorkSafeBC fine payment');
    
    if (affordableFine < final_fine) {
      const remainingFine = final_fine - affordableFine;
      if (!state.deferred_payments) state.deferred_payments = [];
      state.deferred_payments.push({
        amount: remainingFine,
        quarterly_payment: Math.ceil(remainingFine / 12), // 12 quarter payment plan for fines
        remaining_quarters: 12,
        description: 'WorkSafeBC fine payment plan'
      });
      write(`🏛️  WorkSafeBC fine: ${formatCurrency(affordableFine)} paid, ${formatCurrency(remainingFine)} on payment plan`);
      write(`   📋 Quarterly payments: ${formatCurrency(Math.ceil(remainingFine / 12))} for 3 years`);
    } else {
      write(`🏛️  Final WorkSafeBC fine: ${formatCurrency(final_fine)} paid`);
    }
  } else {
    // Cannot afford even the response cost
    write("❌ INSUFFICIENT BUDGET: Cannot afford response costs!");
    write("🤝 WorkSafeBC offers emergency payment plan for struggling companies");
    
    // Emergency payment plan for everything
    if (!state.deferred_payments) state.deferred_payments = [];
    
    const emergency_payment = Math.floor((total_cost * 0.1)); // 10% upfront
    const remaining_amount = total_cost - emergency_payment;
    
    if (state.budget >= emergency_payment) {
      safeAddBudget(state, -emergency_payment, write, 'emergency payment plan upfront');
      write(`💰 Emergency upfront payment: ${formatCurrency(emergency_payment)} paid`);
      
      state.deferred_payments.push({
        amount: remaining_amount,
        quarterly_payment: Math.ceil(remaining_amount / 16), // 16 quarter payment plan
        remaining_quarters: 16,
        description: 'WorkSafeBC emergency payment plan'
      });
      write(`📋 Remaining ${formatCurrency(remaining_amount)} on 4-year payment plan`);
      write(`   💸 Quarterly payments: ${formatCurrency(Math.ceil(remaining_amount / 16))}`);
    } else {
      // Truly bankrupt scenario
      write("🚨 COMPANY INSOLVENCY: WorkSafeBC may seize assets");
      state.deferred_payments.push({
        amount: total_cost,
        quarterly_payment: Math.ceil(total_cost / 20), // 20 quarter payment plan
        remaining_quarters: 20,
        description: 'WorkSafeBC insolvency payment plan'
      });
      write(`⚖️  Court-ordered payment plan: ${formatCurrency(Math.ceil(total_cost / 20))} quarterly for 5 years`);
    }
  }

  if (chosen_response.reputation_recovery > 0) {
    state.reputation = Math.min(1.0, state.reputation + chosen_response.reputation_recovery);
    write(`📈 Reputation recovery: +${chosen_response.reputation_recovery.toFixed(2)}`);
  } else if (chosen_response.reputation_recovery < 0) {
    state.reputation = Math.max(0.0, state.reputation + chosen_response.reputation_recovery);
    write(`📉 Additional reputation damage: ${chosen_response.reputation_recovery.toFixed(2)}`);
  }

  if (choice === 0) {
    // Full cooperation
    write("✅ WorkSafeBC commends company's proactive response");
    write("📈 Future inspection frequency reduced");
    if (!state.safety_violations) {
      state.safety_violations = 0;
    }
    state.safety_violations = Math.max(0, state.safety_violations - 1);
  } else if (choice === 2) {
    // Challenge findings
    write("⚖️  Legal battle with WorkSafeBC ongoing");
    write("📰 Media portrays company as fighting safety regulations");
    write("🔍 Future inspections will be more frequent and thorough");
    if (!state.safety_violations) {
      state.safety_violations = 0;
    }
    state.safety_violations += 1;
  }

  write("");
  write("📊 INDUSTRY IMPACT:");
  write("🔍 Increased regulatory scrutiny across BC forestry sector");
  write("📰 Media attention on forestry safety practices");
  write("⚖️  Potential for new safety regulations");

  if (!state.safety_violations) {
    state.safety_violations = 0;
  }
  state.safety_violations += 1;

  return true;
}

async function _handle_worksafebc_bribery(state, incident, response, write, terminal, input) {
  write("");
  write("🔴 ATTEMPTING GOVERNMENT CORRUPTION");
  write("⚠️  WARNING: Bribing government officials is a serious criminal offense!");
  write("💀 Potential consequences: Criminal charges, asset forfeiture, imprisonment");

  const confirm = await askChoice("Are you absolutely certain you want to proceed?", ["Yes, proceed with bribery", "No, choose legal response"], terminal, input);

  if (confirm === 1) {
    write("📋 Returning to legal response options...");
    return false;
  }

  write(`💰 Attempting to bribe WorkSafeBC inspectors with ${formatCurrency(response.cost)}`);

  if (state.budget < response.cost) {
    write("❌ Insufficient funds for bribery attempt!");
    return false;
  }

  safeAddBudget(state, -response.cost, write, 'bribery attempt');

  if (Math.random() < response.detection_risk) {
    write("🚨 BRIBERY DETECTED!");
    write("📞 WorkSafeBC officials report bribery attempt to RCMP");
    write("⚖️  Criminal charges laid for corruption of government officials");

    const criminal_fine = 1500000;
    const doubled_fine = incident.wsbc_fine * 2;
    const total_penalties = criminal_fine + doubled_fine;
    
    // Apply budget protection even for criminal penalties
    const affordablePenalties = Math.min(total_penalties, Math.max(0, state.budget * 0.8)); // Max 80% of budget
    safeAddBudget(state, -affordablePenalties, write, 'criminal penalties');
    
    state.reputation = Math.max(0.0, state.reputation - 0.6);

    write(`💸 Criminal fine: ${formatCurrency(criminal_fine)}`);
    write("📉 Massive reputation damage: -0.6");
    write("🏛️  Original WorkSafeBC fine DOUBLED as penalty");
    write(`💸 Enhanced WorkSafeBC fine: ${formatCurrency(doubled_fine)}`);
    
    if (affordablePenalties < total_penalties) {
      const remainingPenalties = total_penalties - affordablePenalties;
      if (!state.deferred_payments) state.deferred_payments = [];
      state.deferred_payments.push({
        amount: remainingPenalties,
        quarterly_payment: Math.ceil(remainingPenalties / 24), // 24 quarter payment plan (6 years)
        remaining_quarters: 24,
        description: 'Criminal conviction payment plan'
      });
      write(`⚖️  Criminal court payment plan: ${formatCurrency(Math.ceil(remainingPenalties / 24))} quarterly for 6 years`);
    }

    write("🚫 Company blacklisted from government contracts");
    write("📰 International media coverage of corruption scandal");

    return true;
  } else {
    write("🤫 Bribery successful - inspectors accept payment");

    const reduced_fine = Math.floor(incident.wsbc_fine * (1 - response.fine_reduction));
    
    // Apply budget protection to reduced fine
    const affordableReducedFine = Math.min(reduced_fine, Math.max(0, state.budget * 0.6));
    safeAddBudget(state, -affordableReducedFine, write, 'reduced WorkSafeBC fine');
    
    if (affordableReducedFine < reduced_fine) {
      const remainingFine = reduced_fine - affordableReducedFine;
      if (!state.deferred_payments) state.deferred_payments = [];
      state.deferred_payments.push({
        amount: remainingFine,
        quarterly_payment: Math.ceil(remainingFine / 8),
        remaining_quarters: 8,
        description: 'Bribed inspector "reduced" fine payment plan'
      });
      write(`🏛️  'Reduced' WorkSafeBC fine: ${formatCurrency(affordableReducedFine)} paid, ${formatCurrency(remainingFine)} deferred`);
    } else {
      write(`🏛️  'Reduced' WorkSafeBC fine: ${formatCurrency(reduced_fine)}`);
    }

    write("⚠️  WARNING: Corrupt officials now have leverage over company");
    write("💰 Expect future 'requests' for additional payments");

    if (!state.corrupt_officials) {
      state.corrupt_officials = [];
    }
    state.corrupt_officials.push("worksafebc_inspector");

    return true;
  }
}

/**
 * Process deferred payment obligations
 * @param {import("./gameModels.js").GameState} state 
 * @param {(text: string) => void} write 
 */
export async function process_deferred_payments(state, write) {
  if (!state.deferred_payments || state.deferred_payments.length === 0) {
    return;
  }

  let totalQuarterlyPayment = 0;
  const completedPayments = [];

  for (let i = 0; i < state.deferred_payments.length; i++) {
    const payment = state.deferred_payments[i];
    
    if (payment.remaining_quarters <= 0) {
      completedPayments.push(i);
      continue;
    }

    totalQuarterlyPayment += payment.quarterly_payment;
    payment.remaining_quarters -= 1;
    payment.amount -= payment.quarterly_payment;

    if (payment.remaining_quarters === 0 || payment.amount <= 0) {
      completedPayments.push(i);
      write(`✅ Payment plan completed: ${payment.description}`);
    }
  }

  if (totalQuarterlyPayment > 0) {
    write(`\n💳 DEFERRED PAYMENT OBLIGATIONS: ${formatCurrency(totalQuarterlyPayment)}`);
    
    if (state.budget >= totalQuarterlyPayment) {
      safeAddBudget(state, -totalQuarterlyPayment, write, 'quarterly deferred payments');
      write(`   ✅ All scheduled payments made`);
    } else {
      // Partial payment or missed payment
      const affordablePayment = Math.max(0, state.budget * 0.8); // Use up to 80% of budget
      if (affordablePayment > 0) {
        safeAddBudget(state, -affordablePayment, write, 'partial deferred payments');
        write(`   ⚠️  Partial payment made: ${formatCurrency(affordablePayment)} of ${formatCurrency(totalQuarterlyPayment)}`);
        
        // Add penalty for missed payment portion
        const missedAmount = totalQuarterlyPayment - affordablePayment;
        const penalty = Math.floor(missedAmount * 0.1);
        if (!state.deferred_payments.find(p => p.description.includes('penalty'))) {
          state.deferred_payments.push({
            amount: penalty,
            quarterly_payment: Math.ceil(penalty / 4),
            remaining_quarters: 4,
            description: 'Late payment penalty'
          });
        }
        write(`   📈 Late payment penalty added: ${formatCurrency(penalty)}`);
      } else {
        write(`   ❌ MISSED PAYMENT: ${formatCurrency(totalQuarterlyPayment)}`);
        write(`   🚨 Additional legal consequences may follow`);
        state.reputation = Math.max(0.0, state.reputation - 0.05);
      }
    }
  }

  // Remove completed payments
  for (let i = completedPayments.length - 1; i >= 0; i--) {
    state.deferred_payments.splice(completedPayments[i], 1);
  }
}

/**
 * Process ongoing safety consequences
 * @param {import("./gameModels.js").GameState} state 
 * @param {(text: string) => void} write 
 */
export async function ongoing_safety_consequences(state, write) {
  // Process deferred payments first
  await process_deferred_payments(state, write);
  
  // Safety violations affect future incident risk
  if (state.safety_violations > 0) {
    // Each violation increases scrutiny
    if (Math.random() < 0.1 * state.safety_violations) {
      const inspectionFine = Math.floor(Math.random() * 50000) + 10000;
      // Apply budget protection to inspection fines too
      const affordableInspectionFine = Math.min(inspectionFine, Math.max(0, state.budget * 0.2));
      safeAddBudget(state, -affordableInspectionFine, write, 'WorkSafeBC inspection fine');
      write(`\n⚠️ WORKSAFEBC INSPECTION: Fine of ${formatCurrency(affordableInspectionFine)} for safety violations`);
      
      if (affordableInspectionFine < inspectionFine) {
        const remainingFine = inspectionFine - affordableInspectionFine;
        if (!state.deferred_payments) state.deferred_payments = [];
        state.deferred_payments.push({
          amount: remainingFine,
          quarterly_payment: Math.ceil(remainingFine / 4),
          remaining_quarters: 4,
          description: 'WorkSafeBC inspection fine payment plan'
        });
        write(`   📋 Remaining ${formatCurrency(remainingFine)} on payment plan`);
      }
    }
  }
  
  // Poor equipment condition increases accident risk
  if (state.equipment_condition < 0.5) {
    state.reputation -= 0.01;
    write("\n🔧 Poor equipment condition affecting operations");
  }
}

export { workplace_safety_incidents };
