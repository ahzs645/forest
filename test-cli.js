#!/usr/bin/env node
/**
 * Automated test of BC Forestry Trail CLI
 * Simulates playing through several days
 */

import { readFileSync } from 'fs';

// Load JSON data
const loadJSON = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf-8'));

const namesData = loadJSON('./js/data/json/shared/names.json');
const fieldRolesData = loadJSON('./js/data/json/field/roles.json');
const weatherData = loadJSON('./js/data/json/field/weather.json');
const blocksData = loadJSON('./js/data/json/field/blocks.json');
const fieldEventsData = loadJSON('./js/data/json/field/events.json');

import { FORESTER_ROLES } from './js/data/roles.js';
import { OPERATING_AREAS } from './js/data/operatingAreas.js';

const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Generate crew
const generateCrew = (count) => {
  return Array.from({ length: count }, () => ({
    name: `${randomFrom(namesData.firstNames)} ${randomFrom(namesData.lastNames)}`,
    role: randomFrom(fieldRolesData).name,
    health: 100,
    morale: 75,
    isActive: true
  }));
};

// Create journey
const blocks = blocksData['fort-st-john-plateau'];
const journey = {
  crewName: 'Test Expedition',
  role: FORESTER_ROLES[2], // Recon Crew Lead
  area: OPERATING_AREAS[0],
  crew: generateCrew(5),
  day: 1,
  blocks,
  currentBlockIndex: 0,
  distanceTraveled: 0,
  totalDistance: blocks.reduce((sum, b) => sum + b.distance, 0),
  weather: randomFrom(weatherData.conditions),
  resources: { fuel: 100, food: 50, equipment: 100, firstAid: 5 }
};

console.log('═'.repeat(60));
console.log('  BC FORESTRY TRAIL - Automated Playthrough');
console.log('═'.repeat(60));
console.log('');
console.log(`Crew: ${journey.crewName}`);
console.log(`Role: ${journey.role.name}`);
console.log(`Area: ${journey.area.name}`);
console.log(`Total Distance: ${journey.totalDistance} km`);
console.log('');
console.log('Crew Members:');
journey.crew.forEach(m => console.log(`  - ${m.name} (${m.role})`));
console.log('');
console.log('─'.repeat(60));

// Simulate 10 days
const actions = ['normal', 'quick', 'careful', 'rest'];

for (let day = 1; day <= 15 && journey.distanceTraveled < journey.totalDistance; day++) {
  journey.day = day;
  const currentBlock = journey.blocks[journey.currentBlockIndex];

  console.log(`\nDAY ${day} - ${currentBlock.name}`);
  console.log(`  Weather: ${journey.weather.name}`);
  console.log(`  Progress: ${journey.distanceTraveled}/${journey.totalDistance} km`);
  console.log(`  Fuel: ${journey.resources.fuel} | Food: ${journey.resources.food} | Equipment: ${journey.resources.equipment}%`);

  // Check for random event
  for (const event of fieldEventsData) {
    if (Math.random() < (event.probability * 0.5)) { // 50% reduced for faster testing
      console.log(`  ⚠️ EVENT: ${event.title}`);
      const option = randomFrom(event.options);
      console.log(`     Action: ${option.label}`);
      console.log(`     Result: ${option.outcome.substring(0, 80)}...`);

      // Apply effects
      if (option.effects) {
        for (const [key, value] of Object.entries(option.effects)) {
          if (journey.resources[key] !== undefined) {
            journey.resources[key] = Math.max(0, journey.resources[key] + value);
          }
        }
      }
      break; // Only one event per day
    }
  }

  // Choose action (AI-controlled)
  let action;
  if (journey.resources.fuel < 20 || journey.resources.food < 10) {
    action = 'careful';
  } else if (journey.crew.some(m => m.health < 50)) {
    action = 'rest';
  } else {
    action = randomFrom(['normal', 'normal', 'quick', 'careful']);
  }

  let distanceGained = 0;
  let fuelUsed = 0;
  let foodUsed = 0;

  switch (action) {
    case 'normal':
      distanceGained = 15 + Math.floor(Math.random() * 10);
      fuelUsed = 8;
      foodUsed = 3;
      break;
    case 'quick':
      distanceGained = 25 + Math.floor(Math.random() * 10);
      fuelUsed = 15;
      foodUsed = 4;
      break;
    case 'careful':
      distanceGained = 8 + Math.floor(Math.random() * 5);
      fuelUsed = 5;
      foodUsed = 2;
      break;
    case 'rest':
      distanceGained = 0;
      fuelUsed = 0;
      foodUsed = 1;
      journey.crew.forEach(m => {
        m.health = Math.min(100, m.health + 10);
        m.morale = Math.min(100, m.morale + 15);
      });
      break;
  }

  journey.distanceTraveled += distanceGained;
  journey.resources.fuel = Math.max(0, journey.resources.fuel - fuelUsed);
  journey.resources.food = Math.max(0, journey.resources.food - foodUsed);

  console.log(`  Action: Travel ${action} → +${distanceGained} km`);

  // Check block progress
  let blockDistance = 0;
  for (let i = 0; i <= journey.currentBlockIndex; i++) {
    blockDistance += journey.blocks[i].distance;
  }
  if (journey.distanceTraveled >= blockDistance && journey.currentBlockIndex < journey.blocks.length - 1) {
    journey.currentBlockIndex++;
    console.log(`  📍 Reached: ${journey.blocks[journey.currentBlockIndex].name}`);
  }

  // Update weather
  if (Math.random() < 0.3) {
    journey.weather = randomFrom(weatherData.conditions);
  }

  // Check end conditions
  if (journey.resources.fuel <= 0 && journey.resources.food <= 0) {
    console.log('\n💀 GAME OVER: Stranded with no supplies!');
    break;
  }
}

console.log('');
console.log('─'.repeat(60));
console.log('EXPEDITION SUMMARY');
console.log('─'.repeat(60));

const progressPct = Math.round((journey.distanceTraveled / journey.totalDistance) * 100);
if (journey.distanceTraveled >= journey.totalDistance) {
  console.log('🎉 SUCCESS! Expedition completed!');
} else {
  console.log(`Progress: ${journey.distanceTraveled}/${journey.totalDistance} km (${progressPct}%)`);
}

console.log(`Days: ${journey.day}`);
console.log(`Remaining: Fuel ${journey.resources.fuel}, Food ${journey.resources.food}`);
console.log('');
console.log('Crew Status:');
journey.crew.forEach(m => {
  const healthBar = '█'.repeat(Math.round(m.health / 20)) + '░'.repeat(5 - Math.round(m.health / 20));
  console.log(`  ${m.name}: Health ${healthBar} (${m.health}%)`);
});

console.log('\n✅ Test complete!');
