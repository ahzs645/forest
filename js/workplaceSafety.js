import { ask, formatCurrency } from "./utils.js";

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

  state.budget -= incident.immediate_costs;
  state.reputation = Math.max(0.0, state.reputation - incident.reputation_penalty);

  let operations_suspended_days = 0;
  if (incident.operational_impact.operations_suspended) {
    operations_suspended_days = incident.operational_impact.investigation_days || 30;
    write(`   ⏸️  All operations suspended for ${operations_suspended_days} days`);

    const daily_revenue = (state.revenue_per_m3 * state.annual_allowable_cut) / 365;
    const lost_revenue = daily_revenue * operations_suspended_days;
    state.budget -= Math.floor(lost_revenue);
    write(`   💸 Lost revenue during suspension: ${formatCurrency(Math.floor(lost_revenue))}`);
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

  const choice = await ask("Choose your response:", response_options.map(opt => opt.description), terminal, input);
  const chosen_response = response_options[choice];

  write("");
  write(`🎯 RESPONSE: ${chosen_response.description}`);

  if (chosen_response.illegal) {
    return await _handle_worksafebc_bribery(state, incident, chosen_response, write, terminal, input);
  }

  if (state.budget >= chosen_response.cost) {
    state.budget -= chosen_response.cost;
    write(`💰 Response cost: ${formatCurrency(chosen_response.cost)} paid`);

    const final_fine = Math.floor(incident.wsbc_fine * (1 - chosen_response.fine_reduction));
    state.budget -= final_fine;
    write(`🏛️  Final WorkSafeBC fine: ${formatCurrency(final_fine)}`);

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
  } else {
    write("❌ INSUFFICIENT BUDGET: Cannot afford response costs!");
    write("🚨 Bankruptcy proceedings may be initiated");
    write(`💸 Full WorkSafeBC fine imposed: ${formatCurrency(incident.wsbc_fine)}`);
    state.budget -= incident.wsbc_fine;
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

  const confirm = await ask("Are you absolutely certain you want to proceed?", ["Yes, proceed with bribery", "No, choose legal response"], terminal, input);

  if (confirm === 1) {
    write("📋 Returning to legal response options...");
    return false;
  }

  write(`💰 Attempting to bribe WorkSafeBC inspectors with ${formatCurrency(response.cost)}`);

  if (state.budget < response.cost) {
    write("❌ Insufficient funds for bribery attempt!");
    return false;
  }

  state.budget -= response.cost;

  if (Math.random() < response.detection_risk) {
    write("🚨 BRIBERY DETECTED!");
    write("📞 WorkSafeBC officials report bribery attempt to RCMP");
    write("⚖️  Criminal charges laid for corruption of government officials");

    const criminal_fine = 1500000;
    state.budget -= criminal_fine;
    state.reputation = Math.max(0.0, state.reputation - 0.6);

    write(`💸 Criminal fine: ${formatCurrency(criminal_fine)}`);
    write("📉 Massive reputation damage: -0.6");
    write("🏛️  Original WorkSafeBC fine DOUBLED as penalty");

    const doubled_fine = incident.wsbc_fine * 2;
    state.budget -= doubled_fine;
    write(`💸 Enhanced WorkSafeBC fine: ${formatCurrency(doubled_fine)}`);

    write("🚫 Company blacklisted from government contracts");
    write("📰 International media coverage of corruption scandal");

    return true;
  } else {
    write("🤫 Bribery successful - inspectors accept payment");

    const reduced_fine = Math.floor(incident.wsbc_fine * (1 - response.fine_reduction));
    state.budget -= reduced_fine;
    write(`🏛️  'Reduced' WorkSafeBC fine: ${formatCurrency(reduced_fine)}`);

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
 * Process ongoing safety consequences
 * @param {import("./gameModels.js").GameState} state 
 * @param {(text: string) => void} write 
 */
export async function ongoing_safety_consequences(state, write) {
  // Safety violations affect future incident risk
  if (state.safety_violations > 0) {
    // Each violation increases scrutiny
    if (Math.random() < 0.1 * state.safety_violations) {
      const inspectionFine = Math.floor(Math.random() * 50000) + 10000;
      state.budget -= inspectionFine;
      write(`\n⚠️ WORKSAFEBC INSPECTION: Fine of ${formatCurrency(inspectionFine)} for safety violations`);
    }
  }
  
  // Poor equipment condition increases accident risk
  if (state.equipment_condition < 0.5) {
    state.reputation -= 0.01;
    write("\n🔧 Poor equipment condition affecting operations");
  }
}

export { workplace_safety_incidents };
