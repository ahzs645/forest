# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game-modes.spec.js >> silviculture (easy) can complete a browser playthrough without runtime errors
- Location: tests/e2e/game-modes.spec.js:28:3

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
        - button "Professional and compliance intel" [ref=e9] [cursor=pointer]: "[P] Intel"
        - button "Help" [ref=e10] [cursor=pointer]: "[?] Help"
        - button "Restart game" [ref=e11] [cursor=pointer]: "[R] Restart"
    - generic [ref=e13]:
      - generic [ref=e14]:
        - generic [ref=e15]: DAY
        - generic [ref=e16]: "3"
      - generic [ref=e17]:
        - generic [ref=e18]: PROGRESS
        - generic [ref=e19]: 15%
      - generic [ref=e20]:
        - generic [ref=e21]: CREW
        - generic [ref=e22]: 5/5
      - generic [ref=e23]:
        - generic [ref=e24]: MORALE
        - generic [ref=e25]: 78%
    - log [ref=e27]:
      - generic [ref=e28]: DAY 3 - SILVICULTURE OPERATIONS
      - generic [ref=e29]: "🌱 Spring - Year 1 | Hours: 1h"
      - generic [ref=e30]: "Sequence: Survey | Zone pressure: brush pressure is high."
      - generic [ref=e31]: "Likely pressure: beetle-killed pine ground with dry knolls, frost-prone lows, and heavy moose browse on young mixedwood recovery"
      - generic [ref=e32]: "Scrutiny: 11"
      - generic [ref=e33]: "Area Situation: Smoke push: Wildfire smoke and nearby community risk are compressing the useful work window."
      - generic [ref=e34]: "Plant: 6% (0/15 blocks) | Brush: 100% | Survey: 20% (1/5)"
      - generic [ref=e35]: "Roster: 2 deployed, 0 ready, 1 recovering"
      - generic [ref=e36]: "Contractors: Northern: 97%P/89%M (112% fit) | Boreal: 84%P/96%M (90% fit) | Mountain: REST 1d [planting-specialist,terrain-aware]"
      - generic [ref=e37]: "Budget: $137,150 | Seedlings: 233,872 | Capacity: 398 days"
      - generic [ref=e38]: "1h remaining:"
      - generic [ref=e39]: "> Contractor Rotation (1h)"
      - generic [ref=e40]: Adjust which contractor?
    - generic [ref=e42]:
      - button "[1] Mountain Pine Planters (planting) rest 1d | 92% fit | planting-specialist, terrain-aware" [active] [ref=e43] [cursor=pointer]:
        - generic [ref=e44]: "[1] Mountain Pine Planters (planting)"
        - generic [ref=e45]: rest 1d | 92% fit | planting-specialist, terrain-aware
      - button "[2] Northern Regen Co (brushing) deployed | 112% fit | brush-specialist, heat-hard" [ref=e46] [cursor=pointer]:
        - generic [ref=e47]: "[2] Northern Regen Co (brushing)"
        - generic [ref=e48]: deployed | 112% fit | brush-specialist, heat-hard
      - button "[3] Boreal Silviculture (survey) deployed | 90% fit | survey-minded, process-cautious" [ref=e49] [cursor=pointer]:
        - generic [ref=e50]: "[3] Boreal Silviculture (survey)"
        - generic [ref=e51]: deployed | 90% fit | survey-minded, process-cautious
  - complementary "Detailed status" [ref=e52]:
    - heading "STATUS REPORT" [level=2] [ref=e54]
    - generic [ref=e55]:
      - generic [ref=e56]:
        - heading "CREW" [level=3] [ref=e57]
        - generic [ref=e58]:
          - generic [ref=e59]:
            - generic [ref=e60]: Amanda
            - generic [ref=e61]: Driver
            - generic [ref=e63]: "HP: ████████ 98"
          - generic [ref=e64]:
            - generic [ref=e65]: Terry
            - generic [ref=e66]: First Aid
            - generic [ref=e68]: "HP: ███████░ 82"
          - generic [ref=e69]:
            - generic [ref=e70]: Sarah
            - generic [ref=e71]: Bucker
            - generic [ref=e73]: "HP: ████████ 99"
          - generic [ref=e74]:
            - generic [ref=e75]: Mark
            - generic [ref=e76]: Driver
            - generic [ref=e78]: "HP: ████████ 96"
          - generic [ref=e79]:
            - generic [ref=e80]: Charlie
            - generic [ref=e81]: Bucker
            - generic [ref=e83]: "HP: ████████ 100"
      - generic [ref=e84]:
        - heading "SUPPLIES" [level=3] [ref=e85]
        - generic [ref=e87]:
          - generic [ref=e88]: BUDGET
          - generic [ref=e91]: "137150"
      - generic [ref=e92]:
        - heading "LOCATION" [level=3] [ref=e93]
        - generic [ref=e94]:
          - generic [ref=e95]: 🌱 Spring Y1
          - generic [ref=e96]: Silviculture Program
          - generic [ref=e97]: Day 3
          - generic [ref=e98]: "Phase: spring"
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   |
  3   | const ROLE_RUNS = [
  4   |   { name: 'planner', roleIndex: 0, areaIndex: 0, seed: 1001 },
  5   |   { name: 'permitter', roleIndex: 1, areaIndex: 1, seed: 1002 },
  6   |   { name: 'recce', roleIndex: 2, areaIndex: 2, seed: 1003 },
  7   |   { name: 'silviculture', roleIndex: 3, areaIndex: 3, seed: 1004 }
  8   | ];
  9   |
  10  | const DIFFICULTIES = [
  11  |   { name: 'easy', label: 'Greenhorn', seedOffset: 0 },
  12  |   { name: 'normal', label: 'Journeyman', seedOffset: 100 },
  13  |   { name: 'hard', label: 'Old Growth', seedOffset: 200 }
  14  | ];
  15  |
  16  | const TEST_RUNS = ROLE_RUNS.flatMap((role) =>
  17  |   DIFFICULTIES.map((difficulty) => ({
  18  |     ...role,
  19  |     difficulty: difficulty.name,
  20  |     difficultyLabel: difficulty.label,
  21  |     seed: role.seed + difficulty.seedOffset
  22  |   }))
  23  | );
  24  |
  25  | test.describe.configure({ mode: 'serial' });
  26  |
  27  | for (const run of TEST_RUNS) {
  28  |   test(`${run.name} (${run.difficulty}) can complete a browser playthrough without runtime errors`, async ({ page }) => {
  29  |     const runtimeErrors = [];
  30  |
  31  |     page.on('pageerror', (error) => runtimeErrors.push(error.message));
  32  |     page.on('console', (message) => {
  33  |       if (message.type() === 'error') {
  34  |         runtimeErrors.push(message.text());
  35  |       }
  36  |     });
  37  |
  38  |     await page.addInitScript((seedStart) => {
  39  |       let seed = seedStart;
  40  |       Math.random = () => {
  41  |         seed = (1664525 * seed + 1013904223) >>> 0;
  42  |         return seed / 0x100000000;
  43  |       };
  44  |     }, run.seed);
  45  |
  46  |     await page.goto('/');
  47  |     await page.waitForLoadState('networkidle');
  48  |
  49  |     await page.click('#new-game-btn');
  50  |     await page.click('#intro-continue-btn');
  51  |     await page.locator('.role-card').nth(run.roleIndex).click();
  52  |     await page.click('#role-continue-btn');
  53  |     await page.locator('.area-item').nth(run.areaIndex).click();
  54  |     await page.click('#area-continue-btn');
  55  |     await page.locator('#choices button').filter({ hasText: run.difficultyLabel }).click();
  56  |
  57  |     const result = await autoPlayToEnd(page, run.name);
  58  |
  59  |     expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
> 60  |     expect(result.ended).toBeTruthy();
      |                          ^ Error: expect(received).toBeTruthy()
  61  |     expect(result.terminalText).toMatch(/EXPEDITION (SUCCESSFUL|FAILED)/);
  62  |     expect(extractElapsedDays(result.terminalText)).toBeGreaterThan(0);
  63  |     assertModeSpecificExpectations(run.name, result.terminalText);
  64  |   });
  65  | }
  66  |
  67  | async function autoPlayToEnd(page, strategyName, maxSteps = 360) {
  68  |   for (let step = 0; step < maxSteps; step++) {
  69  |     const terminalText = await page.locator('#terminal').innerText();
  70  |     if (isEndScreen(terminalText)) {
  71  |       return { ended: true, steps: step, terminalText };
  72  |     }
  73  |
  74  |     await page.waitForSelector('#choices button', { timeout: 15000 });
  75  |     const buttons = page.locator('#choices button');
  76  |     const labels = await buttons.evaluateAll((nodes) =>
  77  |       nodes.map((node) => node.innerText.replace(/\s+/g, ' ').trim())
  78  |     );
  79  |
  80  |     if (labels.length === 1 && labels[0].includes('New Expedition')) {
  81  |       return {
  82  |         ended: true,
  83  |         steps: step,
  84  |         terminalText: await page.locator('#terminal').innerText()
  85  |       };
  86  |     }
  87  |
  88  |     const choiceIndex = pickChoice(labels, terminalText, strategyName);
  89  |     await buttons.nth(choiceIndex).click();
  90  |   }
  91  |
  92  |   return {
  93  |     ended: false,
  94  |     steps: maxSteps,
  95  |     terminalText: await page.locator('#terminal').innerText()
  96  |   };
  97  | }
  98  |
  99  | function pickChoice(labels, terminalText, strategyName) {
  100 |   if (labels.length === 1) {
  101 |     return 0;
  102 |   }
  103 |
  104 |   const recommendedAction = getRecommendedActionLabel(terminalText);
  105 |   if (recommendedAction) {
  106 |     const recommendedIndex = labels.findIndex((label) => normalizeChoiceLabel(label).startsWith(recommendedAction));
  107 |     if (recommendedIndex !== -1) {
  108 |       return recommendedIndex;
  109 |     }
  110 |   }
  111 |
  112 |   if (strategyName === 'recce') {
  113 |     return pickReconChoice(labels, terminalText);
  114 |   }
  115 |
  116 |   const sharedPriorities = ['Greenhorn', 'Journeyman', 'Old Growth', 'Begin Journey', 'Continue'];
  117 |   const planningPriorities = getPlanningPriorities(terminalText);
  118 |   const strategyPriorities = {
  119 |     planner: planningPriorities,
  120 |     permitter: [
  121 |       'Road Permit File',
  122 |       'Archaeology File',
  123 |       'Special-Use File',
  124 |       'Compliance Admin',
  125 |       'Renew Registration',
  126 |       'Clean response',
  127 |       'Fast-track',
  128 |       'Address Revisions',
  129 |       'Follow Up on Referrals',
  130 |       'Submit Permit',
  131 |       'Draft Permit Application',
  132 |       'Process Permits',
  133 |       'Stakeholder Meeting',
  134 |       'Team Building',
  135 |       'Take a Break',
  136 |       'End Day Early'
  137 |     ],
  138 |     silviculture: [
  139 |       'Plant Block',
  140 |       'Survival Check',
  141 |       'Fill Planting',
  142 |       'Brush Treatment',
  143 |       'Survey Free-Growing',
  144 |       'Contractor Rotation',
  145 |       'Contractor Meeting',
  146 |       'Team Briefing',
  147 |       'Upgrade camp',
  148 |       'Inspect & retrain',
  149 |       'Send medic',
  150 |       'Grant rest day',
  151 |       'Pay retention',
  152 |       'End Day'
  153 |     ]
  154 |   };
  155 |
  156 |   const priorities = [...sharedPriorities, ...(strategyPriorities[strategyName] || [])];
  157 |
  158 |   for (const priority of priorities) {
  159 |     const index = labels.findIndex((label) => normalizeChoiceLabel(label).startsWith(priority));
  160 |     if (index !== -1) {
```