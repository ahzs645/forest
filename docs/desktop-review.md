# Desktop playability review — 2026-09-05

This review used isolated Chromium browser contexts against the local source server at `http://127.0.0.1:5178/`, with real mouse and keyboard interactions at **1280 × 720** and **1440 × 900**. The new reproducible coverage is `tests/e2e/desktop-review.spec.js`.

## Confirmed defects and fixes

**P1 — Help could silently execute a shift underneath its dialog.** From a fresh Journeyman recce run (seed 6101, first operating area), opening Help with `?` and pressing `1` selected “Work the block.” The dialog remained visible while the underlying expedition finalized the access package and advanced to its result acknowledgement. The modal also left keyboard focus in the underlying choices.

The parent task fixed global gameplay accelerator isolation and modal focus management in `js/ui.js` and `js/ui/modal.js`. Regression coverage checks that number keys leave the underlying choices unchanged, focus enters and stays within the modal using Tab/Shift+Tab, and Escape restores the original choice so normal Enter activation works again.

**P2 — Scrolling status could move the entire game offscreen.** At 1280 × 720, the status sidebar grew to 1396 px instead of fitting the viewport. A wheel scroll over the visible sidebar scrolled the document by 676 px, moving the response area to y = −289.5 and leaving an empty right side. At 1440 × 900 the field log also scrolled offscreen. Screenshot inspection caught this after the initial assertions passed; the regression now requires both the field log and response area to remain inside the viewport after scrolling to Location.

The parent task constrained the sidebar to the viewport and made its inner content own scrolling. The repeated mouse-wheel test now keeps the field log and responses in place while Supplies and Location remain readable.

## Coverage

At each desktop size:

- Landing Campaign, New Expedition, Seasonal Strategy, Load Data and Settings controls fit within the viewport.
- Help, Compliance Intel, Load Data and Settings open from their advertised controls, fit within the viewport and dismiss back to the landing screen.
- Keyboard New Expedition and Enter confirmation progress through crew name, specialization and operating area setup.
- Choice navigation wraps from first to last and back using arrow keys, keeping the selected final option visible.
- The status sidebar scrolls to the location section without losing access to decisions.
- A real ground-truth action reaches shift closeout, the following shift begins, and reload/resume retains the day, travel distance and mission objective.
- Campaign setup and the Seasonal Strategy entry route open correctly.
- Help isolates gameplay accelerators and keyboard focus.

Screenshots are stored with the test artifacts under `/tmp/forest-desktop-agent-results/`. This targeted desktop review complements the separate mode completion and mobile checks; it does not itself replay every campaign season or claim coverage of Safari, Firefox, real hardware or every event branch.

## Results

**8/8 desktop browser tests passed** after both fixes (15.8 seconds). ESLint passed for the added spec. Runtime error collectors stayed empty in the utility, expedition and entry-flow tests.

Inspected actual screenshots of the landing page, live recce at both sizes, Help at both sizes, campaign setup, Seasonal Strategy setup, resumed shift and the repaired sidebar scroll. The repaired 1280 × 720 screenshot keeps Supplies and Location visible alongside the field log and all seven response options.

- [Fixed sidebar scroll, 1280 × 720](/tmp/forest-desktop-agent-results/desktop-review-desktop-rev-7a563--real-action-survive-resume-chromium/scrolled-status.png)
- [Resumed expedition, 1440 × 900](/tmp/forest-desktop-agent-results/desktop-review-desktop-rev-916cc--real-action-survive-resume-chromium/resumed.png)
- [Test run log](/tmp/forest-desktop-review-tests.log)

The regression run uses the project Chromium executable override and `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5178`, so it tests source served locally without replacing the existing build.
