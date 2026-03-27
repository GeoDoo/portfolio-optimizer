import {
  Project,
  Squad,
  UncertaintyParams,
  ProjectStats,
  SimulationResult,
  ScheduleResult,
  Objective,
} from "./types";
import { optimize } from "./optimizer";

// --- Seeded PRNG (mulberry32) ---

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashInputs(
  projects: Project[],
  squads: Squad[],
  horizonMonths: number,
): number {
  let h = horizonMonths;
  for (const p of projects) {
    for (let i = 0; i < p.name.length; i++) h = (h * 31 + p.name.charCodeAt(i)) | 0;
    h = (h * 31 + p.duration) | 0;
    h = (h * 31 + p.feNeeded) | 0;
    h = (h * 31 + p.beNeeded) | 0;
  }
  for (const s of squads) {
    for (let i = 0; i < s.name.length; i++) h = (h * 31 + s.name.charCodeAt(i)) | 0;
    h = (h * 31 + s.members.length) | 0;
  }
  return h >>> 0;
}

// --- Box-Muller for normal distribution ---

function normalRandom(rng: () => number): number {
  let u1 = rng();
  while (u1 === 0) u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// --- Perturbation ---

export function perturbProjects(
  projects: Project[],
  params: UncertaintyParams,
  rng: () => number,
): Project[] {
  const sigma = params.estimationErrorPct / 100;

  return projects.map((p) => {
    let duration = p.duration;

    if (sigma > 0) {
      const z = normalRandom(rng);
      duration = Math.max(1, Math.round(duration * Math.exp(z * sigma)));
    }

    if (params.reworkProbPct > 0 && rng() < params.reworkProbPct / 100) {
      duration = Math.ceil(duration * 1.5);
    }

    return duration === p.duration ? p : { ...p, duration };
  });
}

export function perturbDependencies(
  projects: Project[],
  params: UncertaintyParams,
  rng: () => number,
): Project[] {
  if (params.dependencyDelayPct <= 0) return projects;

  const delayMap = new Map<string, number>();
  for (const p of projects) {
    let delay = 0;
    for (const depId of p.dependencies) {
      if (rng() < params.dependencyDelayPct / 100) delay++;
    }
    if (delay > 0) delayMap.set(p.id, delay);
  }

  if (delayMap.size === 0) return projects;

  return projects.map((p) => {
    const delay = delayMap.get(p.id);
    if (!delay) return p;
    return { ...p, duration: p.duration + delay };
  });
}

export function perturbSquadCapacity(
  squads: Squad[],
  horizonMonths: number,
  params: UncertaintyParams,
  rng: () => number,
): { squads: Squad[]; interruptedMonths: Map<string, Set<number>> } {
  if (params.interruptionProbPct <= 0) {
    return { squads, interruptedMonths: new Map() };
  }

  const interruptedMonths = new Map<string, Set<number>>();

  for (const s of squads) {
    const months = new Set<number>();
    for (let m = 0; m < horizonMonths; m++) {
      if (rng() < params.interruptionProbPct / 100) {
        months.add(m);
      }
    }
    if (months.size > 0) interruptedMonths.set(s.id, months);
  }

  return { squads, interruptedMonths };
}

function adjustForInterruptions(
  result: ScheduleResult,
  interruptedMonths: Map<string, Set<number>>,
  projects: Project[],
  horizonMonths: number,
): ScheduleResult {
  if (interruptedMonths.size === 0) return result;

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const adjustedEntries = result.entries.map((e) => {
    const interrupted = interruptedMonths.get(e.squadId);
    if (!interrupted) return e;

    let lostMonths = 0;
    for (let m = e.startMonth; m < e.endMonth; m++) {
      if (interrupted.has(m)) lostMonths++;
    }

    if (lostMonths === 0) return e;

    const newEnd = Math.min(e.endMonth + lostMonths, horizonMonths);
    return { ...e, endMonth: newEnd };
  });

  return { entries: adjustedEntries, deferred: result.deferred };
}

// --- Single simulation run ---

function runSingleSimulation(
  projects: Project[],
  squads: Squad[],
  horizonMonths: number,
  objective: Objective,
  aiEffect: number,
  params: UncertaintyParams,
  rng: () => number,
): ScheduleResult {
  let perturbed = perturbProjects(projects, params, rng);
  perturbed = perturbDependencies(perturbed, params, rng);

  const { interruptedMonths } = perturbSquadCapacity(squads, horizonMonths, params, rng);

  let result = optimize(perturbed, squads, horizonMonths, objective, aiEffect);

  result = adjustForInterruptions(result, interruptedMonths, perturbed, horizonMonths);

  return result;
}

// --- Percentile helper ---

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[idx];
}

// --- Aggregation ---

export function aggregateRuns(
  runs: ScheduleResult[],
  projects: Project[],
  deterministicCount: number,
): SimulationResult {
  const numRuns = runs.length;
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const endMonthsByProject = new Map<string, number[]>();
  const scheduledCounts: number[] = [];
  const totalValues: number[] = [];
  const lastMonths: number[] = [];

  for (const run of runs) {
    let runValue = 0;
    let runLastMonth = 0;

    for (const e of run.entries) {
      const p = projectMap.get(e.projectId);
      if (p) runValue += p.businessValue + p.timeCriticality + p.riskReduction;
      if (e.endMonth > runLastMonth) runLastMonth = e.endMonth;

      if (!endMonthsByProject.has(e.projectId)) endMonthsByProject.set(e.projectId, []);
      endMonthsByProject.get(e.projectId)!.push(e.endMonth);
    }

    scheduledCounts.push(run.entries.length);
    totalValues.push(runValue);
    lastMonths.push(runLastMonth);
  }

  scheduledCounts.sort((a, b) => a - b);
  totalValues.sort((a, b) => a - b);
  lastMonths.sort((a, b) => a - b);

  const projectStats: ProjectStats[] = projects.map((p) => {
    const endMonths = endMonthsByProject.get(p.id) ?? [];
    const completionPct = numRuns > 0 ? (endMonths.length / numRuns) * 100 : 0;
    const sorted = [...endMonths].sort((a, b) => a - b);

    return {
      projectId: p.id,
      completionPct,
      deliveryP10: percentile(sorted, 0.1),
      deliveryP50: percentile(sorted, 0.5),
      deliveryP90: percentile(sorted, 0.9),
    };
  });

  const planReliability = numRuns > 0
    ? (scheduledCounts.filter((c) => c >= deterministicCount).length / numRuns) * 100
    : 0;

  return {
    numRuns,
    projectStats,
    totalValueP10: percentile(totalValues, 0.1),
    totalValueP50: percentile(totalValues, 0.5),
    totalValueP90: percentile(totalValues, 0.9),
    scheduledCountP10: percentile(scheduledCounts, 0.1),
    scheduledCountP50: percentile(scheduledCounts, 0.5),
    scheduledCountP90: percentile(scheduledCounts, 0.9),
    lastMonthP10: percentile(lastMonths, 0.1),
    lastMonthP50: percentile(lastMonths, 0.5),
    lastMonthP90: percentile(lastMonths, 0.9),
    planReliability,
  };
}

// --- Main entry point ---

export type SimulationInput = {
  projects: Project[];
  squads: Squad[];
  horizonMonths: number;
  objective: Objective;
  aiEffect: number;
  uncertainty: UncertaintyParams;
  numRuns: number;
  deterministicScheduledCount: number;
};

export function runSimulation(
  input: SimulationInput,
  onProgress?: (pct: number) => void,
): SimulationResult {
  const seed = hashInputs(input.projects, input.squads, input.horizonMonths);
  const rng = mulberry32(seed);

  const runs: ScheduleResult[] = [];
  const progressStep = Math.max(1, Math.floor(input.numRuns / 10));

  for (let i = 0; i < input.numRuns; i++) {
    runs.push(
      runSingleSimulation(
        input.projects,
        input.squads,
        input.horizonMonths,
        input.objective,
        input.aiEffect,
        input.uncertainty,
        rng,
      ),
    );

    if (onProgress && (i + 1) % progressStep === 0) {
      onProgress(((i + 1) / input.numRuns) * 100);
    }
  }

  return aggregateRuns(runs, input.projects, input.deterministicScheduledCount);
}
