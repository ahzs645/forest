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
  },
  permitter: {
    primary: "compliance",
    secondary: ["progress", "relationships"],
    failureModes: ["permit-deficiency", "road-use-permit-standoff"],
    signatureWin: "Clean approval pipeline",
  },
  recce: {
    primary: "relationships",
    secondary: ["compliance", "progress"],
    failureModes: ["heritage-protocol-gap", "wildlife-collar-drop"],
    signatureWin: "Ground truth protected the file",
  },
  silviculture: {
    primary: "forestHealth",
    secondary: ["budget", "compliance"],
    failureModes: ["seedlot-vigour-drop", "free-growing-catchup-plan"],
    signatureWin: "Regeneration trajectory stabilized",
  },
};

export function getRoleObjective(roleId) {
  return ROLE_OBJECTIVES[roleId] || null;
}
