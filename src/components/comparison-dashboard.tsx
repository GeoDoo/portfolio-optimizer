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

const TABLE_SCENARIOS: { key: ScenarioKey; title: string; color: string; description: string }[] = [
  {
    key: "traditional",
    title: "Current setup",
    color: "text-slate-700",
    description: "Your existing teams",
  },
  {
    key: "sameTeamAI",
    title: "Full-stack + AI",
    color: "text-emerald-700",
    description: "Same people, all full-stack",
  },
  {
    key: "miniSquad",
    title: "Tiny AI team",
    color: "text-violet-700",
    description: "1 engineer + 1 PM per team",
  },
];

const GANTT_SCENARIOS: { key: ScenarioKey; title: string; bg: string; color: string }[] = [
  { key: "sameTeamAI", title: "Full-stack + AI", bg: "bg-emerald-50 border-emerald-200", color: "text-emerald-700" },
  { key: "miniSquad", title: "Tiny AI team", bg: "bg-violet-50 border-violet-200", color: "text-violet-700" },
];

function fmt(n: number, decimals = 1): string {
  if (n % 1 === 0) return String(n);
  return n.toFixed(decimals);
}

function GainBadge({ value, suffix = "%" }: { value: number; suffix?: string }) {
  if (Math.abs(value) < 0.5) return null;
  const positive = value > 0;
  return (
    <span className={`text-xs font-semibold tabular-nums ${positive ? "text-emerald-600" : "text-red-500"}`}>
      {positive ? "+" : ""}{fmt(value)}{suffix}
    </span>
  );
}

function MiniGantt({
  entries,
  projects,
  horizonMonths,
  label,
  headcount,
  accentColor,
}: {
  entries: ScheduleEntry[];
  projects: Project[];
  horizonMonths: number;
  label: string;
  headcount: number;
  accentColor: string;
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
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${accentColor}`}>
        <span className="text-xs font-semibold">{label}</span>
        <span className="text-[0.65rem] text-muted-foreground ml-auto">{headcount} people</span>
      </div>
      <div className="relative">
        {squadIds.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No projects scheduled
          </div>
        )}
        {squadIds.map((sid) => {
          const sqLanes = lanes.get(sid) ?? [[]];
          const height = Math.max(1, sqLanes.length) * ROW_H;
          return (
            <div key={sid} className="flex border-t first:border-t-0">
              <div className="w-20 shrink-0 px-2 py-1 border-r flex items-center">
                <span className="text-[0.6rem] text-muted-foreground truncate">
                  Team {squadIds.indexOf(sid) + 1}
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
  const [ganttView, setGanttView] = useState<ScenarioKey>("sameTeamAI");

  const trad = comparison.traditional;
  const ganttScenario = comparison[ganttView];

  const insights = useMemo(() => {
    const lines: string[] = [];

    if (cycleOverheadPct > 0) {
      lines.push(
        `Your teams spend about ${fmt(comparison.overheadGainPct)}% of their time in meetings and ceremonies instead of building. Shorter cycles with AI could reduce this.`,
      );
    }

    if (comparison.flexibilityGainPct > 0.5) {
      const extra = comparison.sameTeamAI.scheduledCount - trad.scheduledCount;
      lines.push(
        `If your engineers could work on both frontend and backend, you'd deliver ${fmt(comparison.flexibilityGainPct)}% more value` +
        (extra > 0 ? ` and ${extra} extra project${extra > 1 ? "s" : ""}` : "") +
        ` — same ${trad.headcount} people, no extra hiring.`,
      );
    } else {
      lines.push(
        `Your current team setup is well balanced for this set of projects. Making everyone full-stack wouldn't help much here.`,
      );
    }

    const beMult = comparison.breakEvenMultiplier;
    const miniHc = comparison.miniSquad.headcount;
    lines.push(
      `A tiny AI team (${miniHc} people instead of ${trad.headcount}) would need each person to be ${fmt(beMult)}x more productive to deliver the same results.`,
    );

    return lines;
  }, [comparison, trad, cycleOverheadPct]);

  const numSquads = comparison.traditional.headcount > 0
    ? Math.round(comparison.miniSquad.headcount / 2)
    : 0;

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground">
          What if you changed your team setup?
        </h2>
        <p className="text-xs text-muted-foreground/70 mt-0.5">
          We take your actual projects and simulate three different ways to organise your people.
        </p>
      </div>

      {/* Scenario explanations */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 border rounded-lg bg-slate-50/60 border-slate-200/60">
          <div className="text-xs font-bold text-slate-700 mb-2">Current setup</div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Your teams as they are today: <strong>{trad.headcount} people</strong> across {numSquads} teams,
            with separate frontend and backend engineers.
            Each person can only work on their speciality.
          </p>
        </div>
        <div className="p-4 border rounded-lg bg-emerald-50/60 border-emerald-200/60">
          <div className="text-xs font-bold text-emerald-700 mb-2">Full-stack + AI</div>
          <p className="text-xs text-emerald-700 leading-relaxed">
            Same <strong>{trad.headcount} people</strong>, same {numSquads} teams — but every engineer
            can now work on both frontend and backend (with AI assistance).
            No one is blocked waiting for a specialist.
          </p>
        </div>
        <div className="p-4 border rounded-lg bg-violet-50/60 border-violet-200/60">
          <div className="text-xs font-bold text-violet-700 mb-2">Tiny AI teams</div>
          <p className="text-xs text-violet-700 leading-relaxed">
            Radically smaller: just <strong>1 engineer + 1 PM per team</strong> = {numSquads} teams
            of 2 people ({comparison.miniSquad.headcount} total, down from {trad.headcount}).
            The question: how productive must AI make each person to keep up?
          </p>
        </div>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 border rounded-lg bg-blue-50/40 border-blue-200/50">
          <div className="text-xs font-medium text-blue-600 mb-1">
            Time lost to meetings
          </div>
          <div className="text-2xl font-bold text-blue-700 tabular-nums">
            {fmt(comparison.overheadGainPct)}%
          </div>
          <div className="text-[0.65rem] text-blue-600/70 mt-1">
            of work time goes to planning, retros, demos
          </div>
        </div>
        <div className="p-4 border rounded-lg bg-emerald-50/40 border-emerald-200/50">
          <div className="text-xs font-medium text-emerald-600 mb-1">
            Full-stack advantage
          </div>
          <div className="text-2xl font-bold text-emerald-700 tabular-nums">
            +{fmt(comparison.flexibilityGainPct)}%
          </div>
          <div className="text-[0.65rem] text-emerald-600/70 mt-1">
            more value delivered when nobody waits for a specialist
          </div>
        </div>
        <div className="p-4 border rounded-lg bg-violet-50/40 border-violet-200/50">
          <div className="text-xs font-medium text-violet-600 mb-1">
            AI must make each person
          </div>
          <div className="text-2xl font-bold text-violet-700 tabular-nums">
            {fmt(comparison.breakEvenMultiplier)}x faster
          </div>
          <div className="text-[0.65rem] text-violet-600/70 mt-1">
            for {comparison.miniSquad.headcount} people to match what {trad.headcount} deliver today
          </div>
        </div>
      </div>

      {/* Scenario comparison table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/40">
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Metric</th>
              {TABLE_SCENARIOS.map((s) => (
                <th key={s.key} className={`text-center px-3 py-2 font-semibold ${s.color}`}>
                  <div>{s.title}</div>
                  <div className="font-normal text-[0.55rem] text-muted-foreground/60">{s.description}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {([
              { label: "Team size", key: "headcount" as const, lower: true, unit: " people" },
              { label: "Engineering capacity", key: "engineeringFte" as const, lower: false, unit: "" },
              { label: "Projects delivered", key: "scheduledCount" as const, lower: false, unit: "" },
              { label: "Projects that won't fit", key: "deferredCount" as const, lower: true, unit: "" },
              { label: "Total value delivered", key: "totalValueDelivered" as const, lower: false, unit: " pts" },
              { label: "Average time to deliver", key: "avgLeadTime" as const, lower: true, unit: " months" },
            ] as const).map((row) => {
              const tradVal = trad[row.key] as number;
              const fmtVal = (v: number) =>
                row.key === "avgLeadTime" || row.key === "engineeringFte" ? fmt(v) : String(Math.round(v));

              return (
                <tr key={row.key} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{row.label}</td>
                  {TABLE_SCENARIOS.map((s) => {
                    const val = comparison[s.key][row.key] as number;
                    const change = pctChange(tradVal, val);
                    const better = row.lower ? change < 0 : change > 0;
                    const isTrad = s.key === "traditional";

                    return (
                      <td key={s.key} className="text-center px-3 py-2 tabular-nums">
                        <span className="font-semibold">{fmtVal(val)}{row.unit}</span>
                        {!isTrad && Math.abs(change) > 0.5 && (
                          <span className={`ml-1.5 ${better ? "text-emerald-600" : "text-red-500"}`}>
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
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground">Compare schedules:</span>
          {GANTT_SCENARIOS.map((s) => (
            <button
              key={s.key}
              onClick={() => setGanttView(s.key)}
              className={`px-2.5 py-1 rounded-md text-[0.65rem] font-medium border transition-colors ${
                ganttView === s.key
                  ? `${s.bg} ${s.color}`
                  : "bg-background text-muted-foreground hover:bg-muted border-transparent"
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <MiniGantt
            entries={trad.entries}
            projects={projects}
            horizonMonths={horizonMonths}
            label={`Current setup (${trad.headcount} people, ${numSquads} teams)`}
            headcount={trad.headcount}
            accentColor="bg-slate-50/50"
          />
          <MiniGantt
            entries={ganttScenario.entries}
            projects={projects}
            horizonMonths={horizonMonths}
            label={`${ganttScenario.label} (${ganttScenario.headcount} people, ${numSquads} teams)`}
            headcount={ganttScenario.headcount}
            accentColor="bg-violet-50/50"
          />
        </div>
      </div>

      {/* Plain English summary */}
      <div className="p-4 border rounded-lg bg-gradient-to-r from-violet-50/60 to-blue-50/60 border-violet-200/40">
        <div className="text-xs font-bold text-violet-700 mb-2">
          What does this mean?
        </div>
        <div className="space-y-1.5">
          {insights.map((line, i) => (
            <p key={i} className="text-sm text-foreground/80 leading-relaxed">{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
