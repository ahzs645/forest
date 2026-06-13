# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game-modes.spec.js >> silviculture (easy) can complete a browser playthrough without runtime errors
- Location: tests/e2e/game-modes.spec.js:29:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
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
        - generic [ref=e17]: "3"
      - generic [ref=e18]:
        - generic [ref=e19]: PROGRESS
        - generic [ref=e20]: 10%
      - generic [ref=e21]:
        - generic [ref=e22]: CREW
        - generic [ref=e23]: 5/5
      - generic [ref=e24]:
        - generic [ref=e25]: MORALE
        - generic [ref=e26]: 76%
    - log [ref=e28]:
      - generic [ref=e29]: DAY 3 - SILVICULTURE OPERATIONS
      - generic [ref=e30]: "🌱 Spring - Year 1 | Hours: 1h"
      - generic [ref=e31]: "Plant: 6% (0/15 blocks) | Brush: 100% | Survey: 0% (0/5)"
      - generic [ref=e32]: "Roster: 1 deployed, 1 ready, 1 recovering"
      - generic [ref=e33]: "Budget: $136,250 | Seedlings: 233,872 | Capacity: 396 days"
      - generic [ref=e34]: "1h remaining:"
      - generic [ref=e35]: "> Contractor Rotation (1h)"
      - generic [ref=e36]: Adjust which contractor?
    - generic [ref=e38]:
      - button "[1] Mountain Pine Planters (planting) rest 1d | 92% fit | planting-specialist, terrain-aware" [active] [ref=e39] [cursor=pointer]:
        - generic [ref=e40]: "[1] Mountain Pine Planters (planting)"
        - generic [ref=e41]: rest 1d | 92% fit | planting-specialist, terrain-aware
      - button "[2] Northern Regen Co (brushing) deployed | 112% fit | brush-specialist, heat-hard" [ref=e42] [cursor=pointer]:
        - generic [ref=e43]: "[2] Northern Regen Co (brushing)"
        - generic [ref=e44]: deployed | 112% fit | brush-specialist, heat-hard
      - button "[3] Boreal Silviculture (survey) ready | 90% fit | survey-minded, process-cautious" [ref=e45] [cursor=pointer]:
        - generic [ref=e46]: "[3] Boreal Silviculture (survey)"
        - generic [ref=e47]: ready | 90% fit | survey-minded, process-cautious
  - complementary "Detailed status" [ref=e48]:
    - heading "STATUS REPORT" [level=2] [ref=e50]
    - generic [ref=e51]:
      - generic [ref=e52]:
        - heading "CREW" [level=3] [ref=e53]
        - generic [ref=e54]:
          - generic [ref=e55]:
            - generic [ref=e56]: Amanda
            - generic [ref=e57]: Driver
            - generic [ref=e59]: "HP: ████████ 98"
            - generic [ref=e60]: "[Sprained Ankle]"
          - generic [ref=e61]:
            - generic [ref=e62]: Terry
            - generic [ref=e63]: First Aid
            - generic [ref=e65]: "HP: ███████░ 82"
          - generic [ref=e66]:
            - generic [ref=e67]: Sarah
            - generic [ref=e68]: Bucker
            - generic [ref=e70]: "HP: ████████ 99"
          - generic [ref=e71]:
            - generic [ref=e72]: Mark
            - generic [ref=e73]: Driver
            - generic [ref=e75]: "HP: ████████ 96"
          - generic [ref=e76]:
            - generic [ref=e77]: Charlie
            - generic [ref=e78]: Bucker
            - generic [ref=e80]: "HP: ████████ 100"
      - generic [ref=e81]:
        - heading "SUPPLIES" [level=3] [ref=e82]
        - generic [ref=e84]:
          - generic [ref=e85]: BUDGET
          - generic [ref=e88]: "136250"
      - generic [ref=e89]:
        - heading "LOCATION" [level=3] [ref=e90]
        - generic [ref=e91]:
          - generic [ref=e92]: 🌱 Spring Y1
          - generic [ref=e93]: Silviculture Program
          - generic [ref=e94]: Day 3
          - generic [ref=e95]: "Phase: spring"
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const ROLE_RUNS = [
  4   |   { name: 'planner', roleIndex: 0, areaIndex: 0, seed: 1001 },
  5   |   { name: 'permitter', roleIndex: 1, areaIndex: 1, seed: 1002 },
  6   |   { name: 'recce', roleIndex: 2, areaIndex: 2, seed: 1003 },
  7   |   { name: 'silviculture', roleIndex: 3, areaIndex: 3, seed: 1004 },
  8   |   { name: 'manager', roleIndex: 4, areaIndex: 0, seed: 1005 }
  9   | ];
  10  | 
  11  | const DIFFICULTIES = [
  12  |   { name: 'easy', label: 'Greenhorn', seedOffset: 0 },
  13  |   { name: 'normal', label: 'Journeyman', seedOffset: 100 },
  14  |   { name: 'hard', label: 'Old Growth', seedOffset: 200 }
  15  | ];
  16  | 
  17  | const TEST_RUNS = ROLE_RUNS.flatMap((role) =>
  18  |   DIFFICULTIES.map((difficulty) => ({
  19  |     ...role,
  20  |     difficulty: difficulty.name,
  21  |     difficultyLabel: difficulty.label,
  22  |     seed: role.seed + difficulty.seedOffset
  23  |   }))
  24  | );
  25  | 
  26  | test.describe.configure({ mode: 'serial' });
  27  | 
  28  | for (const run of TEST_RUNS) {
  29  |   test(`${run.name} (${run.difficulty}) can complete a browser playthrough without runtime errors`, async ({ page }) => {
  30  |     const runtimeErrors = [];
  31  | 
  32  |     page.on('pageerror', (error) => runtimeErrors.push(error.message));
  33  |     page.on('console', (message) => {
  34  |       if (message.type() === 'error') {
  35  |         runtimeErrors.push(message.text());
  36  |       }
  37  |     });
  38  | 
  39  |     await page.addInitScript((seedStart) => {
  40  |       let seed = seedStart;
  41  |       Math.random = () => {
  42  |         seed = (1664525 * seed + 1013904223) >>> 0;
  43  |         return seed / 0x100000000;
  44  |       };
  45  |     }, run.seed);
  46  | 
  47  |     await page.goto('/');
  48  |     await page.waitForLoadState('networkidle');
  49  | 
  50  |     await page.click('#new-game-btn');
  51  |     await page.click('#intro-continue-btn');
  52  |     await page.locator('.role-card').nth(run.roleIndex).click();
  53  |     await page.click('#role-continue-btn');
  54  |     await page.locator('.area-item').nth(run.areaIndex).click();
  55  |     await page.click('#area-continue-btn');
  56  |     await page.locator('#choices button').filter({ hasText: run.difficultyLabel }).click();
  57  | 
  58  |     const result = await autoPlayToEnd(page, run.name);
  59  | 
  60  |     expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
> 61  |     expect(result.ended).toBeTruthy();
      |                          ^ Error: expect(received).toBeTruthy()
  62  |     expect(result.terminalText).toMatch(/EXPEDITION (SUCCESSFUL|FAILED)/);
  63  |     expect(extractElapsedDays(result.terminalText)).toBeGreaterThan(0);
  64  |     assertModeSpecificExpectations(run.name, result.terminalText);
  65  |   });
  66  | }
  67  | 
  68  | async function autoPlayToEnd(page, strategyName, maxSteps = 900) {
  69  |   for (let step = 0; step < maxSteps; step++) {
  70  |     const terminalText = await page.locator('#terminal').innerText();
  71  |     if (isEndScreen(terminalText)) {
  72  |       return { ended: true, steps: step, terminalText };
  73  |     }
  74  | 
  75  |     await page.waitForSelector('#choices button', { timeout: 15000 });
  76  |     const buttons = page.locator('#choices button');
  77  |     const labels = await buttons.evaluateAll((nodes) =>
  78  |       nodes.map((node) => node.innerText.replace(/\s+/g, ' ').trim())
  79  |     );
  80  | 
  81  |     if (labels.length === 1 && labels[0].includes('New Expedition')) {
  82  |       return {
  83  |         ended: true,
  84  |         steps: step,
  85  |         terminalText: await page.locator('#terminal').innerText()
  86  |       };
  87  |     }
  88  | 
  89  |     const choiceIndex = pickChoice(labels, terminalText, strategyName);
  90  |     await buttons.nth(choiceIndex).click();
  91  |   }
  92  | 
  93  |   return {
  94  |     ended: false,
  95  |     steps: maxSteps,
  96  |     terminalText: await page.locator('#terminal').innerText()
  97  |   };
  98  | }
  99  | 
  100 | function pickChoice(labels, terminalText, strategyName) {
  101 |   if (labels.length === 1) {
  102 |     return 0;
  103 |   }
  104 | 
  105 |   const recommendedAction = getRecommendedActionLabel(terminalText);
  106 |   if (recommendedAction) {
  107 |     const recommendedIndex = labels.findIndex((label) => normalizeChoiceLabel(label).startsWith(recommendedAction));
  108 |     if (recommendedIndex !== -1) {
  109 |       return recommendedIndex;
  110 |     }
  111 |   }
  112 | 
  113 |   if (strategyName === 'recce') {
  114 |     return pickReconChoice(labels, terminalText);
  115 |   }
  116 | 
  117 |   const sharedPriorities = ['Greenhorn', 'Journeyman', 'Old Growth', 'Begin Journey', 'Continue'];
  118 |   const planningPriorities = getPlanningPriorities(terminalText);
  119 |   const strategyPriorities = {
  120 |     planner: planningPriorities,
  121 |     permitter: [
  122 |       'Road Permit File',
  123 |       'Archaeology File',
  124 |       'Special-Use File',
  125 |       'Compliance Admin',
  126 |       'Renew Registration',
  127 |       'Clean response',
  128 |       'Fast-track',
  129 |       'Address Revisions',
  130 |       'Follow Up on Referrals',
  131 |       'Submit Permit',
  132 |       'Draft Permit Application',
  133 |       'Process Permits',
  134 |       'Stakeholder Meeting',
  135 |       'Team Building',
  136 |       'Take a Break',
  137 |       'End Day Early'
  138 |     ],
  139 |     silviculture: [
  140 |       'Plant Block',
  141 |       'Survival Check',
  142 |       'Fill Planting',
  143 |       'Brush Treatment',
  144 |       'Survey Free-Growing',
  145 |       'Contractor Rotation',
  146 |       'Contractor Meeting',
  147 |       'Team Briefing',
  148 |       'Upgrade camp',
  149 |       'Inspect & retrain',
  150 |       'Send medic',
  151 |       'Grant rest day',
  152 |       'Pay retention',
  153 |       'End Day'
  154 |     ],
  155 |     // Manager runs a 100-day term: favour budget-disciplined, no-cost choices so
  156 |     // the treasury survives to the deadline and the term reaches a clean end.
  157 |     manager: [
  158 |       'Skip certification',
  159 |       'Hold the line',
  160 |       'Demand a corrective plan',
  161 |       'Stay at your desk',
```