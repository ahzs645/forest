#!/usr/bin/env node

// Seasonal content guardrails. Protects the engine from authored content that
// would quietly break it: malformed cards/options, unresolved scheduled-issue
// ids, missing stances on generated assignment options, banned terminology, and
// thin role/area coverage.
//
//   node scripts/lint-seasonal-content.mjs
//
// Exits non-zero when there are errors (warnings are advisory). Also exported as
// lintSeasonalContent() so the unit suite can gate on it.

import {
  FORESTER_ROLES,
  OPERATING_AREAS,
  ISSUE_LIBRARY,
  CHAINED_ISSUES,
  DESK_EVENTS,
  FIELD_EVENTS,
  ILLEGAL_ACTS,
} from "../js/data/index.js";
import { createInitialState, buildSeasonContext } from "../js/engine.js";
import { buildAssignmentCandidates } from "../js/engine/assignments.js";
import {
  getSeasonalPlayableRoles,
  validateSeasonalCardContract,
  listTerminologyGuardrailViolations,
} from "../js/engine/seasonalContract.js";

const METRIC_KEYS = ["progress", "forestHealth", "relationships", "compliance"];
const MAX_METRIC_MAGNITUDE = 15; // budget is excluded (authored in raw dollars)
const MIN_ROLE_ISSUES = 3;

function optionHasEffect(option) {
  if (option?.risk) return true;
  const effects = option?.effects;
  return Boolean(effects && Object.values(effects).some((value) => Number.isFinite(Number(value)) && Number(value) !== 0));
}

export function lintSeasonalContent() {
  const errors = [];
  const warnings = [];
  const err = (where, message) => errors.push(`${where}: ${message}`);
  const warn = (where, message) => warnings.push(`${where}: ${message}`);

  const allIssues = [...ISSUE_LIBRARY, ...CHAINED_ISSUES];
  const knownIssueIds = new Set(allIssues.map((issue) => issue?.id).filter(Boolean));
  const knownEventIds = new Set([...DESK_EVENTS, ...FIELD_EVENTS].map((event) => event?.id).filter(Boolean));

  // 1. Issue library schema + scheduled-issue id resolution + magnitudes.
  const seenIssueIds = new Set();
  for (const issue of allIssues) {
    const where = `issue:${issue?.id || "<missing id>"}`;
    if (!issue?.id) err(where, "missing id");
    else if (seenIssueIds.has(issue.id)) err(where, "duplicate id");
    else seenIssueIds.add(issue.id);
    if (!issue?.title) err(where, "missing title");
    if (!issue?.description) err(where, "missing description");
    if (!Array.isArray(issue?.roles) || issue.roles.length === 0) err(where, "missing roles");
    const options = Array.isArray(issue?.options) ? issue.options : [];
    if (options.length < 2) err(where, `needs >= 2 options (has ${options.length})`);
    for (const [i, option] of options.entries()) {
      if (!option?.label) err(where, `option ${i} missing label`);
      if (!optionHasEffect(option)) err(where, `option ${i} has neither effects nor risk`);
      for (const metric of METRIC_KEYS) {
        const value = Number(option?.effects?.[metric]);
        if (Number.isFinite(value) && Math.abs(value) > MAX_METRIC_MAGNITUDE) {
          warn(where, `option ${i} ${metric} ${value} exceeds magnitude ${MAX_METRIC_MAGNITUDE}`);
        }
      }
      for (const scheduled of collectScheduledIssueIds(option)) {
        if (!knownIssueIds.has(scheduled)) err(where, `option ${i} schedules unknown issue "${scheduled}"`);
      }
    }
  }

  // 2. Operational events schema + scheduled-event id resolution.
  for (const event of [...DESK_EVENTS, ...FIELD_EVENTS]) {
    if (event?.expeditionOnly) continue;
    const where = `event:${event?.id || "<missing id>"}`;
    if (!event?.id) err(where, "missing id");
    if (!event?.title) err(where, "missing title");
    const options = Array.isArray(event?.options) ? event.options : [];
    if (options.length < 1) err(where, "needs >= 1 option");
    for (const [i, option] of options.entries()) {
      if (!option?.label) err(where, `option ${i} missing label`);
      if (option?.schedulesEvent && !knownEventIds.has(option.schedulesEvent)) {
        err(where, `option ${i} schedules unknown event "${option.schedulesEvent}"`);
      }
    }
  }

  // 3. Illegal acts (temptation source) minimal schema.
  for (const act of ILLEGAL_ACTS) {
    const where = `illegal-act:${act?.id || "<missing id>"}`;
    if (!act?.id) err(where, "missing id");
    if (!act?.title) err(where, "missing title");
  }

  // 4. Generated assignment cards: contract, stance coverage, terminology.
  for (const role of getSeasonalPlayableRoles(FORESTER_ROLES)) {
    for (let round = 1; round <= 4; round += 1) {
      let cards = [];
      try {
        const state = createInitialState({ companyName: "Lint", roleId: role.id, areaId: OPERATING_AREAS[0].id });
        state.round = round;
        const context = buildSeasonContext(state);
        state.currentSeasonContext = context;
        cards = buildAssignmentCandidates(state, context) || [];
      } catch (error) {
        err(`assignment:${role.id}:round${round}`, `threw ${error.message}`);
        continue;
      }
      for (const card of cards) {
        const where = `assignment:${role.id}:${card?.id || "?"}`;
        for (const violation of validateSeasonalCardContract(card)) err(where, violation);
        for (const violation of listTerminologyGuardrailViolations(card)) warn(where, violation);
        if (card?.sourceFamily && card.sourceFamily !== "legacy-task") {
          for (const [i, option] of (card.options || []).entries()) {
            if (!option?.stance) warn(where, `generated option ${i} ("${option?.label}") has no stance`);
          }
        }
      }
    }
  }

  // 5. Coverage: each seasonal role should have enough eligible issues.
  for (const role of getSeasonalPlayableRoles(FORESTER_ROLES)) {
    const count = allIssues.filter((issue) => Array.isArray(issue.roles) && issue.roles.includes(role.id)).length;
    if (count < MIN_ROLE_ISSUES) warn(`coverage:${role.id}`, `only ${count} eligible issues (< ${MIN_ROLE_ISSUES})`);
  }

  return { errors, warnings };
}

function collectScheduledIssueIds(option) {
  const ids = [];
  const specs = [];
  if (option?.scheduleIssues) specs.push(option.scheduleIssues);
  if (option?.risk?.failScheduleIssues) specs.push(option.risk.failScheduleIssues);
  if (option?.risk?.successScheduleIssues) specs.push(option.risk.successScheduleIssues);
  for (const spec of specs) {
    const entries = Array.isArray(spec) ? spec : [spec];
    for (const entry of entries) {
      if (entry?.id) ids.push(entry.id);
      for (const candidate of entry?.candidates || []) {
        if (candidate?.id) ids.push(candidate.id);
      }
    }
  }
  return ids;
}

function isMain() {
  return process.argv[1] && process.argv[1].endsWith("lint-seasonal-content.mjs");
}

if (isMain()) {
  const { errors, warnings } = lintSeasonalContent();
  for (const warning of warnings) console.log(`warning  ${warning}`);
  for (const error of errors) console.error(`error    ${error}`);
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exit(errors.length ? 1 : 0);
}
