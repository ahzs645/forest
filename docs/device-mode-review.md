# Mobile, desktop and mode review — 5 September 2026

Three independent agents reviewed desktop interaction, mobile interaction, and game-mode progression. The coordinating task fixed seven confirmed defects and ran the combined regressions against a production build.

## Fixes

1. Help and other dialogs now isolate gameplay shortcuts, contain keyboard focus, and restore focus when closed. Pressing a number behind Help could previously execute a shift.
2. Desktop status content scrolls within the sidebar. Scrolling it previously moved the entire game and its decisions offscreen.
3. Modern display uses a scrolling layout on short screens. Operating-area cards previously had zero visible height on short portrait and landscape phones.
4. ASCII Grid provides Previous/Next pages for long choice lists and choice touch regions at least 44 CSS pixels tall. Its ninth operating area was previously unreachable by touch in landscape.
5. Manager reputation of zero now triggers the intended dismissal checks instead of being replaced with a default of 50.
6. Event outcomes no longer save a partially completed decision. Refreshing an outcome previously allowed monthly strategic spending or event effects to be applied inconsistently on resume.
7. Experimental Crisis Command reads the current controller stage when handling its deep-link. It previously opened ordinary seasonal setup instead of the incident.

## Coverage

| Surface | Verified coverage |
| --- | --- |
| Desktop | 1280×720 and 1440×900; mouse, keyboard, dialogs, status scrolling, real actions, reload/resume |
| Mobile emulation | 320×568, 390×844, 430×932 and 844×390; touch setup, decisions, status and resume |
| Expedition roles | Planning, permitting, recon, silviculture and manager; browser completion on easy, normal and hard |
| Campaign | Complete four-season browser playthrough; touch setup and field decisions at all four mobile sizes |
| Seasonal Strategy | Browser flows plus 3,024 complete controller years across four roles, nine areas and seven decision policies |
| Experimental Crisis | Complete four-phase incident, debrief and restart on desktop and phone |
| Display modes | Classic interaction, Modern short-screen regressions, ASCII Grid keyboard navigation and touch pagination |
| Compatibility | WebKit desktop role/campaign playthroughs and phone smoke checks; Chromium phone role/difficulty playthroughs |

The mode agent also completed 288 seeded expedition simulations and 36 manager terms. Every simulation reached an explained ending with valid state. These simulations complement browser testing; they do not establish visual usability.

## Final validation

- Node tests: **348 passed**.
- Combined browser suite: **98 passed** against the production build, including all 30 mobile-agent, eight desktop-agent and ten mode-agent scenarios.
- Additional browser/device compatibility matrix: **38 passed** against the production build.
- JavaScript lint: **zero errors**, 37 existing warnings.
- Production build and whitespace validation passed.

The final browser runs use a production preview so source-server live reloads cannot interrupt playthroughs. The optional compatibility configuration is `playwright.compat.config.js`.

```sh
npm test
npm run lint:js
npx playwright test
npx playwright test --config=playwright.compat.config.js
```

Use `PLAYWRIGHT_CHROMIUM_PATH` and `PLAYWRIGHT_WEBKIT_PATH` when installed browser executables differ from Playwright's default locations. `PLAYWRIGHT_BASE_URL` can point either suite at an existing production preview.

## Remaining observations

Full recon was the hardest measured deployment: the competent-player simulation won 19/36 full deployments versus 30/36 condensed campaign deployments. Other full roles won 34–35/36. These are policy measurements, not human win-rate estimates; failures were explicit crew, resource or deadline endings. No balance changes were made solely to improve simulation scores. All 432 aggressive seasonal-policy runs stumbled, which deserves further player feedback.

Small mobile header controls remain narrower than 44px, although they are 44px tall. Some long objectives are truncated in the mission strip and can be read in Status. Browser emulation and headless WebKit do not replace physical iPhone/Android testing of software keyboards, browser chrome resizing and finger ergonomics. Firefox and the native terminal presentation were not tested. Random event branches were sampled, not exhaustively enumerated.

All changes are local; this review did not commit, push or deploy them.

## Agent reports

- [Desktop review](desktop-review.md)
- [Mobile review](mobile-review.md)
- [Game-mode review](mode-review.md)
- [Earlier playability fixes](playability-fixes.md)
