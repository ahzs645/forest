/**
 * Journey Intro Display
 * Role-specific intro text shown at journey start
 */

import { FIELD_SHIFT_HOURS } from '../journey/constants.js';
import { getCurrentSeasonInfo } from '../season.js';
import { getRoleAreaBriefing } from '../data/roleAreaIntel.js';
import { getAreaSituationSummary } from '../data/areaSituations.js';
import { getRoleProfessionalContext } from '../data/professionalPractice.js';

function formatScrutiny(scrutiny) {
  const value = Number(scrutiny || 0);
  if (value >= 70) return `HIGH (${value}%)`;
  if (value >= 40) return `ELEVATED (${value}%)`;
  return `LOW (${value}%)`;
}




/**
 * Show journey-specific intro based on journey type
 * @param {Object} ui - TerminalUI instance
 * @param {Object} journey - Journey state
 */
export function showJourneyIntro(ui, journey) {
  const journeyType = journey.journeyType;
  const roleId = journey.roleId || journey.role?.id;
  const briefing = getRoleAreaBriefing(roleId, journey.area, { maxFinds: 3 });
  const areaSituation = getAreaSituationSummary(journey);
  const professionalContext = getRoleProfessionalContext(roleId, {
    obligationCount: 1,
    paperworkCount: 2,
    enforcementCount: 1,
    breachCount: 1,
    area: journey.area,
  });

  // Show season info if available
  if (journey.season) {
    const seasonInfo = getCurrentSeasonInfo(journey.season);
    ui.write(`Season: ${seasonInfo.icon} ${seasonInfo.name} - Year ${seasonInfo.year}`);
    ui.write('');
  }

  switch (journeyType) {
    case 'recon':
      ui.write(`Mission: Survey ${journey.totalDistance} km of traverse across ${journey.blocks.length} forest blocks.`);
      ui.write(`Each shift is about ${FIELD_SHIFT_HOURS} hours. Complete the survey before the season ends.`);
      ui.write('Manage fuel, food, and equipment while documenting hazards, cultural sites, and road/crossing condition.');
      ui.write('');
      ui.write('Starting supplies:');
      ui.write(`  Budget: $${journey.resources.budget?.toLocaleString() || 0}`);
      ui.write(`  Fuel: ${journey.resources.fuel} gallons`);
      ui.write(`  Food: ${journey.resources.food} days worth`);
      ui.write(`  Equipment: ${journey.resources.equipment}% condition`);
      ui.write(`  GPS Units: ${journey.resources.gpsUnits || 5}`);
      break;

    case 'silviculture':
      ui.write(`Mission: Meet regeneration targets for the ${journey.planting.blocksToPlant} blocks in your program.`);
      ui.write('Manage planting contractors, herbicide applications, and survival surveys.');
      ui.write('Spring is critical for planting. Summer for brushing. Fall for assessments.');
      ui.write('');
      ui.write('Program targets:');
      ui.write(`  Seedlings to plant: ${journey.planting.seedlingsAllocated.toLocaleString()}`);
      ui.write(`  Brushing hectares: ${journey.brushing.hectaresTarget} ha`);
      ui.write(`  Free-growing surveys: ${journey.surveys.freeGrowingTarget}`);
      ui.write('');
      ui.write('Starting resources:');
      ui.write(`  Budget: $${journey.resources.budget?.toLocaleString() || 0}`);
      ui.write(`  Seedling inventory: ${journey.resources.seedlings?.toLocaleString() || 0}`);
      ui.write(`  Contractor capacity: ${journey.resources.contractorCapacity} days`);
      break;

    case 'planning':
      ui.write(`Mission: Achieve ministerial approval for a landscape-level forest plan within ${journey.deadline} days.`);
      ui.write('Progress through phases: Data Gathering → Analysis → Stakeholder Review → Ministerial Approval');
      ui.write('Balance values: biodiversity, timber supply, community needs, First Nations interests.');
      ui.write('Final submission now depends on Forest Operations Map review and water-timing readiness.');
      ui.write('');
      ui.write('Current phase: Data Gathering');
      ui.write(`  Cutblocks to plan: ${journey.cutblocks.proposed}`);
      ui.write('');
      ui.write('Starting resources:');
      ui.write(`  Budget: $${journey.resources.budget?.toLocaleString() || 0}`);
      ui.write(`  Political Capital: ${journey.resources.politicalCapital}`);
      ui.write(`  Data Credits: ${journey.resources.dataCredits}`);
      ui.write(`  Consultant Days: ${journey.resources.consultantDays}`);
      break;

    case 'permitting':
      ui.write(`Mission: Complete ${journey.permits.target} permit approvals within ${journey.deadline} days.`);
      ui.write('Manage the permit pipeline: drafting → referral → review → approval.');
      ui.write('Build stakeholder relationships to smooth the approval process.');
      ui.write('Public-review, hydrology, and timing pressure now change how hard the file is to move.');
      ui.write('');
      ui.write('Permit pipeline:');
      ui.write(`  Target: ${journey.permits.target} approvals`);
      ui.write(`  In backlog: ${journey.permits.backlog}`);
      ui.write(`  Submitted: ${journey.permits.submitted}`);
      ui.write(`  In review: ${journey.permits.inReview}`);
      ui.write('');
      ui.write('Starting resources:');
      ui.write(`  Budget: $${journey.resources.budget?.toLocaleString() || 0}`);
      ui.write(`  Political Capital: ${journey.resources.politicalCapital}`);
      break;

    case 'field':
      ui.write(`Mission: Survey ${journey.totalDistance} km of traverse across ${journey.blocks.length} forest blocks.`);
      ui.write(`Each shift is about ${FIELD_SHIFT_HOURS} hours. The crew returns to camp nightly.`);
      ui.write('Manage fuel, food, and equipment while keeping radio contact.');
      ui.write('');
      ui.write('Starting supplies:');
      ui.write(`  Cash: $${journey.resources.budget?.toLocaleString() || 0}`);
      ui.write(`  Fuel: ${journey.resources.fuel} gallons`);
      ui.write(`  Food: ${journey.resources.food} days worth`);
      ui.write(`  Equipment: ${journey.resources.equipment}% condition`);
      ui.write(`  First Aid: ${journey.resources.firstAid} kits`);
      break;

    case 'manager':
      ui.write(`Mission: Lead the forestry operations to profitability and sustainability over ${journey.deadline} days.`);
      ui.write('Manage field crew realities while advancing high-level office initiatives like certifications and hiring CEOs.');
      ui.write('Balance your budget with reputation and compliance.');
      ui.write('');
      ui.write('Strategic overview:');
      ui.write(`  Initial Budget: $${journey.resources.budget?.toLocaleString() || 0}`);
      ui.write(`  Target Profit: $${journey.targetProfit?.toLocaleString() || 0}`);
      ui.write(`  Deadline: ${journey.deadline} days`);
      break;

    case 'desk':
    default:
      ui.write(`Mission: Complete permit approvals within ${journey.deadline} days.`);
      ui.write(`Target: ${journey.permits.target} permits approved.`);
      ui.write('Manage your budget, political capital, and team energy.');
      ui.write('');
      ui.write('Starting resources:');
      ui.write(`  Budget: $${journey.resources.budget?.toLocaleString() || 0}`);
      ui.write(`  Political Capital: ${journey.resources.politicalCapital}`);
      ui.write(`  Daily Energy: ${journey.hoursRemaining} hours`);
      break;
  }

  if (briefing.zoneSummary || briefing.likelyFinds.length) {
    ui.write('');
  }

  if (briefing.zoneSummary) {
    ui.write(`Zone Reality: ${briefing.zoneSummary}`);
  }

  if (areaSituation) {
    ui.write(`Current Area Situation: ${areaSituation}`);
  }

  if (Number.isFinite(journey.scrutiny)) {
    ui.write(`Starting Scrutiny: ${formatScrutiny(journey.scrutiny)}`);
  }

  // Deeper intel (district snapshots, likely finds, professional watch) lives
  // behind the day menu's briefing/file-review action and the [P] Intel panel —
  // the send-off should read like a send-off, not a binder.
  const watchItems = [
    briefing.likelyFinds[0],
    professionalContext.obligations[0]?.summary,
    professionalContext.areaBurden?.title ? `Area burden: ${professionalContext.areaBurden.title}` : null,
  ].filter(Boolean);
  if (watchItems.length) {
    ui.write(`Watch for: ${watchItems[0]}`);
  }
  ui.write('');
  ui.write('(Deeper intel: the briefing action in your day menu, or [P] Intel.)', 'term-dim');
}
