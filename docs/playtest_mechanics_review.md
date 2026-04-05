# Playtest review (CLI pass) — mechanics to improve

Date: 2026-04-02

## How this was tested

- Ran `node cli.mjs --runs 8 --rounds 4 --log` to do full seasonal runs with heuristic choices.
- Ran `node test_strategies.js` to compare all role/area combinations.

## Observed friction points

1. **Stats cap too easily (especially compliance/relationships).**
   - In the matrix run, most role/area combinations hit 100 for compliance and relationships.
   - This flattens interesting trade-offs and weakens replay variety.

2. **Role task choices dominate events.**
   - Repeatedly selecting “best weighted” task options pushes metrics up faster than issues pull them down.
   - Outcomes cluster around “Outstanding season,” reducing tension.

3. **Budget pressure is uneven by role.**
   - Recon tends to drift into low budget while still performing strongly in other dimensions.
   - Other roles often retain enough buffer that budget decisions feel less meaningful.

4. **Issue repetition is noticeable within a single 4-round year.**
   - The same issue can recur in back-to-back rounds (e.g., heat dome or water turbidity beats).
   - Repetition weakens the narrative arc and perceived world reactivity.

5. **Few true downside spirals.**
   - Even when one stat degrades, others remain maxed and summary messaging stays positive.
   - The simulator currently rewards optimization but rarely punishes over-specialization.

## Mechanics improvement backlog (recommended)

### 1) Add diminishing returns near high values
- When a metric is above a threshold (e.g., 75+), reduce positive gains by 30–60%.
- This preserves progression but prevents routine stat capping.

### 2) Add stronger cross-metric trade-offs
- Increase negative side effects for “safe best” options (e.g., compliance gains should more often tax progress/budget).
- Add role-specific opportunity cost rules so no role can dominate all axes simultaneously.

### 3) Add issue cooldowns and story chaining
- Prevent the same issue ID from appearing again within 2 rounds unless part of an explicit multi-part chain.
- Convert repeats into escalation beats (part 1/2/3) with changing options and outcomes.

### 4) Add threshold-triggered consequences
- If budget < 25 for 2 consecutive rounds, trigger contractor attrition or delayed permitting.
- If relationships < 35, lock out high-trust options until recovery actions are taken.
- If compliance < 40, add audit events with heavier penalties.

### 5) Rebalance heuristically “best” options
- Run an automated sweep to identify options over-selected by weighted scoring.
- Reduce their upside or add situational prerequisites.

### 6) Improve end-of-year scoring spread
- Tighten “Outstanding” conditions so exceptional outcomes require true balance (not just 2-3 capped metrics).
- Add more “mixed”/“fragile success” summary variants tied to volatility and low-stat dips.

## Fast validation plan after tuning

- Re-run `node test_strategies.js` and target fewer capped metrics (especially compliance/relationships).
- Re-run `node cli.mjs --runs 20 --rounds 4` and verify broader spread of summary outcomes.
- Track issue diversity per run (target: no identical issue in consecutive rounds unless chained).

## Implemented tuning pass (2026-04-04)

Implemented in `js/engine.js`:

- **Diminishing returns for positive gains** once metrics are already high:
  - 75+ metric: positive effects reduced to 60%.
  - 90+ metric: positive effects reduced to 35%.
- **Issue repeat cooldown**:
  - The same issue is now filtered out for the next 2 rounds when alternatives exist.
- **Stricter “Outstanding” summary gate**:
  - Requires weighted average >= 82 *and* every metric >= 65.

Re-test snapshot:

- `node cli.mjs --runs 8 --rounds 4 --log` shifted outcomes from mostly “Outstanding” to mostly “Solid performance with room to fine-tune priorities next cycle.”
- `node test_strategies.js` still trends strong, but no longer hard-caps most combinations at 100 across compliance/relationships, indicating healthier spread.

## Follow-up tuning pass (continued run focus) — 2026-04-05

Additional mechanics change:

- Added **automatic threshold consequences** after each issue resolution:
  - Budget under 25 now drags progress/compliance.
  - Relationships under 35 now drags progress/compliance.
  - Compliance under 40 now drags relationships/budget.
- This introduces downside spirals when weak metrics are ignored, addressing the “few true downside spirals” finding.
- Added a **minimum-metric gate** for summary grading:
  - “Solid performance” now also requires the weakest metric to stay at least 35.
  - Prevents very high averages from masking one collapsing pillar (commonly budget in recon-heavy runs).
- Added **pace-pressure attrition** to better match Oregon Trail dynamics:
  - When progress is pushed above 80, an automatic budget penalty applies.
  - Field journeys also lose forest-health (rushed operations).
  - Desk journeys lose relationships (stakeholder fatigue from rushed approvals).

Continued-run checks:

- `node cli.mjs --runs 4 --rounds 8 --log` to stress longer campaigns.
- `node cli.mjs --runs 12 --rounds 4` to sample broader variance.
- `node cli.mjs --runs 1 --rounds 8 --role planner --area skeena-nass --log`
- `node cli.mjs --runs 1 --rounds 8 --role permitter --area fraser-plateau --log`
- `node cli.mjs --runs 1 --rounds 8 --role recce --area muskwa-foothills --log`
- `node cli.mjs --runs 1 --rounds 8 --role silviculture --area bulkley-valley --log`
