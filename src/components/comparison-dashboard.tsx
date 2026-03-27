"use client";

import { useMemo, useState } from "react";
import {
  ComparisonResult,
  ScenarioLabel,
  Project,
  ScheduleEntry,
} from "@/lib/types";
import { pctChange, formatMultiplier } from "@/lib/ai-comparison";

const SCENARIO_META: { label: ScenarioLabel; title: string; color: string; bg: string }[] = [
  { label: "conservative", title: "Conservative", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  { label: "moderate", title: "Moderate", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  { label: "aggressive", title: "Aggressive", color: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
];

const BAR_COLORS = [
  "bg-blue-400", "bg-emerald-400", "bg-amber-400", "bg-violet-400",
  "bg-rose-400", "bg-cyan-400", "bg-orange-400", "bg-teal-400",
];

function MetricCard({
  label,
  traditional,
  ai,
  unit,
  higherIsBetter = true,
  format,
}: {
  label: string;
  traditional: number;
  ai: number;
  unit?: string;
  higherIsBetter?: boolean;
  format?: (n: number) => string;
}) {
  const change = pctChange(traditional, ai);
  const improved = higherIsBetter ? change > 0 : change < 0;
  const fmt = format ?? ((n: number) => n % 1 === 0 ? String(n) : n.toFixed(1));

  return (
    <div className="flex flex-col gap-1 p-3 border rounded-lg bg-background min-w-0">
      <span className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground truncate">
        {label}
      </span>
      <div className="flex items-end gap-2">
        <div className="flex flex-col">
          <span className="text-lg font-bold tabular-nums leading-tight">{fmt(ai)}</span>
          <span className="text-[0.6rem] text-muted-foreground">AI</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-sm text-muted-foreground tabular-nums leading-tight">{fmt(traditional)}</span>
          <span className="text-[0.6rem] text-muted-foreground">Trad.</span>
        </div>
      </div>
      {unit && <span className="text-[0.6rem] text-muted-foreground -mt-0.5">{unit}</span>}
      {Math.abs(change) > 0.5 && (
        <span className={`text-xs font-semibold tabular-nums ${improved ? "text-emerald-600" : "text-red-500"}`}>
          {change > 0 ? "+" : ""}{change.toFixed(0)}%
        </span>
      )}
    </div>
  );
}

function MiniGantt({
  entries,
  projects,
  horizonMonths,
  title,
  headcount,
}: {
  entries: ScheduleEntry[];
  projects: Project[];
  horizonMonths: number;
  title: string;
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
      const sqEntries = entries
        .filter((e) => e.squadId === sid)
        .sort((a, b) => a.startMonth - b.startMonth);
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

  const ROW_H = 24;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-[0.65rem] text-muted-foreground ml-auto">{headcount} people</span>
      </div>
      <div className="relative">
        {squadIds.map((sid) => {
          const sqLanes = lanes.get(sid) ?? [[]];
          const height = Math.max(1, sqLanes.length) * ROW_H;
          return (
            <div key={sid} className="flex border-t first:border-t-0">
              <div className="w-20 shrink-0 px-2 py-1 border-r flex items-center">
                <span className="text-[0.6rem] text-muted-foreground truncate">
                  Squad {squadIds.indexOf(sid) + 1}
                </span>
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
                        className={`absolute rounded text-[0.55rem] text-white font-medium flex items-center px-1 truncate ${colorMap.get(entry.projectId)}`}
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
  cycleLengthWeeks,
  cycleOverheadPct,
}: {
  comparison: ComparisonResult;
  projects: Project[];
  horizonMonths: number;
  cycleLengthWeeks: number;
  cycleOverheadPct: number;
}) {
  const [activeScenario, setActiveScenario] = useState<ScenarioLabel>("moderate");
  const trad = comparison.traditional;
  const ai = comparison.scenarios[activeScenario];

  const pitchText = useMemo(() => {
    const headcountSaved = trad.headcount - ai.headcount;
    const headcountPctSaved = trad.headcount > 0 ? Math.round((headcountSaved / trad.headcount) * 100) : 0;
    const extraProjects = ai.scheduledCount - trad.scheduledCount;
    const valueGain = ai.totalValueDelivered - trad.totalValueDelivered;
    const fasterBy = trad.lastDeliveryMonth - ai.lastDeliveryMonth;

    const lines: string[] = [];
    lines.push(
      `With ${comparison.scenarios[activeScenario].headcount} people in AI mini squads (vs ${trad.headcount} traditional), ` +
      `we reduce headcount by ${headcountPctSaved}%.`,
    );
    if (extraProjects > 0) {
      lines.push(`We deliver ${extraProjects} more project${extraProjects > 1 ? "s" : ""} within the same horizon.`);
    } else if (extraProjects === 0) {
      lines.push(`We deliver the same number of projects (${ai.scheduledCount}).`);
    }
    if (valueGain > 0) {
      lines.push(`Total delivered value increases by ${valueGain} points (+${pctChange(trad.totalValueDelivered, ai.totalValueDelivered).toFixed(0)}%).`);
    }
    if (fasterBy > 0) {
      lines.push(`All work completes ${fasterBy} month${fasterBy > 1 ? "s" : ""} earlier.`);
    }
    if (ai.deferredCount < trad.deferredCount) {
      lines.push(`${trad.deferredCount - ai.deferredCount} fewer project${trad.deferredCount - ai.deferredCount > 1 ? "s" : ""} deferred.`);
    }
    return lines;
  }, [trad, ai, activeScenario, comparison]);

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Traditional vs AI Comparison
        </h2>
        <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
          Experimental
        </span>
      </div>

      {/* Model info */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 border rounded-lg bg-muted/20">
          <div className="text-xs font-semibold mb-1">Traditional model</div>
          <div className="text-[0.65rem] text-muted-foreground space-y-0.5">
            <div>FE + BE + PM roles per squad</div>
            <div>{cycleLengthWeeks}-week dev cycles &middot; {cycleOverheadPct}% ceremony overhead</div>
            <div>{trad.headcount} people total</div>
          </div>
        </div>
        <div className="p-3 border rounded-lg bg-violet-50/50 border-violet-200/60">
          <div className="text-xs font-semibold mb-1">AI mini squad model</div>
          <div className="text-[0.65rem] text-muted-foreground space-y-0.5">
            <div>1 Full-stack Eng + 1 PM + AI per squad</div>
            <div>Daily cycles &middot; 0% ceremony overhead</div>
            <div>{ai.headcount} people total &middot; {formatMultiplier(ai.multiplier)} productivity</div>
          </div>
        </div>
      </div>

      {/* Scenario tabs */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Scenario:</span>
        {SCENARIO_META.map((s) => {
          const scenario = comparison.scenarios[s.label];
          const active = activeScenario === s.label;
          return (
            <button
              key={s.label}
              onClick={() => setActiveScenario(s.label)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                active
                  ? `${s.bg} ${s.color}`
                  : "bg-background text-muted-foreground hover:bg-muted border-transparent"
              }`}
            >
              {s.title} ({formatMultiplier(scenario.multiplier)})
            </button>
          );
        })}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <MetricCard
          label="Headcount"
          traditional={trad.headcount}
          ai={ai.headcount}
          unit="people"
          higherIsBetter={false}
        />
        <MetricCard
          label="Projects delivered"
          traditional={trad.scheduledCount}
          ai={ai.scheduledCount}
        />
        <MetricCard
          label="Value delivered"
          traditional={trad.totalValueDelivered}
          ai={ai.totalValueDelivered}
          unit="points"
        />
        <MetricCard
          label="Avg lead time"
          traditional={trad.avgLeadTime}
          ai={ai.avgLeadTime}
          unit="months"
          higherIsBetter={false}
          format={(n) => n.toFixed(1)}
        />
        <MetricCard
          label="Utilization"
          traditional={trad.utilizationPct}
          ai={ai.utilizationPct}
          unit=""
          format={(n) => `${Math.round(n)}%`}
        />
        <MetricCard
          label="Deferred"
          traditional={trad.deferredCount}
          ai={ai.deferredCount}
          higherIsBetter={false}
        />
      </div>

      {/* Scenario comparison table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/40">
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Metric</th>
              <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Traditional</th>
              {SCENARIO_META.map((s) => (
                <th key={s.label} className={`text-center px-3 py-2 font-semibold ${s.color}`}>
                  {s.title} ({formatMultiplier(comparison.scenarios[s.label].multiplier)})
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {([
              { label: "Headcount", key: "headcount" as const, lower: true, unit: "" },
              { label: "Projects delivered", key: "scheduledCount" as const, lower: false, unit: "" },
              { label: "Deferred", key: "deferredCount" as const, lower: true, unit: "" },
              { label: "Value delivered", key: "totalValueDelivered" as const, lower: false, unit: " pts" },
              { label: "Avg lead time", key: "avgLeadTime" as const, lower: true, unit: " mo" },
              { label: "Utilization", key: "utilizationPct" as const, lower: false, unit: "%" },
            ] as const).map((row) => {
              const tradVal = trad[row.key] as number;
              const fmtVal = (v: number) =>
                row.key === "avgLeadTime" ? v.toFixed(1) :
                row.key === "utilizationPct" ? String(Math.round(v)) :
                String(v);

              return (
                <tr key={row.key} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{row.label}</td>
                  <td className="text-center px-3 py-2 tabular-nums">
                    {fmtVal(tradVal)}{row.unit}
                  </td>
                  {SCENARIO_META.map((s) => {
                    const scen = comparison.scenarios[s.label];
                    const aiVal = scen[row.key] as number;
                    const change = pctChange(tradVal, aiVal);
                    const better = row.lower ? change < 0 : change > 0;

                    return (
                      <td key={s.label} className="text-center px-3 py-2 tabular-nums">
                        <span className="font-semibold">
                          {fmtVal(aiVal)}{row.unit}
                        </span>
                        {Math.abs(change) > 0.5 && (
                          <span className={`ml-1 text-[0.6rem] font-semibold ${better ? "text-emerald-600" : "text-red-500"}`}>
                            {change > 0 ? "+" : ""}{change.toFixed(0)}%
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

      {/* Side-by-side Gantt */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <MiniGantt
          entries={trad.entries}
          projects={projects}
          horizonMonths={horizonMonths}
          title="Traditional"
          headcount={trad.headcount}
        />
        <MiniGantt
          entries={ai.entries}
          projects={projects}
          horizonMonths={horizonMonths}
          title={`AI — ${SCENARIO_META.find((s) => s.label === activeScenario)?.title} (${formatMultiplier(ai.multiplier)})`}
          headcount={ai.headcount}
        />
      </div>

      {/* Pitch summary */}
      <div className="p-4 border rounded-lg bg-gradient-to-r from-violet-50/60 to-blue-50/60 border-violet-200/40">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-violet-700">
            Executive summary
          </span>
          <span className="text-[0.6rem] text-muted-foreground">
            ({SCENARIO_META.find((s) => s.label === activeScenario)?.title} scenario)
          </span>
        </div>
        <div className="space-y-1">
          {pitchText.map((line, i) => (
            <p key={i} className="text-sm text-foreground/80 leading-relaxed">{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
