# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: role-smoke.spec.js >> planner smoke shows live lane guidance on boot
- Location: tests/e2e/role-smoke.spec.js:41:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#terminal')
Expected substring: "Lane Focus:"
Received string:    "DAY 1 of 22 - STRATEGIC PLANNING🍂 Fall - Year 1 | Hours: 8hEnergy: [██████████] 100% | Stress: LOW (0%) | Rep: 50Phase: Data Gathering | Days left: 21Data: 0% | Analysis: 0% | Buy-in: 35% | Confidence: 20%Next Best Move: Choose an active block when the cutblock review opens so the rest of the file has somewhere to land.Budget: $65,000 | Political Capital: 52 | Data: 130CUTBLOCK PRIORITY DECISIONChoose how to triage the area constraints before you lock the next block focus.Peace District muskeg country where peat soils, wetlands, and dense linear disturbance can turn a clean access sketch into a winter-only file.Peace District muskeg country where peat soils, wetlands, and dense linear disturbance can turn a clean access sketch into a winter-only file. | Timber first leads | next up: Access firstConstraint triage:"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('#terminal')
    9 × locator resolved to <div role="log" id="terminal" class="terminal" aria-live="polite">…</div>
      - unexpected value "DAY 1 of 22 - STRATEGIC PLANNING🍂 Fall - Year 1 | Hours: 8hEnergy: [██████████] 100% | Stress: LOW (0%) | Rep: 50Phase: Data Gathering | Days left: 21Data: 0% | Analysis: 0% | Buy-in: 35% | Confidence: 20%Next Best Move: Choose an active block when the cutblock review opens so the rest of the file has somewhere to land.Budget: $65,000 | Political Capital: 52 | Data: 130CUTBLOCK PRIORITY DECISIONChoose how to triage the area constraints before you lock the next block focus.Peace District muskeg country where peat soils, wetlands, and dense linear disturbance can turn a clean access sketch into a winter-only file.Peace District muskeg country where peat soils, wetlands, and dense linear disturbance can turn a clean access sketch into a winter-only file. | Timber first leads | next up: Access firstConstraint triage:"

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - main [ref=e3]:
    - generic [ref=e4]:
      - heading "BC FORESTRY TRAIL" [level=1] [ref=e5]
      - generic [ref=e6]:
        - button "View status" [ref=e7] [cursor=pointer]: "[S] Status"
        - button "Glossary" [ref=e8] [cursor=pointer]: "[G] Glossary"
        - button "Journey log" [ref=e9] [cursor=pointer]: "[L] Log"
        - button "Professional and compliance intel" [ref=e10] [cursor=pointer]: "[P] Intel"
        - button "Help" [ref=e11] [cursor=pointer]: "[?] Help"
        - button "Restart game" [ref=e12] [cursor=pointer]: "[R] Restart"
    - generic [ref=e14]:
      - generic [ref=e15]:
        - generic [ref=e16]: DAY
        - generic [ref=e17]: "1"
      - generic [ref=e18]:
        - generic [ref=e19]: PROGRESS
        - generic [ref=e20]: 18%
      - generic [ref=e21]:
        - generic [ref=e22]: CREW
        - generic [ref=e23]: 100%
      - generic [ref=e24]:
        - generic [ref=e25]: MORALE
        - generic [ref=e26]: LOW
    - log [ref=e28]:
      - generic [ref=e29]: DAY 1 of 22 - STRATEGIC PLANNING
      - generic [ref=e30]: "🍂 Fall - Year 1 | Hours: 8h"
      - generic [ref=e31]: "Energy: [██████████] 100% | Stress: LOW (0%) | Rep: 50"
      - generic [ref=e32]: "Phase: Data Gathering | Days left: 21"
      - generic [ref=e33]: "Data: 0% | Analysis: 0% | Buy-in: 35% | Confidence: 20%"
      - generic [ref=e34]: "Next Best Move: Choose an active block when the cutblock review opens so the rest of the file has somewhere to land."
      - generic [ref=e35]: "Budget: $65,000 | Political Capital: 52 | Data: 130"
      - generic [ref=e36]: CUTBLOCK PRIORITY DECISION
      - generic [ref=e37]: Choose how to triage the area constraints before you lock the next block focus.
      - generic [ref=e38]: Peace District muskeg country where peat soils, wetlands, and dense linear disturbance can turn a clean access sketch into a winter-only file.
      - generic [ref=e39]: "Peace District muskeg country where peat soils, wetlands, and dense linear disturbance can turn a clean access sketch into a winter-only file. | Timber first leads | next up: Access first"
      - generic [ref=e40]: "Constraint triage:"
    - generic [ref=e42]:
      - button "[1] Access first Favor the cleaner ground and lower engineering lift. You give up some upside to avoid rework and access surprises." [active] [ref=e43] [cursor=pointer]:
        - generic [ref=e44]: "[1] Access first"
        - generic [ref=e45]: Favor the cleaner ground and lower engineering lift. You give up some upside to avoid rework and access surprises.
      - button "[2] Water and ecology first Favor the wetter, fishier, or more habitat-sensitive pieces getting the slower pass. Stronger defensibility, narrower volume pick." [ref=e46] [cursor=pointer]:
        - generic [ref=e47]: "[2] Water and ecology first"
        - generic [ref=e48]: Favor the wetter, fishier, or more habitat-sensitive pieces getting the slower pass. Stronger defensibility, narrower volume pick.
      - button "[3] Community and consultation first Favor the blocks with less public and First Nations friction. Better trust and fewer surprises, but less aggressive timber selection." [ref=e49] [cursor=pointer]:
        - generic [ref=e50]: "[3] Community and consultation first"
        - generic [ref=e51]: Favor the blocks with less public and First Nations friction. Better trust and fewer surprises, but less aggressive timber selection.
      - button "[4] Timber first Favor the stronger volume blocks. Faster supply gain, but you knowingly accept a harder follow-up and more scrutiny." [ref=e52] [cursor=pointer]:
        - generic [ref=e53]: "[4] Timber first"
        - generic [ref=e54]: Favor the stronger volume blocks. Faster supply gain, but you knowingly accept a harder follow-up and more scrutiny.
  - complementary "Detailed status" [ref=e55]:
    - heading "STATUS REPORT" [level=2] [ref=e57]
    - generic [ref=e58]:
      - generic [ref=e59]:
        - heading "CREW" [level=3] [ref=e60]
        - generic [ref=e62]:
          - generic [ref=e63]: YOUR STATUS
          - generic [ref=e64]: "Energy: ██████████ 100"
          - generic [ref=e65]: "Stress: ░░░░░░░░░░ 0"
          - generic [ref=e66]: "Reputation: 50"
          - generic [ref=e67]:
            - generic [ref=e68]: EXPERTISE
            - generic [ref=e69]: "Analysis: 50"
            - generic [ref=e70]: "Stakeholder: 50"
            - generic [ref=e71]: "Technical: 50"
      - generic [ref=e72]:
        - heading "SUPPLIES" [level=3] [ref=e73]
        - generic [ref=e74]:
          - generic [ref=e75]:
            - generic [ref=e76]: BUDGET
            - generic [ref=e79]: "65000"
          - generic [ref=e80]:
            - generic [ref=e81]: POL.CAP
            - generic [ref=e84]: "52"
      - generic [ref=e85]:
        - heading "LOCATION" [level=3] [ref=e86]
        - generic [ref=e87]:
          - generic [ref=e88]: 🍂 Fall Y1
          - generic [ref=e89]: Strategic Planning
          - generic [ref=e90]: "Phase: Data Gathering"
          - generic [ref=e91]: "Phase: data_gathering"
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
  15  |   await page.click('#intro-continue-btn');
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
> 52  |   await expect(page.locator('#terminal')).toContainText('Lane Focus:');
      |                                           ^ Error: expect(locator).toContainText(expected) failed
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
  116 |   await expect(page.locator('#choices button').filter({ hasText: 'Contractor Rotation' })).toBeVisible();
  117 |   await page.locator('#choices button').filter({ hasText: 'Contractor Rotation' }).click();
  118 |   await expect(page.locator('#choices button').first()).toBeVisible();
  119 |   expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
  120 | });
  121 | 
```