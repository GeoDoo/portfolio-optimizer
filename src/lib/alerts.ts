import {
  Project,
  Squad,
  Alert,
  Recommendation,
  RecommendationAction,
  OptimalPlan,
  ScheduleResult,
  ScheduleDiff,
  ScheduleEntry,
} from "./types";
import { effectiveFe, effectiveBe, optimize } from "./optimizer";

// --- Per-project feasibility alerts ---

export function analyzeProjects(
  projects: Project[],
  squads: Squad[],
  horizonMonths: number,
): Alert[] {
  return projects.map((p) => analyzeOne(p, squads, horizonMonths));
}

function analyzeOne(
  p: Project,
  squads: Squad[],
  horizonMonths: number,
): Alert {
  if (p.feNeeded === 0 && p.beNeeded === 0) {
    return { projectId: p.id, level: "ok", message: "No effort needed" };
  }

  if (p.duration > horizonMonths) {
    return {
      projectId: p.id,
      level: "error",
      message: `Duration (${p.duration}mo) exceeds horizon (${horizonMonths}mo)`,
    };
  }

  const assigned = squads.find((s) => s.id === p.squadId);
  if (!assigned) {
    return { projectId: p.id, level: "error", message: "No squad assigned" };
  }

  // Check structural fit on assigned squad
  const aFe = effectiveFe(assigned);
  const aBe = effectiveBe(assigned);
  const fitsAssigned = p.feNeeded <= aFe && p.beNeeded <= aBe;

  if (fitsAssigned) {
    return {
      projectId: p.id,
      level: "ok",
      message: `Fits on ${assigned.name} (${fmt(aFe)}FE / ${fmt(aBe)}BE available)`,
    };
  }

  // Check other squads
  for (const s of squads) {
    if (s.id === p.squadId) continue;
    const sFe = effectiveFe(s);
    const sBe = effectiveBe(s);
    if (p.feNeeded <= sFe && p.beNeeded <= sBe) {
      return {
        projectId: p.id,
        level: "warn",
        message: `Won't fit on ${assigned.name} (${fmt(aFe)}FE / ${fmt(aBe)}BE). Can fit on ${s.name}`,
      };
    }
  }

  // Doesn't fit anywhere
  const needs: string[] = [];
  if (p.feNeeded > 0) needs.push(`${p.feNeeded}FE`);
  if (p.beNeeded > 0) needs.push(`${p.beNeeded}BE`);
  const maxFe = Math.max(...squads.map(effectiveFe), 0);
  const maxBe = Math.max(...squads.map(effectiveBe), 0);
  return {
    projectId: p.id,
    level: "error",
    message: `Needs ${needs.join(" + ")} but best squad has ${fmt(maxFe)}FE / ${fmt(maxBe)}BE`,
  };
}

// --- Structural recommendations ---

export function generateRecommendations(
  projects: Project[],
  squads: Squad[],
  schedule: ScheduleResult,
  horizonMonths: number,
): Recommendation[] {
  if (schedule.deferred.length === 0) return [];

  const recs: Recommendation[] = [];
  const deferredProjects = schedule.deferred
    .map((d) => projects.find((p) => p.id === d.projectId))
    .filter(Boolean) as Project[];

  // Try flipping each BE to FE (and vice versa) per squad
  for (const squad of squads) {
    for (const member of squad.members) {
      const flippedRole = member.role === "be" ? "fe" : "be";
      const mutatedSquads = squads.map((s) =>
        s.id === squad.id
          ? {
              ...s,
              members: s.members.map((m) =>
                m.id === member.id ? { ...m, role: flippedRole as "fe" | "be" } : m,
              ),
            }
          : s,
      );

      const mutatedResult = optimize(projects, mutatedSquads, horizonMonths);
      const unlocked = schedule.deferred.filter(
        (d) => !mutatedResult.deferred.some((md) => md.projectId === d.projectId),
      );

      if (unlocked.length > 0) {
        const names = unlocked
          .map((u) => projects.find((p) => p.id === u.projectId)?.name)
          .filter(Boolean);
        recs.push({
          id: `flip-${member.id}`,
          description: `Convert 1 ${member.role.toUpperCase()} to ${flippedRole.toUpperCase()} on ${squad.name}`,
          impact: `Unlocks ${names.join(", ")}. ${mutatedResult.entries.length} projects scheduled (was ${schedule.entries.length})`,
          action: {
            type: "flip-role",
            squadId: squad.id,
            memberId: member.id,
            newRole: flippedRole as "fe" | "be",
          },
        });
      }
    }
  }

  // Try bumping under-100% members to 100%
  for (const squad of squads) {
    for (const member of squad.members) {
      if (member.allocation >= 100) continue;

      const mutatedSquads = squads.map((s) =>
        s.id === squad.id
          ? {
              ...s,
              members: s.members.map((m) =>
                m.id === member.id ? { ...m, allocation: 100 } : m,
              ),
            }
          : s,
      );

      const mutatedResult = optimize(projects, mutatedSquads, horizonMonths);
      const unlocked = schedule.deferred.filter(
        (d) => !mutatedResult.deferred.some((md) => md.projectId === d.projectId),
      );

      if (unlocked.length > 0) {
        const names = unlocked
          .map((u) => projects.find((p) => p.id === u.projectId)?.name)
          .filter(Boolean);
        recs.push({
          id: `bump-${member.id}`,
          description: `Increase ${member.role.toUpperCase()} on ${squad.name} from ${member.allocation}% to 100%`,
          impact: `Unlocks ${names.join(", ")}`,
          action: {
            type: "bump-allocation",
            squadId: squad.id,
            memberId: member.id,
            squadName: squad.name,
            newAllocation: 100,
          },
        });
      }
    }
  }

  // Try reducing FE/BE need by 1 on deferred projects
  for (const dp of deferredProjects) {
    for (const field of ["feNeeded", "beNeeded"] as const) {
      if (dp[field] <= 0) continue;

      const mutatedProjects = projects.map((p) =>
        p.id === dp.id ? { ...p, [field]: dp[field] - 1 } : p,
      );

      const mutatedResult = optimize(mutatedProjects, squads, horizonMonths);
      const wasDeferred = mutatedResult.deferred.some((d) => d.projectId === dp.id);

      if (!wasDeferred) {
        const label = field === "feNeeded" ? "FE" : "BE";
        recs.push({
          id: `reduce-${dp.id}-${field}`,
          description: `Reduce ${dp.name} ${label} requirement from ${dp[field]} to ${dp[field] - 1}`,
          impact: `Project becomes schedulable`,
          action: {
            type: "reduce-requirement",
            projectId: dp.id,
            field,
            newValue: dp[field] - 1,
          },
        });
      }
    }
  }

  // Deduplicate by keeping highest-impact (most unlocked)
  const seen = new Set<string>();
  return recs.filter((r) => {
    if (seen.has(r.description)) return false;
    seen.add(r.description);
    return true;
  });
}

// --- Impact diff ---

export function computeDiff(
  prev: ScheduleResult | null,
  next: ScheduleResult,
  projects: Project[],
): ScheduleDiff | null {
  if (!prev) return null;

  const prevMap = new Map(prev.entries.map((e) => [e.projectId, e]));
  const nextMap = new Map(next.entries.map((e) => [e.projectId, e]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const added: string[] = [];
  const removed: string[] = [];
  const moved: { projectId: string; fromStart: number; toStart: number }[] = [];
  const prevDeferredIds = new Set(prev.deferred.map((d) => d.projectId));
  const nextDeferredIds = new Set(next.deferred.map((d) => d.projectId));
  const newlyDeferred: string[] = [];
  const newlyScheduled: string[] = [];

  // Check all project IDs across both schedules
  const allIds = new Set([
    ...prev.entries.map((e) => e.projectId),
    ...next.entries.map((e) => e.projectId),
    ...prev.deferred.map((d) => d.projectId),
    ...next.deferred.map((d) => d.projectId),
  ]);

  for (const id of allIds) {
    if (!projectMap.has(id)) continue;
    const inPrev = prevMap.has(id);
    const inNext = nextMap.has(id);

    if (!inPrev && inNext) {
      newlyScheduled.push(id);
    } else if (inPrev && !inNext) {
      if (nextDeferredIds.has(id)) {
        newlyDeferred.push(id);
      }
    } else if (inPrev && inNext) {
      const pe = prevMap.get(id)!;
      const ne = nextMap.get(id)!;
      if (pe.startMonth !== ne.startMonth) {
        moved.push({ projectId: id, fromStart: pe.startMonth, toStart: ne.startMonth });
      }
    }
  }

  const hasChanges =
    newlyScheduled.length > 0 ||
    newlyDeferred.length > 0 ||
    moved.length > 0;

  return hasChanges
    ? { added, removed, moved, newlyDeferred, newlyScheduled }
    : null;
}

// --- Optimal plan: greedy best-combination of changes ---

function applyActionToState(
  action: RecommendationAction,
  squads: Squad[],
  projects: Project[],
): { squads: Squad[]; projects: Project[] } {
  switch (action.type) {
    case "flip-role":
      return {
        projects,
        squads: squads.map((s) =>
          s.id === action.squadId
            ? { ...s, members: s.members.map((m) => (m.id === action.memberId ? { ...m, role: action.newRole } : m)) }
            : s,
        ),
      };
    case "bump-allocation":
      return {
        projects,
        squads: squads.map((s) =>
          s.id === action.squadId
            ? { ...s, members: s.members.map((m) => (m.id === action.memberId ? { ...m, allocation: action.newAllocation } : m)) }
            : s,
        ),
      };
    case "reduce-requirement":
      return {
        squads,
        projects: projects.map((p) => (p.id === action.projectId ? { ...p, [action.field]: action.newValue } : p)),
      };
  }
}

function totalValue(result: ScheduleResult, projects: Project[]): number {
  const pm = new Map(projects.map((p) => [p.id, p]));
  return result.entries.reduce((sum, e) => {
    const p = pm.get(e.projectId);
    return sum + (p ? p.businessValue + p.timeCriticality + p.riskReduction : 0);
  }, 0);
}

export function computeOptimalPlan(
  projects: Project[],
  squads: Squad[],
  schedule: ScheduleResult,
  horizonMonths: number,
): OptimalPlan | null {
  if (schedule.deferred.length === 0) return null;

  let curSquads = squads;
  let curProjects = projects;
  let curSchedule = schedule;
  const actions: RecommendationAction[] = [];
  const descriptions: string[] = [];
  const usedActionKeys = new Set<string>();

  for (let iter = 0; iter < 8; iter++) {
    if (curSchedule.deferred.length === 0) break;

    const candidates = generateCandidates(curProjects, curSquads, curSchedule, horizonMonths);
    if (candidates.length === 0) break;

    let bestCandidate: { action: RecommendationAction; description: string } | null = null;
    let bestResult: ScheduleResult | null = null;
    let bestScore = -1;
    let bestSquads = curSquads;
    let bestProjects = curProjects;

    for (const c of candidates) {
      const key = c.action.type + JSON.stringify(c.action);
      if (usedActionKeys.has(key)) continue;

      const { squads: ms, projects: mp } = applyActionToState(c.action, curSquads, curProjects);
      const result = optimize(mp, ms, horizonMonths);
      const score = result.entries.length * 10000 + totalValue(result, mp);

      if (score > bestScore) {
        bestCandidate = c;
        bestResult = result;
        bestScore = score;
        bestSquads = ms;
        bestProjects = mp;
      }
    }

    if (!bestCandidate || !bestResult) break;
    if (bestResult.entries.length < curSchedule.entries.length) break;

    usedActionKeys.add(bestCandidate.action.type + JSON.stringify(bestCandidate.action));
    actions.push(bestCandidate.action);
    descriptions.push(bestCandidate.description);
    curSquads = bestSquads;
    curProjects = bestProjects;
    curSchedule = bestResult;
  }

  if (actions.length === 0) return null;
  if (curSchedule.entries.length <= schedule.entries.length &&
      curSchedule.deferred.length >= schedule.deferred.length) return null;

  return {
    actions,
    descriptions,
    scheduledCount: curSchedule.entries.length,
    deferredCount: curSchedule.deferred.length,
  };
}

function generateCandidates(
  projects: Project[],
  squads: Squad[],
  schedule: ScheduleResult,
  horizonMonths: number,
): { action: RecommendationAction; description: string }[] {
  const candidates: { action: RecommendationAction; description: string }[] = [];
  const deferredProjects = schedule.deferred
    .map((d) => projects.find((p) => p.id === d.projectId))
    .filter(Boolean) as Project[];

  for (const squad of squads) {
    for (const member of squad.members) {
      const flippedRole = member.role === "be" ? "fe" : "be";
      candidates.push({
        action: { type: "flip-role", squadId: squad.id, memberId: member.id, newRole: flippedRole as "fe" | "be" },
        description: `Convert 1 ${member.role.toUpperCase()} to ${flippedRole.toUpperCase()} on ${squad.name}`,
      });

      if (member.allocation < 100) {
        candidates.push({
          action: { type: "bump-allocation", squadId: squad.id, memberId: member.id, squadName: squad.name, newAllocation: 100 },
          description: `Increase ${member.role.toUpperCase()} on ${squad.name} from ${member.allocation}% to 100%`,
        });
      }
    }
  }

  for (const dp of deferredProjects) {
    for (const field of ["feNeeded", "beNeeded"] as const) {
      if (dp[field] <= 0) continue;
      const label = field === "feNeeded" ? "FE" : "BE";
      candidates.push({
        action: { type: "reduce-requirement", projectId: dp.id, field, newValue: dp[field] - 1 },
        description: `Reduce ${dp.name} ${label} requirement from ${dp[field]} to ${dp[field] - 1}`,
      });
    }
  }

  return candidates;
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}
