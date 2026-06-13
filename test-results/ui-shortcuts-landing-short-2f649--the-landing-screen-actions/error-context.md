# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-shortcuts.spec.js >> landing shortcuts stay scoped to the landing screen actions
- Location: tests/e2e/ui-shortcuts.spec.js:3:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#modal-body')
Expected substring: "Save/Load functionality coming soon."
Received string:    "No saved expedition found. Runs save automatically at the end of each in-game day — reload the page anytime to pick one back up, and you will be asked before anything is overwritten."
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('#modal-body')
    9 × locator resolved to <div id="modal-body" class="modal-body">…</div>
      - unexpected value "No saved expedition found. Runs save automatically at the end of each in-game day — reload the page anytime to pick one back up, and you will be asked before anything is overwritten."

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]: ▶
        - generic [ref=e7]: "TERMINAL_ID: 88-X // STATUS: ONLINE"
      - generic [ref=e8]:
        - generic [ref=e9]: "MEM: 64K OK"
        - generic [ref=e10]: //
        - generic [ref=e11]: "BEC_ZONES: LOADED"
    - generic [ref=e12]:
      - generic [ref=e13]:
        - generic [ref=e14]: /\ / \ BRITISH COLUMBIA / \ FORESTRY OPERATIONS /______\ SIMULATOR v1.0.4 ||
        - generic [ref=e15]: "|||| \"SUSTAINABILITY THROUGH DATA\" ||||"
      - heading "SYSTEM READY" [level=1] [ref=e16]
      - generic [ref=e17]:
        - paragraph [ref=e18]: Welcome, Operator. You have been assigned to Management Unit 5-12.
        - paragraph [ref=e19]: "Your objective: Balance ecological integrity with timber volume targets."
        - generic [ref=e20]:
          - generic [ref=e21]: "> BEC Zones...OK"
          - generic [ref=e22]: "> Harvesting Units...OK"
          - generic [ref=e23]: "> Market Rates...UPDATED"
          - generic [ref=e24]: "> HQ Connection...CONNECTED"
      - generic [ref=e25]:
        - button "> [N]EW EXPEDITION" [ref=e26] [cursor=pointer]:
          - generic [ref=e27]: ">"
          - generic [ref=e28]: "[N]EW EXPEDITION"
        - button "# [T] SEASONAL STRATEGY" [ref=e29] [cursor=pointer]:
          - generic [ref=e30]: "#"
          - generic [ref=e31]: "[T] SEASONAL STRATEGY"
        - button "! [C]RISIS COMMAND" [ref=e32] [cursor=pointer]:
          - generic [ref=e33]: "!"
          - generic [ref=e34]: "[C]RISIS COMMAND"
        - button "= [L]OAD DATA" [ref=e35] [cursor=pointer]:
          - generic [ref=e36]: =
          - generic [ref=e37]: "[L]OAD DATA"
        - generic [ref=e38]:
          - button "# [P] COMPLIANCE INTEL" [ref=e39] [cursor=pointer]:
            - generic [ref=e40]: "#"
            - generic [ref=e41]: "[P] COMPLIANCE INTEL"
          - button "? [H]ELP" [ref=e42] [cursor=pointer]:
            - generic [ref=e43]: "?"
            - generic [ref=e44]: "[H]ELP"
          - button "* SETTINGS" [ref=e45] [cursor=pointer]:
            - generic [ref=e46]: "*"
            - generic [ref=e47]: SETTINGS
    - generic [ref=e48]:
      - generic [ref=e49]: "> INPUT: KEYBOARD_MOUSE"
      - generic [ref=e50]: "> REGION: NORTH_INT"
      - generic [ref=e51]: v1.0.4-stable
  - generic [ref=e52]:
    - main [ref=e53]:
      - generic [ref=e54]:
        - heading "BC FORESTRY TRAIL" [level=1] [ref=e55]
        - generic [ref=e56]:
          - button "View status" [ref=e57] [cursor=pointer]: "[S] Status"
          - button "Glossary" [ref=e58] [cursor=pointer]: "[G] Glossary"
          - button "Journey log" [ref=e59] [cursor=pointer]: "[L] Log"
          - button "Professional and compliance intel" [ref=e60] [cursor=pointer]: "[P] Intel"
          - button "Help" [ref=e61] [cursor=pointer]: "[?] Help"
          - button "Restart game" [ref=e62] [cursor=pointer]: "[R] Restart"
      - generic [ref=e64]:
        - generic [ref=e65]:
          - generic [ref=e66]: DAY
          - generic [ref=e67]: "1"
        - generic [ref=e68]:
          - generic [ref=e69]: PROGRESS
          - generic [ref=e70]: 0%
        - generic [ref=e71]:
          - generic [ref=e72]: CREW
          - generic [ref=e73]: 5/5
        - generic [ref=e74]:
          - generic [ref=e75]: MORALE
          - generic [ref=e76]: 75%
      - log [ref=e78]
    - complementary "Detailed status" [ref=e80]:
      - heading "STATUS REPORT" [level=2] [ref=e82]
      - generic [ref=e83]:
        - generic [ref=e84]:
          - heading "CREW" [level=3] [ref=e85]
          - generic [ref=e87]: No crew assigned yet
        - generic [ref=e88]:
          - heading "SUPPLIES" [level=3] [ref=e89]
          - generic [ref=e91]: Supplies not loaded
        - generic [ref=e92]:
          - heading "LOCATION" [level=3] [ref=e93]
          - generic [ref=e95]: Select your destination
  - dialog "LOAD DATA" [ref=e97]:
    - heading "LOAD DATA" [level=2] [ref=e99]
    - paragraph [ref=e101]: No saved expedition found. Runs save automatically at the end of each in-game day — reload the page anytime to pick one back up, and you will be asked before anything is overwritten.
    - button "OK" [ref=e103] [cursor=pointer]
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
  9  |   await expect(page.locator('#modal-title')).toHaveText('LOAD DATA');
> 10 |   await expect(page.locator('#modal-body')).toContainText('Save/Load functionality coming soon.');
     |                                             ^ Error: expect(locator).toContainText(expected) failed
  11 | });
  12 | 
```