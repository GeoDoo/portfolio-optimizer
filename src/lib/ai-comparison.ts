import {
  Squad,
  Project,
  ComparisonMetrics,
  ComparisonResult,
  ScheduleResult,
  Objective,
} from "./types";
import { optimize, effectiveFe, effectiveBe } from "./optimizer";

/**
 * Same team composition but every engineer becomes full-stack.
 * All engineering capacity flows to BOTH FE and BE pools.
 * PMs stay as PMs. Headcount is unchanged.
 */
function buildFullStackSquads(squads: Squad[]): Squad[] {
  return squads.map((s) => {
    const pms = s.members.filter((m) => m.role === "pm");
    const engineers = s.members.filter((m) => m.role === "fe" || m.role === "be");
    const totalEffective = engineers.reduce((sum, m) => sum + m.allocation * (m.skill ?? 1), 0);
    return {
      id: s.id,
      name: s.name,
      members: [
        ...pms,
        { id: `${s.id}-fs-fe`, role: "fe" as const, allocation: totalEffective, skill: 1 },
        { id: `${s.id}-fs-be`, role: "be" as const, allocation: totalEffective, skill: 1 },
      ],
    };
  });
}

/**
 * AI mini squad: 1 full-stack engineer + 1 PM per traditional squad.
 * The engineer's capacity is `multiplier * 100` for both FE and BE.
 */
function buildMiniSquads(squads: Squad[], multiplier: number): Squad[] {
  return squads.map((s) => ({
    id: s.id,
    name: s.name,
    members: [
      { id: `${s.id}-ai-pm`, role: "pm" as const, allocation: 100, skill: 1 },
      { id: `${s.id}-ai-fe`, role: "fe" as const, allocation: Math.round(multiplier * 100), skill: 1 },
      { id: `${s.id}-ai-be`, role: "be" as const, allocation: Math.round(multiplier * 100), skill: 1 },
    ],
  }));
}

function countHeadcount(squads: Squad[]): number {
  return squads.reduce((sum, s) => sum + s.members.length, 0);
}

function countEngFte(squads: Squad[]): number {
  return squads.reduce(
    (sum, s) =>
      sum +
      s.members
        .filter((m) => m.role === "fe" || m.role === "be")
        .reduce((ms, m) => ms + m.allocation / 100, 0),
    0,
  );
}

function scheduleValue(result: ScheduleResult, projects: Project[]): number {
  const pm = new Map(projects.map((p) => [p.id, p]));
  return result.entries.reduce((sum, e) => {
    const p = pm.get(e.projectId);
    return sum + (p ? p.businessValue + p.timeCriticality + p.riskReduction : 0);
  }, 0);
}

function score(result: ScheduleResult, projects: Project[]): number {
  return result.entries.length * 100_000 + scheduleValue(result, projects);
}

function collectMetrics(
  label: string,
  schedule: ScheduleResult,
  projects: Project[],
  headcount: number,
  engFte: number,
  horizonMonths: number,
  squads: Squad[],
): ComparisonMetrics {
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  let totalValue = 0;
  let totalLeadTime = 0;
  let lastMonth = 0;

  for (const e of schedule.entries) {
    const p = projectMap.get(e.projectId);
    if (p) {
      totalValue += p.businessValue + p.timeCriticality + p.riskReduction;
      totalLeadTime += e.endMonth - e.startMonth;
    }
    if (e.endMonth > lastMonth) lastMonth = e.endMonth;
  }

  const feCap = squads.reduce((s, sq) => s + effectiveFe(sq), 0);
  const beCap = squads.reduce((s, sq) => s + effectiveBe(sq), 0);
  const totalCap = (feCap + beCap) * horizonMonths;
  const usedCap = schedule.entries.reduce((s, e) => {
    const p = projectMap.get(e.projectId);
    return s + (p ? (p.feNeeded + p.beNeeded) * (e.endMonth - e.startMonth) : 0);
  }, 0);

  return {
    label,
    headcount,
    engineeringFte: engFte,
    scheduledCount: schedule.entries.length,
    deferredCount: schedule.deferred.length,
    totalValueDelivered: totalValue,
    avgLeadTime: schedule.entries.length > 0 ? totalLeadTime / schedule.entries.length : 0,
    utilizationPct: totalCap > 0 ? (usedCap / totalCap) * 100 : 0,
    lastDeliveryMonth: lastMonth,
    entries: schedule.entries,
    deferred: schedule.deferred,
  };
}

/**
 * Binary-search for the minimum AI multiplier a mini squad (1 eng + 1 PM)
 * needs to match or exceed the traditional schedule output.
 */
function findBreakEvenMultiplier(
  squads: Squad[],
  projects: Project[],
  horizonMonths: number,
  traditionalScore: number,
  objective: Objective,
): number {
  let lo = 0.5;
  let hi = 10;

  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2;
    const miniSquads = buildMiniSquads(squads, mid);
    const result = optimize(projects, miniSquads, horizonMonths, objective);
    if (score(result, projects) >= traditionalScore) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return Math.round(hi * 10) / 10;
}

export function runComparison(
  squads: Squad[],
  projects: Project[],
  horizonMonths: number,
  cycleOverheadPct: number,
  objective: Objective = "wsjf",
): ComparisonResult {
  const tradHeadcount = countHeadcount(squads);
  const tradEngFte = countEngFte(squads);

  // 1. Traditional: current setup with FE/BE role constraints, 0% overhead
  //    (overhead is modeled theoretically, not via the scheduler — integer
  //    requirements can't be reduced by fractional overhead without breaking)
  const tradSchedule = optimize(projects, squads, horizonMonths, objective);
  const traditional = collectMetrics(
    "Current", tradSchedule, projects, tradHeadcount, tradEngFte, horizonMonths, squads,
  );

  // 2. Same team, AI-enabled: same headcount, full-stack + 0% overhead
  const fsSquads = buildFullStackSquads(squads);
  const fsSchedule = optimize(projects, fsSquads, horizonMonths, objective);
  const sameTeamAI = collectMetrics(
    "Full-stack + AI", fsSchedule, projects,
    tradHeadcount, tradEngFte, horizonMonths, fsSquads,
  );

  // 3. Mini squad: 1 eng + 1 PM per squad, at 1x baseline
  const miniSquads = buildMiniSquads(squads, 1);
  const miniHeadcount = squads.length * 2;
  const miniEngFte = squads.length * 1;
  const miniSchedule = optimize(projects, miniSquads, horizonMonths, objective);
  const miniSquad = collectMetrics(
    "Tiny AI teams", miniSchedule, projects,
    miniHeadcount, miniEngFte, horizonMonths, miniSquads,
  );

  // Derived insights

  // Overhead gain: if you lose X% to ceremony, recovering it gives
  // X/(100-X) * 100 percent more productive capacity
  const overheadGainPct = cycleOverheadPct > 0
    ? (cycleOverheadPct / (100 - cycleOverheadPct)) * 100
    : 0;

  // Flexibility gain: difference between traditional (FE/BE constrained)
  // and full-stack (unconstrained), both at 0% overhead
  const tradValue = traditional.totalValueDelivered || 1;
  const flexibilityGainPct =
    ((sameTeamAI.totalValueDelivered - traditional.totalValueDelivered) / tradValue) * 100;

  // Total gain combines overhead recovery + flexibility
  const totalGainPct = overheadGainPct + flexibilityGainPct;

  // Break-even: what multiplier does a mini squad (1 eng) need to match traditional?
  const breakEvenMultiplier = findBreakEvenMultiplier(
    squads, projects, horizonMonths, score(tradSchedule, projects), objective,
  );

  // Build a "no overhead" metrics for display (same schedule as traditional,
  // but shows what the effective capacity WOULD be with full productive time)
  const noOverhead = {
    ...traditional,
    label: "No overhead",
    engineeringFte: tradEngFte,
  };

  return {
    traditional,
    noOverhead,
    sameTeamAI,
    miniSquad,
    overheadGainPct,
    flexibilityGainPct,
    totalGainPct,
    breakEvenMultiplier,
  };
}

export function pctChange(from: number, to: number): number {
  if (from === 0) return to > 0 ? 100 : 0;
  return ((to - from) / from) * 100;
}
