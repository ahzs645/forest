# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: role-smoke.spec.js >> planner smoke shows live lane guidance on boot
- Location: tests/e2e/role-smoke.spec.js:41:1

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: page.click: Test timeout of 120000ms exceeded.
Call log:
  - waiting for locator('#intro-continue-btn')
    - locator resolved to <button type="button" id="intro-continue-btn" class="init-primary full-width">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
      - waiting 100ms
    232 × waiting for element to be visible, enabled and stable
        - element is not visible
      - retrying click action
        - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e1]:
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
        - button "> [N]EW EXPEDITION" [active] [ref=e21]
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
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | async function startRole(page, roleIndex, areaIndex, difficultyLabel = 'Greenhorn', seed = 1200) {
  4   |   await page.addInitScript((seedStart) => {
  5   |     let seedValue = seedStart;
  6   |     Math.random = () => {
  7   |       seedValue = (1664525 * seedValue + 1013904223) >>> 0;
  8   |       return seedValue / 0x100000000;
  9   |     };
  10  |   }, seed);
  11  | 
  12  |   await page.goto('/');
  13  |   await page.waitForLoadState('networkidle');
  14  |   await page.click('#new-game-btn');
> 15  |   await page.click('#intro-continue-btn');
      |              ^ Error: page.click: Test timeout of 120000ms exceeded.
  16  |   await page.locator('.role-card').nth(roleIndex).click();
  17  |   await page.click('#role-continue-btn');
  18  |   await page.locator('.area-item').nth(areaIndex).click();
  19  |   await page.click('#area-continue-btn');
  20  |   await page.locator('#choices button').filter({ hasText: difficultyLabel }).click();
  21  |   await page.locator('#choices button').filter({ hasText: 'Begin Journey' }).click();
  22  | }
  23  | 
  24  | async function resolveUntil(page, predicate, maxSteps = 3) {
  25  |   for (let step = 0; step < maxSteps; step += 1) {
  26  |     if (await predicate()) {
  27  |       return true;
  28  |     }
  29  | 
  30  |     const firstChoice = page.locator('#choices button').first();
  31  |     if (!(await firstChoice.isVisible().catch(() => false))) {
  32  |       break;
  33  |     }
  34  | 
  35  |     await firstChoice.click();
  36  |   }
  37  | 
  38  |   return predicate();
  39  | }
  40  | 
  41  | test('planner smoke shows live lane guidance on boot', async ({ page }) => {
  42  |   const runtimeErrors = [];
  43  |   page.on('pageerror', (error) => runtimeErrors.push(error.message));
  44  |   page.on('console', (message) => {
  45  |     if (message.type() === 'error') {
  46  |       runtimeErrors.push(message.text());
  47  |     }
  48  |   });
  49  | 
  50  |   await startRole(page, 0, 0, 'Greenhorn', 4001);
  51  | 
  52  |   await expect(page.locator('#terminal')).toContainText('Lane Focus:');
  53  |   await expect(page.locator('#terminal')).toContainText('Next Best Move:');
  54  |   await expect(page.locator('#choices button').first()).toBeVisible();
  55  |   expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
  56  | });
  57  | 
  58  | test('permitter smoke shows file-lane guidance on boot', async ({ page }) => {
  59  |   const runtimeErrors = [];
  60  |   page.on('pageerror', (error) => runtimeErrors.push(error.message));
  61  |   page.on('console', (message) => {
  62  |     if (message.type() === 'error') {
  63  |       runtimeErrors.push(message.text());
  64  |     }
  65  |   });
  66  | 
  67  |   await startRole(page, 1, 1, 'Greenhorn', 5001);
  68  | 
  69  |   await resolveUntil(
  70  |     page,
  71  |     async () => (await page.locator('#terminal').textContent())?.includes('Lane Focus:') ?? false,
  72  |     2
  73  |   );
  74  | 
  75  |   await expect(page.locator('#terminal')).toContainText('Lane Focus:');
  76  |   await expect(page.locator('#terminal')).toContainText('Next Best Move:');
  77  |   await expect(page.locator('#terminal')).toContainText('Stage:');
  78  |   await expect(page.locator('#choices button').first()).toBeVisible();
  79  |   expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
  80  | });
  81  | 
  82  | test('recce smoke exposes role-specific ground-truth actions', async ({ page }) => {
  83  |   const runtimeErrors = [];
  84  |   page.on('pageerror', (error) => runtimeErrors.push(error.message));
  85  |   page.on('console', (message) => {
  86  |     if (message.type() === 'error') {
  87  |       runtimeErrors.push(message.text());
  88  |     }
  89  |   });
  90  | 
  91  |   await startRole(page, 2, 2, 'Greenhorn', 6001);
  92  | 
  93  |   await expect(page.locator('#terminal')).toContainText('Current Intel:');
  94  |   await resolveUntil(
  95  |     page,
  96  |     async () => (await page.locator('#choices').textContent())?.includes('Ground-Truth Access') ?? false,
  97  |     2
  98  |   );
  99  |   await expect(page.locator('#choices button').filter({ hasText: 'Ground-Truth Access' })).toBeVisible();
  100 |   await page.locator('#choices button').filter({ hasText: 'Ground-Truth Access' }).click();
  101 |   await expect(page.locator('#choices button').filter({ hasText: 'Rest & End Shift' })).toBeVisible();
  102 |   expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
  103 | });
  104 | 
  105 | test('silviculture smoke reaches contractor rotation without runtime failure', async ({ page }) => {
  106 |   const runtimeErrors = [];
  107 |   page.on('pageerror', (error) => runtimeErrors.push(error.message));
  108 |   page.on('console', (message) => {
  109 |     if (message.type() === 'error') {
  110 |       runtimeErrors.push(message.text());
  111 |     }
  112 |   });
  113 | 
  114 |   await startRole(page, 3, 3, 'Greenhorn', 7001);
  115 | 
```