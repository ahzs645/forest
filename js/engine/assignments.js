import {
  CHAINED_ISSUES,
  ISSUE_LIBRARY,
  getMinistryProcessHook,
} from "../data/index.js";
import { normalizeSeasonalCard } from "./seasonalContract.js";

const EXISTING_ISSUE_IDS = new Set([...ISSUE_LIBRARY, ...CHAINED_ISSUES].map((issue) => issue.id));

const ROLE_ASSIGNMENT_PRIORITIES = {
  planner: {
    foundation: ["briefing", "planning", "process"],
    operations: ["planning", "road", "situation"],
    pressure: ["process", "situation", "professional"],
    closeout: ["professional", "process", "planning"],
  },
  permitter: {
    foundation: ["briefing", "process", "road"],
    operations: ["process", "road", "situation"],
    pressure: ["process", "professional", "situation"],
    closeout: ["professional", "process", "briefing"],
  },
  recce: {
    foundation: ["briefing", "road", "situation"],
    operations: ["road", "discovery", "situation"],
    pressure: ["discovery", "situation", "professional"],
    closeout: ["professional", "discovery", "briefing"],
  },
  silviculture: {
    foundation: ["briefing", "situation", "professional"],
    operations: ["discovery", "situation", "road"],
    pressure: ["discovery", "professional", "situation"],
    closeout: ["professional", "discovery", "briefing"],
  },
};

const ASSIGNMENT_RESPONSE_PROFILES = {
  briefing: [
    {
      stance: "cautious",
      label: "Ground-truth the situation",
      outcome: "You slow down long enough to verify the live condition before it compounds into a bigger file problem.",
      effects: { progress: 0, compliance: 3, relationships: 2 },
    },
    {
      stance: "balanced",
      label: "Balance around it",
      outcome: "You adapt the work around the signal without surrendering the season outright.",
      effects: { progress: 2, compliance: 1, forestHealth: 1 },
    },
    {
      stance: "aggressive",
      label: "Push the original plan",
      outcome: "You hold the original line and bank the momentum, accepting that the exposure may come back later.",
      effects: { progress: 4, compliance: -3, relationships: -2 },
    },
  ],
  process: [
    {
      stance: "cautious",
      label: "Rebuild the file properly",
      outcome: "You rebuild the file from first principles and reduce the odds that the record falls apart under review.",
      effects: { progress: -1, compliance: 6, relationships: 2, budget: -1 },
    },
    {
      stance: "balanced",
      label: "Patch the key gap",
      outcome: "You repair the weakest part of the package and keep the queue moving with a more defensible record.",
      effects: { progress: 2, compliance: 3, relationships: 1 },
    },
    {
      stance: "aggressive",
      label: "Push the package through",
      outcome: "You preserve momentum and hope the weak spots do not become next season's audit problem.",
      effects: { progress: 4, compliance: -3, relationships: -3 },
    },
  ],
  planning: [
    {
      stance: "cautious",
      label: "Redesign around the constraint",
      outcome: "You reshape the work to fit the constraint instead of treating it like a memo item.",
      effects: { progress: -1, forestHealth: 5, compliance: 3, budget: -1 },
    },
    {
      stance: "balanced",
      label: "Phase the work carefully",
      outcome: "You sequence the work more carefully and keep enough flexibility to adjust later.",
      effects: { progress: 2, forestHealth: 2, compliance: 2 },
    },
    {
      stance: "aggressive",
      label: "Hold the original line",
      outcome: "You protect the original harvest logic and trust that mitigation can absorb the rough edges.",
      effects: { progress: 4, forestHealth: -3, compliance: -3, relationships: -2 },
    },
  ],
  road: [
    {
      stance: "cautious",
      label: "Repair and document now",
      outcome: "You spend the time to stabilize the access story before field reality outruns the paperwork.",
      effects: { progress: 0, compliance: 5, budget: -2 },
    },
    {
      stance: "balanced",
      label: "Reroute and sequence around it",
      outcome: "You keep the season alive by changing the sequence instead of forcing a brittle access plan.",
      effects: { progress: 1, compliance: 2, forestHealth: 1 },
    },
    {
      stance: "aggressive",
      label: "Run the access window hard",
      outcome: "You take the short access window and accept the higher chance of downstream scrutiny.",
      effects: { progress: 4, compliance: -3, budget: -1, forestHealth: -1 },
    },
  ],
  discovery: [
    {
      stance: "cautious",
      label: "Stop, flag, and report",
      outcome: "You elevate the finding early and keep the later file cleaner, even if the schedule slips.",
      effects: { progress: -1, compliance: 5, relationships: 3 },
    },
    {
      stance: "balanced",
      label: "Verify before redirecting",
      outcome: "You verify the finding fast enough to keep moving without fully ignoring what the ground is telling you.",
      effects: { progress: 1, compliance: 2 },
    },
    {
      stance: "aggressive",
      label: "Work around it quietly",
      outcome: "You keep the crews moving and hope the field signal does not come back as a louder problem next round.",
      effects: { progress: 3, compliance: -3, relationships: -3 },
    },
  ],
  situation: [
    {
      stance: "cautious",
      label: "Adapt the schedule",
      outcome: "You accept the season on its own terms and reshape the schedule before the constraint turns into damage.",
      effects: { progress: 0, compliance: 3, relationships: 1, budget: -1 },
    },
    {
      stance: "balanced",
      label: "Add buffers and keep moving",
      outcome: "You add just enough buffer to stay operational without pretending the constraint is gone.",
      effects: { progress: 2, compliance: 1 },
    },
    {
      stance: "aggressive",
      label: "Push through the window",
      outcome: "You chase the work window hard and rely on later cleanup to absorb the strain.",
      effects: { progress: 4, compliance: -3, forestHealth: -2, relationships: -1 },
    },
  ],
  professional: [
    {
      stance: "cautious",
      label: "Clear the admin burden now",
      outcome: "You spend the season clearing the professional burden before it turns into a live practice problem.",
      effects: { progress: 0, compliance: 5 },
    },
    {
      stance: "balanced",
      label: "Patch only the hot spots",
      outcome: "You clean the most exposed parts of the practice load and keep enough momentum to avoid a stall.",
      effects: { progress: 1, compliance: 2 },
    },
    {
      stance: "aggressive",
      label: "Defer and keep producing",
      outcome: "You leave the admin debt in place and squeeze one more productive window out of the season.",
      effects: { progress: 3, compliance: -3 },
    },
  ],
};

const SOURCE_LABELS = {
  briefing: "Role-Area Briefing",
  process: "Process Hook",
  planning: "Planning Snapshot",
  road: "Road Intel",
  discovery: "Carry-Forward Discovery",
  situation: "Area Situation",
  professional: "Professional Practice",
  "legacy-task": "Legacy Role Task",
};

const ROLE_FAMILY_TITLES = {
  planner: {
    briefing: "Landscape Briefing",
    process: "File Readiness",
    planning: "Planning Snapshot",
    road: "Access Constraint",
    discovery: "Carry-Forward Finding",
    situation: "Area Constraint",
    professional: "Practice Burden",
  },
  permitter: {
    briefing: "Referral Briefing",
    process: "Submission Blocker",
    planning: "Permit Snapshot",
    road: "Access Authority Gap",
    discovery: "Carry-Forward Finding",
    situation: "Area Constraint",
    professional: "Practice Burden",
  },
  recce: {
    briefing: "Field Briefing",
    process: "File Readiness",
    planning: "Ground Signal",
    road: "Access Constraint",
    discovery: "Carry-Forward Finding",
    situation: "Area Constraint",
    professional: "Practice Burden",
  },
  silviculture: {
    briefing: "Operations Briefing",
    process: "File Readiness",
    planning: "Stand Signal",
    road: "Access Constraint",
    discovery: "Carry-Forward Finding",
    situation: "Area Constraint",
    professional: "Practice Burden",
  },
};

const DISCOVERY_FLAG_MAP = {
  access_rehab: { auditTriggered: true, regulatoryScrutiny: true },
  winter_access: { auditTriggered: true },
  heli_access: { auditTriggered: true },
  watershed_watch: { environmentalAudit: true },
  cultural_hold: { culturalTension: true },
  community_visibility: { regulatoryScrutiny: true },
  smoke_pressure: { regulatoryScrutiny: true },
  regen_gap: { environmentalAudit: true },
};

// Paperwork chains are real processes with real stages; the generic "Patch
// only the hot spots" template read as nonsense on an AOA card. Each stage
// carries its own three labels (cautious / balanced / aggressive) and keeps
// the professional template's effects and side effects.
const CHAIN_STAGE_RESPONSES = {
  "fom-notice-cycle": {
    notice: [
      { label: "Post the FOM notice now and file proof of posting", outcome: "The notice goes up on time with the posting record saved, so the comment clock and the proof of it both exist." },
      { label: "Post the notice and tidy the comment log as it fills", outcome: "The notice is up and the log gets cleaned as comments arrive; a few early ones are filed loosely." },
      { label: "Hold the notice until the map is final", outcome: "You wait for a perfect map. The comment period starts late and the permit sequence behind it slides." },
    ],
    response: [
      { label: "Answer every comment in writing and reconcile the map", outcome: "Each comment gets a written response and the final map matches what was noticed. It takes the week." },
      { label: "Answer the substantive comments and log the rest", outcome: "The comments that could change the map get real answers; the rest are logged with a line each." },
      { label: "Send the map forward and answer comments later", outcome: "The map moves, but the response record is thin and the district will ask where it is." },
    ],
    submission: [
      { label: "Cross-check every CP against the final FOM before it leaves", outcome: "Every block in the package matches the published map. Nothing comes back for consistency." },
      { label: "Spot-check the blocks that changed since the notice", outcome: "The blocks that moved get checked; the ones you assume did not move are the risk." },
      { label: "Send the CP package on the notice-stage map", outcome: "The package goes out against the old map, and any block that shifted is now a consistency problem." },
    ],
  },
  "road-authority-chain": {
    "road-permit": [
      { label: "Build the full RP package with crossing designs attached", outcome: "The road permit application carries the crossing designs and the professional sign-offs. Slow, but it will not bounce." },
      { label: "File the RP with the crossings flagged for follow-up", outcome: "The RP moves with the crossings noted as pending; the district accepts it with a follow-up condition." },
      { label: "File a bare RP and sort the crossings when the trucks show up", outcome: "The permit moves fast and the first crossing becomes a problem the day the trucks arrive." },
    ],
    rup: [
      { label: "Assign the road use permit and maintenance lead in writing", outcome: "The RUP is issued, the maintenance lead is named, and the primary user knows who is paying for what." },
      { label: "Name a maintenance lead and leave the RUP with the primary user", outcome: "Maintenance is covered informally; the RUP question waits for the primary user to raise it." },
      { label: "Haul on the primary user's road and settle the RUP later", outcome: "Trucks roll without a road use permit in place, and the first complaint goes straight to the district." },
    ],
    closeout: [
      { label: "Close every road notice and the maintenance record", outcome: "The notices are closed and the maintenance record is complete; the file can be handed to anyone." },
      { label: "Close the open notices and leave the record for winter", outcome: "The notices are closed; the maintenance record gets finished when the crews are in." },
      { label: "Let the notices lapse and keep hauling", outcome: "Nothing is closed. The open notices are the first thing a C&E road inspection will ask about." },
    ],
  },
  "archaeology-ladder": {
    "desktop-screen": [
      { label: "Run the AOA screen before layout starts", outcome: "The archaeological overview screen is done before anyone flags a line, so the high-potential ground is known up front." },
      { label: "Screen the high-potential blocks first", outcome: "The blocks that look risky get screened first; the rest wait until the crew is nearby." },
      { label: "Skip the screen and lay out on the old map", outcome: "Layout starts on last cycle's map. If a crew finds a CMT, the Heritage Conservation Act problem is already yours." },
    ],
    "field-review": [
      { label: "Book the PFR walkover now", outcome: "A preliminary field reconnaissance is booked with the Nation's crew, and the layout waits for the results." },
      { label: "Redesign the footprint off the high-potential ground", outcome: "You move the block and road off the flagged ground and document the avoidance." },
      { label: "Treat the AOA as clearance and keep laying out", outcome: "The overview is not clearance. The crew keeps flagging through ground nobody has walked." },
    ],
    "aia-context": [
      { label: "Commission the AIA and hold the block", outcome: "An archaeological impact assessment goes in under permit and the block waits for its findings." },
      { label: "Redesign around the site and document the avoidance", outcome: "The site is buffered out of the block and the rationale is written down; the volume is smaller." },
      { label: "Push the site alteration permit and keep the schedule", outcome: "You apply to alter the site so the schedule holds. The Nation notices the application before you tell them." },
    ],
  },
  "support-site-occupancy": {
    "footprint-triage": [
      { label: "Map every camp, helipad and dump footprint now", outcome: "Each support site is mapped and matched to an authority, so nothing is occupying Crown land by assumption." },
      { label: "Map the camp and helipad and defer the small sites", outcome: "The big footprints are covered; the small landings and fuel caches wait for the next pass." },
      { label: "Assume the CP covers the camp and carry on", outcome: "The cutting permit does not cover a camp. The occupancy is unauthorized until someone notices." },
    ],
    "sup-package": [
      { label: "Build the special-use permit package with the site plans", outcome: "The special-use permit application carries site plans and the rehab commitments. It goes in complete." },
      { label: "File the special-use permit for the camp and leave the helipad", outcome: "The camp is covered; the helipad is still an open question if anyone asks." },
      { label: "Occupy the site and file the special-use permit after", outcome: "The camp goes in first and the permit follows, which is the wrong order and the district knows it." },
    ],
    "occupancy-closeout": [
      { label: "Close the occupancy record with rehab photos", outcome: "The sites are rehabilitated, photographed, and the occupancy record is closed." },
      { label: "Close the camp record and leave the helipad", outcome: "The camp is closed out; the helipad stays open on paper until next season." },
      { label: "Leave the sites open and demob", outcome: "The crew leaves and the sites stay open on the record, which is where a C&E inspection will find them." },
    ],
  },
};

// In-world fallback copy for areas whose planning-block snapshot has not been
// generated yet. The data-layer placeholder must never reach the player.
const AREA_FALLBACK_BLOCK_SUMMARIES = {
  "vancouver-island-coast": "Candidate block on Douglas-fir/hemlock benches above the Alberni Inlet; windfirm edges, a fish-stream crossing and roadside visuals are still unresolved.",
  "kootenay-wetbelt": "Candidate block on cedar–hemlock side slopes above a community watershed near Nelson; road prism stability and intake protection are still unresolved.",
  "okanagan-shuswap-drybelt": "Candidate block on Douglas-fir/pine benches above Vernon; access, visuals and a water-sensitive draw are still unresolved.",
};
const PLACEHOLDER_BLOCK_SUMMARY = /fallback regional block sample/i;

function describePlanningBlock(block, state) {
  const summary = String(block?.summary || "");
  if (summary && !PLACEHOLDER_BLOCK_SUMMARY.test(summary)) {
    return summary;
  }
  const areaId = state?.area?.id || state?.areaId;
  return AREA_FALLBACK_BLOCK_SUMMARIES[areaId]
    || `Candidate block in the ${state?.area?.name || "operating area"} snapshot; access, values and timing windows are still unresolved.`;
}

function capitaliseSentence(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

function familyTitle(roleId, family, fallback = null) {
  return ROLE_FAMILY_TITLES[roleId]?.[family] || fallback || SOURCE_LABELS[family] || "Seasonal Assignment";
}

function sanitizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function buildAssignmentContext(context, stakes) {
  return {
    operation: context?.operationState?.operation,
    objective: context?.operationState?.objective,
    stakes,
  };
}

function buildPressureSummary(state) {
  const metrics = state?.metrics || {};
  return [
    `Progress ${Math.round(Number(metrics.progress || 0))}%`,
    `Compliance ${Math.round(Number(metrics.compliance || 0))}%`,
    `Relationships ${Math.round(Number(metrics.relationships || 0))}%`,
    `Budget ${Math.round(Number(metrics.budget || 0))}%`,
  ].join(" • ");
}

function findExistingFailureIssueId(failureModes = []) {
  return (failureModes || []).find((failure) => EXISTING_ISSUE_IDS.has(failure?.id))?.id || null;
}

function findChainFailureIssueId(chain) {
  for (const hookId of chain?.hookIds || []) {
    const hook = getMinistryProcessHook(hookId);
    const failureId = findExistingFailureIssueId(hook?.failureModes);
    if (failureId) {
      return failureId;
    }
  }
  return null;
}

function buildRoadAggressiveFlags(candidate) {
  const flags = {};
  if (Number(candidate?.roadHydrologyPressure || 0) >= 2) {
    flags.environmentalAudit = true;
  }
  if (Number(candidate?.roadEngineeringPressure || 0) >= 2) {
    flags.auditTriggered = true;
  }
  if (Number(candidate?.roadTimingPressure || 0) >= 3) {
    flags.regulatoryScrutiny = true;
  }
  return flags;
}

function buildDiscoveryAggressiveFlags(tagId) {
  return { ...(DISCOVERY_FLAG_MAP[tagId] || {}) };
}

function buildAssignmentOptions(candidate) {
  if (candidate.sourceFamily === "legacy-task") {
    return (candidate.task?.options || []).map((option) => ({
      ...option,
    }));
  }

  // If the candidate (e.g. an area situation) supplies its own authored options,
  // use those instead of the generic family template so the choice language
  // matches the specific scenario.
  if (Array.isArray(candidate.options) && candidate.options.length) {
    return candidate.options.map((option) => ({
      ...option,
      stance: option.stance || "balanced",
    }));
  }

  const profile = ASSIGNMENT_RESPONSE_PROFILES[candidate.sourceFamily] || [];
  return profile.map((template) => {
    const stageResponse = candidate.chainStageResponses?.find?.((entry, index) => index === profile.indexOf(template))
      || null;
    const option = {
      label: stageResponse?.label || template.label,
      outcome: stageResponse?.outcome || template.outcome,
      effects: { ...template.effects },
      // Carry the authored stance forward so chosen decisions can feed the
      // management-style meter without re-deriving intent from the effects.
      stance: template.stance,
    };

    if (
      candidate.sourceFamily === "process"
      && (template.stance === "cautious" || template.stance === "balanced")
      && candidate.paperworkChainId
    ) {
      option.assignmentSideEffects = {
        ...(option.assignmentSideEffects || {}),
        advancePaperworkChainId: candidate.paperworkChainId,
      };
    }

    if (candidate.sourceFamily === "professional" && template.stance === "cautious") {
      option.assignmentSideEffects = {
        ...(option.assignmentSideEffects || {}),
        professionalShift: { paperworkLoad: -8, auditExposure: -6 },
      };
      if (candidate.paperworkChainId) {
        option.assignmentSideEffects.advancePaperworkChainId = candidate.paperworkChainId;
      }
    }

    if (
      (candidate.sourceFamily === "process" || candidate.sourceFamily === "professional")
      && template.stance === "aggressive"
      && candidate.failureIssueId
    ) {
      option.scheduleIssues = { id: candidate.failureIssueId, delay: 1 };
    }

    if ((candidate.sourceFamily === "road" || candidate.sourceFamily === "discovery") && template.stance === "aggressive") {
      option.setFlags = { ...(candidate.aggressiveFlags || {}) };
    }

    return option;
  });
}

function finalizeCandidate(candidate, state = null) {
  const sourceFamily = candidate.sourceFamily;
  const sourceKey = candidate.sourceKey;
  return normalizeSeasonalCard({
    id: candidate.id || `${sourceFamily}:${sourceKey}`,
    assignmentKey: `${sourceFamily}:${sourceKey}`,
    score: Number(candidate.score || 0),
    title: sanitizeText(candidate.title, SOURCE_LABELS[sourceFamily] || "Seasonal Assignment"),
    description: sanitizeText(candidate.description, "A seasonal assignment requires a decision."),
    flavor: sanitizeText(candidate.flavor),
    sourceFamily,
    sourceKey,
    sourceLabel: sanitizeText(candidate.sourceLabel, SOURCE_LABELS[sourceFamily]),
    whyNow: sanitizeText(candidate.whyNow),
    options: buildAssignmentOptions(candidate),
    context: candidate.context || null,
    riskClass: candidate.riskClass || null,
  }, state, "assignment");
}

function buildBriefingCandidates(state, context) {
  const finds = context?.briefing?.likelyFinds || [];
  return finds.map((finding, index) => finalizeCandidate({
    sourceFamily: "briefing",
    sourceKey: `finding:${index}`,
    title: familyTitle(context.roleId, "briefing"),
    description: `Field intel: ${capitaliseSentence(sanitizeText(finding))}`,
    // The zone summary is standing area context — it now lives in the
    // Dashboard "Area" tab, so the per-turn card keeps just its finding.
    sourceLabel: SOURCE_LABELS.briefing,
    whyNow: sanitizeText(
      context?.briefing?.seasonalSignals?.[Math.max(0, context.round - 1)]
        || `Seasonal signal: ${context.season} conditions are reshaping the work on the ground.`,
    ),
    context: buildAssignmentContext(
      context,
      "This is the local ground truth most likely to change how you should work this season.",
    ),
    score: Math.max(1, 100 - index * 10),
  }, state));
}

function buildProcessCandidates(state, context) {
  const candidates = [];
  const seenKeys = new Set();

  for (const progress of context?.paperworkProgress || []) {
    if (!progress?.stage || progress.completed) {
      continue;
    }
    const stageScore = Number(progress.stage.paperworkRelief || 0) + Number(progress.stage.auditRelief || 0);
    const key = `chain:${progress.chain.id}:${progress.stage.id}`;
    seenKeys.add(key);
    candidates.push(finalizeCandidate({
      sourceFamily: "process",
      sourceKey: key,
      title: progress.chain.title,
      description: sanitizeText(progress.stage.description),
      flavor: `Paperwork chain • ${progress.stage.label}`,
      sourceLabel: sanitizeText(progress.chain.sourceLabel, SOURCE_LABELS.process),
      whyNow: `Open chain with ${progress.remainingStages} stage(s) remaining. ${buildPressureSummary(state)}`,
      context: buildAssignmentContext(
        context,
        "If this chain slips, the file gets harder to defend and later work starts stacking on bad assumptions.",
      ),
      paperworkChainId: progress.chain.id,
      failureIssueId: findChainFailureIssueId(progress.chain),
      score: 50 + stageScore,
    }, state));
  }

  for (const hook of context?.professionalContext?.paperwork || []) {
    const key = `hook:${hook.id}`;
    if (seenKeys.has(key)) {
      continue;
    }
    candidates.push(finalizeCandidate({
      sourceFamily: "process",
      sourceKey: key,
      title: hook.title,
      description: sanitizeText(hook.summary),
      flavor: `Process hook • ${hook.category}`,
      sourceLabel: sanitizeText(hook.sourceLabel, SOURCE_LABELS.process),
      whyNow: sanitizeText(hook.trigger, `Current process load is rising. ${buildPressureSummary(state)}`),
      context: buildAssignmentContext(
        context,
        "The next submission or amendment will inherit this gap if you do not close it now.",
      ),
      failureIssueId: findExistingFailureIssueId(hook.failureModes),
      score: 35 + Number((hook.failureModes || []).length || 0) * 4,
    }, state));
  }

  for (const breach of context?.professionalContext?.breaches || []) {
    const key = `breach:${breach.id}`;
    if (seenKeys.has(key)) {
      continue;
    }
    candidates.push(finalizeCandidate({
      sourceFamily: "process",
      sourceKey: key,
      title: breach.title,
      description: sanitizeText(breach.summary),
      flavor: `Failure mode • ${breach.processHookTitle || "Regulatory process"}`,
      sourceLabel: sanitizeText(breach.sourceLabel, SOURCE_LABELS.process),
      whyNow: `This stays live while paperwork backlog and scrutiny remain elevated. ${buildPressureSummary(state)}`,
      context: buildAssignmentContext(
        context,
        "A known process failure is now close enough to the live file that it can no longer stay theoretical.",
      ),
      failureIssueId: EXISTING_ISSUE_IDS.has(breach.id) ? breach.id : null,
      score: 28,
    }, state));
  }

  return candidates;
}

function buildPlanningCandidates(state, context) {
  const snapshot = context?.planningSnapshot;
  if (!snapshot) {
    return [];
  }

  const blockCandidates = (snapshot.sampleBlocks || []).map((block, index) => finalizeCandidate({
    sourceFamily: "planning",
    sourceKey: `block:${block.id}`,
    title: `${familyTitle(context.roleId, "planning")}: ${block.label}`,
    description: sanitizeText(
      [describePlanningBlock(block, state), block.species ? `Species ${block.species}` : "", block.district].filter(Boolean).join(" • "),
      `${block.label} is surfacing as one of the most material planning choices in the current snapshot.`,
    ),
    flavor: sanitizeText(snapshot.generatedOn ? `Snapshot generated ${snapshot.generatedOn}` : "Current planning snapshot"),
    sourceLabel: SOURCE_LABELS.planning,
    whyNow: sanitizeText(
      `Current snapshot shows ${snapshot.blockCount} candidate block(s); dominant triage focus is ${snapshot.recommendedTriageLabel || "mixed constraints"}.`,
    ),
    context: buildAssignmentContext(
      context,
      "The block sequence you choose here will shape what the rest of the team spends the year defending.",
    ),
    score: 60 - index * 6,
  }, state));

  if (blockCandidates.length) {
    return blockCandidates;
  }

  return [
    finalizeCandidate({
      sourceFamily: "planning",
      sourceKey: `snapshot:${snapshot.recommendedTriageKey || "general"}`,
      title: familyTitle(context.roleId, "planning"),
      description: sanitizeText(snapshot.summary, "The planning snapshot is tightening the next block sequence."),
      flavor: sanitizeText(snapshot.generatedOn ? `Snapshot generated ${snapshot.generatedOn}` : "Current planning snapshot"),
      sourceLabel: SOURCE_LABELS.planning,
      whyNow: sanitizeText(`Current snapshot shows ${snapshot.blockCount} candidate block(s).`),
      context: buildAssignmentContext(
        context,
        "This planning snapshot is setting the next round of real field and submission work.",
      ),
      score: 42,
    }, state),
  ];
}

function buildRoadCandidates(state, context) {
  const roleId = context?.roleId;
  const preferredContext = roleId === "permitter"
    ? context?.permittingRoadContext
    : context?.planningRoadContext?.hasData
      ? context.planningRoadContext
      : context?.permittingRoadContext;
  if (!preferredContext?.hasData) {
    return [];
  }

  return [
    finalizeCandidate({
      sourceFamily: "road",
      sourceKey: roleId === "permitter"
        ? `permit-road:${preferredContext.dominantProfileId || "summary"}`
        : `planning-road:${preferredContext.source || "summary"}`,
      title: familyTitle(roleId, "road"),
      description: sanitizeText(preferredContext.note || preferredContext.summary),
      flavor: sanitizeText(preferredContext.summary),
      sourceLabel: SOURCE_LABELS.road,
      whyNow: `Road engineering ${Number(preferredContext.engineeringPressure || preferredContext.engineering || 0)} • hydrology ${Number(preferredContext.hydrologyPressure || preferredContext.hydrology || 0)} • timing ${Number(preferredContext.timingPressure || preferredContext.timing || 0)}.`,
      context: buildAssignmentContext(
        context,
        "Access credibility is now part of the decision, not just a detail to clean up later.",
      ),
      roadEngineeringPressure: preferredContext.engineeringPressure || preferredContext.engineering,
      roadHydrologyPressure: preferredContext.hydrologyPressure || preferredContext.hydrology,
      roadTimingPressure: preferredContext.timingPressure || preferredContext.timing,
      aggressiveFlags: buildRoadAggressiveFlags({
        roadEngineeringPressure: preferredContext.engineeringPressure || preferredContext.engineering,
        roadHydrologyPressure: preferredContext.hydrologyPressure || preferredContext.hydrology,
        roadTimingPressure: preferredContext.timingPressure || preferredContext.timing,
      }),
      score: 36 + Number(preferredContext.reviewDays || preferredContext.approvalPenalty || 0),
    }, state),
  ];
}

function buildDiscoveryCandidates(state, context) {
  return (context?.discoveryTags || []).map((tag, index) => finalizeCandidate({
    sourceFamily: "discovery",
    sourceKey: `tag:${tag.id}`,
    title: `${familyTitle(context.roleId, "discovery")}: ${tag.label}`,
    description: sanitizeText(tag.definition?.roleNotes?.[context.roleId] || tag.note || tag.summary),
    flavor: `Carry-forward severity ${tag.severity} • seen ${tag.count} time(s)`,
    sourceLabel: SOURCE_LABELS.discovery,
    whyNow: `This finding is still live from earlier work and remains one of the strongest carry-forward signals in the file.`,
    context: buildAssignmentContext(
      context,
      "Ignoring a carry-forward finding now usually turns a known issue into a harder stop later.",
    ),
    aggressiveFlags: buildDiscoveryAggressiveFlags(tag.id),
    score: 50 + Number(tag.severity || 0) * 6 - index,
  }, state));
}

function buildSituationCandidates(state, context) {
  if (!context?.areaSituation) {
    return [];
  }

  return [
    finalizeCandidate({
      sourceFamily: "situation",
      sourceKey: `situation:${context.areaSituation.id}`,
      title: context.areaSituation.title,
      description: sanitizeText(context.areaSituation.summary),
      flavor: sanitizeText(state?.area?.zoneSummary),
      sourceLabel: SOURCE_LABELS.situation,
      whyNow: `This situation is active in ${context.season} and is weighting the season toward ${Object.keys(context?.areaSituationMultipliers?.desk?.typeMultipliers || {}).slice(0, 2).join(", ") || "more difficult operating"} conditions.`,
      context: buildAssignmentContext(
        context,
        "This seasonal constraint is already changing what safe, legal, or credible progress looks like.",
      ),
      options: context.areaSituation.options,
      score: 40,
    }, state),
  ];
}

function buildProfessionalCandidates(state, context) {
  const candidates = [];
  const professional = state?.professional || {};
  const metrics = [
    {
      metric: "paperworkLoad",
      value: Number(professional.paperworkLoad || 0),
      title: "Paperwork load crest",
      description: "Administrative drag is starting to crowd out clean closure on the file.",
    },
    {
      metric: "auditExposure",
      value: Number(professional.auditExposure || 0),
      title: "Audit exposure rise",
      description: "The record is trending toward deeper scrutiny unless the practice burden gets cleaned up.",
    },
    {
      metric: "competenceRisk",
      value: Number(professional.competenceRisk || 0),
      title: "Practice-area documentation risk",
      description: "Professional-risk indicators are high enough that your documented scope of practice and work samples matter this season.",
    },
  ].sort((a, b) => b.value - a.value);

  const strongest = metrics[0];
  if (strongest) {
    candidates.push(finalizeCandidate({
      sourceFamily: "professional",
      sourceKey: `burden:${strongest.metric}`,
      title: strongest.title,
      description: strongest.description,
      flavor: sanitizeText(professional.areaBurdenLabel),
      sourceLabel: SOURCE_LABELS.professional,
      whyNow: `Paperwork ${Math.round(professional.paperworkLoad || 0)}% • audit ${Math.round(professional.auditExposure || 0)}% • competence ${Math.round(professional.competenceRisk || 0)}%.`,
      context: buildAssignmentContext(
        context,
        "If the practice record slips much further, the season starts being judged through the audit lens instead of the work itself.",
      ),
      failureIssueId: strongest.metric === "paperworkLoad" ? "budget-freeze" : "fpbc-competence-audit",
      score: strongest.value,
    }, state));
  }

  for (const progress of context?.paperworkProgress || []) {
    if (!progress?.stage || progress.completed) {
      continue;
    }
    candidates.push(finalizeCandidate({
      sourceFamily: "professional",
      sourceKey: `chain:${progress.chain.id}`,
      title: progress.chain.title,
      description: sanitizeText(progress.stage.description),
      flavor: `Open chain • ${progress.stage.label}`,
      sourceLabel: sanitizeText(progress.chain.sourceLabel, SOURCE_LABELS.professional),
      whyNow: `This chain is still open heading into ${context.season}.`,
      context: buildAssignmentContext(
        context,
        "An unfinished professional chain is now carrying into the active season and can trigger avoidable scrutiny.",
      ),
      paperworkChainId: progress.chain.id,
      chainStageResponses: CHAIN_STAGE_RESPONSES[progress.chain.id]?.[progress.stage.id] || null,
      failureIssueId: findChainFailureIssueId(progress.chain),
      score: 30 + Number(progress.remainingStages || 0),
    }, state));
  }

  return candidates;
}

function getSeenAssignmentKeys(state) {
  return new Set((state?.assignmentHistory || []).map((entry) => `${entry.sourceFamily}:${entry.sourceKey}`));
}

function getLastAssignmentEntry(state) {
  const history = state?.assignmentHistory || [];
  return history.length ? history[history.length - 1] : null;
}

function isEligibleDiscoveryCandidate(state, context, candidate) {
  const history = state?.assignmentHistory || [];
  const last = getLastAssignmentEntry(state);
  if (last?.sourceFamily !== "discovery" || last.sourceKey !== candidate.sourceKey) {
    return true;
  }

  const discoveryCandidates = buildDiscoveryCandidates(state, context);
  if (discoveryCandidates.length <= 1) {
    return candidate.sourceKey === discoveryCandidates[0]?.sourceKey;
  }

  const topSeverity = Math.max(...(context?.discoveryTags || []).map((tag) => Number(tag.severity || 0)));
  const currentTag = (context?.discoveryTags || []).find((tag) => `tag:${tag.id}` === candidate.sourceKey);
  return Number(currentTag?.severity || 0) >= topSeverity && discoveryCandidates.length <= 1;
}

function filterEligibleCandidates(state, context, candidates) {
  const seen = getSeenAssignmentKeys(state);
  return candidates.filter((candidate) => {
    if (!candidate) {
      return false;
    }
    if (seen.has(candidate.assignmentKey)) {
      return false;
    }
    if (candidate.sourceFamily === "discovery" && !isEligibleDiscoveryCandidate(state, context, candidate)) {
      return false;
    }
    return true;
  });
}

function familyCandidates(state, context, family) {
  switch (family) {
    case "briefing":
      return buildBriefingCandidates(state, context);
    case "process":
      return buildProcessCandidates(state, context);
    case "planning":
      return buildPlanningCandidates(state, context);
    case "road":
      return buildRoadCandidates(state, context);
    case "discovery":
      return buildDiscoveryCandidates(state, context);
    case "situation":
      return buildSituationCandidates(state, context);
    case "professional":
      return buildProfessionalCandidates(state, context);
    default:
      return [];
  }
}

export function buildAssignmentCandidates(state, context) {
  const families = new Set([
    "briefing",
    "process",
    "planning",
    "road",
    "discovery",
    "situation",
    "professional",
  ]);

  return Array.from(families).flatMap((family) => familyCandidates(state, context, family));
}

export function buildLegacyTaskFallback(state, context) {
  const history = state?.assignmentHistory || [];
  const legacyCount = history.filter((entry) => entry.sourceFamily === "legacy-task").length;
  if (legacyCount >= 1) {
    return null;
  }

  const seenTaskIds = new Set(
    history.filter((entry) => entry.sourceFamily === "legacy-task").map((entry) => entry.sourceKey.replace(/^task:/, "")),
  );

  const task = (state?.role?.tasks || []).find((entry) => !seenTaskIds.has(entry.id));
  if (!task) {
    return null;
  }

  return finalizeCandidate({
    sourceFamily: "legacy-task",
    sourceKey: `task:${task.id}`,
    title: task.title,
    description: sanitizeText(task.description || task.prompt),
    flavor: "Fallback assignment • no source-backed candidate was available this season.",
    sourceLabel: SOURCE_LABELS["legacy-task"],
    whyNow: "No higher-priority source-backed assignment was available, so the role fallback card was used.",
    task,
  }, state);
}

export function drawSeasonalAssignment(state, context, rng = Math.random) {
  const priorities = ROLE_ASSIGNMENT_PRIORITIES[context?.roleId]?.[context?.theme] || [];

  for (const family of priorities) {
    const candidates = filterEligibleCandidates(state, context, familyCandidates(state, context, family))
      .sort((a, b) => {
        const scoreDelta = Number(b.score || 0) - Number(a.score || 0);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }
        return String(a.sourceKey).localeCompare(String(b.sourceKey));
      });

    if (candidates.length) {
      return candidates[0];
    }
  }

  return buildLegacyTaskFallback(state, context);
}

export function recordAssignmentSelection(state, assignment) {
  if (!state || !assignment) {
    return;
  }

  if (!Array.isArray(state.assignmentHistory)) {
    state.assignmentHistory = [];
  }
  if (!state.assignmentSourceUsage || typeof state.assignmentSourceUsage !== "object") {
    state.assignmentSourceUsage = {};
  }

  state.assignmentHistory.push({
    round: Number(state.round || 0),
    season: state.currentSeasonContext?.season || null,
    theme: state.currentSeasonContext?.theme || null,
    assignmentId: assignment.id,
    sourceFamily: assignment.sourceFamily,
    sourceKey: assignment.sourceKey,
    title: assignment.title,
  });

  const currentUsage = state.assignmentSourceUsage[assignment.sourceKey] || { count: 0, rounds: [] };
  currentUsage.count += 1;
  currentUsage.rounds = [...currentUsage.rounds, Number(state.round || 0)];
  state.assignmentSourceUsage[assignment.sourceKey] = currentUsage;

  if (state.currentSeasonContext) {
    state.currentSeasonContext.selectedAssignment = {
      id: assignment.id,
      sourceFamily: assignment.sourceFamily,
      sourceKey: assignment.sourceKey,
      sourceLabel: assignment.sourceLabel,
      title: assignment.title,
    };
  }
}
