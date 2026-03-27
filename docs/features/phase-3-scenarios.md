# Phase 3: Scenario System

**Spec reference**: Sections 2.3, 4.3, 6.3, 6.4, 7, 11

## Summary

Users define multiple named scenarios — each with its own team structure, project backlog, objective, and uncertainty parameters — and compare plan + forecast results side-by-side. Replaces the current hardcoded AI comparison dashboard.

## Scenario Type

```typescript
export type Scenario = {
  id: string;
  name: string;
  squads: Squad[];
  projects: Project[];
  objective: Objective;
  horizonMonths: number;
  uncertainty: UncertaintyParams;
  cycleLengthWeeks: number;
  cycleOverheadPct: number;
  aiEffect: number; // -1 to +1
};

export type ScenarioResult = {
  plan: ScheduleResult;
  simulation: SimulationResult | null;
};
```

## Store Design

Scenarios are added alongside the existing top-level state (not replacing it). The current `squads`/`projects`/`objective`/etc. remain as the **working state** — what the user directly edits.

### New fields

- `scenarios: Scenario[]` (persisted, default `[]`)

### New actions

- `addScenario(s: Scenario)` — adds a new scenario
- `updateScenario(id, patch: Partial<Scenario>)` — partial update
- `removeScenario(id)` — delete
- `duplicateScenario(id)` — deep clone with new ID + " (copy)" suffix
- `snapshotAsScenario(name)` — captures the current working state into a new Scenario

### What is NOT persisted

Scenario results (`ScenarioResult`) are computed on demand and held in component state within the compare view. They are not stored in Zustand — recalculated when the user opens the compare tab or triggers a run.

### Migration

Version bump: 7 → 8. Migration adds `scenarios: []`.

## Preset Scenarios

The existing hardcoded Traditional / Full-stack AI / Mini Squad comparison becomes **preset templates**.

New file: `src/lib/scenario-presets.ts` (replaces `src/lib/ai-comparison.ts`)

### Kept helpers

- `buildFullStackSquads(squads)` — PMs stay, engineers become full-stack (both FE and BE capacity equal total engineering allocation)
- `buildMiniSquads(squads, multiplier)` — 1 PM + 1 engineer (at `multiplier * 100%` allocation for both FE and BE) per squad

### New function

```typescript
export function buildPresetScenarios(base: Scenario): Scenario[] {
  return [
    { ...base, name: "Current setup" },
    { ...base, name: "Full-stack AI", squads: buildFullStackSquads(base.squads) },
    { ...base, name: "AI Mini Squad", squads: buildMiniSquads(base.squads, 1) },
  ];
}
```

Users can also create blank scenarios or duplicate existing ones.

## UI: Compare View

New component: `src/components/compare-view.tsx` (replaces `src/components/comparison-dashboard.tsx`)

### Layout

Up to 3 scenarios compared side-by-side in columns:

```
┌─────────────────┬─────────────────┬─────────────────┐
│ Scenario A      │ Scenario B      │ Scenario C      │
│ name + summary  │ name + summary  │ name + summary  │
├─────────────────┼─────────────────┼─────────────────┤
│ Plan metrics    │ Plan metrics    │ Plan metrics    │
│ scheduled: 10   │ scheduled: 12   │ scheduled: 8    │
│ deferred: 2     │ deferred: 0     │ deferred: 4     │
│ value: 85       │ value: 102      │ value: 64       │
├─────────────────┼─────────────────┼─────────────────┤
│ Forecast        │ Forecast        │ Forecast        │
│ reliability: 78%│ reliability: 91%│ reliability: 65% │
│ P50 value: 80   │ P50 value: 98   │ P50 value: 58   │
├─────────────────┼─────────────────┼─────────────────┤
│ Mini Gantt      │ Mini Gantt      │ Mini Gantt      │
│ (w/ P10-P90     │ (w/ P10-P90     │ (w/ P10-P90     │
│  confidence)    │  confidence)    │  confidence)    │
└─────────────────┴─────────────────┴─────────────────┘
```

### Components

- **Scenario selector bar** — pick which scenarios to compare (max 3). Buttons: "Add from presets", "Save current as scenario", "New blank scenario".
- **Scenario cards** — each shows: team summary (headcount, eng FTE), plan metrics, forecast metrics (if simulation run), mini Gantt with optional confidence bars.
- **"Run all simulations" button** — triggers parallel Web Workers for all selected scenarios.
- **Scenario editor drawer** — slide-out panel for editing a scenario's squads, projects, objective, uncertainty params. Reuses existing `SquadTable` and `ProjectTable` in compact mode, operating on the scenario's data rather than the store's working state.

### Page integration

- Tabs renamed: **Plan** | **Forecast** | **Compare**
- Compare tab renders `CompareView`
- Old `ComparisonDashboard` and `ai-comparison.ts` removed

## Files Removed

- `src/lib/ai-comparison.ts` → replaced by `src/lib/scenario-presets.ts`
- `src/components/comparison-dashboard.tsx` → replaced by `src/components/compare-view.tsx`

## Tests

- Scenario CRUD: add, update, remove, duplicate, snapshot
- `buildPresetScenarios` produces correct squad structures
- `snapshotAsScenario` deep-clones current state (mutations to working state don't affect snapshot)
- Compare view renders correct number of scenario cards
