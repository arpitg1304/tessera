// Geometric utilities for lasso and box selection

/**
 * Convert screen coordinates to data/world coordinates
 * Using deck.gl viewport transformation
 */
export function screenToWorld(
  screenPoint: [number, number],
  viewState: any,
  width: number,
  height: number
): [number, number] {
  // Extract view state parameters
  const { target, zoom } = viewState;
  const scale = Math.pow(2, zoom);

  // Convert screen coords to normalized device coords
  const ndcX = (screenPoint[0] / width) * 2 - 1;
  const ndcY = 1 - (screenPoint[1] / height) * 2;

  // Convert to world coords
  const worldX = target[0] + (ndcX * width) / (2 * scale);
  const worldY = target[1] + (ndcY * height) / (2 * scale);

  return [worldX, worldY];
}

/**
 * Convert world/data coordinates to screen coordinates
 */
export function worldToScreen(
  worldPoint: [number, number],
  viewState: any,
  width: number,
  height: number
): [number, number] {
  const { target, zoom } = viewState;
  const scale = Math.pow(2, zoom);

  // Convert world to NDC
  const ndcX = ((worldPoint[0] - target[0]) * 2 * scale) / width;
  const ndcY = ((worldPoint[1] - target[1]) * 2 * scale) / height;

  // Convert NDC to screen
  const screenX = ((ndcX + 1) / 2) * width;
  const screenY = ((1 - ndcY) / 2) * height;

  return [screenX, screenY];
}

/**
 * Point-in-polygon test using ray-casting algorithm
 * Works for any polygon (convex or concave)
 */
export function isPointInPolygon(
  point: [number, number],
  polygon: [number, number][]
): boolean {
  if (polygon.length < 3) return false;

  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Point-in-box test (axis-aligned bounding box)
 */
export function isPointInBox(
  point: [number, number],
  box: { x1: number; y1: number; x2: number; y2: number }
): boolean {
  const [x, y] = point;
  const minX = Math.min(box.x1, box.x2);
  const maxX = Math.max(box.x1, box.x2);
  const minY = Math.min(box.y1, box.y2);
  const maxY = Math.max(box.y1, box.y2);

  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

/**
 * Simplify a polygon path by removing redundant points
 * Uses Douglas-Peucker algorithm for path simplification
 */
export function simplifyPolygon(
  points: [number, number][],
  tolerance: number = 2
): [number, number][] {
  if (points.length <= 2) return points;

  // Find point with maximum distance from line between first and last
  let maxDistance = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    const left = simplifyPolygon(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPolygon(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  } else {
    return [first, last];
  }
}

/**
 * Calculate perpendicular distance from point to line
 */
function perpendicularDistance(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number]
): number {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    // Line start and end are the same point
    return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
  }

  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const clampedT = Math.max(0, Math.min(1, t));
  const closestX = x1 + clampedT * dx;
  const closestY = y1 + clampedT * dy;

  return Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2);
}
