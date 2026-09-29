#!/usr/bin/env node

// Seasonal content guardrails. Protects the engine from authored content that
// would quietly break it: malformed cards/options, unresolved scheduled-issue
// ids, missing stances on generated assignment options, banned terminology,
// thin role/area coverage, and issues or fallout targets that can never surface.
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
import { actFitsRole } from "../js/data/illegalActs.js";
import {
  SEASONS,
  adaptIllegalActTemptation,
  buildScheduledIssueTeaser,
  buildSeasonContext,
  createInitialState,
} from "../js/engine.js";
import { ASSIGNMENT_FLAG_PRODUCERS, buildAssignmentCandidates } from "../js/engine/assignments.js";
import { actMatchesSeasonalTemptationContext } from "../js/engine/content.js";
import { SEASON_CONTEXT_FLAGS } from "../js/engine/context.js";
import { ROUND_CONSEQUENCE_FLAGS } from "../js/engine/effects.js";
import {
  getSeasonalPlayableRoles,
  matchesAreaContext,
  matchesAreaIds,
  validateSeasonalCardContract,
  listTerminologyGuardrailViolations,
} from "../js/engine/seasonalContract.js";

const METRIC_KEYS = ["progress", "forestHealth", "relationships", "compliance"];
// A card that names a place must say which operating areas it belongs to,
// or it will be drawn in the wrong valley ("Smithers issues a turbidity
// advisory" while the player is in the Okanagan).
export const PLACE_NAME_PATTERN = /Smithers|Skeena|Stikine|Peace River|Highway 16|Lheidli|Tahltan|Dease|\bNass\b|\bSWB\b|\bBWBS\b|\bSBS\b|Okanagan|Kootenay|Alberni|Bulkley|Prince George|Fort St\. John|Fort Nelson|Terrace/;
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
  const knownAreaIds = new Set(OPERATING_AREAS.map((area) => area.id));
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
    const placeText = [issue?.title, issue?.description].filter(Boolean).join(" ");
    const hasAreaIds = Array.isArray(issue?.areaIds) && issue.areaIds.length > 0;
    if (PLACE_NAME_PATTERN.test(placeText) && !hasAreaIds) {
      err(where, `names a place (${placeText.match(PLACE_NAME_PATTERN)[0]}) without areaIds`);
    }
    for (const areaId of issue?.areaIds || []) {
      if (!knownAreaIds.has(areaId)) err(where, `unknown areaId "${areaId}"`);
    }
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

  // 6. Reachability: every issue can surface somewhere, and every scheduled or
  // caught-shortcut fallout target can land. Dead cards used to hide here
  // (areaTags no operating area carries, flags nothing sets) and a pending
  // issue whose candidates all fail the area gate is dropped silently.
  lintReachability(allIssues, err);

  // 7. Season-specific copy must be season-gated, or a -30C cold snap turns up
  // in summer and a heat dome in winter.
  for (const issue of allIssues) {
    const cue = seasonCue(issue);
    if (cue && !(issue.seasonLock && issue.seasonBias?.length)) {
      err(`issue:${issue.id}`, `text names a season-bound condition ("${cue}") but the card has no seasonLock`);
    }
  }
  for (const event of [...DESK_EVENTS, ...FIELD_EVENTS]) {
    if (event?.expeditionOnly) continue;
    const cue = seasonCue(event);
    const gated = (Array.isArray(event?.seasons) && event.seasons.length) || event?.preconditions?.seasons?.length;
    if (cue && !gated) {
      err(`event:${event.id}`, `text names a season-bound condition ("${cue}") but the event has no seasons`);
    }
  }

  return { errors, warnings };
}

// Conditions that only happen in one part of the year. Deliberately narrow:
// "winter road" or "last winter's permit" are fine in any season.
const SEASON_BOUND_PATTERN = /-\d{2} ?°?C|cold snap|whiteout|heat dome|record highs|heat wave|early snow|snowmelt|freshet|fire season/i;

function seasonCue(card) {
  const text = [card?.title, card?.description].filter(Boolean).join(" ");
  return text.match(SEASON_BOUND_PATTERN)?.[0] || null;
}

const SEASON_ROUNDS = [1, 2, 3, 4];
// Shortcut offers start in the second season (content.js calculateTemptationChance).
const TEMPTATION_ROUNDS = [2, 3, 4];

function issueFitsPlace(issue, roleId, area, round) {
  if (!issue?.roles?.includes(roleId)) return false;
  if (issue.seasonLock && issue.seasonBias?.length && !issue.seasonBias.includes(SEASONS[round - 1])) return false;
  if (!matchesAreaIds(issue, area.id)) return false;
  return !issue.areaTags?.length || matchesAreaContext(issue.areaTags, area.tags || []);
}

function issueFitsAnywhere(issue, roleIds) {
  return roleIds.some((roleId) => OPERATING_AREAS.some((area) => SEASON_ROUNDS.some((round) => issueFitsPlace(issue, roleId, area, round))));
}

function collectOptionFlags(option, into) {
  for (const flags of [option?.setFlags, option?.risk?.successFlags, option?.risk?.failFlags]) {
    for (const [flag, value] of Object.entries(flags || {})) {
      if (value) into.add(flag);
    }
  }
}

function lintReachability(allIssues, err) {
  const issueById = new Map(allIssues.map((issue) => [issue.id, issue]));
  const playableRoleIds = getSeasonalPlayableRoles(FORESTER_ROLES).map((role) => role.id);
  const knownAreaTags = new Set(OPERATING_AREAS.flatMap((area) => area.tags || []));

  // Flags something in seasonal play can actually set. Legacy role tasks are
  // left out on purpose: they only surface as a once-a-year fallback card, so
  // a chain that relies on them is dead in practice.
  const producedFlags = new Set([...ASSIGNMENT_FLAG_PRODUCERS, ...ROUND_CONSEQUENCE_FLAGS, ...SEASON_CONTEXT_FLAGS]);
  for (const issue of allIssues) {
    for (const option of issue.options || []) collectOptionFlags(option, producedFlags);
  }

  // Caught-shortcut fallout, built exactly as play builds it. Forced candidates
  // skip flag requirements but not the role/area/season gates.
  const forcedTargets = new Map();
  for (const act of ILLEGAL_ACTS) {
    if (act?.retired) continue;
    for (const roleId of playableRoleIds.filter((id) => actFitsRole(act, id))) {
      for (const area of OPERATING_AREAS) {
        for (const round of TEMPTATION_ROUNDS) {
          const state = createInitialState({ companyName: "Lint", roleId, areaId: area.id });
          state.round = round;
          if (!actMatchesSeasonalTemptationContext(act, state)) continue;
          const card = adaptIllegalActTemptation(act, state, () => 0.5);
          const risk = card.options.find((option) => option.risk)?.risk;
          collectOptionFlags({ risk: { failFlags: risk?.failFlags } }, producedFlags);
          const schedule = risk?.failScheduleIssues || [];
          for (const entry of schedule) {
            for (const candidate of entry.candidates || []) {
              if (!issueById.has(candidate.id)) {
                err(`illegal-act:${act.id}`, `caught-band fallout targets unknown issue "${candidate.id}"`);
                continue;
              }
              if (!forcedTargets.has(candidate.id)) forcedTargets.set(candidate.id, new Set());
              forcedTargets.get(candidate.id).add(roleId);
            }
          }
          if (schedule.length && !buildScheduledIssueTeaser(state, schedule, { settles: true })) {
            err(`illegal-act:${act.id}`, `caught-band fallout has nowhere to land for ${roleId} in ${area.id} (round ${round})`);
          }
        }
      }
    }
  }

  for (const [issueId, roleIds] of forcedTargets) {
    const issue = issueById.get(issueId);
    const dead = [...roleIds].filter((roleId) => !issueFitsAnywhere(issue, [roleId]));
    if (dead.length) err(`issue:${issueId}`, `fallout target can never surface for ${dead.join(", ")}`);
  }

  for (const issue of allIssues) {
    const where = `issue:${issue.id}`;
    const unknownTags = (issue.areaTags || []).filter((tag) => !knownAreaTags.has(tag));
    if (unknownTags.length) err(where, `areaTags no operating area carries: ${unknownTags.join(", ")}`);

    const roleIds = (issue.roles || []).filter((roleId) => playableRoleIds.includes(roleId));
    if (!issueFitsAnywhere(issue, roleIds)) {
      err(where, "can never be drawn: no seasonal role, area and season satisfies its gates");
      continue;
    }

    const missingAll = (issue.requiresFlags || []).filter((flag) => !producedFlags.has(flag));
    const anyFlags = issue.requiresAnyFlags || [];
    const missingAny = anyFlags.length && !anyFlags.some((flag) => producedFlags.has(flag));
    if ((missingAll.length || missingAny) && !forcedTargets.has(issue.id)) {
      const flags = missingAll.length ? missingAll : anyFlags;
      err(where, `can never be drawn: nothing in seasonal play sets ${flags.join(" / ")}`);
    }

    for (const [i, option] of (issue.options || []).entries()) {
      for (const scheduled of collectScheduledIssueIds(option)) {
        const target = issueById.get(scheduled);
        if (target && !issueFitsAnywhere(target, roleIds)) {
          err(where, `option ${i} schedules "${scheduled}", which can never surface for this card's roles`);
        }
      }
    }
  }
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
