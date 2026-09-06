/**
 * Shared event response time policy.
 *
 * Event content may opt an option into spending the day with `spendsDay: true`
 * (or `timeCost: "day"`). Everything else is a brief response by default:
 * authored `timeUsed` is applied as strain or travel delay, not as a hidden
 * calendar skip.
 */

export function optionSpendsDay(event, option, journeyType = 'field') {
  if (journeyType === 'manager') return false;
  if (typeof option?.spendsDay === 'boolean') return option.spendsDay;
  if (typeof option?.usesDay === 'boolean') return option.usesDay;

  const timeCost = String(option?.timeCost || option?.dayCost || '').toLowerCase();
  if (['day', 'shift', 'full_day', 'uses_day', 'uses_shift'].includes(timeCost)) return true;
  if (['brief', 'partial', 'none', 'free'].includes(timeCost)) return false;

  return false;
}

export function formatOptionTimeCost(event, option, journeyType = 'field') {
  if (journeyType === 'manager') return '';
  return optionSpendsDay(event, option, journeyType)
    ? 'uses this day'
    : 'brief response; work continues';
}
