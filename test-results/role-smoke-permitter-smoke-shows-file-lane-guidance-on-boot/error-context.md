# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: role-smoke.spec.js >> permitter smoke shows file-lane guidance on boot
- Location: tests/e2e/role-smoke.spec.js:58:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#terminal')
Expected substring: "Lane Focus:"
Received string:    "DAY 1 of 30 - PERMITTINGDays Remaining: 29 | Hours: 6hEnergy: [█████████░] 92% | Stress: LOW (5%) | Rep: 50Pipeline: Backlog 7 | Drafting 1 | Submitted 5 | In Review 2 | Approved 1/15 (7%)Budget: $54,550 | Political Capital: 606 hours remaining:"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('#terminal')
    9 × locator resolved to <div role="log" id="terminal" class="terminal" aria-live="polite">…</div>
      - unexpected value "DAY 1 of 30 - PERMITTINGDays Remaining: 29 | Hours: 6hEnergy: [█████████░] 92% | Stress: LOW (5%) | Rep: 50Pipeline: Backlog 7 | Drafting 1 | Submitted 5 | In Review 2 | Approved 1/15 (7%)Budget: $54,550 | Political Capital: 606 hours remaining:"

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
        - generic [ref=e20]: 7%
      - generic [ref=e21]:
        - generic [ref=e22]: CREW
        - generic [ref=e23]: 92%
      - generic [ref=e24]:
        - generic [ref=e25]: MORALE
        - generic [ref=e26]: LOW
    - log [ref=e28]:
      - generic [ref=e29]: DAY 1 of 30 - PERMITTING
      - generic [ref=e30]: "Days Remaining: 29 | Hours: 6h"
      - generic [ref=e31]: "Energy: [█████████░] 92% | Stress: LOW (5%) | Rep: 50"
      - generic [ref=e32]: "Pipeline: Backlog 7 | Drafting 1 | Submitted 5 | In Review 2 | Approved 1/15 (7%)"
      - generic [ref=e33]: "Budget: $54,550 | Political Capital: 60"
      - generic [ref=e34]: "6 hours remaining:"
    - generic [ref=e36]:
      - 'button "[1] Draft Permit Application 2h - Lane: permit stack | Move a permit from backlog to drafting" [active] [ref=e37] [cursor=pointer]':
        - generic [ref=e38]: "[1] Draft Permit Application"
        - generic [ref=e39]: "2h - Lane: permit stack | Move a permit from backlog to drafting"
      - 'button "[2] Submit Permit 2h - Lane: submission stack | Submit a drafted permit for review" [ref=e40] [cursor=pointer]':
        - generic [ref=e41]: "[2] Submit Permit"
        - generic [ref=e42]: "2h - Lane: submission stack | Submit a drafted permit for review"
      - 'button "[3] Road Permit File (2h) Lane: road permit file | Stage: Screen | Reset: CPD gap 31h | paperwork 22" [ref=e43] [cursor=pointer]':
        - generic [ref=e44]: "[3] Road Permit File (2h)"
        - generic [ref=e45]: "Lane: road permit file | Stage: Screen | Reset: CPD gap 31h | paperwork 22"
      - 'button "[4] Process Permits 2h - Lane: review support | Work on permit paperwork and reviews" [ref=e46] [cursor=pointer]':
        - generic [ref=e47]: "[4] Process Permits"
        - generic [ref=e48]: "2h - Lane: review support | Work on permit paperwork and reviews"
      - 'button "[5] Stakeholder Meeting 3h - Lane: consultation support | Meet with ministry, nations, or community" [ref=e49] [cursor=pointer]':
        - generic [ref=e50]: "[5] Stakeholder Meeting"
        - generic [ref=e51]: "3h - Lane: consultation support | Meet with ministry, nations, or community"
      - 'button "[6] Team Building 2h - Lane: office recovery | Boost crew morale with coffee and encouragement" [ref=e52] [cursor=pointer]':
        - generic [ref=e53]: "[6] Team Building"
        - generic [ref=e54]: "2h - Lane: office recovery | Boost crew morale with coffee and encouragement"
      - 'button "[7] End Day 0h - Lane: recovery | Wrap up and head home" [ref=e55] [cursor=pointer]':
        - generic [ref=e56]: "[7] End Day"
        - generic [ref=e57]: "0h - Lane: recovery | Wrap up and head home"
      - button "[8] Take a Break 1h - Reduce stress, recover energy" [ref=e58] [cursor=pointer]:
        - generic [ref=e59]: "[8] Take a Break"
        - generic [ref=e60]: 1h - Reduce stress, recover energy
      - button "[9] Review the File Pipeline detail, pressure, relationships, and carry-forward notes" [ref=e61] [cursor=pointer]:
        - generic [ref=e62]: "[9] Review the File"
        - generic [ref=e63]: Pipeline detail, pressure, relationships, and carry-forward notes
      - button "[10] End Day Early Rest and start fresh tomorrow" [ref=e64] [cursor=pointer]:
        - generic [ref=e65]: "[10] End Day Early"
        - generic [ref=e66]: Rest and start fresh tomorrow
  - complementary "Detailed status" [ref=e67]:
    - heading "STATUS REPORT" [level=2] [ref=e69]
    - generic [ref=e70]:
      - generic [ref=e71]:
        - heading "CREW" [level=3] [ref=e72]
        - generic [ref=e74]:
          - generic [ref=e75]: YOUR STATUS
          - generic [ref=e76]: "Energy: █████████░ 92"
          - generic [ref=e77]: "Stress: █░░░░░░░░░ 5"
          - generic [ref=e78]: "Reputation: 50"
          - generic [ref=e79]:
            - generic [ref=e80]: EXPERTISE
            - generic [ref=e81]: "Regulatory: 50"
            - generic [ref=e82]: "Stakeholder: 50"
            - generic [ref=e83]: "Technical: 50"
      - generic [ref=e84]:
        - heading "SUPPLIES" [level=3] [ref=e85]
        - generic [ref=e86]:
          - generic [ref=e87]:
            - generic [ref=e88]: BUDGET
            - generic [ref=e91]: "54550"
          - generic [ref=e92]:
            - generic [ref=e93]: POL.CAP
            - generic [ref=e96]: "60"
          - generic [ref=e97]:
            - generic [ref=e98]: ENERGY
            - generic [ref=e101]: "130"
      - generic [ref=e102]:
        - heading "LOCATION" [level=3] [ref=e103]
        - generic [ref=e104]:
          - generic [ref=e105]: 🌱 Spring Y1
          - generic [ref=e106]: Day 1 of 30
          - generic [ref=e107]: 29 days remaining
          - generic [ref=e108]: "Phase: planning"
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
> 75  |   await expect(page.locator('#terminal')).toContainText('Lane Focus:');
      |                                           ^ Error: expect(locator).toContainText(expected) failed
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