import { PermitStatus, DisasterType, HarvestBlock } from "./gameModels.js";
import { askChoice, formatCurrency, formatVolume } from "./utils.js";

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
 * Handle market price fluctuations.
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 */
export function market_fluctuations(state, write) {
    const price_change = Math.random() * 0.3 - 0.15; // ±15%

    if (Math.abs(price_change) > 0.05) {
        const old_price = state.revenue_per_m3;
        state.revenue_per_m3 = Math.floor(state.revenue_per_m3 * (1 + price_change));
        const direction = price_change > 0 ? "increased" : "decreased";
        write("MARKET UPDATE: Lumber prices " + direction);
        write(`   Price: ${formatCurrency(old_price)}/m³ → ${formatCurrency(state.revenue_per_m3)}/m³ (${(price_change * 100).toFixed(1)}%)`);
    }
}
