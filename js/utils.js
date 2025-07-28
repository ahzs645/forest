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
    terminal.textContent += `\n${question}\n> `;
    // Ensure scrolling and focus happen after DOM update with longer delay
    requestAnimationFrame(() => {
      terminal.scrollTop = terminal.scrollHeight;
      input.focus();
      input.value = ""; // Clear any existing value
    });

    const listener = (e) => {
      if (e.key === "Enter") {
        const value = input.value.trim();
        input.value = "";
        terminal.textContent += `${value}\n`;
        requestAnimationFrame(() => {
          terminal.scrollTop = terminal.scrollHeight;
        });
        input.removeEventListener("keydown", listener);
        resolve(value);
      }
    };

    input.addEventListener("keydown", listener);
  });
}

/**
 * Prompts the user to select from a list of options.
 * @param {string} question The question to ask the user.
 * @param {string[]} options The list of options to choose from.
 * @param {HTMLElement} terminal The terminal element.
 * @param {HTMLInputElement} input The input element.
 * @returns {Promise<number>} A promise that resolves with the index of the selected option.
 */
export async function askChoice(question, options, terminal, input) {
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
