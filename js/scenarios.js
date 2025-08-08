import { askChoice, formatCurrency } from './utils.js';

export async function quarterly_special_scenarios(state, write, terminal, input) {
  // Up to one special scenario per quarter
  const roll = Math.random();
  if (roll < 0.12) {
    return await labor_strike_event(state, write, terminal, input);
  } else if (roll < 0.22) {
    return await supply_chain_disruption(state, write, terminal, input);
  } else if (roll < 0.30) {
    return await invasive_species_alert(state, write, terminal, input);
  } else if (roll < 0.38) {
    return await community_outreach_grant(state, write, terminal, input);
  }
  return false;
}

async function labor_strike_event(state, write, terminal, input) {
  if (state.crew_morale > 0.6 && Math.random() < 0.5) return false; // less likely when morale good
  write("\n🪧 LABOR ACTION: Union announces strike over safety and pay");
  write("Operations face disruption unless resolved.");

  const options = [
    `Negotiate improved safety + pay (${formatCurrency(120000)})`,
    `Hire contractors short-term (${formatCurrency(80000)} + higher costs)`,
    `Hold firm and wait (lose production this quarter)`
  ];
  const choice = await askChoice('How do you respond?', options, terminal, input);

  if (choice === 0) {
    if (state.budget >= 120000) {
      state.budget -= 120000;
      state.crew_morale = Math.min(1.0, state.crew_morale + 0.2);
      state.reputation += 0.05;
      write('🤝 Agreement reached. Morale and reputation improve.');
    } else {
      write('❌ Insufficient funds to negotiate. Strike proceeds.');
      state.harvest_blocks.forEach(b => { if (b.permit_status === 'approved') b.volume_m3 *= 0.6; });
    }
  } else if (choice === 1) {
    if (state.budget >= 80000) {
      state.budget -= 80000;
      state.operating_cost_per_m3 += 5; // temporary increase for contractors
      state._contractor_cost_quarters = 2;
      write('🚚 Contractors hired. Costs rise for 2 quarters.');
    } else {
      write('❌ Insufficient funds for contractors. Strike proceeds.');
      state.harvest_blocks.forEach(b => { if (b.permit_status === 'approved') b.volume_m3 *= 0.7; });
    }
  } else {
    write('⏸️ You hold firm. Production reduced this quarter.');
    state.harvest_blocks.forEach(b => { if (b.permit_status === 'approved') b.volume_m3 *= 0.75; });
    state.crew_morale = Math.max(0, state.crew_morale - 0.1);
  }
  return true;
}

async function supply_chain_disruption(state, write, terminal, input) {
  write("\n🚧 SUPPLY CHAIN DISRUPTION: Key component shortages impact operations");
  const options = [
    'Pay premium to source parts (+$50,000, +$2/m³ costs for 2q)',
    'Slow production (-10% output for 2q)',
  ];
  const idx = await askChoice('Choose mitigation:', options, terminal, input);
  if (idx === 0) {
    state.budget -= 50000;
    state.operating_cost_per_m3 += 2;
    state._supply_cost_quarters = 2;
    write('🔧 Parts acquired at premium. Costs temporarily higher.');
  } else {
    state._output_penalty_quarters = (state._output_penalty_quarters || 0) + 2;
    write('🐢 Production intentionally slowed for 2 quarters.');
  }
  return true;
}

async function invasive_species_alert(state, write, terminal, input) {
  write("\n🪲 FOREST HEALTH ALERT: Invasive species detected in tenure area");
  const options = [
    `Fund eradication program (${formatCurrency(90000)})`,
    'Monitor and adapt (risk higher AAC decline)',
  ];
  const idx = await askChoice('Select response:', options, terminal, input);
  if (idx === 0) {
    if (state.budget >= 90000) {
      state.budget -= 90000;
      state.aac_decline_rate = Math.max(0, state.aac_decline_rate - 0.005);
      state.reputation += 0.03;
      write('✅ Eradication funded. Long-term AAC protected.');
    } else {
      write('❌ Budget too tight. Forced to monitor only.');
      state.aac_decline_rate = Math.min(0.08, state.aac_decline_rate + 0.01);
    }
  } else {
    state.aac_decline_rate = Math.min(0.08, state.aac_decline_rate + 0.01);
    write('📉 AAC decline rate worsens slightly due to spread risk.');
  }
  return true;
}

async function community_outreach_grant(state, write, terminal, input) {
  write('\n🤝 COMMUNITY PROGRAM: Opportunity to sponsor local training initiative');
  const options = [
    `Sponsor program (${formatCurrency(40000)})`,
    'Decline politely',
  ];
  const idx = await askChoice('Your choice:', options, terminal, input);
  if (idx === 0) {
    if (state.budget >= 40000) {
      state.budget -= 40000;
      state.community_support = Math.min(1, state.community_support + 0.15);
      state.reputation += 0.04;
      write('🌟 Community support rises. Reputation improves.');
    } else {
      write('❌ Insufficient funds to sponsor.');
    }
  } else {
    write('You decline for now.');
  }
  return true;
}

// Housekeeping hook called each quarter to decay temporary effects
export function decay_temporary_effects(state, write) {
  if (state._contractor_cost_quarters) {
    state._contractor_cost_quarters--;
    if (state._contractor_cost_quarters === 0) {
      state.operating_cost_per_m3 -= 5;
      write && write('🔁 Contractor costs ended. Operating costs normalized.');
    }
  }
  if (state._supply_cost_quarters) {
    state._supply_cost_quarters--;
    if (state._supply_cost_quarters === 0) {
      state.operating_cost_per_m3 -= 2;
      write && write('🔁 Supply chain premium ended. Costs normalized.');
    }
  }
  if (state._output_penalty_quarters && state._output_penalty_quarters > 0) {
    state._output_penalty_quarters--;
  }
}

export function get_output_penalty_multiplier(state) {
  if (state._output_penalty_quarters && state._output_penalty_quarters > 0) return 0.9;
  return 1.0;
}

