#!/usr/bin/env node
/**
 * BC Forestry Trail - CLI Version
 * A terminal-based version for testing and playing without a browser
 */

import * as readline from 'readline';
import { readFileSync } from 'fs';

// Load JSON data directly (Node.js compatible)
const loadJSON = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf-8'));

// Load game data
const namesData = loadJSON('./js/data/json/shared/names.json');
const traitsData = loadJSON('./js/data/json/shared/traits.json');
const statusEffectsData = loadJSON('./js/data/json/shared/statusEffects.json');
const fieldRolesData = loadJSON('./js/data/json/field/roles.json');
const deskRolesData = loadJSON('./js/data/json/desk/roles.json');
const weatherData = loadJSON('./js/data/json/field/weather.json');
const blocksData = loadJSON('./js/data/json/field/blocks.json');
const fieldEventsData = loadJSON('./js/data/json/field/events.json');
const deskEventsData = loadJSON('./js/data/json/desk/events.json');

const FIELD_SHIFT_HOURS = 9;
const FIELD_DISTANCE_SCALE = 0.5;

// Import static JS data (roles and areas don't use JSON)
import { FORESTER_ROLES } from './js/data/roles.js';
import { OPERATING_AREAS } from './js/data/operatingAreas.js';

// Game state
let journey = null;
let gameOver = false;
let victory = false;

// Readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Utility functions
const prompt = (question) => new Promise(resolve => rl.question(question, resolve));

const clear = () => console.clear();

const print = (text = '') => console.log(text);

const printHeader = (text) => {
  print('═'.repeat(50));
  print(`  ${text}`);
  print('═'.repeat(50));
};

const printDivider = (label = '') => {
  if (label) {
    print(`\n── ${label} ${'─'.repeat(40 - label.length)}`);
  } else {
    print('─'.repeat(50));
  }
};

const choose = async (question, options) => {
  print(question);
  print('');
  options.forEach((opt, i) => {
    const desc = opt.description ? ` - ${opt.description}` : '';
    print(`  [${i + 1}] ${opt.label}${desc}`);
  });
  print('');

  while (true) {
    const answer = await prompt('> ');
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= options.length) {
      return options[num - 1];
    }
    print(`Please enter a number between 1 and ${options.length}`);
  }
};

// Game data helpers
const FIRST_NAMES = namesData.firstNames;
const LAST_NAMES = namesData.lastNames;
const FIELD_ROLES = fieldRolesData;
const DESK_ROLES = deskRolesData;
const WEATHER_CONDITIONS = weatherData.conditions;
const FIELD_EVENTS = fieldEventsData;
const DESK_EVENTS = deskEventsData;

const getBlocksForArea = (areaId) => {
  if (blocksData[areaId]) return blocksData[areaId];
  const mapped = blocksData.areaMapping[areaId];
  if (mapped && blocksData[mapped]) return blocksData[mapped];
  return blocksData['fort-st-john-plateau'];
};

const scaleBlocksForShifts = (blocks) => {
  return blocks.map((block) => {
    const scaled = Math.round(block.distance * FIELD_DISTANCE_SCALE * 10) / 10;
    return {
      ...block,
      distance: Math.max(0.5, scaled)
    };
  });
};

const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Crew generation
const generateCrewMember = (journeyType) => {
  const roles = journeyType === 'field' ? FIELD_ROLES : DESK_ROLES;
  const role = randomFrom(roles);

  return {
    id: Math.random().toString(36).substr(2, 9),
    name: `${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}`,
    role: role.name,
    roleId: role.id,
    health: role.baseHealth || 100,
    morale: role.baseMorale || 75,
    isActive: true,
    effects: [],
    traits: []
  };
};

const generateCrew = (count, journeyType) => {
  return Array.from({ length: count }, () => generateCrewMember(journeyType));
};

// Journey creation
const createFieldJourney = ({ crewName, role, area, crew }) => {
  const blocks = scaleBlocksForShifts(getBlocksForArea(area.id));
  const totalDistance = blocks.reduce((sum, b) => sum + b.distance, 0);

  return {
    journeyType: 'field',
    crewName,
    role,
    area,
    crew,
    day: 1,
    blocks,
    currentBlockIndex: 0,
    distanceTraveled: 0,
    totalDistance,
    weather: randomFrom(WEATHER_CONDITIONS),
    resources: {
      fuel: 100,
      food: 50,
      equipment: 100,
      firstAid: 5
    },
    log: []
  };
};

const createDeskJourney = ({ crewName, role, area, crew }) => {
  return {
    journeyType: 'desk',
    crewName,
    role,
    area,
    crew,
    day: 1,
    deadline: 30,
    currentPhase: 'Planning',
    hoursRemaining: 8,
    permits: {
      target: 10,
      submitted: 0,
      inReview: 0,
      approved: 0,
      rejected: 0
    },
    resources: {
      budget: 50000,
      politicalCapital: 50
    },
    log: []
  };
};

// Event handling
const checkForEvent = () => {
  const events = journey.journeyType === 'field' ? FIELD_EVENTS : DESK_EVENTS;

  for (const event of events) {
    if (Math.random() < (event.probability || 0.1)) {
      return event;
    }
  }
  return null;
};

const applyEffects = (effects) => {
  if (!effects) return;

  for (const [key, value] of Object.entries(effects)) {
    if (journey.resources[key] !== undefined) {
      journey.resources[key] = Math.max(0, journey.resources[key] + value);
    }
    if (key === 'crew_health') {
      journey.crew.forEach(m => {
        if (m.isActive) m.health = Math.max(0, Math.min(100, m.health + value));
      });
    }
    if (key === 'crew_morale') {
      journey.crew.forEach(m => {
        if (m.isActive) m.morale = Math.max(0, Math.min(100, m.morale + value));
      });
    }
  }
};

// Game phases
const runFieldDay = async () => {
  const currentBlock = journey.blocks[journey.currentBlockIndex];

  clear();
  printHeader(`SHIFT ${journey.day} - ${currentBlock?.name || 'Unknown'}`);

  const progressPct = Math.round((journey.distanceTraveled / journey.totalDistance) * 100);
  print(`Progress: ${journey.distanceTraveled}/${journey.totalDistance} km traverse (${progressPct}%)`);
  print(`Shift length: ~${FIELD_SHIFT_HOURS} hours`);
  print(`Weather: ${journey.weather?.name || 'Clear'}`);
  print(`Terrain: ${currentBlock?.terrain || 'unknown'}`);

  printDivider('SUPPLIES');
  print(`  Fuel: ${journey.resources.fuel} gallons`);
  print(`  Food: ${journey.resources.food} days`);
  print(`  Equipment: ${journey.resources.equipment}%`);
  print(`  First Aid: ${journey.resources.firstAid} kits`);

  printDivider('CREW');
  for (const member of journey.crew) {
    const healthBar = '█'.repeat(Math.round(member.health / 20)) + '░'.repeat(5 - Math.round(member.health / 20));
    const status = member.isActive ? '' : ' [INACTIVE]';
    print(`  ${member.name} (${member.role}) H:${healthBar}${status}`);
  }

  // Random event check
  const event = checkForEvent();
  if (event) {
    const activeCrew = journey.crew.filter(m => m.isActive);
    const reporter = activeCrew.length ? randomFrom(activeCrew) : null;
    printDivider(reporter ? 'RADIO CHECK' : 'EVENT');
    print(`\n⚠️  ${event.title}`);
    if (reporter) {
      print(`${reporter.name} (${reporter.role}) radios in: ${event.description}`);
    } else {
      print(event.description);
    }
    print('');

    const choice = await choose('What do you do?', event.options.map(o => ({
      label: o.label,
      description: o.outcome?.substring(0, 50) + '...'
    })));

    const selectedOption = event.options.find(o => o.label === choice.label);
    print(`\n${selectedOption.outcome}`);
    applyEffects(selectedOption.effects);

    await prompt('\nPress Enter to continue...');
  }

  printDivider('WHAT DO YOU DO?');

  const action = await choose('Choose your action:', [
    { label: 'Standard recon shift', description: 'Typical coverage and consumption' },
    { label: 'Extended recon shift', description: 'More coverage, more fatigue' },
    { label: 'Cautious recon shift', description: 'Less coverage, lower risk' },
    { label: 'Rest & reset', description: 'Crew heals, uses less food' }
  ]);

  // Process action
  let distanceGained = 0;
  let fuelUsed = 0;
  let foodUsed = 0;

  switch (action.label) {
    case 'Standard recon shift':
      distanceGained = 8 + Math.floor(Math.random() * 5);
      fuelUsed = 8;
      foodUsed = 3;
      break;
    case 'Extended recon shift':
      distanceGained = 12 + Math.floor(Math.random() * 6);
      fuelUsed = 15;
      foodUsed = 4;
      journey.crew.forEach(m => { if (m.isActive) m.morale -= 5; });
      break;
    case 'Cautious recon shift':
      distanceGained = 5 + Math.floor(Math.random() * 3);
      fuelUsed = 5;
      foodUsed = 2;
      break;
    case 'Rest & reset':
      distanceGained = 0;
      fuelUsed = 0;
      foodUsed = 1;
      journey.crew.forEach(m => {
        if (m.isActive) {
          m.health = Math.min(100, m.health + 10);
          m.morale = Math.min(100, m.morale + 15);
        }
      });
      print('\nThe crew stands down and recovers.');
      break;
  }

  // Apply travel
  journey.distanceTraveled += distanceGained;
  journey.resources.fuel = Math.max(0, journey.resources.fuel - fuelUsed);
  journey.resources.food = Math.max(0, journey.resources.food - foodUsed);

  if (distanceGained > 0) {
    print(`\nCovered ${distanceGained} km of traverse this shift.`);
  }

  // Check block progress
  let blockDistance = 0;
  for (let i = 0; i <= journey.currentBlockIndex; i++) {
    blockDistance += journey.blocks[i].distance;
  }
  if (journey.distanceTraveled >= blockDistance && journey.currentBlockIndex < journey.blocks.length - 1) {
    journey.currentBlockIndex++;
    const newBlock = journey.blocks[journey.currentBlockIndex];
    print(`\n📍 Reached ${newBlock.name}`);
    if (newBlock.hasSupply) {
      print('   This location has supplies available.');
    }
  }

  // Update weather randomly
  if (Math.random() < 0.3) {
    journey.weather = randomFrom(WEATHER_CONDITIONS);
  }

  journey.day++;

  await prompt('\nPress Enter to continue...');
};

const runDeskDay = async () => {
  clear();
  printHeader(`DAY ${journey.day} of ${journey.deadline} - ${journey.currentPhase}`);

  const daysRemaining = journey.deadline - journey.day;
  const permitProgress = Math.round((journey.permits.approved / journey.permits.target) * 100);

  print(`Days Remaining: ${daysRemaining}`);
  print(`Permits: ${journey.permits.approved}/${journey.permits.target} approved (${permitProgress}%)`);
  print(`Pipeline: ${journey.permits.submitted} submitted, ${journey.permits.inReview} in review`);

  printDivider('RESOURCES');
  print(`  Budget: $${journey.resources.budget.toLocaleString()}`);
  print(`  Political Capital: ${journey.resources.politicalCapital}`);
  print(`  Hours Today: ${journey.hoursRemaining}`);

  printDivider('TEAM');
  for (const member of journey.crew) {
    const moraleBar = '█'.repeat(Math.round(member.morale / 20)) + '░'.repeat(5 - Math.round(member.morale / 20));
    print(`  ${member.name} (${member.role}) Morale:${moraleBar}`);
  }

  // Random event check
  const event = checkForEvent();
  if (event) {
    printDivider('EVENT');
    print(`\n📋 ${event.title}`);
    print(event.description);
    print('');

    const choice = await choose('What do you do?', event.options.map(o => ({
      label: o.label,
      description: ''
    })));

    const selectedOption = event.options.find(o => o.label === choice.label);
    print(`\n${selectedOption.outcome}`);
    applyEffects(selectedOption.effects);

    await prompt('\nPress Enter to continue...');
  }

  printDivider('DAILY PRIORITIES');

  const action = await choose('How will you spend today?', [
    { label: 'Process permits', description: 'Work through the backlog' },
    { label: 'Stakeholder outreach', description: 'Build relationships' },
    { label: 'Administrative tasks', description: 'Catch up on paperwork' },
    { label: 'Team development', description: 'Improve morale' }
  ]);

  // Process action
  switch (action.label) {
    case 'Process permits':
      const processed = 1 + Math.floor(Math.random() * 2);
      journey.permits.submitted += processed;
      // Move some through the pipeline
      if (journey.permits.inReview > 0 && Math.random() > 0.4) {
        journey.permits.approved++;
        journey.permits.inReview--;
        print(`\n✓ A permit was approved!`);
      }
      if (journey.permits.submitted > 0) {
        const toReview = Math.min(journey.permits.submitted, 1 + Math.floor(Math.random() * 2));
        journey.permits.submitted -= toReview;
        journey.permits.inReview += toReview;
      }
      journey.resources.budget -= 500;
      print(`\nProcessed ${processed} permit applications.`);
      break;
    case 'Stakeholder outreach':
      journey.resources.politicalCapital += 5 + Math.floor(Math.random() * 5);
      journey.resources.budget -= 200;
      print('\nBuilt relationships with stakeholders.');
      break;
    case 'Administrative tasks':
      journey.resources.budget -= 100;
      print('\nCaught up on administrative work.');
      break;
    case 'Team development':
      journey.crew.forEach(m => {
        if (m.isActive) m.morale = Math.min(100, m.morale + 10);
      });
      journey.resources.budget -= 300;
      print('\nTeam morale improved.');
      break;
  }

  journey.day++;
  journey.hoursRemaining = 8;

  await prompt('\nPress Enter to continue...');
};

const checkEndConditions = () => {
  const activeCrewCount = journey.crew.filter(m => m.isActive).length;

  if (activeCrewCount === 0) {
    gameOver = true;
    journey.endReason = 'All crew members lost';
    return;
  }

  if (journey.journeyType === 'field') {
    if (journey.distanceTraveled >= journey.totalDistance) {
      victory = true;
      journey.endReason = 'Expedition completed!';
      return;
    }
    if (journey.resources.fuel <= 0 && journey.resources.food <= 0) {
      gameOver = true;
      journey.endReason = 'Stranded with no supplies';
      return;
    }
  } else {
    if (journey.permits.approved >= journey.permits.target) {
      victory = true;
      journey.endReason = 'Permit targets achieved!';
      return;
    }
    if (journey.day > journey.deadline) {
      gameOver = true;
      journey.endReason = 'Failed to meet deadline';
      return;
    }
    if (journey.resources.budget <= 0) {
      gameOver = true;
      journey.endReason = 'Budget exhausted';
      return;
    }
  }
};

const showEndScreen = async () => {
  clear();

  if (victory) {
    printHeader('🎉 EXPEDITION SUCCESSFUL');
  } else {
    printHeader('💀 EXPEDITION FAILED');
  }

  print('');
  print(journey.endReason);
  print('');

  printDivider('FINAL STATISTICS');

  if (journey.journeyType === 'field') {
    const progressPct = Math.round((journey.distanceTraveled / journey.totalDistance) * 100);
    print(`Traverse Covered: ${journey.distanceTraveled}/${journey.totalDistance} km (${progressPct}%)`);
    print(`Shifts Elapsed: ${journey.day - 1}`);
    print(`Blocks Surveyed: ${journey.currentBlockIndex + 1}/${journey.blocks.length}`);
  } else {
    print(`Permits Approved: ${journey.permits.approved}/${journey.permits.target}`);
    print(`Days Used: ${journey.day - 1}/${journey.deadline}`);
    print(`Budget Remaining: $${journey.resources.budget.toLocaleString()}`);
  }

  printDivider('CREW FATE');

  for (const member of journey.crew) {
    let fate;
    if (!member.isActive) {
      fate = member.health <= 0 ? 'Died' : 'Left the expedition';
    } else if (victory) {
      fate = 'Completed the journey';
    } else {
      fate = 'Stranded';
    }
    print(`  ${member.name} (${member.role}): ${fate}`);
  }

  print('');
};

// Main game loop
const main = async () => {
  clear();
  printHeader('BC FORESTRY TRAIL');
  print('');
  print('The year is 2024. You have been assigned to lead');
  print('a forestry operation in northern British Columbia.');
  print('');
  print('Your decisions will determine whether your crew');
  print('completes their mission... or faces disaster.');
  print('');

  const crewName = await prompt('Name your crew: ');

  printDivider('SELECT YOUR ROLE');
  const roleOptions = FORESTER_ROLES.map(r => ({
    label: r.name,
    description: r.description,
    value: r
  }));
  const roleChoice = await choose('What is your specialization?', roleOptions);
  const role = FORESTER_ROLES.find(r => r.name === roleChoice.label);

  printDivider('SELECT OPERATING AREA');
  const areaOptions = OPERATING_AREAS.map(a => ({
    label: a.name,
    description: a.becZone,
    value: a
  }));
  const areaChoice = await choose('Where will you operate?', areaOptions);
  const area = OPERATING_AREAS.find(a => a.name === areaChoice.label);

  // Create journey
  const journeyType = role.journeyType || 'field';
  const crew = generateCrew(5, journeyType);

  if (journeyType === 'field') {
    journey = createFieldJourney({ crewName, role, area, crew });
  } else {
    journey = createDeskJourney({ crewName, role, area, crew });
  }

  // Show starting info
  clear();
  printHeader(`${crewName.toUpperCase() || 'YOUR CREW'} - ${role.name}`);
  print(`Operating Area: ${area.name}`);
  print(`BEC Zone: ${area.becZone}`);
  print('');

  printDivider('YOUR CREW');
  for (const member of crew) {
    print(`  ${member.name} - ${member.role}`);
  }
  print('');

  if (journeyType === 'field') {
    print(`Mission: Survey ${journey.totalDistance} km of traverse across ${journey.blocks.length} forest blocks.`);
    print(`Each shift is about ${FIELD_SHIFT_HOURS} hours. Crew returns to camp nightly.`);
  } else {
    print(`Mission: Approve ${journey.permits.target} permits within ${journey.deadline} days.`);
  }

  await prompt('\nPress Enter to begin...');

  // Main game loop
  while (!gameOver && !victory) {
    if (journey.journeyType === 'field') {
      await runFieldDay();
    } else {
      await runDeskDay();
    }
    checkEndConditions();
  }

  await showEndScreen();

  const playAgain = await prompt('\nPlay again? (y/n): ');
  if (playAgain.toLowerCase() === 'y') {
    gameOver = false;
    victory = false;
    journey = null;
    await main();
  } else {
    print('\nThanks for playing BC Forestry Trail!');
    rl.close();
  }
};

// Start the game
main().catch(err => {
  console.error('Game error:', err);
  rl.close();
  process.exit(1);
});
