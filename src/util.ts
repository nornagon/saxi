import {PaperSize} from "./paper-size";
import {vadd, Vec2, vlen2, vmul, vsub} from "./vec";

/** Format a smallish duration in 2h30m15s form */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 60 / 60);
  const mins = Math.floor((seconds - hours * 60 * 60) / 60);
  const secs = Math.floor(seconds - hours * 60 * 60 - mins * 60);
  const parts = [
    [hours, "h"],
    [mins, "m"],
    [secs, "s"]
  ];
  return parts.slice(parts.findIndex((x) => x[0] !== 0)).map(([v, u]) => `${v}${u}`).join("");
}

/** Return the top-left and bottom-right corners of the bounding box containing all points in pointLists */
function extent(pointLists: Vec2[][]): [Vec2, Vec2] {
  let maxX = -Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let minY = Infinity;
  for (const pl of pointLists) {
    for (const p of pl) {
      if (p.x > maxX) { maxX = p.x; }
      if (p.y > maxY) { maxY = p.y; }
      if (p.x < minX) { minX = p.x; }
      if (p.y < minY) { minY = p.y; }
    }
  }
  return [{x: minX, y: minY}, {x: maxX, y: maxY}];
}

/**
 * Scale pointLists to fit within the bounding box specified by (targetMin, targetMax).
 *
 * Preserves aspect ratio, scaling as little as possible to completely fit within the box.
 *
 * Also centers the paths within the box.
 */
function scaleToFit(pointLists: Vec2[][], targetMin: Vec2, targetMax: Vec2): Vec2[][] {
  const [min, max] = extent(pointLists);
  const availWidthMm = targetMax.x - targetMin.x;
  const availHeightMm = targetMax.y - targetMin.y;
  const scaleFitX = availWidthMm / (max.x - min.x);
  const scaleFitY = availHeightMm / (max.y - min.y);
  const scale = Math.min(scaleFitX, scaleFitY);
  const targetCenter = vadd(targetMin, vmul(vsub(targetMax, targetMin), 0.5));
  const offset = vsub(targetCenter, vmul(vsub(max, min), scale * 0.5));
  return pointLists.map((pl) => pl.map((p) => vadd(vmul(vsub(p, min), scale), offset)));
}

/** Scale a drawing to fill a piece of paper, with the given size and margins. */
export function scaleToPaper(pointLists: Vec2[][], paperSize: PaperSize, marginMm: number): Vec2[][] {
  return scaleToFit(
    pointLists,
    {x: marginMm, y: marginMm},
    vsub(paperSize.size, {x: marginMm, y: marginMm})
  );
}

/**
 * Liang-Barsky algorithm for computing segment-AABB intersection.
 * https://gist.github.com/ChickenProp/3194723
 */
function liangBarsky(aabb: [Vec2, Vec2], seg: [Vec2, Vec2]): Vec2 | null {
  const [lower, upper] = aabb
  const [a, b] = seg
  const delta = vsub(b, a)
  const p = [-delta.x, delta.x, -delta.y, delta.y]
  const q = [a.x - lower.x, upper.x - a.x, a.y - lower.y, upper.y - a.y]
  let u1 = -Infinity
  let u2 = Infinity

  for (let i = 0; i < 4; i++) {
    if (p[i] == 0) {
      if (q[i] < 0)
        return null
    } else {
      const t = q[i] / p[i]
      if (p[i] < 0 && u1 < t)
        u1 = t
      else if (p[i] > 0 && u2 > t)
        u2 = t
    }
  }

  if (u1 > u2 || u1 > 1 || u1 < 0)
    return null

  return vadd(a, vmul(delta, u1))
}

/**
 * Returns true if aabb contains point (edge-inclusive).
 */
function contains(aabb: [Vec2, Vec2], point: Vec2): boolean {
  const [lower, upper] = aabb
  return point.x >= lower.x && point.x <= upper.x && point.y >= lower.y && point.y <= upper.y
}

/**
 * Returns a segment that is the subset of seg which is completely contained
 * within aabb, or null if seg is outside aabb.
 */
function truncate(aabb: [Vec2, Vec2], seg: [Vec2, Vec2]): [Vec2, Vec2] | null {
  const [a, b] = seg
  const containsA = contains(aabb, a)
  const containsB = contains(aabb, b)
  if (containsA && containsB) return seg
  if (containsA && !containsB) return [seg[0], liangBarsky(aabb, [seg[1], seg[0]])]
  if (!containsA && containsB) return [liangBarsky(aabb, seg), seg[1]]
  const forwards = liangBarsky(aabb, seg)
  const backwards = liangBarsky(aabb, [seg[1], seg[0]])
  return forwards && backwards ? [forwards, backwards] : null
}

/**
 * Given a polyline, returns a list of polylines that form a subset of the
 * input polyline that is completely within aabb.
 */
function cropLineToAabb(pointList: Vec2[], aabb: [Vec2, Vec2]): Vec2[][] {
  const truncatedPointLists: Vec2[][] = []
  let currentPointList: Vec2[] | null = null
  for (let i = 1; i < pointList.length; i++) {
    const [a, b] = [pointList[i-1], pointList[i]]
    const truncated = truncate(aabb, [a, b])
    if (truncated) {
      if (!currentPointList) {
        currentPointList = [truncated[0]]
        truncatedPointLists.push(currentPointList)
      }
      currentPointList.push(truncated[1])
      if (truncated[1] !== b) {
        // the end was truncated, record the end point and end the line
        currentPointList = null
      }
    } else {
      // the segment was entirely outside the aabb, end the line if there was one.
      currentPointList = null
    }
  }
  return truncatedPointLists
}

/**
 * Crops a drawing so it is kept entirely within the given margin.
 */
export function cropToMargins(pointLists: Vec2[][], paperSize: PaperSize, marginMm: number): Vec2[][] {
  const pageAabb: [Vec2, Vec2] = [{x: 0, y: 0}, paperSize.size]
  const margin = {x: marginMm, y: marginMm}
  const insetAabb: [Vec2, Vec2] = [vadd(pageAabb[0], margin), vsub(pageAabb[1], margin)]
  const truncatedPointLists: Vec2[][] = []
  for (const pointList of pointLists) {
    for (const croppedLine of cropLineToAabb(pointList, insetAabb)) {
      truncatedPointLists.push(croppedLine)
    }
  }
  return truncatedPointLists
}

export function dedupPoints(points: Vec2[], epsilon: number): Vec2[] {
  if (epsilon === 0) { return points; }
  const dedupedPoints = [points[0]];
  const epsilon2 = epsilon * epsilon;
  for (const p of points.slice(1)) {
    if (vlen2(vsub(p, dedupedPoints[dedupedPoints.length - 1])) > epsilon2) {
      dedupedPoints.push(p);
    }
  }
  return dedupedPoints;
}
