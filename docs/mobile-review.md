# Mobile playability review — 5 September 2026

Review performed against the local Vite build using Chromium touch contexts. This is browser device emulation, not a physical iPhone/Android or Safari verification.

## Coverage

The new `tests/e2e/mobile-review.spec.js` covers:

- 320×568, 390×844, 430×932 portrait and 844×390 landscape.
- All five expedition roles: planning, permitting, recon, silviculture and manager. Each case completes setup, six choices, opens/closes detailed status and resumes the saved expedition after reload.
- Campaign setup and six field decisions at each size.
- Main-menu Seasonal Strategy setup and sixteen touch interactions at each size.
- Modern display campaign area selection at 320×568 and 844×390, with a direct visible-height and pointer-hit check.
- Horizontal overflow, minimum 44px choice dimensions, reachability of the final choice by list scrolling, modal access and JavaScript runtime errors.

These cases test mobile interaction and short sequences, not every event or the entire campaign. Full-run coverage belongs to the separate campaign/role playthrough suites.

## Confirmed findings and fixes

1. **Modern display could hide all operating-area cards on short screens.** At 844×390 the area list collapsed while its child cards remained in the DOM; at 320×568 the visible card height was zero. The final screenshot is `/tmp/mobile-modern-landscape.png`; the pre-fix 320px failure is retained in `/tmp/forest-mobile-modern-results/`. The parent added a short-height scrolling layout, including short portrait phones, and the new tests protect visible touch access.
2. **ASCII Grid hid overflow choices without a touch route to them.** At 844×390, Campaign rendered only eight of nine operating areas, followed by “1 more.” The ninth area, Okanagan/Shuswap Drybelt, had no hit target; swipes were handled only in the field log. At 320×568, all nine rows fit but their tap regions were only 15px high. Post-fix evidence: `/tmp/mobile-grid-844.png` and `/tmp/mobile-grid-fixed-layout.log`. The parent added Previous/Next pages and touch regions at least 44px tall, with a separate grid regression.

Classic portrait roles and Campaign did not show a gameplay blocker in the tested sequences. At 320px the header's compact text buttons are narrower than 44px, although their heights are 44px and separate targets remain usable. The mission strip truncates long objectives; the Status panel exposes their full text. Short landscape Classic keeps a small, independently scrollable action pane, so a long choice's description may need scrolling.

## Verification results

All **30 new mobile cases pass across the final run and targeted reruns**:

- 20 expedition role/viewport combinations, including status and saved resume.
- 4 Campaign starts.
- 4 main-menu Seasonal Strategy flows.
- 2 Modern short-screen regressions.

The combined final run passed 28 cases. Two manager geometry checks measured 43.5px because the browser rounded a scroll position by half a CSS pixel; the test now rounds visible CSS-pixel coverage up, and both targeted reruns passed. No production change was needed for this rounding. The spec also passes ESLint.

Logs: `/tmp/forest-mobile-final.log`, `/tmp/forest-mobile-rounding.log`, `/tmp/forest-mobile-landscape-rounding.log`. Final screenshots are in `/tmp/forest-mobile-final-results/`. Grid pagination is covered by the parent's separate regression, not included in the 30-case count above.

No physical-device Safari/WebKit run was performed. Software-keyboard behavior, browser address-bar resizing, pinch zoom and actual finger ergonomics still need device testing. No full-campaign completion claim is made by this mobile interaction suite.
