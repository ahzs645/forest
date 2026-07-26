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
  // A court or a regulator has closed this block. Consumed by
  // isBlockEnjoined below, which stops recon finalizing its package.
  block_enjoined: 'recon: package cannot be finalized',
  // Heavy equipment is finished for the season. Consumed by
  // getMachineDownPenalty below, called from the recon travel leg.
  machine_down: 'recon travel: no machine support',
  // Something is coming into camp at night for the food. Consumed by
  // getCampBearDrain below, called at end of shift.
  camp_bear: 'recon: nightly food and morale drain',
  // Word travelled. Consumed as an odds predicate (hasFlag:locals_soured) by
  // any later gamble that turns on how locals treat you.
  locals_soured: 'odds: hasFlag',
  // Somebody is now reading everything your office sends. Consumed as an odds
  // predicate (hasFlag:reviewer_watching) by later desk submissions.
  reviewer_watching: 'odds: hasFlag',
};

/** Flags that need no mechanical consumer beyond shifting later odds. */
const ODDS_ONLY_FLAGS = new Set(['locals_soured', 'reviewer_watching']);

/**
 * Apply a resolved band's consequence flags to the run.
 * @param {Object} journey
 * @param {string[]} flags
 * @param {string[]} messages - appended to, so the player is told
 */
export function applyConsequenceFlags(journey, flags, messages = []) {
  if (!journey || !Array.isArray(flags)) return;

  // Every flag is recorded, whatever else it does, so `hasFlag:` odds
  // modifiers can read it. This is the cheap half of a consequence: the
  // failure keeps shifting later gambles even when it has no other machinery.
  journey.consequenceFlags = journey.consequenceFlags || [];
  for (const flag of flags) {
    if (!journey.consequenceFlags.includes(flag)) journey.consequenceFlags.push(flag);
  }

  for (const flag of flags) {
    if (ODDS_ONLY_FLAGS.has(flag)) {
      messages.push(flag === 'locals_soured'
        ? 'That account will be along this valley before you are.'
        : 'Somebody is going to read the next one properly.');
      continue;
    }

    switch (flag) {
      case 'block_enjoined': {
        const block = journey.blocks?.[journey.currentBlockIndex];
        if (block?.id) {
          journey.enjoinedBlocks = journey.enjoinedBlocks || [];
          if (!journey.enjoinedBlocks.includes(block.id)) {
            journey.enjoinedBlocks.push(block.id);
          }
          messages.push(`${block.name} is closed to work until the hearing. Nothing you write about it counts today.`);
        }
        break;
      }

      case 'machine_down': {
        journey.machineDown = true;
        messages.push('Heavy equipment is done for the season. Everything now comes in on foot or waits.');
        break;
      }

      case 'camp_bear': {
        journey.campBear = true;
        messages.push('It will be back tonight, and every night, for as long as there is food here.');
        break;
      }
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
/**
 * Whether a block is legally closed to work.
 *
 * A blockade that ends in an interim injunction, or a boundary trespass that
 * draws a stop-work order, takes the block off the table until a hearing the
 * run will not see. The package cannot be finalized — which is the point: the
 * player has to re-plan the season around ground they can no longer touch.
 * @param {Object} journey
 * @param {Object} block
 * @returns {boolean}
 */
export function isBlockEnjoined(journey, block) {
  if (!block?.id) return false;
  return (journey?.enjoinedBlocks || []).includes(block.id);
}

/**
 * The standing cost of having no machine left.
 *
 * Burying a loaded skidder in spring breakup ends heavy equipment for the
 * season. Everything after that is slower and harder on the crew, every leg,
 * rather than a one-day repair bill.
 * @param {Object} journey
 * @returns {{paceFactor: number, crewHealth: number, note: string|null}}
 */
export function getMachineDownPenalty(journey) {
  if (!journey?.machineDown) return { paceFactor: 1, crewHealth: 0, note: null };
  return {
    paceFactor: 0.8,
    crewHealth: -2,
    note: 'No machine. The crew does it the long way, on foot.',
  };
}

/**
 * What a fed bear costs, nightly, until something changes.
 *
 * The classic bush consequence: it is not the encounter that hurts, it is that
 * it now knows where the food is.
 * @param {Object} journey
 * @returns {{food: number, morale: number, note: string|null}}
 */
export function getCampBearDrain(journey) {
  if (!journey?.campBear) return { food: 0, morale: 0, note: null };
  return {
    food: -2,
    morale: -2,
    note: 'Something worked the camp over again in the night.',
  };
}

export function getCrewPrecedentMultiplier(journey) {
  const precedents = Number(journey?.crewPrecedent || 0);
  if (precedents <= 0) return 1;
  return Math.min(1.6, 1 + precedents * 0.2);
}
