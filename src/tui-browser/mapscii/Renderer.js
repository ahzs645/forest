import { Canvas } from "./Canvas.js";

export class BrowserMapsciiRenderer {
  constructor(tileSource, options = {}) {
    this.tileSource = tileSource;
    this.width = options.width || 104;
    this.height = options.height || 72;
  }

  draw({ center = { x: 50, y: 50 }, zoom = 1 } = {}) {
    const canvas = new Canvas(this.width, this.height);
    canvas.clear();

    const viewport = this.viewport(center, zoom);
    const features = this.tileSource.getFeatures(viewport);

    for (const feature of features) {
      this.drawFeature(canvas, feature, viewport);
    }

    return canvas.frame();
  }

  viewport(center, zoom) {
    const safeZoom = Math.max(0.6, Math.min(2.4, Number(zoom) || 1));
    const worldWidth = 100 / safeZoom;
    const worldHeight = 100 / safeZoom;
    return {
      minX: center.x - worldWidth / 2,
      maxX: center.x + worldWidth / 2,
      minY: center.y - worldHeight / 2,
      maxY: center.y + worldHeight / 2,
      zoom: safeZoom,
    };
  }

  project(point, viewport) {
    return {
      x: ((point.x - viewport.minX) / (viewport.maxX - viewport.minX)) * this.width,
      y: ((point.y - viewport.minY) / (viewport.maxY - viewport.minY)) * this.height,
    };
  }

  drawFeature(canvas, feature, viewport) {
    if (feature.type === "polygon") {
      canvas.polygon(feature.points.map((point) => this.project(point, viewport)));
      return;
    }

    if (feature.type === "line") {
      canvas.polyline(
        feature.points.map((point) => this.project(point, viewport)),
        feature.width || 1,
      );
      return;
    }

    if (feature.type === "point") {
      const point = this.project(feature.point, viewport);
      canvas.point(point.x, point.y, feature.radius || 1);
      if (feature.label) {
        canvas.text(feature.label, point.x + 3, point.y - 2, false);
      }
      return;
    }

    if (feature.type === "label") {
      const point = this.project(feature.point, viewport);
      canvas.text(feature.text, point.x, point.y, Boolean(feature.center));
    }
  }
}
