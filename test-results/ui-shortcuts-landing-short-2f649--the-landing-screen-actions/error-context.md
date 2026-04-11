# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-shortcuts.spec.js >> landing shortcuts stay scoped to the landing screen actions
- Location: tests/e2e/ui-shortcuts.spec.js:3:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('#modal-title')
Expected: "LOAD DATA"
Received: ""
Timeout:  5000ms

Call log:
  - Expect "toHaveText" with timeout 5000ms
  - waiting for locator('#modal-title')
    9 × locator resolved to <h2 id="modal-title" class="modal-title"></h2>
      - unexpected value ""

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]: "▶ TERMINAL_ID: 88-X // STATUS: ONLINE"
      - generic [ref=e6]: "MEM: 64K OK // BEC_ZONES: LOADED"
    - generic [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e9]: /\ / \ BRITISH COLUMBIA / \ FORESTRY OPERATIONS /______\ SIMULATOR v1.0.4 ||
        - generic [ref=e10]: "|||| \"SUSTAINABILITY THROUGH DATA\" ||||"
      - heading "SYSTEM READY" [level=1] [ref=e11]
      - generic [ref=e12]:
        - paragraph [ref=e13]: Welcome, Operator. You have been assigned to Management Unit 5-12.
        - paragraph [ref=e14]: "Your objective: Balance ecological integrity with timber volume targets."
        - generic [ref=e15]:
          - generic [ref=e16]: "> BEC Zones...OK"
          - generic [ref=e17]: "> Harvesting Units...OK"
          - generic [ref=e18]: "> Market Rates...UPDATED"
          - generic [ref=e19]: "> HQ Connection...CONNECTED"
      - generic [ref=e20]:
        - button "> [N]EW EXPEDITION" [ref=e21]
        - button "# [T]UI STRATEGY MODE" [ref=e22]
        - button "= [L]OAD DATA" [ref=e23]
        - generic [ref=e24]:
          - button "# [P] COMPLIANCE INTEL" [ref=e25]
          - button "? [H]ELP" [ref=e26]
          - button "* SETTINGS" [ref=e27]
    - generic [ref=e28]: "> INPUT: KEYBOARD_MOUSE > REGION: NORTH_INT v1.0.4-stable"
  - generic [ref=e29]:
    - banner [ref=e30]:
      - generic [ref=e31]:
        - text: 🌲
        - generic [ref=e32]: BC FORESTRY SIMULATOR TERMINAL V1.0 // CONNECTED
      - generic [ref=e33]:
        - generic [ref=e34]: SYSTEM ONLINE
        - button "Settings" [ref=e35]: ⚙
    - generic [ref=e36]:
      - generic [ref=e37]: CURRENT YEAR 2025
      - generic [ref=e38]: FUNDS $80,000
      - generic [ref=e39]:
        - text: ECO-HEALTH
        - generic [ref=e40]: 85%
      - generic [ref=e41]:
        - text: ZONE
        - generic [ref=e42]: 🌲 Sub-Boreal Spruce
    - complementary [ref=e43]:
      - generic [ref=e44]: SYSTEM METRICS
      - generic [ref=e46]: OPS PROGRESS 0%
      - generic [ref=e48]: ENERGY 100%
      - generic [ref=e50]: STRESS 0%
      - generic [ref=e52]: BUDGET 100%
      - generic [ref=e53]:
        - generic [ref=e54]: ACTIVE DIRECTIVE
        - generic [ref=e55]: Complete your assigned objectives while managing resources efficiently.
    - main [ref=e56]:
      - generic [ref=e57]:
        - heading "BC FORESTRY TRAIL" [level=1] [ref=e58]
        - generic [ref=e59]:
          - button "View status" [ref=e60]: "[S] Status"
          - button "Glossary" [ref=e61]: "[G] Glossary"
          - button "Professional and compliance intel" [ref=e62]: "[P] Intel"
          - button "Help" [ref=e63]: "[?] Help"
          - button "Restart game" [ref=e64]: "[R] Restart"
      - generic [ref=e65]:
        - generic [ref=e66]:
          - generic [ref=e67]: DAY 1
          - generic [ref=e68]: PROGRESS 0%
          - generic [ref=e69]: CREW 5/5
          - generic [ref=e70]: MORALE 75%
        - generic [ref=e71]:
          - generic [ref=e72]:
            - generic [ref=e73]: DAY
            - generic [ref=e74]: "1"
          - generic [ref=e75]:
            - generic [ref=e76]: PROGRESS
            - generic [ref=e77]: 0%
          - generic [ref=e78]:
            - generic [ref=e79]: CREW
            - generic [ref=e80]: 5/5
          - generic [ref=e81]:
            - generic [ref=e82]: MORALE
            - generic [ref=e83]: 75%
      - generic [ref=e84]:
        - generic [ref=e85]: /VAR/LOG/SYSTEM.LOG
        - log
      - generic [ref=e86]:
        - generic [ref=e87]: ⚡ AWAITING INPUT
        - generic [ref=e88]:
          - text: "> Awaiting command input..."
          - button "EXECUTE" [ref=e89]
    - complementary "Detailed status" [ref=e90]:
      - generic [ref=e91]:
        - heading "STATUS REPORT" [level=2] [ref=e92]
        - button "Close panel" [ref=e93]: "[X]"
      - generic [ref=e94]:
        - heading "CREW" [level=3] [ref=e96]
        - heading "SUPPLIES" [level=3] [ref=e98]
        - heading "LOCATION" [level=3] [ref=e100]
    - contentinfo [ref=e101]:
      - generic [ref=e102]:
        - button "[G] GLOSSARY" [ref=e103]
        - button "[P] INTEL" [ref=e104]
        - button "[R] RESTART" [ref=e105]
      - generic [ref=e106]: SECURE CONNECTION // BC_FORESTRY_NODE
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('landing shortcuts stay scoped to the landing screen actions', async ({ page }) => {
  4  |   await page.goto('/');
  5  |   await page.waitForLoadState('networkidle');
  6  | 
  7  |   await page.keyboard.press('l');
  8  | 
> 9  |   await expect(page.locator('#modal-title')).toHaveText('LOAD DATA');
     |                                              ^ Error: expect(locator).toHaveText(expected) failed
  10 |   await expect(page.locator('#modal-body')).toContainText('Save/Load functionality coming soon.');
  11 | });
  12 | 
```