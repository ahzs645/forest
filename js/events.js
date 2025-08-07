import { PermitStatus, DisasterType, HarvestBlock } from "./gameModels.js";
import { askChoice, formatCurrency, formatVolume } from "./utils.js";

// Event Types for better organization
export const EventType = {
  POLICY: 'policy',
  NATURAL_DISASTER: 'natural_disaster', 
  MARKET: 'market',
  FIRST_NATIONS_ANGER: 'first_nations_anger',
  WORKPLACE_SAFETY: 'workplace_safety',
  CEO_DECISION: 'ceo_decision'
};

// Events Router - centralized event management system
export class EventsRouter {
  constructor() {
    this.eventHandlers = new Map();
    
    // Register core event handlers
    this.registerEventHandler(EventType.POLICY, random_policy_events);
    this.registerEventHandler(EventType.NATURAL_DISASTER, natural_disasters_during_harvest);
    this.registerEventHandler(EventType.MARKET, market_fluctuations);
  }

  registerEventHandler(eventType, handler) {
    this.eventHandlers.set(eventType, handler);
  }

  async triggerEvent(eventType, state, write, terminal = null, input = null, ...args) {
    const handler = this.eventHandlers.get(eventType);
    if (handler) {
      return await handler(state, write, terminal, input, ...args);
    } else {
      write(`Unknown event type: ${eventType}`);
      return false;
    }
  }

  // Add individual event trigger methods
  async random_policy_events(state, write, terminal, input) {
    return await this.triggerEvent(EventType.POLICY, state, write, terminal, input);
  }
  
  async market_fluctuations(state, write, terminal, input) {
    return await this.triggerEvent(EventType.MARKET, state, write, terminal, input);
  }
  
  // Quarterly event management similar to Python system
  async runQuarterlyEvents(state, write, terminal, input) {
    // Policy events (Spring only)
    if (state.quarter === 1) {
      await this.triggerEvent(EventType.POLICY, state, write);
    }
    
    // Market fluctuations (Winter only)  
    if (state.quarter === 4) {
      await this.triggerEvent(EventType.MARKET, state, write);
    }
    
    // Random scenario events
    await this.runScenarioEvents(state, write, terminal, input);
  }

  async runScenarioEvents(state, write, terminal, input) {
    // First Nations anger events (25% chance)
    if (Math.random() < 0.25) {
      const { random_first_nations_anger_events } = await import('./firstNationsAnger.js');
      await random_first_nations_anger_events(state, write, terminal, input);
    }
    
    // Workplace safety incidents (15% chance)
    if (Math.random() < 0.15) {
      const { workplace_safety_incidents } = await import('./workplaceSafety.js');
      await workplace_safety_incidents(state, write, terminal, input);
    }
    
    // CEO automated decisions (if CEO exists)
    if (state.ceo && Math.random() < 0.8) {
      const { ceo_automated_decisions } = await import('./ceo.js');
      await ceo_automated_decisions(state, write, terminal, input);
    }
  }
}

/**
 * Handle random policy and regulatory events.
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 */
export function random_policy_events(state, write) {
  write("--- POLICY & REGULATORY UPDATES ---");

  const event_chance = Math.random();

  if (event_chance < 0.15 && !state.old_growth_deferrals_expanded) {
    write("GOVERNMENT ANNOUNCEMENT: Additional old-growth deferrals implemented");
    write("   2M hectares of old-growth forests now under deferral");
    state.old_growth_deferrals_expanded = true;

    state.harvest_blocks = state.harvest_blocks.filter((block) => {
      if (block.old_growth_affected && block.permit_status !== PermitStatus.APPROVED) {
        write(`   Block ${block.id} cancelled due to old-growth deferral`);
        return false;
      }
      return true;
    });
    state.reputation += 0.1;
  } else if (event_chance < 0.2 && !state.glyphosate_banned) {
    write("POLICY CHANGE: Provincial government phases out glyphosate use");
    write("   Chemical vegetation control no longer permitted");
    state.glyphosate_banned = true;
    state.reputation += 0.15;
  } else if (event_chance < 0.3) {
    write("WILDFIRE SEASON: Major fires affect timber supply");
    write("   Government fast-tracks salvage permits (25-day timeline)");
    state.permit_backlog_days = Math.max(25, state.permit_backlog_days - 30);

    const old_aac = state.annual_allowable_cut;
    state.annual_allowable_cut = Math.floor(state.annual_allowable_cut * 0.95);
    write(`   AAC reduced: ${formatVolume(old_aac)} → ${formatVolume(state.annual_allowable_cut)}`);
  } else if (event_chance < 0.4) {
    write("MEDIA SPOTLIGHT: Forestry practices under public scrutiny");
    if (state.reputation < 0.5) {
      write("   Negative coverage damages company reputation");
      state.reputation -= 0.2;
      state.social_license_maintained = false;
    } else {
      write("   Positive coverage highlights sustainable practices");
      state.reputation += 0.1;
    }
  } else if (event_chance < 0.5) {
    write("COURT RULING: First Nations win land rights case");
    write("   Stricter consultation requirements now in effect");
    for (const fn of state.first_nations) {
      if (fn.treaty_area && !fn.agreement_signed) {
        fn.consultation_cost += 15000;
        write(`   ${fn.name} requires enhanced consultation process`);
      }
    }
  } else {
    write("No major policy changes this year");
  }
}

/**
 * Handle natural disasters that affect harvest operations.
 * @param {import("./gameModels.js").GameState} state
 * @param {HarvestBlock[]} approved_blocks
 * @param {(text: string) => void} write
 * @returns {number} Volume loss factor
 */
export function natural_disasters_during_harvest(state, approved_blocks, write) {
  if (!approved_blocks.length) {
    return 0.0;
  }

  write("--- NATURAL EVENTS DURING HARVEST ---");

  const disaster_chance = Math.random();
  let total_volume_loss = 0.0;

  if (disaster_chance < 0.08) {
    write("MOUNTAIN PINE BEETLE OUTBREAK detected in harvest areas");
    const affected_blocks = approved_blocks.slice(0, 2); // Simplified sample

    for (const block of affected_blocks) {
      const loss_percent = Math.random() * 0.4 + 0.2; // 20-60%
      block.disaster_affected = true;
      block.disaster_type = DisasterType.BEETLE_KILL;
      block.volume_loss_percent = loss_percent;
      total_volume_loss += block.volume_m3 * loss_percent;
      write(`   Block ${block.id}: ${(loss_percent * 100).toFixed(1)}% volume loss to beetle kill`);
    }
    write("   Salvage operations required - reduced timber quality");
  } else if (disaster_chance < 0.12) {
    write("SEVERE WINDSTORM damages standing timber");
    const affected_blocks = approved_blocks.slice(0, 1); // Simplified sample
    for (const block of affected_blocks) {
      const loss_percent = Math.random() * 0.2 + 0.1; // 10-30%
      block.disaster_affected = true;
      block.disaster_type = DisasterType.WINDSTORM;
      block.volume_loss_percent = loss_percent;
      total_volume_loss += block.volume_m3 * loss_percent;
      write(`   Block ${block.id}: ${(loss_percent * 100).toFixed(1)}% volume loss to windthrow`);
    }
  } else {
    write("No major natural disasters this harvest season");
    return 0.0;
  }

  const total_approved_volume = approved_blocks.reduce((sum, b) => sum + b.volume_m3, 0);
  if (total_approved_volume > 0) {
    const avg_loss_factor = total_volume_loss / total_approved_volume;
    write(`   Total estimated volume loss: ${formatVolume(total_volume_loss)} (${(avg_loss_factor * 100).toFixed(1)}%)`);
    return avg_loss_factor;
  }

  return 0.0;
}

/**
 * Monitor overall forest health and apply long-term effects.
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 */
export function forest_health_monitoring(state, write) {
    write("--- FOREST HEALTH ASSESSMENT ---");

    const beetle_affected_blocks = state.harvest_blocks.filter(
        (b) => b.disaster_affected && b.disaster_type === DisasterType.BEETLE_KILL
    );

    if (beetle_affected_blocks.length >= 3) {
        write("FOREST HEALTH ALERT: Widespread beetle kill detected");
        write("   Future AAC reductions likely as damaged stands are prioritized");
        state.aac_decline_rate += 0.01;
    }

    const disaster_affected = state.harvest_blocks.filter((b) => b.disaster_affected).length;
    if (disaster_affected > 0) {
        const biodiversity_impact = disaster_affected * 0.02;
        state.biodiversity_score = Math.max(0, state.biodiversity_score - biodiversity_impact);
        write(`   Biodiversity score adjusted: -${biodiversity_impact.toFixed(2)}`);
    }

    write(`   Current forest health: ${state.biodiversity_score > 0.6 ? "Good" : state.biodiversity_score > 0.3 ? "Fair" : "Poor"}`);
}

/**
 * Handle market price fluctuations for different log grades.
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 */
export function market_fluctuations(state, write) {
    write("--- MARKET UPDATE ---");
    const base_change = (Math.random() * 0.4 - 0.2); // Base market trend between -20% and +20%

    for (const grade in state.log_prices) {
        const grade_volatility = { sawlogs: 0.15, pulp: 0.1, firewood: 0.05 }[grade];
        const specific_change = (Math.random() * grade_volatility * 2) - grade_volatility; // Add some specific randomness
        const total_change = base_change + specific_change;

        if (Math.abs(total_change) > 0.03) { // Only report significant changes
            const old_price = state.log_prices[grade];
            const new_price = Math.max(10, Math.round(old_price * (1 + total_change)));
            state.log_prices[grade] = new_price;

            const direction = total_change > 0 ? "increased" : "decreased";
            const grade_name = grade.charAt(0).toUpperCase() + grade.slice(1);
            write(`${grade_name} prices have ${direction}.`);
            write(`   ${formatCurrency(old_price)}/m³ → ${formatCurrency(new_price)}/m³ (${(total_change * 100).toFixed(1)}%)`);
        }
    }
}
