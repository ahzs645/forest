class Terminal {
  constructor(termEl, inputEl) {
    this.term = termEl;
    this.input = inputEl;
  }
  write(text) {
    this.term.textContent += text + '\n';
    this.term.scrollTop = this.term.scrollHeight;
  }
  prompt(text) {
    this.write(text);
    this.input.value = '';
    this.input.focus();
  }
  clear() {
    this.term.textContent = '';
  }
  transition(callback) {
    this.term.classList.add('swipe');
    setTimeout(() => {
      this.clear();
      this.term.classList.remove('swipe');
      if (callback) callback();
    }, 500);
  }
}

const FOREST_ART = `
       /\\         /\\
      /  \\  /\\  /  \\
  /\\/____\\/  \\/____\\/\\
`;

class TrailDemoGame {
  constructor(terminal) {
    this.t = terminal;
    this.step = 0;
    this.state = {
      name: '',
      skill: 3,
    };
    this.steps = [
      {
        prompt: () => 'What is your name, forester?',
        process: (cmd) => { this.state.name = cmd.trim() || 'Forester'; return true; },
      },
      {
        prompt: () => 'Choose shooting skill (1-5, 1=Ace):',
        process: (cmd) => {
          const n = parseInt(cmd, 10);
          if (n >= 1 && n <= 5) { this.state.skill = n; return true; }
          this.t.write('Enter 1-5.');
          return false;
        },
      },
    ];
  }

  start() {
    this.t.write(FOREST_ART);
    this.t.write('Welcome to the Forestry Trail!');
    this.next();
  }

  next() {
    if (this.step < this.steps.length) {
      this.t.prompt(this.steps[this.step].prompt());
    } else {
      this.t.write(`Good luck, ${this.state.name}!`);
      this.t.prompt('');
    }
  }

  handle(cmd) {
    if (this.step >= this.steps.length) return;
    if (this.steps[this.step].process(cmd)) {
      this.step += 1;
      this.t.transition(() => this.next());
    }
  }
}

const termEl = document.getElementById('terminal');
const inputEl = document.getElementById('input');
const term = new Terminal(termEl, inputEl);
const game = new TrailDemoGame(term);

game.start();

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const cmd = inputEl.value;
    term.write('> ' + cmd);
    game.handle(cmd);
  }
});
