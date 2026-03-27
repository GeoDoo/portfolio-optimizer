"use client";

import { useMemo, useState } from "react";
import { Project, Squad, ROLE_META } from "@/lib/types";
import { effectiveFe, effectiveBe } from "@/lib/optimizer";

type PilotResult = {
  deliveryMonths: number;
  teamSize: number;
  feasible: boolean;
};

function calcDelivery(project: Project, feCap: number, beCap: number, horizonMonths: number): PilotResult {
  const feEffort = project.feNeeded * project.duration;
  const beEffort = project.beNeeded * project.duration;

  if ((feEffort > 0 && feCap <= 0) || (beEffort > 0 && beCap <= 0)) {
    return { deliveryMonths: -1, teamSize: 0, feasible: false };
  }

  const feMonths = feEffort > 0 ? feEffort / feCap : 0;
  const beMonths = beEffort > 0 ? beEffort / beCap : 0;
  const months = Math.ceil(Math.max(feMonths, beMonths));

  if (months > horizonMonths) {
    return { deliveryMonths: -1, teamSize: 0, feasible: false };
  }
  return { deliveryMonths: Math.max(1, months), teamSize: 0, feasible: true };
}

function runTraditional(project: Project, squad: Squad, horizonMonths: number): PilotResult {
  const feCap = effectiveFe(squad);
  const beCap = effectiveBe(squad);
  const result = calcDelivery(project, feCap, beCap, horizonMonths);
  return { ...result, teamSize: squad.members.length };
}

function runPilotSim(
  project: Project,
  numEngineers: number,
  includePm: boolean,
  multiplier: number,
  horizonMonths: number,
): PilotResult {
  const feCap = numEngineers * multiplier;
  const beCap = numEngineers * multiplier;
  const teamSize = numEngineers + (includePm ? 1 : 0);
  const result = calcDelivery(project, feCap, beCap, horizonMonths);
  return { ...result, teamSize };
}

function SensitivityChart({
  project, numEngineers, includePm, traditionalMonths, horizonMonths,
}: {
  project: Project;
  numEngineers: number;
  includePm: boolean;
  traditionalMonths: number;
  horizonMonths: number;
}) {
  const data = useMemo(() => {
    const points: { multiplier: number; months: number; feasible: boolean }[] = [];
    for (let m = 1; m <= 5; m += 0.5) {
      const result = runPilotSim(project, numEngineers, includePm, m, horizonMonths);
      points.push({ multiplier: m, months: result.feasible ? result.deliveryMonths : horizonMonths, feasible: result.feasible });
    }
    return points;
  }, [project, numEngineers, includePm, horizonMonths]);

  const maxMonths = Math.max(traditionalMonths, ...data.map((d) => d.months), 1);

  return (
    <div className="space-y-1.5">
      <p className="text-[0.65rem] font-semibold text-muted-foreground">AI multiplier vs delivery time</p>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[0.6rem] text-muted-foreground w-10 text-right shrink-0">Current</span>
          <div className="flex-1 relative h-4">
            <div className="absolute h-full rounded bg-slate-300" style={{ width: `${(traditionalMonths / maxMonths) * 100}%` }} />
            <span className="absolute inset-0 flex items-center px-1.5 text-[0.55rem] font-semibold">{traditionalMonths}mo</span>
          </div>
        </div>
        {data.map((d) => {
          const faster = d.feasible && d.months < traditionalMonths;
          const same = d.feasible && d.months === traditionalMonths;
          return (
            <div key={d.multiplier} className="flex items-center gap-1.5">
              <span className="text-[0.6rem] text-muted-foreground w-10 text-right shrink-0 tabular-nums">{d.multiplier}x</span>
              <div className="flex-1 relative h-4">
                <div
                  className={`absolute h-full rounded ${!d.feasible ? "bg-red-200" : faster ? "bg-emerald-400" : same ? "bg-amber-300" : "bg-red-300"}`}
                  style={{ width: `${((d.feasible ? d.months : maxMonths) / maxMonths) * 100}%` }}
                />
                <span className="absolute inset-0 flex items-center px-1.5 text-[0.55rem] font-semibold">
                  {d.feasible ? `${d.months}mo` : "Won\u2019t fit"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PilotSimulator({
  projects, squads, horizonMonths,
}: {
  projects: Project[];
  squads: Squad[];
  horizonMonths: number;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id ?? "");
  const [numEngineers, setNumEngineers] = useState(1);
  const [includePm, setIncludePm] = useState(true);
  const [multiplier, setMultiplier] = useState(2);

  const project = projects.find((p) => p.id === selectedProjectId);
  const assignedSquad = squads.find((s) => s.id === project?.squadId);

  const traditionalResult = useMemo(() => {
    if (!project || !assignedSquad) return null;
    return runTraditional(project, assignedSquad, horizonMonths);
  }, [project, assignedSquad, horizonMonths]);

  const pilotResult = useMemo(() => {
    if (!project) return null;
    return runPilotSim(project, numEngineers, includePm, multiplier, horizonMonths);
  }, [project, numEngineers, includePm, multiplier, horizonMonths]);

  if (projects.length === 0 || squads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg">
        <p className="text-sm text-muted-foreground">Add teams and projects first</p>
      </div>
    );
  }

  const tradMonths = traditionalResult?.feasible ? traditionalResult.deliveryMonths : null;
  const pilotMonths = pilotResult?.feasible ? pilotResult.deliveryMonths : null;

  let verdict = "";
  let verdictColor = "text-muted-foreground";
  if (tradMonths != null && pilotMonths != null) {
    const diff = tradMonths - pilotMonths;
    if (diff > 0) { verdict = `AI pilot is ${diff}mo faster`; verdictColor = "text-emerald-700"; }
    else if (diff < 0) { verdict = `AI pilot is ${-diff}mo slower`; verdictColor = "text-red-600"; }
    else { verdict = "Same delivery time"; verdictColor = "text-amber-600"; }
  } else if (pilotMonths == null && tradMonths != null) {
    verdict = "AI pilot can\u2019t deliver this in time";
    verdictColor = "text-red-600";
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
      {/* Config */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Project</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.feNeeded}FE + {p.beNeeded}BE, {p.duration}mo)</option>
            ))}
          </select>
        </div>

        {assignedSquad && (
          <div className="p-2.5 border rounded-lg bg-slate-50/50 space-y-1">
            <p className="text-[0.65rem] font-semibold text-slate-600">Current: {assignedSquad.name}</p>
            <div className="flex flex-wrap gap-1">
              {assignedSquad.members.map((m) => (
                <span key={m.id} className="text-[0.6rem] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                  {m.name ?? ROLE_META[m.role].label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="p-2.5 border rounded-lg bg-violet-50/50 space-y-2.5">
          <p className="text-[0.65rem] font-semibold text-violet-700">AI pilot squad</p>

          <div className="space-y-1">
            <label className="text-[0.65rem] text-muted-foreground">Engineers</label>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setNumEngineers(n)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    numEngineers === n ? "bg-violet-600 text-white" : "bg-background border hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {n}
                </button>
              ))}
              <label className="flex items-center gap-1.5 ml-3 text-[0.65rem] text-muted-foreground">
                <input type="checkbox" checked={includePm} onChange={(e) => setIncludePm(e.target.checked)} className="rounded" />
                + PM
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[0.65rem] text-muted-foreground">
              AI multiplier: <strong className="text-violet-700">{multiplier}x</strong>
            </label>
            <input
              type="range" min={10} max={50} step={5}
              value={multiplier * 10}
              onChange={(e) => setMultiplier(parseInt(e.target.value) / 10)}
              className="w-full h-1.5 accent-violet-600"
            />
            <div className="flex justify-between text-[0.55rem] text-muted-foreground">
              <span>1x</span><span>5x</span>
            </div>
          </div>

          <div className="text-[0.6rem] text-violet-600 pt-1 border-t">
            {numEngineers} eng{numEngineers > 1 ? "s" : ""}{includePm ? " + 1 PM" : ""} = {numEngineers + (includePm ? 1 : 0)}p
            {multiplier > 1 && ` @ ${multiplier}x`}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-3">
        {project && (
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 border rounded-lg bg-slate-50/50">
              <p className="text-[0.65rem] font-semibold text-slate-600 mb-1">Current</p>
              <div className="text-xl font-bold text-slate-800 tabular-nums">
                {tradMonths != null ? `${tradMonths}mo` : "Won\u2019t fit"}
              </div>
              <p className="text-[0.6rem] text-slate-500 mt-0.5">{traditionalResult?.teamSize ?? 0}p</p>
            </div>
            <div className="p-3 border rounded-lg bg-violet-50/50">
              <p className="text-[0.65rem] font-semibold text-violet-600 mb-1">AI Pilot</p>
              <div className="text-xl font-bold text-violet-800 tabular-nums">
                {pilotMonths != null ? `${pilotMonths}mo` : "Won\u2019t fit"}
              </div>
              <p className="text-[0.6rem] text-violet-500 mt-0.5">{numEngineers + (includePm ? 1 : 0)}p @ {multiplier}x</p>
            </div>
          </div>
        )}

        {verdict && (
          <div className={`p-2.5 rounded-lg border text-xs font-semibold ${verdictColor} ${
            verdictColor.includes("emerald") ? "bg-emerald-50 border-emerald-200"
              : verdictColor.includes("red") ? "bg-red-50 border-red-200"
              : "bg-amber-50 border-amber-200"
          }`}>
            {verdict}
          </div>
        )}

        {project && tradMonths != null && (
          <SensitivityChart
            project={project}
            numEngineers={numEngineers}
            includePm={includePm}
            traditionalMonths={tradMonths}
            horizonMonths={horizonMonths}
          />
        )}
      </div>
    </div>
  );
}
