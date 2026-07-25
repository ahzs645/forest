# A day is a situation, not a chore

*Written 2026-07-25 against `main @ 47c465d`. This is a whole-game design
review, prompted by a player looking at recon's shift menu and saying: "if
each thing is representing a day, I thought the person could just be doing
the events."*

That is the whole review in one sentence. The rest of this document is the
evidence that they were right, and what to do about it.

---

## 1. The game is mostly content the player never sees

The authored content library, counted from `js/data/index.js`:

| library | entries |
|---|---|
| `FIELD_EVENTS` | 94 |
| `DESK_EVENTS` | 83 |
| `ILLEGAL_ACTS` (temptations) | 208 |
| `ISSUE_LIBRARY` | 66 |
| `CHAINED_ISSUES` | 12 |
| `MINISTRY_PROCESS_FAILURES` + `REGULATORY_FAILURE_CASEFILES` | 28 |
| `ENFORCEMENT_CASEFILES` + `MINISTRY_PROCESS_HOOKS` | 15 |

Roughly **500 authored situations**, most of them good — they carry named
people, real BC process, and consequences that chain.

Now the rate they are served at (`js/events/selection.js:35`):

```js
const DAY_HAS_EVENT_CHANCE = 0.5;
```

Half of days roll for an event at all, and the draw can still come back empty
on cooldowns and context filters. Measured run lengths (`npm run
sim:expeditions`) are 27–38 days for recon, 14–20 for planning, 19–30 for
permitting, 30–37 for silviculture.

So a recon run surfaces on the order of **eleven situations out of ~300
applicable ones**, and spends the other ~60% of its days on a menu of chores.
The authored game is the interruption. The filler is the loop.

## 2. The game already speaks two design languages, and the wrong one won

**Seasonal Strategy** is card-driven. `promptSeasonalCard()`
(`js/game/seasonalAdapter.js:126`) renders a situation: a title, a body, a
`whyNow`, a `decisionPrompt`, options carrying risk tags and outcome
previews, and a free `More context` for the player who wants to read up
before committing. You are handed a thing that is happening and you decide
what to do about it.

**The five deployment modes** are chore-driven. `runFieldDay()`
(`js/modes/recon.js:350`) builds a nine-item menu of verbs — ground-truth,
sweep, notebook, four paces, a submenu, stand down — and asks "What gets the
day?" Events fire *on top of* whatever you picked, when they fire at all.

These are incompatible. The card loop is the better game and it is already
built, tested, and shipping in the same terminal.

## 3. Nothing on the chore menu is priced

`npm run sim:expeditions`, competent-player policy:

| mode | wins | days | deadline |
|---|---|---|---|
| recon | 7/8 | 27–38 | **none** |
| planning | 8/8 | 14–20 | 28 — won by day 16, 43% slack |
| permitting | 8/8 | 19–30 | 30 — actually binds |
| silviculture | 8/8 | 30–37 | **none** |

`checkReconEndConditions()` (`js/modes/shared/endConditions.js:22`) is the
only mode end-check with no deadline branch. Recon prints "Days left" in the
mission panel (`js/modes/recon.js:1079`) and it is decoration. Three of four
deployments cannot be lost to the clock; the only recon loss in eight runs
was total crew attrition, which is a spiral, not a decision.

A menu where nothing competes for the day is not a decision. It is a
checklist, and the player is right to feel it.

## 4. The menu is also crowding the game off the screen

Measured on a 390×844 phone at the recon shift menu:

| element | height | share of viewport |
|---|---|---|
| `#terminal` (the FIELD LOG pane) | 114 px — about 7 text rows | 13% |
| `#action-area` (nine option cards) | 557 px | 66% |

Mid-run the log also carries `SHIFT CONSEQUENCES` dumps, travel results,
event text and crew dialogue. All of it scrolls out of a seven-row window,
because `_scrollToBottom()` (`js/ui/input.js:41`) re-anchors *after* the
choice cards reflow the pane. The player who reported this pasted a frame
with nothing inside it.

The display bug and the design bug are the same bug. Fewer options is more
game, literally.

## 5. Other things that stopped making sense

- **Pace is chosen before the route is revealed.** The player picks
  Cautious/Standard/Extended/Max Effort at `js/modes/recon.js:487`, and only
  then does `maybePromptRouteChoice()` (`:620`) describe what is ahead. You
  rate your own effort before you know what you are walking into. Four of the
  nine slots are one verb at four intensities.
- **Field Notebook competes with going outside.** It closes a block package
  from camp for +2 scrutiny (`:1563`). A prior exploit is documented in the
  comment at `:1550`. Scrutiny needs real teeth or the notebook is just a
  cheaper way to win.
- **The block checklist is an action system pretending to be a consequence
  system.** "Ground-Truth Access" is required, always correct, and nags from
  a menu. There is never a reason not to do it, so it is not a choice.

## 6. The redesign

**Invert the loop. The day opens with a situation; the old chore verbs
become the answers.**

```
┌─┤ FIELD LOG ├────────────────────────┐
│ SHIFT 6 · HIGHWAY CAMP · rain        │
│ 41 km to Boundary Ck · 12 days left  │
│                                      │
│ THE LOWBED CALL                      │
│                                      │
│ Dispatch wants to move a lowbed into │
│ Highway Camp tomorrow morning. Nobody│
│ has driven the 4200 spur since       │
│ freshet. Kev says the culvert at km 3│
│ was "weeping" in April.              │
│                                      │
│ Why now: the contractor loses the    │
│ window if he waits, and he will bill │
│ you for standby either way.          │
└──────────────────────────────────────┘

 [1] Drive it yourself before you answer
     Costs the day. You will know.       [SAFE]
 [2] Tell him it's good on Kev's word
     Free. If it isn't, it's your name.  [RISKY]
 [3] Send him the long way around
     Two hours, $900 standby.         [TRADEOFF]
 [4] More context (free)
```

Same underlying mechanic — access gets ground-truthed or it does not — but
now there is a reason it is happening *today*, a cost attached to the safe
option, and a named person whose word you are choosing to trust. Option 2 is
what generates the consequence three shifts later when the culvert lets go.

### The four structural changes

1. **Every day carries a situation.** Raise the draw toward 100% and widen
   the deck to include low-stakes texture, not only incidents. A quiet day
   becomes a card too — *"nothing on the radio, the crew is dry, what do you
   want to do with it"* — and **that** card's options are the old chore menu.
   Chores stop being the default and become what you spend a gift on.
2. **Pace and rations become carried settings.** Changed rarely, from status,
   the way Oregon Trail does it. They leave the daily menu entirely.
3. **The block checklist becomes the consequence system.** Unverified access
   never nags from a menu; it comes back later as a card with your name on
   it. Scrutiny gets teeth so the notebook shortcut has a real price.
4. **Deadlines bind in every mode.** Add the missing branch to
   `checkReconEndConditions`, tighten planning's slack, give silviculture a
   season end. The day gets a price, so spending it becomes a decision.

### What this deletes

- The four pace options and the route-choice prompt as daily menu items.
- The `Camp & Support ▸` submenu — its contents become quiet-day options.
- `acknowledgeActionResult()` taps on every action.
- Most of `buildActionOptions()`-style menu assembly in all five modes,
  replaced by one shared card loop.

Net: the deployment modes should get materially smaller, and converge on the
renderer the seasonal mode already uses.

## 7. Order of work

1. Extract the seasonal card renderer into a shared day-card loop that any
   mode can call.
2. Convert **recon** onto it as the reference implementation, including the
   deadline fix and the pace/rations move to carried settings.
3. Re-sim. Recon should get losable, and days should stop being
   interchangeable.
4. Convert planning, permitting, silviculture, manager onto the same loop.
5. Re-point the campaign wrapper and the debrief at whatever the new day
   records.

## 8. Risks

- **Card fatigue.** If every day is an incident, incidents stop landing.
  Quiet cards and texture cards are what keep the loud ones loud; the deck
  needs a deliberate intensity curve, not a uniform draw.
- **The chore verbs still need a home.** Some genuinely are player-initiated
  (resupply, triage). Quiet days must offer enough that a player who wants to
  plan can still plan.
- **Save compatibility.** `js/game/saveLoad.js` and the campaign autosave
  (`bcft.campaign.v1`) serialize mid-day state. Any change to what a day is
  has to migrate or invalidate those.
- **Content pressure.** A 100% draw burns the library faster. 500 situations
  is a lot, but the per-mode applicable pool is much smaller once context
  filters apply — the deck needs to be measured per mode before the rate goes
  up.
