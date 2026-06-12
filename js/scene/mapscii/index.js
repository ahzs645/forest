import { BrowserTileSource } from "./BrowserTileSource.js";
import { BrowserMapsciiRenderer } from "./Renderer.js";

export function renderMapsciiFrame(features, options = {}) {
  const tileSource = new BrowserTileSource(features);
  const renderer = new BrowserMapsciiRenderer(tileSource, {
    width: options.width,
    height: options.height,
  });
  return renderer.draw({
    center: options.center,
    zoom: options.zoom,
  });
}
