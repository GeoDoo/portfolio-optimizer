# Phase 2: Simulation Engine (Monte Carlo)

**Spec reference**: Sections 4.2 (Outcomes), 6.1 (Deterministic vs Probabilistic), 9 (Uncertainty Modeling)

## Summary

A Monte Carlo simulation engine that runs hundreds of optimizer iterations with randomised inputs, producing probability distributions instead of a single deterministic plan. Runs in a Web Worker to avoid blocking the UI.

## Uncertainty Parameters

Four user-configurable knobs control the randomness:

| Parameter | Default | Description |
|---|---|---|
| `estimationErrorPct` | 30 | Standard deviation for log-normal duration perturbation. 30 means durations vary ~30% around the estimate. |
| `interruptionProbPct` | 10 | Per squad, per month probability of losing all capacity for that month (illness, firefighting, attrition). |
| `dependencyDelayPct` | 15 | Per dependency link probability of adding a 1-month gap after the predecessor completes. |
| `reworkProbPct` | 10 | Per project probability of needing 50% more duration (rework, bugs, scope issues). |

## Perturbation Model

For each of N runs (default 500), fresh randomness is drawn:

### Duration noise (per project, per run)

Log-normal distribution:

```
actualDuration = max(1, round(duration * exp(Z * sigma)))
```

Where Z ~ Normal(0,1) and sigma = estimationErrorPct / 100. Log-normal is chosen because real-world estimates skew optimistic — overruns are more frequent and larger than underruns.

### Rework (per project, per run)

Coin flip: `random() < reworkProbPct / 100`. If triggered, duration increases by 50% (rounded up). Applied after duration noise so it compounds.

### Dependency delay (per dependency link, per run)

Coin flip per dependency edge: `random() < dependencyDelayPct / 100`. If triggered, the dependent project's earliest possible start is pushed 1 month later. Multiple dependencies evaluated independently — a project with 3 deps could get 0 to 3 months of delay.

### Squad interruption (per squad, per month, per run)

Coin flip: `random() < interruptionProbPct / 100`. If triggered, that squad's capacity is zeroed for that month. Modeled by extending durations of projects assigned to the affected squad (keeps the optimizer's internals untouched).

### What stays fixed across runs

- Project backlog (which projects exist, their value scores, FE/BE needs)
- Squad composition (who's on which squad, roles, allocation)
- Objective function
- Horizon length
- Dependency graph structure

## Types

```typescript
export type UncertaintyParams = {
  estimationErrorPct: number;
  interruptionProbPct: number;
  dependencyDelayPct: number;
  reworkProbPct: number;
};

export type ProjectStats = {
  projectId: string;
  completionPct: number;   // % of runs where this project was scheduled
  deliveryP10: number;     // 10th percentile end month
  deliveryP50: number;     // median end month
  deliveryP90: number;     // 90th percentile end month
};

export type SimulationResult = {
  numRuns: number;
  projectStats: ProjectStats[];
  totalValueP10: number;
  totalValueP50: number;
  totalValueP90: number;
  scheduledCountP10: number;
  scheduledCountP50: number;
  scheduledCountP90: number;
  lastMonthP10: number;
  lastMonthP50: number;
  lastMonthP90: number;
  planReliability: number;  // % of runs matching or exceeding deterministic scheduled count
};
```

## Architecture

```
UI (useSimulation hook)
  │
  ├── postMessage(inputs) ──▶ Web Worker
  │                              │
  │                              ├── for i in 1..N:
  │                              │     perturbProjects()
  │                              │     perturbDependencies()
  │                              │     perturbSquadCapacity()
  │                              │     optimize()
  │                              │     collect run result
  │                              │
  │                              ├── aggregateRuns()
  │                              │
  │  ◀── postMessage(progress) ──┤  (every 10% of runs)
  │  ◀── postMessage(result)  ───┘
  │
  └── renders ForecastView
```

### New files

| File | Purpose |
|---|---|
| `src/lib/simulator.ts` | Pure functions: perturbation, aggregation, PRNG. No DOM, no store. Importable by worker and main thread. |
| `src/lib/simulation-worker.ts` | Web Worker entry point. Receives inputs via `postMessage`, runs simulation loop, sends progress + final result. |
| `src/lib/use-simulation.ts` | React hook managing worker lifecycle: spawn, cancel, progress tracking, cleanup on unmount. |

### PRNG

Seeded pseudo-random number generator (`mulberry32` or similar) so simulations are reproducible when inputs don't change. Seed derived from a hash of the input data.

### Worker instantiation (Next.js)

```typescript
new Worker(new URL('./simulation-worker.ts', import.meta.url))
```

## Store Changes

- New field: `uncertainty: UncertaintyParams` with defaults
- New action: `setUncertainty(params)` — does NOT invalidate schedule (simulation is separate)
- Version bump (after Phase 1.5 migrations)
- Migration: adds default `uncertainty` object

## UI: Forecast View

New component: `src/components/forecast-view.tsx`

### Sections

1. **Reliability banner** — "In X% of 500 simulations, all planned projects deliver within the horizon." Color: green > 80%, amber 50–80%, red < 50%.

2. **Distribution summary cards** — Three cards showing P10 / P50 / P90 for:
   - Projects delivered
   - Total value delivered
   - Last delivery month

3. **Per-project probability table** — Each row:
   - Project name
   - Completion probability (horizontal bar, color-coded)
   - P10 / P50 / P90 delivery month
   - Red highlight if completion < 60%

4. **Confidence Gantt** — Reuses existing Gantt rendering. Solid bar = P50 (same as deterministic plan). Semi-transparent shadow behind each bar = P10–P90 range. Projects with < 50% completion probability shown dashed/faded.

5. **Uncertainty controls** — Collapsible panel with 4 sliders + "Run simulation" button + progress bar. Run count selector (200 / 500 / 1000).

### Page integration

- New tab: **Forecast** (added to the existing Schedule / AI Comparison toggle)
- Auto-triggers simulation when tab is first activated or inputs change since last run
- Shows progress bar during simulation

## Tests

- `perturbProjects` produces durations >= 1
- `perturbProjects` with 100% rework probability always extends duration
- `aggregateRuns` computes correct percentiles for known inputs
- `runSimulation` with all uncertainty params at 0% produces results identical to deterministic optimizer
- Seeded PRNG produces reproducible results across runs
