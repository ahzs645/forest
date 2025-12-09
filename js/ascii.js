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

// Status indicators
export const INDICATORS = {
  HEALTHY: '●',
  WARNING: '◐',
  CRITICAL: '○',
  DEAD: '✕',
  ARROW_RIGHT: '►',
  ARROW_LEFT: '◄',
  ARROW_UP: '▲',
  ARROW_DOWN: '▼',
  CHECK: '✓',
  CROSS: '✗',
  STAR: '★',
  DIAMOND: '◆'
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
 * Generate a labeled progress bar
 * @param {string} label - Label for the bar
 * @param {number} value - Current value (0-100)
 * @param {number} labelWidth - Fixed width for label (right-padded)
 * @param {number} barWidth - Width of progress bar
 * @returns {string} Formatted progress bar with label
 */
export function labeledProgressBar(label, value, labelWidth = 12, barWidth = 10) {
  const paddedLabel = label.padEnd(labelWidth);
  const bar = progressBar(value, barWidth, true);
  return `${paddedLabel}${bar}`;
}

/**
 * Create a horizontal line
 * @param {number} width - Width in characters
 * @param {string} char - Character to use (default: single horizontal)
 * @returns {string} Horizontal line
 */
export function horizontalLine(width, char = BOX.H) {
  return char.repeat(width);
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
 * Create a divider line with optional label
 * @param {number} width - Total width
 * @param {string} label - Optional centered label
 * @param {boolean} double - Use double line
 * @returns {string} Divider line
 */
export function divider(width, label = '', double = false) {
  const char = double ? BOX.DH : BOX.H;

  if (!label) {
    return char.repeat(width);
  }

  const labelText = ` ${label} `;
  const sideWidth = Math.floor((width - labelText.length) / 2);
  const rightWidth = width - labelText.length - sideWidth;

  return char.repeat(sideWidth) + labelText + char.repeat(rightWidth);
}

/**
 * Create a two-column layout
 * @param {string[]} leftLines - Lines for left column
 * @param {string[]} rightLines - Lines for right column
 * @param {number} leftWidth - Width of left column
 * @param {number} gap - Gap between columns
 * @returns {string[]} Combined lines
 */
export function twoColumn(leftLines, rightLines, leftWidth = 35, gap = 3) {
  const maxLines = Math.max(leftLines.length, rightLines.length);
  const result = [];

  for (let i = 0; i < maxLines; i++) {
    const left = (leftLines[i] || '').padEnd(leftWidth);
    const right = rightLines[i] || '';
    result.push(left + ' '.repeat(gap) + right);
  }

  return result;
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

/**
 * Wrap text to fit within a width
 * @param {string} text - Text to wrap
 * @param {number} width - Maximum width
 * @returns {string[]} Array of wrapped lines
 */
export function wrapText(text, width) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Center text within a given width
 * @param {string} text - Text to center
 * @param {number} width - Total width
 * @returns {string} Centered text
 */
export function centerText(text, width) {
  const padding = Math.max(0, width - text.length);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

/**
 * Create a health indicator based on value
 * @param {number} health - Health value 0-100
 * @returns {string} Health indicator character
 */
export function healthIndicator(health) {
  if (health <= 0) return INDICATORS.DEAD;
  if (health < 25) return INDICATORS.CRITICAL;
  if (health < 50) return INDICATORS.WARNING;
  return INDICATORS.HEALTHY;
}

/**
 * Format a status effect tag
 * @param {string} effect - Effect name (e.g., "broken_leg")
 * @returns {string} Formatted tag
 */
export function statusTag(effect) {
  const formatted = effect.replace(/_/g, ' ').toUpperCase();
  return `[${formatted}]`;
}

/**
 * Create a compact resource display
 * @param {Object} resources - Resource object with values
 * @param {Object} labels - Short labels for each resource
 * @returns {string} Single-line resource display
 */
export function compactResources(resources, labels) {
  const parts = [];
  for (const [key, value] of Object.entries(resources)) {
    const label = labels[key] || key.substring(0, 4).toUpperCase();
    parts.push(`${label}: ${Math.round(value)}`);
  }
  return parts.join(' | ');
}

/**
 * Create a journey progress display
 * @param {number} current - Current position
 * @param {number} total - Total journey length
 * @param {number} width - Display width
 * @returns {string} Journey progress visualization
 */
export function journeyProgress(current, total, width = 20) {
  const progress = current / total;
  const position = Math.floor(progress * (width - 1));

  let line = '';
  for (let i = 0; i < width; i++) {
    if (i === position) {
      line += INDICATORS.ARROW_RIGHT;
    } else if (i < position) {
      line += '=';
    } else {
      line += '-';
    }
  }

  return `[${line}]`;
}

/**
 * Format currency
 * @param {number} amount - Dollar amount
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount) {
  return '$' + Math.round(amount).toLocaleString();
}

/**
 * Create a table row
 * @param {string[]} cells - Cell contents
 * @param {number[]} widths - Column widths
 * @param {string} separator - Column separator
 * @returns {string} Formatted table row
 */
export function tableRow(cells, widths, separator = ' | ') {
  return cells.map((cell, i) => {
    const width = widths[i] || 10;
    return String(cell).padEnd(width);
  }).join(separator);
}
