/**
 * Consequence flags — what a bad outcome leaves behind.
 *
 * Graded bands (js/events/odds.js) let an option fail, but a failure whose only
 * expression is a bigger negative number is still a bill, not a consequence.
 * The bar set in docs/graded_outcomes_proposal.md is that a bad band should
 * change what the player does NEXT.
 *
 * That needs somewhere for the change to live, and something upstream that
 * reads it. This module is the first half: bands declare `flags`, and these
 * handlers write them into journey state. The consumers are named against each
 * flag so a flag can never be authored into content without a reader existing.
 */

/**
 * Every flag a band may declare, and where it is consumed. A flag with no
 * consumer is a lie to the player, so this table is the contract: adding a
 * flag here without wiring its reader is the bug to look for.
 */
export const CONSEQUENCE_FLAGS = {
  // The crew did not get across. Consumed by js/modes/recon.js, which re-runs
  // the water-crossing beat next shift off journey.pendingCrossing.
  blocks_crossing: 'recon: pendingCrossing',
  // This crossing will not take another loaded trip. Consumed by
  // getCondemnedCrossingPenalty below, called from the recon travel leg.
  bridge_condemned: 'recon travel: detour cost',
  // Someone got paid to stay. Consumed by getCrewPrecedentMultiplier below,
  // applied to later crew-morale losses.
  crew_precedent_set: 'resolution: crew_morale scaling',
};

/**
 * Apply a resolved band's consequence flags to the run.
 * @param {Object} journey
 * @param {string[]} flags
 * @param {string[]} messages - appended to, so the player is told
 */
export function applyConsequenceFlags(journey, flags, messages = []) {
  if (!journey || !Array.isArray(flags)) return;

  for (const flag of flags) {
    switch (flag) {
      case 'blocks_crossing': {
        const block = journey.blocks?.[journey.currentBlockIndex];
        if (block?.id) {
          journey.pendingCrossing = block.id;
          messages.push('You are still on the near bank. Whatever happens next happens here.');
        }
        break;
      }

      case 'bridge_condemned': {
        const block = journey.blocks?.[journey.currentBlockIndex];
        if (block?.id) {
          journey.condemnedCrossings = journey.condemnedCrossings || [];
          if (!journey.condemnedCrossings.includes(block.id)) {
            journey.condemnedCrossings.push(block.id);
          }
          messages.push('That crossing is finished for loaded traffic. Anything coming back this way goes the long road.');
        }
        break;
      }

      case 'crew_precedent_set': {
        journey.crewPrecedent = (journey.crewPrecedent || 0) + 1;
        messages.push('The camp now knows what it costs to threaten to walk.');
        break;
      }

      default:
        break;
    }
  }
}

/**
 * The standing cost of a crossing the crew broke behind them.
 *
 * Returns the extra fuel and equipment a travel leg pays when it has to work
 * around a condemned crossing. Small per leg by design — the point is that the
 * bad band is still being paid for days later, not that the run is over.
 * @param {Object} journey
 * @returns {{fuel: number, equipment: number, note: string|null}}
 */
export function getCondemnedCrossingPenalty(journey) {
  const condemned = journey?.condemnedCrossings || [];
  if (condemned.length === 0) return { fuel: 0, equipment: 0, note: null };

  return {
    fuel: 3 * condemned.length,
    equipment: 2 * condemned.length,
    note: condemned.length === 1
      ? 'The long way around the crossing you broke costs fuel and rubber.'
      : `Working around ${condemned.length} broken crossings is its own tax now.`,
  };
}

/**
 * How much worse a crew-morale hit lands once a precedent has been set.
 *
 * Paying one person to stay teaches everyone what leverage is worth. Later
 * morale losses bite harder, which is the delayed half of the bad band on
 * crew_threatens_quit.
 * @param {Object} journey
 * @returns {number} multiplier >= 1
 */
export function getCrewPrecedentMultiplier(journey) {
  const precedents = Number(journey?.crewPrecedent || 0);
  if (precedents <= 0) return 1;
  return Math.min(1.6, 1 + precedents * 0.2);
}
