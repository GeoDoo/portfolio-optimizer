import { describe, it, expect } from "vitest";
import { runComparison, pctChange } from "../ai-comparison";
import { Squad, Project } from "../types";

function makeSquad(id: string, fe: number, be: number, pm = 1): Squad {
  const members = [];
  for (let i = 0; i < pm; i++)
    members.push({ id: `${id}-pm-${i}`, role: "pm" as const, allocation: 100 });
  for (let i = 0; i < fe; i++)
    members.push({ id: `${id}-fe-${i}`, role: "fe" as const, allocation: 100 });
  for (let i = 0; i < be; i++)
    members.push({ id: `${id}-be-${i}`, role: "be" as const, allocation: 100 });
  return { id, name: `Squad ${id}`, members };
}

function makeProject(
  id: string,
  squadId: string,
  overrides: Partial<Project> = {},
): Project {
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

describe("pctChange", () => {
  it("returns 0 when both are 0", () => {
    expect(pctChange(0, 0)).toBe(0);
  });

  it("returns 100 when from is 0 and to is positive", () => {
    expect(pctChange(0, 5)).toBe(100);
  });

  it("calculates positive change", () => {
    expect(pctChange(10, 15)).toBe(50);
  });

  it("calculates negative change", () => {
    expect(pctChange(10, 5)).toBe(-50);
  });
});

describe("runComparison", () => {
  it("returns all four scenario metrics", () => {
    const squads = [makeSquad("s1", 2, 2)];
    const projects = [makeProject("p1", "s1")];
    const result = runComparison(squads, projects, 6, 12);

    expect(result.traditional).toBeDefined();
    expect(result.noOverhead).toBeDefined();
    expect(result.sameTeamAI).toBeDefined();
    expect(result.miniSquad).toBeDefined();
  });

  it("derives overhead gain when overhead > 0", () => {
    const squads = [makeSquad("s1", 1, 1)];
    const projects = [
      makeProject("p1", "s1", { duration: 5 }),
      makeProject("p2", "s1", { duration: 5 }),
    ];
    const result = runComparison(squads, projects, 9, 30);

    expect(result.overheadGainPct).toBeGreaterThanOrEqual(0);
    expect(result.noOverhead.scheduledCount).toBeGreaterThanOrEqual(
      result.traditional.scheduledCount,
    );
  });

  it("overhead gain is 0 when overhead is 0", () => {
    const squads = [makeSquad("s1", 2, 2)];
    const projects = [makeProject("p1", "s1")];
    const result = runComparison(squads, projects, 6, 0);

    expect(result.overheadGainPct).toBe(0);
  });

  it("full-stack flexibility gain >= 0", () => {
    const squads = [makeSquad("s1", 2, 2)];
    const projects = [makeProject("p1", "s1")];
    const result = runComparison(squads, projects, 6, 10);

    expect(result.flexibilityGainPct).toBeGreaterThanOrEqual(0);
  });

  it("total gain = overhead + flexibility", () => {
    const squads = [makeSquad("s1", 2, 1)];
    const projects = [
      makeProject("p1", "s1"),
      makeProject("p2", "s1"),
      makeProject("p3", "s1"),
    ];
    const result = runComparison(squads, projects, 9, 15);

    expect(result.totalGainPct).toBeCloseTo(
      result.overheadGainPct + result.flexibilityGainPct,
      0.5,
    );
  });

  it("same team AI schedules at least as many projects as traditional", () => {
    const squads = [makeSquad("s1", 2, 2), makeSquad("s2", 1, 3)];
    const projects = [
      makeProject("p1", "s1"),
      makeProject("p2", "s2"),
      makeProject("p3", "s1", { feNeeded: 2, beNeeded: 0 }),
    ];
    const result = runComparison(squads, projects, 6, 12);

    expect(result.sameTeamAI.scheduledCount).toBeGreaterThanOrEqual(
      result.traditional.scheduledCount,
    );
  });

  it("mini squad has fewer headcount than traditional", () => {
    const squads = [makeSquad("s1", 2, 2), makeSquad("s2", 3, 2)];
    const projects = [makeProject("p1", "s1")];
    const result = runComparison(squads, projects, 6, 0);

    expect(result.miniSquad.headcount).toBeLessThan(result.traditional.headcount);
  });

  it("break-even multiplier is at least 1", () => {
    const squads = [makeSquad("s1", 2, 2)];
    const projects = [
      makeProject("p1", "s1"),
      makeProject("p2", "s1"),
    ];
    const result = runComparison(squads, projects, 6, 0);

    expect(result.breakEvenMultiplier).toBeGreaterThanOrEqual(1);
  });

  it("break-even multiplier increases with more demanding workload", () => {
    const squads = [makeSquad("s1", 3, 3)];
    const lightProjects = [makeProject("p1", "s1")];
    const heavyProjects = [
      makeProject("p1", "s1", { duration: 3, feNeeded: 2, beNeeded: 2 }),
      makeProject("p2", "s1", { duration: 3, feNeeded: 2, beNeeded: 2 }),
      makeProject("p3", "s1", { duration: 3, feNeeded: 2, beNeeded: 2 }),
    ];

    const light = runComparison(squads, lightProjects, 9, 0);
    const heavy = runComparison(squads, heavyProjects, 9, 0);

    expect(heavy.breakEvenMultiplier).toBeGreaterThanOrEqual(light.breakEvenMultiplier);
  });

  it("PM members counted in headcount but not in engineering FTE", () => {
    const squad = makeSquad("s1", 1, 1, 2);
    expect(squad.members.length).toBe(4);

    const projects = [makeProject("p1", "s1")];
    const result = runComparison([squad], projects, 6, 0);

    expect(result.traditional.headcount).toBe(4);
    expect(result.traditional.engineeringFte).toBe(2);
  });

  it("entries are populated for all scenarios", () => {
    const squads = [makeSquad("s1", 2, 2)];
    const projects = [makeProject("p1", "s1"), makeProject("p2", "s1")];
    const result = runComparison(squads, projects, 6, 0);

    expect(result.traditional.entries.length).toBeGreaterThan(0);
    expect(result.sameTeamAI.entries.length).toBeGreaterThan(0);
  });

  it("flexibility gain shows when FE/BE imbalance exists", () => {
    const squads = [makeSquad("s1", 0, 4)];
    const projects = [
      makeProject("p1", "s1", { feNeeded: 2, beNeeded: 0, duration: 2 }),
    ];
    const result = runComparison(squads, projects, 6, 0);

    expect(result.traditional.scheduledCount).toBe(0);
    expect(result.sameTeamAI.scheduledCount).toBe(1);
    expect(result.flexibilityGainPct).toBeGreaterThan(0);
  });
});
