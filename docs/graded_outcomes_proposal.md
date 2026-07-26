# Graded outcomes — three worked samples for review

*Not implemented. This is a proposal to mark up.*

## Why

`js/data/json/field/events.json:1998` describes a swollen creek: *"It's passable,
maybe, but the current is strong and **the bottom is uncertain**."*

The option "Probe on foot, then drive across" resolves, every single time, as:

> *"You wade in waist-deep to test the bottom. **Solid gravel.** The trucks cross
> safely."*

The uncertainty is in the prose and nowhere else. That is the whole problem: 387
of 389 authored options apply one fixed outcome deterministically.

## Proposed schema

Minimal extension of the field names the engine already reads
(`js/events/resolution.js:70-75`), and **backwards compatible** — an option with
no `chancePartial` stays binary, so the two existing gambles are untouched.

| field | meaning |
|---|---|
| `chanceSuccess` | P(good band) — already exists |
| `chancePartial` | P(middle band) — new; omit for a binary gamble |
| `outcome` / `effects` | the good band — already exists |
| `partialOutcome` / `partialEffects` | the middle band — new |
| `failureOutcome` / `failureEffects` | the bad band — already exists |
| `oddsModifiers` | state-driven shifts, following the `js/risk.js:13-30` pattern |

P(bad) is the remainder, so the three always sum to 1.

The engine change is small — `resolution.js:70-75` currently does:

```js
let outcome = option.outcome;
let effects = option.effects;
if (typeof option.chanceSuccess === 'number' && Math.random() >= option.chanceSuccess) {
  outcome = option.failureOutcome || outcome;
  effects = option.failureEffects || effects;
}
```

It becomes a three-band roll against modified odds. Same shape, one extra band.

---

## Sample 1 — Swollen Creek Crossing

Rewrites `creek_crossing_decision`, option 1 (`events.json:2000`).

```json
{
  "label": "Probe on foot, then drive across",
  "chanceSuccess": 0.55,
  "chancePartial": 0.30,

  "outcome": "You wade in waist-deep, feeling for the bottom with a peavey. Solid gravel the whole way. The trucks cross one at a time and nobody says much about how cold you are.",
  "effects": { "crew_health": -3 },

  "partialOutcome": "Halfway across, the lead truck finds the soft spot you missed. It settles to the axle and stays there. Two hours on the winch and everything in the boxes is wet.",
  "partialEffects": { "crew_health": -5, "equipment": -8, "fuel": -4, "crew_morale": -4 },

  "failureOutcome": "The bottom is not gravel, it is rounded cobble over silt, and it moves. The truck slews downstream and takes water through the intake before you get a line on it. You are back on the near bank with a drowned engine and a creek that is still rising.",
  "failureEffects": { "equipment": -22, "crew_health": -8, "crew_morale": -10 },
  "failureBlocksCrossing": true,

  "oddsModifiers": [
    { "when": "weather:rain",           "shift": -0.15, "from": "good", "to": "bad" },
    { "when": "weather:storm",          "shift": -0.25, "from": "good", "to": "bad" },
    { "when": "crewHasRole:spotter",    "shift":  0.12, "from": "bad",  "to": "good" },
    { "when": "pace:grueling",          "shift": -0.10, "from": "good", "to": "partial" },
    { "when": "accessGroundTruthed",    "shift":  0.10, "from": "bad",  "to": "good" }
  ]
}
```

**Why it deserves a roll:** the event's own description already promises
uncertainty. And the bad band changes what you do *next* — `failureBlocksCrossing`
puts you back on the near bank, which turns into a real decision tomorrow rather
than just a bigger bill.

---

## Sample 2 — Questionable Bridge

`bridge_questionable` (`events.json:531`) currently has three options and **none of
them can go wrong** — a bridge described as "tired" always holds. This adds the
option a real crew lead would actually be tempted by.

```json
{
  "label": "Send the loaded truck across and watch the stringers",
  "chanceSuccess": 0.50,
  "chancePartial": 0.35,

  "outcome": "It groans in a way nobody enjoys and holds. You are across in four minutes instead of an hour, and the bridge is somebody else's problem in the spring.",
  "effects": {},

  "partialOutcome": "A stringer cracks under the back axle — not through, but through enough. The truck is across. The bridge is not taking another loaded trip, and now you know it.",
  "partialEffects": { "progress": -3 },
  "partialFlags": ["bridge_condemned"],

  "failureOutcome": "The deck lets go under the rear duals. The box drops six inches onto the cribbing and stops, which is the only good thing that happens. Getting it out takes the rest of the day and the crossing is finished.",
  "failureEffects": { "equipment": -18, "fuel": -6, "progress": -8 },
  "riskInjury": 0.20,
  "failureFlags": ["bridge_condemned"],

  "oddsModifiers": [
    { "when": "equipmentBelow:50",   "shift": -0.12, "from": "good", "to": "bad" },
    { "when": "crewHasRole:faller",  "shift":  0.10, "from": "bad",  "to": "partial" },
    { "when": "season:spring",       "shift": -0.15, "from": "good", "to": "bad" }
  ]
}
```

**Why it deserves a roll:** it is the classic bush gamble — an hour saved against a
bridge you do not own. The `bridge_condemned` flag is the point: two of the three
bands change the map for the rest of the run.

---

## Sample 3 — Crew Threatens to Quit

Upgrades the *existing* binary gamble at `events.json:1027`, which is one of only
two in the game. It currently reads: 60% he stays, 40% he takes the money and
quits — same $400 either way.

```json
{
  "label": "Negotiate — offer a bonus and lighter duties",
  "chanceSuccess": 0.45,
  "chancePartial": 0.35,

  "outcome": "He thinks about it for a long minute and puts his gloves back on. Word gets around the camp that you sorted it out instead of letting him walk.",
  "effects": { "budget": -400, "crew_morale": 4 },

  "partialOutcome": "He stays, and he is careful to let everyone know exactly what it took. By supper two others have found reasons to mention how tired they are.",
  "partialEffects": { "budget": -400, "crew_morale": -2 },
  "partialFlags": ["crew_precedent_set"],

  "failureOutcome": "He takes the money, works two more days, and is gone with the Thursday supply run. You are down a set of hands and out the bonus.",
  "failureEffects": { "budget": -400, "crew_morale": -8 },
  "failureCrewEffect": { "lose_member": true },

  "oddsModifiers": [
    { "when": "avgMoraleBelow:40",     "shift": -0.20, "from": "good", "to": "bad" },
    { "when": "shortRationStreak:3",   "shift": -0.15, "from": "good", "to": "bad" },
    { "when": "daysSinceRest:7",       "shift": -0.10, "from": "good", "to": "partial" },
    { "when": "avgMoraleAbove:70",     "shift":  0.15, "from": "bad",  "to": "good" }
  ]
}
```

**Why it deserves a roll:** it already does. The upgrade is that the odds now
depend on how you have actually been treating the crew, rather than being a flat
60% regardless — and the middle band ("he stays, but now everyone knows the
price") is the outcome a real crew lead would recognise.

---

## Decisions taken

1. **Band count varies per option.** Two bands where the option is a clean
   yes/no gamble, three where a middle outcome is genuinely different from both
   ends. Not a uniform format — `chancePartial` is simply absent on two-band
   options, which is what makes the schema backwards compatible anyway.
2. **`oddsModifiers` are data**, interpreted from the `when` strings.
3. **At least half the corpus** — roughly 195 of 389 options.
4. **The consequence flags get consuming code upstream**, so a bad band can
   change the run rather than just cost more.

---

## The biggest target is not in the content at all

`maybeCreateTemptationEvent` (`js/events/selection.js:405-491`) generates the
shortcut offer for **all 208 illegal acts** procedurally. Its option reads:

```js
{
  label: 'Take the shortcut (high risk)',
  outcome: `${takeOutcome} Avoided costs leave $${gain} available in the budget.`,
  effects: takeEffects,        // fixed money in, fixed compliance/scrutiny out
  riskInjury: takeRiskInjury,  // an injury side-roll; nothing to do with getting caught
}
```

**There is no roll for being caught.** Every shortcut in the game pays out, every
time, at exactly its advertised price. The words "(high risk)" in the label are
the only risk in the system.

Meanwhile `js/risk.js:13-30` `resolveRisk()` already implements exactly the right
model — a base chance shifted by compliance (±25%) and relationships (±15%),
clamped to [0.1, 0.9], returning distinct effects **and** distinct outcome text
per branch. It is wired only to the seasonal engine.

Because the options are generated, **one code change upgrades 208 acts**:

| target | effort | reach |
|---|---|---|
| temptation lane | 1 code site | 208 acts |
| authored events | ~195 hand-edits | 195 options |

This goes first.

### Proposed shape for the shortcut

Three bands, because "nobody noticed" / "someone noticed" / "it became a file"
are genuinely different futures, not three sizes of the same one:

```js
// Clean: the shortcut works and nothing follows it.
//   -> full gain, small scrutiny bump, the crew saw you do it
// Noticed: it works, but it leaves a mark someone can find later.
//   -> full gain, real compliance/scrutiny cost, schedules a follow-up event
// Caught: it does not work, and now it is a file with your name on it.
//   -> no gain at all, heavy compliance hit, professional-practice consequence

const caught = resolveRisk(journey, {
  baseSuccess: profile.baseSuccess ?? 0.55,
  ...
});
```

Odds shift on state the player controls, which is the point — a clean file and
good relationships should genuinely buy you cover:

| state | shift |
|---|---|
| scrutiny ≥ 55 | −15% clean → caught |
| scrutiny ≤ 20 | +10% caught → clean |
| high relationships | +10% caught → clean *(people look the other way)* |
| repeat offender this run (`seenActIds` length) | −5% per prior shortcut taken |
| difficulty hard | −10% clean |

The last one matters most: **taking shortcuts should compound.** Today the
208-act library has a `seenActIds` memory used only to avoid repeats. It should
also be the thing that hangs you.

### The honesty problem this fixes

The option is labelled "(high risk)". Once there is a real roll, the label can
state the actual number — `getOptionHint` already knows how to render
`chanceSuccess`, and as of this branch it no longer suppresses it behind
`hiddenOutcome`. A player deciding whether to falsify a survey should be able to
see that they are 60/40, and see that number move when their file is dirty.

---

## Still open

- **Which ~195 options?** Selection criterion, not yet applied: an option
  deserves a roll when its own description already promises uncertainty (the
  swollen creek), or when the realistic outcome depends on something the player
  cannot see. A flat cost is the right answer for the rest.
- **Where do the flags get consumed?** `bridge_condemned` wants a check in
  `js/journey/blockNav.js` or the crossing beat; `crew_precedent_set` wants a
  modifier in the crew-morale path; `failureBlocksCrossing` wants to set
  `journey.pendingCrossing`, which already exists (`js/modes/recon.js:374`).
