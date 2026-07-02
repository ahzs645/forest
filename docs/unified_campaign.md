# Unified Campaign — one game, one site

Written 2026-07-01. This is the implementation contract for unifying the three
frontends (expedition site, browser TUI, terminal TUI) and the game modes into
a single full experience.

## Why

Today the project ships three shells and three games: `index.html` (expedition,
vanilla DOM terminal), `tui.html` (seasonal strategy, React), and
`cli-game.tsx` (frozen terminal build of the seasonal game). Everything below
collapses that into **one site (`index.html`), one UI (the DOM terminal), one
save story** — and adds the mode that ties every system together.

The seasonal game's `TuiGameController` (tui/controller.js) is already
view-agnostic: it drives the React app, the headless balance sims, and the CLI.
Unification means giving it a fourth renderer — the expedition terminal —
not rewriting the game.

## The pieces

### 1. Seasonal adapter (`js/game/seasonalAdapter.js`)

Renders a `TuiGameController` run through `TerminalUI`:

- Loop: `getState()` → render card → `promptChoice` → `selectOption(i)`.
- Card rendering is decision-first (title + one situation paragraph + option
  list). Everything else the card carries (context, flavor, whyNow,
  provenance) sits behind a free appended **[More context]** choice that
  prints the detail and re-prompts without advancing the controller.
- A one-line metric strip (Progress / Forest / Relations / Compliance /
  Budget) renders above every card; effect notices reuse the controller's
  formatted deltas.
- `runSeasonalGame(ui, options)`:
  - quick-play: controller's own setup cards (name/role/area) render like any
    other card;
  - campaign: `options.preset = { companyName, roleIndex, areaIndex }` drives
    setup programmatically (same calls the sims use) so the player never sees
    a second setup;
  - `options.rounds` (campaign uses one season at a time — see bridge notes)
  - returns `{ state, summary }` when the controller reaches `end` (or the
    season boundary in campaign use).
- Seasonal quick-play saves keep using the controller's own autosave
  (`bc-forestry-trail/seasonal-run/v1`), seeded rng as in `useGameFlow.ts`.

### 2. Campaign mode (`js/game/campaign.js`) — the flagship

**"A Year in the District."** One year, one operating area, one difficulty,
four seasons — and four hats. The district makes the new forester do
everything:

| Season | Deployment (expedition engine, condensed) |
|---|---|
| Spring | Recon traverse — scout the year's blocks |
| Summer | Silviculture program — plant what was scouted |
| Fall   | Strategic planning file — turn field truth into a plan |
| Winter | Permitting push — get the plan through the agencies |

Season loop:
1. **Season briefing** (seasonal adapter): the seasonal engine's assignment
   card for the matching role — the stance chosen applies its effects to the
   year metrics and sets the tone for the deployment.
2. **Deployment** (expedition engine): a condensed journey
   (`createJourney({..., scale: 'campaign' })`, ~8–12 in-game days) run by the
   existing mode day-loops. Crew, travel, events, temptations — the meat.
3. **Season review** (seasonal engine): deployment results feed the year
   metrics through the bridge (below), then `applyRoundConsequences` +
   recoveries + ecology drift fire with the "Why This Happened" panel.
   If the round's issue preview reads danger, it plays as a **crisis
   interlude** card before the review (crisis-command pivot, one card).
4. Next season. After Winter: year tier via `deriveTier`, the interactive
   final debrief, and a Campaign entry in the service record.

**Metric bridge** (deployment → year metrics, each season):
- `progress`: deployment objective completion (packages closed / blocks
  planted / approval gates / permits approved vs target) → ±(4–14)
- `compliance`: journey compliance events + scrutiny delta → ±(2–10)
- `relationships`: relationship/reputation deltas from the run → ±(2–10)
- `budget`: money spent vs season allowance → ±(2–8)
- `forestHealth`: only what the run touched (values sweeps, silvi survival,
  salvage choices) → ±(0–6); the ecology drift stays the main mover.
Deltas are clamped and printed on the season review card, each with a one-line
cause ("Permits: 4/5 approved → Progress +9").

**Carry-forward:** `discoveryTags` from each deployment persist on the
campaign and seed the next deployment's journey (the factory already accepts
them), so spring recon finds shape summer planting, and the planning file in
fall names what the year actually did.

**Save/resume:** `bcft.campaign.v1` = `{ season, yearMetrics, seasonLog,
activeJourney }`, saved at day boundaries (reusing saveActiveRun's journey
snapshot inside the wrapper) and at season boundaries. Resume drops you at the
start of the saved day or at the next season briefing.

### 3. Factory scale option (`js/journey/factory.js`)

`createJourney({ ..., scale: 'campaign' })` shrinks each mode to a season-
sized deployment (~8–12 days of play):

- recon: ~6 blocks (subset of area blocks), traverse trimmed to match
- silviculture: 5 blocks / ~80k seedlings / brush 150 ha / 2 surveys,
  budget + overhead scaled to match (~$45k, same daily overhead)
- planning: deadline 12 (from 28), gate thresholds unchanged
- permitting: 5 permits / deadline 12 (from 15/30)
- resources scaled ~0.45× where they are per-run stockpiles

Difficulty multipliers apply after scale, unchanged.

### 4. One site

- Landing hub (`index.html`): **[C]AMPAIGN — A Year in the District**
  (primary), [E]xpedition (single deployment, current flow), [S]easonal
  Strategy (adapter quick-play, in-site), [!] Crisis Command (unchanged
  deep-link for now), [L]oad.
- `tui.html` becomes a redirect to `/?mode=seasonal`; `tui.html?classic=1`
  still loads the React app (transition escape hatch, and what the
  tui-browser e2e specs drive — specs updated to use it).
- `cli-game.tsx` stays frozen; it already runs the same controller.

## Non-goals (deliberate)

- No shared career/service record between quick modes beyond what exists —
  the campaign writes ONE service-record entry of its own.
- Crisis Command's scripted campaign stays a separate scenario set; the
  campaign's crisis interludes reuse its *pivot* framing, not its script.
- No React removal this pass; `?classic=1` keeps the old TUI reachable while
  the adapter proves itself.

## Acceptance

- Campaign playable start→finish on desktop and mobile viewport, ~30–45 min
  of reading-speed play, no softlocks, every season ends in a review that
  explains its numbers.
- Seasonal quick-play in-terminal reaches its year-end summary identically to
  the React TUI (same controller, same draws under the same seed).
- `npm test`, `lint:events`, `lint:seasonal`, full Playwright suite green
  (tui-browser specs re-pointed at `?classic=1`; new campaign smoke spec).
