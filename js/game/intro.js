/**
 * Journey Intro Display
 * Role-specific intro text shown at journey start
 */

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
    ui.write(`Season: ${seasonInfo.name} - Year ${seasonInfo.year}`);
    ui.write('');
  }

  switch (journeyType) {
    case 'recon':
      ui.write(`Mission: Verify a recon package for every one of the ${journey.blocks.length} forest blocks — reaching the end of the traverse is not the win.`);
      ui.write('Each block needs its access ground-truthed and, where values are flagged, a values sweep. Then the package finalizes.');
      ui.write('Field Notebook can close missed packages from notes, but each write-up adds 2 scrutiny. One shift is one job — pick it and live with it.');
      ui.write('Manage fuel, food, and equipment while documenting hazards, cultural sites, and road/crossing condition.');
      ui.write('');
      ui.write('Starting supplies:');
      ui.write(`  Budget: $${journey.resources.budget?.toLocaleString() || 0}`);
      ui.write(`  Fuel: ${journey.resources.fuel} gallons`);
      ui.write(`  Food: ${journey.resources.food} person-days`);
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
      ui.write(`Mission: Get the operating area's Forest Stewardship Plan and first Forest Operations Map approved by the District Manager within ${journey.deadline} days.`);
      ui.write('Phases: Inventory & Data → Analysis & Draft Plan → Engagement & Public Review → District Manager Decision');
      ui.write('Balance values: habitat, timber supply, community needs, First Nations interests.');
      ui.write('The FOM must run its 30-day public comment period before the file can go to the District Manager; the water gate and the road file have to be clear too.');
      ui.write('');
      ui.write('Current phase: Inventory & Data');
      ui.write('');
      ui.write('Starting resources:');
      ui.write(`  Budget: $${journey.resources.budget?.toLocaleString() || 0}`);
      ui.write(`  District goodwill: ${journey.resources.politicalCapital}`);
      ui.write(`  Inventory budget: ${Math.round((journey.resources.dataCredits || 0) / 10)} LiDAR/VRI pulls`);
      break;

    case 'permitting':
      ui.write(`Mission: Get ${journey.permits.target} permits issued by the District Manager within ${journey.deadline} days.`);
      ui.write('Work the queue: drafting → submission → referral clock → district decision → issued.');
      ui.write('Cutting and road permits go out on a 30-day First Nations referral; a file that touches a stream carries a 45-day WSA s.11 notification window; a deficiency letter stops its clock until you answer it.');
      ui.write('Working relationships with the district, the Nation, and the agencies are what move a clock early.');
      ui.write('');
      ui.write('Permit queue:');
      ui.write(`  Target: ${journey.permits.target} permits issued`);
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
      ui.write('One shift is one job. The crew returns to camp nightly.');
      ui.write('Manage fuel, food, and equipment while keeping radio contact.');
      ui.write('');
      ui.write('Starting supplies:');
      ui.write(`  Cash: $${journey.resources.budget?.toLocaleString() || 0}`);
      ui.write(`  Fuel: ${journey.resources.fuel} gallons`);
      ui.write(`  Food: ${journey.resources.food} person-days`);
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
      ui.write('  Daily Pace: one substantive action per day');
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
