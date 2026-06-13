# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: role-smoke.spec.js >> recce smoke exposes role-specific ground-truth actions
- Location: tests/e2e/role-smoke.spec.js:82:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#terminal')
Timeout: 5000ms
- Expected substring  - 1
+ Received string     + 5

- Current Intel:
+ SHIFT 1 - Smithers Yard>>>Smithers*<<<─(Telkwa)─(Ranch)─(Wet'suw.)─(Birch*)─(VQO)─(Water)─...[░░░░░░░░░░░░░░░░░░░░] 0% | 0/76.5 km | Block 0/12Weather: Light Rain | Terrain: flat | Hours: 10hFUEL: 104 | FOOD: 46 | EQUIP: 111% | MEDS: 8 | CASH: $2,600Objective: verify 0/12 block packagesSmithers Yard package: [ ] access  [x] values sweep (not flagged)  [ ] finalizedCrew: 5/5 active | Avg Health: 90%(Crew details: the [S] Status button, or press S)RADIO CHECK: Spring Breakup Starting
+    ~~~~~~~
+   ~~~~~~~~~
+    ~~~~~~~
+   Carol (Driver) while shuttling gear radios in: The frost is coming out of the ground. Roads that were solid yesterday are turning to mush. The window for heavy equipment is closing fast.What do you do?

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('#terminal')
    3 × locator resolved to <div role="log" id="terminal" class="terminal" aria-live="polite">…</div>
      - unexpected value "SHIFT 1 - Smithers Yard>>>Smithers*<<<─(Telkwa)─(Ranch)─(Wet'suw.)─(Birch*)─(VQO)─(Water)─...[░░░░░░░░░░░░░░░░░░░░] 0% | 0/76.5 km | Block 0/12Weather: Light Rain | Terrain: flat | Hours: 10hFUEL: 104 | FOOD: 46 | EQUIP: 111% | MEDS: 8 | CASH: $2,600Objective: verify 0/12 block packagesSmithers Yard package: [ ] access  [x] values sweep (not flagged)  [ ] finalizedCrew: 5/5 active | Avg Health: 90%(Crew details: the [S] Status button, or press S)RADIO CHECK: Spring Breakup Starting
   ~~~~~~~
  ~~~~~~~~~
   ~~~~~~~
  Carol (Driver) while shuttling gear radios in: The frost is coming out of the ground. Roads that were solid yesterday are turning to mush. The window for heavy equipment is closing fast.What do you do?"
    - locator resolved to <div role="log" id="terminal" class="terminal" aria-live="polite">…</div>
    - unexpected value "SHIFT 1 - Smithers Yard>>>Smithers*<<<─(Telkwa)─(Ranch)─(Wet'suw.)─(Birch*)─(VQO)─(Water)─...[░░░░░░░░░░░░░░░░░░░░] 0% | 0/76.5 km | Block 0/12Weather: Light Rain | Terrain: flat | Hours: 10hFUEL: 104 | FOOD: 46 | EQUIP: 111% | MEDS: 8 | CASH: $2,600Objective: verify 0/12 block packagesSmithers Yard package: [ ] access  [x] values sweep (not flagged)  [ ] finalizedCrew: 5/5 active | Avg Health: 90%(Crew details: the [S] Status button, or press S)RADIO CHECK: Spring Breakup Starting
  ~~~~~~~~~
   ~~~~~~~
  ~~~~~~~~~
  Carol (Driver) while shuttling gear radios in: The frost is coming out of the ground. Roads that were solid yesterday are turning to mush. The window for heavy equipment is closing fast.What do you do?"
    5 × locator resolved to <div role="log" id="terminal" class="terminal" aria-live="polite">…</div>
      - unexpected value "SHIFT 1 - Smithers Yard>>>Smithers*<<<─(Telkwa)─(Ranch)─(Wet'suw.)─(Birch*)─(VQO)─(Water)─...[░░░░░░░░░░░░░░░░░░░░] 0% | 0/76.5 km | Block 0/12Weather: Light Rain | Terrain: flat | Hours: 10hFUEL: 104 | FOOD: 46 | EQUIP: 111% | MEDS: 8 | CASH: $2,600Objective: verify 0/12 block packagesSmithers Yard package: [ ] access  [x] values sweep (not flagged)  [ ] finalizedCrew: 5/5 active | Avg Health: 90%(Crew details: the [S] Status button, or press S)RADIO CHECK: Spring Breakup Starting
   ~~~~~~~
  ~~~~~~~~~
   ~~~~~~~
  Carol (Driver) while shuttling gear radios in: The frost is coming out of the ground. Roads that were solid yesterday are turning to mush. The window for heavy equipment is closing fast.What do you do?"

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
        - generic [ref=e16]: SHIFT
        - generic [ref=e17]: "1"
      - generic [ref=e18]:
        - generic [ref=e19]: PROGRESS
        - generic [ref=e20]: 0%
      - generic [ref=e21]:
        - generic [ref=e22]: CREW
        - generic [ref=e23]: 5/5
      - generic [ref=e24]:
        - generic [ref=e25]: MORALE
        - generic [ref=e26]: 78%
    - log [ref=e28]:
      - generic [ref=e29]: SHIFT 1 - Smithers Yard
      - generic [ref=e30]: ">>>Smithers*<<<─(Telkwa)─(Ranch)─(Wet'suw.)─(Birch*)─(VQO)─(Water)─..."
      - generic [ref=e31]: "[░░░░░░░░░░░░░░░░░░░░] 0% | 0/76.5 km | Block 0/12"
      - generic [ref=e32]: "Weather: Light Rain | Terrain: flat | Hours: 10h"
      - generic [ref=e33]: "FUEL: 104 | FOOD: 46 | EQUIP: 111% | MEDS: 8 | CASH: $2,600"
      - generic [ref=e34]: "Objective: verify 0/12 block packages"
      - generic [ref=e35]: "Smithers Yard package: [ ] access [x] values sweep (not flagged) [ ] finalized"
      - generic [ref=e36]: "Crew: 5/5 active | Avg Health: 90%"
      - generic [ref=e37]: "(Crew details: the [S] Status button, or press S)"
      - generic [ref=e38]: "RADIO CHECK: Spring Breakup Starting"
      - generic [ref=e39]: ~~~~~~~ ~~~~~~~~~ ~~~~~~~
      - generic [ref=e40]: "Carol (Driver) while shuttling gear radios in: The frost is coming out of the ground. Roads that were solid yesterday are turning to mush. The window for heavy equipment is closing fast."
      - generic [ref=e41]: What do you do?
    - generic [ref=e43]:
      - button "[1] Push hard now — run equipment day and night [-10% equip, -10 health, -8 morale, +10 km traverse]" [active] [ref=e44] [cursor=pointer]:
        - generic [ref=e45]: "[1] Push hard now — run equipment day and night"
        - generic [ref=e46]: "[-10% equip, -10 health, -8 morale, +10 km traverse]"
      - button "[2] Switch to lighter operations only [+5 compliance, -5 km traverse]" [ref=e47] [cursor=pointer]:
        - generic [ref=e48]: "[2] Switch to lighter operations only"
        - generic [ref=e49]: "[+5 compliance, -5 km traverse]"
      - button "[3] Shut down and wait for dry conditions [-5 morale, +10 compliance, -15 km traverse]" [ref=e50] [cursor=pointer]:
        - generic [ref=e51]: "[3] Shut down and wait for dry conditions"
        - generic [ref=e52]: "[-5 morale, +10 compliance, -15 km traverse]"
  - complementary "Detailed status" [ref=e53]:
    - heading "STATUS REPORT" [level=2] [ref=e55]
    - generic [ref=e56]:
      - generic [ref=e57]:
        - heading "CREW" [level=3] [ref=e58]
        - generic [ref=e59]:
          - generic [ref=e60]:
            - generic [ref=e61]: Carol
            - generic [ref=e62]: Driver
            - generic [ref=e64]: "HP: ████████ 98"
          - generic [ref=e65]:
            - generic [ref=e66]: Amanda
            - generic [ref=e67]: First Aid
            - generic [ref=e69]: "HP: ███████░ 83"
          - generic [ref=e70]:
            - generic [ref=e71]: Gary
            - generic [ref=e72]: Driver
            - generic [ref=e74]: "HP: ███████░ 91"
          - generic [ref=e75]:
            - generic [ref=e76]: Sandra
            - generic [ref=e77]: First Aid
            - generic [ref=e79]: "HP: ██████░░ 80"
          - generic [ref=e80]:
            - generic [ref=e81]: Laura
            - generic [ref=e82]: Driver
            - generic [ref=e84]: "HP: ████████ 98"
      - generic [ref=e85]:
        - heading "SUPPLIES" [level=3] [ref=e86]
        - generic [ref=e87]:
          - generic [ref=e88]:
            - generic [ref=e89]: CASH
            - generic [ref=e92]: "2600"
          - generic [ref=e93]:
            - generic [ref=e94]: FUEL
            - generic [ref=e97]: "104"
          - generic [ref=e98]:
            - generic [ref=e99]: FOOD
            - generic [ref=e102]: "46"
          - generic [ref=e103]:
            - generic [ref=e104]: EQUIP
            - generic [ref=e107]: "111"
          - generic [ref=e108]:
            - generic [ref=e109]: MEDS
            - generic [ref=e112]: "8"
      - generic [ref=e113]:
        - heading "LOCATION" [level=3] [ref=e114]
        - generic [ref=e115]:
          - generic [ref=e116]: ☀️ Summer Y1
          - generic [ref=e117]: Smithers Yard
          - generic [ref=e118]: Mill yard on the edge of Smithers. Hudson Bay Mountain looms above town like a postcard.
          - generic [ref=e119]: "Terrain: flat"
          - generic [ref=e120]: "Weather: Light Rain"
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
> 93  |   await expect(page.locator('#terminal')).toContainText('Current Intel:');
      |                                           ^ Error: expect(locator).toContainText(expected) failed
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