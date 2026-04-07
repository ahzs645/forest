/**
 * Chained Issues — follow-up events triggered by flags set during earlier
 * player choices.  Import and spread into ISSUE_LIBRARY so the engine can
 * surface them when flag conditions are met.
 */
export const CHAINED_ISSUES = [
  // ───────────────────────────────────────────────
  //  1. Triggered by regular task choices
  // ───────────────────────────────────────────────

  {
    id: "ministry-data-audit",
    title: "Ministry Data Audit",
    description:
      "The ministry noticed your landscape plan relies on last cycle's hydrology data. An auditor wants to review your spatial inputs.",
    roles: ["planner"],
    areaTags: [],
    requiresFlags: ["outdatedData"],
    excludeFlags: ["dataAuditResolved"],
    baseWeight: 1,
    options: [
      {
        label: "Commission emergency updated LiDAR",
        outcome:
          "Expensive, but the fresh data impresses the auditor and strengthens the plan.",
        effects: { progress: -3, compliance: 5, forestHealth: 3, budget: -5 },
        clearFlags: ["outdatedData"],
        setFlags: { dataAuditResolved: true },
      },
      {
        label: "Defend the existing dataset in writing",
        outcome:
          "Your memo is technically sound but the auditor marks the file for follow-up next year.",
        effects: { progress: 2, compliance: -4, relationships: -2 },
      },
      {
        label: "Blame the previous planner's handover notes",
        outcome:
          "The auditor shrugs but your predecessor's friends on council are furious.",
        effects: { relationships: -6, compliance: 1, progress: 3 },
      },
    ],
  },

  {
    id: "permit-deficiency",
    title: "Permit Deficiency Notice",
    description:
      "The ministry returns a batch of permits flagged as deficient. Rushed documentation has gaps.",
    roles: ["permitter"],
    areaTags: [],
    requiresFlags: ["rushJob"],
    excludeFlags: ["deficiencyResolved"],
    baseWeight: 1,
    options: [
      {
        label: "Pull an all-nighter to fix the package",
        outcome:
          "The revised package is bulletproof. Ministry approves within the week.",
        effects: { progress: -4, compliance: 6, budget: -2 },
        clearFlags: ["rushJob"],
        setFlags: { deficiencyResolved: true },
      },
      {
        label: "Argue the deficiencies are cosmetic",
        outcome:
          "Some corrections are accepted but three permits are returned again.",
        effects: { progress: 3, compliance: -5, relationships: -3 },
      },
      {
        label: "Hire a contract RPF to redo the submissions",
        outcome:
          "The professional polish is unmistakable. Costly, but the file is now ironclad.",
        effects: { progress: -1, compliance: 7, budget: -6 },
        clearFlags: ["rushJob"],
        setFlags: { deficiencyResolved: true },
      },
    ],
  },

  {
    id: "community-blockade",
    title: "Community Road Blockade",
    description:
      "Members of the local Nation have set up a checkpoint on the main access road. They want answers about the cultural features your crew documented but kept working through.",
    roles: ["recce"],
    areaTags: [],
    requiresFlags: ["culturalTension"],
    excludeFlags: ["blockadeResolved"],
    baseWeight: 1,
    options: [
      {
        label: "Halt all operations and meet elders on-site",
        outcome:
          "Two days of respectful dialogue lead to a shared protection plan. The blockade lifts peacefully.",
        effects: { progress: -6, relationships: 8, compliance: 4 },
        clearFlags: ["culturalTension"],
        setFlags: { blockadeResolved: true },
      },
      {
        label: "Send the company liaison to negotiate access",
        outcome:
          "Partial agreement reached. The checkpoint stays but lets essential vehicles through.",
        effects: { progress: -2, relationships: 3, compliance: 2 },
      },
      {
        label: "Seek a court injunction to reopen the road",
        outcome:
          "The injunction is granted but the Nation vows to fight every future referral. Media picks up the story.",
        effects: { progress: 4, relationships: -12, compliance: -3 },
      },
    ],
  },

  {
    id: "regulatory-spotlight",
    title: "Regulatory Spotlight",
    description:
      "As warned, regulators are watching closely. A compliance officer shows up unannounced to inspect the blocks you pushed through with enhanced mitigation.",
    roles: ["planner"],
    areaTags: [],
    requiresFlags: ["regulatoryScrutiny"],
    excludeFlags: ["scrutinyResolved"],
    baseWeight: 1,
    options: [
      {
        label: "Walk the blocks personally and show the mitigation working",
        outcome:
          "The officer is impressed by the on-ground results. File noted as exemplary.",
        effects: { progress: -2, compliance: 6, forestHealth: 2, relationships: 3 },
        clearFlags: ["regulatoryScrutiny"],
        setFlags: { scrutinyResolved: true },
      },
      {
        label: "Provide the paperwork and let it speak for itself",
        outcome:
          "Adequate but uninspiring. The officer schedules another visit next quarter.",
        effects: { compliance: 2, progress: 1 },
      },
      {
        label: "Delay the visit citing safety concerns",
        outcome:
          "The officer is not amused. Your file moves to the priority audit queue.",
        effects: { progress: 3, compliance: -6, relationships: -2 },
      },
    ],
  },

  // ───────────────────────────────────────────────
  //  2. Triggered by mischief / investigation flags
  // ───────────────────────────────────────────────

  {
    id: "formal-investigation",
    title: "Formal Investigation",
    description:
      "A formal investigation has been opened. Inspectors arrive with files, questions, and a mandate to dig deep.",
    roles: ["planner", "permitter", "recce", "silviculture"],
    areaTags: [],
    requiresAnyFlags: [
      "underInvestigation",
      "forgeryInvestigation",
      "environmentalViolation",
      "safetyInvestigation",
      "culturalViolation",
      "ethicsInquiry",
    ],
    excludeFlags: ["investigationResolved"],
    baseWeight: 3,
    options: [
      {
        label: "Cooperate fully and open all records",
        outcome:
          "Full transparency leads to a stern warning and a compliance plan, but no charges.",
        effects: { progress: -5, compliance: 5, relationships: 3, budget: -4 },
        clearFlags: [
          "underInvestigation",
          "forgeryInvestigation",
          "environmentalViolation",
          "safetyInvestigation",
          "culturalViolation",
          "ethicsInquiry",
        ],
        setFlags: { investigationResolved: true },
      },
      {
        label: "Retain legal counsel and say nothing",
        outcome:
          "The lawyers slow things down but costs pile up. The investigation remains open.",
        effects: { budget: -8, compliance: -2, progress: -3 },
      },
      {
        label: "Blame a subcontractor and provide selective documents",
        outcome:
          "The subcontractor disputes your version. Investigators widen their scope.",
        effects: { relationships: -8, compliance: -4, progress: 2 },
      },
    ],
  },

  {
    id: "environmental-audit-fallout",
    title: "Environmental Audit Fallout",
    description:
      "Environment ministry auditors have flagged irregularities in your ecological data. A field verification team is being dispatched.",
    roles: ["planner", "silviculture"],
    areaTags: [],
    requiresAnyFlags: [
      "environmentalAudit",
      "silvicultureAudit",
      "plantingFraud",
      "freeGrowingFraud",
    ],
    excludeFlags: ["envAuditResolved"],
    baseWeight: 3,
    options: [
      {
        label: "Fund a third-party ecological review",
        outcome:
          "The independent review finds problems but your proactive response earns credit.",
        effects: { budget: -8, compliance: 6, forestHealth: 4, progress: -4 },
        clearFlags: [
          "environmentalAudit",
          "silvicultureAudit",
          "plantingFraud",
          "freeGrowingFraud",
        ],
        setFlags: { envAuditResolved: true },
      },
      {
        label: "Challenge the audit methodology",
        outcome:
          "Your technical objections delay the process but the auditors double down.",
        effects: { compliance: -5, progress: 3, relationships: -3 },
      },
      {
        label: "Accept the findings and commit to remediation",
        outcome:
          "The remediation plan is expensive but restores credibility with both regulators and communities.",
        effects: { progress: -6, forestHealth: 5, compliance: 4, relationships: 2 },
        clearFlags: [
          "environmentalAudit",
          "silvicultureAudit",
          "plantingFraud",
          "freeGrowingFraud",
        ],
        setFlags: { envAuditResolved: true },
      },
    ],
  },

  {
    id: "budget-freeze",
    title: "Budget Freeze",
    description:
      "Finance has frozen discretionary spending pending an internal audit. Your operational flexibility is severely constrained.",
    roles: ["permitter", "planner"],
    areaTags: [],
    requiresAnyFlags: ["auditTriggered"],
    excludeFlags: ["budgetFreezeResolved"],
    baseWeight: 2,
    options: [
      {
        label: "Prioritize critical path items only",
        outcome:
          "Tight focus gets essentials done. The freeze lifts after a clean quarterly review.",
        effects: { progress: -4, budget: 4, compliance: 3 },
        clearFlags: ["auditTriggered"],
        setFlags: { budgetFreezeResolved: true },
      },
      {
        label: "Lobby the regional manager for an exception",
        outcome:
          "Partial exception granted for field work, but office budgets remain frozen.",
        effects: { budget: -2, relationships: -3, progress: 2 },
      },
      {
        label: "Redirect crew budgets to cover the gap",
        outcome:
          "Crews grumble about lost overtime pay. Work continues but morale tanks.",
        effects: { progress: 5, relationships: -5, budget: -3 },
      },
    ],
  },
];
