import { BrailleBuffer } from "./BrailleBuffer.js";

export class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.buffer = new BrailleBuffer(width, height);
  }

  clear() {
    this.buffer.clear();
  }

  frame() {
    return this.buffer.frame();
  }

  point(x, y, radius = 1) {
    const size = Math.max(1, Math.round(radius));
    for (let dy = -size; dy <= size; dy += 1) {
      for (let dx = -size; dx <= size; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) <= size + 0.5) {
          this.buffer.setPixel(x + dx, y + dy);
        }
      }
    }
  }

  line(from, to, width = 1) {
    const points = bresenham(
      Math.round(from.x),
      Math.round(from.y),
      Math.round(to.x),
      Math.round(to.y),
    );

    for (const point of points) {
      this.point(point.x, point.y, width - 1);
    }
  }

  polyline(points, width = 1) {
    for (let idx = 1; idx < points.length; idx += 1) {
      this.line(points[idx - 1], points[idx], width);
    }
  }

  polygon(points) {
    if (!points.length) return;
    const ys = points.map((point) => point.y);
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(...ys)));

    for (let y = minY; y <= maxY; y += 1) {
      const intersections = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
        const a = points[i];
        const b = points[j];
        if ((a.y > y) !== (b.y > y)) {
          intersections.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
        }
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i < intersections.length; i += 2) {
        const start = Math.max(0, Math.floor(intersections[i]));
        const end = Math.min(this.width - 1, Math.ceil(intersections[i + 1] || intersections[i]));
        for (let x = start; x <= end; x += 1) {
          this.buffer.setPixel(x, y);
        }
      }
    }
  }

  text(text, x, y, center = false) {
    this.buffer.writeText(text, x, y, center);
  }
}

function bresenham(x0, y0, x1, y1) {
  const points = [];
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;

  while (true) {
    points.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }

  return points;
}
