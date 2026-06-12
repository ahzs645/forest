import { createInitialState } from "../js/engine/state.js";
import { applyOptionOutcome, formatMetricDelta } from "../js/engine/effects.js";
import {
  getPlanningAreaSnapshot,
  getRoleAreaBriefing,
  getRoleMinistryProcessHooks,
  getRoadAssetAreaSummary,
} from "../js/data/index.js";

export const CRISIS_COMMAND_LABEL = "BC Forestry Simulator: Crisis Command";

const CRISIS_AREA_ID = "fraser-plateau";
const CRISIS_ROLE_ID = "planner";

const CRISIS_SCENARIOS = [
  {
    id: "pine-beetle-detection",
    phase: "Detection",
    title: "Sudden Pine Beetle Outbreak Near Williams Lake",
    weather: "Cold rain, wind SW 18 km/h",
    deadline: "48 hours to file first response",
    description:
      "Aerial survey photos and fresh pitch tubes show a fast-moving beetle pocket in pine-heavy SBS ground near a community evacuation route. The district wants a response plan before the weather closes in.",
    whyNow:
      "Delay lets infested stems become next year's flight source, but a rushed salvage story can damage trust, habitat, and permit defensibility.",
    map: [
      "                 N",
      "             W --+-- E        Williams Lake interface",
      "                 S",
      "",
      "  ridge ^^^^         old pine belt ............",
      "  FSR-12 ========+==================== mill",
      "                 |",
      "  block A   P P P|P P P        H = habitat edge",
      "            P x x|x x P        F = fresh pitch tubes",
      "  creek ~~~~~~~~~+~~~~~~~      ! = active beetle front",
      "            FN   |   HHH",
      "  evac route ====+================ community",
      "",
      "  BEETLE core:    x x x       leading edge:  ! ! !",
    ].join("\n"),
    mapFeatures: [
      { type: "polygon", points: [{ x: 8, y: 16 }, { x: 96, y: 16 }, { x: 96, y: 88 }, { x: 8, y: 88 }] },
      { type: "line", width: 2, points: [{ x: 8, y: 48 }, { x: 92, y: 48 }] },
      { type: "line", width: 1, points: [{ x: 6, y: 78 }, { x: 38, y: 78 }, { x: 92, y: 80 }] },
      { type: "line", width: 1, points: [{ x: 0, y: 62 }, { x: 24, y: 64 }, { x: 52, y: 61 }, { x: 100, y: 65 }] },
      { type: "polygon", points: [{ x: 42, y: 38 }, { x: 58, y: 36 }, { x: 68, y: 52 }, { x: 52, y: 58 }, { x: 38, y: 50 }] },
      { type: "line", width: 1, points: [{ x: 64, y: 34 }, { x: 72, y: 42 }, { x: 80, y: 52 }] },
      { type: "point", point: { x: 51, y: 48 }, radius: 2, label: "BEETLE" },
      { type: "point", point: { x: 83, y: 43 }, radius: 1, label: "H" },
      { type: "point", point: { x: 35, y: 68 }, radius: 1, label: "FN" },
      { type: "label", point: { x: 50, y: 11 }, text: "Williams Lake Interface", center: true },
      { type: "label", point: { x: 50, y: 46 }, text: "FSR-12", center: true },
      { type: "label", point: { x: 73, y: 78 }, text: "EVAC ROUTE", center: true },
    ],
    status: {
      "Crew morale": "72%",
      Equipment: "skidder, chainsaw team, radio",
      "Wildfire risk": "moderate and rising",
      "Timber value": "high pine salvage exposure",
      "Regulatory clock": "first response due",
    },
    options: [
      {
        label: "Quarantine affected stand",
        outcome:
          "You hold traffic, mark a sanitary boundary, and buy containment credibility while the mill schedule takes a hit.",
        effects: { progress: 4, forestHealth: 8, relationships: 2, compliance: 5, budget: -5 },
      },
      {
        label: "Dispatch survey crew",
        outcome:
          "Ground crews confirm the leading edge and catch two smaller pockets before the map package is finalized.",
        effects: { progress: 6, forestHealth: 5, compliance: 3, budget: -4 },
      },
      {
        label: "Notify First Nation liaison",
        outcome:
          "The liaison flags values near the creek early, preventing a later referral blow-up and improving trust in the response.",
        effects: { progress: 1, forestHealth: 3, relationships: 9, compliance: 4, budget: -2 },
      },
      {
        label: "Apply for salvage permit",
        outcome:
          "You start the file clock immediately, but the package is thin until the field and values work catches up.",
        effects: { progress: 9, forestHealth: -3, relationships: -3, compliance: -2, budget: 2 },
        scheduleIssues: { id: "permit-deficiency", delay: 1 },
      },
      {
        label: "Delay and monitor",
        outcome:
          "You avoid a rushed call, but the outbreak expands and the district questions whether the response is proportionate.",
        effects: { progress: -4, forestHealth: -9, relationships: -4, compliance: -3, budget: 3 },
      },
    ],
  },
  {
    id: "access-and-habitat",
    phase: "Access",
    title: "Wet Road Access Meets Habitat Constraints",
    weather: "Rain on thawed subgrade, gusting 24 km/h",
    deadline: "5 days before crews demobilize",
    description:
      "The cleanest spur crosses soft ground and pushes close to a mapped habitat feature. Operations wants the short route; the referral record needs proof that access will not create a bigger long-term problem.",
    whyNow:
      "Road choice decides whether this remains a contained sanitation job or turns into a public road, water, and wildlife dispute.",
    map: [
      "  FSR-12 ======================= mill",
      "        \\",
      "         \\ short route ? ? ?",
      "          \\   soft fill / wet shoulder",
      "  pine xx  \\xxxxxx             WHA",
      "  creek ~~~~~~~~+~~~~~~~~~~~~~~~",
      "  old spur -----+----- X ----- landing",
      "                |",
      "        culvert check / deactivation note",
    ].join("\n"),
    mapFeatures: [
      { type: "line", width: 2, points: [{ x: 5, y: 18 }, { x: 98, y: 18 }] },
      { type: "line", width: 1, points: [{ x: 26, y: 18 }, { x: 50, y: 43 }, { x: 68, y: 70 }] },
      { type: "line", width: 1, points: [{ x: 10, y: 74 }, { x: 48, y: 62 }, { x: 92, y: 66 }] },
      { type: "line", width: 1, points: [{ x: 0, y: 54 }, { x: 38, y: 57 }, { x: 100, y: 52 }] },
      { type: "polygon", points: [{ x: 44, y: 36 }, { x: 72, y: 32 }, { x: 84, y: 56 }, { x: 52, y: 62 }] },
      { type: "point", point: { x: 56, y: 45 }, radius: 2, label: "SOFT" },
      { type: "point", point: { x: 86, y: 48 }, radius: 1, label: "WHA" },
      { type: "label", point: { x: 34, y: 15 }, text: "FSR-12", center: true },
      { type: "label", point: { x: 35, y: 75 }, text: "OLD SPUR", center: true },
    ],
    status: {
      "Road pressure": "soft fill and wet approaches",
      "Habitat risk": "mapped WHA adjacency",
      "Equipment": "grader on standby, culverts short",
      "Crew morale": "68%",
      "Regulatory clock": "road authority check",
    },
    options: [
      {
        label: "Use old spur with engineering controls",
        outcome:
          "The route is slower but defensible. Drainage notes, load limits, and deactivation intent reduce the risk of a road-permit fight.",
        effects: { progress: 4, forestHealth: 4, relationships: 2, compliance: 7, budget: -6 },
      },
      {
        label: "Push the short route before rain worsens",
        outcome:
          "Production jumps, but wet shoulders rut and the habitat overlap becomes the next hard question.",
        effects: { progress: 10, forestHealth: -8, relationships: -5, compliance: -6, budget: 1 },
        scheduleIssues: { id: "road-authority-assumption", delay: 1 },
      },
      {
        label: "Fly a drone and redraw the access",
        outcome:
          "The drone pass finds a bench that avoids the worst wet ground, though the redesign costs a day.",
        effects: { progress: 2, forestHealth: 7, relationships: 1, compliance: 5, budget: -4 },
      },
      {
        label: "Pause for joint field review",
        outcome:
          "Partners and district staff see the same ground before a final line is chosen. Trust improves while containment slows.",
        effects: { progress: -3, forestHealth: 5, relationships: 8, compliance: 6, budget: -3 },
      },
    ],
  },
  {
    id: "salvage-permit-package",
    phase: "Permit",
    title: "Salvage Package Under Public Review Pressure",
    weather: "Smoke haze, dry afternoon wind",
    deadline: "30-day notice window is compressing harvest timing",
    description:
      "The permit package now has beetle sanitation logic, FOM consistency questions, and comments about old structure and creek buffers. Finance wants volume protected before blue stain discounts deepen.",
    whyNow:
      "A fast but weak package can trigger deficiency letters; a slower package can miss the sanitation window and lose timber value.",
    map: [
      "  town viewpoint  ^^^ skyline visible from road",
      "        |",
      "  OGMA  |       old structure / retention",
      "  ------+--------------------------------",
      "  block A  x x x    creek ~~~~~~~~~~~~~~",
      "  block B  x ? x    buffer ! ! !",
      "  block C  pine     comment log open",
      "  haul =========== FSR ============= mill",
    ].join("\n"),
    mapFeatures: [
      { type: "line", width: 2, points: [{ x: 8, y: 84 }, { x: 96, y: 84 }] },
      { type: "line", width: 1, points: [{ x: 28, y: 8 }, { x: 28, y: 76 }] },
      { type: "line", width: 1, points: [{ x: 0, y: 58 }, { x: 30, y: 56 }, { x: 100, y: 60 }] },
      { type: "polygon", points: [{ x: 40, y: 36 }, { x: 60, y: 34 }, { x: 68, y: 50 }, { x: 46, y: 54 }] },
      { type: "polygon", points: [{ x: 48, y: 56 }, { x: 68, y: 56 }, { x: 72, y: 70 }, { x: 50, y: 72 }] },
      { type: "point", point: { x: 52, y: 44 }, radius: 1, label: "A" },
      { type: "point", point: { x: 60, y: 64 }, radius: 1, label: "B" },
      { type: "point", point: { x: 30, y: 16 }, radius: 1, label: "VIEW" },
      { type: "label", point: { x: 63, y: 26 }, text: "OGMA", center: true },
      { type: "label", point: { x: 50, y: 86 }, text: "HAUL FSR", center: true },
    ],
    status: {
      "Timber value": "discount clock active",
      "Compliance": "FOM consistency review",
      "Habitat risk": "old structure and riparian comments",
      "Budget remaining": "tight but workable",
      "Crew morale": "64%",
    },
    options: [
      {
        label: "Rebuild package around constraints",
        outcome:
          "You give up some volume and submit a cleaner, easier-to-defend salvage story.",
        effects: { progress: 1, forestHealth: 7, relationships: 5, compliance: 9, budget: -4 },
      },
      {
        label: "Split urgent sanitation from deferred blocks",
        outcome:
          "The highest-risk pine moves first while contentious ground stays in review. The response remains credible.",
        effects: { progress: 7, forestHealth: 5, relationships: 3, compliance: 5, budget: -2 },
      },
      {
        label: "Protect full volume in one submission",
        outcome:
          "The package maximizes timber value but invites a harder review of buffers, comments, and rationale.",
        effects: { progress: 8, forestHealth: -5, relationships: -6, compliance: -5, budget: 4 },
        scheduleIssues: { id: "fom-consistency-gap", delay: 1 },
      },
      {
        label: "Ask the mill to absorb delay",
        outcome:
          "You preserve review quality, but the commercial side loses patience and future budget flexibility narrows.",
        effects: { progress: -3, forestHealth: 4, relationships: 2, compliance: 6, budget: -6 },
      },
    ],
  },
  {
    id: "recovery-plan",
    phase: "Recovery",
    title: "Post-Salvage Regeneration and Fuel Risk Plan",
    weather: "Cool morning, drying trend",
    deadline: "reforestation prescription due before fall",
    description:
      "Sanitation work is only the first half of the crisis. The stand now needs a regeneration and fuel-risk plan that survives browse, droughty pine knolls, and evacuation-route scrutiny.",
    whyNow:
      "A narrow salvage win can become a long-term forest-health loss if stocking, species mix, and fuel continuity are treated as paperwork.",
    map: [
      "  regeneration units after sanitation harvest",
      "",
      "  A1 dry knoll     //// slash / fuel continuity",
      "  A2 frost low     .... browse pressure",
      "  A3 mixedwood     ++++ retain spruce/aspen",
      "  A4 creek edge    ~~~~ riparian shade",
      "",
      "  evac route ================= community",
      "  monitoring transects:  | | | |",
    ].join("\n"),
    mapFeatures: [
      { type: "line", width: 2, points: [{ x: 4, y: 84 }, { x: 96, y: 84 }] },
      { type: "polygon", points: [{ x: 12, y: 20 }, { x: 38, y: 18 }, { x: 40, y: 42 }, { x: 16, y: 46 }] },
      { type: "polygon", points: [{ x: 44, y: 18 }, { x: 72, y: 20 }, { x: 70, y: 48 }, { x: 44, y: 44 }] },
      { type: "polygon", points: [{ x: 22, y: 52 }, { x: 50, y: 52 }, { x: 52, y: 74 }, { x: 18, y: 72 }] },
      { type: "line", width: 1, points: [{ x: 0, y: 66 }, { x: 34, y: 64 }, { x: 100, y: 68 }] },
      { type: "line", width: 1, points: [{ x: 18, y: 12 }, { x: 18, y: 76 }] },
      { type: "line", width: 1, points: [{ x: 32, y: 12 }, { x: 32, y: 76 }] },
      { type: "line", width: 1, points: [{ x: 48, y: 12 }, { x: 48, y: 76 }] },
      { type: "point", point: { x: 26, y: 32 }, radius: 1, label: "A1" },
      { type: "point", point: { x: 58, y: 32 }, radius: 1, label: "A2" },
      { type: "point", point: { x: 34, y: 63 }, radius: 1, label: "A3" },
      { type: "label", point: { x: 50, y: 86 }, text: "EVAC ROUTE", center: true },
    ],
    status: {
      "Forest health": "depends on mixedwood recovery",
      "Wildfire risk": "slash and fuel continuity",
      "Crew morale": "steady but tired",
      "Budget remaining": "thin",
      "Regulatory clock": "stocking standards next",
    },
    options: [
      {
        label: "Fund mixedwood climate-adaptive planting",
        outcome:
          "You spend more now to reduce future drought, beetle, and fuel exposure across the treated stand.",
        effects: { progress: 2, forestHealth: 10, relationships: 2, compliance: 4, budget: -8 },
      },
      {
        label: "Prioritize fuel breaks along evacuation route",
        outcome:
          "Community protection improves, though some interior regen units wait for a second pass.",
        effects: { progress: 5, forestHealth: 4, relationships: 7, compliance: 3, budget: -5 },
      },
      {
        label: "Use minimum regen prescription",
        outcome:
          "The file closes cheaply, but weak stocking and fuel continuity remain visible risks.",
        effects: { progress: 8, forestHealth: -7, relationships: -3, compliance: -4, budget: 5 },
      },
      {
        label: "Co-design monitoring with local guardians",
        outcome:
          "Monitoring capacity improves and future issues surface earlier, though the current closeout takes longer.",
        effects: { progress: -1, forestHealth: 6, relationships: 9, compliance: 5, budget: -4 },
      },
    ],
  },
];

function summarizeHooks(hooks = []) {
  return hooks
    .slice(0, 2)
    .map((hook) => `${hook.title}: ${hook.minimumWait?.label || hook.category}`)
    .join("\n");
}

function summarizeBlocks(snapshot) {
  const blocks = snapshot?.sampleBlocks || [];
  if (!blocks.length) return "";
  return blocks
    .slice(0, 3)
    .map((block) => `${block.compactId || block.label}: ${Math.round(block.areaHa)} ha ${block.species || "mixed"}`)
    .join("\n");
}

function buildIntel(area, roleId) {
  const briefing = getRoleAreaBriefing(roleId, area, { maxFinds: 4 });
  const planningSnapshot = getPlanningAreaSnapshot(area.id, area, { sampleCount: 3 });
  const roadSummary = getRoadAssetAreaSummary({ area });
  const hooks = getRoleMinistryProcessHooks(roleId, { limit: 3 });

  return {
    zoneSummary: briefing.zoneSummary,
    seasonalSignals: briefing.seasonalSignals,
    likelyFinds: briefing.likelyFinds,
    processHooks: hooks,
    processHookSummary: summarizeHooks(hooks),
    planningSnapshot,
    blockSummary: summarizeBlocks(planningSnapshot),
    roadSummary: roadSummary.summary || "",
  };
}

export function createCrisisCommandState(companyName) {
  const state = createInitialState({
    companyName,
    roleId: CRISIS_ROLE_ID,
    areaId: CRISIS_AREA_ID,
  });

  state.gameMode = "crisis-command";
  state.modeLabel = CRISIS_COMMAND_LABEL;
  state.roleDisplayName = "Incident Commander";
  state.totalRounds = CRISIS_SCENARIOS.length;
  state.metrics = {
    progress: 42,
    forestHealth: 48,
    relationships: 50,
    compliance: 46,
    budget: 58,
  };
  state.timeline = [
    {
      round: 0,
      season: "Outbreak Baseline",
      metrics: { ...state.metrics },
    },
  ];
  state.crisis = {
    title: "Pine Beetle Response Near Williams Lake",
    location: "Fraser Plateau / Cariboo interface",
    commandLog: [],
    intel: buildIntel(state.area, CRISIS_ROLE_ID),
  };

  return state;
}

export function getNextCrisisScenario(state) {
  const index = Math.max(0, Number(state?.round || 1) - 1);
  return CRISIS_SCENARIOS[index] || null;
}

export function buildCrisisCard(state, scenario, notice = null) {
  const intel = state.crisis?.intel || {};
  const area = state.area || {};
  const intelLines = [
    intel.zoneSummary,
    area.dominantTrees?.length ? `Dominant species: ${area.dominantTrees.join(", ")}` : "",
    area.indigenousPartners?.length ? `Indigenous partners: ${area.indigenousPartners.join(", ")}` : "",
    intel.likelyFinds?.[0] ? `Local signal: ${intel.likelyFinds[0]}` : "",
    intel.processHookSummary ? `Process hooks:\n${intel.processHookSummary}` : "",
    intel.blockSummary ? `Planning blocks:\n${intel.blockSummary}` : "",
  ].filter(Boolean);

  return {
    type: "scenario",
    title: scenario.title,
    phaseLabel: `Crisis Command / ${scenario.phase}`,
    description: scenario.description,
    whyNow: scenario.whyNow,
    weather: scenario.weather,
    deadline: scenario.deadline,
    map: scenario.map,
    mapFeatures: scenario.mapFeatures,
    status: scenario.status,
    intelLines,
    context: {
      operation: `Coordinate sanitation, access, permit, relationship, and recovery decisions for ${state.area.name}.`,
      objective: "Contain beetle spread without sacrificing legal defensibility, habitat outcomes, or community trust.",
      stakes: "Every action shifts containment, forest health, relationships, compliance, and remaining budget at the same time.",
    },
    decisionPrompt: "Choose the command action that best addresses the current crisis phase.",
    optionHeading: "Command actions",
    optionTone: "warning",
    optionDetails: scenario.options.map((option) => ({
      label: option.label,
      outcome: option.outcome,
    })),
    notice,
  };
}

export function applyCrisisOption(state, scenario, option) {
  const result = applyOptionOutcome(state, option, {
    type: "crisis-command",
    id: scenario.id,
    title: scenario.title,
    option: option.label,
    round: state.round,
  });

  state.crisis.commandLog.push({
    phase: scenario.phase,
    title: scenario.title,
    option: option.label,
    effects: result?.effects || {},
  });
  state.timeline.push({
    round: state.round,
    season: scenario.phase,
    metrics: { ...state.metrics },
  });

  return result;
}

export function buildCrisisOutcomeNotice(option, result) {
  const deltaText = formatMetricDelta(result?.effects || {});
  return {
    heading: `Command Logged: ${option.label}`,
    body: [result?.outcome || option.outcome, deltaText ? `Effects: ${deltaText}` : ""]
      .filter(Boolean)
      .join("\n\n"),
    tone: "info",
  };
}

export function buildCrisisSummary(state) {
  const metrics = state.metrics || {};
  const containment = Math.round((metrics.progress + metrics.forestHealth + metrics.compliance) / 3);
  const trust = Math.round((metrics.relationships + metrics.compliance) / 2);
  const commandLog = state.crisis?.commandLog || [];
  const stable = containment >= 62 && trust >= 55 && metrics.budget >= 25;

  return {
    type: "summary",
    heading: "Crisis Debrief",
    body: stable
      ? "The incident is contained enough to move from emergency response into monitored recovery."
      : "The incident remains unstable. Leadership needs a recovery plan before the next operating window.",
    bullets: [
      `Containment index: ${containment}`,
      `Trust and defensibility index: ${trust}`,
      `Budget reserve: ${metrics.budget}`,
      `Forest health: ${metrics.forestHealth}`,
    ],
    highlights: commandLog.map((entry) => {
      const delta = formatMetricDelta(entry.effects);
      return `${entry.phase}: ${entry.option}${delta ? ` (${delta})` : ""}`;
    }),
    trendLines: [
      "Mode used the Fraser Plateau area profile, planning block snapshot, process hooks, and role-area briefing content.",
      "Strong outcomes require more than production speed: relationships, compliance, and recovery investment all carry weight.",
    ],
    projection: stable
      ? ["Monitor beetle flight next season, verify regeneration survival, and keep evacuation-route fuel work funded."]
      : ["Expect district scrutiny, partner frustration, and higher future treatment costs until the weak metrics recover."],
    achievements: stable
      ? ["Incident Command: balanced containment with defensible forestry decisions."]
      : ["Incident Logged: the command record now shows where recovery must focus."],
  };
}
