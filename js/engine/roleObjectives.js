// Role identity at the engine level. PR #49 gave each role a single ending-lens
// metric; this turns roles into scoring personalities: a primary metric they
// are judged on, secondary metrics that matter, the failure modes that read as
// "this role blew it," and a signature win. Used by scoring, the role lens, and
// (later) role-aware achievements and replay goals.

export const ROLE_OBJECTIVES = {
  planner: {
    primary: "compliance",
    secondary: ["relationships", "forestHealth"],
    failureModes: ["fom-consistency-gap", "environmental-audit-fallout"],
    signatureWin: "Defensible landscape plan",
    // One-line "what success looks like" mandate, shown at setup and on the
    // dashboard so the player always knows what they are judged on.
    mandate: "Keep compliance and relationships stable while advancing landscape planning.",
  },
  permitter: {
    primary: "compliance",
    secondary: ["progress", "relationships"],
    failureModes: ["permit-deficiency", "road-use-permit-standoff"],
    signatureWin: "Clean approval pipeline",
    mandate: "Protect compliance and progress while avoiding paperwork burn.",
  },
  recce: {
    primary: "relationships",
    secondary: ["compliance", "progress"],
    failureModes: ["heritage-protocol-gap", "wildlife-collar-drop"],
    signatureWin: "Ground truth protected the file",
    mandate: "Protect relationships and crew confidence while making field progress.",
  },
  silviculture: {
    primary: "forestHealth",
    secondary: ["budget", "compliance"],
    failureModes: ["seedlot-vigour-drop", "free-growing-catchup-plan"],
    signatureWin: "Regeneration trajectory stabilized",
    mandate: "Protect forest health while managing budget and contractors.",
  },
};

export function getRoleObjective(roleId) {
  return ROLE_OBJECTIVES[roleId] || null;
}
