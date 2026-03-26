"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { optimize, effectiveFe, effectiveBe } from "@/lib/optimizer";
import { analyzeProjects, generateRecommendations, computeDiff, computeOptimalPlan } from "@/lib/alerts";
import { SEED_SQUADS, SEED_PROJECTS } from "@/lib/seed";
import { RecommendationAction, OptimalPlan } from "@/lib/types";
import { SquadTable } from "@/components/squad-table";
import { ProjectTable } from "@/components/project-table";
import { GanttChart } from "@/components/gantt-chart";
import { RecommendationsPanel } from "@/components/recommendations";
import { Button } from "@/components/ui/button";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const {
    squads, projects, schedule, prevSchedule,
    horizonMonths, horizonStartMonth, horizonStartYear,
    setSchedule, setHorizonMonths, setHorizonStart, loadData,
    updateMember, updateProject, addProject,
  } = useStore();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runOptimize = useCallback(() => {
    if (squads.length === 0 || projects.length === 0) return;
    const result = optimize(projects, squads, horizonMonths);
    setSchedule(result);
  }, [projects, squads, horizonMonths, setSchedule]);

  useEffect(() => {
    if (!hydrated) return;
    if (schedule !== null) return;
    if (squads.length === 0 || projects.length === 0) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(runOptimize, 120);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [hydrated, schedule, squads, projects, horizonMonths, runOptimize]);

  const alerts = useMemo(() => {
    if (!hydrated || squads.length === 0) return [];
    return analyzeProjects(projects, squads, horizonMonths);
  }, [hydrated, projects, squads, horizonMonths]);

  const displaySchedule = schedule ?? prevSchedule;

  const recommendations = useMemo(() => {
    if (!displaySchedule || displaySchedule.deferred.length === 0) return [];
    return generateRecommendations(projects, squads, displaySchedule, horizonMonths);
  }, [displaySchedule, projects, squads, horizonMonths]);

  const optimalPlan = useMemo(() => {
    if (!displaySchedule || displaySchedule.deferred.length === 0) return null;
    return computeOptimalPlan(projects, squads, displaySchedule, horizonMonths);
  }, [displaySchedule, projects, squads, horizonMonths]);

  const diff = useMemo(() => {
    if (!schedule || !prevSchedule) return null;
    return computeDiff(prevSchedule, schedule, projects);
  }, [schedule, prevSchedule, projects]);

  const projectNames = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

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

  const totalFeCap = squads.reduce((sum, s) => sum + effectiveFe(s), 0) * horizonMonths;
  const totalBeCap = squads.reduce((sum, s) => sum + effectiveBe(s), 0) * horizonMonths;
  const totalCap = totalFeCap + totalBeCap;
  const totalFeDemand = projects.reduce((sum, p) => sum + p.duration * p.feNeeded, 0);
  const totalBeDemand = projects.reduce((sum, p) => sum + p.duration * p.beNeeded, 0);
  const totalDemand = totalFeDemand + totalBeDemand;

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <main className="w-full max-w-[1440px] mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <header>
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Portfolio Optimizer</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Define squads and projects, then get an optimized delivery plan.
            </p>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => loadData(SEED_SQUADS, SEED_PROJECTS)}
            >
              Load sample data
            </Button>
            {(squads.length > 0 || projects.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => loadData([], [])}
              >
                Clear all
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Horizon settings */}
      <section className="flex flex-wrap items-end gap-5 p-4 border rounded-lg bg-muted/20">
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Start month
          </label>
          <select
            value={horizonStartMonth}
            onChange={(e) => setHorizonStart(Number(e.target.value), horizonStartYear)}
            className="flex h-8 w-36 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Year
          </label>
          <input
            type="number" min={2024} max={2030} value={horizonStartYear}
            onChange={(e) => setHorizonStart(horizonStartMonth, parseInt(e.target.value) || 2026)}
            className="flex h-8 w-20 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Horizon (months)
          </label>
          <input
            type="number" min={1} max={24} value={horizonMonths}
            onChange={(e) => setHorizonMonths(parseInt(e.target.value) || 6)}
            className="flex h-8 w-16 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {squads.length > 0 && (
          <div className="ml-auto text-right space-y-1 pl-4">
            <div className="text-xs text-muted-foreground">
              Capacity&ensp;
              <span className="font-semibold text-foreground tabular-nums">{fmt(totalFeCap)}</span>{" "}
              <span className="text-[0.65rem]">FE</span>
              &ensp;
              <span className="font-semibold text-foreground tabular-nums">{fmt(totalBeCap)}</span>{" "}
              <span className="text-[0.65rem]">BE</span>
              &ensp;person-months
            </div>
            <div className="text-xs text-muted-foreground">
              Demand&ensp;
              <span className={`font-semibold tabular-nums ${totalFeDemand > totalFeCap ? "text-destructive" : "text-foreground"}`}>
                {totalFeDemand}
              </span>{" "}
              <span className="text-[0.65rem]">FE</span>
              &ensp;
              <span className={`font-semibold tabular-nums ${totalBeDemand > totalBeCap ? "text-destructive" : "text-foreground"}`}>
                {totalBeDemand}
              </span>{" "}
              <span className="text-[0.65rem]">BE</span>
              &ensp;person-months
              {totalDemand > totalCap && (
                <span className="text-destructive font-medium ml-2">overcommitted</span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Data input: Squads + Projects */}
      <section className={`grid grid-cols-1 gap-6 items-start ${
        squads.length > 0 || projects.length > 0
          ? "lg:grid-cols-[20rem_1fr]"
          : "lg:grid-cols-2"
      }`}>
        <SquadTable />
        <ProjectTable alerts={alerts} />
      </section>

      {/* Status bar */}
      {(displaySchedule || (squads.length > 0 && projects.length > 0)) && (
        <div className="flex items-center gap-3 px-1">
          {displaySchedule ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className={`w-2 h-2 rounded-full ${schedule ? "bg-emerald-500" : "bg-amber-400 animate-pulse"}`} />
              <span className="font-medium text-foreground">{displaySchedule.entries.length}</span> scheduled
              {displaySchedule.deferred.length > 0 && (
                <>
                  <span className="mx-1">&middot;</span>
                  <span className="text-destructive font-medium">
                    {displaySchedule.deferred.length} deferred
                  </span>
                </>
              )}
              {!schedule && <span className="text-xs text-muted-foreground/60 ml-1">updating&hellip;</span>}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Optimizing&hellip;</span>
            </div>
          )}
          <Button variant="outline" size="sm" className="ml-auto h-8 text-xs" onClick={runOptimize}>
            Re-optimize
          </Button>
        </div>
      )}

      {/* Capacity insight */}
      {displaySchedule && squads.length > 0 && (() => {
        const scheduledFe = displaySchedule.entries.reduce((s, e) => {
          const p = projects.find((pr) => pr.id === e.projectId);
          return s + (p ? p.feNeeded * p.duration : 0);
        }, 0);
        const scheduledBe = displaySchedule.entries.reduce((s, e) => {
          const p = projects.find((pr) => pr.id === e.projectId);
          return s + (p ? p.beNeeded * p.duration : 0);
        }, 0);
        const spareFe = Math.max(0, totalFeCap - scheduledFe);
        const spareBe = Math.max(0, totalBeCap - scheduledBe);
        const utilPct = totalCap > 0 ? ((scheduledFe + scheduledBe) / totalCap) * 100 : 0;
        const hasSpare = spareFe >= 1 || spareBe >= 1;
        const isOvercommitted = totalDemand > totalCap;

        if (!hasSpare && !isOvercommitted) return null;

        if (hasSpare && displaySchedule.deferred.length === 0) {
          return (
            <div className="flex items-center gap-3 p-3 border rounded-lg bg-blue-50/50 border-blue-200/60">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-blue-800">
                  {fmt(Math.round(utilPct))}% capacity utilized &mdash; you have room for more work
                </p>
                <p className="text-xs text-blue-600/80 mt-0.5">
                  {fmt(spareFe)} FE and {fmt(spareBe)} BE person-months available.
                  Add projects to maximize delivery.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                onClick={() => {
                  addProject({
                    id: crypto.randomUUID(),
                    name: `Project ${projects.length + 1}`,
                    duration: 2,
                    feNeeded: 1,
                    beNeeded: 1,
                    businessValue: 5,
                    timeCriticality: 5,
                    riskReduction: 3,
                    squadId: squads[0]?.id || "",
                    dependencies: [],
                  });
                }}
              >
                + Add project
              </Button>
            </div>
          );
        }

        return null;
      })()}

      {/* Recommendations + diff */}
      <RecommendationsPanel
        recommendations={recommendations}
        optimalPlan={optimalPlan}
        diff={diff}
        projectNames={projectNames}
        onApply={applyRecommendation}
        onApplyPlan={(plan) => plan.actions.forEach(applyRecommendation)}
      />

      {/* Gantt chart */}
      <GanttChart />
    </main>
  );
}
