import { PermitStatus } from "./gameModels.js";
import { ask, askChoice, formatCurrency, formatVolume } from "./utils.js";

/**
 * Allow players to selectively submit permits based on priority and risk.
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function selective_permit_submission(state, write, terminal, input) {
  write("--- SELECTIVE PERMIT SUBMISSION ---");

  const blocks_to_submit = state.harvest_blocks.filter(
    (b) => b.permit_status === PermitStatus.PENDING
  );

  if (!blocks_to_submit.length) {
    write("No blocks requiring permits.");
    return;
  }

  write(`Current government backlog: ${state.permit_backlog_days} days average`);
  write("Available blocks for permit application:");

  for (let i = 0; i < blocks_to_submit.length; i++) {
    const block = blocks_to_submit[i];
    const risk_factors = [];
    let risk_score = 0;

    if (block.old_growth_affected) {
      risk_factors.push("old-growth concerns");
      risk_score += 3;
    }
    // ... more risk factors

    const risk_level = risk_score <= 2 ? "LOW" : risk_score <= 5 ? "MEDIUM" : "HIGH";
    write(`  ${i + 1}. ${block.id}: ${formatVolume(block.volume_m3)} - Risk: ${risk_level}`);
  }

  const choice = await askChoice("Choose permit submission strategy:", [
    "Submit all blocks",
    "Submit high priority blocks only",
    "Submit low-risk blocks only",
    "Custom selection",
    "Skip permit submissions",
  ], terminal, input);

  let blocks_to_process = [];
  // ... logic for selecting blocks based on choice

  if (choice === 0) {
    blocks_to_process = blocks_to_submit;
  }
  // ... other choices

  if (!blocks_to_process.length) {
    write("No blocks selected for submission.");
    return;
  }

  const total_cost = blocks_to_process.length * 5000; // Simplified cost
  write(`Total cost: ${formatCurrency(total_cost)}`);

  if (state.budget < total_cost) {
    write("Insufficient budget!");
    return;
  }

  const confirm = await askChoice("Proceed with submission?", ["Yes", "No"], terminal, input);
  if (confirm === 0) {
    state.budget -= total_cost;
    for (const block of blocks_to_process) {
      block.permit_submitted = state.year;
      block.processing_time = state.permit_backlog_days + Math.random() * 60; // Simplified
      write(`Submitted ${block.id} - estimated processing: ${block.processing_time.toFixed(0)} days`);
    }
    write(`Budget remaining: ${formatCurrency(state.budget)}`);
  }
}

/**
 * Process pending permit applications.
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function process_permits(state, write, terminal, input) {
  const pending_blocks = state.harvest_blocks.filter(
    (b) => b.permit_status === PermitStatus.PENDING && b.permit_submitted > 0
  );

  if (!pending_blocks.length) {
    return;
  }

  write("--- PERMIT DECISIONS ---");

  let decisions_made = false;
  for (const block of pending_blocks) {
    const days_elapsed = (state.year - block.permit_submitted) * 365; // Simplified
    if (days_elapsed >= block.processing_time) {
      decisions_made = true;
      const approval_chance = 0.7 + state.permit_bonus + (state.reputation - 0.5) * 0.3;

      if (Math.random() < approval_chance) {
        block.permit_status = PermitStatus.APPROVED;
        write(`PERMIT APPROVED: ${block.id}`);
      } else {
        block.permit_status = PermitStatus.DENIED;
        write(`PERMIT DENIED: ${block.id}`);
        state.reputation -= 0.05;
      }
    }
  }

  if (!decisions_made) {
    write("No permit decisions ready this year.");
  }
}
