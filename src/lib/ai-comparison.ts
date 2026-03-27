import {
  Squad,
  Project,
  ComparisonMetrics,
  ComparisonResult,
  ScenarioLabel,
  ScheduleResult,
} from "./types";
import { optimize, effectiveFe, effectiveBe } from "./optimizer";

const SCENARIOS: { label: ScenarioLabel; multiplier: number }[] = [
  { label: "conservative", multiplier: 1.5 },
  { label: "moderate", multiplier: 2.0 },
  { label: "aggressive", multiplier: 3.0 },
];

/**
 * Build virtual AI mini squads from traditional squads.
 * Each traditional squad → 1 AI mini squad with:
 *   - 1 PM (allocation 100%)
 *   - 1 full-stack engineer modeled as both FE and BE capacity at `multiplier` level
 *
 * The full-stack engineer's capacity is represented as two virtual members
 * (one FE, one BE) each at `multiplier * 100` allocation. This models the
 * AI-assisted engineer's ability to handle both disciplines simultaneously.
 */
function buildAISquads(squads: Squad[], multiplier: number): Squad[] {
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

function collectMetrics(
  squads: Squad[],
  projects: Project[],
  schedule: ScheduleResult,
  overheadPct: number,
): ComparisonMetrics {
  const headcount = squads.reduce((sum, s) => sum + s.members.length, 0);
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  let totalValueDelivered = 0;
  let totalLeadTime = 0;
  let lastDeliveryMonth = 0;

  for (const e of schedule.entries) {
    const p = projectMap.get(e.projectId);
    if (p) {
      totalValueDelivered += p.businessValue + p.timeCriticality + p.riskReduction;
      totalLeadTime += e.endMonth - e.startMonth;
    }
    if (e.endMonth > lastDeliveryMonth) lastDeliveryMonth = e.endMonth;
  }

  const totalFeCap = squads.reduce((sum, s) => sum + effectiveFe(s, overheadPct), 0);
  const totalBeCap = squads.reduce((sum, s) => sum + effectiveBe(s, overheadPct), 0);
  const horizonMonths = lastDeliveryMonth || 1;
  const totalCap = (totalFeCap + totalBeCap) * horizonMonths;

  const usedCap = schedule.entries.reduce((sum, e) => {
    const p = projectMap.get(e.projectId);
    if (!p) return sum;
    return sum + (p.feNeeded + p.beNeeded) * (e.endMonth - e.startMonth);
  }, 0);

  return {
    headcount,
    scheduledCount: schedule.entries.length,
    deferredCount: schedule.deferred.length,
    totalValueDelivered,
    avgLeadTime: schedule.entries.length > 0 ? totalLeadTime / schedule.entries.length : 0,
    utilizationPct: totalCap > 0 ? (usedCap / totalCap) * 100 : 0,
    lastDeliveryMonth,
    entries: schedule.entries,
    deferred: schedule.deferred,
  };
}

export function runComparison(
  squads: Squad[],
  projects: Project[],
  horizonMonths: number,
  cycleOverheadPct: number,
): ComparisonResult {
  const traditionalSchedule = optimize(projects, squads, horizonMonths, cycleOverheadPct);
  const traditional = collectMetrics(squads, projects, traditionalSchedule, cycleOverheadPct);

  const scenarios = {} as ComparisonResult["scenarios"];

  for (const { label, multiplier } of SCENARIOS) {
    const aiSquads = buildAISquads(squads, multiplier);
    const aiSchedule = optimize(projects, aiSquads, horizonMonths, 0);
    const metrics = collectMetrics(aiSquads, projects, aiSchedule, 0);
    scenarios[label] = { ...metrics, multiplier };
  }

  return { traditional, scenarios };
}

export function formatMultiplier(m: number): string {
  return `${m}x`;
}

export function pctChange(from: number, to: number): number {
  if (from === 0) return to > 0 ? 100 : 0;
  return ((to - from) / from) * 100;
}
