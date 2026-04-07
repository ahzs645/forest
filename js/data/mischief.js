/**
 * Role-Specific Mischief Options
 * One risky "mischief" option per task ID (matching task IDs in roles.js).
 * Each entry provides a risk object for use with resolveRisk().
 */

export const MISCHIEF_OPTIONS = {
  // ── Planner tasks ──────────────────────────────────────────────────

  landscape: {
    label: "Fabricate community engagement data to skip consultation",
    outcome: "You attempt something risky...",
    risk: {
      baseSuccess: 0.50,
      successEffects: { progress: 8, relationships: 4, compliance: -1 },
      failEffects: { compliance: -15, relationships: -10, progress: -5 },
      successOutcome:
        "The ministry accepts your pristine engagement record. Nobody checks the attendance sheet.",
      failOutcome:
        "A band council member notices their name on a meeting they never attended. Formal complaint filed.",
      failFlags: { underInvestigation: true },
    },
  },

  constraints: {
    label: "Doctor the habitat assessment to fast-track approvals",
    outcome: "You attempt something risky...",
    risk: {
      baseSuccess: 0.45,
      successEffects: { progress: 10, compliance: 3 },
      failEffects: { forestHealth: -12, compliance: -15, progress: -3 },
      successOutcome:
        "The amended polygon boundaries slip through review. Caribou calving grounds conveniently vanish from the map.",
      failOutcome:
        "A biologist spots the altered shapefiles. Environment ministry launches a habitat audit.",
      failFlags: { environmentalAudit: true },
    },
  },

  integration: {
    label: "Leak a rival firm's bid to secure the planning contract",
    outcome: "You attempt something risky...",
    risk: {
      baseSuccess: 0.50,
      successEffects: { progress: 8, budget: 5 },
      failEffects: { relationships: -15, compliance: -10, budget: -5 },
      successOutcome:
        "Your suspiciously precise counter-bid wins. Nobody can prove anything... yet.",
      failOutcome:
        "The rival's lawyer traces the leak. Your firm faces an ethics inquiry.",
      failFlags: { ethicsInquiry: true },
    },
  },

  // ── Permitter tasks ────────────────────────────────────────────────

  package: {
    label: "Forge a partner's signature to bypass the referral",
    outcome: "You attempt something risky...",
    risk: {
      baseSuccess: 0.40,
      successEffects: { progress: 10, compliance: 2 },
      failEffects: { compliance: -20, relationships: -10 },
      successOutcome:
        "The forged signature blends perfectly with the stack. Permits sail through.",
      failOutcome:
        "The partner denies ever signing. Ministry suspends processing and launches a forgery investigation.",
      failFlags: { forgeryInvestigation: true },
    },
  },

  referrals: {
    label: "Backdate a consultation record to cover the gap",
    outcome: "You attempt something risky...",
    risk: {
      baseSuccess: 0.55,
      successEffects: { progress: 7, relationships: 3 },
      failEffects: { compliance: -15, relationships: -12 },
      successOutcome:
        "The backdated letter fills the gap perfectly. The file looks complete.",
      failOutcome:
        "Email timestamps contradict the letter date. Trust with the Nation is shattered.",
      failFlags: { underInvestigation: true },
    },
  },

  tracking: {
    label: "Bury a non-compliance notice in the filing system",
    outcome: "You attempt something risky...",
    risk: {
      baseSuccess: 0.50,
      successEffects: { compliance: 6, progress: 5 },
      failEffects: { compliance: -18, budget: -8 },
      successOutcome:
        "The notice vanishes into a mislabeled folder. Quarterly review passes without incident.",
      failOutcome:
        "An auditor pulls the original file. The buried notice triggers an expanded review.",
      failFlags: { auditTriggered: true },
    },
  },

  // ── Recce tasks ────────────────────────────────────────────────────

  access: {
    label: "Push an unpermitted goat trail to save a week",
    outcome: "You attempt something risky...",
    risk: {
      baseSuccess: 0.55,
      successEffects: { progress: 10, budget: 3 },
      failEffects: { compliance: -15, forestHealth: -8 },
      successOutcome:
        "The bootleg trail holds. Crews reach the far blocks a week ahead of schedule.",
      failOutcome:
        "A flyover photos the fresh cut through riparian reserve. Stop-work order issued.",
      failFlags: { environmentalViolation: true },
    },
  },

  intel: {
    label: "Overlook the cultural features and keep the dozers running",
    outcome: "You attempt something risky...",
    risk: {
      baseSuccess: 0.40,
      successEffects: { progress: 8, compliance: 2 },
      failEffects: { relationships: -20, compliance: -12 },
      successOutcome:
        "The features were inconclusive anyway. Crews finish the block without interruption.",
      failOutcome:
        "Elders visit the block and find disturbed artifacts. Community launches a formal grievance.",
      failFlags: { culturalViolation: true },
    },
  },

  safety: {
    label: "Falsify tailboard records to keep operations moving",
    outcome: "You attempt something risky...",
    risk: {
      baseSuccess: 0.50,
      successEffects: { progress: 8, budget: 3 },
      failEffects: { compliance: -18, relationships: -8 },
      successOutcome:
        "The paperwork looks perfect. The safety file passes every audit checkbox.",
      failOutcome:
        "A crew member reports the fake records after a real incident. WorkSafeBC investigation launched.",
      failFlags: { safetyInvestigation: true },
    },
  },

  // ── Silviculture tasks ─────────────────────────────────────────────

  planting: {
    label: "Bury excess seedlings in a snow cache and claim them planted",
    outcome: "You attempt something risky...",
    risk: {
      baseSuccess: 0.50,
      successEffects: { progress: 10, budget: 5 },
      failEffects: { forestHealth: -15, compliance: -12 },
      successOutcome:
        "The numbers add up on paper. Planting costs come in under budget for once.",
      failOutcome:
        "Spring melt reveals a pile of dead seedlings in a creek draw. Regen survey fails spectacularly.",
      failFlags: { plantingFraud: true },
    },
  },

  regen: {
    label: "Swap species labels to pass the regeneration survey",
    outcome: "You attempt something risky...",
    risk: {
      baseSuccess: 0.45,
      successEffects: { compliance: 8, forestHealth: 3, progress: 5 },
      failEffects: { forestHealth: -18, compliance: -15 },
      successOutcome:
        "The tallied seedlings match the prescription perfectly — on paper.",
      failOutcome:
        "A spot-check reveals lodgepole where the label says spruce. The whole block is flagged for re-survey.",
      failFlags: { silvicultureAudit: true },
    },
  },

  reporting: {
    label: "Pay the surveyor to fudge the free-growing numbers",
    outcome: "You attempt something risky...",
    risk: {
      baseSuccess: 0.45,
      successEffects: { compliance: 10, progress: 5 },
      failEffects: { compliance: -20, budget: -8, relationships: -5 },
      successOutcome:
        "Every plot miraculously hits the stocking standard. The block is declared free-growing.",
      failOutcome:
        "The surveyor talks after a few beers. Ministry orders a complete re-survey of the tenure.",
      failFlags: { freeGrowingFraud: true },
    },
  },
};
