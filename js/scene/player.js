/**
 * Scene Player
 * Plays a frame deck (array of multiline strings) into a <pre> mounted in the
 * terminal. The shared contract across the game: scenes produce string frames
 * (hand-drawn decks from js/animations/, procedural generators like the travel
 * strip, or the mapscii Braille renderer) and this player animates them.
 *
 * Honors prefers-reduced-motion by rendering a single still frame.
 */

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Create the scene element and mount it at the bottom of the terminal.
 * Marked .scene-keep so the terminal's line cap never evicts a live scene.
 * @param {HTMLElement} terminal
 * @returns {HTMLElement}
 */
function mountCanvas(terminal) {
  const pre = document.createElement('pre');
  pre.className = 'term-box ascii-box scene-canvas scene-keep';
  terminal.appendChild(pre);
  terminal.scrollTop = terminal.scrollHeight;
  return pre;
}

/**
 * Play a frame deck and resolve when done (or skipped by tap/keypress).
 * @param {HTMLElement} terminal - The terminal container
 * @param {string[]} frames - Frame deck
 * @param {Object} opts
 * @param {number} opts.delay - ms per frame (default 150)
 * @param {number} opts.loops - times through the deck (default 1)
 * @param {boolean} opts.holdLastFrame - keep the final frame on screen (default true)
 * @param {boolean} opts.skippable - tap/keypress ends playback early (default true)
 * @returns {Promise<void>}
 */
export function playFrames(terminal, frames, opts = {}) {
  const { delay = 150, loops = 1, holdLastFrame = true, skippable = true } = opts;
  if (!terminal || !frames?.length) return Promise.resolve();

  const canvas = mountCanvas(terminal);
  const finishFrame = frames[frames.length - 1];

  if (prefersReducedMotion() || frames.length === 1) {
    canvas.textContent = finishFrame;
    canvas.classList.remove('scene-keep');
    if (!holdLastFrame) canvas.remove();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let index = 0;
    let loop = 0;
    let timer = null;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(timer);
      if (skippable) {
        document.removeEventListener('pointerdown', finish, true);
        document.removeEventListener('keydown', finish, true);
      }
      canvas.textContent = finishFrame;
      canvas.classList.remove('scene-keep');
      if (!holdLastFrame) canvas.remove();
      resolve();
    };

    if (skippable) {
      document.addEventListener('pointerdown', finish, true);
      document.addEventListener('keydown', finish, true);
    }

    canvas.textContent = frames[0];
    timer = setInterval(() => {
      index += 1;
      if (index >= frames.length) {
        index = 0;
        loop += 1;
        if (loop >= loops) {
          finish();
          return;
        }
      }
      canvas.textContent = frames[index];
    }, delay);
  });
}
