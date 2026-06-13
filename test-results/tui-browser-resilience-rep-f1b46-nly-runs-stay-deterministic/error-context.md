# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tui-browser-resilience.spec.js >> repeated seeded keyboard-only runs stay deterministic
- Location: tests/e2e/tui-browser-resilience.spec.js:136:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.tui-field-main')
Expected substring: "What job am I doing?"
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
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const DEFAULT_SEED = 20260411;
  4   | 
  5   | function normalizeText(value = '') {
  6   |   return String(value).replace(/\s+/g, ' ').trim();
  7   | }
  8   | 
  9   | async function seedBrowser(page, seed) {
  10  |   await page.addInitScript((seedStart) => {
  11  |     let seedValue = seedStart;
  12  |     Math.random = () => {
  13  |       seedValue = (1664525 * seedValue + 1013904223) >>> 0;
  14  |       return seedValue / 0x100000000;
  15  |     };
  16  |   }, seed);
  17  | }
  18  | 
  19  | async function bootSeasonalTui(page, seed = DEFAULT_SEED) {
  20  |   await seedBrowser(page, seed);
  21  |   await page.goto('/tui.html');
  22  | 
  23  |   await expect(page.locator('.tui-heading')).toContainText('Welcome to BC Forestry Trail');
  24  | 
  25  |   await page.keyboard.press('Enter');
  26  |   await expect(page.locator('.tui-heading')).toHaveText('Select your Specialization');
  27  | 
  28  |   await page.keyboard.press('ArrowDown');
  29  |   await page.keyboard.press('Enter');
  30  |   await expect(page.locator('.tui-heading')).toHaveText('Select your Operating Area');
  31  | 
  32  |   await page.keyboard.press('ArrowDown');
  33  |   await page.keyboard.press('Enter');
  34  |   await page.keyboard.press('Enter');
  35  | 
> 36  |   await expect(page.locator('.tui-field-main')).toContainText('What job am I doing?');
      |                                                 ^ Error: expect(locator).toContainText(expected) failed
  37  | }
  38  | 
  39  | async function readPromptSnapshot(page) {
  40  |   const heading = normalizeText(await page.locator('.tui-heading').first().innerText());
  41  |   const sourceLabels = (await page.locator('.tui-source-label').allInnerTexts()).map(normalizeText).filter(Boolean);
  42  |   const fieldText = normalizeText(await page.locator('.tui-field-main').innerText());
  43  |   const cardKey = sourceLabels[0] || sourceLabels[1] || heading;
  44  | 
  45  |   return {
  46  |     heading,
  47  |     sourceLabels,
  48  |     fieldText,
  49  |     familyKey: normalizeText(cardKey).replace(/\s*:\s*.*$/, ''),
  50  |   };
  51  | }
  52  | 
  53  | function looksLikeEscalationChain(snapshot) {
  54  |   const text = [snapshot.heading, snapshot.fieldText, ...snapshot.sourceLabels].join(' ');
  55  |   return /(?:\bchain\b|\bfollow[- ]?up\b|\bescalat(?:e|ion)\b)/i.test(text);
  56  | }
  57  | 
  58  | function assertNoDuplicateFamilies(history) {
  59  |   for (let index = 1; index < history.length; index += 1) {
  60  |     const previous = history[index - 1];
  61  |     const current = history[index];
  62  | 
  63  |     if (current.familyKey === previous.familyKey) {
  64  |       const allowed = looksLikeEscalationChain(current) || looksLikeEscalationChain(previous);
  65  |       expect(
  66  |         allowed,
  67  |         [
  68  |           `Repeated prompt family without an explicit escalation chain: ${current.familyKey}`,
  69  |           `Previous: ${previous.heading} | ${previous.sourceLabels.join(' / ') || '(no source label)'}`,
  70  |           `Current: ${current.heading} | ${current.sourceLabels.join(' / ') || '(no source label)'}`,
  71  |         ].join('\n'),
  72  |       ).toBeTruthy();
  73  |     }
  74  |   }
  75  | }
  76  | 
  77  | async function autoplayToSummary(page, seed = DEFAULT_SEED) {
  78  |   await bootSeasonalTui(page, seed);
  79  | 
  80  |   const history = [];
  81  |   for (let step = 0; step < 120; step += 1) {
  82  |     const snapshot = await readPromptSnapshot(page);
  83  |     if (snapshot.heading === 'Year End Review') {
  84  |       return {
  85  |         history,
  86  |         summary: snapshot,
  87  |       };
  88  |     }
  89  | 
  90  |     history.push(snapshot);
  91  |     const previousFieldText = snapshot.fieldText;
  92  |     await page.keyboard.press('Enter');
  93  | 
  94  |     await page.waitForFunction(
  95  |       (previous) => {
  96  |         const main = document.querySelector('.tui-field-main');
  97  |         return !!main && main.textContent?.replace(/\s+/g, ' ').trim() !== previous;
  98  |       },
  99  |       previousFieldText,
  100 |       { timeout: 10000 },
  101 |     );
  102 |   }
  103 | 
  104 |   throw new Error('Timed out before reaching the Year End Review summary');
  105 | }
  106 | 
  107 | test('autoplays to the year-end review and exposes summary actions', async ({ page }) => {
  108 |   const result = await autoplayToSummary(page, DEFAULT_SEED);
  109 | 
  110 |   assertNoDuplicateFamilies(result.history);
  111 | 
  112 |   await expect(page.locator('.tui-heading')).toHaveText('Year End Review');
  113 |   await expect(page.locator('.tui-field-main')).toContainText('Key Decisions');
  114 |   await expect(page.locator('.tui-field-main')).toContainText('Next Year Outlook');
  115 |   await expect(page.locator('.tui-options button').nth(0)).toContainText('Play Again');
  116 |   await expect(page.locator('.tui-options button').nth(1)).toContainText('Quit');
  117 | });
  118 | 
  119 | test('summary play-again restarts back to the welcome screen', async ({ page }) => {
  120 |   await autoplayToSummary(page, DEFAULT_SEED + 1);
  121 | 
  122 |   await page.keyboard.press('Enter');
  123 |   await expect(page.locator('.tui-heading')).toContainText('Welcome to BC Forestry Trail');
  124 |   await expect(page.locator('.tui-options button')).toHaveCount(0);
  125 | });
  126 | 
  127 | test('escape exits the browser TUI back to the landing screen', async ({ page }) => {
  128 |   await bootSeasonalTui(page, DEFAULT_SEED + 2);
  129 | 
  130 |   await page.keyboard.press('Escape');
  131 | 
  132 |   await expect(page).toHaveURL(/\/index\.html$/);
  133 |   await expect(page.locator('#new-game-btn')).toBeVisible();
  134 | });
  135 | 
  136 | test('repeated seeded keyboard-only runs stay deterministic', async ({ page }) => {
```