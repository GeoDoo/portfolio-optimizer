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
| ~~3 Objectives~~ | ~~Only WSJF~~ → **DONE** (Phase 1 shipped) |
| 5 Metrics | No PM bottleneck risk metric |
| 7 Individual Efficiency | No seniority/skill factor per member |
| 7 AI Impact | No AI effect parameter (-1 → +1) |
| 8 Constraints | No skill match requirement |
| 9 Uncertainty | No estimation error, interruptions, rework, dependency delay modeling |
| 4.2 Outcomes | No probability ranges, no P10/P50/P90 |
| 5.4 Scenario Isolation | Comparison is hardcoded to 3 scenarios, not user-configurable |

## Phase 1: Objective Selection ✅

**Status**: Complete

Added switchable optimization objectives: WSJF, Max Value, Min Delay, Max Throughput. Parameterised optimizer sort strategy, added to store (v6), wired through all callers.

**Details**: [features/phase-1-objectives.md](features/phase-1-objectives.md)

## Phase 1.5: Efficiency & AI Modeling

**Spec coverage**: Sections 7 (Individual Efficiency), 7 (AI Impact), 5 (PM Bottleneck), 8 (Skill Match)

Add individual member efficiency and AI impact parameters that modify effective capacity.

- **Skill factor (0–1)** per member: scales effective FE/BE contribution. Default 1.0.
- **AI effect (-1 → +1)** per scenario: `effectiveCapacity = base * (1 + aiEffect)`. Default 0.
- **PM bottleneck risk metric**: ratio of active projects to available PM capacity.
- Store migration, UI controls, thread through optimizer.

**Details**: [features/phase-1.5-efficiency.md](features/phase-1.5-efficiency.md)

## Phase 2: Simulation Engine (Monte Carlo)

**Spec coverage**: Sections 9, 4.2, 6.1

Run N optimizer iterations with randomised inputs, producing probability distributions.

- Perturbation model: duration noise (log-normal), rework, dependency delays, squad interruptions
- Web Worker for non-blocking execution
- Forecast view: reliability, distributions, confidence Gantt, per-project probability table

**Details**: [features/phase-2-simulation.md](features/phase-2-simulation.md)

## Phase 3: Scenario System

**Spec coverage**: Sections 2.3, 4.3, 6.3, 6.4, 7, 11

User-defined scenarios with full flexibility (different teams, projects, objectives, AI effect per scenario).

- Scenario CRUD in store
- Preset templates (Traditional, Full-stack AI, Mini Squad)
- Side-by-side comparison with plan + forecast per scenario
- Replaces the current hardcoded AI comparison

**Details**: [features/phase-3-scenarios.md](features/phase-3-scenarios.md)

## Commit Strategy

Each phase ships as multiple small commits. Phase 1.5 is a prerequisite for Phase 3 (scenarios need AI effect). Phase 2 and 3 are independent of each other.

## Out of Scope (Future)

- Drag-and-drop scenario editing
- Export/share scenarios (URL or PDF)
- Sensitivity analysis / tornado charts
- Optimization under uncertainty (robust scheduling)
- Scope creep variable (FE/BE needs increase mid-horizon)
- Priority shift variable (value scores change mid-horizon)
