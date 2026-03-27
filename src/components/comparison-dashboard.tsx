"use client";

import { useMemo, useState } from "react";
import {
  ComparisonResult,
  Project,
  ScheduleEntry,
} from "@/lib/types";
import { pctChange } from "@/lib/ai-comparison";

const BAR_COLORS = [
  "bg-blue-400", "bg-emerald-400", "bg-amber-400", "bg-violet-400",
  "bg-rose-400", "bg-cyan-400", "bg-orange-400", "bg-teal-400",
];

type ScenarioKey = "traditional" | "sameTeamAI" | "miniSquad";

function fmt(n: number, decimals = 1): string {
  if (n % 1 === 0) return String(n);
  return n.toFixed(decimals);
}

function MiniGantt({
  entries,
  projects,
  horizonMonths,
  label,
  headcount,
}: {
  entries: ScheduleEntry[];
  projects: Project[];
  horizonMonths: number;
  label: string;
  headcount: number;
}) {
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    projects.forEach((p, i) => m.set(p.id, BAR_COLORS[i % BAR_COLORS.length]));
    return m;
  }, [projects]);

  const squadIds = useMemo(() => {
    const ids = new Set<string>();
    entries.forEach((e) => ids.add(e.squadId));
    return [...ids];
  }, [entries]);

  const lanes = useMemo(() => {
    const result = new Map<string, ScheduleEntry[][]>();
    for (const sid of squadIds) {
      const sqEntries = entries.filter((e) => e.squadId === sid).sort((a, b) => a.startMonth - b.startMonth);
      const sqLanes: ScheduleEntry[][] = [];
      for (const entry of sqEntries) {
        let placed = false;
        for (const lane of sqLanes) {
          if (!lane.some((e) => e.startMonth < entry.endMonth && entry.startMonth < e.endMonth)) {
            lane.push(entry);
            placed = true;
            break;
          }
        }
        if (!placed) sqLanes.push([entry]);
      }
      result.set(sid, sqLanes);
    }
    return result;
  }, [entries, squadIds]);

  const ROW_H = 22;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
        <span className="text-[0.65rem] font-semibold">{label}</span>
        <span className="text-[0.6rem] text-muted-foreground ml-auto">{headcount} people</span>
      </div>
      <div className="relative">
        {squadIds.length === 0 && (
          <div className="px-3 py-3 text-[0.65rem] text-muted-foreground text-center">No projects scheduled</div>
        )}
        {squadIds.map((sid) => {
          const sqLanes = lanes.get(sid) ?? [[]];
          const height = Math.max(1, sqLanes.length) * ROW_H;
          return (
            <div key={sid} className="flex border-t first:border-t-0">
              <div className="w-14 shrink-0 px-1.5 py-1 border-r flex items-center">
                <span className="text-[0.55rem] text-muted-foreground truncate">Team {squadIds.indexOf(sid) + 1}</span>
              </div>
              <div className="flex-1 relative" style={{ minHeight: height }}>
                <div
                  className="absolute inset-0 grid pointer-events-none"
                  style={{ gridTemplateColumns: `repeat(${horizonMonths}, 1fr)` }}
                >
                  {Array.from({ length: horizonMonths }, (_, i) => (
                    <div key={i} className="border-l h-full" />
                  ))}
                </div>
                {sqLanes.map((lane, li) =>
                  lane.map((entry) => {
                    const proj = projectMap.get(entry.projectId);
                    if (!proj) return null;
                    return (
                      <div
                        key={entry.projectId}
                        className={`absolute rounded text-[0.5rem] text-white font-medium flex items-center px-1 truncate ${colorMap.get(entry.projectId)}`}
                        style={{
                          left: `${(entry.startMonth / horizonMonths) * 100}%`,
                          width: `${((entry.endMonth - entry.startMonth) / horizonMonths) * 100}%`,
                          top: li * ROW_H + 2,
                          height: ROW_H - 4,
                        }}
                        title={proj.name}
                      >
                        {proj.name}
                      </div>
                    );
                  }),
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ComparisonDashboard({
  comparison,
  projects,
  horizonMonths,
}: {
  comparison: ComparisonResult;
  projects: Project[];
  horizonMonths: number;
}) {
  const [ganttView, setGanttView] = useState<ScenarioKey>("sameTeamAI");
  const trad = comparison.traditional;
  const ganttScenario = comparison[ganttView];

  const numSquads = trad.headcount > 0 ? Math.round(comparison.miniSquad.headcount / 2) : 0;

  return (
    <div className="space-y-4">
      {/* Key numbers */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 border rounded-lg">
          <div className="text-[0.65rem] text-muted-foreground mb-1">Meeting overhead</div>
          <div className="text-xl font-bold tabular-nums">{fmt(comparison.overheadGainPct)}%</div>
          <div className="text-[0.6rem] text-muted-foreground mt-0.5">of capacity lost to ceremonies</div>
        </div>
        <div className="p-3 border rounded-lg">
          <div className="text-[0.65rem] text-emerald-600 mb-1">Full-stack advantage</div>
          <div className="text-xl font-bold text-emerald-700 tabular-nums">+{fmt(comparison.flexibilityGainPct)}%</div>
          <div className="text-[0.6rem] text-muted-foreground mt-0.5">more value if everyone is full-stack</div>
        </div>
        <div className="p-3 border rounded-lg">
          <div className="text-[0.65rem] text-violet-600 mb-1">AI break-even</div>
          <div className="text-xl font-bold text-violet-700 tabular-nums">{fmt(comparison.breakEvenMultiplier)}x</div>
          <div className="text-[0.6rem] text-muted-foreground mt-0.5">
            productivity for {comparison.miniSquad.headcount} to match {trad.headcount} people
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/40">
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground" />
              <th className="text-center px-3 py-2 font-semibold text-slate-700">Current</th>
              <th className="text-center px-3 py-2 font-semibold text-emerald-700">Full-stack + AI</th>
              <th className="text-center px-3 py-2 font-semibold text-violet-700">Tiny AI teams</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {([
              { label: "People", key: "headcount" as const, lower: true, unit: "" },
              { label: "Engineers", key: "engineeringFte" as const, lower: false, unit: "" },
              { label: "Delivered", key: "scheduledCount" as const, lower: false, unit: "" },
              { label: "Deferred", key: "deferredCount" as const, lower: true, unit: "" },
              { label: "Value", key: "totalValueDelivered" as const, lower: false, unit: "" },
              { label: "Avg lead time", key: "avgLeadTime" as const, lower: true, unit: "mo" },
            ] as const).map((row) => {
              const tradVal = trad[row.key] as number;
              const fmtVal = (v: number) =>
                row.key === "avgLeadTime" || row.key === "engineeringFte" ? fmt(v) : String(Math.round(v));

              return (
                <tr key={row.key} className="hover:bg-muted/20">
                  <td className="px-3 py-1.5 font-medium text-muted-foreground">{row.label}</td>
                  {(["traditional", "sameTeamAI", "miniSquad"] as ScenarioKey[]).map((sKey) => {
                    const val = comparison[sKey][row.key] as number;
                    const change = pctChange(tradVal, val);
                    const better = row.lower ? change < 0 : change > 0;
                    const isTrad = sKey === "traditional";

                    return (
                      <td key={sKey} className="text-center px-3 py-1.5 tabular-nums">
                        <span className="font-semibold">{fmtVal(val)}{row.unit ? ` ${row.unit}` : ""}</span>
                        {!isTrad && Math.abs(change) > 0.5 && (
                          <span className={`ml-1 text-[0.6rem] ${better ? "text-emerald-600" : "text-red-500"}`}>
                            {change > 0 ? "+" : ""}{fmt(change)}%
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Gantt comparison */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          {([
            { key: "sameTeamAI" as ScenarioKey, label: "Full-stack" },
            { key: "miniSquad" as ScenarioKey, label: "Tiny AI" },
          ]).map((s) => (
            <button
              key={s.key}
              onClick={() => setGanttView(s.key)}
              className={`px-2.5 py-1 rounded-md text-[0.65rem] font-medium border transition-colors ${
                ganttView === s.key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {s.label}
            </button>
          ))}
          <span className="text-[0.6rem] text-muted-foreground ml-1">vs current</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <MiniGantt
            entries={trad.entries}
            projects={projects}
            horizonMonths={horizonMonths}
            label={`Current (${trad.headcount} people, ${numSquads} teams)`}
            headcount={trad.headcount}
          />
          <MiniGantt
            entries={ganttScenario.entries}
            projects={projects}
            horizonMonths={horizonMonths}
            label={`${ganttScenario.label} (${ganttScenario.headcount} people, ${numSquads} teams)`}
            headcount={ganttScenario.headcount}
          />
        </div>
      </div>
    </div>
  );
}
