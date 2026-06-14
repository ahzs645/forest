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
  content for these envelopes. *(Resolved in tuning pass #2.)*
- `registration-lapse` and `professional-audit` **never fire** under these
  policies — professional state only degrades through specific authored paths
  the bots don't take. *(Resolved in tuning pass #2.)*
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

## Tuning pass #2 (this PR)

This pass took three coordinated levers — all in the consequence/scoring layer,
none in the assignment content the maintainer warned against over-tuning.

**1. Reachable professional consequences.** In seasonal play the professional
subsystem was dormant (nothing fed `cpdHours`/`registrationStatus`), so
`registration-lapse` and `professional-audit` could never fire. They are now
driven by the signal the seasonal game actually moves: compliance below the
audit line (and an active audit escalation) raises `auditExposure`, which fires
`professional-audit`; a deep, sustained collapse (high exposure on top of
unmanaged competence risk) lapses registration. Healthy files are untouched.

**2. Reachable Outstanding.** The old gate required every meter ≥ 65 including
budget — impossible (budget never tops ~60 in 6,300 years; forest health rarely
clears ~60 outside silviculture). Outstanding now has two role-flavored paths
over a shared "nothing collapsed (≥ 44)" floor: a **stewardship** path (elite
compliance + relationships) and an **ecology** path (elite forest health that
stayed defensible).

**3. Recovery levers + less pile-on.** An *operational dividend* gives budget
back to clean, well-trusted files (the missing budget lever); a late-year
*comeback window* steadies the weakest meter on a still-salvageable run; and the
trust-deficit compliance bleed scales down once compliance is already collapsing
so a run in a hole isn't punished into oblivion.

**Before → after (matrix, 6,300 runs, seeds 1000–1024):**

| Signal | Before | After |
|---|---|---|
| Outstanding endings (any strategy) | 0 | 37 (greedy 19 · role-optimal 12 · weakest-metric 5 · random 1) |
| `registration-lapse` runs fired | 0 | 305 |
| `professional-audit` runs fired | 0 | 817 |
| Never-fired consequences | 2 | 0 |
| Avg budget (greedy / cautious) | 38.7 / 39.1 | 47.2 / 48.4 |
| Aggressive avg compliance | 11.7 | 14.4 |
| Aggressive stumble rate | 100% | 100% |

**Findings.** Outstanding is now reachable but rare (~0.6% of runs), split across
the two role paths (permitter via stewardship, silviculture via ecology), and no
strategy can reach it by ignoring progress — cautious stays Solid because it
trades progress away. Both professional consequences now fire for runs that let
compliance rot, so aggressive's risk reads as visible professional fallout. The
de-pile-on nudged aggressive's compliance up (11.7 → 14.4) but it still stumbles
every time: its compliance lands near ~14, far below the Mixed floor of 48, and
bridging that is a **content-layer** rebalance (the authored event/issue/temptation
penalties), exactly what lever #1 below describes. This pass deliberately stops
short of forcing aggressive up with a blunt floor.

## Tuning pass #3 (this PR)

This pass took recommended lever #1 — easing the *delayed* compliance pressure —
plus added the "repair compliance later" recovery the roadmap calls for. Both
sit in the consequence/recovery layer; the authored assignment content the
maintainer warned against over-tuning is untouched.

**1. De-pile-on at critical-low compliance.** `professional-audit` keeps its
scrutiny (the progress drag and the firing event still land, so the risk still
*reads*) but its compliance bleed eases from −2 to −1 once compliance is already
below 20. A file in a hole is no longer hammered by every layer at once.

**2. Field-discipline rebound (repair compliance later).** A new recovery: a run
that is still delivering real work (progress ≥ 55) but has let compliance slide
(< 35) can, from season 2 on, pause production to clean the file — compliance +5
at a cost of progress −2. It is the comeback tool for a fast-and-loose run that
wants to course-correct. It is recorded as a `recovery` (no risk-load penalty)
and is gated tightly enough that it never fires for cautious/greedy/role-optimal
play (their compliance stays above the gate).

**Before → after (aggressive, all roles/areas, 900 runs, seeds 1000–1024):**

| Metric | Before | After |
|---|---|---|
| Avg compliance | 15.1 | 23.9 |
| Avg progress | 67.4 | 63.3 |
| Avg relationships | 27.9 | 28.1 |
| Avg budget | 28.5 | 28.9 |
| Tier spread | 0/0/0/900 | 0/0/0/900 |

**Findings.** The change is fully contained: across the 6,300-run matrix only
aggressive's metrics moved (compliance +8.8, progress −4.1); greedy, cautious,
role-optimal, balanced, and random are byte-identical, so the guardrails hold
(balanced 0.86 still > random 0.81; Outstanding 0.7% still well under the 10%
cap; both professional consequences still fire). The *shape* improved — the
always-aggressive compliance collapse is now recoverable rather than a one-way
slide — but aggressive still stumbles every run, and that is the honest ceiling
for a consequence-layer pass. The blocker is structural: the Mixed tier needs
compliance ≥ 48 **and** relationships ≥ 45 **and** forest health ≥ 45, but the
always-aggressive bot floors relationships (~28) and budget (~29) at the same
time it floors compliance, so a compliance-only lever can never lift it to Mixed
without a blunt across-the-board rescue that would also distort the other six
policies. `tests/seasonalBalance.test.mjs` also deliberately pins the aggressive
envelope to 100% collapse. Bridging the rest is therefore a coordinated
*content-layer* rebalance (per-decision relationship/budget pressure on the
aggressive stance), deliberately left out of this pass — exactly the boundary
the notes above draw. For real (stance-mixing) players, the rebound is a genuine
comeback path: a player who plays loose early and then corrects can now claw
compliance back instead of hitting a wall.

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
