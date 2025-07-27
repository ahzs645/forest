const terminal = document.getElementById('terminal');
const input = document.getElementById('input');

function write(line) {
  terminal.textContent += line + '\n';
  terminal.scrollTop = terminal.scrollHeight;
}

function prompt(line) {
  write(line);
  input.value = '';
  input.focus();
}

const state = {
  company: '',
  region: '',
  fsp: 0,
  consult: false,
  oldGrowth: 0,
  herb: 0,
  fire: 0,
  heritage: 0,
  weather: 0,
  species: '',
  prep: 0,
  training: 0,
};

function choicePrompt(q, options) {
  return q + '\n' + options.map((o, i) => `${i + 1}. ${o}`).join('\n');
}

function makeChoiceStep(question, options, assign) {
  return {
    prompt: () => choicePrompt(question, options),
    process(cmd) {
      const idx = parseInt(cmd, 10) - 1;
      if (idx >= 0 && idx < options.length) {
        state[assign] = assign === 'region' ? ['SBS', 'IDF', 'MS'][idx] : idx;
        return true;
      }
      write(`Please enter 1-${options.length}.`);
      return false;
    },
  };
}

function makeYesNoStep(question, assign) {
  return {
    prompt: () => question + ' (yes/no)',
    process(cmd) {
      if (/^y(es)?/i.test(cmd)) {
        state[assign] = true;
        return true;
      }
      if (/^n(o)?/i.test(cmd)) {
        state[assign] = false;
        return true;
      }
      write('Please answer yes or no.');
      return false;
    },
  };
}

const steps = [
  {
    prompt: () => 'Enter your company name:',
    process(cmd) {
      state.company = cmd.trim() || 'Your Company';
      return true;
    },
  },
  makeChoiceStep('Choose a region:', ['Sub-Boreal Spruce (SBS)', 'Interior Douglas-fir (IDF)', 'Montane Spruce (MS)'], 'region'),
  makeChoiceStep('How detailed will your Forest Stewardship Plan be?', ['Minimal plan', 'Comprehensive ecosystem plan'], 'fsp'),
  makeYesNoStep('Engage in early consultation with affected First Nations?', 'consult'),
  makeChoiceStep('Old-growth management approach?', ['Respect deferral areas', 'Request exemptions'], 'oldGrowth'),
  makeChoiceStep('Vegetation control method?', ['Glyphosate spray', 'Mechanical brushing', 'No control'], 'herb'),
  makeChoiceStep('Wildfire resilience actions?', ['None', 'Fuel management and prescribed fire'], 'fire'),
  makeChoiceStep('Archaeological assessments under the Heritage Act?', ['Minimal survey', 'Full assessment'], 'heritage'),
  makeChoiceStep('Planning for weather delays?', ['Minimal', 'Moderate', 'Thorough'], 'weather'),
  makeChoiceStep('Select species to plant:', ['Spruce', 'Pine', 'Mixed'], 'species'),
  makeChoiceStep('Site preparation method?', ['None', 'Mounding', 'Disc trenching'], 'prep'),
  makeChoiceStep('Training level for planting crews?', ['Basic orientation', 'Comprehensive training'], 'training'),
];

let stepIndex = 0;

function nextPrompt() {
  if (stepIndex < steps.length) {
    prompt(steps[stepIndex].prompt());
  }
}

function handle(cmd) {
  if (stepIndex >= steps.length) return;
  if (steps[stepIndex].process(cmd.trim())) {
    stepIndex += 1;
    if (stepIndex === steps.length) {
      result();
      stepIndex += 1;
    } else {
      nextPrompt();
    }
  }
}

function result() {
  let permitBonus = 0;
  let survivalBonus = 0;
  let reputation = 0.5;

  if (state.fsp === 1) permitBonus += 0.05; else reputation -= 0.1;
  if (state.consult) { reputation += 0.2; permitBonus += 0.1; } else reputation -= 0.2;
  if (state.oldGrowth === 0) { reputation += 0.1; permitBonus += 0.05; } else reputation -= 0.2;
  if (state.herb === 0) { reputation -= 0.1; survivalBonus += 0.15; }
  else if (state.herb === 1) { reputation += 0.05; survivalBonus += 0.1; }
  if (state.fire === 1) { reputation += 0.05; survivalBonus += 0.05; }
  if (state.heritage === 0) { reputation -= 0.05; permitBonus -= 0.1; }
  else { reputation += 0.05; permitBonus += 0.05; }
  survivalBonus += [0, 0.05, 0.1][state.weather];
  survivalBonus += {0:0.05,1:0.03,2:0.04}[state.species];
  if (state.prep === 1) { survivalBonus += 0.05; }
  if (state.prep === 2) { survivalBonus += 0.03; }
  if (state.training === 1) survivalBonus += 0.02;

  const approval = 0.5 + permitBonus + (reputation - 0.5) * 0.5;
  const approved = Math.random() < approval;

  write('Submitting permit application...');
  if (!approved) {
    write('Permit denied. Game over.');
    prompt('');
    return;
  }

  write('Permit approved! Planting 20,000 seedlings.');
  let survival = 0.6 + survivalBonus;
  const weatherEvent = Math.random();
  if (weatherEvent < 0.1) { write('Severe weather ruined planting schedules!'); survival -= 0.3; }
  else if (weatherEvent < 0.3) { write('Bad weather reduced survival rates.'); survival -= 0.1; }
  else { write('Weather was favourable.'); }
  survival = Math.max(0, Math.min(1, survival));
  const survived = Math.round(20000 * survival);
  const speciesName = ['Spruce','Pine','Mixed'][state.species];
  write(`${survived} of 20,000 ${speciesName} seedlings survived.`);
  write('Thanks for playing!');
  prompt('');
}

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const cmd = input.value;
    write('> ' + cmd);
    handle(cmd);
  }
});

write('Welcome to the BC Forestry Simulator');
nextPrompt();
