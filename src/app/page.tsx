"use client";

import Link from "next/link";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { optimize, effectiveFe, effectiveBe } from "@/lib/optimizer";
import { analyzeProjects, computeOptimalPlan } from "@/lib/alerts";
import { SEED_SQUADS, SEED_PROJECTS } from "@/lib/seed";
import { RecommendationAction, ComparisonResult, Objective } from "@/lib/types";
import { runComparison } from "@/lib/ai-comparison";
import { SquadTable } from "@/components/squad-table";
import { ProjectTable } from "@/components/project-table";
import { GanttChart } from "@/components/gantt-chart";
import { ComparisonDashboard } from "@/components/comparison-dashboard";
import { ForecastView } from "@/components/forecast-view";
import { PilotSimulator } from "@/components/pilot-simulator";
import { Button } from "@/components/ui/button";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const OBJECTIVES: { id: Objective; label: string; desc: string }[] = [
  { id: "wsjf", label: "Balanced", desc: "Best mix of value and speed" },
  { id: "max-value", label: "Highest value first", desc: "Do the most valuable projects first" },
  { id: "min-delay", label: "Meet deadlines", desc: "Prioritize projects with deadlines" },
  { id: "max-throughput", label: "Ship the most", desc: "Deliver as many projects as possible" },
];

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const {
    squads, projects, schedule, prevSchedule,
    horizonMonths, horizonStartMonth, horizonStartYear,
    cycleLengthWeeks, cycleOverheadPct, objective, aiEffect,
    setSchedule, setHorizonMonths, setHorizonStart,
    setCycleLengthWeeks, setCycleOverheadPct, setObjective, setAiEffect,
    loadData, updateMember, updateProject,
  } = useStore();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeView, setActiveView] = useState<"timeline" | "risk" | "pilot" | "compare">("timeline");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runOptimize = useCallback(() => {
    if (squads.length === 0 || projects.length === 0) return;
    const result = optimize(projects, squads, horizonMonths, objective, aiEffect);
    setSchedule(result);
  }, [projects, squads, horizonMonths, objective, aiEffect, setSchedule]);

  useEffect(() => {
    if (!hydrated) return;
    if (schedule !== null) return;
    if (squads.length === 0 || projects.length === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(runOptimize, 120);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [hydrated, schedule, squads, projects, horizonMonths, runOptimize]);

  const alerts = useMemo(() => {
    if (!hydrated || squads.length === 0) return [];
    return analyzeProjects(projects, squads, horizonMonths, aiEffect);
  }, [hydrated, projects, squads, horizonMonths, aiEffect]);

  const hasData = squads.length > 0 && projects.length > 0;
  const displaySchedule = schedule ?? (hasData ? prevSchedule : null);

  const optimalPlan = useMemo(() => {
    if (!displaySchedule || displaySchedule.deferred.length === 0) return null;
    return computeOptimalPlan(projects, squads, displaySchedule, horizonMonths, objective, aiEffect);
  }, [displaySchedule, projects, squads, horizonMonths, objective, aiEffect]);

  const comparison = useMemo<ComparisonResult | null>(() => {
    if (!hasData || !displaySchedule) return null;
    return runComparison(squads, projects, horizonMonths, cycleOverheadPct, objective);
  }, [hasData, displaySchedule, squads, projects, horizonMonths, cycleOverheadPct, objective]);

  const applyRecommendation = useCallback((action: RecommendationAction) => {
    switch (action.type) {
      case "flip-role":
        updateMember(action.squadId, action.memberId, { role: action.newRole });
        break;
      case "bump-allocation":
        updateMember(action.squadId, action.memberId, { allocation: action.newAllocation });
        break;
      case "reduce-requirement":
        updateProject(action.projectId, { [action.field]: action.newValue });
        break;
    }
  }, [updateMember, updateProject]);

  const aiMul = 1 + aiEffect;
  const totalFeCap = squads.reduce((sum, s) => sum + effectiveFe(s), 0) * aiMul * horizonMonths;
  const totalBeCap = squads.reduce((sum, s) => sum + effectiveBe(s), 0) * aiMul * horizonMonths;
  const totalCap = totalFeCap + totalBeCap;
  const totalDemand = projects.reduce((sum, p) => sum + p.duration * (p.feNeeded + p.beNeeded), 0);
  const utilPct = totalCap > 0 ? Math.min(100, Math.round((totalDemand / totalCap) * 100)) : 0;

  const loadSample = useCallback(() => loadData(SEED_SQUADS, SEED_PROJECTS), [loadData]);

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <main className="w-full max-w-[1440px] mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Portfolio Optimizer</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Plan what your teams deliver and when.</p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Link href="/learn" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1">
            Learn
          </Link>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadSample}>
            Load sample data
          </Button>
          {(squads.length > 0 || projects.length > 0) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => loadData([], [])}>
              Clear all
            </Button>
          )}
        </div>
      </header>

      {/* Settings */}
      <section className="p-4 border rounded-lg bg-muted/20 space-y-3">
        <div className="flex flex-wrap items-end gap-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Start</label>
            <div className="flex gap-2">
              <select
                value={horizonStartMonth}
                onChange={(e) => setHorizonStart(Number(e.target.value), horizonStartYear)}
                className="flex h-8 w-28 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
              <input
                type="number" min={2024} max={2030} value={horizonStartYear}
                onChange={(e) => setHorizonStart(horizonStartMonth, parseInt(e.target.value) || 2026)}
                className="flex h-8 w-20 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Plan ahead</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={1} max={24} value={horizonMonths}
                onChange={(e) => setHorizonMonths(parseInt(e.target.value) || 6)}
                className="flex h-8 w-14 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <span className="text-xs text-muted-foreground">months</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Priority</label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value as Objective)}
              className="flex h-8 w-44 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {OBJECTIVES.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Workload bar */}
          {hasData && (
            <div className="ml-auto min-w-[180px] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Workload</span>
                <span className={`text-xs font-bold tabular-nums ${
                  utilPct > 100 ? "text-red-600" : utilPct > 85 ? "text-amber-600" : "text-emerald-600"
                }`}>{utilPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    utilPct > 100 ? "bg-red-500" : utilPct > 85 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, utilPct)}%` }}
                />
              </div>
            </div>
          )}

          {/* Advanced toggle */}
          <button
            onClick={() => setShowAdvanced((p) => !p)}
            className="text-[0.65rem] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? "Less \u25B4" : "More \u25BE"}
          </button>
        </div>

        {showAdvanced && (
          <div className="flex flex-wrap items-end gap-5 pt-3 border-t">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Sprint length</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min={1} max={4} value={cycleLengthWeeks}
                  onChange={(e) => setCycleLengthWeeks(Math.max(1, Math.min(4, parseInt(e.target.value) || 1)))}
                  className="flex h-8 w-14 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <span className="text-xs text-muted-foreground">wk</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Meeting overhead</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min={0} max={50} value={cycleOverheadPct}
                  onChange={(e) => setCycleOverheadPct(Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
                  className="flex h-8 w-14 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">AI boost</label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={-10} max={10} step={1}
                  value={Math.round(aiEffect * 10)}
                  onChange={(e) => setAiEffect(parseInt(e.target.value) / 10)}
                  className="w-20 h-1.5 accent-current"
                />
                <span className={`text-xs font-bold tabular-nums w-10 ${
                  aiEffect > 0 ? "text-green-600" : aiEffect < 0 ? "text-red-600" : "text-muted-foreground"
                }`}>
                  {aiEffect === 0 ? "0" : aiEffect > 0 ? `+${(aiEffect * 100).toFixed(0)}%` : `${(aiEffect * 100).toFixed(0)}%`}
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Empty state */}
      {!hasData && (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-xl bg-muted/10">
          <h2 className="text-lg font-semibold">Get started</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            Load sample data to see it in action, or add your own teams and projects.
          </p>
          <Button onClick={loadSample} size="sm" className="h-9 text-sm px-6 mt-5">
            Try with sample data
          </Button>
        </div>
      )}

      {/* Teams + Projects */}
      <div className={`grid grid-cols-1 gap-6 items-start ${
        hasData ? "lg:grid-cols-[20rem_1fr]" : "lg:grid-cols-2"
      }`}>
        <SquadTable />
        <ProjectTable alerts={alerts} />
      </div>

      {/* Results */}
      {hasData && displaySchedule && (
        <section className="space-y-4">
          {/* Status line */}
          <div className="flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${schedule ? "bg-emerald-500" : "bg-amber-400 animate-pulse"}`} />
            <span className="font-medium">{displaySchedule.entries.length} scheduled</span>
            {displaySchedule.deferred.length > 0 && (
              <span className="text-red-600 font-medium">
                &middot; {displaySchedule.deferred.length} won&apos;t fit
              </span>
            )}
            {!schedule && <span className="text-xs text-muted-foreground animate-pulse ml-1">updating...</span>}
          </div>

          {/* Quick fix suggestion (only when projects are deferred) */}
          {optimalPlan && optimalPlan.actions.length > 0 && (
            <div className="flex items-center gap-3 p-3 border rounded-lg bg-emerald-50/60 border-emerald-200/60">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-800">
                  We can fit {optimalPlan.scheduledCount} projects with {optimalPlan.actions.length} small change{optimalPlan.actions.length > 1 ? "s" : ""}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {optimalPlan.descriptions.slice(0, 3).map((d, i) => (
                    <li key={i} className="text-[0.65rem] text-emerald-700">{d}</li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => optimalPlan.actions.forEach(applyRecommendation)}
                className="shrink-0 text-xs font-semibold px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                Apply
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-1 border rounded-lg p-1 w-fit">
            {([
              { key: "timeline" as const, label: "Timeline" },
              { key: "risk" as const, label: "Risk" },
              { key: "pilot" as const, label: "Pilot" },
              { key: "compare" as const, label: "Compare" },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveView(tab.key)}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeView === tab.key
                    ? "bg-foreground text-background"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeView === "timeline" && <GanttChart />}
          {activeView === "risk" && (
            <ForecastView deterministicScheduledCount={displaySchedule.entries.length} />
          )}
          {activeView === "pilot" && (
            <PilotSimulator projects={projects} squads={squads} horizonMonths={horizonMonths} />
          )}
          {activeView === "compare" && comparison && (
            <ComparisonDashboard
              comparison={comparison}
              projects={projects}
              horizonMonths={horizonMonths}
            />
          )}
        </section>
      )}
    </main>
  );
}
