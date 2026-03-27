import { describe, it, expect } from "vitest";
import {
  mulberry32,
  hashInputs,
  perturbProjects,
  perturbDependencies,
  aggregateRuns,
  runSimulation,
} from "../simulator";
import { Project, Squad, ScheduleResult, UncertaintyParams } from "../types";

function makeProject(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    name: `Project ${id}`,
    duration: 2,
    feNeeded: 1,
    beNeeded: 1,
    businessValue: 5,
    timeCriticality: 5,
    riskReduction: 3,
    squadId: "s1",
    dependencies: [],
    ...overrides,
  };
}

function makeSquad(id: string): Squad {
  return {
    id,
    name: `Squad ${id}`,
    members: [
      { id: `${id}-fe`, role: "fe", allocation: 100, skill: 1 },
      { id: `${id}-be`, role: "be", allocation: 100, skill: 1 },
    ],
  };
}

const ZERO_UNCERTAINTY: UncertaintyParams = {
  estimationErrorPct: 0,
  interruptionProbPct: 0,
  dependencyDelayPct: 0,
  reworkProbPct: 0,
};

describe("mulberry32 PRNG", () => {
  it("produces reproducible sequences from the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = mulberry32(42);
    const b = mulberry32(99);
    let same = 0;
    for (let i = 0; i < 20; i++) {
      if (a() === b()) same++;
    }
    expect(same).toBeLessThan(5);
  });

  it("returns values in [0, 1)", () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("perturbProjects", () => {
  it("produces durations >= 1", () => {
    const rng = mulberry32(42);
    const projects = [makeProject("p1", { duration: 1 })];
    const params: UncertaintyParams = {
      estimationErrorPct: 80,
      reworkProbPct: 0,
      dependencyDelayPct: 0,
      interruptionProbPct: 0,
    };

    for (let i = 0; i < 100; i++) {
      const perturbed = perturbProjects(projects, params, rng);
      expect(perturbed[0].duration).toBeGreaterThanOrEqual(1);
    }
  });

  it("with 100% rework always extends duration", () => {
    const rng = mulberry32(42);
    const projects = [makeProject("p1", { duration: 4 })];
    const params: UncertaintyParams = {
      estimationErrorPct: 0,
      reworkProbPct: 100,
      dependencyDelayPct: 0,
      interruptionProbPct: 0,
    };

    for (let i = 0; i < 50; i++) {
      const perturbed = perturbProjects(projects, params, rng);
      expect(perturbed[0].duration).toBe(6); // ceil(4 * 1.5) = 6
    }
  });

  it("with 0% uncertainty returns same durations", () => {
    const rng = mulberry32(42);
    const projects = [makeProject("p1", { duration: 3 }), makeProject("p2", { duration: 5 })];

    const perturbed = perturbProjects(projects, ZERO_UNCERTAINTY, rng);
    expect(perturbed[0].duration).toBe(3);
    expect(perturbed[1].duration).toBe(5);
  });
});

describe("perturbDependencies", () => {
  it("with 100% delay adds 1 month per dependency", () => {
    const rng = mulberry32(42);
    const projects = [
      makeProject("p1"),
      makeProject("p2", { dependencies: ["p1"] }),
    ];
    const params: UncertaintyParams = {
      estimationErrorPct: 0,
      reworkProbPct: 0,
      dependencyDelayPct: 100,
      interruptionProbPct: 0,
    };

    const perturbed = perturbDependencies(projects, params, rng);
    expect(perturbed[1].duration).toBe(projects[1].duration + 1);
  });

  it("with 0% delay returns same projects", () => {
    const rng = mulberry32(42);
    const projects = [
      makeProject("p1"),
      makeProject("p2", { dependencies: ["p1"] }),
    ];

    const perturbed = perturbDependencies(projects, ZERO_UNCERTAINTY, rng);
    expect(perturbed[1].duration).toBe(projects[1].duration);
  });
});

describe("aggregateRuns", () => {
  it("computes correct percentiles for known inputs", () => {
    const projects = [makeProject("p1")];
    const runs: ScheduleResult[] = [];

    for (let i = 1; i <= 10; i++) {
      runs.push({
        entries: [{ projectId: "p1", squadId: "s1", startMonth: 0, endMonth: i }],
        deferred: [],
      });
    }

    const result = aggregateRuns(runs, projects, 1);

    expect(result.numRuns).toBe(10);
    expect(result.lastMonthP10).toBe(1);
    expect(result.lastMonthP50).toBe(5);
    expect(result.lastMonthP90).toBe(9);
    expect(result.planReliability).toBe(100);

    const ps = result.projectStats.find((s) => s.projectId === "p1")!;
    expect(ps.completionPct).toBe(100);
    expect(ps.deliveryP10).toBe(1);
    expect(ps.deliveryP50).toBe(5);
    expect(ps.deliveryP90).toBe(9);
  });

  it("plan reliability reflects deferred projects", () => {
    const projects = [makeProject("p1")];

    const scheduled: ScheduleResult = {
      entries: [{ projectId: "p1", squadId: "s1", startMonth: 0, endMonth: 2 }],
      deferred: [],
    };
    const deferred: ScheduleResult = {
      entries: [],
      deferred: [{ projectId: "p1", reason: "no capacity" }],
    };

    const runs = [scheduled, scheduled, deferred, scheduled, deferred];
    const result = aggregateRuns(runs, projects, 1);

    expect(result.planReliability).toBe(60);
  });
});

describe("runSimulation", () => {
  it("with 0% uncertainty matches deterministic optimizer", () => {
    const squads = [makeSquad("s1")];
    const projects = [makeProject("p1"), makeProject("p2")];

    const result = runSimulation({
      projects,
      squads,
      horizonMonths: 6,
      objective: "wsjf",
      aiEffect: 0,
      uncertainty: ZERO_UNCERTAINTY,
      numRuns: 10,
      deterministicScheduledCount: 2,
    });

    expect(result.planReliability).toBe(100);
    expect(result.scheduledCountP50).toBe(2);
    for (const ps of result.projectStats) {
      expect(ps.completionPct).toBe(100);
    }
  });

  it("seeded PRNG produces reproducible results", () => {
    const squads = [makeSquad("s1")];
    const projects = [makeProject("p1", { duration: 3 })];
    const params: UncertaintyParams = {
      estimationErrorPct: 30,
      reworkProbPct: 10,
      dependencyDelayPct: 15,
      interruptionProbPct: 10,
    };

    const input = {
      projects,
      squads,
      horizonMonths: 9,
      objective: "wsjf" as const,
      aiEffect: 0,
      uncertainty: params,
      numRuns: 50,
      deterministicScheduledCount: 1,
    };

    const a = runSimulation(input);
    const b = runSimulation(input);

    expect(a.planReliability).toBe(b.planReliability);
    expect(a.totalValueP50).toBe(b.totalValueP50);
    expect(a.scheduledCountP50).toBe(b.scheduledCountP50);
  });
});
