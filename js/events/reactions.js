/**
 * Event Reactions
 * After a decision resolves, someone in the world responds: a crew member by
 * morale and temperament, the protagonist's inner voice by stress, or the CEO
 * in manager mode. Keeps the cast feeling alive without touching mechanics.
 */

const CREW_UPBEAT = [
  (name) => `${name} grins. "That's why you're the one signing the forms, boss."`,
  (name) => `${name} nods along. "Good call. I'll spread the word."`,
  (name) => `${name} cracks a thermos. "To decisions that don't get us on the news."`,
  (name) => `${name} is already loading gear. "Say less."`,
];

const CREW_NEUTRAL = [
  (name) => `${name} shrugs. "You're the boss. Logging it in the daybook."`,
  (name) => `${name} marks it on the whiteboard without comment.`,
  (name) => `${name} radios it through to the rest of the crew.`,
  (name) => `${name} mutters something about the forecast and gets back to it.`,
];

const CREW_GRUMBLING = [
  (name) => `${name} doesn't look up. "Sure. Add it to the pile."`,
  (name) => `${name} exhales slowly. "Hope head office knows what we're carrying out here."`,
  (name) => `${name} mutters something about overtime that you pretend not to hear.`,
  (name) => `${name} kicks a tire. The tire takes it well.`,
];

const CREW_CHEERFUL = [
  (name) => `${name} laughs. "Another one for the Friday story rotation."`,
  (name) => `${name} starts humming. Somehow it helps.`,
];

const PROTAGONIST_CALM = [
  () => 'You note the decision in the file. Future-you will appreciate the paper trail.',
  () => 'You stretch, refill the coffee, and move the next folder to the centre of the desk.',
  () => 'A clean call. The kind you used to second-guess and now just make.',
];

const PROTAGONIST_STRESSED = [
  () => 'You write the decision down twice — once for the file, once to convince yourself.',
  () => 'The inbox refills as you watch. One file at a time. One file at a time.',
  () => 'You catch yourself reading the same referral line three times before it sticks.',
];

const CEO_CONSERVATIVE = [
  (name) => `${name} reviews the numbers twice before nodding. "Defensible. I can work with defensible."`,
  (name) => `${name} files a one-page memo supporting the decision — with three appendices.`,
];

const CEO_BOLD = [
  (name) => `${name} is already on the phone turning the decision into a story for the buyers.`,
  (name) => `${name} grins. "Bold. The board will either love it or learn to."`,
];

function pick(deck, rng) {
  return deck[Math.floor(rng() * deck.length)];
}

/**
 * Build a one-line reaction to a resolved event, or null (reactions fire
 * roughly half the time so they stay a treat, not a tax).
 * @param {Object} journey - Journey state
 * @param {Object} option - The chosen option (reserved for tone hooks)
 * @param {Function} rng - random source, injectable for tests
 * @returns {string|null}
 */
export function buildEventReaction(journey, option, rng = Math.random) {
  if (rng() > 0.45) return null;

  // Manager: CEO speaks half the time, crew otherwise
  if (journey.journeyType === 'manager' && journey.ceo && rng() < 0.5) {
    const deck = journey.ceo.decision_making_style === 'conservative' ? CEO_CONSERVATIVE : CEO_BOLD;
    return pick(deck, rng)(journey.ceo.name);
  }

  const active = (journey.crew || []).filter((m) => m.isActive);
  if (active.length > 0) {
    const member = active[Math.floor(rng() * active.length)];
    if (member.traits?.includes('cheerful') && rng() < 0.6) {
      return pick(CREW_CHEERFUL, rng)(member.name);
    }
    const deck = member.morale >= 70 ? CREW_UPBEAT : member.morale >= 40 ? CREW_NEUTRAL : CREW_GRUMBLING;
    return pick(deck, rng)(member.name);
  }

  // Protagonist modes (planning/permitting): inner voice by stress
  if (journey.protagonist) {
    const deck = (journey.protagonist.stress ?? 0) >= 60 ? PROTAGONIST_STRESSED : PROTAGONIST_CALM;
    return pick(deck, rng)();
  }

  return null;
}
