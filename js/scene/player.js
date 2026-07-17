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
 * Mount the "tap to skip" caption under a live scene. Without it, players sit
 * through every animation because nothing says the input lockout is optional.
 * @param {HTMLElement} terminal
 * @returns {HTMLElement}
 */
function mountSkipHint(terminal) {
  const hint = document.createElement('div');
  hint.className = 'scene-skip-hint scene-keep';
  hint.textContent = '▸ tap or press any key to skip';
  terminal.appendChild(hint);
  terminal.scrollTop = terminal.scrollHeight;
  return hint;
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
 * @returns {Promise<{skipped: boolean, frameIndex: number}>} resolves with how
 *   playback ended: whether the player skipped, and the frame showing at that
 *   moment (interactive scenes like the hunt read the skip frame as input)
 */
export function playFrames(terminal, frames, opts = {}) {
  const { delay = 150, loops = 1, holdLastFrame = true, skippable = true } = opts;
  if (!terminal || !frames?.length) return Promise.resolve({ skipped: false, frameIndex: 0 });

  const canvas = mountCanvas(terminal);
  const finishFrame = frames[frames.length - 1];

  if (prefersReducedMotion() || frames.length === 1) {
    canvas.textContent = finishFrame;
    canvas.classList.remove('scene-keep');
    if (!holdLastFrame) canvas.remove();
    return Promise.resolve({ skipped: false, frameIndex: frames.length - 1 });
  }

  return new Promise((resolve) => {
    let index = 0;
    let loop = 0;
    let timer = null;
    let done = false;
    const skipHint = skippable ? mountSkipHint(terminal) : null;

    // Only a tap/click that actually lands on this animating scene (or its
    // "tap to skip" caption) counts as a skip gesture. Vignettes play
    // non-blocking, beside a decision (see playEventVignette), so real UI —
    // a choice button, a Continue prompt — can be live and interactive at
    // the very same time an animation is still running. Scoping the skip
    // trigger to the scene's own elements, instead of the whole document,
    // means a click anywhere else is never mistaken for a skip and so never
    // arms the swallow-the-next-click guard below against it.
    const isWithinScene = (e) => {
      const target = e.target;
      if (!target) return false;
      return (canvas.isConnected && canvas.contains(target))
        || (skipHint && skipHint.isConnected && skipHint.contains(target));
    };

    const finish = (e) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      if (skipHint) skipHint.remove();
      if (skippable) {
        document.removeEventListener('pointerdown', skipPointer, true);
        document.removeEventListener('keydown', skipKey, true);
      }
      // The skipping gesture must not fall through to UI rendered the moment
      // this promise settles (e.g. the Continue button after a travel beat).
      if (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.type === 'pointerdown') {
          // WebKit synthesizes the tap's click after touchend and hit-tests it
          // against the new DOM — eat it so it can't press a fresh button.
          // `once` limits this to the single click produced by THIS tap; a
          // later, separate click is never touched by it.
          const swallow = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
          document.addEventListener('click', swallow, { capture: true, once: true });
          setTimeout(() => document.removeEventListener('click', swallow, true), 500);
        }
      }
      canvas.textContent = finishFrame;
      canvas.classList.remove('scene-keep');
      if (!holdLastFrame) canvas.remove();
      resolve({ skipped: Boolean(e), frameIndex: index });
    };
    const skipPointer = (e) => {
      if (!isWithinScene(e)) return;
      finish(e);
    };
    const skipKey = (e) => {
      // Digits double as the keyboard accelerator for choice buttons (see
      // js/ui.js promptChoice shortcuts). A choice screen can be showing —
      // and the player pressing 1-9/0 to answer it — while a vignette is
      // still animating behind it; never let the animation eat that key.
      if (/^[0-9]$/.test(e.key)) return;
      finish(e);
    };

    if (skippable) {
      document.addEventListener('pointerdown', skipPointer, true);
      document.addEventListener('keydown', skipKey, true);
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
