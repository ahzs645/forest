import { MINISTRY_PROCESS_HOOKS, MINISTRY_PROCESS_FAILURES } from "./ministryProcessHooks.js";
import { ILLEGAL_ACTS } from "./illegalActs.js";
import { OPERATING_AREAS } from "./operatingAreas.js";

export const PROFESSIONAL_OBLIGATIONS = [
  {
    id: "active-registration",
    title: "Active FPBC Registration",
    summary:
      "Core forestry sign-off work assumes you are an active registrant and that renewal, title use, and practice status stay current.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    sourceLabel: "FPBC registration and renewal",
    sourceUrl: "https://www.fpbc.ca/practice-resources/renew-your-registration/",
  },
  {
    id: "cpd-cycle",
    title: "Annual CPD Cycle",
    summary:
      "Practising registrants have to keep current through continuing professional development, so courses, field reviews, and technical refreshers compete with production time.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    sourceLabel: "FPBC continuing professional development",
    sourceUrl: "https://www.fpbc.ca/professional-development/continuing-professional-development/",
  },
  {
    id: "competence-declaration",
    title: "Competence Declaration",
    summary:
      "You are expected to stay inside your current practice areas, keep a development plan, and be ready to produce those records if audited.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    sourceLabel: "FPBC competence declaration",
    sourceUrl: "https://www.fpbc.ca/professional-development/registrant-competence/competence-declaration/",
  },
  {
    id: "professional-discretion",
    title: "Professional Discretion",
    summary:
      "Results-based forestry still expects written rationale, due diligence, and defensible judgment when you depart from the obvious path.",
    roles: ["planner", "permitter"],
    sourceLabel: "FPBC professional discretion",
    sourceUrl: "https://www.fpbc.ca/practice-resources/standards-practice-guidelines/professional-discretion/",
  },
  {
    id: "practice-diary",
    title: "Practice Diary",
    summary:
      "Trainees and early-career staff need documented practice history, reflections, and supervisor context if they want their experience to count cleanly.",
    roles: ["planner", "permitter"],
    sourceLabel: "FPBC practice diary",
    sourceUrl: "https://www.fpbc.ca/practice-diary/",
  },
  // source: pattern across FPBC 2023-10 (Cover), 2021-05 (Maundrell), 2009-05 (Lay)
  {
    id: "field-verification-duty",
    title: "Field Verification Before Sign-off",
    summary:
      "Professional opinions about watercourse classification, road alignment, and bridge condition are expected to rest on in-person field checks, not desktop or helicopter flyover assumptions.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    sourceLabel: "FPBC practice standards for forest resource activities",
    sourceUrl:
      "https://www.fpbc.ca/practice-resources/standards-practice-guidelines/",
  },
  // source: pattern across FPBC 2022-04 (Chipman), 2022-09 (F. Johnson), 2022-10 (Kestell)
  {
    id: "referral-and-notification-duty",
    title: "Referral and Notification Integrity",
    summary:
      "Registrants are accountable for making sure referrals to First Nations, water licensees, and other affected parties actually happen, match the FSP commitments, and cover every overlapping interest on the block.",
    roles: ["planner", "permitter"],
    sourceLabel: "FRPA forest stewardship plans and referral commitments",
    sourceUrl:
      "https://www2.gov.bc.ca/gov/content/industry/forestry/managing-our-forest-resources/stewardship/forest-stewardship-plans",
  },
  // source: pattern across FPBC 2021-01 (Dascher), 2009-05 (Lay), 2018-02B (Wolfe)
  {
    id: "conflict-of-interest-duty",
    title: "Refuse the Conflicted Assignment",
    summary:
      "Forest professionals must refuse or withdraw from assignments where personal ownership, governance roles, or family interest compromise independence; you cannot be your own QEP or your own regulator.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    sourceLabel: "FPBC Code of Ethical and Professional Conduct",
    sourceUrl: "https://www.fpbc.ca/about-us/governance/bylaws/",
  },
  // source: pattern across FPBC 2014-05 (Raby), 2014-08 (K. Webber), 2015-01 (Yodogawa), 2021-10 (McIntosh)
  {
    id: "crossing-crp-duty",
    title: "Coordinating Registered Professional on Crossings",
    summary:
      "If you sign or seal a Crossing Assurance Statement, you are accepting personal responsibility that the structure was designed by qualified professionals, inspected in the field, and built to the load-bearing specification.",
    roles: ["permitter", "recce", "planner"],
    sourceLabel: "FPBC practice guidelines for crossings and resource roads",
    sourceUrl: "https://www.fpbc.ca/practice-resources/standards-practice-guidelines/",
  },
  // source: pattern across FPBC 2011-04 (Boucher/Forbes), 2014-04A (Crichton), 2014-04B (Zirul), 2020-03 (Peasgood), 2010-03 (Parker)
  {
    id: "cruise-integrity-duty",
    title: "Timber Cruise Integrity",
    summary:
      "Cruise plot placement, tree-class calls, and sampling design must conform to the provincial cruising manual; relying on a client's volume estimates or moving plots to hit a standard error is a stumpage-integrity failure, not a shortcut.",
    roles: ["recce", "planner"],
    sourceLabel: "BC Cruising Manual",
    sourceUrl:
      "https://www2.gov.bc.ca/gov/content/industry/forestry/competitive-forest-industry/timber-pricing/timber-cruising",
  },
];

export { MINISTRY_PROCESS_HOOKS, MINISTRY_PROCESS_FAILURES };

export const ENFORCEMENT_CASEFILES = [
  {
    id: "reserved-title-misuse",
    title: "Reserved Title / Unlawful Practice",
    summary:
      "Using a reserved FPBC title or providing reserved forestry practice while inactive, unregistered, or improperly supervised is an enforcement problem on its own.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    sourceLabel: "FPBC unlawful practice",
    sourceUrl: "https://www.fpbc.ca/complaints-and-decisions/unlawful-practice/",
  },
  {
    id: "competence-audit-pattern",
    title: "Competence Audit Pattern",
    summary:
      "Thin CPD records, weak competence declarations, or work samples that outrun your stated practice areas create avoidable audit exposure.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    sourceLabel: "FPBC competence audits",
    sourceUrl: "https://www.fpbc.ca/professional-development/registrant-competence/audits/",
  },
  {
    id: "watercourse-due-diligence",
    title: "Watercourse Due Diligence Failure",
    summary:
      "Office assumptions without field verification are especially dangerous around watercourse classification, riparian treatment, and community-water settings.",
    roles: ["planner", "permitter", "recce"],
    sourceLabel: "Practice standards for forest resource activities",
    sourceUrl: "https://www.fpbc.ca/practice-resources/standards-practice-guidelines/practice-standards-forest-resource-activities/",
  },
  {
    id: "rationale-gap",
    title: "Thin Rationale / Thin Records",
    summary:
      "A decision can look sensible and still be indefensible if the supporting field notes, maps, and written rationale are missing or too weak to survive review.",
    roles: ["planner", "permitter"],
    sourceLabel: "FPBC professional discretion",
    sourceUrl: "https://www.fpbc.ca/practice-resources/standards-practice-guidelines/professional-discretion/",
  },
];

const DEFAULT_CPD_TARGET = 30;
const DEFAULT_CPD_START = 8;

export const PAPERWORK_CHAIN_LIBRARY = [
  {
    id: "fom-notice-cycle",
    title: "FOM Notice -> Comment -> Submission",
    roles: ["planner", "permitter"],
    areaIds: ["bulkley-valley", "fraser-plateau", "skeena-nass", "vancouver-island-coast", "kootenay-wetbelt", "okanagan-shuswap-drybelt"],
    hookIds: ["fom-notice-cycle", "cutting-permit-admin"],
    sourceLabel: "Forest Operations Map",
    sourceUrl:
      "https://www2.gov.bc.ca/gov/content/environment/natural-resource-stewardship/laws-policies-standards-guidance/legislation-regulation/forest-range-practices-act/frpa-improvement-initiative/forest-operations-map",
    stages: [
      {
        id: "notice",
        label: "Post FOM notice and preserve proof",
        description:
          "Open the public notice cycle cleanly so the review record can survive district questions later.",
        hours: 2,
        paperworkRelief: 6,
        auditRelief: 4,
        confidenceBoost: 4,
      },
      {
        id: "response",
        label: "Answer comments and reconcile the map package",
        description:
          "Close the comment loop with written rationale instead of letting the final map drift away from the notice file.",
        hours: 2,
        paperworkRelief: 8,
        auditRelief: 8,
        confidenceBoost: 6,
      },
      {
        id: "submission",
        label: "Lock permit package consistency",
        description:
          "Tie the final FOM, response notes, and permit package together before the file goes forward.",
        hours: 2,
        paperworkRelief: 10,
        auditRelief: 6,
        confidenceBoost: 8,
      },
    ],
  },
  {
    id: "road-authority-chain",
    title: "Road Permit -> RUP -> Maintenance",
    roles: ["permitter", "planner", "recce"],
    areaIds: ["fort-st-john-plateau", "muskwa-foothills", "skeena-nass", "tahltan-highland", "vancouver-island-coast", "kootenay-wetbelt", "okanagan-shuswap-drybelt"],
    hookIds: ["road-permit-package", "road-use-permit", "road-notifications"],
    sourceLabel: "Road permit and road-use administration",
    sourceUrl:
      "https://www2.gov.bc.ca/gov/content/industry/forestry/forest-tenures/timber-harvesting-rights/road-permit-forestry",
    stages: [
      {
        id: "road-permit",
        label: "Build the road permit package",
        description:
          "Tighten the Exhibit A map, clearing assumptions, and deactivation intent before access gets ahead of authority.",
        hours: 3,
        paperworkRelief: 10,
        auditRelief: 6,
        complianceBoost: 5,
      },
      {
        id: "rup",
        label: "Assign RUP and maintenance lead",
        description:
          "Sort out who actually holds the industrial-use and maintenance responsibility before trucks compound the dispute.",
        hours: 2,
        paperworkRelief: 8,
        auditRelief: 8,
        complianceBoost: 4,
        relationshipBoost: 2,
      },
      {
        id: "closeout",
        label: "Close notices and maintenance record",
        description:
          "Send the commencement, deactivation, and end-of-maintenance notices while the file still matches field reality.",
        hours: 2,
        paperworkRelief: 12,
        auditRelief: 6,
        complianceBoost: 3,
      },
    ],
  },
  {
    id: "archaeology-ladder",
    title: "AOA Screen -> Field Review -> AIA Context",
    roles: ["permitter", "planner", "recce"],
    areaIds: ["tahltan-highland", "bulkley-valley", "skeena-nass", "muskwa-foothills", "vancouver-island-coast", "kootenay-wetbelt", "okanagan-shuswap-drybelt"],
    hookIds: ["archaeology-screening-ladder"],
    sourceLabel: "BC archaeology permits and assessments",
    sourceUrl: "https://www2.gov.bc.ca/gov/content/industry/natural-resource-use/archaeology/assessments-studies",
    stages: [
      {
        id: "desktop-screen",
        label: "Run the archaeology desktop screen early",
        description:
          "Treat the screen as a trigger for more work, not as a silent clearance slip.",
        hours: 2,
        paperworkRelief: 6,
        auditRelief: 5,
        complianceBoost: 4,
      },
      {
        id: "field-review",
        label: "Escalate to walkover / field review",
        description:
          "Carry the file into field review when the desktop signal is not strong enough to defend the footprint.",
        hours: 3,
        paperworkRelief: 8,
        auditRelief: 8,
        complianceBoost: 5,
        relationshipBoost: 3,
      },
      {
        id: "aia-context",
        label: "Frame the AIA / permit path",
        description:
          "Redesign or prepare the permit context before the site becomes a late-stage emergency.",
        hours: 3,
        paperworkRelief: 10,
        auditRelief: 10,
        complianceBoost: 6,
        relationshipBoost: 2,
      },
    ],
  },
  {
    id: "support-site-occupancy",
    title: "Support Site -> Special Use Permit -> Closeout",
    roles: ["permitter", "planner", "recce", "silviculture"],
    areaIds: ["muskwa-foothills", "skeena-nass", "tahltan-highland", "fort-st-john-plateau", "vancouver-island-coast", "kootenay-wetbelt", "okanagan-shuswap-drybelt"],
    hookIds: ["special-use-permit"],
    sourceLabel: "Special Use Permit - Forestry",
    sourceUrl:
      "https://www2.gov.bc.ca/gov/content/industry/forestry/forest-tenures/timber-harvesting-rights/special-use-permit-forestry",
    stages: [
      {
        id: "footprint-triage",
        label: "Triage camps, helipads, and support footprints",
        description:
          "Decide what can ride inside the main file and what needs its own special-use permit package before the footprint balloons.",
        hours: 2,
        paperworkRelief: 6,
        auditRelief: 4,
        complianceBoost: 3,
      },
      {
        id: "sup-package",
        label: "Build the special-use permit package",
        description:
          "Lock down occupancy maps and site layouts so the support footprint stops dragging the main file backward.",
        hours: 3,
        paperworkRelief: 10,
        auditRelief: 7,
        complianceBoost: 5,
      },
      {
        id: "occupancy-closeout",
        label: "Close the occupancy record",
        description:
          "Shrink or close the support-site file while the district still sees the site as temporary and controlled.",
        hours: 2,
        paperworkRelief: 12,
        auditRelief: 6,
        complianceBoost: 3,
      },
    ],
  },
];

export const AREA_COMPLIANCE_PROFILES = [
  {
    areaId: "fort-st-john-plateau",
    title: "Peatland Access and Winter-Road Burden",
    hookIds: ["road-permit-package", "road-notifications", "riparian-classification"],
    enforcementIds: ["watercourse-due-diligence", "rationale-gap"],
    chainIds: ["road-authority-chain", "support-site-occupancy"],
    paperworkLoad: 18,
    auditExposure: 10,
    dailyLoad: 3,
    watchouts: [
      "Peatland access and winter-road timing can turn routine access into permit administration.",
      "Wetland and stream buffers force repeated map and alignment clean-up.",
    ],
  },
  {
    areaId: "muskwa-foothills",
    title: "Remote-Camp and Caribou Access Burden",
    hookIds: ["road-permit-package", "road-use-permit", "special-use-permit"],
    enforcementIds: ["reserved-title-misuse", "rationale-gap"],
    chainIds: ["road-authority-chain", "support-site-occupancy", "archaeology-ladder"],
    paperworkLoad: 20,
    auditExposure: 12,
    dailyLoad: 3,
    watchouts: [
      "Remote camp logistics push separate support-site permit work onto the critical path.",
      "Steep access and wildlife timing make thin rationale show up quickly in review.",
    ],
  },
  {
    areaId: "bulkley-valley",
    title: "Visual Quality and Community-Water Burden",
    hookIds: ["fom-notice-cycle", "archaeology-screening-ladder", "riparian-classification"],
    enforcementIds: ["watercourse-due-diligence", "rationale-gap"],
    chainIds: ["fom-notice-cycle", "archaeology-ladder"],
    paperworkLoad: 16,
    auditExposure: 10,
    dailyLoad: 2,
    watchouts: [
      "Community visibility makes FOM notice quality and written response records matter more.",
      "Community-water and visual quality concerns punish sloppy field justification.",
    ],
  },
  {
    areaId: "fraser-plateau",
    title: "Landscape Planning and Wildfire Coordination Burden",
    hookIds: ["fom-notice-cycle", "cutting-permit-admin", "riparian-classification"],
    enforcementIds: ["rationale-gap"],
    chainIds: ["fom-notice-cycle"],
    paperworkLoad: 14,
    auditExposure: 8,
    dailyLoad: 2,
    watchouts: [
      "Beetle and wildfire legacy work keep the planning record active even when the field problem seems to be somewhere else.",
    ],
  },
  {
    areaId: "skeena-nass",
    title: "Fish-Crossing, Karst, and Wet-Ground Burden",
    hookIds: ["road-permit-package", "fish-crossing-remediation", "riparian-classification", "special-use-permit"],
    enforcementIds: ["watercourse-due-diligence", "rationale-gap"],
    chainIds: ["road-authority-chain", "support-site-occupancy", "fom-notice-cycle", "archaeology-ladder"],
    paperworkLoad: 22,
    auditExposure: 14,
    dailyLoad: 4,
    watchouts: [
      "Fish-bearing crossings and saturated slopes mean access files rarely stay simple.",
      "Karst and heavy-rain ground make field notes and rationale easier to challenge.",
    ],
  },
  {
    areaId: "tahltan-highland",
    title: "Remote Support-Site and Heritage Burden",
    hookIds: ["special-use-permit", "archaeology-screening-ladder", "road-permit-package"],
    enforcementIds: ["reserved-title-misuse", "rationale-gap"],
    chainIds: ["support-site-occupancy", "archaeology-ladder", "road-authority-chain"],
    paperworkLoad: 21,
    auditExposure: 13,
    dailyLoad: 3,
    watchouts: [
      "Remote camps and support pads push special-use permit packages onto the critical path.",
      "Archaeology and heritage sensitivity can escalate from desktop work to specialist-controlled systems.",
    ],
  },
  {
    areaId: "vancouver-island-coast",
    title: "Coastal Storm and Fish-Stream Burden",
    hookIds: ["road-permit-package", "fish-crossing-remediation", "fom-notice-cycle"],
    enforcementIds: ["watercourse-due-diligence", "rationale-gap"],
    chainIds: ["road-authority-chain", "fom-notice-cycle", "support-site-occupancy"],
    paperworkLoad: 18,
    auditExposure: 11,
    dailyLoad: 3,
    watchouts: [
      "Fish-stream crossings and storm-season access assumptions make weak field notes show up quickly in review.",
      "Visible roadside work keeps consultation and public-facing map quality live longer than expected.",
    ],
  },
  {
    areaId: "kootenay-wetbelt",
    title: "Wetbelt Watershed and Slope Burden",
    hookIds: ["road-permit-package", "fom-notice-cycle", "riparian-classification"],
    enforcementIds: ["watercourse-due-diligence", "rationale-gap"],
    chainIds: ["road-authority-chain", "fom-notice-cycle", "archaeology-ladder"],
    paperworkLoad: 17,
    auditExposure: 10,
    dailyLoad: 3,
    watchouts: [
      "Community-water settings and steep road prisms make drainage assumptions easier to challenge.",
      "Wetbelt cover and access complexity reward clean rationale and punish fast-but-thin file work.",
    ],
  },
  {
    areaId: "okanagan-shuswap-drybelt",
    title: "Drybelt Interface and Wildfire Burden",
    hookIds: ["fom-notice-cycle", "cutting-permit-admin", "riparian-classification"],
    enforcementIds: ["rationale-gap", "watercourse-due-diligence"],
    chainIds: ["fom-notice-cycle", "road-authority-chain"],
    paperworkLoad: 16,
    auditExposure: 9,
    dailyLoad: 2,
    watchouts: [
      "Interface wildfire logic and visible hillsides mean weak public-facing rationale gets tested early.",
      "Drybelt water sensitivity can turn a simple access note into a bigger watershed conversation.",
    ],
  },
];

function filterByRole(items = [], roleId) {
  return items.filter((item) => Array.isArray(item.roles) && item.roles.includes(roleId));
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function getAreaById(areaId) {
  return OPERATING_AREAS.find((area) => area.id === areaId) || null;
}

function uniqueById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item?.id || item?.title;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildChainState(chain) {
  return {
    id: chain.id,
    stageIndex: 0,
    status: "available",
    completed: false,
    blocked: false,
    lastAdvancedDay: 0,
  };
}

export function getAreaComplianceProfile(areaOrId) {
  const area = typeof areaOrId === "string" ? getAreaById(areaOrId) : areaOrId;
  if (!area) return null;
  return AREA_COMPLIANCE_PROFILES.find((profile) => profile.areaId === area.id) || null;
}

export function getPaperworkChainsForRole(roleId, areaOrId = null) {
  const areaId = typeof areaOrId === "string" ? areaOrId : areaOrId?.id;
  return PAPERWORK_CHAIN_LIBRARY.filter((chain) => {
    if (!Array.isArray(chain.roles) || !chain.roles.includes(roleId)) {
      return false;
    }
    if (!areaId || !Array.isArray(chain.areaIds) || chain.areaIds.length === 0) {
      return true;
    }
    return chain.areaIds.includes(areaId);
  });
}

export function getIllegalActsCatalog(roleId, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 12);
  return ILLEGAL_ACTS.filter((entry) => {
    if (!Array.isArray(entry.roles) || !entry.roles.includes(roleId)) {
      return false;
    }
    return Array.isArray(entry.basisCatalogIds) && entry.basisCatalogIds.length > 0;
  }).slice(0, limit);
}

export function createProfessionalState(roleId, areaOrId = null) {
  const areaProfile = getAreaComplianceProfile(areaOrId);
  const activeChains = getPaperworkChainsForRole(roleId, areaOrId);
  const basePaperwork = 12 + Number(areaProfile?.paperworkLoad || 0);
  const baseAudit = 8 + Number(areaProfile?.auditExposure || 0);
  const baseCompetence = roleId === "planner" || roleId === "permitter" ? 28 : 22;
  return {
    registrationStatus: "active",
    cpdHours: DEFAULT_CPD_START,
    cpdTarget: DEFAULT_CPD_TARGET,
    competenceRisk: clampPercent(baseCompetence),
    paperworkLoad: clampPercent(basePaperwork),
    auditExposure: clampPercent(baseAudit),
    areaBurdenLabel: areaProfile?.title || "Standard practice burden",
    areaWatchouts: areaProfile?.watchouts || [],
    activeHookIds: uniqueById(
      (areaProfile?.hookIds || []).map((hookId) => MINISTRY_PROCESS_HOOKS.find((hook) => hook.id === hookId)).filter(Boolean),
    ).map((hook) => hook.id),
    paperworkChains: activeChains.map(buildChainState),
    lastAdminDay: 0,
    lastCpdDay: 0,
  };
}

export function ensureProfessionalState(target, options = {}) {
  if (!target || typeof target !== "object") {
    return createProfessionalState(options.roleId || null, options.area || options.areaId || null);
  }

  const roleId = options.roleId || target.roleId || target.role?.id || null;
  const area = options.area || target.area || options.areaId || target.areaId || null;
  const base = createProfessionalState(roleId, area);

  target.professional = {
    ...base,
    ...(target.professional || {}),
  };

  const chainById = new Map((target.professional.paperworkChains || []).map((chain) => [chain.id, chain]));
  target.professional.paperworkChains = getPaperworkChainsForRole(roleId, area).map((chain) => ({
    ...buildChainState(chain),
    ...(chainById.get(chain.id) || {}),
  }));
  target.professional.areaBurdenLabel = base.areaBurdenLabel;
  target.professional.areaWatchouts = base.areaWatchouts;
  target.professional.activeHookIds = base.activeHookIds;
  target.professional.cpdTarget = DEFAULT_CPD_TARGET;
  target.professional.cpdHours = clampPercent(target.professional.cpdHours);
  target.professional.competenceRisk = clampPercent(target.professional.competenceRisk);
  target.professional.paperworkLoad = clampPercent(target.professional.paperworkLoad);
  target.professional.auditExposure = clampPercent(target.professional.auditExposure);

  return target.professional;
}

export function getPaperworkChainProgress(journey, chainId) {
  const roleId = journey?.roleId || journey?.role?.id || null;
  const area = journey?.area || journey?.areaId || null;
  const chain = PAPERWORK_CHAIN_LIBRARY.find((item) => item.id === chainId)
    || getPaperworkChainsForRole(roleId, area).find((item) => item.id === chainId)
    || null;
  if (!chain) return null;

  const professional = ensureProfessionalState(journey, { roleId, area });
  const state = professional.paperworkChains.find((item) => item.id === chain.id) || buildChainState(chain);
  const stage = chain.stages[state.stageIndex] || null;

  return {
    chain,
    state,
    stage,
    completed: Boolean(state.completed || !stage),
    remainingStages: Math.max(0, chain.stages.length - state.stageIndex),
  };
}

export function advancePaperworkChain(journey, chainId, options = {}) {
  const progress = getPaperworkChainProgress(journey, chainId);
  if (!progress || progress.completed || !progress.stage) {
    return { completed: true, advanced: false, stage: null, state: progress?.state || null };
  }

  const professional = ensureProfessionalState(journey, {
    roleId: journey?.roleId || journey?.role?.id || options.roleId,
    area: journey?.area || journey?.areaId || options.area,
  });

  professional.paperworkLoad = clampPercent(
    professional.paperworkLoad - (progress.stage.paperworkRelief || 0),
  );
  professional.auditExposure = clampPercent(
    professional.auditExposure - (progress.stage.auditRelief || 0),
  );
  professional.competenceRisk = clampPercent(
    professional.competenceRisk - Math.max(0, Math.floor((progress.stage.auditRelief || 0) / 2)),
  );

  progress.state.stageIndex += 1;
  progress.state.lastAdvancedDay = Number(options.day || journey?.day || 0);
  progress.state.completed = progress.state.stageIndex >= progress.chain.stages.length;
  progress.state.status = progress.state.completed ? "complete" : "available";

  return {
    advanced: true,
    completed: progress.state.completed,
    chain: progress.chain,
    stage: progress.stage,
    state: progress.state,
    nextStage: progress.chain.stages[progress.state.stageIndex] || null,
  };
}

export function applyProfessionalDrift(target, options = {}) {
  const roleId = options.roleId || target?.roleId || target?.role?.id || null;
  const area = options.area || target?.area || options.areaId || target?.areaId || null;
  const professional = ensureProfessionalState(target, { roleId, area });
  const areaProfile = getAreaComplianceProfile(area);
  const openChains = professional.paperworkChains.filter((chain) => !chain.completed).length;
  const day = Number(options.day || target?.day || target?.round || 0);
  const intensity = Math.max(1, Number(options.intensity) || 1);

  const paperworkGain = Math.max(
    1,
    (Number(areaProfile?.dailyLoad || 1) + Math.min(4, openChains)) * intensity,
  );
  professional.paperworkLoad = clampPercent(professional.paperworkLoad + paperworkGain);

  const expectedCpdByProgress = Math.min(DEFAULT_CPD_TARGET, Math.max(6, day * 2 * intensity));
  if (professional.cpdHours + 4 < expectedCpdByProgress) {
    professional.competenceRisk = clampPercent(professional.competenceRisk + 4 * intensity);
  } else if (professional.cpdHours >= expectedCpdByProgress) {
    professional.competenceRisk = clampPercent(professional.competenceRisk - 2 * intensity);
  }

  const auditGain = Math.max(
    1,
    Math.floor(Math.max(0, professional.paperworkLoad - 45) / 12)
      + Math.floor(Math.max(0, professional.competenceRisk - 40) / 15),
  );
  professional.auditExposure = clampPercent(professional.auditExposure + auditGain * intensity);

  if (professional.auditExposure >= 70) {
    professional.registrationStatus = "audit-watch";
  } else if (professional.competenceRisk >= 58 || professional.paperworkLoad >= 72) {
    professional.registrationStatus = "renewal-watch";
  } else {
    professional.registrationStatus = "active";
  }

  return professional;
}

export function getRoleProfessionalContext(roleId, options = {}) {
  const obligationCount = Math.max(1, Number(options.obligationCount) || 2);
  const paperworkCount = Math.max(1, Number(options.paperworkCount) || 2);
  const enforcementCount = Math.max(1, Number(options.enforcementCount) || 1);
  const breachCount = Math.max(1, Number(options.breachCount) || 1);
  const illegalCount = Math.max(1, Number(options.illegalCount) || 6);
  const area = options.area || options.areaId || null;
  const areaProfile = getAreaComplianceProfile(area);

  return {
    obligations: filterByRole(PROFESSIONAL_OBLIGATIONS, roleId).slice(0, obligationCount),
    paperwork: filterByRole(MINISTRY_PROCESS_HOOKS, roleId).slice(0, paperworkCount),
    enforcement: filterByRole(ENFORCEMENT_CASEFILES, roleId).slice(0, enforcementCount),
    breaches: filterByRole(MINISTRY_PROCESS_FAILURES, roleId).slice(0, breachCount),
    chains: getPaperworkChainsForRole(roleId, area).slice(0, 4),
    illegalActs: getIllegalActsCatalog(roleId, { limit: illegalCount }),
    areaBurden: areaProfile
      ? {
          title: areaProfile.title,
          watchouts: areaProfile.watchouts || [],
          paperworkLoad: areaProfile.paperworkLoad,
          auditExposure: areaProfile.auditExposure,
        }
      : null,
  };
}
