/**
 * Role-Specific Mischief Options
 * One risky "mischief" option per task ID (matching task IDs in roles.js),
 * appended to the legacy role tasks by getRoleTasks (js/engine/content.js).
 * Each entry provides a risk object for use with resolveRisk().
 *
 * These follow the same rule as the illegal-act library: the shortcut pays
 * more than the honest options on the card, in the task's own currency, and
 * a success never raises compliance or goodwill — the thing you did is still
 * on the ground. The failure band is where it costs. `failFlags` are read by
 * the chained issues in js/data/chainedIssues.js.
 */

export const MISCHIEF_OPTIONS = {
  // ── Planner tasks ──────────────────────────────────────────────────

  landscape: {
    label: "Write up an engagement session that never happened",
    outcome: "You write the minutes and fill in the sign-in sheet.",
    risk: {
      baseSuccess: 0.50,
      successEffects: { progress: 12, compliance: -3 },
      failEffects: { compliance: -15, relationships: -12, progress: -5 },
      successOutcome:
        "The engagement record reads complete and the plan moves. The people named in it were never asked.",
      failOutcome:
        "A councillor from the Nation finds her name on the sign-in sheet of a meeting she never attended. The complaint reaches the district and the Nation's leadership in the same week.",
      failFlags: { underInvestigation: true },
    },
  },

  constraints: {
    label: "Edit the caribou habitat polygons out of the constraints layer",
    outcome: "You edit the layer.",
    risk: {
      baseSuccess: 0.45,
      successEffects: { progress: 10, forestHealth: -4 },
      failEffects: { forestHealth: -12, compliance: -15, progress: -3 },
      successOutcome:
        "The edited polygons slip through review and the blocks clear the constraints screen. The calving ground is still there; it is just not on the map.",
      failOutcome:
        "A ministry biologist compares the layer with the provincial data and finds the polygons edited. The district opens a compliance file on the planning package.",
      failFlags: { environmentalAudit: true },
    },
  },

  integration: {
    label: "Undercut a rival consultant with their leaked bid",
    outcome: "You open the attachment.",
    risk: {
      baseSuccess: 0.50,
      successEffects: { progress: 10, budget: 5, compliance: -2 },
      failEffects: { relationships: -15, compliance: -10, budget: -5 },
      successOutcome:
        "Your bid lands a hair under theirs and wins. Nobody can prove how you knew the number, yet.",
      failOutcome:
        "The rival's lawyer traces the leak to your inbox, and the client opens an ethics inquiry.",
      failFlags: { ethicsInquiry: true },
    },
  },

  // ── Permitter tasks ────────────────────────────────────────────────

  package: {
    label: "Forge a referral partner's sign-off to close the file",
    outcome: "You copy the signature off an old letter.",
    risk: {
      baseSuccess: 0.40,
      successEffects: { progress: 11, compliance: -3 },
      failEffects: { compliance: -20, relationships: -10 },
      successOutcome:
        "The forged sign-off sits in the stack with the real ones, and the permits move.",
      failOutcome:
        "The partner says she never signed it. The district pauses the file and refers the forged document to the RCMP.",
      failFlags: { forgeryInvestigation: true },
    },
  },

  referrals: {
    label: "Backdate a consultation record to cover the gap",
    outcome: "You change the date on the letter.",
    risk: {
      baseSuccess: 0.55,
      successEffects: { progress: 9, compliance: -2 },
      failEffects: { compliance: -15, relationships: -12 },
      successOutcome:
        "The backdated letter fills the gap, and the file reads complete. The conversation it records never took place.",
      failOutcome:
        "The email timestamps contradict the letter's date. The Nation's referrals office stops taking your calls, and the district asks who wrote it.",
      failFlags: { underInvestigation: true },
    },
  },

  tracking: {
    label: "Bury a non-compliance notice in the filing system",
    outcome: "You file the notice where nobody will look for it.",
    risk: {
      baseSuccess: 0.50,
      successEffects: { progress: 9, budget: 4, compliance: -2 },
      failEffects: { compliance: -18, budget: -8 },
      successOutcome:
        "The notice goes into a mislabelled folder and the quarterly review passes without it. The problem it described is still on the ground.",
      failOutcome:
        "An auditor pulls the original file, and the buried notice turns a routine review into an expanded one.",
      failFlags: { auditTriggered: true },
    },
  },

  // ── Recce tasks ────────────────────────────────────────────────────

  access: {
    label: "Push an unpermitted trail through to save a week",
    outcome: "You wave the machine through.",
    risk: {
      baseSuccess: 0.55,
      successEffects: { progress: 10, budget: 3, forestHealth: -3 },
      failEffects: { compliance: -15, forestHealth: -8 },
      successOutcome:
        "The trail holds and the crew reaches the far blocks a week ahead. It crosses the riparian reserve twice.",
      failOutcome:
        "A flyover photographs the fresh cut through the riparian reserve, and the district issues a stop-work order.",
      failFlags: { environmentalViolation: true },
    },
  },

  intel: {
    label: "Leave the cultural features out of the notes and keep the machines running",
    outcome: "You close the notebook.",
    risk: {
      baseSuccess: 0.40,
      successEffects: { progress: 9, compliance: -3 },
      failEffects: { relationships: -20, compliance: -12 },
      successOutcome:
        "Nobody records the features, and the crew finishes the block without a stop. Whatever was there is under the road now.",
      failOutcome:
        "Elders visit the block and find the disturbed site. The Nation files a formal grievance, and the Archaeology Branch is notified.",
      failFlags: { culturalViolation: true },
    },
  },

  safety: {
    label: "Sign the tailgate records for meetings that did not happen",
    outcome: "You sign the week's tailgate sheets.",
    risk: {
      baseSuccess: 0.50,
      successEffects: { progress: 8, budget: 3, compliance: -2 },
      failEffects: { compliance: -18, relationships: -8 },
      successOutcome:
        "The safety file passes every checkbox. The meetings it records never happened.",
      failOutcome:
        "After a real incident, a crew member tells the investigator the signed tailgate meetings were never held. WorkSafeBC opens an investigation.",
      failFlags: { safetyInvestigation: true },
    },
  },

  // ── Silviculture tasks ─────────────────────────────────────────────

  planting: {
    label: "Bury the surplus seedlings in a snow cache and report them planted",
    outcome: "You sign the planting report.",
    risk: {
      baseSuccess: 0.50,
      successEffects: { progress: 9, budget: 5, forestHealth: -3 },
      failEffects: { forestHealth: -15, compliance: -12 },
      successOutcome:
        "The numbers add up on paper and planting comes in under budget for once. The block is short the trees the report says it has.",
      failOutcome:
        "Spring melt uncovers a pile of dead seedlings in a creek draw, and the regeneration survey fails the block.",
      failFlags: { plantingFraud: true },
    },
  },

  regen: {
    label: "Swap the species labels to pass the regeneration survey",
    outcome: "You change the tally codes.",
    risk: {
      baseSuccess: 0.45,
      successEffects: { progress: 8, compliance: -3 },
      failEffects: { forestHealth: -18, compliance: -15 },
      successOutcome:
        "The tally matches the prescription perfectly — on paper. The block still grows what it grows.",
      failOutcome:
        "A check survey finds lodgepole where the label says spruce, and the whole block is flagged for re-survey.",
      failFlags: { silvicultureAudit: true },
    },
  },

  reporting: {
    label: "Pay the surveyor to fudge the free-growing numbers",
    outcome: "You hand over the envelope.",
    risk: {
      baseSuccess: 0.45,
      successEffects: { progress: 9, budget: 4, compliance: -3 },
      failEffects: { compliance: -20, budget: -8, relationships: -5 },
      successOutcome:
        "Every plot hits the stocking standard and the block is declared free growing. The brushing it still needs is somebody else's now.",
      failOutcome:
        "The surveyor talks after a few beers, and the district orders a re-survey of every block he did for you.",
      failFlags: { freeGrowingFraud: true },
    },
  },
};
