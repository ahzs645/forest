# Living Trail View

The main game now has a persistent ASCII landscape above the field log. It stays visible while the player chooses, rather than disappearing with a short event vignette.

## What changes on screen

- Recon shows a truck around roads/highway camps, or the crew on foot. Travel shifts near trees faster than distant ridges, and weather animates independently.
- Rain, snow, fog, clouds and sunlight reflect the current conditions. Camp choices switch to a tent, stars and a flickering campfire.
- Active washouts and landslides appear ahead of the crew with a CLOSED marker. They disappear when the saved obstruction is resolved or is no longer on the current route.
- Silviculture shows workers and seedlings. Seedling coverage follows blocks actually planted; animation time does not grow the forest or award progress.
- Planning, permitting and management show an office window with maps, files or a district chart, plus a steaming mug.
- The deployment meter uses the same operational progress as the rest of the UI. A completed block package is not mistaken for physical travel.

The scene is illustrative, not an extra simulation. It does not consume the game's random-number stream, spend resources, save data or advance a turn.

## Controls and displays

Pause/Play and Hide/Show have 44px minimum touch targets. Reduced-motion preferences start the picture paused and are respected when changed during play. The animation timer stops while the page is hidden, the picture is collapsed, or the player returns to the landing screen.

Classic and Modern show the colored character canvas. Large ASCII Grid layouts project the same scene with the active grid colors and a pause control. Short grids prioritize the field log and full-size choice targets. Short browser windows start collapsed; opening the picture makes the game frame scroll so the picture remains readable and decisions remain reachable.

The canvas has a descriptive accessible label, and the progress meter has numeric accessibility attributes. Animation ticks do not continually announce themselves to screen readers.

## Source inspiration and implementation

Reviewed the local `ascii-anim` gallery, especially `src/textmode/ascii-forest.js`, `ascii-car.js`, `ascii-rain.js`, `gas-lantern.js`, and their React counterparts. Used the forest layering, vehicle movement, weather particles and lantern ideas to draw original forestry scenes. No gallery package or React dependency was added to the main game's renderer.

- `js/scene/trailView.js`: pure game-state adapter and deterministic character/color compositor; reusable across renderers.
- `js/ui/trailView.js`: canvas display, controls, responsive sizing and timer lifecycle.
- `js/gridview/gridView.js`: ASCII Grid projection.
- `scss/components/_trail-view.scss`: compact and expanded layouts.

Routine travel, camp and office animation now uses Trail View alone. The old travel strip and sidebar radio are suppressed when Trail View is available, including when the player collapses it. Event-specific vignettes, river-crossing scenes and the career forest remain available. This addition is integrated into the five expedition roles and Campaign deployments; the separate Seasonal Strategy/Crisis presentation is unchanged.

Result acknowledgements in recon and planning now use one plain **Continue** button, without a number, risk-card header or redundant description. Keyboard Enter still advances to the shift closeout.

## Verification

- 353 Node tests pass, including deterministic rendering, read-only state, obstruction lifecycle, planting progress and all role/weather/action combinations.
- 12 focused browser scenarios cover all five roles, animation pause and reduced motion, route blockages, three phone sizes, Modern and ASCII Grid.
- The complete Chromium suite passes all 110 tests, including Campaign, save/resume, desktop and mobile regression coverage. A final minimum-width guard for compact grids also passes all three focused Grid scenarios.
- All 23 WebKit compatibility scenarios pass, covering full role/difficulty playthroughs, Campaign, Grid, save/resume and phone smoke checks. This is browser-engine testing, not a physical iPhone run.
- Production build passes; JavaScript lint has zero errors and the same 37 pre-existing warnings.

Reproduce the focused checks with:

```sh
node --test tests/trailView.test.mjs
npx playwright test tests/e2e/trail-view.spec.js
```

For an existing local preview, set `PLAYWRIGHT_BASE_URL` to its URL. Build root-path test previews with `VITE_BASE_PATH=/ npm run build`, as the project's E2E server does.

## Preview captures

- [Plain Continue after results](../reports/trail-view-continue.png)
- [Travel with a single animation](../reports/trail-view-single-travel.png)
- [Trail](../reports/trail-view-desktop.png)
- [Camp](../reports/trail-view-camp.png)
- [Phone](../reports/trail-view-phone.png)
