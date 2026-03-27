"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SimulationInput } from "./simulator";
import { SimulationResult } from "./types";

type SimState = {
  running: boolean;
  progress: number;
  result: SimulationResult | null;
};

export function useSimulation() {
  const [state, setState] = useState<SimState>({
    running: false,
    progress: 0,
    result: null,
  });

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((input: SimulationInput) => {
    workerRef.current?.terminate();

    const worker = new Worker(
      new URL("./simulation-worker.ts", import.meta.url),
    );
    workerRef.current = worker;

    setState({ running: true, progress: 0, result: null });

    worker.onmessage = (e) => {
      if (e.data.type === "progress") {
        setState((s) => ({ ...s, progress: e.data.pct }));
      } else if (e.data.type === "result") {
        setState({ running: false, progress: 100, result: e.data.result });
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = () => {
      setState((s) => ({ ...s, running: false }));
      worker.terminate();
      workerRef.current = null;
    };

    worker.postMessage({ type: "run", input });
  }, []);

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setState((s) => ({ ...s, running: false, progress: 0 }));
  }, []);

  return { ...state, run, cancel };
}
