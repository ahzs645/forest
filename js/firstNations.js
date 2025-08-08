import { askChoice, formatCurrency } from "./utils.js";

/**
 * Handle ongoing First Nations consultation during regular gameplay.
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function ongoing_first_nations_consultation(state, write, terminal, input) {
  const nations_needing_consultation = state.first_nations.filter((fn) =>
    fn.needs_consultation(state.year)
  );

  if (!nations_needing_consultation.length) {
    return;
  }

  write("--- FIRST NATIONS CONSULTATION REQUIRED ---");
  write("The following First Nations require renewed consultation:");

  // Calculate consultation costs based on company size and operations
  const base_cost = 8000;
  const size_multiplier = Math.max(1, state.annual_allowable_cut / 100000); // Scale with AAC
  const nations_multiplier = Math.sqrt(nations_needing_consultation.length); // Scale with number of nations
  const scaled_cost = Math.floor(base_cost * size_multiplier * nations_multiplier);

  for (const fn of nations_needing_consultation) {
    fn.consultation_cost = scaled_cost; // Update consultation cost dynamically
    write(`  - ${fn.name}: Relationship level ${fn.relationship_level.toFixed(2)}`);
  }
  
  write(`Consultation costs scale with company size: ${formatCurrency(scaled_cost)} per nation`);

  const choice = await askChoice(
    "How will you approach required consultations?",
    [
      `Conduct comprehensive consultations with all Nations (${formatCurrency(scaled_cost * 2 * nations_needing_consultation.length)})`,
      `Schedule individual meetings with each Nation (${formatCurrency(scaled_cost * nations_needing_consultation.length)})`,
      `Send formal notification letters only (minimal compliance) (${formatCurrency(scaled_cost * 0.5 * nations_needing_consultation.length)})`,
      "Delay consultations (risk deteriorating relationships)",
    ],
    terminal,
    input
  );

  if (choice === 0) {
    const total_cost = nations_needing_consultation.length * scaled_cost * 2;
    if (state.budget < total_cost) {
      write("Insufficient budget for comprehensive consultations.");
      return;
    }
    state.budget -= total_cost;
    for (const fn of nations_needing_consultation) {
      fn.last_consultation_year = state.year;
      fn.relationship_level += 0.2;
      fn.active_negotiations = true;
      fn.agreement_signed = true;
    }
    state.reputation += 0.2;
    state.permit_bonus += 0.15;
  } else if (choice === 1) {
    const total_cost = nations_needing_consultation.length * scaled_cost;
    if (state.budget < total_cost) {
      write("Insufficient budget for individual consultations.");
      return;
    }
    state.budget -= total_cost;
    for (const fn of nations_needing_consultation) {
      fn.last_consultation_year = state.year;
      fn.relationship_level += 0.1;
      if (Math.random() < 0.7) {
        fn.agreement_signed = true;
      }
    }
    state.reputation += 0.1;
    state.permit_bonus += 0.05;
  } else if (choice === 2) {
    const notification_cost = nations_needing_consultation.length * 2000;
    state.budget -= notification_cost;
    for (const fn of nations_needing_consultation) {
      fn.last_consultation_year = state.year;
      fn.relationship_level -= 0.2;
      fn.agreement_signed = false;
    }
    state.reputation -= 0.2;
    state.permit_bonus -= 0.1;
  } else {
    for (const fn of nations_needing_consultation) {
      fn.relationship_level -= 0.3;
      fn.agreement_signed = false;
    }
    state.reputation -= 0.3;
    state.permit_bonus -= 0.2;
    state.social_license_maintained = false;
  }
}
