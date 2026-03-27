# Phase 1.5: Efficiency & AI Modeling

**Spec reference**: Sections 5 (Metrics), 7 (Individual Efficiency, AI Impact), 8 (Skill Match)

## Summary

Add per-member skill/seniority factor and per-scenario AI effect parameter so the optimizer reflects individual productivity differences and AI-augmented workflows. Also add PM bottleneck risk as a displayed metric.

## 1. Skill Factor (per member)

### Type change

```typescript
export type Member = {
  id: string;
  role: Role;
  allocation: number;
  skill: number; // 0–1, default 1.0
};
```

### Capacity impact

`effectiveFe` and `effectiveBe` change from:

```typescript
m.allocation / 100
```

to:

```typescript
(m.allocation / 100) * m.skill
```

A member at 80% allocation and 0.75 skill contributes `0.8 * 0.75 = 0.6` FTE.

### UI

- New column in squad table: **Skill** — inline number input (0.0–1.0, step 0.1)
- Tooltip: "Individual efficiency factor. 1.0 = fully productive, 0.5 = half productivity (e.g. ramping up)"

### Store migration

Version bump: 6 → 7. Migration adds `skill: 1` to every member missing the field.

## 2. AI Effect (per scenario)

### Type change

Not a per-member field — it's a scenario-level or global parameter.

For now (before Phase 3 scenarios exist), add to global store:

```typescript
aiEffect: number; // -1 to +1, default 0
```

### Capacity impact

Applied as a global multiplier to all engineering capacity:

```typescript
effectiveCapacity = baseCapacity * (1 + aiEffect)
```

- `aiEffect = 0`: no change (baseline)
- `aiEffect = 0.5`: 50% more throughput
- `aiEffect = -0.3`: 30% less throughput (AI tooling overhead)
- `aiEffect = 1`: double throughput (theoretical maximum)

### Where it's applied

In the optimizer's `buildCap` function, after computing per-squad FE/BE arrays, scale every value by `(1 + aiEffect)`.

NOT applied to PM capacity (PMs don't benefit from AI coding tools).

### UI

- New slider in the horizon settings bar: **AI Effect** — range -1.0 to +1.0, step 0.1
- Label shows current value with contextual text:
  - `-1.0`: "AI hinders (2× slower)"
  - `0`: "No AI effect"
  - `+1.0`: "AI doubles throughput"
- Color: red for negative, neutral for 0, green for positive

### Store migration

Version bump includes `aiEffect: 0` default. Migration: `if (version < N) state.aiEffect = state.aiEffect ?? 0`

## 3. PM Bottleneck Risk

### Metric

```
pmBottleneckRisk = activeProjects / totalPmCapacity
```

Where:
- `activeProjects` = count of projects running in the busiest month
- `totalPmCapacity` = sum of PM FTE across all squads

### Thresholds

| Risk | Ratio | Color |
|---|---|---|
| Low | < 3 | Green |
| Medium | 3–5 | Amber |
| High | > 5 | Red |

### UI

Displayed in the schedule summary bar alongside utilization %. Shows as a badge: "PM load: 4.2 projects/PM (medium)".

### No store change

Computed from schedule + squad data at render time.

## 4. Skill Match (optional constraint)

### Not in this phase

Skill match (e.g. "this project requires a senior engineer with skill >= 0.8") adds significant complexity to the scheduler. Deferred to a future phase. The skill factor from this phase provides the foundation — the constraint layer can be added later without changing the data model.

## Implementation Order

1. Add `skill` field to `Member` type + migration
2. Update `effectiveFe`/`effectiveBe` to use skill
3. Add skill column to squad table UI
4. Add `aiEffect` to store + migration
5. Apply aiEffect in `buildCap`
6. Add AI effect slider to UI
7. Compute and display PM bottleneck risk metric
8. Tests for each step

## Tests

- `effectiveFe` with skill 0.5 returns half of allocation-based value
- `effectiveBe` with skill 0.75 returns 75% of allocation-based value
- `buildCap` with aiEffect 0.5 produces 1.5× capacity
- `buildCap` with aiEffect -0.5 produces 0.5× capacity
- PM members are NOT affected by aiEffect
- Migration adds `skill: 1` to all existing members
- Optimizer still schedules correctly with mixed skill levels
- PM bottleneck metric computes correct ratio
