# Phase 1: Objective Selection

**Spec reference**: Section 3 (Inputs — Objective)

## Summary

The optimizer currently uses WSJF (Weighted Shortest Job First) as its only prioritization strategy. This phase adds three additional objectives, letting users choose how the system allocates work.

## Objectives

| ID | Label | Behavior |
|---|---|---|
| `wsjf` | WSJF | Current default. Prioritizes high cost-of-delay relative to job size. Chain-aware: blockers of high-value work rise to the top. |
| `max-value` | Max Value | Prioritizes projects with the highest total value (businessValue + timeCriticality + riskReduction) regardless of size. Good when value delivery matters more than throughput. |
| `min-delay` | Min Delay | Prioritizes projects with the earliest deadline, then shortest duration. Good when meeting commitments matters most. |
| `max-throughput` | Max Throughput | Prioritizes smallest jobs first. Maximizes the number of completed projects. Good when shipping velocity is the goal. |

## Type

```typescript
export type Objective = "wsjf" | "max-value" | "min-delay" | "max-throughput";
```

## Optimizer Changes

### Function signature

`optimize()` gains an `objective` parameter (default `"wsjf"` for backward compatibility):

```typescript
export function optimize(
  projects: Project[],
  squads: Squad[],
  horizonMonths: number,
  objective: Objective = "wsjf",
): ScheduleResult
```

### Sort strategy

The `getReady()` function inside `greedySchedule` currently sorts by `chainWsjf` descending with deadline as tiebreaker. This becomes a strategy selected by objective:

| Objective | Primary sort | Tiebreaker |
|---|---|---|
| `wsjf` | chain-aware WSJF descending | deadline ascending |
| `max-value` | chain-aware value descending | duration ascending |
| `min-delay` | chain-aware deadline ascending | duration ascending |
| `max-throughput` | chain-aware inverse job-size descending | value descending |

### Chain priority propagation

`buildChainWsjf` is generalised to `buildChainPriority(projects, objective)`. The propagation logic changes per objective:

- `wsjf`: propagate max WSJF (current behavior)
- `max-value`: propagate max `projectValue(p)`
- `min-delay`: propagate min deadline (earliest deadline wins)
- `max-throughput`: propagate min `jobSize(p)` (smallest job wins)

### Swap-improve phase

No change. It always swaps lower-value entries for higher-value deferred projects. This is correct across all objectives — once prioritization decides what to attempt first, swapping should still prefer higher total value.

## Store Changes

- New field: `objective: Objective` (default `"wsjf"`)
- New action: `setObjective(o: Objective)` — invalidates schedule
- Version bump: 5 → 6
- Migration: `if (version < 6) state.objective = "wsjf"`

## UI Changes

Segmented control in the horizon settings bar (next to the existing cycle/overhead controls):

```
[ WSJF | Max Value | Min Delay | Max Throughput ]
```

Selecting an objective invalidates the schedule and triggers re-optimization.

## Downstream Callers

All callers of `optimize()` must thread the objective:

- `src/app/page.tsx` — main `runOptimize`
- `src/lib/alerts.ts` — `generateRecommendations`, `computeOptimalPlan`, `generateCandidates`
- `src/lib/ai-comparison.ts` — `runComparison`, `findBreakEvenMultiplier`

## Tests

- Given the same project set, `max-throughput` schedules more projects than `max-value` when small low-value projects exist
- `min-delay` schedules deadline projects earlier than `wsjf` when they have low WSJF
- `max-value` schedules a high-value large project before a high-WSJF small project
- All objectives produce valid schedules (no capacity violations, no dependency violations)
