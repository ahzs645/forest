import {
  selectRandomDeskEvent,
  selectRandomFieldEvent,
} from "../data/index.js";
import { formatEventForDisplay, resolveEvent } from "../events.js";

import ceoProfiles from "../../docs/legacy_archive/game_content_datasets/ceo_profiles.json" with { type: "json" };
import certificationsData from "../../docs/legacy_archive/game_content_datasets/certifications.json" with { type: "json" };

/**
 * Manager Mode Runner
 * Blends strategic desk events with field occurrences
 */

export async function runManagerDay(game) {
  const { journey, ui } = game;

  // Day 1: Manager Initialization (Hire CEO & Pursue Certification)
  if (journey.day === 1 && !journey.flags.managerInitComplete) {
    ui.write(
      "Welcome to the corner office. Your first order of business: Executive Hiring.",
    );

    // Hire CEO
    const ceoOptions = ceoProfiles.ceo_candidates.map((ceo) => ({
      label: `${ceo.name} (${ceo.background}) - $${ceo.annual_fee.toLocaleString()}/yr`,
      value: ceo.id,
      hint: `Strengths: ${ceo.strengths.join(", ")}`,
    }));

    const ceoRes = await ui.promptChoice(
      "Select a CEO to execute your strategy:",
      ceoOptions,
    );
    const selectedCEO = ceoProfiles.ceo_candidates.find(
      (c) => c.id === ceoRes.value,
    );
    journey.ceo = selectedCEO;
    journey.resources.budget -= selectedCEO.annual_fee;

    ui.writeSuccess(
      `Hired ${selectedCEO.name}. Budget reduced by $${selectedCEO.annual_fee.toLocaleString()}.`,
    );
    ui.write("");

    // Pursue Certification
    const certOptions = certificationsData.certifications.map((cert) => ({
      label: `${cert.name} - Initial Cost: $${cert.initial_cost.toLocaleString()}`,
      value: cert.id,
      hint: cert.description,
    }));
    certOptions.push({ label: "Skip certification for now", value: "none" });

    const certRes = await ui.promptChoice(
      "Will you pursue a forestry certification?",
      certOptions,
    );
    if (certRes.value !== "none") {
      const selectedCert = certificationsData.certifications.find(
        (c) => c.id === certRes.value,
      );
      journey.certifications.push(selectedCert);
      journey.resources.budget -= selectedCert.initial_cost;
      journey.metrics.reputation = Math.min(
        100,
        journey.metrics.reputation + selectedCert.reputation_bonus * 100,
      );
      ui.writeSuccess(`Acquired ${selectedCert.name}.`);
    }

    journey.flags.managerInitComplete = true;
    journey.day++;
    return;
  }

  // Daily Routine: Alternate randomly between a desk event and a field event
  ui.write(`--- Manager Day ${journey.day} ---`);

  // Apply CEO effects if present
  if (journey.ceo && journey.day % 10 === 0) {
    ui.writeInfo(`${journey.ceo.name} has implemented a strategic initiative.`);
    // A simplified CEO effect
    if (journey.ceo.decision_making_style === "conservative") {
      journey.metrics.compliance = Math.min(
        100,
        (journey.metrics.compliance || 50) + 5,
      );
      ui.writeSuccess("Compliance improved under conservative leadership.");
    } else {
      journey.metrics.relationships = Math.min(
        100,
        (journey.metrics.relationships || 50) + 5,
      );
      ui.writeSuccess(
        "Stakeholder relationships improved under collaborative leadership.",
      );
    }
  }

  // Determine event pool (60% desk, 40% field)
  const isDeskEvent = Math.random() < 0.6;
  const eventsPool = isDeskEvent ? requireDeskEvents() : requireFieldEvents();
  const selectRandom = isDeskEvent
    ? selectRandomDeskEvent
    : selectRandomFieldEvent;

  const event = selectRandom(eventsPool);

  if (event) {
    const formattedEvent = formatEventForDisplay(event, "manager");
    ui.write("");
    ui.writeWarning(`*** ${formattedEvent.title} ***`);
    ui.write(formattedEvent.description);

    if (formattedEvent.options && formattedEvent.options.length > 0) {
      const selection = await ui.promptChoice(
        "How do you proceed?",
        formattedEvent.options,
      );

      ui.write("");
      ui.writeInfo(selection.outcome || "The situation resolves.");

      resolveEvent(journey, event, selection);
    }
  } else {
    ui.writeInfo("A quiet day in the office.");
  }

  // End of day operations
  journey.resources.budget -= 500; // Daily burn rate
  journey.day++;
}

// Import events dynamically since ES modules don't support require
import { DESK_EVENTS, FIELD_EVENTS } from "../data/index.js";

function requireDeskEvents() {
  return DESK_EVENTS;
}

function requireFieldEvents() {
  return FIELD_EVENTS;
}
