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
