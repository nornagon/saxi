import {Vec2, vlen, vlen2, vsub} from "./vec";

function dropWhile<T>(a: T[], f: (t: T) => boolean): T[] {
  return a.slice(a.findIndex((x) => !f(x)));
}

/**
 * Joins adjacent pairs of pointLists where the first ends within tolerance of where the second begins.
 *
 * e.g. with tolerance >= 0.1,
 * {{{ Seq(Seq(Vec2(0, 0), Vec2(10, 0)), Seq(Vec2(10.1, 0), Vec2(20, 0)) }}}
 * becomes
 * {{{ Seq(Seq(Vec2(0, 0), Vec2(20, 0))) }}}
 *
 * @param pointLists List of paths to join
 * @param tolerance When the endpoints of adjacent paths are closer than this, they will be joined into one path.
 * @return The optimized path list.
 */
export function joinNearby(pointLists: Vec2[][], tolerance: number = 0.5): Vec2[][] {
  const tol2 = tolerance * tolerance;
  function maybeJoin(a: Vec2[], b: Vec2[]): Vec2[][] {
    if (vlen2(vsub(a[a.length - 1], b[0])) <= tol2) {
      return [a.concat(dropWhile(b, (v) => vlen2(vsub(a[a.length - 1], v)) <= tol2))];
    } else {
      return [a, b];
    }
  }
  function appendAndJoin(a: Vec2[][], b: Vec2[]): Vec2[][] {
    return a.length === 0
      ? [b]
      : a.slice(0, -1).concat(maybeJoin(a[a.length - 1], b));
  }
  return pointLists.reduce(appendAndJoin, []);
}

function pathLength(pointList: Vec2[]): number {
  if (pointList.length <= 1) { return 0; }
  let length = 0;
  let lastPoint = pointList[0];
  for (let i = 1; i < pointList.length; i++) {
    length += vlen(vsub(lastPoint, pointList[i]));
    lastPoint = pointList[i];
  }
  return length;
}

export function elideShortPaths(pointLists: Vec2[][], minimumPathLength: number): Vec2[][] {
  return pointLists.filter((pl) => pathLength(pl) >= minimumPathLength);
}

/** Reorder paths greedily, attempting to minimize the amount of pen-up travel time. */
export function optimize(pointLists: Vec2[][]): Vec2[][] {
  if (pointLists.length === 0) { return pointLists; }
  function dist2Between(i: number, j: number): number {
    if (i === j) { return 0; }
    const a = pointLists[(i / 2) | 0];
    const b = pointLists[(j / 2) | 0];
    const pa = i % 2 === 0 ? a[a.length - 1] : a[0];
    const pb = j % 2 === 0 ? b[0] : b[b.length - 1];
    const dx = pa.x - pb.x;
    const dy = pa.y - pb.y;
    return dx * dx + dy * dy;
  }

  const unvisited = new Set<number>();
  for (let i = 0; i < pointLists.length; i++) { unvisited.add(i); }
  const sortedPointLists: Vec2[][] = [];
  let firstIdx = 0;
  unvisited.delete(firstIdx);
  sortedPointLists.push(pointLists[firstIdx]);
  while (unvisited.size > 0) {
    let nextIdx = null;
    let minD = Infinity;
    for (const i of unvisited) {
      // if j == 0, the path is traversed "forwards" (i.e. in the direction listed in the input)
      // if j == 1, the path is traversed "reversed" (i.e. the opposite direction to the input)
      for (let j = 0; j < 2; j++) {
        const d = dist2Between(firstIdx, i * 2 + j);
        if (d < minD) {
          minD = d;
          nextIdx = i * 2 + j;
        }
      }
    }

    unvisited.delete((nextIdx / 2) | 0);
    sortedPointLists.push(
      nextIdx % 2 === 0
        ? pointLists[(nextIdx / 2) | 0]
        : pointLists[(nextIdx / 2) | 0].slice().reverse()
    );
    firstIdx = nextIdx;
  }
  return sortedPointLists;
}
