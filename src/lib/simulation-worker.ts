import { runSimulation, SimulationInput } from "./simulator";

type WorkerMessage =
  | { type: "run"; input: SimulationInput }
  | { type: "cancel" };

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === "run") {
    const result = runSimulation(e.data.input, (pct) => {
      self.postMessage({ type: "progress", pct });
    });
    self.postMessage({ type: "result", result });
  }
};
