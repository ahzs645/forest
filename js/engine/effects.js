import { resolveRisk } from "../risk.js";
import {
  advancePaperworkChain,
  ensureProfessionalState,
} from "../data/professionalPractice.js";
import {
  BUDGET_ATTRITION_THRESHOLD,
  COMPLIANCE_AUDIT_THRESHOLD,
  CPD_CARD_GAP,
  DEFAULT_CPD_TARGET,
  RELATIONSHIP_TRUST_THRESHOLD,
} from "./constants.js";
import { buildScheduledIssueTeaser, combineScheduledIssueTeasers, describePromisedFallout } from "./content.js";
import { ensureProfessionalComplianceState, getCpdShortfall } from "./professional.js";
import {
  applyDiminishingReturns,
  clamp,
  formatMetricName,
  normalizeScheduleEntries,
  pendingIssueKey,
} from "./shared.js";

export function applyEffects(state, effects = {}, source) {
  const metrics = state.metrics;
  const budgetLoan = Boolean(state.flags?.budgetLoanActive);
  // Track three views of the swing so balance/debug work can tell "authored too
  // strong" apart from "engine softened it because the meter was already high":
  //   rawEffects   – what the option/consequence authored
  //   effects      – what actually applied after modifiers (player-facing)
  //   modifiers    – which adjustments fired
  const rawEffects = {};
  const appliedEffects = {};
  const modifiers = new Set();

  for (const key of Object.keys(metrics)) {
    if (effects[key] === undefined) continue;
    const rawValue = Number(effects[key]);
    if (!Number.isFinite(rawValue)) continue;
    rawEffects[key] = rawValue;

    let working = rawValue;
    if (budgetLoan && key === "budget" && working > 0) {
      working = Math.max(Math.floor(working * 0.8), 1);
      modifiers.add("budget-loan");
    }
    let adjustedDelta = applyDiminishingReturns(metrics[key], working);
    if (adjustedDelta !== working) {
      modifiers.add("diminishing-returns");
    }
    if (state.flags?.trustDeficitActive && key === "relationships" && adjustedDelta > 0) {
      adjustedDelta = Math.max(1, Math.floor(adjustedDelta * 0.5));
      modifiers.add("trust-deficit");
    }
    const next = clamp(metrics[key] + adjustedDelta, 0, 100);
    if (next - metrics[key] !== adjustedDelta) {
      modifiers.add("clamp");
    }
    // Keep the pre-clamp adjusted delta as the player-facing effect, matching
    // historical behavior so existing copy/tests stay stable.
    appliedEffects[key] = adjustedDelta;
    metrics[key] = next;
  }

  if (source) {
    state.history.push({
      ...source,
      effects: appliedEffects,
      rawEffects,
      modifiers: [...modifiers],
    });
  }
  return appliedEffects;
}

export function applyOptionOutcome(state, option = {}, source, rng = Math.random) {
  if (!state || !option) {
    return null;
  }

  const causedBy = buildCausedBy(state, source, option);

  if (option.risk) {
    const result = resolveRisk(state, option.risk, rng);
    // The history keeps the band, so the round-end pass can tell a shortcut
    // taken (and whether anyone noticed) from one refused.
    const effects = applyEffects(state, result.effects, source && { ...source, band: result.band || (result.success ? "clean" : "caught") });
    applyOptionFlags(state, option);
    if (result.flags) {
      applyOptionFlags(state, { setFlags: result.flags });
    }
    applyAssignmentSideEffects(state, option);
    const scheduledIssueTeaser = combineScheduledIssueTeasers(
      applyScheduledIssues(state, option, causedBy),
      applyRiskOutcomeSchedules(state, option, result, causedBy),
    );
    applyScheduledEvents(state, option, causedBy);
    return {
      effects,
      outcome: result.outcome,
      riskResult: result,
      scheduledIssueTeaser,
    };
  }

  const effects = applyEffects(state, option.effects || {}, source);
  applyOptionFlags(state, option);
  applyAssignmentSideEffects(state, option);
  const scheduledIssueTeaser = applyScheduledIssues(state, option, causedBy);
  applyScheduledEvents(state, option, causedBy);
  return {
    effects,
    outcome: option.outcome ?? "",
    riskResult: null,
    scheduledIssueTeaser,
  };
}

// Provenance stamp attached to anything this decision schedules for later, so a
// delayed issue/event can name the choice that caused it. A shortcut's fallout
// also carries the act and the institution, so the card can say "because you
// took X and C&E caught it" (`kind: "shortcut"`).
function buildCausedBy(state, source, option = null) {
  if (!source) return null;
  const shortcut = option?.risk?.shortcut || null;
  return {
    round: source.round ?? state.round ?? null,
    season: state.currentSeasonContext?.season || null,
    sourceType: source.type || null,
    sourceId: source.id || null,
    title: source.title || null,
    option: source.option || null,
    stance: source.stance || null,
    ...(shortcut
      ? {
          kind: "shortcut",
          actId: shortcut.actId || null,
          title: shortcut.title || source.title || null,
          institution: shortcut.institution || null,
        }
      : {}),
  };
}

// Fallout a caught shortcut scheduled that never got its season (caught in
// the last round, or crowded out): it settles here, as a consequence the
// year-end review can name, instead of being promised and then dropped.
function settleUnlandedFallout(state, round) {
  const pending = Array.isArray(state.pendingIssues) ? state.pendingIssues : [];
  const settled = [];
  for (const entry of pending) {
    if (entry?.causedBy?.kind !== "shortcut") continue;
    const fallout = describePromisedFallout(state, [{ ...entry, delay: 1 }]);
    if (!fallout) continue;
    const { causedBy } = entry;
    const when = causedBy.season ? ` in ${String(causedBy.season).toLowerCase()}` : "";
    const who = causedBy.institution || "the district";
    applyEffects(
      state,
      fallout.severity === "danger" ? { compliance: -6, relationships: -3 } : { compliance: -3, relationships: -1 },
      {
        type: "consequence",
        id: "unlanded-fallout",
        title: `${fallout.title} lands after the year closes`,
        option: `You took the shortcut “${causedBy.title}”${when}, and ${who} caught it. The file carries it into next year.`,
        round,
        falloutId: fallout.id,
        actId: causedBy.actId || null,
      },
    );
    settled.push(entry);
  }
  if (settled.length) {
    state.pendingIssues = pending.filter((entry) => !settled.includes(entry));
  }
  return settled.length;
}

// Widest gap between the strongest and weakest meter that still counts as a
// program run on all fronts (see applyRoundRecoveries).
const STEADY_PROGRAM_SPREAD = 30;

// The meters the tier floors read as the file's standing.
const STANDING_METERS = ["relationships", "compliance", "forestHealth"];

// Flags the end-of-season pass sets, for the content lint's reachability check.
export const ROUND_CONSEQUENCE_FLAGS = Object.freeze([
  "lowBudgetStreak",
  "lowComplianceStreak",
  "trustDeficitActive",
  "contractorAttritionActive",
  "auditEscalationActive",
  "budgetEmergencyScheduled",
]);

/**
 * Whether the season's own calls kept to the professional standards: no
 * planned work answered with the aggressive stance, and no shortcut taken.
 */
function seasonKeptToStandards(state, round) {
  return !(state.history || []).some((entry) => Number(entry?.round) === round
    && (entry.stance === "aggressive" || (entry.type === "temptation" && entry.band)));
}

/** A shortcut taken this season that somebody caught. */
function shortcutCaughtThisRound(state, round) {
  return (state.history || []).some((entry) => Number(entry?.round) === round
    && entry.type === "temptation" && entry.band === "caught");
}

/**
 * What the season's own calls moved, per meter: every card answered this
 * round (and in a campaign the deployment's review), before the round-end
 * pass adds its consequences and recoveries.
 */
function roundDecisionEffects(state, round) {
  const totals = {};
  for (const entry of state.history || []) {
    if (Number(entry?.round) !== round || entry.type === "consequence" || entry.type === "recovery") continue;
    for (const [key, value] of Object.entries(entry.effects || {})) {
      totals[key] = (totals[key] || 0) + (Number(value) || 0);
    }
  }
  return totals;
}

export function applyRoundConsequences(state) {
  if (!state?.metrics || !state?.flags) {
    return [];
  }

  const consequences = [];
  const { metrics, flags } = state;
  const round = Number(state.round || 0);
  const professional = ensureProfessionalComplianceState(state);

  if (metrics.budget < BUDGET_ATTRITION_THRESHOLD) {
    flags.lowBudgetStreak = Number(flags.lowBudgetStreak || 0) + 1;
  } else {
    flags.lowBudgetStreak = 0;
  }

  // A budget run into the ground puts finance's emergency-loan offer on the
  // desk (issue "budget-emergency-loan"); a recovered budget takes it back off.
  if (metrics.budget < BUDGET_ATTRITION_THRESHOLD && !flags.budgetLoanActive) {
    flags.budgetEmergencyScheduled = true;
  } else if (metrics.budget >= BUDGET_ATTRITION_THRESHOLD + 10) {
    delete flags.budgetEmergencyScheduled;
  }

  if (metrics.compliance < COMPLIANCE_AUDIT_THRESHOLD) {
    flags.lowComplianceStreak = Number(flags.lowComplianceStreak || 0) + 1;
  } else {
    flags.lowComplianceStreak = 0;
  }

  if (metrics.relationships < RELATIONSHIP_TRUST_THRESHOLD) {
    flags.trustDeficitActive = true;
  } else if (metrics.relationships >= RELATIONSHIP_TRUST_THRESHOLD + 10) {
    flags.trustDeficitActive = false;
  }

  if (flags.lowBudgetStreak >= 2) {
    applyEffects(
      state,
      { progress: -6, relationships: -4 },
      {
        type: "consequence",
        id: "contractor-attrition",
        title: "Contractor attrition from sustained budget stress",
        option: "Deferred scopes and partner pullback",
        round,
      },
    );
    flags.contractorAttritionActive = true;
    consequences.push("contractor-attrition");
  }

  if (flags.trustDeficitActive) {
    // Scale the compliance bleed down once compliance is already collapsing, so
    // a run in a hole isn't punished into oblivion by every meter at once. This
    // is the "reduce repeated compliance punishment when already in a hole"
    // lever — it lets a recovering run climb back instead of compounding.
    const trustComplianceHit = metrics.compliance > 30 ? -3 : -1;
    applyEffects(
      state,
      { compliance: trustComplianceHit },
      {
        type: "consequence",
        id: "trust-deficit",
        title: "Low-trust environment limited high-confidence pathways",
        option: "Escalated approvals and slower collaboration",
        round,
      },
    );
    consequences.push("trust-deficit");
  }

  if (flags.lowComplianceStreak >= 2) {
    applyEffects(
      state,
      { budget: -6, progress: -4 },
      {
        type: "consequence",
        id: "audit-escalation",
        title: "Audit escalation after repeated compliance drops",
        option: "Emergency documentation and stoppage delays",
        round,
      },
    );
    flags.auditEscalationActive = true;
    consequences.push("audit-escalation");
  }

  if (professional) {
    const complianceLow = metrics.compliance < COMPLIANCE_AUDIT_THRESHOLD;
    // A season run to the standards leaves room for the CPD a professional
    // logs in the ordinary course of the work (the district's technical
    // sessions, a practice advisory read and noted): its share of the year.
    // A season spent pushing the file past them logs none.
    if (seasonKeptToStandards(state, round)) {
      const target = Number(professional.cpdTarget) || DEFAULT_CPD_TARGET;
      professional.cpdHours = clamp(
        Number(professional.cpdHours || 0) + target / Math.max(1, Number(state.totalRounds) || 4),
        0,
        100,
      );
    }
    // CPD is a year-long target: judge the log against the share of the year
    // that has passed, not the full 30 hours from the first season.
    const cpdGap = getCpdShortfall(state, round).gap;

    if (cpdGap > 0) {
      professional.competenceRisk = clamp(professional.competenceRisk + 1 + Math.floor(cpdGap / 15), 0, 100);
      professional.auditExposure = clamp(professional.auditExposure + 1, 0, 100);
    } else if (professional.competenceRisk > 0) {
      professional.competenceRisk = clamp(professional.competenceRisk - 1, 0, 100);
    }
    // A log let slide more than a season behind puts its own card on the
    // desk, once a year: an extra card at the end of next season
    // (CALENDAR_REMINDERS), never the season's contested call.
    if (cpdGap >= CPD_CARD_GAP && !flags.cpdReminderSent && round < (Number(state.totalRounds) || 4)) {
      flags.cpdReminderSent = true;
      flags.cpdReminderDue = true;
    }

    // Seasonal play barely touched the professional state, so its two
    // consequences could never fire. Tie audit exposure to the compliance
    // signal the game *does* move: letting the file fall below the audit line
    // (and an active audit escalation on top) is what now drives professional
    // scrutiny — so the consequence reads as fallout from visible neglect.
    if (complianceLow) {
      professional.auditExposure = clamp(professional.auditExposure + 5, 0, 100);
    }
    if (flags.auditEscalationActive) {
      professional.auditExposure = clamp(professional.auditExposure + 3, 0, 100);
    }

    if (professional.paperworkLoad >= 20) {
      applyEffects(
        state,
        { compliance: -2 },
        {
          type: "consequence",
          id: "paperwork-burn",
          title: "Paperwork load is crowding out actual forestry work",
          option: "Too many active packages and not enough clean closure",
          round,
        },
      );
      professional.auditExposure = clamp(professional.auditExposure + 1, 0, 100);
      consequences.push("paperwork-burn");
    }

    // A ticket lapses only in a deep, sustained collapse — high audit exposure
    // layered on unmanaged competence risk. Reachable on a true neglect run,
    // not in ordinary play.
    if (
      professional.registrationStatus === "active"
      && professional.auditExposure >= 44
      && professional.competenceRisk >= 30
    ) {
      professional.registrationStatus = "lapsed";
    }

    if (professional.registrationStatus !== "active") {
      applyEffects(
        state,
        { compliance: -4, budget: -2 },
        {
          type: "consequence",
          id: "registration-lapse",
          title: "Registration suspended pending practice review",
          option: "Nothing goes out under your seal until FPBC lifts the suspension",
          round,
        },
      );
      professional.auditExposure = clamp(professional.auditExposure + 2, 0, 100);
      consequences.push("registration-lapse");
    }

    if (professional.auditExposure >= 35) {
      // De-pile-on: once compliance is already critically low the audit reads as
      // a *standing* exposure, not a fresh wound — keep the scrutiny (progress
      // drag + the firing event) but ease the compliance bleed so a run in a
      // hole isn't hammered into oblivion by every layer at once.
      const auditComplianceHit = metrics.compliance < 20 ? -1 : -2;
      applyEffects(
        state,
        { compliance: auditComplianceHit, progress: -2 },
        {
          type: "consequence",
          id: "professional-audit",
          title: "Professional audit risk is building",
          option: "The file is drawing closer review because the records look thin",
          round,
        },
      );
      consequences.push("professional-audit");
    }
  }

  applyEcologyDrift(state, round, consequences);
  applyRoundRecoveries(state, round, consequences);

  if (round >= (Number(state.totalRounds) || 4) && settleUnlandedFallout(state, round)) {
    consequences.push("unlanded-fallout");
  }

  return consequences;
}

// End-of-season ecology response. Forest health barely moved through card
// effects alone (a full simulated year shifted it 0–2 points), which left the
// most prominent meter on the dashboard reading as dead UI and the ecology
// excellence path effectively unreachable. The land now answers the way the
// program was run each season: disciplined practice lets stands recover;
// pushing production on thin safeguards degrades them.
function applyEcologyDrift(state, round, consequences) {
  const { metrics } = state;

  // The opening season stays clean (same philosophy as temptation suppression):
  // the land responds to a track record, not to week one.
  if (round < 2) return;

  // Regeneration is the silviculture program's own work, so a disciplined
  // silviculture year carries stands further than the others can.
  const recoveryCeiling = state.role?.id === "silviculture" ? 80 : 72;
  if (metrics.compliance >= 65 && metrics.forestHealth < recoveryCeiling) {
    applyEffects(
      state,
      { forestHealth: 3 },
      {
        type: "recovery",
        id: "stand-recovery",
        title: "Stands recovering under a disciplined program",
        option: "Careful practice gave regeneration and retention room to work",
        round,
      },
    );
    consequences.push("stand-recovery");
    return;
  }

  if (metrics.compliance < 45 && metrics.progress >= 50 && metrics.forestHealth > 20) {
    applyEffects(
      state,
      { forestHealth: -3 },
      {
        type: "consequence",
        id: "ecological-strain",
        title: "Ecological strain from an aggressive program",
        option: "Production outran its safeguards and the stands show it",
        round,
      },
    );
    consequences.push("ecological-strain");
  }
}

// Positive end-of-season swings, kept separate from the punishment ladder so
// disciplined play has a real path back. These read through the same "Why This
// Happened" panel as consequences but use a non-"consequence" history type so
// the run-scoring risk penalty never counts them against the player.
function applyRoundRecoveries(state, round, consequences) {
  const { metrics } = state;
  const firedBefore = consequences.length;
  // The rules read the year's meters, but each one credits something the
  // season did, so each pays only when the season did it. `effort` is what
  // the season's own calls moved (in a campaign, the deployment's review
  // too); a campaign season that fell short (`seasonOutcome`), or a season
  // whose shortcut was caught, earns no dividend for a well-run file. A
  // shortcut somebody only noticed has already cost the file its compliance
  // and a watch; withholding the dividend as well charged a middling year
  // that delivered twice for it.
  const effort = roundDecisionEffects(state, round);
  const outcome = state.seasonOutcome || {};
  const fileTrusted = !outcome.fellShort && !(Number(outcome.shortcutsCaught) > 0) && !shortcutCaughtThisRound(state, round);

  // Operational dividend: a clean, well-trusted file burns far less budget on
  // rework and firefighting, so a strongly-run year recovers some budget. This
  // is the missing budget lever that made Outstanding unreachable.
  if (fileTrusted && metrics.compliance >= 70 && metrics.relationships >= 65 && metrics.progress >= 35 && metrics.budget < 72) {
    applyEffects(
      state,
      { budget: 5 },
      {
        type: "recovery",
        id: "operational-dividend",
        title: "Operational dividend from a clean file",
        option: "Less rework and firefighting freed up budget",
        round,
      },
    );
    consequences.push("operational-dividend");
  }

  // Delivery dividend: the schedule counterpart to the operational dividend.
  // A season carries five-plus decision cards and the careful answer on most
  // of them costs schedule time; without a counterweight a disciplined desk
  // year ground progress to the floor while compliance sat in the 90s. A file
  // reviewers trust genuinely does move faster — referrals come back clean,
  // permits don't bounce — so a clean, well-trusted program earns some of
  // that time back each season. Same opening-season exemption as the other
  // recoveries: dividends respond to a track record, not to week one.
  // Sized so it keeps a careful year deliverable without powering the sprint
  // to Outstanding: it only tops progress up toward 50, never past it.
  if (fileTrusted && round >= 2 && metrics.compliance >= 70 && metrics.relationships >= 60 && metrics.progress < 50) {
    applyEffects(
      state,
      { progress: 6 },
      {
        type: "recovery",
        id: "delivery-dividend",
        title: "Delivery dividend from a trusted file",
        option: "Clean referrals and reviews gave the schedule room back",
        round,
      },
    );
    consequences.push("delivery-dividend");
  }

  // Field-discipline rebound ("repair compliance later"): a crew that is still
  // delivering real work on the ground can be pulled off the line to catch up
  // documentation and clean the file, clawing back some compliance at the cost
  // of a little production. This is the comeback tool for a fast-and-loose run
  // that wants to course-correct — it eases a compliance collapse on an
  // actively-producing file without, on its own, rescuing the run to a good
  // ending (relationships and budget still have to be earned elsewhere).
  // It pays only a season whose own calls put work into the file.
  if (round >= 2 && metrics.compliance < 35 && metrics.progress >= 55 && Number(effort.compliance) > 0) {
    applyEffects(
      state,
      { compliance: 5, progress: -2 },
      {
        type: "recovery",
        id: "field-discipline-rebound",
        title: "Field-discipline rebound",
        option: "This season's calls went into the file, and the clean-up held",
        round,
      },
    );
    consequences.push("field-discipline-rebound");
  }

  // Steady program: the dividends above pay a file that piles up compliance
  // and trust, which made turtling the dominant line. A program that kept
  // every meter in play earns its own return: the weakest meter gets room to
  // recover. Paid only in a season no dividend already rewarded, and from a
  // weakest meter of 35 up: a middling year with one thin meter is the file
  // this is for. Not a campaign season that fell short: that meter was left
  // behind. Not a season whose shortcut was caught, nor one that left its
  // crew hungry or walking off: "no meter was left behind" refunded the
  // Budget the review had just charged for a starved crew.
  if (round >= 2 && consequences.length === firedBefore && fileTrusted && !outcome.crewNeglected) {
    const values = Object.values(metrics).map((value) => Number(value) || 0);
    const weakest = Object.entries(metrics).sort((a, b) => a[1] - b[1])[0];
    const spread = Math.max(...values) - Math.min(...values);
    if (weakest && Number(weakest[1]) >= 35 && Number(weakest[1]) < 60 && spread <= STEADY_PROGRAM_SPREAD) {
      applyEffects(
        state,
        { [weakest[0]]: 3 },
        {
          type: "recovery",
          id: "steady-program",
          title: "Steady program",
          option: `No meter was left behind, so ${formatMetricName(weakest[0])} had room to recover`,
          round,
        },
      );
      consequences.push("steady-program");
    }
  }

  // Comeback window: a single collapsing meter gets a modest rebound — but
  // only if the overall file is still salvageable, so one rough stretch
  // doesn't doom an otherwise competent run. Standing (relationships,
  // compliance, forest health) can be repaired from the second season, once it
  // slips toward the Mixed floors and before it sinks under the trust and
  // audit lines and compounds; any other meter waits for the back half of the
  // year. The schedule and the budget keep the later, lower line, so a turtled
  // file is not refunded. It says what happened: effort only when the
  // season's own calls moved that meter up. A campaign review reports what
  // the deployment did, so there the rebound reads the season (below); the
  // seasonal year keeps it as the catch-up that holds careful play in reach.
  if (round >= 2) {
    const values = Object.values(metrics).map((value) => Number(value) || 0);
    const average = values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
    const byValue = Object.entries(metrics).sort((a, b) => a[1] - b[1]);
    const standing = byValue.find(([key, value]) => STANDING_METERS.includes(key) && Number(value) < 43);
    const late = round >= 3 && Number(byValue[0]?.[1]) < 35 ? byValue[0] : null;
    const weakest = standing || late;
    const worked = Boolean(weakest) && Number(effort[weakest[0]] || 0) > 0;
    // In a campaign it pays for the season's own work on that meter, or for
    // a season that delivered: a middling deployment that got its job done
    // (a noticed shortcut and all, which already cost the file) still has
    // room to steady a slipping meter. One that fell short gets no rebound it
    // did not work for.
    if (weakest && average >= 42 && (worked || !state.seasonOutcome || !outcome.fellShort)) {
      const meter = formatMetricName(weakest[0]);
      applyEffects(
        state,
        { [weakest[0]]: 5 },
        {
          type: "recovery",
          id: "comeback-window",
          title: "Comeback window",
          option: worked
            ? `The file was still salvageable, and this season's calls went into ${meter}, so it steadied`
            : `The file was still salvageable, so ${meter} had room to recover`,
          round,
        },
      );
      consequences.push("comeback-window");
    }
  }
}

export function formatMetricDelta(delta = {}) {
  const pieces = Object.entries(delta)
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(([key, value]) => `${formatMetricName(key)} ${value > 0 ? "+" : ""}${value}`);
  return pieces.join(", ");
}

function applyOptionFlags(state, option) {
  if (!state.flags) {
    state.flags = {};
  }

  if (option.setFlags && typeof option.setFlags === "object") {
    for (const [flag, value] of Object.entries(option.setFlags)) {
      state.flags[flag] = Boolean(value);
    }
  }

  if (Array.isArray(option.clearFlags)) {
    for (const flag of option.clearFlags) {
      delete state.flags[flag];
    }
  }
}

function applyAssignmentSideEffects(state, option) {
  const sideEffects = option?.assignmentSideEffects;
  if (!sideEffects || !state) {
    return;
  }

  if (sideEffects.advancePaperworkChainId) {
    advancePaperworkChain(state, sideEffects.advancePaperworkChainId, {
      day: state.round || 0,
      roleId: state.role?.id,
      area: state.area,
    });
  }

  if (sideEffects.professionalShift && typeof sideEffects.professionalShift === "object") {
    const professional = ensureProfessionalState(state, {
      roleId: state.role?.id,
      area: state.area,
    });
    professional.paperworkLoad = clamp(
      Number(professional.paperworkLoad || 0) + Number(sideEffects.professionalShift.paperworkLoad || 0),
      0,
      100,
    );
    professional.auditExposure = clamp(
      Number(professional.auditExposure || 0) + Number(sideEffects.professionalShift.auditExposure || 0),
      0,
      100,
    );
    professional.cpdHours = clamp(
      Number(professional.cpdHours || 0) + Number(sideEffects.professionalShift.cpdHours || 0),
      0,
      100,
    );
  }
}

function applyRiskOutcomeSchedules(state, option, result, causedBy = null) {
  const risk = option?.risk;
  if (!risk || !result) {
    return null;
  }

  // The noticed band leaves a watch flag, not a scheduled card.
  const band = result.band || (result.success ? "clean" : "caught");
  const scheduleSpec = band === "clean"
    ? risk.successScheduleIssues
    : band === "noticed"
      ? risk.partialScheduleIssues
      : risk.failScheduleIssues;
  if (scheduleSpec) {
    scheduleIssueEntries(state, scheduleSpec, causedBy);
    return buildScheduledIssueTeaser(state, scheduleSpec, { settles: causedBy?.kind === "shortcut" });
  }
  return null;
}

function applyScheduledIssues(state, option, causedBy = null) {
  const schedule = option.scheduleIssues;
  if (!schedule) {
    return null;
  }

  scheduleIssueEntries(state, schedule, causedBy);
  return buildScheduledIssueTeaser(state, schedule, { settles: causedBy?.kind === "shortcut" });
}

function scheduleIssueEntries(state, scheduleSpec, causedBy = null) {
  const schedules = normalizeScheduleEntries(scheduleSpec);
  if (!schedules.length) {
    return;
  }

  if (!Array.isArray(state.pendingIssues)) {
    state.pendingIssues = [];
  }

  for (const schedule of schedules) {
    // A caught shortcut's fallout keeps its own entry: merged into another
    // source's pending card it lost the "Because you took" provenance, and
    // the year end (settleUnlandedFallout) could no longer see it to settle.
    // The same act caught twice is one determination.
    const shortcut = causedBy?.kind === "shortcut";
    const existing = state.pendingIssues.find((pending) => pendingIssueKey(pending) === pendingIssueKey(schedule)
      && (shortcut
        ? pending.causedBy?.kind === "shortcut" && pending.causedBy?.actId === causedBy.actId
        : pending.causedBy?.kind !== "shortcut"));
    const delay = Math.max(0, Number(schedule.delay || 0));
    if (existing) {
      existing.delay = Math.min(existing.delay ?? delay, delay);
      if (causedBy && !existing.causedBy) existing.causedBy = causedBy;
      continue;
    }
    state.pendingIssues.push({
      ...(schedule.id ? { id: schedule.id } : {}),
      ...(Array.isArray(schedule.candidates) ? { candidates: schedule.candidates.map((candidate) => ({ ...candidate })) } : {}),
      ...(schedule.force ? { force: true } : {}),
      ...(causedBy ? { causedBy } : {}),
      delay,
    });
  }
}

function applyScheduledEvents(state, option, causedBy = null) {
  const schedule = option.scheduleEvents;
  if (!schedule || !schedule.id) {
    return;
  }

  if (!Array.isArray(state.pendingEvents)) {
    state.pendingEvents = [];
  }

  const existing = state.pendingEvents.find((pending) => pending?.id === schedule.id);
  const delay = Math.max(0, Number(schedule.delay || 0));
  if (existing) {
    existing.delay = Math.min(existing.delay ?? delay, delay);
    if (causedBy && !existing.causedBy) existing.causedBy = causedBy;
    return;
  }
  state.pendingEvents.push({ id: schedule.id, delay, ...(causedBy ? { causedBy } : {}) });
}
