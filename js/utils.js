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
    input.focus();

    const listener = (e) => {
      if (e.key === "Enter") {
        const value = input.value;
        input.value = "";
        terminal.textContent += `${value}\n`;
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
  const answer = await ask(`${question}\n${formattedOptions}`, terminal, input);
  const index = parseInt(answer, 10) - 1;

  if (index >= 0 && index < options.length) {
    return index;
  } else {
    // In a real game, you'd want to handle this more gracefully.
    return 0;
  }
}
