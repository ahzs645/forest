/**
 * Event option affordability.
 *
 * A field crew pays for things out of the cash on the card. Resolution floors
 * cash at zero, so an option that cost more than the crew had used to land in
 * full: $2,000 of helicopter time bought with $1,450, the difference simply
 * forgiven. An option the crew cannot pay for is not a choice; the card says
 * why and leaves it off the list.
 */

import { isFieldJourney } from './constants.js';

/**
 * What an option costs that the crew does not have, or null when it can pay.
 * Only cash is a price: a negative fuel or food effect is usually what a bad
 * day takes, not something the crew hands over, so it never gates a choice.
 * @param {Object} journey
 * @param {Object} option - raw authored option
 * @returns {{cost: number, cash: number}|null}
 */
export function getOptionShortfall(journey, option) {
  if (!isFieldJourney(journey?.journeyType)) return null;
  const cash = journey?.resources?.budget;
  const cost = -Number(option?.effects?.budget);
  if (typeof cash !== 'number' || !(cost > 0) || cash >= cost) return null;
  return { cost, cash };
}

/**
 * The card line for an option the crew cannot pay for.
 * @param {string} label
 * @param {{cost: number, cash: number}} shortfall
 * @returns {string}
 */
export function formatShortfall(label, shortfall) {
  const cost = `$${Math.round(shortfall.cost).toLocaleString()}`;
  const cash = `$${Math.round(shortfall.cash).toLocaleString()}`;
  return `Can't pay for "${label}": it needs ${cost} and the card has ${cash}.`;
}
