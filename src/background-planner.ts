import { replan } from './massager';

self.addEventListener("message", (m) => {
  const {paths, planOptions} = m.data;
  const plan = replan(paths, planOptions);
  console.time("serializing");
  const serialized = plan.serialize();
  console.timeEnd("serializing");
  (self as any).postMessage(serialized);
});

export default {} as typeof Worker & {
  new(): Worker;
};
