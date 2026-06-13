# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tui-browser-mobile.spec.js >> seasonal strategy TUI supports touch-first setup and play on mobile
- Location: tests/e2e/tui-browser-mobile.spec.js:34:1

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
      - button "Exit" [ref=e10] [cursor=pointer]
    - generic [ref=e11]:
      - complementary [ref=e12]:
        - generic [ref=e13]:
          - button "Dashboard" [ref=e14] [cursor=pointer]
          - button "Area" [ref=e15] [cursor=pointer]
        - generic [ref=e16]:
          - generic [ref=e17]:
            - generic [ref=e18]: Season
            - generic [ref=e19]: 1 / 4
          - generic [ref=e20]:
            - generic [ref=e21]: Progress
            - generic [ref=e22]: 50%
          - generic [ref=e23]:
            - generic [ref=e24]: Forest Health
            - generic [ref=e25]: 50%
          - generic [ref=e26]:
            - generic [ref=e27]: Relationships
            - generic [ref=e28]: 50%
          - generic [ref=e29]:
            - generic [ref=e30]: Compliance
            - generic [ref=e31]: 50%
          - generic [ref=e32]:
            - generic [ref=e33]: Budget
            - generic [ref=e34]: 50%
          - generic [ref=e35]:
            - generic [ref=e36]: Company
            - generic [ref=e37]: Northline Forestry
          - generic [ref=e38]:
            - generic [ref=e39]: Role
            - generic [ref=e40]: Permitting Specialist
          - generic [ref=e41]:
            - generic [ref=e42]: Area
            - generic [ref=e43]: Muskwa Foothills
      - generic [ref=e44]:
        - generic [ref=e45]:
          - generic [ref=e46]: Field Radio
          - generic [ref=e49]:
            - generic [ref=e50]: Role-Area Briefing
            - generic [ref=e51]: Referral Briefing
            - paragraph [ref=e52]: Remote-access files that attract engineering questions on side-cast, crossing stability, and whether the timing window is even realistic
            - button "▸ More context" [ref=e53] [cursor=pointer]
        - generic [ref=e54]:
          - generic [ref=e55]:
            - generic [ref=e56]: How do you want to respond?
            - generic [ref=e57]: ↑↓ · Enter
          - paragraph [ref=e58]: SituationRemote-access files that attract engineering questions on side-cast, crossing stability, and whether the timing window is even realistic
          - generic [ref=e59]:
            - button "1 Ground-truth the situation You slow down long enough to verify the live condition before it compounds into a bigger file problem." [ref=e60] [cursor=pointer]:
              - generic [ref=e61]: "1"
              - generic [ref=e62]:
                - generic [ref=e63]: Ground-truth the situation
                - generic [ref=e64]: You slow down long enough to verify the live condition before it compounds into a bigger file problem.
            - button "2 Balance around it You adapt the work around the signal without surrendering the season outright." [ref=e65] [cursor=pointer]:
              - generic [ref=e66]: "2"
              - generic [ref=e67]:
                - generic [ref=e68]: Balance around it
                - generic [ref=e69]: You adapt the work around the signal without surrendering the season outright.
            - button "3 Push the original plan You hold the original line and bank the momentum, accepting that the exposure may come back later." [ref=e70] [cursor=pointer]:
              - generic [ref=e71]: "3"
              - generic [ref=e72]:
                - generic [ref=e73]: Push the original plan
                - generic [ref=e74]: You hold the original line and bank the momentum, accepting that the exposure may come back later.
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const MOBILE_SEED = 20260411;
  4  | 
  5  | test.use({
  6  |   viewport: { width: 390, height: 844 },
  7  |   hasTouch: true,
  8  |   isMobile: true,
  9  | });
  10 | 
  11 | function attachRuntimeErrorCollector(page) {
  12 |   const runtimeErrors = [];
  13 | 
  14 |   page.on('pageerror', (error) => runtimeErrors.push(error.message));
  15 |   page.on('console', (message) => {
  16 |     if (message.type() === 'error') {
  17 |       runtimeErrors.push(message.text());
  18 |     }
  19 |   });
  20 | 
  21 |   return runtimeErrors;
  22 | }
  23 | 
  24 | async function seedBrowser(page, seed) {
  25 |   await page.addInitScript((seedStart) => {
  26 |     let currentSeed = seedStart;
  27 |     Math.random = () => {
  28 |       currentSeed = (1664525 * currentSeed + 1013904223) >>> 0;
  29 |       return currentSeed / 0x100000000;
  30 |     };
  31 |   }, seed);
  32 | }
  33 | 
  34 | test('seasonal strategy TUI supports touch-first setup and play on mobile', async ({ page }) => {
  35 |   const runtimeErrors = attachRuntimeErrorCollector(page);
  36 |   await seedBrowser(page, MOBILE_SEED);
  37 | 
  38 |   await page.goto('/tui.html');
  39 | 
  40 |   await expect(page.locator('#company-name')).toBeVisible();
  41 |   await expect(page.getByRole('button', { name: 'Use Default' })).toBeVisible();
  42 | 
  43 |   await page.locator('#company-name').click();
  44 |   await page.locator('#company-name').fill('Northline Forestry');
  45 |   await page.getByRole('button', { name: 'Continue' }).click();
  46 | 
  47 |   await page.getByRole('button', { name: /Permitting Specialist/ }).click();
  48 |   await page.getByRole('button', { name: /Muskwa Foothills/ }).click();
  49 | 
  50 |   await expect(page.locator('.tui-dashboard')).toContainText('Northline Forestry');
  51 |   if ((await page.locator('.tui-field-main').innerText()).includes('Prepare your crew.')) {
  52 |     await page.locator('.tui-option').first().click();
  53 |   }
> 54 |   await expect(page.locator('.tui-field-main')).toContainText('What am I deciding?');
     |                                                 ^ Error: expect(locator).toContainText(expected) failed
  55 | 
  56 |   const beforeDecision = await page.locator('.tui-field-main').innerText();
  57 |   await page.locator('.tui-option').first().click();
  58 |   await page.waitForFunction(
  59 |     (previous) => {
  60 |       const main = document.querySelector('.tui-field-main');
  61 |       return !!main && main.textContent?.replace(/\s+/g, ' ').trim() !== previous;
  62 |     },
  63 |     beforeDecision.replace(/\s+/g, ' ').trim(),
  64 |   );
  65 | 
  66 |   const layout = await page.evaluate(() => {
  67 |     const optionRects = Array.from(document.querySelectorAll('.tui-option')).map((element) => {
  68 |       const rect = element.getBoundingClientRect();
  69 |       return { left: rect.left, right: rect.right };
  70 |     });
  71 | 
  72 |     return {
  73 |       hasHorizontalOverflow: document.body.scrollWidth > window.innerWidth,
  74 |       hasOffscreenOptions: optionRects.some((rect) => rect.left < 0 || rect.right > window.innerWidth),
  75 |     };
  76 |   });
  77 | 
  78 |   expect(layout.hasHorizontalOverflow).toBeFalsy();
  79 |   expect(layout.hasOffscreenOptions).toBeFalsy();
  80 |   expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
  81 | });
  82 | 
  83 | test('mobile exit button returns the TUI to the landing page', async ({ page }) => {
  84 |   await seedBrowser(page, MOBILE_SEED + 1);
  85 |   await page.goto('/tui.html');
  86 | 
  87 |   await page.getByRole('button', { name: 'Exit' }).click();
  88 | 
  89 |   await expect(page).toHaveURL(/\/index\.html$/);
  90 |   await expect(page.locator('#new-game-btn')).toBeVisible();
  91 | });
  92 | 
```