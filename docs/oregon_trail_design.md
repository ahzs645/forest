# More Oregon Trail, more motion — design worked through

*Written 2026-07-17 against `main @ 8ac9f81`, cross-referenced with a full
inventory of the ascii-anim repo. This is the follow-on to
`docs/future_state_roadmap.md` (2026-06-12): much of that roadmap's scene
layer has since shipped, so this doc re-baselines, then works through the two
questions that remain: (1) what still separates this game from the Oregon
Trail feel it's aiming at, and (2) how to harvest the ascii-anim component
library to make the whole thing more alive — without breaking the terminal
aesthetic.*

---

## 1. Re-baseline: what already shipped since the roadmap

Give the codebase credit first, because the plan changes shape when you do:

| Roadmap item | Status today |
|---|---|
| Scene runtime + frame player | ✅ `js/scene/player.js` — `playFrames()` with reduced-motion still-frame, tap/key skip, click-swallow, `.scene-keep` line-cap exemption |
| Event vignettes | ✅ `js/scene/vignettes.js` — 19 keyword decks + 7 type fallbacks over the 16 `js/animations/` modules, fired for **all** modes via `js/modes/shared/handleEvent.js` |
| Travel strip | ✅ `js/scene/travelStrip.js` — procedural parallax trees, walker/truck sprite, weather overlay, progress track. **Recon only** (`js/modes/recon.js:501`) |
| Braille area map | ✅ `js/scene/areaMap.js` + `js/scene/mapscii/`, recon's Consult Map |
| Manager rebuild | ✅ `js/modes/manager.js` is now 609 lines with day header, board reviews, field visits |
| Mid-run save | ✅ `js/game/saveLoad.js` + campaign autosave (`bcft.campaign.v1`) |
| ASCII Grid renderer | ✅ `js/gridview/` — a self-hosted textmode cell renderer whose API deliberately mirrors ascii-anim's helpers |
| CI test gate | ✅ |

**Still open from the roadmap** (all four confirmed live in current code):
events fire at day-start rather than interrupting travel; weather ignores
season; the travel strip/area map never reach the desk modes; the milestone
beats are one-line toasts.

---

## 2. Oregon Trail gap analysis

What makes Oregon Trail *Oregon Trail* is a short list: named people you can
lose, pace/rations dials, the landmark drumbeat ("102 miles to Fort
Laramie"), the river-crossing gamble, the hunting break, the trading post,
weather that owns a season, and the tombstone you write for the next player
to find. Scored against the current game:

| OT mechanic | Here today | Verdict |
|---|---|---|
| Named party, sickness, death, epilogues | `js/crew.js` (traits, status effects, death, quitting), debrief epilogues with `victimId` callbacks | **Strong — done** |
| Pace & rations tradeoffs | `PACE_OPTIONS` + route presets + full/short rations with streaks (recon) | **Strong** in recon, absent in desk modes |
| Landmark distance drumbeat | Blocks have `distance`/names in `js/data/json/field/blocks.json`, but progress reads as "% packages finalized" | **Weak** — the cadence isn't surfaced |
| River crossing decision | Dissolved into the passive access-verdict score (`js/journey/fieldMechanics.js` `getBlockAccessVerdict`); `river` terrain is just slow+dangerous | **Missing** as a played beat |
| Hunting minigame | `applyForageResults()` — one roll, no interaction | **Weak** |
| Trading | `handleResupply` buy-only shop at `hasSupply` blocks | **Thin** — no bartering, no other travelers |
| Weather with teeth | Real modifiers + forced camp days, but `getRandomWeather` ignores `journey.season` | **Partial** |
| Tombstones/epitaphs | Departure message + static art frame | **Missing** the writable, persistent marker |
| End score | `js/scoring.js` weighted grade + service record | **Strong — done** |

The pattern: the *systems* are all there; what's missing are the **played
set-pieces** and the **rhythm**. The plan below is therefore mostly seams and
scenes, not new engines.

---

## 3. The mechanics work (Oregon Trail-ness)

Ordered by feel-per-line. Each item names its seam in current code.

### 3.1 River crossings as a discrete set-piece ⭐ the signature beat

Today a river is terrain friction. Make it a moment. Trigger when the day's
travel enters `river` terrain or a block whose `hazards` include a crossing
(the data is already in `blocks.json`); also fire it as the resolution stage
of water-keyword events instead of a plain outcome line.

The beat, in the existing decision grammar (`promptChoice`):

```
  ── CHUTANLI CREEK, spring freshet ──────────────
  The crossing gauge reads HIGH. Flow: fast. Bed: cobble.
  [1] Ford it now            (fast; risk: gear, injury)
  [2] Walk the line first    (+2h; scouts real risk down)
  [3] Winch across at the old bridge site (+4h, fuel)
  [4] Camp and wait for the level to drop (lose the day)
```

Risk inputs already exist: weather (`travelModifier`, `dangerous`), season
(freshet vs late-summer low water), crew capacity, equipment level. Failure
outcomes reuse existing vocabulary — supplies float away
(`applyConsumption`), a named crew member goes into the water
(`applyRandomInjury` / hypothermia via `applyStatusEffect`), time lost. A
drowned rations crate should *hurt* the same way OT's did.

- New module: `js/journey/riverCrossing.js` (verdict builder + outcome
  application), invoked from `executeFieldDay` in recon and from a
  `resolvesAs: 'crossing'` hook in `js/events/resolution.js` so
  water events can hand off to it.
- Scene: see §4.3 — this is the flagship ascii-anim moment.
- Reuse note: `getBlockAccessVerdict` stays; the crossing consumes its
  scoring rather than duplicating it.

### 3.2 The landmark drumbeat

Blocks *are* landmarks — they have names, `distance`, descriptions. Surface
the classic ticker in the day header and after every travel action:

```
  NEXT: Block 7 — Kluskus mainline junction   4.2 km
  TRAVELED: 61 km   ·   DAY 9   ·   food 62 · fuel 41
```

One function in `js/journey/progress.js` (`distanceToNextBlock(journey)`),
rendered in `displayDayHeader` and echoed by the travel strip's landing
message. Upgrade the 25/50/75/90 milestone toasts
(`js/journey/constants.js` `MILESTONE_COPY`) into small camp interstitials:
a campfire scene + one crew conversation from the existing reactions decks +
a single choice (push on / rest up) — copy already exists, the scene player
already exists; this is a ~60-line wiring job in the milestone path of
`js/journey/progress.js` callers.

### 3.3 Events interrupt travel (the OT rhythm inversion, roadmap Phase 3)

Move the field-event roll from day-start into the travel action: play the
travel strip, pause it at a random `t`, run the vignette + decision, resume
the strip. `playFrames` already resolves a promise per deck, so the strip
becomes two decks with the event between them. Keep ONE parameterized
`checkForEvent` so desk modes stay in the same pipeline. Seam:
`js/modes/recon.js:501` (`playTravelStrip`) + `checkForEvent` call at the
top of `runFieldDay`.

### 3.4 Season-keyed weather

`getRandomWeather` (`js/data/blocks.js`) takes `journey.season` and weights
the 9 conditions per season (no heavy_snow in July in the SBS; freshet rain
bands in spring; fire-weather runs in August). The campaign already sets
seasons; expedition modes should advance season on long runs. Desk modes
read weather too: stakeholder availability and referral turnaround already
have modifier hooks in the seasonal data — let a blizzard cancel an open
house. Content-only plus ~30 lines; no schema change.

### 3.5 Tombstones — the writable kind

When a crew member dies (or quits bitterly), offer one `promptText` line:
the epitaph. Persist `{ name, epitaph, areaId, blockId, day, cause }` to
`bcft.trailMarkers.v1`. On *later* runs, when any journey's travel passes
that block, a quiet interstitial:

```
  A weathered marker stands off the cutline:
  ┌─────────────────────────┐
  │  DEE-DEE VANCE          │
  │  "should've waited      │
  │   for the water"        │
  │  Day 14, Chutanli       │
  └─────────────────────────┘
```

This is the single most Oregon Trail feature the game can add, it's pure
localStorage + one lookup in the travel path, and it composts failed runs
into content. Files: `js/journey/trailMarkers.js`, hooks in `js/crew.js`
death path + debrief, lookup in the travel action. The service record
(`js/career.js`) already proves the persistence pattern.

### 3.6 Trading with teeth

Two additions to the thin buy-only shop:

- **Passing crews.** A new event family (`type: 'trade'`, ~8 events): a
  hauling contractor short on food offers diesel; a survey crew wants your
  spare tire chains and pays in first aid. Barter = effects vocabulary
  already supports every resource; no engine change, pure
  `js/data/json/field/events.json` content plus one `trade` fallback deck in
  vignettes.
- **Price drift at posts.** `handleResupply` prices scale with remoteness
  (`block.distance`) and day-of-run scarcity — three lines of multiplier,
  big "should I buy now?" tension.

### 3.7 Hunting/foraging as a played minigame (do LAST of the mechanics)

Replace the single roll with a 10-second terminal minigame that stays
tap-first: a creature sprite (moose/grouse from the vignette decks) walks
across a strip; the player taps/presses when it crosses the sightline
column; distance from center scales the food haul; a miss spooks the game
and burns the hours anyway. Skill cap ~2× the current average yield so
balance sims stay valid; auto-resolve to today's roll under
`prefers-reduced-motion` or when the player ignores it. Build on
`playFrames`' input plumbing but with a live `onTick` hook — the one place
the scene player grows a real-time input surface, which is why this comes
last.

### 3.8 Desk-mode texture (parity, not parody)

Planning/permitting shouldn't fake a wagon. Their "travel" is the file
moving: give each a between-decisions strip equivalent (see §4.5) and let
weather/season touch them (§3.4). The office-window scene alone — season
outside, rain on the glass in fall — carries most of it.

---

## 4. The ascii-anim harvest

### 4.0 What's over there, and why it drops in

ascii-anim ships the same 33 animations twice: a React DOM version
(`src/animations/*.jsx` — ignore it) and a **vanilla textmode version**
(`src/textmode/*.js`) where each module is:

```js
export const name = 'ASCII Fire';
export function init() {}
export function draw(t, frame) {}   // t = char grid; frame = counter
```

drawn through six helpers (`drawChar/drawText/drawHLine/drawBox/drawHeader/
drawGrid`) in `src/textmode/helpers.js`. Forest's
`js/gridview/renderer.js` *already mirrors this exact API* (its header says
so). Two other engine-grade assets sit beside the catalog:

- `src/aquarium/asciiquarium.js` — an 843-line framework-free **entity
  engine** (multi-frame sprites + color masks, z-sorting, AABB collisions,
  lifecycle callbacks). **GPL-2.0-or-later** — see §6.
- `src/animations/AsciiForest.jsx` — React shell around **pure** functions:
  5 tree species × 4 growth stages as palette-mapped sprites, 5 biomes
  (clearing → ancient), deterministic star placement, a cell-buffer
  compositor, collision-avoiding tree placement. The single most on-theme
  asset for a forestry game.

### 4.1 The bridge (build once, everything follows)

New: `js/scene/textmode/adapter.js`, two consumption paths off one shim:

1. **Grid path (ASCII Grid renderer):** implement ascii-anim's six helpers
   against `TextmodeRenderer` cells (`rgb(r,g,b)` fg; top-left coords —
   simpler than the original, which un-centers textmode.js's origin). A
   `GridView` "scene pane" region calls `module.draw(shim, frame)` per
   heartbeat. Ported modules run **unchanged**.
2. **String path (DOM terminal + reduced capability):** run the same module
   against an offscreen char buffer for N frames, snapshot `toString()` per
   frame, feed the deck to the existing `playFrames`. Monochrome, which the
   DOM terminal already is — the theme CSS colors it.

Vendor ported modules into `js/scene/textmode/` (self-hosted, no CDN, no new
dependency — same call the gridview renderer already made). Port only what's
themed; this is a curation, not a mirror.

### 4.2 Component-by-component mapping

**Port now (high thematic value):**

| ascii-anim module | Where it lands in the game |
|---|---|
| `ascii-fire` (cellular fire buffer) | Wildfire/burn events (replaces the small hand-drawn `wildfireAnimation` deck), campfire at camp/milestone interstitials, debrief "road home" beat |
| `ascii-rain` (drops + splash particles) | Weather layer: replaces the travel strip's static `/` columns; ambient behind rain-day headers; office window in desk modes |
| `ascii-tide` / `ascii-waves` (eased water, parallax sine layers) | **River crossing scene** (§3.1) and coastal-area block arrivals |
| `text-morph` (scramble/decode) | Season transitions in campaign ("SPRING ▸ SUMMER"), title reveal on the landing hub, milestone headers, death announcements |
| `ascii-glitch` | Radio static behind RADIO CHECK (`js/ui/radio.js`), scrutiny/investigation events, crisis interludes |
| `ascii-starfield` + `gas-lantern` | Night camp: tent deck backed by a starfield, lantern in the corner — makes the camp action *feel* like OT's rest screen |
| `ascii-fireworks` (full particle system) | Debrief grade-A / campaign-tier celebration, one loop, then back to the terminal |
| `matrix-rain` | Desk modes only: the "referral queue churning" interstitial for permitting (green columns read as paperwork, keeps satire) |
| `infinite-building` (looping vertical scroll technique) | Not the building — the *technique*: upgrade `travelStrip.js` parallax from 2 tree bands to 3-plane looping buffers with a ridgeline |
| `buddy-gallery` / `stick-buddy` sprite patterns | Wildlife encounter vignettes (2-frame idle grammar) and a richer walking-crew sprite on the strip |

**The centerpiece port — Honeytree Forest (pure functions only):**

Lift `parseSprite`, `SPRITES`, `getSprite`, `BIOMES`, `getBiome`, `hash`,
the buffer compositor, and `findOpenX` into `js/scene/forest.js`. Three
uses, in order of payoff:

1. **The landing hub grows your career.** Each completed run plants a tree
   on the hub scene; species from the run's area `dominantTrees`, growth
   stage from run grade; biome tier (clearing → grove → woodland → old
   growth → ancient) from `js/career.js` totals. The service record becomes
   *visible* every time you open the game. Deterministic from the record
   (their `hash()` pattern), so it never needs saving.
2. **Silviculture progress viz.** Planted blocks render as seed→sapling
   sprites that advance with survival surveys — the role's whole loop,
   finally on screen.
3. **Block-arrival establishing shots.** Compose a biome strip from the
   block's `becCode`/`features` behind the arrival message.

**Skip (no theme fit — leave as easter eggs at most):** donut, cube, globe,
galaxy, DNA, tunnel, plasma, clock, emoticon parade, table flip, jumping
jack, data-flow, serverless-glitch. If any sneak in, it's `spinning-donut`
on the settings screen as a renderer stress-test toggle, nothing else.

**Steal the craft, not the module:** the luminance ramps
(`' .:-=+*#%@'`, `'.,-~:;=!*#$@'`…) and sine-driven flicker/twinkle idioms
belong in a tiny `js/scene/textmode/ramps.js` for any future scene work.

### 4.3 The river crossing scene (flagship composition)

The §3.1 set-piece composed from ported parts: `ascii-tide` water (level =
actual gauge state) + bank terrain from the travel strip's tree bands + the
crew sprite at the water's edge. Ford attempt: crew sprite steps into the
water plane; on failure a supplies crate sprite floats off-screen right and
the named victim's marker bobs — the mechanical outcome (§3.1) narrated by
the scene instead of a text line. ~1 day of composition work once the
adapter exists, and it's the screenshot the game gets shared with.

### 4.4 Wildlife ambience — entity layer, license-clean

The asciiquarium *engine* is the right architecture (entities with sprite
frames, velocity, z-depth, lifecycle) but it's GPL-2.0-or-later (§6).
Write our own ~120-line `js/scene/entities.js` implementing the same
pattern (we need no collisions for ambience), and use it to drift wildlife
through scenes: an eagle across the day header sky, a moose crossing the
travel strip's far band (rare, pace-dependent — grueling pace sees nothing,
resting sees the most: a quiet reward that reinforces the pace mechanic).

### 4.5 Desk-mode strips (so all five roles get motion)

- **Planning:** map-table scene — the Braille area map (`js/scene/mapscii/`)
  draws itself block by block as the plan file grows.
- **Permitting:** the referral hand-off — envelope sprite along a
  `data-flow`-style route line; stamp thunk on approvals.
- **Manager:** boardroom window + the quarterly chart drawing itself
  (`js/ascii.js` sparkbars animated left-to-right).

Each is one composed scene reusing adapter parts; they make §3.8 real.

---

## 5. Terminal-aesthetic guardrails (hard rules)

1. **No new dependencies, no CDN.** Ported modules are vendored vanilla JS,
   same policy as `js/gridview/` and `js/scene/mapscii/`.
2. **Theme-mapped color.** Scenes never hardcode ascii-anim's RGB. The
   adapter exposes a 4-slot palette (`fg`, `dim`, `accent`, `danger`)
   resolved from the active theme's CSS variables, and ports quantize to it.
   Green phosphor stays green; amber stays amber; the DOM string path is
   monochrome by construction.
3. **Reduced motion is first-class.** Every scene resolves to a single
   still frame under `prefers-reduced-motion` (the `playFrames` contract);
   the grid-path pane draws frame 0 and stops. Minigames auto-resolve.
4. **Skippable, never blocking.** Everything routes through the existing
   skip/`.scene-keep` plumbing in `js/scene/player.js`; a scene must never
   gate a decision the player could already answer.
5. **Characters only.** No pixel-art, no smooth-scrolling canvas cheats in
   the grid path — cell-quantized motion is the aesthetic.
6. **Mobile budget.** One live animated pane at a time; the gridview
   heartbeat (120 ms) is the global tick — ports keyed off `frame`, not
   their own timers. Validate the crossing scene at 390×844.

---

## 6. License note (resolve before porting)

Neither repo currently has a LICENSE file. `src/aquarium/asciiquarium.js`
is explicitly GPL-2.0-or-later (header comment; port of asciiquarium-js).
Decision needed if that file is ever copied into forest: either the game
accepts GPL for the combined work, or (recommended, per §4.4) we
re-implement the small entity pattern ourselves and copy nothing. The
textmode modules and AsciiForest are first-party in ascii-anim and carry no
notice — copying between the author's own repos is fine, but both repos
should gain a LICENSE file regardless.

---

## 7. Build order

Sequenced so every step ships something visible and nothing blocks on a
rewrite. Mechanics and harvest interleave on purpose — each set-piece lands
with its scene.

**Phase A — the bridge + three quick scenes** *(small; unlocks everything)*
1. `js/scene/textmode/adapter.js` (grid path + string path + theme palette).
2. Port `ascii-fire`, `ascii-rain`, `text-morph`.
3. Wire: fire → wildfire events + camp; rain → travel strip weather layer;
   text-morph → campaign season transitions. Immediate visible payoff.

**Phase B — the drumbeat + the crossing** *(the OT core)*
4. Landmark ticker + milestone camp interstitials (§3.2, campfire scene from
   Phase A's fire).
5. River crossing mechanic (§3.1) + tide/waves port + the flagship scene
   (§4.3).
6. Events-interrupt-travel (§3.3).

**Phase C — the world remembers** *(retention hooks)*
7. Tombstones/epitaphs (§3.5).
8. Honeytree port → career landing hub (§4.2 use 1), then silvi growth viz
   (use 2).
9. Season-keyed weather (§3.4) + trading events & price drift (§3.6).

**Phase D — full-cast polish**
10. Desk-mode strips (§4.5) + night-camp starfield/lantern + debrief
    fireworks.
11. Wildlife entity layer (§4.4).
12. Hunting minigame (§3.7) — last, since it's the only real-time input
    surface.

Each phase ends green on `npm test` + `lint:events` + the Playwright suite;
Phase B adds a crossing e2e spec, Phase C a trailMarkers unit test, and the
balance sims re-run after §3.6/§3.7 touch yields.
