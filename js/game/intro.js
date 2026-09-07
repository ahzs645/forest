/**
 * Journey Intro Display
 * Role-specific intro text shown at journey start
 */

import { getCurrentSeasonInfo } from '../season.js';
import { getRoleAreaBriefing } from '../data/roleAreaIntel.js';
import { getAreaSituationSummary } from '../data/areaSituations.js';
import { getRoleProfessionalContext } from '../data/professionalPractice.js';
import { getStockingStandard, describeStockingStandard } from '../data/stockingStandards.js';

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

    case 'silviculture': {
      const program = journey.program || {};
      const standard = getStockingStandard(program.becCode || journey.area?.becCode);
      const fillCount = Array.isArray(program.fill) ? program.fill.length : 0;
      ui.write(`Mission: Deliver this year's planting program (${journey.planting.blocksToPlant} blocks, ${journey.planting.seedlingsAllocated.toLocaleString()} trees) and get this year's free-growing declarations into RESULTS.`);
      ui.write('You run five vintages at once: this year\'s blocks (plant, then quality plots before the contractor is paid), last year\'s openings (fill where the survival survey fell below MSS), the 2-5 year old stands (release from brush), and the 8-15 year old openings (free-growing surveys against the site plan\'s stocking standard).');
      ui.write('Contractors are paid per tree and per hectare; the crew checks the work and signs for it.');
      ui.write('');
      ui.write('Program targets:');
      ui.write(`  This year's blocks: ${journey.planting.blocksToPlant} (${journey.planting.seedlingsAllocated.toLocaleString()} trees, ${standard.speciesMix}, ${standard.plantingSph.toLocaleString()} sph)`);
      if (fillCount) ui.write(`  Fill plant: ${fillCount} of last year's openings`);
      ui.write(`  Release treatment: ${journey.brushing.hectaresTarget} ha of 2-5 year old stands`);
      ui.write(`  Free-growing declarations: ${journey.surveys.freeGrowingTarget}`);
      ui.write(`  Stocking standard: ${describeStockingStandard(standard)}`);
      ui.write('');
      ui.write('Starting resources:');
      ui.write(`  Program budget: $${journey.resources.budget?.toLocaleString() || 0} (supervisor overhead $550/day; contractor invoices on top)`);
      ui.write(`  Seedling inventory: ${journey.resources.seedlings?.toLocaleString() || 0} (this year's allocation plus fill stock)`);
      ui.write(`  Contractor capacity: ${journey.resources.contractorCapacity} crew-days`);
      break;
    }

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

    case 'manager': {
      const ledger = journey.ledger || {};
      ui.write(`Mission: run the licensee's ${journey.deadline}-month operating year - deliver the cut, keep the books and the board onside.`);
      ui.write('Set the year\'s operating plan with your woodlands team, then run the monthly ledger: delivered cubic metres against the AAC, log price less stumpage and logging/haul, head-office overhead, certification costs. The divisions escalate what they cannot settle; the board reviews you quarterly.');
      ui.write('');
      ui.write('Operating overview:');
      ui.write(`  Opening treasury: $${journey.resources.budget?.toLocaleString() || 0}`);
      if (ledger.aac) ui.write(`  AAC: ${ledger.aac.toLocaleString()} m³ (plan ${ledger.monthlyPlan.toLocaleString()} m³/month; cut control judged at year end)`);
      if (ledger.logPrice) ui.write(`  Log price $${ledger.logPrice}/m³ - stumpage $${ledger.stumpage} - logging & haul $${ledger.loggingHaul}; overhead $${ledger.overhead.toLocaleString()}/month`);
      ui.write(`  Operating year: ${journey.deadline} months`);
      break;
    }

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
