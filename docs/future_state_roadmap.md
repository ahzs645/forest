# Future State Roadmap

*Generated 2026-06-12 from a 7-dimension audit (gameplay loops, visual/scene layer,
story content, tech health, mobile UX, branch salvage, frontend strategy) plus an
adversarial completeness critique. Baseline: main @ 8770ccb, 118 unit tests passing,
all five roles tap-playable on mobile.*

## The future state

An Oregon Trail-style terminal game set in northern BC forestry: the player **watches
their crew travel** (animated ASCII travel strip, Braille vector map of the operating
area), events interrupt travel as **illustrated vignettes**, the crew feels alive
(named members, traits, reactions, epilogues — partially shipped), seasons and weather
have mechanical teeth, runs end in the interactive debrief with persistent careers
(shipped), and **all five journey types are first-class**: recon, silviculture,
planning, permitting, manager. Tap-playable on mobile, fast, deployed on GitHub Pages.

## Where we are (honest assessment)

**Strong:** Recon is already a real Oregon Trail loop (pace/rations/camp actions/crew
injuries/supply pressure). Silviculture has the best seasonal texture (contractor
fatigue, winter lockout). Planning and permitting are solid protagonist desk sims.
The event selection pipeline is sophisticated (pace/terrain/weather/scrutiny modifiers,
area situations, discovery tags, temptations, radio reporters). The debrief, crew
reactions, and service record landed this week. The engine is well-tested (118 tests).

**The big gaps:**
1. **Nothing moves.** 16 animation modules in `js/animations/` are imported *nowhere*
   in expedition mode; the only art usage is one static frame in the debrief. There is
   no frame player — `TerminalMixin` can only append lines.
2. **Manager is 1/10th of a game** — 144 lines vs 1,300–1,600 for siblings; no day
   header, no metrics display, bypasses the event pipeline, has no progress formula
   (milestones literally never fire), zero test coverage.
3. **Events fire at day-start, never mid-travel** — Oregon Trail's signature rhythm
   is inverted in every mode.
4. **A run is fragile.** No mid-run save: a page refresh or iOS tab eviction destroys
   a 60–100-day run. The crash path even writes crashed runs into the career record.
5. **Every push to main auto-deploys with zero CI test gate.**

---

## Phase 0 — Protect the pipeline (hours; do first)

Everything after this pushes to an auto-deploying main.

- [ ] Add `npm test` (0.4s, 118 tests) as a step before Build in
      `.github/workflows/pages.yml`. Optionally a PR workflow with 2–3 fast e2e smokes.
- [ ] `git rm --cached .DS_Store test-results/.last-run.json`; add `test-results/` to
      `.gitignore`.
- [ ] Delete dead weight: `test_fix.html`, `test-cli.js`, `cli-game.js` (+ `blessed`
      dependency + `play:blessed` script — cli-game.js is its only consumer).
- [ ] Delete the ~11 fully-merged remote branches (verified via `git branch -r --merged`);
      shrinks the live-branch surface from 20 to ~5.
- [ ] Fix `README.md`: it lists FOUR roles (manager missing), describes the seasonal
      game's mechanics as if they were the expedition game, and documents a deprecated
      cli.mjs loop. Add a **frontend status matrix**: expedition DOM = primary,
      browser TUI = primary, @opentui = experimental seasonal-only (frozen),
      blessed = removed, headless cli.mjs = balance tooling (to be rebuilt on
      TuiGameController).
- [ ] Remove the dead `@opentui` manualChunks rule in `vite.config.js` (never matches).

## Phase 1 — Branch harvest (strict order; before local edits to the same files)

The stash branch merges **conflict-free today** (merge-base f0c712a; main's newer
commit touches disjoint files). Every future edit to `tui/controller.js` or
`src/tui-browser/App.jsx` re-opens conflict risk. Order matters:

1. [ ] `git merge origin/stash/local-changes-2026-06-03` — lands the mapscii Braille
       renderer (BrailleBuffer/Canvas/Renderer + passing test) and crisis-command mode.
       **In the same PR:** relocate `src/tui-browser/mapscii/` → `js/scene/mapscii/`
       (ONE shared home — expedition mode needs it too) and move crisis `mapFeatures`
       data into `js/data/`.
2. [ ] `git cherry-pick df32fd1` — permitting revision-pipeline fix (registration/
       paperwork-aware resubmission, fixes a leaked revisionQueue) + its unit test.
3. [ ] `git cherry-pick c35147a` — XSS hardening of `js/ui/modal.js`
       (createElement/textContent instead of innerHTML interpolation).
4. [ ] Apply the modal perf hunk from `perf/modal-high-risk-lookup` (do NOT land its
       committed `test-results/` junk). Same file as #3 — order is mandatory.
5. [ ] Only now: the `tui/controller.js` double-snapshot fix (one-line — `setState()`
       computes `snapshotGameState` then `emit()` recomputes it; halves per-keystroke
       work), and any modal mobile fixes (Phase 5).

## Phase 2 — Event-pipeline integrity, then the content drop

Tests and fixes FIRST, bulk content SECOND, hand-edits THIRD — importing content
before the lookup fix silently kills the new chains.

- [ ] **Fix the ancientGrove silent death** (real bug, affects every field run):
      `story_arc_ancientGrove_stage0` schedules stage-1 events that live in
      `desk/events.json`; `getEventById` (`js/events/scheduled.js:16-19`) searches
      only the matching pool, returns null, and the chain dies silently. Make it fall
      back cross-pool (or move the events).
- [ ] Add the **resolvability test**: walk every `schedulesEvent` in all event JSON,
      assert `getEventById` resolves it for the journey types that can trigger it.
- [ ] Add a small **content lint** to CI: unique event ids, valid role/journeyType
      vocabulary, probability ranges, resolvable chains.
- [ ] Fix selection **order bias** (`selectRandomFieldEvent` returns the first passing
      roll in file order — flat_tire dominates every run): shuffle or weighted-draw.
      Raise `EVENT_REPEAT_COOLDOWN` from 2 → 6 (`js/events/constants.js:9`).
- [ ] **Open the field pool to silviculture**: selection bails because silvi journeys
      have no `blocks` array (`selection.js:127-129`) — its entire variety is 5
      hardcoded contractor events for a 60+ day run. Give it a lightweight blocks list
      or relax the guard.
- [ ] **Bulk-import the mined content**: `git checkout origin/claude/improve-game-design-uzCd8
      -- js/data/json/desk/events.json js/data/json/field/events.json` — ~1,660 lines
      of multi-day chained events (safety inspector, wolf, storm arcs), content-only,
      no code conflicts. Reconcile ids against the lint.
- [ ] Hand-tag ~10 existing desk events `roles: ['planner']`/`['permitter']` and a
      field subset for recon vs silviculture (the filtering code already works; this
      is pure data). Then author 2–3 three-stage arcs per role, mining
      `docs/BC_interior_context.md` (old-growth deferrals, Treaty 8 disturbance caps,
      archaeology chance-finds, glyphosate backlash — all game-ready and unused).
- [ ] Wire **seasons into gameplay**: only silviculture consumes `SEASONAL_MODIFIERS`;
      recon/permitting never advance the season; `getRandomWeather` ignores season
      entirely. Make weather season-keyed and let planning read its
      stakeholder-availability modifiers.
- [ ] **Debrief callbacks**: `journey.log` already records every decision;
      add a "moments that mattered" beat (2–3 highest-severity events narrated) and
      record victim ids on injuries so epilogues can say *who* got hurt *where*.

## Phase 3 — Scene foundation → the visible journey

One frame contract, agreed before any scene code: **grid internally, string at the
renderer boundary** (covers both the ascii-anim port and mapscii, whose
`Renderer.draw()` already returns text frames).

- [ ] **`js/scene/` runtime**: `CharGrid` (cols/rows/setChar/clear/toString) replacing
      ascii-anim's textmode `t`; port `helpers.js` (drawChar/drawText/drawHLine/drawBox)
      nearly verbatim; a DOM renderer owning one fixed `<pre class="scene-canvas">`
      (char-width probe → cols from clientWidth for mobile sizing); a rAF player with
      `prefers-reduced-motion` support.
- [ ] Coordinate with the terminal **MAX_LINES cap** (Phase 0/tech-health): scene
      mounts must be exempt from line eviction, and the travel strip mounts OUTSIDE
      the capped scroller — otherwise animations vanish mid-play.
- [ ] **Dedupe `handleEvent`** (`ForestryTrailGame.js:267-312` vs `recon.js:1258-1307`)
      into one shared function first — halves vignette wiring, removes a drift hazard.
- [ ] **Event vignettes** (highest payoff-per-line): port `tui/art.js`
      detectArt/matchAnimation (~40 lines of label matching) into
      `js/scene/vignettes.js`; the 16 orphaned animation modules
      (moose/eagle/wildfire/river/chainsaw/heli/walkieTalkie/map/compass…) light up
      every matching event.
- [ ] **Travel strip**: persistent scene replacing the one-line `buildBlockMap`
      (`recon.js:585-615`). Seam: after the pace tap (`recon.js:436-443` →
      `executeFieldDay`), play 2–4s of parallax terrain + crew/truck sprite + weather
      overlay, then land the (already-computed) arrival messages as the vignette.
      Equivalent seams exist in silvi (crew bus to block), planning (block selection),
      permitting (referral hand-off).
- [ ] **Events interrupt travel**: move the field-event roll inside the travel action
      (pause strip at random t, vignette, resume). Keep ONE parameterized
      `checkForEvent` so desk modes stay in the same pipeline — two divergent entry
      points would break five-role parity.
- [ ] **Desk scenes** (4–6 lightweight): office window with season/weather outside,
      radio-crackle for RADIO CHECK, stamp animation for approvals, map-table for
      planning — so the visual layer reaches all five roles.
- [ ] **Braille area map**: feed `js/scene/mapscii/` with per-operating-area geometry
      (roads/rivers/blocks/camps — the only genuinely new data work; crisis mode's
      mapFeatures show the format). Position marker from `distanceTraveled`.
- [ ] **Milestone interstitials**: upgrade the 50%/90% one-line toasts into small
      interactive camp beats (crew conversation from the reactions decks; a "final
      push" choice). Copy already exists in `js/journey/constants.js`.
- [ ] Consolidate art into `js/scene/assets/` with a manifest
      `{id, frames, fps, tags}` (merging ascii_art.js + animations/ + tui/art.js
      matchers) once the runtime exists.

## Phase 4 — Manager becomes a real fifth role (ONE work item)

Three audits hit manager independently; doing the pieces separately triples rework.
Add only a generic "role card 5 starts and a day completes" smoke test before; write
deep assertions after.

- [ ] Rebuild `runManagerDay`: `ui.clear()` + day header (matches siblings), morning
      brief showing the 6 metrics/budget/CEO, 2–4 decisions per day, quarterly board
      reviews at the existing milestone thresholds.
- [ ] Add the manager case to `getOperationalProgress` (`js/journey/progress.js:34-72`
      returns 0 today → milestones never fire even though `MILESTONE_COPY.manager`
      exists).
- [ ] Route manager through the real event pipeline (today it raw-samples full pools,
      skipping cooldowns, context matching, temptations, reporters). Add manager to
      the journey-type constants and tag/author 10–15 manager events.
- [ ] Add manager to `ROLE_RUNS` in the e2e specs and to
      `scripts/monte-carlo-playtest.mjs` (currently excluded from both).

## Phase 5 — Mobile & platform hardening

- [ ] **Mid-run save/resume** (top missed area; do before content makes runs longer):
      serialize journey at each end-of-day continue, "Resume expedition" on the
      landing screen. iOS tab eviction currently destroys 100-day runs, and the
      error path says "Please refresh to restart."
- [ ] **Crash hygiene**: don't write crashed runs into `bcft.serviceRecord.v1`
      (the `_mainLoop` catch currently falls through to the debrief); add
      window.onerror/unhandledrejection handling.
- [ ] **Seeded RNG + build stamp**: 77 raw `Math.random` sites → one seedable module;
      show the seed in the debrief; inject a build hash via Vite define. Makes phone
      playtest reports reproducible and unblocks the balance phase.
- [ ] The 7 keyboard-assuming copy strings ("Press ESC…", "Press any key…",
      "(Press [S]…)" ×3, etc.) — one pass, using a tiny `pointer: coarse` helper.
- [ ] **[L] LOG button** in classic header + modern footer (journey log is currently
      unreachable on touch — wiring exists, button doesn't).
- [ ] **Modern display mode on mobile shows fake stats**: `.status-area` is
      display:none'd so the real stat cards never render and [S] toggles an invisible
      panel. Fix the wiring or hide the hint.
- [ ] iOS viewport: `100dvh` overrides at the five `100vh` sites, `viewport-fit=cover`
      + `env(safe-area-inset-*)` (declared `mobile-web-app-capable` without them),
      landscape rules. Validate the travel-strip height against 390×844 before making
      it persistent.
- [ ] Glossary modal double-scroll fix (`modal.js:333-334` inner maxHeight inside a
      scrolling `.modal-body`) + `overscroll-behavior: contain` + body scroll lock.
- [ ] **getDayLabel canon**: SHIFT/DAY is defined 5 ways across ui.js, modernUI.js,
      display.js, endScreen.js (recon shows "SHIFT 3" in HUD, "Day 3" in the log).
      One function, one truth.
- [ ] **PWA slice 1** (<1h): webmanifest, theme-color, favicon + apple-touch-icon
      (repo has zero icons today). Slice 2 (optional): offline service worker.
- [ ] Expedition-mobile e2e spec (390×844 + hasTouch, all five roles) to lock the
      tap-playability invariant — currently only the seasonal TUI has mobile e2e.
- [ ] Accessibility baseline before the animation layer multiplies motion: modal focus
      trap, `prefers-reduced-motion` CSS rule, review `aria-live` on a terminal that
      bursts 20–30 lines (consider polite region scoping).

## Phase 6 — Balance, pacing, onboarding (last; measure first)

- [ ] Rebuild `cli.mjs` (or fold into monte-carlo) on the real game loop, covering
      **all five roles** — then tune one knob at a time: desk-header compression
      (planning/permitting print 20–30 line headers before every action — reading
      load is their real pacing problem), resource scarcity curves, event frequency.
- [ ] **Onboarding**: first-run detection + a guided first day per role (Oregon
      Trail's store scene is the benchmark; the HOW TO PLAY modal is the only
      teaching surface today) and role-complexity signposting on the role cards.
- [ ] Status-surface unification across the five roles and both display modes
      (one "what the player sees between choices" redesign).

## Deferred (explicitly, with reasons)

- **Career-layer convergence** (seasonal year as strategic wrapper issuing
  expeditions, service record as the bridge): the biggest design move; only after
  scenes + debrief are stable.
- **Expedition presenter extraction / true-terminal expedition build**: ~6.3k lines
  of mode code call `this.ui.*` directly; no shipped target needs it. Keep @opentui
  frozen as a seasonal-only experiment.
- **Seasonal view-layer dedup** (App.jsx vs components.tsx, 8 components × 2): worth
  doing via view-model extraction, but after the stash merge and only if @opentui
  stays.
- **Barrel/shim renames** (js/game.js vs js/game/ etc.): cheap but conflicts with
  every open workstream; slot into a quiet moment.
- **Audio**: deliberate v1 omission — reserve a muted-by-default settings slot so
  the decision is visible, not accidental.

## Top quick wins (sub-hour each, any order within their phase)

| Win | Where |
|---|---|
| CI test gate | `.github/workflows/pages.yml` |
| Stash merge (zero-conflict window open NOW) | `git merge origin/stash/local-changes-2026-06-03` |
| ancientGrove chain fix | `js/events/scheduled.js:16-19` |
| Cooldown 2→6 + pool shuffle | `js/events/constants.js`, `js/data/fieldEvents.js:36-48` |
| One-line controller double-snapshot fix | `tui/controller.js:227` |
| Braille map inline proof | `ui.writeBox(renderMapsciiFrame(features))` with crisisMode features |
| Vignette interim player (10 lines) | div + setInterval over `wildfireAnimation` frames |
| `ui.clear()` + day header in manager | `js/modes/manager.js` |
| [L] LOG button | `index.html` header/footer + existing `onLogRequest` wiring |
| Keyboard-copy fixes (7 strings) | endScreen/ForestryTrailGame/recon/fieldActions |
| favicon + theme-color + manifest | `index.html`, new `public/` |
| Delete cli-game.js + blessed + merged branches | repo root, package.json, origin |

## Dependency spine (what gates what)

```
CI gate ──► everything
Branch harvest (stash → df32fd1 → XSS → perf) ──► any edit to modal.js / controller.js / App.jsx
getEventById fix + content lint ──► bulk event import ──► role tagging / new arcs
Scene contract ──► vignettes ──► travel strip ──► events-interrupt-travel ──► map / milestones
Manager rebuild (one item) ──► manager tests ──► five-role balance pass
Save/resume + seeded RNG ──► longer content-rich runs + playtesting loop
```
