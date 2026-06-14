# Seasonal Balance Findings

Generated from the deterministic harness (`npm run sim:seasonal -- --matrix`,
25 seeds × 4 roles × 9 areas × 7 strategies = 6,300 simulated years). See
`seasonal-balance-summary.md` for the current table and
`seasonal-balance-data.json` for the machine-readable aggregate.

## How to read this

Each "strategy" is a **bot policy**, not a human. `aggressive` takes the
aggressive stance on *every* decision; `cautious` takes the cautious stance on
*every* decision. Real players mix stances, so these are deliberately extreme
envelopes that bracket human play — useful for spotting structural problems, but
**not** targets to tune the game directly onto. Tuning chases the *shape* of the
envelope, not the bots' exact tiers.

## Phase 4 targets vs. observed

| Target | Observed (baseline) | Verdict |
|---|---|---|
| Balanced safest, not always highest | Balanced mean tier 0.84, below cautious/greedy | Partly off — balanced is mid, not safest |
| Cautious protects compliance/trust, risks progress/budget | Compliance ~86, progress ~21 | On target |
| Aggressive wins progress, creates *visible future problems* | Progress ~69 but compliance ~8 → **100% stumble** | Too punishing — guaranteed loss, not "risky" |
| Role-optimal performs well, not guaranteed Outstanding | Mean tier 1.33, no Outstanding | On target |
| Random usually Mixed | 0/10/684/206 | On target |

Other structural notes:

- **No strategy ever reaches "Outstanding"** across 6,300 years. The Outstanding
  gate needs every meter ≥ 65 including budget, but budget structurally drifts
  down (avg ~38–44 even for the best policies). Outstanding is currently dead
  content for these envelopes.
- `registration-lapse` and `professional-audit` **never fire** under these
  policies — professional state only degrades through specific authored paths
  the bots don't take.
- Difficulty by combo is fairly flat (mean tier ~0.98–1.20); no single role/area
  is wildly easy or punishing.

## Tuning pass #1 (this PR)

**Change (one layer — assignment option effects):** capped the aggressive
stance's compliance penalty at **-3** (it ranged -4/-5 across the seven
assignment families). Progress upside unchanged.

**Before → after (aggressive, all roles/areas, 900 runs):**

| Metric | Before | After |
|---|---|---|
| Avg compliance | 7.6 | 11.7 |
| Avg progress | 69.5 | 69.5 |
| Tier spread | 0/0/0/900 | 0/0/0/900 |

**Finding:** the change nudged compliance up but did **not** move aggressive off
a 100% stumble. That is the useful result: the always-aggressive collapse is
driven mostly by **non-assignment** content (events, issues, temptations, and
the round-end compliance/audit consequences), not the assignment stance. Pushing
the assignment effects further would over-tune one layer to compensate for the
others — explicitly what the roadmap warns against. Greedy/cautious/role-optimal
were unaffected (the tune only touches options the aggressive-leaning policies
pick), so the change is contained.

## Recommended next levers (future passes, one at a time)

1. **Aggressive depth:** rebalance the *delayed* compliance/audit pressure
   (consequence thresholds + temptation fallout) so aggressive frequently lands
   Mixed and occasionally stumbles, instead of always stumbling — making the
   risk feel like "future problems" rather than a guaranteed wall.
2. **Balanced safety:** small, consistent relationships/forest-health floor on
   the balanced stance so it becomes the dependable middle (currently it trails
   cautious and greedy).
3. **Outstanding reachability:** revisit the budget economy (few options restore
   budget) so disciplined play can clear the Outstanding floors.

Each should ship with its own before/after block here.
