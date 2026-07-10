# BC Forestry Trail

One terminal-styled forestry game set across British Columbia — from the
northern Interior to the coast and southern wetbelt — with one content library
(`js/data/`), one retro TUI-style terminal (green phosphor by default, with
amber-CRT and ice themes plus a scanline toggle in Settings), and one entry
point (`index.html`). See [`docs/unified_campaign.md`](docs/unified_campaign.md)
for how the frontends were unified.

## The modes (all on the landing hub)

### Campaign — "A Year in the District" (the flagship)

One year, one operating area, four seasons, four hats. Each season opens with
a strategy briefing, plays a condensed Oregon Trail-style deployment — spring
recon traverse, summer silviculture program, fall planning file, winter
permitting push — then closes with a season review where the year's five
meters (progress, forest health, relationships, compliance, budget) absorb
what the deployment actually did, consequences and ecology drift included.
The year ends in a tier, and the deployments are the story of how it got
there. Autosaves at every day and season boundary.

### Expedition (single deployment)

The classic full-length run of any one journey. Pick a forester role, an
operating area, and a difficulty, then shepherd a multi-day expedition:
travel, supplies, crew health and morale, field/desk events with
consequences, milestones, and an interactive final debrief with persistent
career records (saved in your browser).

**Five roles, five distinct journeys:**

- **Strategic Planner** — phase-gated landscape planning under a ministerial deadline.
- **Permitting Specialist** — a permit pipeline sim: drafting → referral → review → approval.
- **Recon Crew Lead** — block-to-block traverse with pace, rations, camps, and crew welfare.
- **Silviculture Supervisor** — contractor management across planting, brushing, and surveys.
- **General Manager** — executive mode: hire a CEO, pursue certifications, balance the books.

### Seasonal Strategy (quick-play)

The four-season strategy game (seasonal metrics engine, `js/engine/` +
`tui/controller.js`) rendered in the same terminal via
`js/game/seasonalAdapter.js`. Each season you complete role duties and react
to contextual issues; five shared metrics track the year.

Fully tap-playable on mobile. Everything is buttons; keyboard shortcuts
([C]ampaign, [S]tatus, [G]lossary, [P] Intel, number keys for choices) are
accelerators, not requirements. Fully client-side, hosted on GitHub Pages
without a backend.

## Frontend status matrix

| Entry point | Tech | Status |
|---|---|---|
| `index.html` (campaign + expedition + seasonal) | Vanilla JS + DOM terminal | **Primary — the one site** |
| `tui.html` | Redirects to `/?mode=seasonal`; `?classic=1` loads the old React view, `?mode=crisis-command` the crisis deep-link | Transitional |
| `cli-game.tsx` (`npm run play`) | @opentui/react + Bun, seasonal only | Experimental (frozen) |
| `scripts/run-seasonal-sims.mjs` (`npm run sim:seasonal`) | Headless seasonal balance harness driving the real `TuiGameController` | **Primary tooling** |
| `cli.mjs` | Headless seasonal sim for balance runs | Legacy (superseded by `run-seasonal-sims.mjs`; uses an older engine loop) |
| ~~`cli-game.js` (blessed)~~ | — | Removed |

## Local development

```bash
npm install
npm run dev            # then open / for expedition mode, /tui.html for the seasonal TUI
npm test               # unit tests (node --test)
npm run test:e2e       # Playwright end-to-end suite
npm run lint:seasonal  # structural lint of seasonal content (also gated in npm test)
```

## Balance simulation

The seasonal game can be run headlessly across many seeds, roles, areas, and
strategies. The harness drives the same `TuiGameController` the browser uses
(via `js/engine/simulate.js`) with a seeded RNG, so every run is reproducible.

```bash
npm run sim:seasonal -- --runs 100 --strategy balanced
npm run sim:seasonal -- --role planner --area fraser-plateau --runs 500
npm run sim:seasonal -- --json > /tmp/runs.json   # full matrix as JSON
```

Strategies: `cautious`, `balanced`, `aggressive`, `random`, `greedy`,
`weakest-metric`, `role-optimal`. Without `--json`, a markdown + JSON balance
report is written to `reports/balance/` (mean ending tier per strategy, role ×
area difficulty, consequence firing rates, most frequent issues).

Production builds use the `/forest/` base path for GitHub Pages
(`VITE_BASE_PATH=/ npm run build` for a root-path build). Every push to `main`
deploys via `.github/workflows/pages.yml`, which gates on the unit test suite.

## Content layout

Game content lives under `js/data/` (roles, operating areas, events, issues,
glossary) with JSON payloads in `js/data/json/`. The nine BC operating areas — six
across the northern Interior plus Vancouver Island Coast, the Kootenay Wetbelt, and
the Okanagan/Shuswap Drybelt — carry real BEC zones, dominant species, and landscape
tags that drive event selection.

To refresh the real-data planning block snapshot from BC OpenMaps:

```bash
node scripts/generate-planning-block-options.mjs
```

## Roadmap

See [`docs/future_state_roadmap.md`](docs/future_state_roadmap.md) for the sequenced
plan toward the full Oregon Trail-style experience (animated travel, illustrated event
vignettes, Braille area maps), and [`docs/future_directions.md`](docs/future_directions.md)
for the broader idea backlog.
