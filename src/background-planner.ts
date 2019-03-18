import * as Optimization from "./optimization";
import * as Planning from "./planning";
import {AxidrawFast, Device, Plan, PlanOptions, XYMotion} from "./planning";
import {dedupPoints, formatDuration, scaleToPaper} from "./util";
import {Vec2, vmul} from "./vec";

self.addEventListener("message", (m) => {
  const {paths, planOptions} = m.data;
  const plan = replan(paths, planOptions);
  console.time("serializing");
  const serialized = plan.serialize();
  console.timeEnd("serializing");
  (self as any).postMessage(serialized);
});

function replan(paths: Vec2[][], planOptions: PlanOptions): Plan {
  const {paperSize, marginMm, selectedLayers, penUpHeight, penDownHeight, pointJoinRadius} = planOptions;
  // Compute scaling using _all_ the paths, so it's the same no matter what
  // layers are selected.
  const scaledToPaper: Vec2[][] = scaleToPaper(paths, paperSize, marginMm);

  // Rescaling loses the stroke info, so refer back to the original paths to
  // filter based on the stroke. Rescaling doesn't change the number or order
  // of the paths.
  const scaledToPaperSelected = scaledToPaper.filter((path, i) =>
    selectedLayers.has((paths[i] as any).stroke));

  const deduped: Vec2[][] = pointJoinRadius === 0
    ? scaledToPaperSelected
    : scaledToPaperSelected.map((p) => dedupPoints(p, pointJoinRadius));

  console.time("sorting paths");
  const reordered = planOptions.sortPaths ? Optimization.optimize(deduped) : deduped;
  console.timeEnd("sorting paths");

  // Optimize based on just the selected layers.
  console.time("joining nearby paths");
  const optimized: Vec2[][] = Optimization.joinNearby(
    reordered,
    planOptions.pathJoinRadius
  );
  console.timeEnd("joining nearby paths");

  // Convert the paths to units of "steps".
  const {stepsPerMm} = Device.Axidraw;
  const inSteps = optimized.map((ps) => ps.map((p) => vmul(p, stepsPerMm)));

  // And finally, motion planning.
  console.time("planning pen motions");
  const plan = Planning.plan(inSteps, {
    penUpPos: Device.Axidraw.penPctToPos(penUpHeight),
    penDownPos: Device.Axidraw.penPctToPos(penDownHeight),
    penDownProfile: {
      acceleration: planOptions.penDownAcceleration * Device.Axidraw.stepsPerMm,
      maximumVelocity: planOptions.penDownMaxVelocity * Device.Axidraw.stepsPerMm,
      corneringFactor: planOptions.penDownCorneringFactor * Device.Axidraw.stepsPerMm,
    },
    penUpProfile: {
      acceleration: planOptions.penUpAcceleration * Device.Axidraw.stepsPerMm,
      maximumVelocity: planOptions.penUpMaxVelocity * Device.Axidraw.stepsPerMm,
      corneringFactor: 0,
    },
    penDropDuration: planOptions.penDropDuration,
    penLiftDuration: planOptions.penLiftDuration,
  });
  console.timeEnd("planning pen motions");

  return plan;
}

export default {} as typeof Worker & {
  new(): Worker;
};
