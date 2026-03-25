"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { optimize, effectiveFe, effectiveBe } from "@/lib/optimizer";
import { analyzeProjects, generateRecommendations, computeDiff } from "@/lib/alerts";
import { SEED_SQUADS, SEED_PROJECTS } from "@/lib/seed";
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
    timerRef.current = setTimeout(runOptimize, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [hydrated, schedule, squads, projects, horizonMonths, runOptimize]);

  const alerts = useMemo(() => {
    if (!hydrated || squads.length === 0) return [];
    return analyzeProjects(projects, squads, horizonMonths);
  }, [hydrated, projects, squads, horizonMonths]);

  const recommendations = useMemo(() => {
    if (!schedule || schedule.deferred.length === 0) return [];
    return generateRecommendations(projects, squads, schedule, horizonMonths);
  }, [schedule, projects, squads, horizonMonths]);

  const diff = useMemo(() => {
    if (!schedule || !prevSchedule) return null;
    return computeDiff(prevSchedule, schedule, projects);
  }, [schedule, prevSchedule, projects]);

  const projectNames = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

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
    <main className="max-w-[1440px] mx-auto px-6 py-8 space-y-8">
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
            className="flex h-9 w-36 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            className="flex h-9 w-20 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Horizon (months)
          </label>
          <input
            type="number" min={1} max={24} value={horizonMonths}
            onChange={(e) => setHorizonMonths(parseInt(e.target.value) || 6)}
            className="flex h-9 w-16 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
      <section className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
        <SquadTable />
        <ProjectTable alerts={alerts} />
      </section>

      {/* Status bar */}
      {schedule && (
        <div className="flex items-center gap-3 px-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-medium text-foreground">{schedule.entries.length}</span> scheduled
            {schedule.deferred.length > 0 && (
              <>
                <span className="mx-1">&middot;</span>
                <span className="text-destructive font-medium">
                  {schedule.deferred.length} deferred
                </span>
              </>
            )}
          </div>
          <Button variant="outline" size="sm" className="ml-auto h-8 text-xs" onClick={runOptimize}>
            Re-optimize
          </Button>
        </div>
      )}

      {/* Recommendations + diff */}
      <RecommendationsPanel
        recommendations={recommendations}
        diff={diff}
        projectNames={projectNames}
      />

      {/* Gantt chart */}
      <GanttChart />
    </main>
  );
}
