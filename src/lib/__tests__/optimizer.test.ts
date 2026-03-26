import { describe, it, expect } from "vitest";
import { optimize, getWsjf, effectiveFe, effectiveBe } from "../optimizer";
import { Project, Squad, ScheduleResult } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _id = 0;
function uid(): string {
  return `id-${++_id}`;
}

function makeSquad(
  name: string,
  fe: number[],
  be: number[],
): Squad {
  const id = uid();
  const members = [
    ...fe.map((alloc) => ({ id: uid(), role: "fe" as const, allocation: alloc })),
    ...be.map((alloc) => ({ id: uid(), role: "be" as const, allocation: alloc })),
  ];
  return { id, name, members };
}

function makeProject(
  name: string,
  overrides: Partial<Project> & { squadId: string },
): Project {
  return {
    id: uid(),
    name,
    duration: 2,
    feNeeded: 1,
    beNeeded: 1,
    businessValue: 5,
    timeCriticality: 5,
    riskReduction: 5,
    dependencies: [],
    ...overrides,
  };
}

function scheduled(result: ScheduleResult) {
  return result.entries;
}

function deferred(result: ScheduleResult) {
  return result.deferred;
}

function findEntry(result: ScheduleResult, projectId: string) {
  return result.entries.find((e) => e.projectId === projectId);
}

function totalScheduledValue(result: ScheduleResult, projects: Project[]): number {
  const map = new Map(projects.map((p) => [p.id, p]));
  return result.entries.reduce((sum, e) => {
    const p = map.get(e.projectId);
    return sum + (p ? p.businessValue + p.timeCriticality + p.riskReduction : 0);
  }, 0);
}

// ---------------------------------------------------------------------------
// 1. CORRECTNESS — basic scheduling constraints
// ---------------------------------------------------------------------------

describe("Correctness", () => {
  it("schedules a single project at month 0", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const p = makeProject("Solo", { squadId: sq.id, duration: 3 });
    const result = optimize([p], [sq], 6);

    expect(scheduled(result)).toHaveLength(1);
    expect(deferred(result)).toHaveLength(0);
    const entry = findEntry(result, p.id)!;
    expect(entry.startMonth).toBe(0);
    expect(entry.endMonth).toBe(3);
  });

  it("respects dependency ordering — B waits for A", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const a = makeProject("A", { squadId: sq.id, duration: 2 });
    const b = makeProject("B", { squadId: sq.id, duration: 2, dependencies: [a.id] });
    const result = optimize([a, b], [sq], 6);

    const ea = findEntry(result, a.id)!;
    const eb = findEntry(result, b.id)!;
    expect(eb.startMonth).toBeGreaterThanOrEqual(ea.endMonth);
  });

  it("respects transitive dependency chain A→B→C", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const a = makeProject("A", { squadId: sq.id, duration: 1 });
    const b = makeProject("B", { squadId: sq.id, duration: 1, dependencies: [a.id] });
    const c = makeProject("C", { squadId: sq.id, duration: 1, dependencies: [b.id] });
    const result = optimize([a, b, c], [sq], 6);

    const ea = findEntry(result, a.id)!;
    const eb = findEntry(result, b.id)!;
    const ec = findEntry(result, c.id)!;
    expect(eb.startMonth).toBeGreaterThanOrEqual(ea.endMonth);
    expect(ec.startMonth).toBeGreaterThanOrEqual(eb.endMonth);
  });

  it("defers project that exceeds all squad FE capacity", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const p = makeProject("BigFE", { squadId: sq.id, feNeeded: 5 });
    const result = optimize([p], [sq], 6);

    expect(scheduled(result)).toHaveLength(0);
    expect(deferred(result)).toHaveLength(1);
    expect(deferred(result)[0].projectId).toBe(p.id);
  });

  it("defers project that exceeds all squad BE capacity", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const p = makeProject("BigBE", { squadId: sq.id, beNeeded: 5 });
    const result = optimize([p], [sq], 6);

    expect(deferred(result)).toHaveLength(1);
  });

  it("defers project whose duration exceeds the horizon", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const p = makeProject("TooLong", { squadId: sq.id, duration: 7 });
    const result = optimize([p], [sq], 6);

    expect(deferred(result)).toHaveLength(1);
  });

  it("all scheduled entries fall within the horizon", () => {
    const sq = makeSquad("Alpha", [100, 100], [100, 100]);
    const projects = Array.from({ length: 5 }, (_, i) =>
      makeProject(`P${i}`, { squadId: sq.id, duration: 2 }),
    );
    const result = optimize(projects, [sq], 6);

    for (const e of scheduled(result)) {
      expect(e.startMonth).toBeGreaterThanOrEqual(0);
      expect(e.endMonth).toBeLessThanOrEqual(6);
    }
  });

  it("no two projects on the same squad exceed FE capacity in any month", () => {
    const sq = makeSquad("Alpha", [100, 100], [100, 100]);
    const projects = Array.from({ length: 4 }, (_, i) =>
      makeProject(`P${i}`, { squadId: sq.id, duration: 2, feNeeded: 1, beNeeded: 1 }),
    );
    const result = optimize(projects, [sq], 6);
    const maxFe = effectiveFe(sq);

    for (let m = 0; m < 6; m++) {
      const feUsed = result.entries
        .filter((e) => e.squadId === sq.id && e.startMonth <= m && e.endMonth > m)
        .reduce((sum, e) => {
          const p = projects.find((pr) => pr.id === e.projectId)!;
          return sum + p.feNeeded;
        }, 0);
      expect(feUsed).toBeLessThanOrEqual(maxFe);
    }
  });

  it("handles project with zero FE and zero BE needed", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const p = makeProject("NoResources", { squadId: sq.id, feNeeded: 0, beNeeded: 0, duration: 2 });
    const result = optimize([p], [sq], 6);

    expect(scheduled(result)).toHaveLength(1);
    expect(findEntry(result, p.id)!.startMonth).toBe(0);
  });

  it("handles missing dependency gracefully — treats as satisfied", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const p = makeProject("Orphan", { squadId: sq.id, dependencies: ["nonexistent-id"] });
    const result = optimize([p], [sq], 6);

    expect(scheduled(result)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. EFFECTIVENESS — maximizes delivered value
// ---------------------------------------------------------------------------

describe("Effectiveness — value maximization", () => {
  it("WSJF: short high-value project beats long low-value project for limited capacity", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const high = makeProject("HighWSJF", {
      squadId: sq.id, duration: 1,
      businessValue: 10, timeCriticality: 10, riskReduction: 10,
    });
    const low = makeProject("LowWSJF", {
      squadId: sq.id, duration: 6,
      businessValue: 1, timeCriticality: 1, riskReduction: 1,
    });

    expect(getWsjf(high)).toBeGreaterThan(getWsjf(low));

    const result = optimize([low, high], [sq], 6);
    expect(scheduled(result).map((e) => e.projectId)).toContain(high.id);
  });

  it("chain-aware WSJF: blocker of high-value project is scheduled first", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const blocker = makeProject("Blocker", {
      squadId: sq.id, duration: 1,
      businessValue: 1, timeCriticality: 1, riskReduction: 1,
    });
    const highValue = makeProject("HighValue", {
      squadId: sq.id, duration: 2, dependencies: [blocker.id],
      businessValue: 10, timeCriticality: 10, riskReduction: 10,
    });
    const competitor = makeProject("Competitor", {
      squadId: sq.id, duration: 1,
      businessValue: 3, timeCriticality: 3, riskReduction: 3,
    });

    const result = optimize([competitor, highValue, blocker], [sq], 6);
    const eBlocker = findEntry(result, blocker.id)!;
    const eCompetitor = findEntry(result, competitor.id)!;

    // Blocker should start at 0 (before competitor) because it unlocks high-value work
    expect(eBlocker.startMonth).toBeLessThanOrEqual(eCompetitor.startMonth);
  });

  it("1-for-1 swap: replaces low-value scheduled with high-value deferred", () => {
    // Squad can only fit 1 project at a time. 2 projects compete.
    const sq = makeSquad("Alpha", [100], [100]);
    const low = makeProject("Low", {
      squadId: sq.id, duration: 6,
      businessValue: 1, timeCriticality: 1, riskReduction: 1,
    });
    const high = makeProject("High", {
      squadId: sq.id, duration: 6,
      businessValue: 10, timeCriticality: 10, riskReduction: 10,
    });

    // Both need the full horizon — only one can fit
    const result = optimize([low, high], [sq], 6);

    expect(scheduled(result).map((e) => e.projectId)).toContain(high.id);
    expect(deferred(result).map((d) => d.projectId)).toContain(low.id);
  });

  it("multi-swap: removes multiple low-value to fit one high-value", () => {
    // Squad has 2 FE, 2 BE. Two small low-value projects fill it.
    // One large high-value project needs 2 FE, 2 BE — can only fit if both smalls are removed.
    const sq = makeSquad("Alpha", [100, 100], [100, 100]);
    const small1 = makeProject("Small1", {
      squadId: sq.id, duration: 6, feNeeded: 1, beNeeded: 1,
      businessValue: 1, timeCriticality: 1, riskReduction: 1,
    });
    const small2 = makeProject("Small2", {
      squadId: sq.id, duration: 6, feNeeded: 1, beNeeded: 1,
      businessValue: 1, timeCriticality: 1, riskReduction: 1,
    });
    const big = makeProject("Big", {
      squadId: sq.id, duration: 6, feNeeded: 2, beNeeded: 2,
      businessValue: 10, timeCriticality: 10, riskReduction: 10,
    });

    const result = optimize([small1, small2, big], [sq], 6);

    // Big (value=30) should replace both smalls (total value=6)
    expect(scheduled(result).map((e) => e.projectId)).toContain(big.id);
    expect(totalScheduledValue(result, [small1, small2, big])).toBeGreaterThanOrEqual(30);
  });

  it("cross-squad fallback: project moves to available squad when preferred is full", () => {
    const sq1 = makeSquad("Full", [100], [100]);
    const sq2 = makeSquad("Free", [100], [100]);
    // Filler has much higher value so it claims sq1
    const filler = makeProject("Filler", {
      squadId: sq1.id, duration: 6,
      businessValue: 10, timeCriticality: 10, riskReduction: 10,
    });
    const overflow = makeProject("Overflow", {
      squadId: sq1.id, duration: 3,
      businessValue: 2, timeCriticality: 2, riskReduction: 2,
    });

    const result = optimize([filler, overflow], [sq1, sq2], 6);

    // Both scheduled — overflow had to move to another squad or wait
    expect(scheduled(result)).toHaveLength(2);
    const eFiller = findEntry(result, filler.id)!;
    const eOverflow = findEntry(result, overflow.id)!;
    // Filler stays on sq1 (higher value), overflow goes to sq2
    expect(eFiller.squadId).toBe(sq1.id);
    expect(eOverflow.squadId).toBe(sq2.id);
  });

  it("maximizes total value when capacity is insufficient for all projects", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const projects = [
      makeProject("Val10", { squadId: sq.id, duration: 3, businessValue: 10, timeCriticality: 0, riskReduction: 0 }),
      makeProject("Val8", { squadId: sq.id, duration: 3, businessValue: 8, timeCriticality: 0, riskReduction: 0 }),
      makeProject("Val2", { squadId: sq.id, duration: 3, businessValue: 2, timeCriticality: 0, riskReduction: 0 }),
    ];
    // Only 6 months, each takes 3 → only 2 fit
    const result = optimize(projects, [sq], 6);

    expect(scheduled(result)).toHaveLength(2);
    const scheduledIds = new Set(scheduled(result).map((e) => e.projectId));
    expect(scheduledIds.has(projects[0].id)).toBe(true);
    expect(scheduledIds.has(projects[1].id)).toBe(true);
    expect(scheduledIds.has(projects[2].id)).toBe(false);
  });

  it("deadline tiebreaker: among equal WSJF, earlier deadline wins", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const urgent = makeProject("Urgent", {
      squadId: sq.id, duration: 2,
      businessValue: 5, timeCriticality: 5, riskReduction: 5, deadline: 2,
    });
    const relaxed = makeProject("Relaxed", {
      squadId: sq.id, duration: 2,
      businessValue: 5, timeCriticality: 5, riskReduction: 5, deadline: 6,
    });

    const result = optimize([relaxed, urgent], [sq], 6);
    const eUrgent = findEntry(result, urgent.id)!;
    const eRelaxed = findEntry(result, relaxed.id)!;

    expect(eUrgent.startMonth).toBeLessThanOrEqual(eRelaxed.startMonth);
  });
});

// ---------------------------------------------------------------------------
// 3. EFFICIENCY — minimizes waste / idle time
// ---------------------------------------------------------------------------

describe("Efficiency — capacity utilization", () => {
  it("parallel projects: two projects run simultaneously when squad has capacity", () => {
    const sq = makeSquad("Alpha", [100, 100], [100, 100]);
    const a = makeProject("A", { squadId: sq.id, duration: 3, feNeeded: 1, beNeeded: 1 });
    const b = makeProject("B", { squadId: sq.id, duration: 3, feNeeded: 1, beNeeded: 1 });

    const result = optimize([a, b], [sq], 6);

    const ea = findEntry(result, a.id)!;
    const eb = findEntry(result, b.id)!;
    // Both should start at month 0 since the squad has 2FE/2BE
    expect(ea.startMonth).toBe(0);
    expect(eb.startMonth).toBe(0);
  });

  it("gap-fill: squeezes deferred project into remaining capacity", () => {
    const sq = makeSquad("Alpha", [100, 100], [100, 100]);
    // Big has much higher value so it goes first and uses all capacity
    const big = makeProject("Big", {
      squadId: sq.id, duration: 4, feNeeded: 2, beNeeded: 2,
      businessValue: 10, timeCriticality: 10, riskReduction: 10,
    });
    const small = makeProject("Small", {
      squadId: sq.id, duration: 2, feNeeded: 1, beNeeded: 1,
      businessValue: 1, timeCriticality: 1, riskReduction: 1,
    });

    const result = optimize([big, small], [sq], 6);

    // Both scheduled. Big uses all 2FE/2BE months 0-3, small fits months 4-5
    expect(scheduled(result)).toHaveLength(2);
    const eBig = findEntry(result, big.id)!;
    const eSmall = findEntry(result, small.id)!;
    expect(eBig.startMonth).toBe(0);
    expect(eSmall.startMonth).toBeGreaterThanOrEqual(4);
  });

  it("compaction: pulls projects as early as possible", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const a = makeProject("A", { squadId: sq.id, duration: 2 });
    const b = makeProject("B", { squadId: sq.id, duration: 2 });

    const result = optimize([a, b], [sq], 10);

    const ea = findEntry(result, a.id)!;
    const eb = findEntry(result, b.id)!;
    // Should be back-to-back, no gap
    const earliest = Math.min(ea.startMonth, eb.startMonth);
    const latest = Math.max(ea.endMonth, eb.endMonth);
    expect(earliest).toBe(0);
    expect(latest).toBe(4); // 2+2 with no gap
  });

  it("cross-squad compaction: moves project to earlier squad when possible", () => {
    const sq1 = makeSquad("Busy", [100], [100]);
    const sq2 = makeSquad("Free", [100], [100]);

    // Filler has much higher value so it claims sq1 months 0-3
    const filler = makeProject("Filler", {
      squadId: sq1.id, duration: 4,
      businessValue: 10, timeCriticality: 10, riskReduction: 10,
    });
    // Late has lower value, assigned to sq1 but sq1 is busy
    const late = makeProject("Late", {
      squadId: sq1.id, duration: 2,
      businessValue: 2, timeCriticality: 2, riskReduction: 2,
    });

    const result = optimize([filler, late], [sq1, sq2], 6);

    const eFiller = findEntry(result, filler.id)!;
    const eLate = findEntry(result, late.id)!;
    // Filler stays on sq1 at month 0
    expect(eFiller.squadId).toBe(sq1.id);
    expect(eFiller.startMonth).toBe(0);
    // Late compacted to sq2 starting at month 0 (cross-squad move)
    expect(eLate.startMonth).toBe(0);
    expect(eLate.squadId).toBe(sq2.id);
  });

  it("full utilization: all capacity used when projects exactly fill it", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const projects = [
      makeProject("P1", { squadId: sq.id, duration: 2 }),
      makeProject("P2", { squadId: sq.id, duration: 2 }),
      makeProject("P3", { squadId: sq.id, duration: 2 }),
    ];
    // 3 projects × 2 months = 6 months, exactly fills horizon
    const result = optimize(projects, [sq], 6);

    expect(scheduled(result)).toHaveLength(3);
    expect(deferred(result)).toHaveLength(0);

    const months = new Set<number>();
    for (const e of result.entries) {
      for (let m = e.startMonth; m < e.endMonth; m++) months.add(m);
    }
    expect(months.size).toBe(6);
  });

  it("spreads work across squads instead of overloading one", () => {
    const sq1 = makeSquad("S1", [100], [100]);
    const sq2 = makeSquad("S2", [100], [100]);

    // 4 projects, each needs 1 FE 1 BE for 3 months. Preferred squad = sq1.
    // sq1 can only fit 2 (months 0-3, 3-6). The other 2 should overflow to sq2.
    const projects = Array.from({ length: 4 }, (_, i) =>
      makeProject(`P${i}`, { squadId: sq1.id, duration: 3 }),
    );
    const result = optimize(projects, [sq1, sq2], 6);

    expect(scheduled(result)).toHaveLength(4);
    expect(deferred(result)).toHaveLength(0);
    const onSq2 = result.entries.filter((e) => e.squadId === sq2.id);
    expect(onSq2.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 4. EDGE CASES
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
  it("empty projects → empty result", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const result = optimize([], [sq], 6);

    expect(scheduled(result)).toHaveLength(0);
    expect(deferred(result)).toHaveLength(0);
  });

  it("empty squads → empty result", () => {
    const p = makeProject("Solo", { squadId: "nonexistent" });
    const result = optimize([p], [], 6);

    expect(scheduled(result)).toHaveLength(0);
    expect(deferred(result)).toHaveLength(0);
  });

  it("horizon of 1 month — only 1-month projects fit", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const fits = makeProject("Fits", { squadId: sq.id, duration: 1 });
    const nope = makeProject("Nope", { squadId: sq.id, duration: 2 });
    const result = optimize([fits, nope], [sq], 1);

    expect(scheduled(result)).toHaveLength(1);
    expect(findEntry(result, fits.id)).toBeDefined();
    expect(deferred(result)).toHaveLength(1);
  });

  it("partial allocation: 50% FE = 0.5 effective FE", () => {
    const sq = makeSquad("Alpha", [50], [100]);
    expect(effectiveFe(sq)).toBeCloseTo(0.5);

    const p = makeProject("NeedsFull", { squadId: sq.id, feNeeded: 1 });
    const result = optimize([p], [sq], 6);

    // 0.5 FE < 1 FE needed → deferred
    expect(deferred(result)).toHaveLength(1);
  });

  it("partial allocation: two 50% FEs combine to support 1 FE project", () => {
    const sq = makeSquad("Alpha", [50, 50], [100]);
    expect(effectiveFe(sq)).toBeCloseTo(1.0);

    const p = makeProject("Fits", { squadId: sq.id, feNeeded: 1 });
    const result = optimize([p], [sq], 6);

    expect(scheduled(result)).toHaveLength(1);
  });

  it("all projects deferred when all exceed capacity", () => {
    const sq = makeSquad("Tiny", [100], []);
    const projects = [
      makeProject("A", { squadId: sq.id, feNeeded: 1, beNeeded: 1 }),
      makeProject("B", { squadId: sq.id, feNeeded: 1, beNeeded: 1 }),
    ];
    // Squad has 0 BE → nothing fits
    const result = optimize(projects, [sq], 6);

    expect(scheduled(result)).toHaveLength(0);
    expect(deferred(result)).toHaveLength(2);
  });

  it("many squads, one project → placed on preferred squad", () => {
    const squads = Array.from({ length: 5 }, (_, i) =>
      makeSquad(`S${i}`, [100], [100]),
    );
    const p = makeProject("Solo", { squadId: squads[2].id, duration: 1 });
    const result = optimize([p], squads, 6);

    expect(scheduled(result)).toHaveLength(1);
    expect(findEntry(result, p.id)!.squadId).toBe(squads[2].id);
  });

  it("diamond dependency: A→B, A→C, B→D, C→D", () => {
    const sq = makeSquad("Alpha", [100, 100], [100, 100]);
    const a = makeProject("A", { squadId: sq.id, duration: 1 });
    const b = makeProject("B", { squadId: sq.id, duration: 1, dependencies: [a.id] });
    const c = makeProject("C", { squadId: sq.id, duration: 1, dependencies: [a.id] });
    const d = makeProject("D", { squadId: sq.id, duration: 1, dependencies: [b.id, c.id] });

    const result = optimize([a, b, c, d], [sq], 6);

    expect(scheduled(result)).toHaveLength(4);
    const ea = findEntry(result, a.id)!;
    const eb = findEntry(result, b.id)!;
    const ec = findEntry(result, c.id)!;
    const ed = findEntry(result, d.id)!;

    expect(eb.startMonth).toBeGreaterThanOrEqual(ea.endMonth);
    expect(ec.startMonth).toBeGreaterThanOrEqual(ea.endMonth);
    expect(ed.startMonth).toBeGreaterThanOrEqual(eb.endMonth);
    expect(ed.startMonth).toBeGreaterThanOrEqual(ec.endMonth);
  });

  it("large portfolio: 20 projects across 3 squads completes without error", () => {
    const squads = [
      makeSquad("S1", [100, 100], [100]),
      makeSquad("S2", [100], [100, 100]),
      makeSquad("S3", [100, 100], [100, 100]),
    ];
    const projects = Array.from({ length: 20 }, (_, i) =>
      makeProject(`P${i}`, {
        squadId: squads[i % 3].id,
        duration: 1 + (i % 3),
        feNeeded: 1,
        beNeeded: 1,
        businessValue: 10 - (i % 5),
        timeCriticality: 5,
        riskReduction: 3,
      }),
    );

    const result = optimize(projects, squads, 12);

    expect(scheduled(result).length + deferred(result).length).toBe(20);
    // All scheduled entries within horizon
    for (const e of result.entries) {
      expect(e.endMonth).toBeLessThanOrEqual(12);
    }
  });

  it("project with only FE needed (0 BE) schedules correctly", () => {
    const sq = makeSquad("Alpha", [100], []);
    const p = makeProject("FEOnly", { squadId: sq.id, duration: 2, feNeeded: 1, beNeeded: 0 });
    const result = optimize([p], [sq], 6);

    expect(scheduled(result)).toHaveLength(1);
  });

  it("project with only BE needed (0 FE) schedules correctly", () => {
    const sq = makeSquad("Alpha", [], [100]);
    const p = makeProject("BEOnly", { squadId: sq.id, duration: 2, feNeeded: 0, beNeeded: 1 });
    const result = optimize([p], [sq], 6);

    expect(scheduled(result)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 5. SCORING — WSJF correctness
// ---------------------------------------------------------------------------

describe("WSJF scoring", () => {
  it("WSJF = (BV + TC + RR) / (duration * (FE + BE))", () => {
    const p = makeProject("Test", {
      squadId: "x",
      duration: 2,
      feNeeded: 1,
      beNeeded: 1,
      businessValue: 8,
      timeCriticality: 4,
      riskReduction: 2,
    });
    // (8 + 4 + 2) / (2 * (1 + 1)) = 14 / 4 = 3.5
    expect(getWsjf(p)).toBeCloseTo(3.5);
  });

  it("higher BV increases WSJF", () => {
    const base = { squadId: "x", duration: 2, feNeeded: 1, beNeeded: 1, timeCriticality: 5, riskReduction: 5 };
    const low = makeProject("Low", { ...base, businessValue: 2 });
    const high = makeProject("High", { ...base, businessValue: 10 });

    expect(getWsjf(high)).toBeGreaterThan(getWsjf(low));
  });

  it("longer duration decreases WSJF", () => {
    const base = { squadId: "x", feNeeded: 1, beNeeded: 1, businessValue: 10, timeCriticality: 5, riskReduction: 5 };
    const short = makeProject("Short", { ...base, duration: 1 });
    const long = makeProject("Long", { ...base, duration: 6 });

    expect(getWsjf(short)).toBeGreaterThan(getWsjf(long));
  });

  it("more people needed decreases WSJF", () => {
    const base = { squadId: "x", duration: 2, businessValue: 10, timeCriticality: 5, riskReduction: 5 };
    const lean = makeProject("Lean", { ...base, feNeeded: 1, beNeeded: 0 });
    const heavy = makeProject("Heavy", { ...base, feNeeded: 3, beNeeded: 3 });

    expect(getWsjf(lean)).toBeGreaterThan(getWsjf(heavy));
  });

  it("zero-size project gets WSJF of 0", () => {
    const p = makeProject("Zero", {
      squadId: "x", duration: 0, feNeeded: 0, beNeeded: 0,
    });
    expect(getWsjf(p)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. CAPACITY HELPERS
// ---------------------------------------------------------------------------

describe("Capacity helpers", () => {
  it("effectiveFe sums FE allocations as fractions", () => {
    const sq = makeSquad("Test", [100, 80, 50], [100]);
    expect(effectiveFe(sq)).toBeCloseTo(2.3);
  });

  it("effectiveBe sums BE allocations as fractions", () => {
    const sq = makeSquad("Test", [100], [100, 60]);
    expect(effectiveBe(sq)).toBeCloseTo(1.6);
  });

  it("squad with no members has 0 capacity", () => {
    const sq: Squad = { id: uid(), name: "Empty", members: [] };
    expect(effectiveFe(sq)).toBe(0);
    expect(effectiveBe(sq)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. INTEGRATION — realistic scenarios
// ---------------------------------------------------------------------------

describe("Integration — realistic portfolio scenarios", () => {
  it("scenario: 3 squads, 10 projects, dependencies — maximizes throughput", () => {
    const payments = makeSquad("Payments", [100, 100], [100, 100]);
    const growth = makeSquad("Growth", [100, 100], [100]);
    const platform = makeSquad("Platform", [100], [100, 100, 80]);
    const squads = [payments, growth, platform];

    const checkout = makeProject("Checkout v2", {
      squadId: payments.id, duration: 3, feNeeded: 2, beNeeded: 1,
      businessValue: 9, timeCriticality: 8, riskReduction: 3,
    });
    const payRetry = makeProject("Payment retry", {
      squadId: payments.id, duration: 1, feNeeded: 1, beNeeded: 0,
      businessValue: 7, timeCriticality: 8, riskReduction: 6, dependencies: [checkout.id],
    });
    const subBilling = makeProject("Subscription billing", {
      squadId: payments.id, duration: 2, feNeeded: 1, beNeeded: 1,
      businessValue: 8, timeCriticality: 7, riskReduction: 4, dependencies: [checkout.id],
    });
    const referral = makeProject("Referral program", {
      squadId: growth.id, duration: 2, feNeeded: 2, beNeeded: 1,
      businessValue: 7, timeCriticality: 6, riskReduction: 5,
    });
    const dashAnalytics = makeProject("Dashboard analytics", {
      squadId: growth.id, duration: 2, feNeeded: 1, beNeeded: 1,
      businessValue: 5, timeCriticality: 4, riskReduction: 3,
    });
    const apiMigration = makeProject("API v3 migration", {
      squadId: platform.id, duration: 4, feNeeded: 0, beNeeded: 2,
      businessValue: 8, timeCriticality: 9, riskReduction: 10,
    });
    const mobileNotifs = makeProject("Mobile push notifs", {
      squadId: platform.id, duration: 1, feNeeded: 1, beNeeded: 1,
      businessValue: 4, timeCriticality: 3, riskReduction: 2,
    });
    const adminPortal = makeProject("Admin portal", {
      squadId: growth.id, duration: 2, feNeeded: 1, beNeeded: 1,
      businessValue: 3, timeCriticality: 2, riskReduction: 2,
    });
    const searchOverhaul = makeProject("Search overhaul", {
      squadId: platform.id, duration: 3, feNeeded: 1, beNeeded: 2,
      businessValue: 6, timeCriticality: 5, riskReduction: 4,
      dependencies: [apiMigration.id],
    });
    const onboarding = makeProject("Onboarding revamp", {
      squadId: growth.id, duration: 2, feNeeded: 2, beNeeded: 2,
      businessValue: 6, timeCriticality: 5, riskReduction: 4,
    });

    const projects = [
      checkout, payRetry, subBilling, referral, dashAnalytics,
      apiMigration, mobileNotifs, adminPortal, searchOverhaul, onboarding,
    ];

    const result = optimize(projects, squads, 9);

    // Core assertions
    expect(scheduled(result).length).toBeGreaterThan(0);
    expect(scheduled(result).length + deferred(result).length).toBe(10);

    // Dependency ordering
    const eCheckout = findEntry(result, checkout.id);
    const ePayRetry = findEntry(result, payRetry.id);
    if (eCheckout && ePayRetry) {
      expect(ePayRetry.startMonth).toBeGreaterThanOrEqual(eCheckout.endMonth);
    }

    const eApi = findEntry(result, apiMigration.id);
    const eSearch = findEntry(result, searchOverhaul.id);
    if (eApi && eSearch) {
      expect(eSearch.startMonth).toBeGreaterThanOrEqual(eApi.endMonth);
    }

    // High-value projects should be scheduled (not deferred)
    const scheduledIds = new Set(scheduled(result).map((e) => e.projectId));
    expect(scheduledIds.has(apiMigration.id)).toBe(true);
    expect(scheduledIds.has(checkout.id)).toBe(true);
  });

  it("scenario: all same priority — fills capacity optimally", () => {
    const sq = makeSquad("Alpha", [100, 100], [100, 100]);
    const projects = Array.from({ length: 6 }, (_, i) =>
      makeProject(`P${i}`, {
        squadId: sq.id, duration: 2, feNeeded: 1, beNeeded: 1,
        businessValue: 5, timeCriticality: 5, riskReduction: 5,
      }),
    );

    const result = optimize(projects, [sq], 6);

    // 2 parallel (using 2FE/2BE) × 3 batches = 6 projects in 6 months
    expect(scheduled(result)).toHaveLength(6);
    expect(deferred(result)).toHaveLength(0);
  });

  it("scenario: overcommitted portfolio — defers lowest value", () => {
    const sq = makeSquad("Alpha", [100], [100]);
    const projects = [
      makeProject("Star", { squadId: sq.id, duration: 3, businessValue: 10, timeCriticality: 10, riskReduction: 10 }),
      makeProject("Good", { squadId: sq.id, duration: 3, businessValue: 7, timeCriticality: 7, riskReduction: 7 }),
      makeProject("Meh", { squadId: sq.id, duration: 3, businessValue: 2, timeCriticality: 2, riskReduction: 2 }),
    ];

    const result = optimize(projects, [sq], 6);

    expect(scheduled(result)).toHaveLength(2);
    const deferredIds = deferred(result).map((d) => d.projectId);
    expect(deferredIds).toContain(projects[2].id); // "Meh" should be deferred
  });

  it("scenario: dependency chain blocks capacity — optimizer resolves it", () => {
    const sq = makeSquad("Alpha", [100], [100]);

    // Chain: Foundation → Core → Feature. Each 2 months.
    // Total = 6 months = exactly the horizon. Must schedule sequentially.
    const foundation = makeProject("Foundation", {
      squadId: sq.id, duration: 2,
      businessValue: 3, timeCriticality: 3, riskReduction: 3,
    });
    const core = makeProject("Core", {
      squadId: sq.id, duration: 2, dependencies: [foundation.id],
      businessValue: 5, timeCriticality: 5, riskReduction: 5,
    });
    const feature = makeProject("Feature", {
      squadId: sq.id, duration: 2, dependencies: [core.id],
      businessValue: 8, timeCriticality: 8, riskReduction: 8,
    });

    const result = optimize([feature, core, foundation], [sq], 6);

    expect(scheduled(result)).toHaveLength(3);
    const ef = findEntry(result, foundation.id)!;
    const ec = findEntry(result, core.id)!;
    const efe = findEntry(result, feature.id)!;

    expect(ef.startMonth).toBe(0);
    expect(ec.startMonth).toBe(2);
    expect(efe.startMonth).toBe(4);
  });
});
