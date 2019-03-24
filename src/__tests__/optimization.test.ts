import {joinNearby, elideShortPaths, optimize} from '../optimization';

describe("joinNearby", () => {
  it("can handle an empty input", () => {
    expect(joinNearby([])).toEqual([])
  })

  it("can handle a point", () => {
    expect(joinNearby([[{x:0,y:0}]])).toEqual([[{x:0,y:0}]])
  })

  it("can handle a single line", () => {
    expect(joinNearby([[{x:0,y:0},{x:1,y:0}]])).toEqual([[{x:0,y:0},{x:1,y:0}]])
  })

  it("doesn't join far-apart lines", () => {
    expect(joinNearby([
      [{x:0,y:0},{x:1,y:0}],
      [{x:0,y:10},{x:1,y:10}]
    ], 0.5)).toEqual([
      [{x:0,y:0},{x:1,y:0}],
      [{x:0,y:10},{x:1,y:10}]
    ])
  })

  it("joins two lines that start & end on the same point", () => {
    expect(joinNearby([
      [{x:0,y:0},{x:1,y:0}],
      [{x:1,y:0},{x:2,y:0}]
    ], 0.5)).toEqual([
      [{x:0,y:0},{x:1,y:0},{x:2,y:0}],
    ])
  })

  it("joins two lines that are separated by less than the tolerance", () => {
    expect(joinNearby([
      [{x:0,y:0},{x:1,y:0}],
      [{x:1.1,y:0},{x:2,y:0}]
    ], 0.5)).toEqual([
      [{x:0,y:0},{x:1,y:0},{x:2,y:0}],
    ])
  })
})

describe("elideShortPaths", () => {
  it("can handle an empty input", () => {
    expect(elideShortPaths([], 1)).toEqual([])
  })

  it("elides a point", () => {
    expect(elideShortPaths([[{x:0,y:0}]], 1)).toEqual([])
  })

  it("does not elide a single long line", () => {
    expect(elideShortPaths([[{x:0,y:0},{x:10,y:0}]], 1)).toEqual([[{x:0,y:0},{x:10,y:0}]])
  })

  it("elides a short line", () => {
    expect(elideShortPaths([[{x:0,y:0},{x:0,y:0}]], 1)).toEqual([])
  })

  it("keeps a long line, elides a short one", () => {
    expect(elideShortPaths([[{x:0,y:0},{x:10,y:0}], [{x:0,y:0}]], 1)).toEqual([[{x:0,y:0},{x:10,y:0}]])
  })

  it("counts the full length of a line", () => {
    const lines = [
      [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}]
    ]
    expect(elideShortPaths(lines, 1.5)).toEqual(lines)
  })
})

describe("optimize", () => {
  it("can handle an empty input", () => {
    expect(optimize([])).toEqual([])
  })

  it("can handle a point", () => {
    expect(optimize([[{x:0,y:0}]])).toEqual([[{x:0,y:0}]])
  })

  it("can handle a single line", () => {
    expect(optimize([[{x:0,y:0},{x:1,y:0}]])).toEqual([[{x:0,y:0},{x:1,y:0}]])
  })

  it("reverses a line", () => {
    expect(optimize([
      [{x:0,y:0}, {x:10,y:0}],
      [{x:0,y:1}, {x:10,y:1}],
    ])).toEqual([
      [{x:0,y:0}, {x:10,y:0}],
      [{x:10,y:1}, {x:0,y:1}],
    ])
  })

  it("reorders lines", () => {
    expect(optimize([
      [{x:0,y:0}, {x:1,y:0}],
      [{x:2,y:0}, {x:3,y:0}],
      [{x:1,y:0}, {x:2,y:0}],
    ])).toEqual([
      [{x:0,y:0}, {x:1,y:0}],
      [{x:1,y:0}, {x:2,y:0}],
      [{x:2,y:0}, {x:3,y:0}],
    ])
  })
})
