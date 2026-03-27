import { describe, it, expect } from "vitest";
import { analyzeProjects } from "../alerts";
import { Squad, Project } from "../types";

function makeSquad(id: string, fe: { alloc: number; skill: number }[], be: { alloc: number; skill: number }[]): Squad {
  let _id = 0;
  return {
    id,
    name: `Squad ${id}`,
    members: [
      ...fe.map((m) => ({ id: `${id}-fe-${_id++}`, role: "fe" as const, allocation: m.alloc, skill: m.skill })),
      ...be.map((m) => ({ id: `${id}-be-${_id++}`, role: "be" as const, allocation: m.alloc, skill: m.skill })),
    ],
  };
}

function makeProject(id: string, squadId: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    name: `Project ${id}`,
    duration: 2,
    feNeeded: 1,
    beNeeded: 1,
    businessValue: 5,
    timeCriticality: 5,
    riskReduction: 3,
    squadId,
    dependencies: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// BUG #3 regression: analyzeProjects must respect aiEffect
// ---------------------------------------------------------------------------

describe("analyzeProjects — aiEffect integration", () => {
  it("project fits when aiEffect boosts capacity above requirement", () => {
    // Squad has 0.5 FE and 0.5 BE (50% allocation, skill 1)
    // Project needs 1 FE and 1 BE → won't fit without AI
    const squad = makeSquad("s1",
      [{ alloc: 50, skill: 1 }],
      [{ alloc: 50, skill: 1 }],
    );
    const project = makeProject("p1", "s1", { feNeeded: 1, beNeeded: 1 });

    // Without AI effect: should NOT fit (0.5 < 1)
    const alertsNoAi = analyzeProjects([project], [squad], 6, 0);
    expect(alertsNoAi[0].level).not.toBe("ok");

    // With +1.0 AI effect: capacity doubles to 1.0 FE / 1.0 BE → fits
    const alertsWithAi = analyzeProjects([project], [squad], 6, 1.0);
    expect(alertsWithAi[0].level).toBe("ok");
  });

  it("negative aiEffect causes previously-fitting project to not fit", () => {
    const squad = makeSquad("s1",
      [{ alloc: 100, skill: 1 }],
      [{ alloc: 100, skill: 1 }],
    );
    const project = makeProject("p1", "s1", { feNeeded: 1, beNeeded: 1 });

    // Without AI: 1.0 FE / 1.0 BE → fits
    const alertsNoAi = analyzeProjects([project], [squad], 6, 0);
    expect(alertsNoAi[0].level).toBe("ok");

    // With -0.5 AI: 0.5 FE / 0.5 BE → won't fit
    const alertsNegAi = analyzeProjects([project], [squad], 6, -0.5);
    expect(alertsNegAi[0].level).not.toBe("ok");
  });

  it("default aiEffect (0) behaves same as explicit 0", () => {
    const squad = makeSquad("s1",
      [{ alloc: 100, skill: 1 }],
      [{ alloc: 100, skill: 1 }],
    );
    const project = makeProject("p1", "s1");

    const alertsDefault = analyzeProjects([project], [squad], 6);
    const alertsExplicit = analyzeProjects([project], [squad], 6, 0);

    expect(alertsDefault[0].level).toBe(alertsExplicit[0].level);
    expect(alertsDefault[0].message).toBe(alertsExplicit[0].message);
  });

  it("aiEffect applies to cross-squad capacity checks", () => {
    // Squad s1 has very low capacity, s2 is slightly bigger
    const s1 = makeSquad("s1",
      [{ alloc: 30, skill: 1 }],
      [{ alloc: 30, skill: 1 }],
    );
    const s2 = makeSquad("s2",
      [{ alloc: 60, skill: 1 }],
      [{ alloc: 60, skill: 1 }],
    );
    const project = makeProject("p1", "s1", { feNeeded: 1, beNeeded: 1 });

    // Without AI: s1 has 0.3, s2 has 0.6 → neither fits
    const noAi = analyzeProjects([project], [s1, s2], 6, 0);
    expect(noAi[0].level).toBe("error");

    // With +1.0 AI: s1 has 0.6, s2 has 1.2 → s2 fits → warn (not assigned squad)
    const withAi = analyzeProjects([project], [s1, s2], 6, 1.0);
    expect(withAi[0].level).toBe("warn");
  });
});
