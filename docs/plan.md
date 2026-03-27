# Implementation Plan

Three phases, each independently shippable. Phase 1 is foundation; Phases 2 and 3 build on it.

## Current State

The system currently provides:

- **Optimization**: greedy + swap + gap-fill + compaction scheduler using WSJF prioritization
- **Team modeling**: traditional squads (FE/BE/PM roles) with a hardcoded AI comparison (Traditional vs Full-stack vs Mini-squad)
- **UI**: Gantt chart, project/squad tables, recommendations panel, AI comparison dashboard
- **Store**: Zustand with persist + migrations (v5), real-time schedule invalidation on any input change

## What's Missing (vs Spec)

| Spec Section | Gap |
|---|---|
| 2.2 Simulation | No probabilistic modeling at all |
| 3 Objectives | Only WSJF — no max-value, min-delay, max-throughput |
| 4.2 Outcomes | No probability ranges, no P10/P50/P90, no completion confidence |
| 5.4 Scenario Isolation | Comparison is hardcoded to 3 scenarios, not user-configurable |
| 7 Uncertainty | No estimation error, interruptions, rework, dependency delay modeling |

## Phase 1: Objective Selection

**Spec coverage**: Section 3 (Objectives)

Add switchable optimization objectives: WSJF, Max Value, Min Delay, Max Throughput.

- Parameterise the optimizer's sort strategy
- Add objective to store with UI selector
- Thread through all callers (alerts, comparison)

**Details**: [features/phase-1-objectives.md](features/phase-1-objectives.md)

## Phase 2: Simulation Engine (Monte Carlo)

**Spec coverage**: Sections 2.2, 4.2, 5.1, 7

Run N optimizer iterations with randomised inputs, producing probability distributions.

- Perturbation model: duration noise (log-normal), rework, dependency delays, squad interruptions
- Web Worker for non-blocking execution
- Forecast view: reliability, distributions, confidence Gantt, per-project probability table

**Details**: [features/phase-2-simulation.md](features/phase-2-simulation.md)

## Phase 3: Scenario System

**Spec coverage**: Sections 2.3, 4.3, 5.3, 5.4, 6, 9

User-defined scenarios with full flexibility (different teams, projects, objectives per scenario).

- Scenario CRUD in store
- Preset templates (Traditional, Full-stack AI, Mini Squad)
- Side-by-side comparison with plan + forecast per scenario
- Replaces the current hardcoded AI comparison

**Details**: [features/phase-3-scenarios.md](features/phase-3-scenarios.md)

## Commit Strategy

Each phase ships as multiple small commits. No phase depends on another being fully complete to start, though Phase 2 and 3 use the `Objective` type from Phase 1.

## Out of Scope (Future)

- Drag-and-drop scenario editing
- Export/share scenarios (URL or PDF)
- Sensitivity analysis / tornado charts
- Optimization under uncertainty (robust scheduling)
- Scope creep variable (FE/BE needs increase mid-horizon)
- Priority shift variable (value scores change mid-horizon)
