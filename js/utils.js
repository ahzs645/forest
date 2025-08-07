/**
 * Utility functions for the Forestry Trail game.
 */

export function formatCurrency(number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(number);
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
    // Make sure text input is visible and button container is hidden
    const buttonContainer = document.getElementById('button-container');
    buttonContainer.style.display = 'none';
    input.style.display = 'block';
    
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
    const buttonContainer = document.getElementById('button-container');
    
    // Show the question in terminal
    terminal.textContent += `\n${question}\n`;
    
    // Hide text input and show button container
    input.style.display = 'none';
    buttonContainer.style.display = 'flex';
    buttonContainer.innerHTML = '';

    const questionHeader = document.createElement('div');
    questionHeader.className = 'button-question';
    questionHeader.textContent = question;
    buttonContainer.appendChild(questionHeader);
    
    const handleChoice = (index) => {
      // Show the user's choice in terminal
      terminal.textContent += `> ${index + 1}\n`;
      
      // Hide buttons and show text input again
      buttonContainer.style.display = 'none';
      input.style.display = 'block';
      
      // Remove keyboard listeners
      document.removeEventListener('keydown', keyHandler);
      
      // Scroll terminal
      requestAnimationFrame(() => {
        terminal.scrollTop = terminal.scrollHeight;
        input.focus();
      });
      
      resolve(index);
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
  const isMobile = window.innerWidth <= 768 || 'ontouchstart' in window;
  
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
