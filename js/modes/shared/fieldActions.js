/**
 * Shared Field Actions
 * Common field operations used by crew-based modes (recon, silviculture)
 */

import { getCrewDisplayInfo, healCrewMember, removeStatusEffect, applyRandomInjury, crewHasRole } from '../../crew.js';
import { FIELD_RESOURCES } from '../../resources.js';

/**
 * Handle resupply at a trading post
 * @param {Object} ui - UI instance
 * @param {Object} journey - Journey state
 * @param {Object} block - Current block with supply point
 */
export async function handleResupply(ui, journey, block) {
  const cash = journey.resources.budget || 0;
  ui.writeHeader(`RESUPPLY: ${block?.name || 'Supply Point'}`);
  ui.write(`Cash on hand: $${Math.round(cash).toLocaleString()}`);
  ui.write('');

  const clampToMax = (resourceId, value) => {
    const def = FIELD_RESOURCES[resourceId];
    if (!def) return value;
    return Math.max(0, Math.min(def.max ?? value, value));
  };

  const offers = [
    { id: 'fuel_drum', label: 'Fuel Drum', description: '+40 fuel', cost: 180, apply: () => { journey.resources.fuel = clampToMax('fuel', journey.resources.fuel + 40); } },
    { id: 'rations', label: 'Rations Crate', description: '+20 food', cost: 160, apply: () => { journey.resources.food = clampToMax('food', journey.resources.food + 20); } },
    { id: 'first_aid', label: 'First Aid Kit', description: '+1 kit', cost: 120, apply: () => { journey.resources.firstAid = clampToMax('firstAid', journey.resources.firstAid + 1); } },
    { id: 'field_repair', label: 'Field Repair', description: '+15% equipment', cost: 220, apply: () => { journey.resources.equipment = clampToMax('equipment', journey.resources.equipment + 15); } },
    {
      id: 'full_restock',
      label: 'Full Restock',
      description: '+50 fuel, +25 food, +20% equip, +2 kits',
      cost: 650,
      apply: () => {
        journey.resources.fuel = clampToMax('fuel', journey.resources.fuel + 50);
        journey.resources.food = clampToMax('food', journey.resources.food + 25);
        journey.resources.equipment = clampToMax('equipment', journey.resources.equipment + 20);
        journey.resources.firstAid = clampToMax('firstAid', journey.resources.firstAid + 2);
      }
    }
  ];

  while (true) {
    const money = journey.resources.budget || 0;
    const options = [
      ...offers.map(o => ({
        label: `${o.label} ($${o.cost})`,
        description: o.description,
        value: o.id
      })),
      { label: 'Done', description: 'Finish shopping', value: 'done' }
    ];

    const choice = await ui.promptChoice(`Buy supplies (cash: $${Math.round(money).toLocaleString()}):`, options);
    if (choice.value === 'done') break;

    const offer = offers.find(o => o.id === choice.value);
    if (!offer) continue;

    if (money < offer.cost) {
      ui.writeWarning('Not enough cash for that.');
      continue;
    }

    journey.resources.budget = Math.max(0, money - offer.cost);
    offer.apply();
    ui.writePositive(`Purchased ${offer.label}.`);
  }

  ui.write('');
}

/**
 * Handle triage - treating injured crew members
 * @param {Object} ui - UI instance
 * @param {Object} journey - Journey state
 */
export async function handleTriage(ui, journey) {
  if ((journey.resources.firstAid || 0) <= 0) {
    ui.writeWarning('No first aid kits left.');
    return;
  }

  const candidates = journey.crew.filter(m => m.isActive && (m.health < 100 || (m.statusEffects?.length || 0) > 0));
  if (candidates.length === 0) {
    ui.write('Nobody needs treatment today.');
    return;
  }

  const options = candidates.map(m => {
    const info = getCrewDisplayInfo(m);
    const effect = info.effects?.[0]?.name ? `, ${info.effects[0].name}` : '';
    return {
      label: `${info.name} (${info.health}% HP${effect})`,
      description: info.role,
      value: m.id
    };
  });

  const choice = await ui.promptChoice('Treat who?', options);
  const target = journey.crew.find(m => m.id === choice.value);
  if (!target || !target.isActive) return;

  journey.resources.firstAid = Math.max(0, (journey.resources.firstAid || 0) - 1);

  if ((target.statusEffects?.length || 0) > 0) {
    const effectId = target.statusEffects[0].effectId;
    const removed = removeStatusEffect(target, effectId);
    if (removed.message) ui.writePositive(removed.message);
    const healed = healCrewMember(target, 15);
    if (healed.message) ui.writePositive(healed.message);
  } else {
    const healed = healCrewMember(target, 25);
    if (healed.message) ui.writePositive(healed.message);
  }
}

/**
 * Handle maintenance - equipment repairs
 * @param {Object} ui - UI instance
 * @param {Object} journey - Journey state
 */
export async function handleMaintenance(ui, journey) {
  const hasMechanic = crewHasRole(journey.crew, 'mechanic');
  const cash = journey.resources.budget || 0;

  const options = [
    {
      label: hasMechanic ? 'DIY Maintenance' : 'DIY Maintenance (No mechanic)',
      description: '+10% equipment, 10% injury risk',
      value: 'diy'
    },
    {
      label: 'Hire Mobile Mechanic',
      description: '+25% equipment, costs $250',
      value: 'pro'
    }
  ];

  const choice = await ui.promptChoice('How do you handle maintenance?', options);

  if (choice.value === 'pro') {
    if (cash < 250) {
      ui.writeWarning('Not enough cash to hire a mechanic.');
      return;
    }
    journey.resources.budget = Math.max(0, cash - 250);
    journey.resources.equipment = Math.min(100, journey.resources.equipment + 25);
    ui.writePositive('Equipment serviced and patched up.');
    return;
  }

  // DIY maintenance
  const bonus = hasMechanic ? 14 : 10;
  journey.resources.equipment = Math.min(100, journey.resources.equipment + bonus);
  ui.writePositive('You tighten bolts, swap filters, and grease fittings.');

  if (Math.random() < 0.10) {
    const victim = journey.crew.find(m => m.isActive) || null;
    if (victim) {
      const result = applyRandomInjury(victim, 'minor');
      ui.writeWarning(`Accident during maintenance! ${result.message}`);
    }
  }
}

/**
 * Apply forage results - finding supplies in the field
 * @param {Object} ui - UI instance
 * @param {Object} journey - Journey state
 */
export function applyForageResults(ui, journey) {
  const active = journey.crew.filter(m => m.isActive).length || 1;
  const foodFound = Math.round((6 + Math.random() * 10) * (active / 5));
  const fuelFound = Math.random() < 0.25 ? Math.round(5 + Math.random() * 10) : 0;
  const cashFound = Math.random() < 0.15 ? Math.round(120 + Math.random() * 480) : 0;

  journey.resources.food = Math.min(FIELD_RESOURCES.food.max, journey.resources.food + foodFound);
  if (fuelFound > 0) {
    journey.resources.fuel = Math.min(FIELD_RESOURCES.fuel.max, journey.resources.fuel + fuelFound);
  }
  if (cashFound > 0) {
    journey.resources.budget = Math.min(FIELD_RESOURCES.budget.max, journey.resources.budget + cashFound);
  }

  ui.write('');
  ui.writeHeader('FORAGE RESULTS');
  ui.writePositive(`Found food: +${foodFound} rations`);
  if (fuelFound > 0) ui.writePositive(`Recovered fuel: +${fuelFound} gallons`);
  if (cashFound > 0) ui.writePositive(`Sold salvage: +$${cashFound.toLocaleString()}`);

  if (Math.random() < 0.12) {
    const activeCrew = journey.crew.filter(m => m.isActive);
    const victim = activeCrew.length ? activeCrew[Math.floor(Math.random() * activeCrew.length)] : null;
    if (victim) {
      const injury = applyRandomInjury(victim, 'minor');
      ui.writeWarning(`Foraging accident! ${injury.message}`);
    }
  }
}

/**
 * Display crew status summary
 * @param {Object} ui - UI instance
 * @param {Object} journey - Journey state
 */
export function displayCrewStatus(ui, journey) {
  if (!journey.crew || journey.crew.length === 0) {
    return;
  }

  const activeCrew = journey.crew.filter(m => m.isActive);
  const activeCount = activeCrew.length;
  const totalCount = journey.crew.length;
  const avgHealth = activeCount > 0
    ? Math.round(activeCrew.reduce((sum, m) => sum + m.health, 0) / activeCount)
    : 0;
  const injured = activeCrew.filter(m => m.statusEffects?.length > 0).length;

  ui.write(`Crew: ${activeCount}/${totalCount} active | Avg Health: ${avgHealth}%${injured > 0 ? ` | ${injured} injured` : ''}`);
  ui.write('(Press [S] for detailed crew status)');
  ui.write('');
}
