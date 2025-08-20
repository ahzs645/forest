/**
 * Utility functions for the Forestry Trail game.
 */

export function formatCurrency(number) {
  const safeNum = safeNumber(number);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(safeNum);
}

/**
 * Ensures a number is finite and not NaN
 * @param {number} n - The number to check
 * @param {number} defaultValue - Default value if not finite (default: 0)
 * @returns {number} A finite number
 */
export function safeNumber(n, defaultValue = 0) {
  if (typeof n !== 'number' || !isFinite(n)) {
    return defaultValue;
  }
  return n;
}

/**
 * Safely adds to budget with validation
 * @param {GameState} state - The game state
 * @param {number} amount - Amount to add (can be negative)
 * @param {Function} write - Write function for warnings
 * @param {string} reason - Reason for budget change
 */
export function safeAddBudget(state, amount, write, reason = '') {
  const safeAmount = safeNumber(amount, 0);
  const previousBudget = safeNumber(state.budget, 0);
  
  if (amount !== safeAmount) {
    write(`⚠️ Warning: Invalid budget adjustment detected (${reason}). Using safe value.`);
  }
  
  state.budget = previousBudget + safeAmount;
  
  // Ensure budget remains finite
  if (!isFinite(state.budget)) {
    state.budget = previousBudget;
    write(`⚠️ Critical: Budget calculation error prevented. Budget remains at ${formatCurrency(state.budget)}`);
  }
}

/**
 * Calculates average revenue per cubic meter
 * @param {GameState} state - The game state
 * @returns {number} Average revenue per m³
 */
export function calculateAverageRevenue(state) {
  if (!state.total_revenue || !state.harvest_volume || state.harvest_volume === 0) {
    // Fallback to default lumber price
    return state.log_prices?.lumber || 85;
  }
  return state.total_revenue / state.harvest_volume;
}

export function formatVolume(number) {
  return `${new Intl.NumberFormat().format(number)} m³`;
}

export function printSectionHeader(title, year, write) {
  write(`\n--- ${title} (${year}) ---`);
}

export function printSubsection(title, write) {
  write(`\n--- ${title} ---`);
}

/**
 * A simple promise-based input prompt.
 * @param {string} question The question to ask the user.
 * @param {HTMLElement} terminal The terminal element.
 * @param {HTMLInputElement} input The input element.
 * @returns {Promise<string>} A promise that resolves with the user's input.
 */
export function ask(question, terminal, input) {
  return new Promise((resolve) => {
    // CLI interactive mode (Node)
    try {
      if (typeof process !== 'undefined' && globalThis.CLI_INTERACTIVE) {
        (async () => {
          const { createInterface } = await import('node:readline/promises');
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const ans = await rl.question(`\n${question}\n> `);
          await rl.close();
          try { terminal.textContent += `\n${question}\n> ${ans}\n`; } catch {}
          resolve(ans.trim());
        })();
        return; // handled
      }
    } catch {}
    const auto = (typeof window !== 'undefined' && window.AUTO_PLAY && window.AUTO_PLAY.enabled) ? window.AUTO_PLAY : null;
    if (auto) {
      // Auto-mode: decide an answer
      let answer = '';
      if (/name your forestry company/i.test(question)) {
        answer = auto.nextText?.() || `AutoCo ${Math.floor(Math.random() * 1000)}`;
      } else if (/press\s+enter\s+to\s+continue/i.test(question)) {
        answer = '';
      } else {
        answer = auto.nextText?.() || '';
      }
      terminal.textContent += `\n${question}\n> ${answer}\n`;
      requestAnimationFrame(() => { terminal.scrollTop = terminal.scrollHeight; });
      // Ensure clean UI state after auto-play
      const buttonContainer = document.getElementById('button-container');
      const input = document.getElementById('input');
      try { 
        if (buttonContainer) buttonContainer.style.display = 'none'; 
        if (input) input.style.display = 'block';
        document.body.classList.remove('choices-open');
      } catch {}
      return resolve(answer);
    }
    // Make sure text input is visible and button container is hidden
    const buttonContainer = (typeof document !== 'undefined') ? document.getElementById('button-container') : { style: { display: 'none' }, innerHTML: '', appendChild(){} };
    const isMobile = (typeof window !== 'undefined') && (window.innerWidth <= 768 || 'ontouchstart' in window);

    // Special mobile-friendly continue when prompt says Press Enter
    if (isMobile && /press\s+enter\s+to\s+continue/i.test(question)) {
      // Show the question in terminal
      terminal.textContent += `\n${question}\n`;
      // Hide input, show a single Continue button
      try { input.style.display = 'none'; } catch {}
      try { buttonContainer.style.display = 'flex'; } catch {}
      try { buttonContainer.innerHTML = ''; } catch {}
      try { document.body.classList.add('choices-open'); } catch {}

      const button = document.createElement('button');
      button.className = 'choice-button';
      button.textContent = 'Continue';
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        button.disabled = true;
        terminal.textContent += `> Continue\n\n`;
        terminal.textContent += `------------------------------------------------------------\n\n`;
        try { buttonContainer.style.display = 'none'; } catch {}
        try { input.style.display = 'block'; } catch {}
        try { document.body.classList.remove('choices-open'); } catch {}
        requestAnimationFrame(() => { terminal.scrollTop = terminal.scrollHeight; });
        resolve('');
      };
      button.onclick = finish;
      button.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          finish();
        }
      };
      try { buttonContainer.appendChild(button); } catch {}
      requestAnimationFrame(() => {
        terminal.scrollTop = terminal.scrollHeight;
        button.focus();
      });
      return; // handled
    }

    // Default: text input flow
    try { buttonContainer.style.display = 'none'; } catch {}
    try { input.style.display = 'block'; } catch {}
    
    terminal.textContent += `\n${question}\n> `;
    // Ensure scrolling and focus happen after DOM update with longer delay
    requestAnimationFrame(() => {
      terminal.scrollTop = terminal.scrollHeight;
      input.focus();
      input.value = ""; // Clear any existing value
      // Help mobile keep input visible when keyboard opens
      try { input.scrollIntoView({ block: 'nearest' }); } catch {}
    });

    const listener = (e) => {
      if (e.key === "Enter") {
        const value = input.value.trim();
        input.value = "";
        terminal.textContent += `${value}\n`;
        requestAnimationFrame(() => {
          terminal.scrollTop = terminal.scrollHeight;
          try { input.scrollIntoView({ block: 'nearest' }); } catch {}
        });
        input.removeEventListener("keydown", listener);
        resolve(value);
      }
    };

    input.addEventListener("keydown", listener);
    
    // Add timeout protection to prevent freezing
    const timeout = setTimeout(() => {
      input.removeEventListener("keydown", listener);
      resolve(""); // Default empty response on timeout
    }, 30000); // 30 second timeout
    
    // Clear timeout when we get a response
    const originalResolve = resolve;
    resolve = (value) => {
      clearTimeout(timeout);
      originalResolve(value);
    };
  });
}

/**
 * Prompts the user to select from a list of options using buttons (mobile-friendly).
 * @param {string} question The question to ask the user.
 * @param {string[]} options The list of options to choose from.
 * @param {HTMLElement} terminal The terminal element.
 * @param {HTMLInputElement} input The input element.
 * @returns {Promise<number>} A promise that resolves with the index of the selected option.
 */
export function askChoiceWithButtons(question, options, terminal, input) {
  return new Promise((resolve) => {
    const auto = (typeof window !== 'undefined' && window.AUTO_PLAY && window.AUTO_PLAY.enabled) ? window.AUTO_PLAY : null;
    if (auto) {
      const idx = auto.nextIndex?.(question, options) ?? Math.floor(Math.random() * options.length);
      terminal.textContent += `\n${question}\n> ${idx + 1}. ${options[idx]}\n\n------------------------------------------------------------\n\n`;
      requestAnimationFrame(() => { terminal.scrollTop = terminal.scrollHeight; });
      // Ensure clean UI state after auto-play choice
      const buttonContainer = document.getElementById('button-container');
      const input = document.getElementById('input');
      try { 
        if (buttonContainer) buttonContainer.style.display = 'none'; 
        if (input) input.style.display = 'block';
        document.body.classList.remove('choices-open');
      } catch {}
      return resolve(idx);
    }
    const buttonContainer = document.getElementById('button-container');
    
    // Show the question in terminal
    terminal.textContent += `\n${question}\n`;
    
    // Hide text input and show button container
    input.style.display = 'none';
    buttonContainer.style.display = 'flex';
    buttonContainer.innerHTML = '';
    // Mark that choices are open to adjust layout spacing
    try { document.body.classList.add('choices-open'); } catch {}

    const questionHeader = document.createElement('div');
    questionHeader.className = 'button-question';
    questionHeader.textContent = question;
    buttonContainer.appendChild(questionHeader);
    
    let choiceCompleted = false;
    const handleChoice = (index) => {
      if (choiceCompleted) return;
      choiceCompleted = true;
      
      // Show the user's choice in terminal
      terminal.textContent += `> ${index + 1}. ${options[index]}\n`;
      // Visual separator to mark a new screen/phase
      terminal.textContent += `\n------------------------------------------------------------\n\n`;
      
      // Hide buttons and show text input again
      buttonContainer.style.display = 'none';
      input.style.display = 'block';
      try { document.body.classList.remove('choices-open'); } catch {}
      
      // Remove keyboard listeners
      document.removeEventListener('keydown', keyHandler);
      
      // Scroll terminal
      requestAnimationFrame(() => {
        terminal.scrollTop = terminal.scrollHeight;
        input.focus();
      });
      
      resolve(index);
    };
    
    // Add timeout protection for choice buttons
    const choiceTimeout = setTimeout(() => {
      if (!choiceCompleted) {
        handleChoice(0); // Default to first option on timeout
      }
    }, 45000); // 45 second timeout for choices
    
    // Override resolve to clear timeout
    const originalChoiceResolve = resolve;
    resolve = (value) => {
      clearTimeout(choiceTimeout);
      originalChoiceResolve(value);
    };
    
    // Keyboard navigation handler
    const keyHandler = (e) => {
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (index >= 0 && index < options.length) {
          e.preventDefault();
          handleChoice(index);
        }
      } else if (e.key === 'Enter') {
        const focusedButton = document.activeElement;
        if (focusedButton && focusedButton.classList.contains('choice-button')) {
          e.preventDefault();
          focusedButton.click();
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const buttons = [...buttonContainer.querySelectorAll('.choice-button')];
        const currentIndex = buttons.indexOf(document.activeElement);
        
        if (e.key === 'ArrowDown') {
          const nextIndex = (currentIndex + 1) % buttons.length;
          buttons[nextIndex].focus();
        } else {
          const prevIndex = (currentIndex - 1 + buttons.length) % buttons.length;
          buttons[prevIndex].focus();
        }
      }
    };
    
    // Create buttons for each option
    options.forEach((option, index) => {
      const button = document.createElement('button');
      button.className = 'choice-button';
      button.textContent = `${index + 1}. ${option}`;
      button.onclick = () => handleChoice(index);
      button.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleChoice(index);
        }
      };
      
      buttonContainer.appendChild(button);
    });
    
    // Add keyboard listener
    document.addEventListener('keydown', keyHandler);
    
    // Scroll terminal and focus first button
    requestAnimationFrame(() => {
      terminal.scrollTop = terminal.scrollHeight;
      const firstButton = buttonContainer.querySelector('.choice-button');
      if (firstButton) {
        firstButton.focus();
      }
    });
  });
}

/**
 * Prompts the user to select from a list of options (fallback to text input).
 * @param {string} question The question to ask the user.
 * @param {string[]} options The list of options to choose from.
 * @param {HTMLElement} terminal The terminal element.
 * @param {HTMLInputElement} input The input element.
 * @returns {Promise<number>} A promise that resolves with the index of the selected option.
 */
export async function askChoice(question, options, terminal, input) {
  // CLI interactive mode
  try {
    if (typeof process !== 'undefined' && globalThis.CLI_INTERACTIVE) {
      const { createInterface } = await import('node:readline/promises');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const formatted = options.map((o, i) => `${i + 1}. ${o}`).join("\n");
      while (true) {
        const ans = await rl.question(`\n${question}\n${formatted}\n> `);
        const idx = parseInt(ans, 10) - 1;
        if (idx >= 0 && idx < options.length) {
          try {
            terminal.textContent += `\n${question}\n  -> ${options[idx]}\n\n------------------------------------------------------------\n\n`;
          } catch {}
          await rl.close();
          return idx;
        }
        console.log(`Please enter a number between 1 and ${options.length}.`);
      }
    }
  } catch {}

  // Special case: if there's only one option or it's a "Press Enter" type prompt, use text input
  if (options.length === 1 || question.toLowerCase().includes('press enter')) {
    const formattedOptions = options
      .map((o, i) => `${i + 1}. ${o}`)
      .join("\n");
    
    while (true) {
      const answer = await ask(`${question}\n${formattedOptions}`, terminal, input);
      const index = parseInt(answer, 10) - 1;

      if (index >= 0 && index < options.length) {
        return index;
      } else {
        terminal.textContent += `Invalid choice. Please enter a number between 1 and ${options.length}.\n`;
        setTimeout(() => {
          terminal.scrollTop = terminal.scrollHeight;
        }, 0);
      }
    }
  }
  
  // Use buttons for multiple choice questions on mobile/touch devices
  const isMobile = (typeof window !== 'undefined') && (window.innerWidth <= 768 || 'ontouchstart' in window);
  const auto = (typeof window !== 'undefined' && window.AUTO_PLAY && window.AUTO_PLAY.enabled) ? window.AUTO_PLAY : null;
  if (auto) {
    const idx = auto.nextIndex?.(question, options) ?? Math.floor(Math.random() * options.length);
    terminal.textContent += `\n${question}\n  -> ${options[idx]}\n\n------------------------------------------------------------\n\n`;
    requestAnimationFrame(() => { terminal.scrollTop = terminal.scrollHeight; });
    return idx;
  }
  
  if (isMobile && options.length > 1) {
    return askChoiceWithButtons(question, options, terminal, input);
  }
  
  // Fallback to text input for desktop
  const formattedOptions = options
    .map((o, i) => `${i + 1}. ${o}`)
    .join("\n");
  
  while (true) {
    const answer = await ask(`${question}\n${formattedOptions}`, terminal, input);
    const index = parseInt(answer, 10) - 1;

    if (index >= 0 && index < options.length) {
      // Echo the selected option for readability
      terminal.textContent += `  -> ${options[index]}\n`;
      // Visual separator to mark a new screen/phase
      terminal.textContent += `\n------------------------------------------------------------\n\n`;
      setTimeout(() => { terminal.scrollTop = terminal.scrollHeight; }, 0);
      return index;
    } else {
      terminal.textContent += `Invalid choice. Please enter a number between 1 and ${options.length}.\n`;
      // Re-scroll after error message
      setTimeout(() => {
        terminal.scrollTop = terminal.scrollHeight;
      }, 0);
    }
  }
}

/**
 * Resets the UI to a clean state, ensuring input is visible and buttons are hidden
 */
export function resetUIState() {
  try {
    const buttonContainer = document.getElementById('button-container');
    const input = document.getElementById('input');
    
    if (buttonContainer) {
      buttonContainer.style.display = 'none';
      buttonContainer.innerHTML = '';
    }
    if (input) {
      input.style.display = 'block';
      input.value = '';
      input.placeholder = 'Enter command...';
    }
    document.body.classList.remove('choices-open');
    
    // Focus the input if it's visible
    requestAnimationFrame(() => {
      if (input && input.style.display !== 'none') {
        input.focus();
      }
    });
  } catch (e) {
    console.warn('Could not reset UI state:', e);
  }
}
