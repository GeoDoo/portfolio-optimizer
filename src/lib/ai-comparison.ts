import {
  Squad,
  Project,
  ComparisonMetrics,
  ComparisonResult,
  ScheduleResult,
} from "./types";
import { optimize, effectiveFe, effectiveBe } from "./optimizer";

/**
 * Same team composition but everyone becomes full-stack. Each engineer's
 * capacity is applied to BOTH FE and BE pools (they can flex to whatever
 * the project needs). PMs stay as PMs.
 */
function buildFullStackSquads(squads: Squad[]): Squad[] {
  return squads.map((s) => {
    const pms = s.members.filter((m) => m.role === "pm");
    const engineers = s.members.filter((m) => m.role !== "pm");
    const totalCapacity = engineers.reduce((sum, m) => sum + m.allocation, 0);
    return {
      id: s.id,
      name: s.name,
      members: [
        ...pms,
        { id: `${s.id}-fs-fe`, role: "fe" as const, allocation: totalCapacity },
        { id: `${s.id}-fs-be`, role: "be" as const, allocation: totalCapacity },
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
      { id: `${s.id}-ai-pm`, role: "pm" as const, allocation: 100 },
      { id: `${s.id}-ai-fe`, role: "fe" as const, allocation: Math.round(multiplier * 100) },
      { id: `${s.id}-ai-be`, role: "be" as const, allocation: Math.round(multiplier * 100) },
    ],
  }));
}

function engineeringFte(squads: Squad[], overheadPct: number): number {
  const factor = 1 - overheadPct / 100;
  return squads.reduce(
    (sum, s) =>
      sum +
      s.members
        .filter((m) => m.role !== "pm")
        .reduce((ms, m) => ms + (m.allocation / 100) * factor, 0),
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
  squads: Squad[],
  projects: Project[],
  schedule: ScheduleResult,
  overheadPct: number,
): ComparisonMetrics {
  const headcount = squads.reduce((sum, s) => sum + s.members.length, 0);
  const engFte = engineeringFte(squads, overheadPct);
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

  const feCap = squads.reduce((s, sq) => s + effectiveFe(sq, overheadPct), 0);
  const beCap = squads.reduce((s, sq) => s + effectiveBe(sq, overheadPct), 0);
  const horizonForUtil = lastMonth || 1;
  const totalCap = (feCap + beCap) * horizonForUtil;
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
): number {
  let lo = 0.5;
  let hi = 10;

  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2;
    const miniSquads = buildMiniSquads(squads, mid);
    const result = optimize(projects, miniSquads, horizonMonths, 0);
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
): ComparisonResult {
  // 1. Traditional: current setup with FE/BE constraints + overhead
  const tradSchedule = optimize(projects, squads, horizonMonths, cycleOverheadPct);
  const traditional = collectMetrics(
    "Traditional", squads, projects, tradSchedule, cycleOverheadPct,
  );

  // 2. No overhead: same FE/BE split, but 0% overhead — isolates overhead cost
  const noOverheadSchedule = optimize(projects, squads, horizonMonths, 0);
  const noOverhead = collectMetrics(
    "No overhead", squads, projects, noOverheadSchedule, 0,
  );

  // 3. Same team, AI-enabled: same headcount, full-stack + 0% overhead
  const fsSquads = buildFullStackSquads(squads);
  const fsSchedule = optimize(projects, fsSquads, horizonMonths, 0);
  const sameTeamAI = collectMetrics(
    "Same team, AI-enabled", fsSquads, projects, fsSchedule, 0,
  );

  // 4. Mini squad: 1 eng + 1 PM per squad, at 1x — shows baseline mini squad output
  const miniSquads = buildMiniSquads(squads, 1);
  const miniSchedule = optimize(projects, miniSquads, horizonMonths, 0);
  const miniSquad = collectMetrics(
    "AI mini squad (1x)", miniSquads, projects, miniSchedule, 0,
  );

  // Derived insights
  const tradValue = traditional.totalValueDelivered || 1;
  const overheadGainPct =
    tradValue > 0
      ? ((noOverhead.totalValueDelivered - traditional.totalValueDelivered) / tradValue) * 100
      : 0;

  const flexibilityGainPct =
    tradValue > 0
      ? ((sameTeamAI.totalValueDelivered - noOverhead.totalValueDelivered) / tradValue) * 100
      : 0;

  const totalGainPct =
    tradValue > 0
      ? ((sameTeamAI.totalValueDelivered - traditional.totalValueDelivered) / tradValue) * 100
      : 0;

  const breakEvenMultiplier = findBreakEvenMultiplier(
    squads, projects, horizonMonths, score(tradSchedule, projects),
  );

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
