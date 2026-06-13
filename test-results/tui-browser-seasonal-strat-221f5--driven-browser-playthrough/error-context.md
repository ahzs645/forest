# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tui-browser.spec.js >> seasonal strategy TUI completes a keyboard-driven browser playthrough
- Location: tests/e2e/tui-browser.spec.js:10:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.tui-field-main')
Expected substring: "What am I deciding?"
Received string:    "Role-Area BriefingReferral BriefingRemote-access files that attract engineering questions on side-cast, crossing stability, and whether the timing window is even realistic▸ More context"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('.tui-field-main')
    9 × locator resolved to <div class="tui-field-main">…</div>
      - unexpected value "Role-Area BriefingReferral BriefingRemote-access files that attract engineering questions on side-cast, crossing stability, and whether the timing window is even realistic▸ More context"

```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]: BC Forestry Trail
        - generic [ref=e8]: Seasonal Strategy TUI
      - generic [ref=e9]:
        - button "Exit" [ref=e10] [cursor=pointer]
        - generic [ref=e11]: Press Q to quit
    - generic [ref=e12]:
      - complementary [ref=e13]:
        - generic [ref=e14]:
          - button "Dashboard" [ref=e15] [cursor=pointer]
          - button "Area" [ref=e16] [cursor=pointer]
        - generic [ref=e17]:
          - generic [ref=e18]:
            - generic [ref=e19]: Season
            - generic [ref=e20]: 1 / 4
          - generic [ref=e21]:
            - generic [ref=e22]: Progress
            - generic [ref=e23]: 50%
          - generic [ref=e24]:
            - generic [ref=e25]: Forest Health
            - generic [ref=e26]: 50%
          - generic [ref=e27]:
            - generic [ref=e28]: Relationships
            - generic [ref=e29]: 50%
          - generic [ref=e30]:
            - generic [ref=e31]: Compliance
            - generic [ref=e32]: 50%
          - generic [ref=e33]:
            - generic [ref=e34]: Budget
            - generic [ref=e35]: 50%
          - generic [ref=e36]:
            - generic [ref=e37]: Company
            - generic [ref=e38]: Forest Co-op
          - generic [ref=e39]:
            - generic [ref=e40]: Role
            - generic [ref=e41]: Permitting Specialist
          - generic [ref=e42]:
            - generic [ref=e43]: Area
            - generic [ref=e44]: Muskwa Foothills
      - generic [ref=e45]:
        - generic [ref=e46]:
          - generic [ref=e47]: Field Radio
          - generic [ref=e50]:
            - generic [ref=e51]: Role-Area Briefing
            - generic [ref=e52]: Referral Briefing
            - paragraph [ref=e53]: Remote-access files that attract engineering questions on side-cast, crossing stability, and whether the timing window is even realistic
            - button "▸ More context" [ref=e54] [cursor=pointer]
        - generic [ref=e55]:
          - generic [ref=e56]:
            - generic [ref=e57]: How do you want to respond?
            - generic [ref=e58]: ↑↓ · Enter
          - paragraph [ref=e59]: SituationRemote-access files that attract engineering questions on side-cast, crossing stability, and whether the timing window is even realistic
          - generic [ref=e60]:
            - button "1 Ground-truth the situation You slow down long enough to verify the live condition before it compounds into a bigger file problem." [ref=e61] [cursor=pointer]:
              - generic [ref=e62]: "1"
              - generic [ref=e63]:
                - generic [ref=e64]: Ground-truth the situation
                - generic [ref=e65]: You slow down long enough to verify the live condition before it compounds into a bigger file problem.
            - button "2 Balance around it You adapt the work around the signal without surrendering the season outright." [ref=e66] [cursor=pointer]:
              - generic [ref=e67]: "2"
              - generic [ref=e68]:
                - generic [ref=e69]: Balance around it
                - generic [ref=e70]: You adapt the work around the signal without surrendering the season outright.
            - button "3 Push the original plan You hold the original line and bank the momentum, accepting that the exposure may come back later." [ref=e71] [cursor=pointer]:
              - generic [ref=e72]: "3"
              - generic [ref=e73]:
                - generic [ref=e74]: Push the original plan
                - generic [ref=e75]: You hold the original line and bank the momentum, accepting that the exposure may come back later.
```

# Test source

```ts
  1   | import { expect } from '@playwright/test';
  2   | 
  3   | export const SEASONAL_TUI_SEEDS = [20260409, 20260410, 20260411, 20260412];
  4   | 
  5   | export function attachRuntimeErrorCollector(page) {
  6   |   const runtimeErrors = [];
  7   | 
  8   |   page.on('pageerror', (error) => runtimeErrors.push(error.message));
  9   |   page.on('console', (message) => {
  10  |     if (message.type() === 'error') {
  11  |       runtimeErrors.push(message.text());
  12  |     }
  13  |   });
  14  | 
  15  |   return runtimeErrors;
  16  | }
  17  | 
  18  | export async function installDeterministicSeed(page, seed) {
  19  |   await page.addInitScript((seedStart) => {
  20  |     let currentSeed = seedStart;
  21  |     Math.random = () => {
  22  |       currentSeed = (1664525 * currentSeed + 1013904223) >>> 0;
  23  |       return currentSeed / 0x100000000;
  24  |     };
  25  |   }, seed);
  26  | }
  27  | 
  28  | export async function gotoSeasonalTui(page, seed = SEASONAL_TUI_SEEDS[0]) {
  29  |   await installDeterministicSeed(page, seed);
  30  |   await page.goto('/tui.html');
  31  |   await expect(page.locator('.tui-heading')).toContainText('Welcome to BC Forestry Trail');
  32  | }
  33  | 
  34  | export async function expectSetupHeading(page, heading) {
  35  |   await expect(page.locator('.tui-heading')).toHaveText(heading);
  36  | }
  37  | 
  38  | export async function chooseOptionByLabel(page, matcher) {
  39  |   const labels = await page.locator('.tui-options button').allInnerTexts();
  40  |   const targetIndex = labels.findIndex((label) => {
  41  |     if (matcher instanceof RegExp) {
  42  |       return matcher.test(label);
  43  |     }
  44  |     return label.includes(matcher);
  45  |   });
  46  | 
  47  |   expect(targetIndex, `expected option matching ${String(matcher)} in [${labels.join(', ')}]`).toBeGreaterThanOrEqual(0);
  48  | 
  49  |   for (let i = 0; i < targetIndex; i += 1) {
  50  |     await page.keyboard.press('ArrowDown');
  51  |   }
  52  |   await page.keyboard.press('Enter');
  53  | 
  54  |   return {
  55  |     index: targetIndex,
  56  |     labels,
  57  |     chosenLabel: labels[targetIndex],
  58  |   };
  59  | }
  60  | 
  61  | export async function startSeasonalRun(page, { seed, roleLabel, areaLabel, companyName = '' }) {
  62  |   const runtimeErrors = attachRuntimeErrorCollector(page);
  63  |   await gotoSeasonalTui(page, seed);
  64  | 
  65  |   if (companyName) {
  66  |     await page.keyboard.type(companyName);
  67  |   }
  68  |   await page.keyboard.press('Enter');
  69  |   await expectSetupHeading(page, 'Select your Specialization');
  70  |   const roleSelection = await chooseOptionByLabel(page, roleLabel);
  71  | 
  72  |   await expectSetupHeading(page, 'Select your Operating Area');
  73  |   const areaSelection = await chooseOptionByLabel(page, areaLabel);
  74  | 
  75  |   await expect(page.locator('.tui-dashboard')).toContainText(roleLabel);
  76  |   await expect(page.locator('.tui-dashboard')).toContainText(areaLabel);
  77  | 
  78  |   return {
  79  |     runtimeErrors,
  80  |     roleSelection,
  81  |     areaSelection,
  82  |   };
  83  | }
  84  | 
  85  | export async function openCurrentDecision(page) {
  86  |   await expect(page.locator('.tui-options button').first()).toBeVisible();
  87  |   await page.keyboard.press('Enter');
> 88  |   await expect(page.locator('.tui-field-main')).toContainText('What am I deciding?');
      |                                                 ^ Error: expect(locator).toContainText(expected) failed
  89  | }
  90  | 
  91  | export async function getCurrentCardSnapshot(page) {
  92  |   const heading = await page.locator('.tui-heading').first().innerText();
  93  |   const title = await page.locator('.tui-field-main .tui-heading').first().innerText();
  94  |   const cardLabel = await page.locator('.tui-source-label').allInnerTexts();
  95  |   const fieldText = await page.locator('.tui-field-main').innerText();
  96  |   const options = await page.locator('.tui-options button').allInnerTexts();
  97  | 
  98  |   return {
  99  |     heading,
  100 |     title,
  101 |     cardLabel,
  102 |     fieldText,
  103 |     options,
  104 |   };
  105 | }
  106 | 
  107 | export async function advanceDecision(page, labelMatcher = null) {
  108 |   await expect(page.locator('.tui-options button').first()).toBeVisible({ timeout: 5000 });
  109 | 
  110 |   if (!labelMatcher) {
  111 |     await page.keyboard.press('Enter');
  112 |     return;
  113 |   }
  114 | 
  115 |   await chooseOptionByLabel(page, labelMatcher);
  116 | }
  117 | 
  118 | export async function autoPlayToSummary(page, { maxSteps = 80 } = {}) {
  119 |   for (let step = 0; step < maxSteps; step += 1) {
  120 |     const heading = await page.locator('.tui-heading').first().innerText();
  121 |     if (heading === 'Year End Review') {
  122 |       return {
  123 |         ended: true,
  124 |         step,
  125 |         text: await page.locator('.tui-field-main').innerText(),
  126 |       };
  127 |     }
  128 | 
  129 |     await advanceDecision(page);
  130 |   }
  131 | 
  132 |   return {
  133 |     ended: false,
  134 |     step: maxSteps,
  135 |     text: await page.locator('.tui-field-main').innerText(),
  136 |   };
  137 | }
  138 | 
```