import { describe, it, expect } from "vitest";
import {
  buildFullStackSquads,
  buildMiniSquads,
  buildPresetScenarios,
} from "../scenario-presets";
import { Squad, Scenario, UncertaintyParams } from "../types";
import { effectiveFe, effectiveBe } from "../optimizer";

function makeSquad(id: string, members: { role: "fe" | "be" | "pm"; alloc: number; skill: number }[]): Squad {
  return {
    id,
    name: `Squad ${id}`,
    members: members.map((m, i) => ({
      id: `${id}-${m.role}-${i}`,
      role: m.role,
      allocation: m.alloc,
      skill: m.skill,
    })),
  };
}

function makeBaseScenario(squads: Squad[]): Scenario {
  return {
    id: "base",
    name: "Base",
    squads,
    projects: [
      {
        id: "p1",
        name: "Project 1",
        duration: 2,
        feNeeded: 1,
        beNeeded: 1,
        businessValue: 5,
        timeCriticality: 5,
        riskReduction: 3,
        squadId: squads[0]?.id ?? "",
        dependencies: [],
      },
    ],
    objective: "wsjf",
    horizonMonths: 9,
    uncertainty: {
      estimationErrorPct: 30,
      interruptionProbPct: 10,
      dependencyDelayPct: 15,
      reworkProbPct: 10,
    },
    cycleLengthWeeks: 1,
    cycleOverheadPct: 12,
    aiEffect: 0,
  };
}

// ---------------------------------------------------------------------------
// BUG #1 regression: buildFullStackSquads must preserve skill-weighted capacity
// ---------------------------------------------------------------------------

describe("buildFullStackSquads — skill factor preservation", () => {
  it("preserves effective capacity when engineers have skill < 1", () => {
    const squad = makeSquad("s1", [
      { role: "fe", alloc: 100, skill: 0.5 },
      { role: "be", alloc: 100, skill: 0.5 },
    ]);

    const originalFe = effectiveFe(squad);
    const originalBe = effectiveBe(squad);
    expect(originalFe).toBeCloseTo(0.5);
    expect(originalBe).toBeCloseTo(0.5);

    const [transformed] = buildFullStackSquads([squad]);
    const transformedFe = effectiveFe(transformed);
    const transformedBe = effectiveBe(transformed);

    // Full-stack: both roles get TOTAL engineering effective capacity (FE + BE combined)
    // Original total effective = 0.5 + 0.5 = 1.0 allocation*skill = 100
    // So each synthetic member should have allocation 100, skill 1 → effective 1.0
    expect(transformedFe).toBeCloseTo(1.0);
    expect(transformedBe).toBeCloseTo(1.0);
  });

  it("does NOT inflate capacity for low-skill engineers", () => {
    const squad = makeSquad("s1", [
      { role: "fe", alloc: 100, skill: 0.3 },
      { role: "fe", alloc: 100, skill: 0.3 },
    ]);

    // 2 FEs at 100% alloc, 0.3 skill → effective 0.6 FE total
    // Raw allocation sum = 200, but effective = 60
    const [transformed] = buildFullStackSquads([squad]);

    // If bug existed: effective would be 200/100 = 2.0 (wrong!)
    // With fix: effective should be 60/100 = 0.6
    expect(effectiveFe(transformed)).toBeCloseTo(0.6);
    expect(effectiveBe(transformed)).toBeCloseTo(0.6);
  });

  it("preserves PM members unchanged", () => {
    const squad = makeSquad("s1", [
      { role: "pm", alloc: 100, skill: 1 },
      { role: "fe", alloc: 100, skill: 1 },
      { role: "be", alloc: 100, skill: 1 },
    ]);

    const [transformed] = buildFullStackSquads([squad]);
    const pms = transformed.members.filter((m) => m.role === "pm");
    expect(pms).toHaveLength(1);
    expect(pms[0].allocation).toBe(100);
  });

  it("works correctly with mixed skill levels", () => {
    const squad = makeSquad("s1", [
      { role: "fe", alloc: 100, skill: 1.0 },
      { role: "fe", alloc: 80, skill: 0.5 },
      { role: "be", alloc: 100, skill: 0.8 },
    ]);

    // Total effective = 100*1 + 80*0.5 + 100*0.8 = 100 + 40 + 80 = 220
    const [transformed] = buildFullStackSquads([squad]);
    expect(effectiveFe(transformed)).toBeCloseTo(2.2);
    expect(effectiveBe(transformed)).toBeCloseTo(2.2);
  });
});

// ---------------------------------------------------------------------------
// BUG #2 regression: buildPresetScenarios must deep-clone (no shared references)
// ---------------------------------------------------------------------------

describe("buildPresetScenarios — isolation between scenarios", () => {
  it("mutating one scenario's squads does not affect others", () => {
    const squad = makeSquad("s1", [
      { role: "fe", alloc: 100, skill: 1 },
      { role: "be", alloc: 100, skill: 1 },
    ]);
    const base = makeBaseScenario([squad]);
    const [current, fullStack, mini] = buildPresetScenarios(base);

    current.squads[0].name = "MUTATED";

    expect(fullStack.squads[0].name).not.toBe("MUTATED");
    expect(mini.squads[0].name).not.toBe("MUTATED");
    expect(base.squads[0].name).not.toBe("MUTATED");
  });

  it("mutating one scenario's projects does not affect others", () => {
    const squad = makeSquad("s1", [
      { role: "fe", alloc: 100, skill: 1 },
      { role: "be", alloc: 100, skill: 1 },
    ]);
    const base = makeBaseScenario([squad]);
    const [current, fullStack] = buildPresetScenarios(base);

    current.projects[0].name = "MUTATED";

    expect(fullStack.projects[0].name).not.toBe("MUTATED");
    expect(base.projects[0].name).not.toBe("MUTATED");
  });

  it("mutating one scenario's uncertainty does not affect others", () => {
    const squad = makeSquad("s1", [
      { role: "fe", alloc: 100, skill: 1 },
      { role: "be", alloc: 100, skill: 1 },
    ]);
    const base = makeBaseScenario([squad]);
    const [current, fullStack] = buildPresetScenarios(base);

    current.uncertainty.estimationErrorPct = 99;

    expect(fullStack.uncertainty.estimationErrorPct).toBe(30);
    expect(base.uncertainty.estimationErrorPct).toBe(30);
  });

  it("each scenario gets a unique ID", () => {
    const squad = makeSquad("s1", [
      { role: "fe", alloc: 100, skill: 1 },
      { role: "be", alloc: 100, skill: 1 },
    ]);
    const base = makeBaseScenario([squad]);
    const scenarios = buildPresetScenarios(base);
    const ids = scenarios.map((s) => s.id);

    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => id !== "base")).toBe(true);
  });

  it("produces exactly 3 scenarios with correct names", () => {
    const squad = makeSquad("s1", [
      { role: "fe", alloc: 100, skill: 1 },
      { role: "be", alloc: 100, skill: 1 },
    ]);
    const base = makeBaseScenario([squad]);
    const scenarios = buildPresetScenarios(base);

    expect(scenarios).toHaveLength(3);
    expect(scenarios[0].name).toBe("Current setup");
    expect(scenarios[1].name).toBe("Full-stack AI");
    expect(scenarios[2].name).toBe("AI Mini Squad");
  });
});

// ---------------------------------------------------------------------------
// buildMiniSquads
// ---------------------------------------------------------------------------

describe("buildMiniSquads", () => {
  it("creates 1 PM + 1 FE + 1 BE per squad", () => {
    const squad = makeSquad("s1", [
      { role: "pm", alloc: 100, skill: 1 },
      { role: "fe", alloc: 100, skill: 1 },
      { role: "fe", alloc: 80, skill: 0.5 },
      { role: "be", alloc: 100, skill: 1 },
    ]);

    const [mini] = buildMiniSquads([squad], 1);
    expect(mini.members).toHaveLength(3);
    expect(mini.members.filter((m) => m.role === "pm")).toHaveLength(1);
    expect(mini.members.filter((m) => m.role === "fe")).toHaveLength(1);
    expect(mini.members.filter((m) => m.role === "be")).toHaveLength(1);
  });

  it("applies multiplier to FE/BE allocation", () => {
    const squad = makeSquad("s1", [
      { role: "fe", alloc: 100, skill: 1 },
      { role: "be", alloc: 100, skill: 1 },
    ]);

    const [mini] = buildMiniSquads([squad], 2.5);
    const fe = mini.members.find((m) => m.role === "fe")!;
    const be = mini.members.find((m) => m.role === "be")!;
    expect(fe.allocation).toBe(250);
    expect(be.allocation).toBe(250);
  });
});
