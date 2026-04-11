function normalizeLimit(value) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
    return null;
  }

  return Math.floor(Number(value));
}

function filterByRole(items = [], roleId) {
  if (!roleId) return items.slice();
  return items.filter((item) => Array.isArray(item.roles) && item.roles.includes(roleId));
}

export const MINISTRY_PROCESS_HOOKS = [
  {
    id: "fsp-public-review",
    title: "Forest Stewardship Plan Public Review",
    category: "public-review",
    summary:
      "Landscape-level FSP work carries a public review package, written comments, referral tracking, and a formal response record before approval.",
    roles: ["planner", "permitter"],
    trigger:
      "A new or amended Forest Stewardship Plan is moving toward approval and must be made publicly available for review.",
    documents: [
      "draft FSP results and strategies package",
      "public review notice",
      "written comment log",
      "response-to-comments record",
      "referral and engagement record",
    ],
    minimumWait: { label: "60-day written comment window", days: 60 },
    playerActions: [
      "publish the review package and track access dates",
      "coordinate referrals and First Nations discussion alongside written comments",
      "revise strategies or write defensible rationale for staying the course",
    ],
    failureModes: [
      {
        id: "fsp-comment-gap",
        title: "Thin comment response record",
        summary:
          "Weak written responses or a sloppy comment log turn the FSP into a trust and approval problem instead of a planning document.",
      },
      {
        id: "fsp-review-shortcut",
        title: "Compressed review window",
        summary:
          "Trying to rush the public review period leaves the plan exposed to rejection, rework, and relationship damage.",
      },
    ],
    sourceLabel: "Forest Stewardship Plans",
    sourceUrl: "https://www2.gov.bc.ca/gov/content/industry/forestry/managing-our-forest-resources/forest-stewardship-plans",
    sourceUrls: [
      "https://www2.gov.bc.ca/gov/content/industry/forestry/managing-our-forest-resources/forest-stewardship-plans",
      "https://www.bclaws.gov.bc.ca/civix/document/id/lc/statreg/14_2004",
    ],
  },
  {
    id: "fom-notice-cycle",
    title: "Forest Operations Map Notice Cycle",
    category: "public-review",
    summary:
      "Before CP or RP submissions, the FOM has its own website/newspaper notice, comment period, and final map package.",
    roles: ["planner", "permitter"],
    trigger:
      "A cutting permit or road permit package is being advanced in a FRPA area where the Forest Operations Map process applies.",
    documents: [
      "Forest Operations Map",
      "website and newspaper notice proof",
      "comment summary",
      "changes or rationale package",
      "final FOM submission set",
    ],
    minimumWait: { label: "30-day public comment period", days: 30 },
    playerActions: [
      "publish notice and preserve proof that notice ran correctly",
      "log comments and show what changed on the final map",
      "keep the final permit package consistent with the final FOM",
    ],
    failureModes: [
      {
        id: "fom-consistency-gap",
        title: "Permit package does not match the final FOM",
        summary:
          "If the CP or RP package drifts away from the noticed map, the district can refuse the application instead of negotiating around it.",
      },
      {
        id: "fom-comment-record-gap",
        title: "Thin notice-and-response record",
        summary:
          "Missing notice proof, comment logs, or rationale makes the FOM cycle hard to defend once questions start.",
      },
    ],
    sourceLabel: "Forest Operations Map",
    sourceUrl: "https://www2.gov.bc.ca/gov/content/environment/natural-resource-stewardship/laws-policies-standards-guidance/legislation-regulation/forest-range-practices-act/frpa-improvement-initiative/forest-operations-map",
    sourceUrls: [
      "https://www2.gov.bc.ca/gov/content/environment/natural-resource-stewardship/laws-policies-standards-guidance/legislation-regulation/forest-range-practices-act/frpa-improvement-initiative/forest-operations-map",
      "https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/00_02069_01",
      "https://www.bclaws.gov.bc.ca/civix/document/id/lc/statreg/14_2004",
    ],
  },
  {
    id: "cutting-permit-admin",
    title: "Cutting Permit Administration",
    category: "permit-administration",
    summary:
      "Cutting permit work does not stop at first issuance; amendments, extensions, postponements, rescindments, surrenders, and declarations keep the backlog alive.",
    roles: ["planner", "permitter"],
    trigger:
      "A permit file changes after approval or needs its status adjusted to match operations on the ground.",
    documents: [
      "cutting permit amendment or extension package",
      "professional declaration",
      "status change record",
      "NROS supporting attachments",
    ],
    minimumWait: { label: "district review varies by file complexity", days: null },
    playerActions: [
      "decide whether to amend, extend, postpone, rescind, or surrender",
      "rebuild maps and declarations when the file intent changes",
      "keep the NROS record clean enough that old assumptions do not leak into new work",
    ],
    failureModes: [
      {
        id: "cp-admin-drift",
        title: "Permit status drift",
        summary:
          "When the active file record, maps, and field reality drift apart, the backlog becomes harder to trust and slower to move.",
      },
    ],
    sourceLabel: "Cutting Permit and Road Tenure Administration",
    sourceUrl: "https://www2.gov.bc.ca/gov/content/industry/forestry/forest-tenures/timber-harvesting-rights/cutting-permit-road-tenure-administration",
    sourceUrls: [
      "https://www2.gov.bc.ca/gov/content/industry/forestry/forest-tenures/timber-harvesting-rights/cutting-permit-road-tenure-administration",
      "https://www2.gov.bc.ca/gov/content/industry/forestry/forest-tenures/electronic-applications",
    ],
  },
  {
    id: "road-permit-package",
    title: "Road Permit Package",
    category: "roads",
    summary:
      "New Crown-land access outside FSR or CP authority needs a road permit package with mapping, deactivation logic, and district review.",
    roles: ["planner", "permitter", "recce"],
    trigger:
      "The proposed access is on Crown land and cannot ride inside existing Forest Service Road or cutting permit authority.",
    documents: [
      "road permit application",
      "Exhibit A map set",
      "road deactivation date or intent",
      "clearing-area timber details",
    ],
    minimumWait: { label: "district review before construction authority", days: null },
    playerActions: [
      "prove the access needs a road permit instead of some other authority",
      "tighten the Exhibit A mapping and clearing-area assumptions",
      "show how the road will be deactivated or handed off later",
    ],
    failureModes: [
      {
        id: "road-permit-exhibit-gap",
        title: "Weak Exhibit A map package",
        summary:
          "If the road map, timber clearing logic, or alignment details are weak, the access package becomes an easy deficiency letter.",
      },
      {
        id: "road-authority-assumption",
        title: "Wrong authority assumed",
        summary:
          "Treating new access like it is already covered by an FSR or cutting permit can stop the road package cold once district staff compare the footprint to the tenure authority.",
      },
    ],
    sourceLabel: "Road Permit - Forestry",
    sourceUrl: "https://www2.gov.bc.ca/gov/content/industry/forestry/forest-tenures/timber-harvesting-rights/road-permit-forestry",
    sourceUrls: [
      "https://www2.gov.bc.ca/gov/content/industry/forestry/forest-tenures/timber-harvesting-rights/road-permit-forestry",
      "https://www2.gov.bc.ca/gov/content/industry/forestry/forest-tenures/timber-harvesting-rights/cutting-permit-road-tenure-administration",
    ],
  },
  {
    id: "road-use-permit",
    title: "Road Use Permit and Maintenance Lead",
    category: "roads",
    summary:
      "Industrial users on a Forest Service Road generally need a road use permit, and someone ends up holding the maintenance lead role.",
    roles: ["permitter", "recce"],
    trigger:
      "Industrial traffic is proposed on a Forest Service Road that already has other users, cost exposure, or maintenance ambiguity.",
    documents: [
      "road use permit application",
      "industrial use notice",
      "maintenance responsibility record",
      "radio and user-coordination plan",
    ],
    minimumWait: { label: "district assignment before industrial use stabilizes", days: null },
    playerActions: [
      "determine whether a road use permit or exemption applies",
      "sort out primary-user maintenance responsibility",
      "align road-use expectations before field traffic compounds the problem",
    ],
    failureModes: [
      {
        id: "road-use-permit-free-rider",
        title: "Industrial use without a clean RUP",
        summary:
          "Pushing traffic down an FSR without the right permit or maintenance assignment creates an avoidable compliance fight.",
      },
    ],
    sourceLabel: "District road requirements",
    sourceUrl: "https://www2.gov.bc.ca/gov/content/industry/natural-resource-use/resource-roads/district-road-requirements",
    sourceUrls: [
      "https://www2.gov.bc.ca/gov/content/industry/natural-resource-use/resource-roads/district-road-requirements",
      "https://portalext.nrs.gov.bc.ca/web/client/-/forest-service-road-industrial-road-use-exemption.html",
    ],
  },
  {
    id: "significant-road-work",
    title: "Significant Road Work Authorization",
    category: "roads",
    summary:
      "Widening, realignment, major reconstruction, FSR connections, and major structure swaps can trigger a separate significant road work authorization.",
    roles: ["permitter", "recce"],
    trigger:
      "The road fix or access upgrade goes beyond routine maintenance and crosses into work the district wants reviewed before construction.",
    documents: [
      "significant road work application",
      "engineering attachments",
      "structure replacement details",
      "district review package",
    ],
    minimumWait: { label: "authorization must be issued before work starts", days: null },
    playerActions: [
      "decide whether the proposed fix is still maintenance or now significant road work",
      "package the engineering attachments before mobilizing machines",
      "sequence the authorization with the field window instead of against it",
    ],
    failureModes: [
      {
        id: "significant-road-work-without-auth",
        title: "Major road work proceeds without the right authorization",
        summary:
          "If the bridge swap or realignment starts before the district sees the right package, the access fix turns into a compliance event.",
      },
    ],
    sourceLabel: "District road requirements",
    sourceUrl: "https://www2.gov.bc.ca/gov/content/industry/natural-resource-use/resource-roads/district-road-requirements",
    sourceUrls: [
      "https://www2.gov.bc.ca/gov/content/industry/natural-resource-use/resource-roads/district-road-requirements",
    ],
  },
  {
    id: "road-notifications",
    title: "Road Notifications and Deactivation Paperwork",
    category: "roads",
    summary:
      "Industrial-use notices, road-construction commencement, intent to deactivate, and end-of-maintenance notifications create recurring administrative load.",
    roles: ["permitter", "recce"],
    trigger:
      "Access work is moving fast enough that notices and end-state filings can be missed unless someone keeps the sequence clean.",
    documents: [
      "notice of industrial use",
      "road construction commencement notice",
      "intent to deactivate road sections",
      "notification to end maintenance",
    ],
    minimumWait: { label: "timing depends on the notice type and field sequence", days: null },
    playerActions: [
      "send the right notice at the right time instead of batching them later",
      "tie field mobilization to the paperwork sequence",
      "close out maintenance and deactivation cleanly when the work winds down",
    ],
    failureModes: [
      {
        id: "road-notification-lapse",
        title: "Notice sequence breaks down",
        summary:
          "Missed commencement, deactivation, or end-of-maintenance notices make routine road work look sloppier and riskier than it had to be.",
      },
    ],
    sourceLabel: "NROS Portal for Electronic Applications",
    sourceUrl: "https://www2.gov.bc.ca/gov/content/industry/forestry/forest-tenures/electronic-applications",
    sourceUrls: [
      "https://www2.gov.bc.ca/gov/content/industry/forestry/forest-tenures/electronic-applications",
    ],
  },
  {
    id: "archaeology-screening-ladder",
    title: "Archaeology Screening Ladder",
    category: "heritage",
    summary:
      "Desktop screening can escalate to walkover, AIA, and alteration-permit requirements, and some systems stay locked to outside archaeologists.",
    roles: ["planner", "permitter", "recce"],
    trigger:
      "AOA screening or field indicators suggest cultural or archaeological potential inside the development footprint.",
    documents: [
      "AOA desktop screening record",
      "PFR or walkover notes",
      "heritage inspection permit package",
      "AIA report or alteration permit context",
    ],
    minimumWait: { label: "specialist and permit timelines can pause the file", days: null },
    playerActions: [
      "screen early and escalate when the desktop evidence is not enough",
      "wait for archaeologist-controlled systems or reports when required",
      "redesign or permit the work if the site cannot simply be ignored",
    ],
    failureModes: [
      {
        id: "archaeology-escalation-gap",
        title: "Desktop screening treated as final",
        summary:
          "Treating the archaeology screen like a clearance instead of a trigger for more work leaves the project exposed if field evidence appears later.",
      },
    ],
    sourceLabel: "BC archaeology permits and assessments",
    sourceUrl: "https://www2.gov.bc.ca/gov/content/industry/natural-resource-use/archaeology/assessments-studies",
    sourceUrls: [
      "https://www2.gov.bc.ca/gov/content/industry/natural-resource-use/archaeology/assessments-studies",
      "https://www2.gov.bc.ca/gov/content/industry/natural-resource-use/archaeology/assessments-studies/permits",
      "https://www2.gov.bc.ca/gov/content/industry/natural-resource-use/archaeology/systems/apts",
    ],
  },
  {
    id: "riparian-classification",
    title: "Riparian Classification Package",
    category: "water",
    summary:
      "Fish presence, channel width, watershed status, and riparian class all need to line up cleanly before the prescription feels defensible.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    trigger:
      "The project touches streams, wetlands, or community-watershed ground where riparian management area treatment must be justified.",
    documents: [
      "stream or wetland field call",
      "channel-width notes",
      "community-watershed context",
      "riparian reserve / management area mapping",
    ],
    minimumWait: { label: "field verification before treatment is finalized", days: null },
    playerActions: [
      "confirm fish presence and stream class before locking in treatment",
      "map the reserve and management area correctly",
      "defend the prescription with field notes strong enough to survive review",
    ],
    failureModes: [
      {
        id: "riparian-misclassification",
        title: "Riparian class does not match field reality",
        summary:
          "A bad watercourse call can infect layout, approvals, and post-work monitoring all at once.",
      },
    ],
    sourceLabel: "Riparian management area guidebook",
    sourceUrl: "https://www2.gov.bc.ca/gov/content/industry/forestry/managing-our-forest-resources/silviculture/training-resources/silviculture-guidebooks/riparian-management-area-guidebook",
    sourceUrls: [
      "https://www2.gov.bc.ca/gov/content/industry/forestry/managing-our-forest-resources/silviculture/training-resources/silviculture-guidebooks/riparian-management-area-guidebook",
    ],
  },
  {
    id: "fish-crossing-remediation",
    title: "Fish-Stream Crossing Design and Remediation",
    category: "water",
    summary:
      "Fish-bearing crossings can become their own mini-system of barrier checks, timing windows, structure choices, and remediation records.",
    roles: ["planner", "permitter", "recce"],
    trigger:
      "A road crossing on fish habitat fails, washes out, or looks likely to block fish passage if left as-is.",
    documents: [
      "fish passage assessment",
      "crossing design notes",
      "timing-window plan",
      "remediation or replacement record",
    ],
    minimumWait: { label: "structure timing depends on fish window and review timing", days: null },
    playerActions: [
      "decide whether the crossing needs remediation, replacement, or closure",
      "carry fish passage logic into the engineering and haul plan",
      "document the outcome instead of treating the crossing like a generic culvert swap",
    ],
    failureModes: [
      {
        id: "fish-passage-barrier",
        title: "Crossing remains a barrier or sediment source",
        summary:
          "If the crossing fix still blocks fish or keeps feeding sediment, the road file stays unstable no matter how fast the road reopens.",
      },
    ],
    sourceLabel: "Fish passage",
    sourceUrl: "https://www2.gov.bc.ca/gov/content/environment/plants-animals-ecosystems/fish/aquatic-habitat-management/fish-passage",
    sourceUrls: [
      "https://www2.gov.bc.ca/gov/content/environment/plants-animals-ecosystems/fish/aquatic-habitat-management/fish-passage",
    ],
  },
  {
    id: "special-use-permit",
    title: "Special Use Permit Stack",
    category: "occupancy",
    summary:
      "Short-term camps, helipads, log dumps, scales, and similar support infrastructure can need their own occupancy authority instead of riding for free inside the main file.",
    roles: ["permitter", "planner", "recce", "silviculture"],
    trigger:
      "Support infrastructure for camps, dumps, or staging areas grows large enough that the district expects separate occupancy authority.",
    documents: [
      "special use permit application",
      "occupancy maps",
      "site layout package",
      "support-site rationale",
    ],
    minimumWait: { label: "occupancy review must clear before the support footprint is defensible", days: null },
    playerActions: [
      "decide which support footprints need their own occupancy authority",
      "tighten maps and site layouts before the main file gets dragged backward",
      "shrink or redesign the footprint if the occupancy burden gets too heavy",
    ],
    failureModes: [
      {
        id: "special-use-occupancy-gap",
        title: "Support footprint outruns occupancy authority",
        summary:
          "An oversized camp, helipad, dump, or scale area quickly turns into a permitting problem if the occupancy file never catches up.",
      },
    ],
    sourceLabel: "Special Use Permit - Forestry",
    sourceUrl: "https://www2.gov.bc.ca/gov/content/industry/forestry/forest-tenures/timber-harvesting-rights/special-use-permit-forestry",
    sourceUrls: [
      "https://www2.gov.bc.ca/gov/content/industry/forestry/forest-tenures/timber-harvesting-rights/special-use-permit-forestry",
    ],
  },
];

export const MINISTRY_PROCESS_FAILURES = MINISTRY_PROCESS_HOOKS.flatMap((hook) =>
  (hook.failureModes || []).map((failure) => ({
    ...failure,
    roles: Array.isArray(failure.roles) && failure.roles.length ? failure.roles : hook.roles,
    processHookId: hook.id,
    processHookTitle: hook.title,
    category: hook.category,
    sourceLabel: hook.sourceLabel,
    sourceUrl: hook.sourceUrl,
    sourceUrls: hook.sourceUrls,
  })),
);

export function getMinistryProcessHook(id) {
  return MINISTRY_PROCESS_HOOKS.find((hook) => hook.id === id) || null;
}

export function getRoleMinistryProcessHooks(roleId, options = {}) {
  const limit = normalizeLimit(options.limit);
  const hooks = filterByRole(MINISTRY_PROCESS_HOOKS, roleId);
  return limit ? hooks.slice(0, limit) : hooks;
}

export function getRoleProcessFailureCatalog(roleId, options = {}) {
  const limit = normalizeLimit(options.limit);
  const failures = filterByRole(MINISTRY_PROCESS_FAILURES, roleId);
  return limit ? failures.slice(0, limit) : failures;
}
