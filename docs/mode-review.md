# Independent game-mode review — 2026-09-05

This review used the working source at `http://127.0.0.1:5178/`, real mode day runners, the real seasonal controller, and headless Chromium. It did not change production code; confirmed defects were sent to the coordinating agent for fixes.

## Playable entry points

| Entry point | Game loop | Coverage in this review |
| --- | --- | --- |
| Campaign | Spring recon → summer silviculture → fall planning → winter permitting | 36 seeds per condensed deployment, 144 runs; full campaign UI is covered by the coordinating desktop/mobile reviews |
| Single Expedition | Strategic Planner, Permitting Specialist, Recon Crew Lead, Silviculture Supervisor | 36 seeds per full deployment, 144 runs; browser setup, saved-period reload, and continued play for every role |
| Single Expedition: General Manager | Experimental 12-month board term | 36 varied seeded terms across all three difficulties; browser full hard-difficulty term, save clearing, return to office, restart |
| Seasonal Strategy | Four seasonal roles across nine operating areas | 3,024 complete controller years across seven decision policies |
| Classic seasonal page | `tui.html?classic=1`, alternate React presentation of the same controller | Existing classic-browser tests were inspected; presentation coverage belongs to the desktop/mobile reviewers |
| Crisis Command | Hidden until `?experimental=1`; four scenario decisions | Added complete browser flow tests at desktop and 390 × 844 touch sizes; exposed a broken deep-link |
| ASCII grid | Canvas presentation of the expedition/campaign DOM | Existing keyboard campaign-start test inspected; display coverage belongs to the desktop/mobile reviewers |

Legacy `field` and `desk` state aliases dispatch to recon and permitting; they are not additional role-picker options. The Bun/OpenTUI command-line presentation was not launched in this browser-focused review.

## Confirmed defects and regression evidence

1. **Zero manager trust counted as 50.** Both dismissal and end-of-term victory used a truthy fallback for reputation. A zero-reputation manager could remain in office and win. Two new regression tests failed before the coordinator changed these fallbacks to nullish defaults; both now pass.
2. **Refreshing an event outcome repeated manager strategic spending.** A shared event checkpoint persisted effects partway through the month, but resume ran the same month's strategy again. The real browser reproduction recorded two strategic decisions in the same month. The coordinator removed the premature event checkpoint. The manager regression now records one decision, and a recon washout regression confirms that refreshing the outcome restores consistent pre-decision resources rather than retaining half-applied effects.
3. **Crisis Command launched ordinary seasonal setup.** Clicking the experimental landing button reached `Select your Operating Area` instead of the Pine Beetle incident, at both desktop and phone sizes. The browser integration tests reproduced this despite passing controller-level crisis tests. The coordinator changed the deep-link effect to read the controller's current state, avoiding stale React snapshots during StrictMode effect replay. Both browser tests now complete all four incident phases, show Crisis Debrief, and restart successfully.

## Seeded expedition results

These are measurements of the existing competent-player policies, not estimates of human win rates. Seeds were `1000 + 37 × n`, for `n = 0…35`, in Fraser Plateau Uplands at the factory's default difficulty. All 288 runs reached a declared victory or failure; no runtime exceptions or unbounded runs occurred.

| Role | Full deployment wins | Condensed campaign deployment wins |
| --- | ---: | ---: |
| Recon | 19 / 36 | 30 / 36 |
| Planning | 35 / 36 | 33 / 36 |
| Permitting | 35 / 36 | 35 / 36 |
| Silviculture | 34 / 36 | 33 / 36 |

Full recon is the harshest measured deployment: nine crew-loss failures, seven access-season deadline failures, and one final-block mobility failure. Campaign recon losses were resource/mobility failures plus one deadline miss. Other roles lost from budget depletion or explicit silviculture target shortfalls. These are clear game endings, not stuck interfaces, and successful seeds demonstrate that every mode can be won. No balance parameters were changed solely to improve these bot scores.

The 36 manager simulations used seeds `8900 + 37 × n`, 12 seeds at each of easy, normal, and hard, varied strategic/event choices, and JSON serialization between board periods. Every period advanced or ended the game; every final result had an explanation; all meters stayed finite and within 0–100.

## Seasonal matrix

`12 seeds × 4 roles × 9 areas × 7 policies = 3,024 years`. All runs completed, none had unknown ending tiers, and all final metrics were finite and within 0–100. Every tracked consequence family appeared at least once. Policies were cautious, balanced, aggressive, random, greedy, weakest-metric, and role-optimal. All 432 aggressive-policy runs stumbled; that is a balance observation rather than a completion failure. This matrix drives the same controller as the browser but does not validate visual layout.

## Final regression results

All **5 new Node tests** pass, including the 36 seeded manager terms. All **10 new browser scenarios** pass after the fixes: eight non-crisis scenarios in the full review run, followed by both Crisis Command scenarios in the focused fix-verification run. ESLint passes for both new test files. The coordinating agent runs the combined suite to check for interactions with the rest of the project.

## Reproduction commands and artifacts

```sh
node --test tests/modeReview.test.mjs
node scripts/simulate-expeditions.mjs --runs 36 --verbose
node scripts/simulate-expeditions.mjs --scale campaign --runs 36 --verbose
node scripts/run-seasonal-sims.mjs --matrix --runs 12 --json
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5178 npx playwright test tests/e2e/mode-review.spec.js --project=chromium --workers=1 --output=/tmp/forest-modes-agent-final-results
```

Browser execution used the installed Chromium 1234 binary through `PLAYWRIGHT_CHROMIUM_PATH`. Detailed local evidence is in `/tmp/forest-modes-full.log`, `/tmp/forest-modes-campaign.log`, `/tmp/forest-modes-seasonal.json`, `/tmp/forest-modes-browser-final.log`, and `/tmp/forest-modes-agent-final-results/`. The first failing manager outcome-refresh run is preserved separately in `/tmp/forest-modes-resume.log` and `/tmp/forest-modes-resume-results/`. The successful Crisis Command retest is `/tmp/forest-modes-crisis-fixed.log`, with artifacts in `/tmp/forest-modes-crisis-fixed-results/`.

This review does not establish Safari/iOS or Firefox compatibility, native-device performance, or exhaustive coverage of every random event. Mobile interaction coverage uses Chromium touch emulation.
