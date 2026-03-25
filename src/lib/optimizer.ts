import {
  Project,
  Squad,
  ScheduleEntry,
  ScheduleResult,
  DeferralReason,
} from "./types";

// --- Scoring ---

function jobSize(p: Project): number {
  return p.duration * (p.feNeeded + p.beNeeded);
}

function wsjf(p: Project): number {
  const cost = p.businessValue + p.timeCriticality + p.riskReduction;
  const size = jobSize(p);
  return size > 0 ? cost / size : 0;
}

export function getWsjf(p: Project): number {
  return wsjf(p);
}

/**
 * For scheduling, a predecessor's effective priority should reflect the value
 * it unblocks. chainWsjf(B) = max(wsjf(B), wsjf(A)) for every A that
 * transitively depends on B. This ensures blockers of high-value work are
 * scheduled early.
 */
function buildChainWsjf(projects: Project[]): Map<string, number> {
  const own = new Map(projects.map((p) => [p.id, wsjf(p)]));
  const dependents = new Map<string, Set<string>>();
  for (const p of projects) {
    for (const depId of p.dependencies) {
      if (!dependents.has(depId)) dependents.set(depId, new Set());
      dependents.get(depId)!.add(p.id);
    }
  }

  const chain = new Map<string, number>();
  const visited = new Set<string>();

  function dfs(id: string): number {
    if (chain.has(id)) return chain.get(id)!;
    if (visited.has(id)) return own.get(id) ?? 0;
    visited.add(id);

    let best = own.get(id) ?? 0;
    for (const childId of dependents.get(id) ?? []) {
      best = Math.max(best, dfs(childId));
    }
    chain.set(id, best);
    return best;
  }

  for (const p of projects) dfs(p.id);
  return chain;
}

// --- Capacity helpers ---

export function effectiveFe(s: Squad): number {
  return s.members
    .filter((m) => m.role === "fe")
    .reduce((sum, m) => sum + m.allocation / 100, 0);
}

export function effectiveBe(s: Squad): number {
  return s.members
    .filter((m) => m.role === "be")
    .reduce((sum, m) => sum + m.allocation / 100, 0);
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

type CapState = {
  fe: Map<string, number[]>;
  be: Map<string, number[]>;
};

function buildCap(squads: Squad[], months: number): CapState {
  const fe = new Map<string, number[]>();
  const be = new Map<string, number[]>();
  for (const s of squads) {
    fe.set(s.id, Array(months).fill(effectiveFe(s)));
    be.set(s.id, Array(months).fill(effectiveBe(s)));
  }
  return { fe, be };
}

function rebuildCapFromEntries(
  squads: Squad[],
  months: number,
  entries: ScheduleEntry[],
  projectMap: Map<string, Project>,
): CapState {
  const cap = buildCap(squads, months);
  for (const e of entries) {
    const p = projectMap.get(e.projectId);
    if (!p) continue;
    const fe = cap.fe.get(e.squadId);
    const be = cap.be.get(e.squadId);
    if (!fe || !be) continue;
    for (let i = e.startMonth; i < e.endMonth; i++) {
      fe[i] -= p.feNeeded;
      be[i] -= p.beNeeded;
    }
  }
  return cap;
}

function findEarliestStart(
  p: Project,
  squadId: string,
  cap: CapState,
  scheduled: Map<string, ScheduleEntry>,
  horizonMonths: number,
): number {
  const fe = cap.fe.get(squadId);
  const be = cap.be.get(squadId);
  if (!fe || !be) return -1;

  let earliest = 0;
  for (const depId of p.dependencies) {
    const dep = scheduled.get(depId);
    if (dep) earliest = Math.max(earliest, dep.endMonth);
  }

  for (let m = earliest; m + p.duration <= horizonMonths; m++) {
    let fits = true;
    for (let i = m; i < m + p.duration; i++) {
      if (fe[i] < p.feNeeded || be[i] < p.beNeeded) {
        fits = false;
        break;
      }
    }
    if (fits) return m;
  }
  return -1;
}

function tryScheduleOnAnySquad(
  p: Project,
  squads: Squad[],
  cap: CapState,
  scheduled: Map<string, ScheduleEntry>,
  horizonMonths: number,
): { squadId: string; start: number } | null {
  // Prefer assigned squad
  const prefStart = findEarliestStart(p, p.squadId, cap, scheduled, horizonMonths);
  if (prefStart !== -1) return { squadId: p.squadId, start: prefStart };

  // Fallback to others
  let best: { squadId: string; start: number } | null = null;
  for (const s of squads) {
    if (s.id === p.squadId) continue;
    const start = findEarliestStart(p, s.id, cap, scheduled, horizonMonths);
    if (start !== -1 && (!best || start < best.start)) {
      best = { squadId: s.id, start };
    }
  }
  return best;
}

function allocate(cap: CapState, entry: ScheduleEntry, p: Project) {
  const fe = cap.fe.get(entry.squadId)!;
  const be = cap.be.get(entry.squadId)!;
  for (let i = entry.startMonth; i < entry.endMonth; i++) {
    fe[i] -= p.feNeeded;
    be[i] -= p.beNeeded;
  }
}

function deallocate(cap: CapState, entry: ScheduleEntry, p: Project) {
  const fe = cap.fe.get(entry.squadId)!;
  const be = cap.be.get(entry.squadId)!;
  for (let i = entry.startMonth; i < entry.endMonth; i++) {
    fe[i] += p.feNeeded;
    be[i] += p.beNeeded;
  }
}

function totalValue(entries: ScheduleEntry[], projectMap: Map<string, Project>): number {
  return entries.reduce((sum, e) => {
    const p = projectMap.get(e.projectId);
    return sum + (p ? p.businessValue + p.timeCriticality + p.riskReduction : 0);
  }, 0);
}

// --- Phase 1: Greedy baseline ---

function greedySchedule(
  projects: Project[],
  squads: Squad[],
  horizonMonths: number,
): { entries: ScheduleEntry[]; deferredIds: Set<string> } {
  const scheduled = new Map<string, ScheduleEntry>();
  const deferredIds = new Set<string>();
  const remaining = new Set(projects.map((p) => p.id));
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const cap = buildCap(squads, horizonMonths);
  const chainPriority = buildChainWsjf(projects);

  function getReady(): Project[] {
    const ready: Project[] = [];
    for (const id of remaining) {
      const p = projectMap.get(id)!;
      if (p.dependencies.every((d) => scheduled.has(d) || !projectMap.has(d))) {
        ready.push(p);
      }
    }
    // Sort by chain-aware WSJF: predecessors of high-value work rise to top
    return ready.sort((a, b) => {
      const ca = chainPriority.get(a.id) ?? wsjf(a);
      const cb = chainPriority.get(b.id) ?? wsjf(b);
      const diff = cb - ca;
      if (Math.abs(diff) > 0.001) return diff;
      const da = a.deadline ?? Infinity;
      const db = b.deadline ?? Infinity;
      return da - db;
    });
  }

  let guard = projects.length * projects.length + 1;
  while (remaining.size > 0 && guard-- > 0) {
    const ready = getReady();
    if (ready.length === 0) {
      for (const id of remaining) deferredIds.add(id);
      break;
    }

    let placed = false;
    for (const p of ready) {
      const slot = tryScheduleOnAnySquad(p, squads, cap, scheduled, horizonMonths);
      if (!slot) {
        deferredIds.add(p.id);
        remaining.delete(p.id);
        placed = true;
        break;
      }

      const entry: ScheduleEntry = {
        projectId: p.id,
        squadId: slot.squadId,
        startMonth: slot.start,
        endMonth: slot.start + p.duration,
      };
      allocate(cap, entry, p);
      scheduled.set(p.id, entry);
      remaining.delete(p.id);
      placed = true;
      break;
    }

    if (!placed) {
      for (const id of remaining) deferredIds.add(id);
      break;
    }
  }

  return { entries: Array.from(scheduled.values()), deferredIds };
}

// --- Phase 2: Swap improvement ---

function swapImprove(
  entries: ScheduleEntry[],
  deferredIds: Set<string>,
  projects: Project[],
  squads: Squad[],
  horizonMonths: number,
): { entries: ScheduleEntry[]; deferredIds: Set<string> } {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  let currentEntries = [...entries];
  let currentDeferred = new Set(deferredIds);
  let improved = true;

  while (improved) {
    improved = false;

    for (const defId of currentDeferred) {
      const defProject = projectMap.get(defId);
      if (!defProject) continue;
      const defValue =
        defProject.businessValue + defProject.timeCriticality + defProject.riskReduction;

      for (let i = 0; i < currentEntries.length; i++) {
        const schedEntry = currentEntries[i];
        const schedProject = projectMap.get(schedEntry.projectId);
        if (!schedProject) continue;
        const schedValue =
          schedProject.businessValue +
          schedProject.timeCriticality +
          schedProject.riskReduction;

        if (defValue <= schedValue) continue;

        // Try swapping: remove scheduled, try to fit deferred
        const testEntries = currentEntries.filter((_, j) => j !== i);
        const scheduled = new Map(testEntries.map((e) => [e.projectId, e]));
        const cap = rebuildCapFromEntries(squads, horizonMonths, testEntries, projectMap);

        const slot = tryScheduleOnAnySquad(
          defProject, squads, cap, scheduled, horizonMonths,
        );
        if (!slot) continue;

        // Swap improves total value
        const newEntry: ScheduleEntry = {
          projectId: defId,
          squadId: slot.squadId,
          startMonth: slot.start,
          endMonth: slot.start + defProject.duration,
        };

        currentEntries = [...testEntries, newEntry];
        currentDeferred.delete(defId);
        currentDeferred.add(schedEntry.projectId);
        improved = true;
        break;
      }
      if (improved) break;
    }
  }

  return { entries: currentEntries, deferredIds: currentDeferred };
}

// --- Phase 3: Gap fill ---

function gapFill(
  entries: ScheduleEntry[],
  deferredIds: Set<string>,
  projects: Project[],
  squads: Squad[],
  horizonMonths: number,
): { entries: ScheduleEntry[]; deferredIds: Set<string> } {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  let currentEntries = [...entries];
  let currentDeferred = new Set(deferredIds);

  // Sort deferred: shortest duration first (maximize completions), then by WSJF
  const sortedDeferred = [...currentDeferred]
    .map((id) => projectMap.get(id)!)
    .filter(Boolean)
    .sort((a, b) => {
      const durDiff = a.duration - b.duration;
      if (durDiff !== 0) return durDiff;
      return wsjf(b) - wsjf(a);
    });

  for (const p of sortedDeferred) {
    const scheduled = new Map(currentEntries.map((e) => [e.projectId, e]));
    const cap = rebuildCapFromEntries(squads, horizonMonths, currentEntries, projectMap);

    const slot = tryScheduleOnAnySquad(p, squads, cap, scheduled, horizonMonths);
    if (!slot) continue;

    const entry: ScheduleEntry = {
      projectId: p.id,
      squadId: slot.squadId,
      startMonth: slot.start,
      endMonth: slot.start + p.duration,
    };
    currentEntries.push(entry);
    currentDeferred.delete(p.id);
  }

  return { entries: currentEntries, deferredIds: currentDeferred };
}

// --- Phase 4: Compaction ---

function compact(
  entries: ScheduleEntry[],
  projects: Project[],
  squads: Squad[],
  horizonMonths: number,
): ScheduleEntry[] {
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  // Sort by start time so we process early projects first
  const sorted = [...entries].sort((a, b) => a.startMonth - b.startMonth);
  const result: ScheduleEntry[] = [];
  const scheduled = new Map<string, ScheduleEntry>();

  for (const entry of sorted) {
    const p = projectMap.get(entry.projectId);
    if (!p) {
      result.push(entry);
      continue;
    }

    // Rebuild cap from already-compacted entries only
    const cap = rebuildCapFromEntries(squads, horizonMonths, result, projectMap);

    const start = findEarliestStart(p, entry.squadId, cap, scheduled, horizonMonths);
    const compacted: ScheduleEntry = {
      ...entry,
      startMonth: start !== -1 ? start : entry.startMonth,
      endMonth: start !== -1 ? start + p.duration : entry.endMonth,
    };

    result.push(compacted);
    scheduled.set(compacted.projectId, compacted);
  }

  return result;
}

// --- Deferral reasons ---

function buildDeferReason(p: Project, squads: Squad[]): string {
  const lines: string[] = [];
  for (const sq of squads) {
    const maxFe = effectiveFe(sq);
    const maxBe = effectiveBe(sq);
    const feOk = p.feNeeded <= maxFe;
    const beOk = p.beNeeded <= maxBe;
    if (!feOk || !beOk) {
      const parts: string[] = [];
      if (!feOk) parts.push(`needs ${p.feNeeded}FE, has ${fmt(maxFe)}`);
      if (!beOk) parts.push(`needs ${p.beNeeded}BE, has ${fmt(maxBe)}`);
      lines.push(`${sq.name}: ${parts.join("; ")}`);
    } else {
      lines.push(`${sq.name}: capacity busy during required window`);
    }
  }
  return `No squad can fit this. ${lines.join(" | ")}`;
}

// --- Main ---

export function optimize(
  projects: Project[],
  squads: Squad[],
  horizonMonths: number,
): ScheduleResult {
  if (projects.length === 0 || squads.length === 0) {
    return { entries: [], deferred: [] };
  }

  // Phase 1
  let { entries, deferredIds } = greedySchedule(projects, squads, horizonMonths);

  // Phase 2
  ({ entries, deferredIds } = swapImprove(entries, deferredIds, projects, squads, horizonMonths));

  // Phase 3
  ({ entries, deferredIds } = gapFill(entries, deferredIds, projects, squads, horizonMonths));

  // Phase 4
  entries = compact(entries, projects, squads, horizonMonths);

  // Build deferral reasons
  const deferred: DeferralReason[] = [...deferredIds].map((id) => {
    const p = projects.find((pr) => pr.id === id);
    return {
      projectId: id,
      reason: p ? buildDeferReason(p, squads) : "Unknown project",
    };
  });

  return { entries, deferred };
}
