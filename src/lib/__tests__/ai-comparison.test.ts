import { describe, it, expect } from "vitest";
import { runComparison, pctChange, formatMultiplier } from "../ai-comparison";
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

describe("formatMultiplier", () => {
  it("formats 1.5 as 1.5x", () => {
    expect(formatMultiplier(1.5)).toBe("1.5x");
  });

  it("formats 2 as 2x", () => {
    expect(formatMultiplier(2)).toBe("2x");
  });
});

describe("runComparison", () => {
  it("returns traditional and 3 AI scenarios", () => {
    const squads = [makeSquad("s1", 2, 2)];
    const projects = [makeProject("p1", "s1")];
    const result = runComparison(squads, projects, 6, 12);

    expect(result.traditional).toBeDefined();
    expect(result.scenarios.conservative).toBeDefined();
    expect(result.scenarios.moderate).toBeDefined();
    expect(result.scenarios.aggressive).toBeDefined();
  });

  it("AI squads have fewer headcount than traditional", () => {
    const squads = [makeSquad("s1", 2, 2), makeSquad("s2", 3, 2)];
    const projects = [makeProject("p1", "s1")];
    const result = runComparison(squads, projects, 6, 0);

    expect(result.scenarios.moderate.headcount).toBeLessThan(result.traditional.headcount);
  });

  it("traditional overhead reduces capacity and may defer projects", () => {
    const squads = [makeSquad("s1", 1, 1)];
    const projects = [
      makeProject("p1", "s1", { duration: 5 }),
      makeProject("p2", "s1", { duration: 5 }),
    ];

    const noOverhead = runComparison(squads, projects, 9, 0);
    const highOverhead = runComparison(squads, projects, 9, 40);

    expect(highOverhead.traditional.scheduledCount).toBeLessThanOrEqual(
      noOverhead.traditional.scheduledCount,
    );
  });

  it("higher AI multiplier schedules at least as many projects", () => {
    const squads = [makeSquad("s1", 2, 2)];
    const projects = [
      makeProject("p1", "s1"),
      makeProject("p2", "s1"),
      makeProject("p3", "s1"),
    ];
    const result = runComparison(squads, projects, 6, 12);

    expect(result.scenarios.aggressive.scheduledCount).toBeGreaterThanOrEqual(
      result.scenarios.conservative.scheduledCount,
    );
  });

  it("AI squads have 0% overhead regardless of traditional overhead", () => {
    const squads = [makeSquad("s1", 1, 1)];
    const projects = [makeProject("p1", "s1", { duration: 6 })];

    const result = runComparison(squads, projects, 6, 30);
    expect(result.scenarios.moderate.scheduledCount).toBeGreaterThanOrEqual(
      result.traditional.scheduledCount,
    );
  });

  it("all scheduled projects contribute to totalValueDelivered", () => {
    const squads = [makeSquad("s1", 2, 2)];
    const projects = [
      makeProject("p1", "s1", { businessValue: 10, timeCriticality: 5, riskReduction: 3 }),
    ];
    const result = runComparison(squads, projects, 6, 0);

    expect(result.traditional.totalValueDelivered).toBe(18);
    expect(result.scenarios.moderate.totalValueDelivered).toBe(18);
  });

  it("avgLeadTime reflects project durations", () => {
    const squads = [makeSquad("s1", 2, 2)];
    const projects = [makeProject("p1", "s1", { duration: 3 })];
    const result = runComparison(squads, projects, 6, 0);

    expect(result.traditional.avgLeadTime).toBe(3);
    expect(result.scenarios.moderate.avgLeadTime).toBe(3);
  });

  it("deferred count is correct", () => {
    const squads = [makeSquad("s1", 1, 1)];
    const projects = [
      makeProject("p1", "s1", { duration: 4, feNeeded: 1, beNeeded: 1 }),
      makeProject("p2", "s1", { duration: 4, feNeeded: 1, beNeeded: 1 }),
      makeProject("p3", "s1", { duration: 4, feNeeded: 1, beNeeded: 1 }),
    ];
    const result = runComparison(squads, projects, 6, 0);

    expect(result.traditional.deferredCount).toBeGreaterThan(0);
    expect(result.traditional.scheduledCount + result.traditional.deferredCount).toBe(3);
  });

  it("PM members are counted in headcount but do not affect FE/BE capacity", () => {
    const squad = makeSquad("s1", 1, 1, 2);
    expect(squad.members.length).toBe(4);

    const projects = [makeProject("p1", "s1")];
    const result = runComparison([squad], projects, 6, 0);

    expect(result.traditional.headcount).toBe(4);
    expect(result.traditional.scheduledCount).toBe(1);
  });

  it("entries are populated for both traditional and AI results", () => {
    const squads = [makeSquad("s1", 2, 2)];
    const projects = [makeProject("p1", "s1"), makeProject("p2", "s1")];
    const result = runComparison(squads, projects, 6, 0);

    expect(result.traditional.entries.length).toBe(2);
    expect(result.scenarios.moderate.entries.length).toBe(2);
  });
});
