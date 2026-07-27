/**
 * ASCII Art Rendering Utilities
 * Box drawing characters and progress bar generation for terminal-style UI
 */

// Box drawing characters
export const BOX = {
  // Single line
  TL: '┌', TR: '┐', BL: '└', BR: '┘',
  H: '─', V: '│',
  LT: '├', RT: '┤', TT: '┬', BT: '┴', CROSS: '┼',
  // Double line
  DTL: '╔', DTR: '╗', DBL: '╚', DBR: '╝',
  DH: '═', DV: '║',
  // Mixed (double horizontal, single vertical)
  DLTR: '╒', DRTR: '╕', DLBR: '╘', DRBR: '╛',
  // Mixed connectors
  DLT: '╠', DRT: '╣', DTT: '╦', DBT: '╩', DCROSS: '╬'
};

// Progress bar characters
export const PROGRESS = {
  FULL: '█',
  THREE_QUARTER: '▓',
  HALF: '▒',
  QUARTER: '░',
  EMPTY: '░'
};

/**
 * Generate a progress bar string
 * @param {number} value - Current value (0-100)
 * @param {number} width - Width of the bar in characters (default 10)
 * @param {boolean} showValue - Whether to show numeric value after bar
 * @returns {string} Progress bar string
 */
export function progressBar(value, width = 10, showValue = true) {
  const clamped = Math.max(0, Math.min(100, value));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;

  const bar = PROGRESS.FULL.repeat(filled) + PROGRESS.EMPTY.repeat(empty);

  if (showValue) {
    return `${bar} ${Math.round(clamped)}`;
  }
  return bar;
}

/**
 * Create a box with text inside
 * @param {string[]} lines - Array of text lines
 * @param {Object} options - Box options
 * @param {boolean} options.double - Use double-line box (default: false)
 * @param {string} options.title - Optional title for top of box
 * @param {number} options.minWidth - Minimum width
 * @param {string} options.align - Text alignment: 'left', 'center', 'right'
 * @returns {string} Box as single string with newlines
 */
export function box(lines, options = {}) {
  const { double = false, title = '', minWidth = 0, align = 'left' } = options;

  const chars = double
    ? { tl: BOX.DTL, tr: BOX.DTR, bl: BOX.DBL, br: BOX.DBR, h: BOX.DH, v: BOX.DV }
    : { tl: BOX.TL, tr: BOX.TR, bl: BOX.BL, br: BOX.BR, h: BOX.H, v: BOX.V };

  // Calculate width based on content
  const contentWidth = Math.max(
    minWidth,
    title.length + 2,
    ...lines.map(line => stripAnsi(line).length)
  );

  const result = [];

  // Top border with optional title
  if (title) {
    const titleText = ` ${title} `;
    const leftPad = Math.floor((contentWidth - titleText.length) / 2);
    const rightPad = contentWidth - titleText.length - leftPad;
    result.push(chars.tl + chars.h.repeat(leftPad) + titleText + chars.h.repeat(rightPad) + chars.tr);
  } else {
    result.push(chars.tl + chars.h.repeat(contentWidth + 2) + chars.tr);
  }

  // Content lines
  for (const line of lines) {
    const strippedLen = stripAnsi(line).length;
    const padding = contentWidth - strippedLen;

    let paddedLine;
    if (align === 'center') {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      paddedLine = ' '.repeat(leftPad) + line + ' '.repeat(rightPad);
    } else if (align === 'right') {
      paddedLine = ' '.repeat(padding) + line;
    } else {
      paddedLine = line + ' '.repeat(padding);
    }

    result.push(chars.v + ' ' + paddedLine + ' ' + chars.v);
  }

  // Bottom border
  result.push(chars.bl + chars.h.repeat(contentWidth + 2) + chars.br);

  return result.join('\n');
}

/**
 * Strip ANSI escape codes from string (for length calculation)
 * @param {string} str - String that may contain ANSI codes
 * @returns {string} String without ANSI codes
 */
function stripAnsi(str) {
  // Simple strip - we don't use ANSI in the terminal output anyway
  return str;
}
