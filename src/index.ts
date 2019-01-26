import { EBB } from "./ebb";
import { AxidrawFast, plan } from "./planning";

const p = plan([[{x: 10, y: 10}, {x: 20, y: 10}, {x: 20, y: 20}, {x: 10, y: 20}, {x: 10, y: 10}]], AxidrawFast);
console.log(p);
console.log(p.duration());

EBB.list().then(async (ports) => {
  if (!ports.length) {
    console.error("Couldn't find EBB");
    return;
  }
  const ebb = new EBB(ports[0]);
  if (!(await ebb.areSteppersPowered())) {
    console.error("Steppers not powered");
    await ebb.close();
    return;
  }
  await ebb.executePlan(p);
  await ebb.close();
});
