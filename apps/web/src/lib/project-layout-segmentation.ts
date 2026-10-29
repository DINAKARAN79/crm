export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface DetectedGreenRegion {
  id: string;
  points: NormalizedPoint[];
  area: number;
}

export interface DrawingBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PixelPoint {
  x: number;
  y: number;
}

function isGreenPixel(data: Uint8ClampedArray, index: number): boolean {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const alpha = data[index + 3];
  return alpha >= 32 && green >= 45 && green - red >= 20 && green - blue >= 14 &&
    green >= red * 1.2 && green >= blue * 1.1;
}

function pointKey(point: PixelPoint): string {
  return `${point.x},${point.y}`;
}

export function clientToNormalizedPoint(
  clientX: number,
  clientY: number,
  bounds: DrawingBounds,
): NormalizedPoint {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 };
  return {
    x: Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height)),
  };
}

function distanceToSegment(point: PixelPoint, start: PixelPoint, end: PixelPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}

function simplifyPath(points: PixelPoint[], tolerance: number): PixelPoint[] {
  if (points.length <= 3) return points;
  let maxDistance = tolerance;
  let splitIndex = -1;
  const start = points[0];
  const end = points[points.length - 1];
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(points[index], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }
  if (splitIndex === -1) return [start, end];
  const first = simplifyPath(points.slice(0, splitIndex + 1), tolerance);
  const second = simplifyPath(points.slice(splitIndex), tolerance);
  return [...first.slice(0, -1), ...second];
}

function simplifyClosedContour(points: PixelPoint[], tolerance: number): PixelPoint[] {
  const openContour = points.length > 1 &&
    points[0].x === points[points.length - 1].x &&
    points[0].y === points[points.length - 1].y
    ? points.slice(0, -1)
    : points;
  const contour = openContour.filter((point, index) => {
    const before = openContour[(index + openContour.length - 1) % openContour.length];
    const after = openContour[(index + 1) % openContour.length];
    return (point.x - before.x) * (after.y - point.y) !== (point.y - before.y) * (after.x - point.x);
  });
  if (contour.length < 4) return contour;

  let farthestIndex = 1;
  let farthestDistance = 0;
  for (let index = 1; index < contour.length; index += 1) {
    const distance = Math.hypot(contour[index].x - contour[0].x, contour[index].y - contour[0].y);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }
  const firstArc = simplifyPath(contour.slice(0, farthestIndex + 1), tolerance);
  const secondArc = simplifyPath([...contour.slice(farthestIndex), contour[0]], tolerance);
  return [...firstArc.slice(0, -1), ...secondArc.slice(0, -1)];
}

function traceOuterContour(mask: Uint8Array, width: number, height: number, component: number[]): PixelPoint[] {
  const edges = new Map<string, PixelPoint[]>();
  const addEdge = (start: PixelPoint, end: PixelPoint) => {
    const key = pointKey(start);
    const ends = edges.get(key) || [];
    ends.push(end);
    edges.set(key, ends);
  };
  for (const pixelIndex of component) {
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (y === 0 || mask[pixelIndex - width] === 0) addEdge({ x, y }, { x: x + 1, y });
    if (x === width - 1 || mask[pixelIndex + 1] === 0) addEdge({ x: x + 1, y }, { x: x + 1, y: y + 1 });
    if (y === height - 1 || mask[pixelIndex + width] === 0) addEdge({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
    if (x === 0 || mask[pixelIndex - 1] === 0) addEdge({ x, y: y + 1 }, { x, y });
  }

  const firstEntry = edges.entries().next().value as [string, PixelPoint[]] | undefined;
  if (!firstEntry) return [];
  const start = firstEntry[0].split(",").map(Number);
  const contour: PixelPoint[] = [{ x: start[0], y: start[1] }];
  let key = firstEntry[0];
  let previousDirection = 0;
  const edgeCount = [...edges.values()].reduce((total, ends) => total + ends.length, 0);
  for (let step = 0; step <= edgeCount; step += 1) {
    const candidates = edges.get(key);
    if (!candidates?.length) break;
    const previous = contour[contour.length - 1];
    const next = candidates
      .map((candidate) => ({
        candidate,
        direction: (candidate.x > previous.x ? 0 : candidate.y > previous.y ? 1 : candidate.x < previous.x ? 2 : 3),
      }))
      .sort((left, right) => {
        const leftTurn = (left.direction - previousDirection + 4) % 4;
        const rightTurn = (right.direction - previousDirection + 4) % 4;
        return leftTurn - rightTurn;
      })[0]?.candidate;
    if (!next) break;
    contour.push(next);
    previousDirection = next.x > previous.x ? 0 : next.y > previous.y ? 1 : next.x < previous.x ? 2 : 3;
    key = pointKey(next);
    if (key === firstEntry[0]) break;
  }
  return contour;
}

export function detectGreenRegions(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  minArea = 64,
): DetectedGreenRegion[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return [];
  if (rgba.length !== width * height * 4) throw new Error("Image pixel data does not match its dimensions");

  const pixelCount = width * height;
  const mask = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    if (isGreenPixel(rgba, index * 4)) mask[index] = 1;
  }

  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const regions: DetectedGreenRegion[] = [];
  const minimumPixels = Math.max(1, Math.floor(minArea));
  for (let seed = 0; seed < pixelCount; seed += 1) {
    if (!mask[seed] || visited[seed]) continue;
    let head = 0;
    let tail = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    queue[tail++] = seed;
    visited[seed] = 1;
    while (head < tail) {
      const current = queue[head++];
      const x = current % width;
      const y = Math.floor(current / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        current >= width ? current - width : -1,
        current + width < pixelCount ? current + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    if (tail < minimumPixels) continue;
    if (maxX - minX < 3 || maxY - minY < 3) continue;

    const contour = traceOuterContour(mask, width, height, Array.from(queue.subarray(0, tail)));
    let tolerance = Math.max(0.75, Math.min(width, height) * 0.0015);
    let simplified = simplifyClosedContour(contour, tolerance);
    while (simplified.length > 250) {
      tolerance *= 1.5;
      simplified = simplifyClosedContour(contour, tolerance);
    }
    if (simplified.length < 3) continue;

    regions.push({
      id: `green-region-${seed}`,
      points: simplified.map((point) => ({ x: point.x / width, y: point.y / height })),
      area: tail / pixelCount,
    });
  }
  return regions;
}
