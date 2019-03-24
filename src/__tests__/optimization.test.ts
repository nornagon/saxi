import {joinNearby} from '../optimization';

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
