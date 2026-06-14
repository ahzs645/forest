# BC Forestry Trail

Two terminal-styled forestry games set across British Columbia — from the
northern Interior to the coast and southern wetbelt — sharing one content
library (`js/data/`) and a retro green-CRT aesthetic.

## The two games

### 1. Expedition mode (`index.html`) — the flagship

An Oregon Trail-style crew simulator. Pick a forester role, an operating area, and a
difficulty, then shepherd a multi-day expedition: travel, supplies, crew health and
morale, field/desk events with consequences, milestones, and an interactive final
debrief with persistent career records (saved in your browser).

**Five roles, five distinct journeys:**

- **Strategic Planner** — phase-gated landscape planning under a ministerial deadline.
- **Permitting Specialist** — a permit pipeline sim: drafting → referral → review → approval.
- **Recon Crew Lead** — block-to-block traverse with pace, rations, camps, and crew welfare.
- **Silviculture Supervisor** — contractor management across planting, brushing, and surveys.
- **General Manager** — executive mode: hire a CEO, pursue certifications, balance the books.

Fully tap-playable on mobile. Everything is buttons; keyboard shortcuts ([S]tatus,
[G]lossary, [P] Intel, number keys for choices) are accelerators, not requirements.

### 2. Seasonal Strategy TUI (`tui.html`)

A four-season, role-based strategy game built on the seasonal metrics engine
(`js/engine/` + `tui/controller.js`). Each season you complete role duties and react
to contextual issues; five shared metrics track the year. Fully client-side, hosted on
GitHub Pages without a backend.

## Frontend status matrix

| Entry point | Tech | Status |
|---|---|---|
| `index.html` (expedition) | Vanilla JS + DOM terminal | **Primary** |
| `tui.html` (seasonal TUI) | React + `tui/controller.js` | **Primary** |
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
