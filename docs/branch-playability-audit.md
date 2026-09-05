# Branch playability audit

Reviewed September 4, 2026 (Pacific), against `origin/main` at `15fcc0b`.
Integration branch: `codex/playability-branch-integration`.

The original local checkout was 24 commits behind GitHub. This integration
starts from the current remote main so its mobile layout, one-action days,
three-band event outcomes, and save/resume fixes are included.

## Every remote branch

Decisions use commit ancestry, `git cherry`, branch-only diffs, and comparison
with the current implementation. A unique commit does not necessarily mean
its code is missing: several changes were integrated under different commits.
`origin/HEAD` is a pointer to main, not another branch.

| Branch | Tip | Decision and evidence |
| --- | --- | --- |
| `main` | `15fcc0b` | Base. Includes PRs 57–59: mobile fixes, day-as-situation gameplay, graded outcomes, save/resume, shared event handling, lint and mobile tests. |
| `claude/game-playthrough-feedback-ppek37` | `30b9f2c` | Adapt selected changes: manager escalations, seasonal depth and ordering, season-specific issues, card framing, and missing event warnings. Details below. |
| `4hrvox-codex/make-interface-mobile-friendly` | `e121ef6` | Skip. Old viewport/CSS work targets a retired layout; main's current desktop and mobile flows pass browser tests. |
| `add-glossary-tests-10943531549686911476` | `f96374f` | Skip. Empty commit: despite its title, it contains no file changes to recover. |
| `claude/improve-game-design-uzCd8` | `ae4d5b4` | Skip the overhaul. It changes old crew, scoring, multi-action loops and event selection, overlapping later implementations. Discovery flavor/forecasting could be adapted in a future content pass; they are not required for the current progression fixes. |
| `claude/improve-game-usability-011CULZxqrtMnFvBjEhZWnaZ` | `51afe09` | Skip. Legacy CLI/demo utilities and old HUD styles are superseded by the actual-mode simulation harness and browser tests. |
| `codex/compile-bc-interior-forestry-context` | `380ddd2` | Skip. Early Python/JavaScript game scaffold and forestry notes predate the current modular game and province-wide content. |
| `codex/evaluate-game-mechanics-for-improvement-30aktm` | `122ed36` | Skip. Same patch as the next three rows. Current engine already implements diminishing returns, cooldowns, stress consequences, and graded ending criteria. |
| `codex/evaluate-game-mechanics-for-improvement-6e16bb` | `6db5205` | Skip. Identical patch to `122ed36`. |
| `codex/evaluate-game-mechanics-for-improvement-6q39p5` | `4488078` | Skip. Identical patch to `122ed36`. |
| `codex/evaluate-game-mechanics-for-improvement-usnhv1` | `f179f0f` | Skip. Identical patch to `122ed36`. |
| `codex/implement-gameplay-and-content-enhancements-dzdr9p` | `e40ee52` | Already integrated. `git cherry` reports a patch-equivalent commit in main for its issue expansion and feedback systems. |
| `fix-revision-logic-17534807625762873090` | `df32fd1` | Already integrated. Patch equivalent in main; revision handling and its regression test are present. |
| `fix-xss-modal-innerhtml-6380887322336193712` | `c35147a` | Already integrated. Patch equivalent in main; modal strings use textContent and log rows are constructed as DOM nodes. |
| `fyx1c5-codex/enhance-mobile-ui-for-button-container` | `d58f594` | Skip. Swipeable choices and prompt changes target the retired button-container/askChoice interface. Current choices use the shared input renderer and scroll within the phone viewport. |
| `improve-gameplay-ui-logic` | `4c4e42b` | Skip. Old mischief selection, joke content, and styles overlap the current temptation engine and compliance-intel library. |
| `jules/game-overhaul` | `5625286` | Skip. Old role-task tuning and UI/content changes would overwrite later balancing and interface work. |
| `perf/modal-high-risk-lookup-11164130856650404496` | `a2297c8` | Code already present: main uses the same HIGH_RISK_TAGS/ELEVATED_RISK_TAGS Sets. Do not import its committed browser-failure artifacts. |
| `stash/local-changes-2026-06-03` | `53d8805` | Already contained in main's ancestry; no unique commits or branch-only changes remain. |

The four mechanics variants share stable patch ID
`2db3cb1625f69bd223104f44ba6cab04b06e25e8`.

## Changes brought over

- Manager events (`5def396`, `3cf2540`): divisions escalate incidents that need
  an executive decision; effects charge the corporate treasury rather than
  consuming the executive team's fuel or injuring its members. Adapted the
  port to translate partial outcomes as well as success/failure and preserve
  the existing compliance-risk alias. The shared day card labels these
  incidents “OPS ESCALATION.”
- Seasonal depth and framing (`19e356e`, `30b9f2c`): add an operational event
  in spring/summer and an issue in fall/winter; interleave card types, expose
  shortcuts more often, and explain the largest stakes. Imported the coupled
  recovery/scoring adjustments and simulation-policy fixes. Pending fallout
  advances once per season; the second draw excludes the first card's ID.
- Seasonal continuity: keep the previous season's closing card type inside
  saved game state so resume retains the ordering context. Ignore budget
  deltas that normalize to zero when generating stakes, avoiding a null access.
- Season locks and response framing from the same branch: winter ice-road
  and breakup issues stay in their authored seasons; response headings follow
  the active prompt and text entry clears the previous question.
- Event hints: warn when a choice ends the run or evacuates a crew member,
  and replace the fallback “Safe choice” with “No direct cost.” Preserve main's
  three-band odds and its visible odds for hidden-outcome gambles.

Not imported: the older recon closeout loop (it assumes multiple actions per
shift; main already has access-season deadlines), old two-outcome gamble
resolution, removal of outcome acknowledgements, whole-file event-hint
replacement, historical generated balance reports, or transient worktree files.
These would conflict with current flow or discard newer behavior. The shortcut
debrief ledger remains a possible separate enhancement, not part of this port.

## Progression fix found while testing

Campaign planning had the full approval gates but only 20 days and $55,760
after later changes made events consume whole days. All 12 initial seeded
policy runs failed. It now has 26 days and $69,700, still below the full
expedition's 34 days and $82,000; approval thresholds remain unchanged.

The simulator now deliberately recognizes block-selection, constraint-triage,
and contractor-incident prompts instead of reporting them as unknown actions.
Its planning policy and actual day runners are exercised by a new regression
test. A policy win is evidence of reachability, not a human win-rate estimate.

On the same first 12 seeds, campaign planning improves from 0/12 to 5/12 wins.
A larger 48-seed check finishes 21/48 planning deployments. Budget exhaustion
and deadline losses still occur; planning remains the hardest campaign leg.

## Validation

- Unit suite: 328 tests, including manager outcome translation, saved seasonal
  runs, season locks, planning completion and small-budget stakes rendering.
- Browser suite: all 48 existing tests passed, covering all five roles on
  three difficulties, failure paths, grid mode, seasonal play and mobile.
- Strengthened campaign test: now plays all four deployments, verifies all
  four season reviews, reaches YEAR IN REVIEW and returns to the district
  office. This and the two phone tests pass against the final gameplay changes.
- JavaScript lint passes with pre-existing warnings; production build passes.
- Manual browser check: seasonal setup, briefing, readable stakes and choices.
- Seasonal simulation: 3,600 completed years (4 roles × 9 areas × 100 seeds,
  balanced policy), no unknown endings: 8 outstanding, 1,817 solid,
  1,660 mixed, 115 stumbled.

Expedition/campaign simulations use the real mode runners, normal difficulty,
Fraser Plateau, and 24 seeds beginning at 1000 with a step of 37:

| Mode | Full expedition wins | Campaign wins | Successful campaign days |
| --- | ---: | ---: | --- |
| Recon | 14/24 | 19/24 | 16–24 |
| Planning | 20/24 | 10/24 | 20–24 |
| Permitting | 24/24 | 23/24 | 14–20 |
| Silviculture | 16/24 | 18/24 | 11–20 |

Reproduce with `npm test`, `npm run lint:js`, `npm run build`,
`npm run test:e2e`, `npm run sim:expeditions -- --runs 24`,
`npm run sim:expeditions -- --scale campaign --runs 24`, and
`node scripts/run-seasonal-sims.mjs --runs 100 --strategy balanced --json`.
Browser testing used the installed Chrome for Testing via
`PLAYWRIGHT_CHROMIUM_PATH` because the lockfile's default browser was missing.

No remote branches were deleted or merged, and no deployment was made.
