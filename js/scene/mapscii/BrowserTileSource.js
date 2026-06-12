export class BrowserTileSource {
  constructor(features = []) {
    this.features = features;
  }

  getFeatures(viewport) {
    return this.features.filter((feature) => intersects(feature.bounds || boundsForFeature(feature), viewport));
  }
}

function boundsForFeature(feature) {
  const points = feature.points || (feature.point ? [feature.point] : []);
  if (!points.length) {
    return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
  }
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function intersects(left, right) {
  return left.minX <= right.maxX && left.maxX >= right.minX && left.minY <= right.maxY && left.maxY >= right.minY;
}
