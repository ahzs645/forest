# BC Forestry Trail

Two terminal-styled forestry games set in northern British Columbia, sharing one
content library (`js/data/`) and a retro green-CRT aesthetic.

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
| `cli.mjs` | Headless seasonal sim for balance runs | Tooling (uses a legacy engine loop; pending rebuild on `TuiGameController`) |
| ~~`cli-game.js` (blessed)~~ | — | Removed |

## Local development

```bash
npm install
npm run dev          # then open / for expedition mode, /tui.html for the seasonal TUI
npm test             # unit tests (node --test)
npm run test:e2e     # Playwright end-to-end suite
```

Production builds use the `/forest/` base path for GitHub Pages
(`VITE_BASE_PATH=/ npm run build` for a root-path build). Every push to `main`
deploys via `.github/workflows/pages.yml`, which gates on the unit test suite.

## Content layout

Game content lives under `js/data/` (roles, operating areas, events, issues,
glossary) with JSON payloads in `js/data/json/`. The six northern BC operating areas
carry real BEC zones, dominant species, and landscape tags that drive event selection.

To refresh the real-data planning block snapshot from BC OpenMaps:

```bash
node scripts/generate-planning-block-options.mjs
```

## Roadmap

See [`docs/future_state_roadmap.md`](docs/future_state_roadmap.md) for the sequenced
plan toward the full Oregon Trail-style experience (animated travel, illustrated event
vignettes, Braille area maps), and [`docs/future_directions.md`](docs/future_directions.md)
for the broader idea backlog.
