/**
 * Character Pane Frames
 * Draws real box-drawing borders (┌─┤ TITLE ├───┐ / │ … │ / └───┘) around a
 * pane as text nodes, sized to the pane's rendered geometry and kept in sync
 * with a ResizeObserver. The pane keeps no CSS border — the frame IS
 * characters, like a terminal program would draw.
 */

const H = '─';
const V = '│';
const TL = '┌';
const TR = '┐';
const BL = '└';
const BR = '┘';

/**
 * Attach (or retitle) a character frame on an element.
 * The element gets `.tui-frame` (positioning + padding come from SCSS).
 * @param {HTMLElement} el
 * @param {Object} opts
 * @param {string} opts.title - Label embedded in the top border
 * @returns {{ setTitle(t: string): void }|null}
 */
export function attachFrame(el, { title = '' } = {}) {
  if (!el) return null;
  if (el.__tuiFrame) {
    el.__tuiFrame.setTitle(title);
    return el.__tuiFrame;
  }

  el.classList.add('tui-frame');

  const edges = {};
  for (const pos of ['top', 'bottom', 'left', 'right']) {
    const edge = document.createElement('div');
    edge.className = `tui-frame-edge tui-frame-${pos}`;
    edge.setAttribute('aria-hidden', 'true');
    el.appendChild(edge);
    edges[pos] = edge;
  }

  let currentTitle = title;

  function render() {
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (!width || !height) return;

    // Measure the real character cell from a probe span (the edge div itself
    // spans the pane, so its own width says nothing about the glyphs).
    const probe = document.createElement('span');
    probe.style.visibility = 'hidden';
    probe.textContent = H.repeat(10);
    edges.top.textContent = '';
    edges.top.appendChild(probe);
    const charW = probe.getBoundingClientRect().width / 10 || 8;
    probe.remove();
    const lineH = parseFloat(getComputedStyle(edges.left).lineHeight) || 15;

    const cols = Math.max(4, Math.floor(width / charW));
    const rows = Math.max(0, Math.round((height - 2 * lineH) / lineH));

    let top = TL + H.repeat(cols - 2) + TR;
    if (currentTitle) {
      const label = `┤ ${currentTitle} ├`;
      if (label.length <= cols - 4) {
        top = TL + H + label + H.repeat(cols - 3 - label.length) + TR;
      }
    }
    edges.top.textContent = top;
    edges.bottom.textContent = BL + H.repeat(cols - 2) + BR;
    edges.left.textContent = `${V}\n`.repeat(rows);
    edges.right.textContent = `${V}\n`.repeat(rows);
  }

  const observer = new ResizeObserver(() => render());
  observer.observe(el);
  render();

  el.__tuiFrame = {
    setTitle(next) {
      if (next === currentTitle) return;
      currentTitle = next || '';
      render();
    }
  };
  return el.__tuiFrame;
}
