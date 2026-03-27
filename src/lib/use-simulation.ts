"use client";

import { useCallback, useRef, useState } from "react";
import { runSimulation, SimulationInput } from "./simulator";
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

  const cancelledRef = useRef(false);

  const run = useCallback((input: SimulationInput) => {
    cancelledRef.current = false;
    setState({ running: true, progress: 0, result: null });

    // Run on main thread via setTimeout to let React paint first
    setTimeout(() => {
      if (cancelledRef.current) return;
      try {
        const result = runSimulation(input, (pct) => {
          if (!cancelledRef.current) {
            setState((s) => ({ ...s, progress: pct }));
          }
        });
        if (!cancelledRef.current) {
          setState({ running: false, progress: 100, result });
        }
      } catch {
        if (!cancelledRef.current) {
          setState((s) => ({ ...s, running: false }));
        }
      }
    }, 20);
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setState((s) => ({ ...s, running: false, progress: 0 }));
  }, []);

  return { ...state, run, cancel };
}
