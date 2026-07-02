/**
 * End Screen
 * Victory/defeat narratives and final statistics display
 */

import { getCrewDisplayInfo } from '../crew.js';
import { getSurveyedBlockCount } from '../journey/progress.js';
import { getCurrentSeasonInfo } from '../season.js';
import { calculateScore, formatScoreDisplay } from '../scoring.js';

/**
 * Show the end-of-game screen
 * @param {Object} ui - TerminalUI instance
 * @param {Object} journey - Journey state
 * @param {boolean} victory - Whether the player won
 */
export async function showEndScreen(ui, journey, victory) {
  ui.clear();
  const areaName = journey.area?.name || 'the operating area';
  const crewName = journey.companyName || 'The crew';
  const daysUsed = journey.day - 1;

  // --- Narrative Epilogue ---
  if (victory) {
    ui.writeHeader('EXPEDITION SUCCESSFUL');
    ui.write('');
    ui.write(buildVictoryNarrative(journey, areaName, crewName, daysUsed));
  } else {
    ui.writeHeader('EXPEDITION FAILED');
    ui.write('');
    ui.write(buildDefeatNarrative(journey, areaName, crewName, daysUsed));
  }

  ui.write('');

  // --- Scoring ---
  const scoreResult = calculateScore(journey, victory);
  ui.writeDivider('PERFORMANCE REVIEW');
  const scoreLines = formatScoreDisplay(scoreResult);
  for (const line of scoreLines) {
    ui.write(line);
  }

  ui.write('');
  ui.writeDivider('FINAL STATISTICS');
  writeFinalStatistics(ui, journey);

  // --- Crew Fate (narrative) ---
  if (journey.crew?.length > 0) {
    ui.write('');
    ui.writeDivider('CREW FATE');

    for (const member of journey.crew) {
      const info = getCrewDisplayInfo(member);
      let fate;
      if (!member.isActive) {
        if (member.isDead) {
          fate = 'Lost to the wilderness. Their sacrifice will be remembered.';
        } else if (member.hasQuit) {
          fate = 'Packed their bags and headed home early.';
        } else {
          fate = 'Evacuated for medical care.';
        }
      } else if (victory) {
        if (member.health > 80 && member.morale > 70) {
          fate = 'Returned triumphant and in high spirits.';
        } else if (member.health < 40) {
          fate = 'Completed the journey, but battered and bruised.';
        } else {
          fate = 'Completed the journey.';
        }
      } else {
        fate = 'Awaits rescue.';
      }
      ui.write(`${info.name} (${info.role}): ${fate}`);
    }
  }

  // --- Key Events ---
  if (journey.log?.length > 0) {
    const eventHighlights = journey.log.filter(e => e.type === 'event' || e.type === 'milestone');
    if (eventHighlights.length > 0) {
      ui.write('');
      ui.writeDivider('KEY EVENTS');
      const dayLabel = journey.journeyType === 'field' || journey.journeyType === 'recon' ? 'Shift' : 'Day';
      const toShow = eventHighlights.slice(-5);
      for (const entry of toShow) {
        ui.write(`${dayLabel} ${entry.day}: ${entry.eventTitle || entry.summary || entry.type}`);
      }
    }
  }

  ui.write('');
  ui.write('Tap NEW EXPEDITION (or press ESC) to start again.');
}

/**
 * Write the per-journey-type final statistics block
 * @param {Object} ui - TerminalUI instance
 * @param {Object} journey - Journey state
 */
export function writeFinalStatistics(ui, journey) {
  const daysUsed = journey.day - 1;

  switch (journey.journeyType) {
    case 'recon':
    case 'field': {
      const fieldProgressPct = Math.round((journey.distanceTraveled / journey.totalDistance) * 100);
      const surveyedBlocks = getSurveyedBlockCount(journey);
      ui.write(`Traverse Covered: ${Math.round(journey.distanceTraveled)}/${journey.totalDistance} km (${fieldProgressPct}%)`);
      ui.write(`Shifts Elapsed: ${daysUsed}`);
      ui.write(`Blocks Surveyed: ${surveyedBlocks}/${journey.blocks.length}`);
      if (journey.blocksAssessed !== undefined) {
        ui.write(`Blocks Assessed: ${journey.blocksAssessed}`);
      }
      break;
    }
    case 'silviculture': {
      const plantingPct = Math.round((journey.planting.seedlingsPlanted / journey.planting.seedlingsAllocated) * 100);
      ui.write(`Seedlings Planted: ${journey.planting.seedlingsPlanted.toLocaleString()}/${journey.planting.seedlingsAllocated.toLocaleString()} (${plantingPct}%)`);
      ui.write(`Blocks Planted: ${journey.planting.blocksPlanted}/${journey.planting.blocksToPlant}`);
      ui.write(`Brushing Complete: ${journey.brushing.hectaresComplete}/${journey.brushing.hectaresTarget} ha`);
      ui.write(`Free-Growing Surveys: ${journey.surveys.freeGrowingComplete}/${journey.surveys.freeGrowingTarget}`);
      ui.write(`Days Elapsed: ${daysUsed}`);
      ui.write(`Budget Remaining: $${Math.round(journey.resources.budget).toLocaleString()}`);
      break;
    }
    case 'planning':
      ui.write(`Final Phase: ${journey.plan.phase}`);
      ui.write(`Data Completeness: ${journey.plan.dataCompleteness}%`);
      ui.write(`Analysis Quality: ${journey.plan.analysisQuality}%`);
      ui.write(`Stakeholder Buy-in: ${journey.plan.stakeholderBuyIn}%`);
      ui.write(`Ministerial Confidence: ${journey.plan.ministerialConfidence}%`);
      ui.write(`Days Elapsed: ${daysUsed}`);
      ui.write(`Budget Remaining: $${Math.round(journey.resources.budget).toLocaleString()}`);
      break;

    case 'manager':
      ui.write(`Term Served: ${daysUsed}/${journey.deadline} months`);
      ui.write(`Budget Remaining: $${Math.round(journey.resources.budget).toLocaleString()}`);
      ui.write(`Reputation: ${Math.round(journey.metrics?.reputation ?? 50)}%`);
      if (journey.ceo) {
        ui.write(`CEO: ${journey.ceo.name}`);
      }
      if (journey.certifications?.length) {
        ui.write(`Certifications: ${journey.certifications.map((c) => c.name).join(', ')}`);
      }
      break;

    case 'permitting':
    case 'desk':
    default:
      ui.write(`Permits Approved: ${journey.permits?.approved ?? 0}/${journey.permits?.target ?? 0}`);
      ui.write(`Days Used: ${daysUsed}/${journey.deadline ?? daysUsed}`);
      ui.write(`Budget Remaining: $${Math.round(journey.resources.budget).toLocaleString()}`);
      break;
  }
}

export function buildVictoryNarrative(journey, areaName, crewName, daysUsed) {
  const seasonInfo = journey.season ? getCurrentSeasonInfo(journey.season) : null;
  const seasonName = seasonInfo ? seasonInfo.name.toLowerCase() : 'the season';

  switch (journey.journeyType) {
    case 'recon':
    case 'field': {
      const blocksCount = journey.blocks?.length || 0;
      const activeCrew = journey.crew.filter(m => m.isActive).length;
      // A recon win means every block package closed — not necessarily the
      // whole traverse driven (packages can be finalized from notes and GPS),
      // so only claim the traverse when the odometer backs it up.
      const traverseDone = journey.totalDistance > 0
        && journey.distanceTraveled >= journey.totalDistance;
      const opening = traverseDone
        ? `${crewName} completed the ${journey.totalDistance} km traverse through ${areaName} as ${seasonName} settled in.`
        : `${crewName} closed out every block package in ${areaName} as ${seasonName} settled in.`;
      return `${opening} ` +
        `${activeCrew} crew members finalized all ${blocksCount} blocks over ${daysUsed} shifts. ` +
        `The reconnaissance data will guide forest operations in this area for years to come.`;
    }
    case 'silviculture':
      return `After ${daysUsed} days of hard work, the silviculture program in ${areaName} reached its targets. ` +
        `${journey.planting.blocksPlanted} blocks planted, ${journey.surveys.freeGrowingComplete} free-growing surveys completed. ` +
        `A new generation of trees will rise from this ground.`;
    case 'planning':
      return `The landscape plan for ${areaName} received ministerial approval after ${daysUsed} days of analysis, ` +
        `stakeholder engagement, and careful balancing of competing values. ` +
        `The plan will shape forestry operations in the region for the next decade.`;
    case 'permitting':
    case 'desk':
      return `${journey.permits?.approved ?? 0} permits approved out of ${journey.permits?.target ?? 0} targeted. ` +
        `The permit pipeline in ${areaName} is flowing smoothly after ${daysUsed} days of diligent processing ` +
        `and relationship building.`;
    case 'manager':
      return `${crewName} closed out the term in ${areaName} after ${daysUsed} months with the books balanced ` +
        `and the board's confidence intact. The operation is set up to thrive under its new leadership.`;
    default:
      return journey.endReason || 'Expedition completed successfully.';
  }
}

export function buildDefeatNarrative(journey, areaName, crewName, daysUsed) {
  const reason = journey.endReason || journey.gameOverReason || 'The expedition ground to a halt.';

  switch (journey.journeyType) {
    case 'recon':
    case 'field': {
      const progress = journey.totalDistance > 0
        ? Math.round((journey.distanceTraveled / journey.totalDistance) * 100) : 0;
      const lastBlock = journey.blocks?.[journey.currentBlockIndex]?.name || 'an unknown location';
      return `The expedition stalled at ${lastBlock}, ${progress}% of the way through the traverse. ` +
        `${reason} After ${daysUsed} shifts, ${crewName} could go no further.`;
    }
    case 'silviculture':
      return `The silviculture program in ${areaName} fell short of its targets after ${daysUsed} days. ` +
        `${reason} The unplanted blocks will need to wait for next season.`;
    case 'planning':
      return `The landscape plan for ${areaName} failed to achieve approval after ${daysUsed} days. ` +
        `${reason} The planning process will need to restart with a new approach.`;
    case 'permitting':
    case 'desk':
      return `The permitting office in ${areaName} could not meet its targets. ` +
        `${reason} After ${daysUsed} days, the backlog remains.`;
    case 'manager':
      return `${crewName}'s tenure leading the ${areaName} operation ended after ${daysUsed} months. ` +
        `${reason} The board is already interviewing replacements.`;
    default:
      return reason;
  }
}
