import {Vec2, vsub, vlen, vlen2} from './vec';

function dropWhile<T>(a: T[], f: (t: T) => boolean): T[] {
  return a.slice(a.findIndex(x => !f(x)))
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
function joinNearby(pointLists: Vec2[][], tolerance: number = 0.5): Vec2[][] {
  const tol2 = tolerance * tolerance
  function maybeJoin(a: Vec2[], b: Vec2[]): Vec2[][] {
    if (vlen2(vsub(a[a.length - 1], b[0])) <= tol2)
      return [a.concat(dropWhile(b, v => vlen2(vsub(a[a.length - 1], v)) <= tol2))]
    else
      return [a, b]
  }
  function appendAndJoin(a: Vec2[][], b: Vec2[]): Vec2[][] {
    return a.length === 0
      ? [b]
      : a.slice(0, -1).concat(maybeJoin(a[a.length - 1], b))
  }
  return pointLists.reduce(appendAndJoin, [])
}

function until(a: number, b: number) {
  const r = []
  for (let i = a; i < b; i++) {
    r.push(i)
  }
  return r
}

function minBy<T>(a: T[], f: (t: T) => number) {
  let smallest = a[0]
  let smallestV = f(smallest)
  a.slice(1).forEach(x => {
    const v = f(x)
    if (v < smallestV) {
      smallest = x
      smallestV = v
    }
  })
  return smallest
}

/** Reorder paths greedily, attempting to minimize the amount of pen-up travel time. */
export function optimize(pointLists: Vec2[][]): Vec2[][] {
  if (pointLists.length === 0) return pointLists
  function dist2Between(i: number, j: number): number {
    if (i === j) return 0
    const a = pointLists[(i/2) | 0]
    const b = pointLists[(j/2) | 0]
    const pa = i % 2 === 0 ? a[a.length - 1] : a[0]
    const pb = j % 2 === 0 ? b[0] : b[b.length - 1]
    const dx = pa.x - pb.x
    const dy = pa.y - pb.y
    return dx*dx + dy*dy
  }

  const visited = new Set<number>()
  const sortedPointLists: Vec2[][] = []
  let firstIdx = 0
  visited.add(firstIdx)
  sortedPointLists.push(pointLists[firstIdx])
  while (visited.size < pointLists.length) {
    const nextIdx = minBy(until(0, pointLists.length * 2).filter(i => !visited.has((i / 2) | 0)), x => dist2Between(firstIdx, x))
    visited.add((nextIdx / 2) | 0)
    sortedPointLists.push(
      nextIdx % 2 === 0
        ? pointLists[(nextIdx / 2) | 0]
        : pointLists[(nextIdx / 2) | 0].slice().reverse()
    )
    firstIdx = nextIdx
  }
  return joinNearby(sortedPointLists)
}
