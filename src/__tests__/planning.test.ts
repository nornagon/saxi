import {Plan, plan, Device, AxidrawFast, XYMotion, PenMotion, defaultPlanOptions} from '../planning';
import {Vec2} from '../vec';

describe("plan", () => {
  const device = Device.Axidraw
  const positions = {
    up: AxidrawFast.penUpPos,
    down: AxidrawFast.penDownPos,
    zero: device.penPctToPos(0)
  }
  it.skip("handles an empty input", () => {
    expect(plan([], AxidrawFast)).toEqual(new Plan([]))
  });

  function xyMotions(plan: Plan) {
    let curPenPos = 0;
    const motions: {from: Vec2; to: Vec2; penPos: number}[] = [];
    for (const m of plan.motions) {
      if (m instanceof PenMotion) {
        curPenPos = m.finalPos;
      } else if (m instanceof XYMotion) {
        motions.push({from: m.p1, to: m.p2, penPos: curPenPos});
      }
    }
    return motions;
  }

  it("handles a single point input", () => {
    const p = plan([[{x: 10, y: 10}]], AxidrawFast);

    expect(xyMotions(p)).toEqual([
      {from: {x: 0, y: 0}, to: {x: 10, y: 10}, penPos: 0},
      {from: {x: 10, y: 10}, to: {x: 10, y: 10}, penPos: positions.down},
      {from: {x: 10, y: 10}, to: {x: 0, y: 0}, penPos: positions.zero},
    ]);
  });

  it("handles a line", () => {
    const p = plan([[{x: 10, y: 10}, {x: 20, y: 10}]], AxidrawFast);

    expect(xyMotions(p)).toEqual([
      {from: {x: 0, y: 0}, to: {x: 10, y: 10}, penPos: 0},
      {from: {x: 10, y: 10}, to: {x: 20, y: 10}, penPos: positions.down},
      {from: {x: 20, y: 10}, to: {x: 0, y: 0}, penPos: positions.zero},
    ]);
  });

  it("handles two lines", () => {
    const p = plan([
      [{x: 10, y: 10}, {x: 20, y: 10}],
      [{x: 10, y: 20}, {x: 20, y: 20}],
    ], AxidrawFast);

    expect(xyMotions(p)).toEqual([
      {from: {x: 0, y: 0}, to: {x: 10, y: 10}, penPos: 0},
      {from: {x: 10, y: 10}, to: {x: 20, y: 10}, penPos: positions.down},
      {from: {x: 20, y: 10}, to: {x: 10, y: 20}, penPos: positions.up},
      {from: {x: 10, y: 20}, to: {x: 20, y: 20}, penPos: positions.down},
      {from: {x: 20, y: 20}, to: {x: 0, y: 0}, penPos: positions.zero},
    ]);
  });

  it("shouldn't slow down for a fake point", () => {
    const p1 = plan([
      [{x: 10, y: 10}, {x: 30, y: 10}],
    ], AxidrawFast);
    const p2 = plan([
      [{x: 10, y: 10}, {x: 25, y: 10}, {x: 30, y: 10}],
    ], AxidrawFast);

    expect(p1.motions[2].duration()).toEqual(p2.motions[2].duration());
  })
});
