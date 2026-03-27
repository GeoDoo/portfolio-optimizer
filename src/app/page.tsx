"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { optimize, effectiveFe, effectiveBe } from "@/lib/optimizer";
import { analyzeProjects, generateRecommendations, computeDiff, computeOptimalPlan } from "@/lib/alerts";
import { SEED_SQUADS, SEED_PROJECTS } from "@/lib/seed";
import { RecommendationAction, OptimalPlan, ComparisonResult, Objective } from "@/lib/types";
import { runComparison } from "@/lib/ai-comparison";
import { SquadTable } from "@/components/squad-table";
import { ProjectTable } from "@/components/project-table";
import { GanttChart } from "@/components/gantt-chart";
import { RecommendationsPanel } from "@/components/recommendations";
import { ComparisonDashboard } from "@/components/comparison-dashboard";
import { ForecastView } from "@/components/forecast-view";
import { Button } from "@/components/ui/button";
import { OnboardingWizard, HelpButton } from "@/components/onboarding";

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
    cycleLengthWeeks, cycleOverheadPct, objective, aiEffect,
    setSchedule, setHorizonMonths, setHorizonStart,
    setCycleLengthWeeks, setCycleOverheadPct, setObjective, setAiEffect,
    loadData, updateMember, updateProject, addProject,
  } = useStore();

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
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [hydrated, schedule, squads, projects, horizonMonths, runOptimize]);

  const alerts = useMemo(() => {
    if (!hydrated || squads.length === 0) return [];
    return analyzeProjects(projects, squads, horizonMonths, aiEffect);
  }, [hydrated, projects, squads, horizonMonths, aiEffect]);

  const hasData = squads.length > 0 && projects.length > 0;
  const displaySchedule = schedule ?? (hasData ? prevSchedule : null);

  const recommendations = useMemo(() => {
    if (!displaySchedule || displaySchedule.deferred.length === 0) return [];
    return generateRecommendations(projects, squads, displaySchedule, horizonMonths, objective, aiEffect);
  }, [displaySchedule, projects, squads, horizonMonths, objective, aiEffect]);

  const optimalPlan = useMemo(() => {
    if (!displaySchedule || displaySchedule.deferred.length === 0) return null;
    return computeOptimalPlan(projects, squads, displaySchedule, horizonMonths, objective, aiEffect);
  }, [displaySchedule, projects, squads, horizonMonths, objective, aiEffect]);

  const diff = useMemo(() => {
    if (!schedule || !prevSchedule) return null;
    return computeDiff(prevSchedule, schedule, projects);
  }, [schedule, prevSchedule, projects]);

  const projectNames = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  const [activeView, setActiveView] = useState<"schedule" | "forecast" | "comparison">("schedule");

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

  const loadSample = useCallback(() => loadData(SEED_SQUADS, SEED_PROJECTS), [loadData]);

  return (
    <main className="w-full max-w-[1440px] mx-auto px-6 py-8 space-y-8">
      <OnboardingWizard onLoadSample={loadSample} />

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
            <HelpButton />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={loadSample}
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
        <div className="w-px h-8 bg-border" />
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground" title="Sprint/iteration length in weeks">
            Cycle (weeks)
          </label>
          <input
            type="number" min={1} max={4} value={cycleLengthWeeks}
            onChange={(e) => setCycleLengthWeeks(Math.max(1, Math.min(4, parseInt(e.target.value) || 1)))}
            className="flex h-8 w-14 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground" title="Percentage of time lost to meetings, planning, ceremonies">
            Overhead %
          </label>
          <input
            type="number" min={0} max={50} value={cycleOverheadPct}
            onChange={(e) => setCycleOverheadPct(Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
            className="flex h-8 w-14 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="w-px h-8 bg-border" />
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground" title="How to prioritize projects: WSJF (balanced), Value (highest value first), Delay (earliest deadline first), Speed (smallest projects first)">
            Objective
          </label>
          <div className="flex rounded-md border border-input overflow-hidden">
            {([
              { id: "wsjf" as Objective, label: "WSJF", tip: "Weighted Shortest Job First — balances value and effort" },
              { id: "max-value" as Objective, label: "Value", tip: "Schedule highest-value projects first" },
              { id: "min-delay" as Objective, label: "Delay", tip: "Prioritize projects with earliest deadlines" },
              { id: "max-throughput" as Objective, label: "Speed", tip: "Deliver the most projects by scheduling smallest first" },
            ]).map((o) => (
              <button
                key={o.id}
                onClick={() => setObjective(o.id)}
                title={o.tip}
                className={`px-2 py-1 text-[0.65rem] font-medium transition-colors ${
                  objective === o.id
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-8 bg-border" />
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground" title="Model AI impact on engineering capacity: positive = AI boosts throughput, negative = AI disruption reduces capacity">
            AI Effect
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={-10}
              max={10}
              step={1}
              value={Math.round(aiEffect * 10)}
              onChange={(e) => setAiEffect(parseInt(e.target.value) / 10)}
              className="w-20 h-1.5 accent-current"
            />
            <span className={`text-[0.7rem] font-semibold tabular-nums w-10 ${
              aiEffect > 0 ? "text-green-600" : aiEffect < 0 ? "text-red-600" : "text-muted-foreground"
            }`}>
              {aiEffect > 0 ? "+" : ""}{aiEffect.toFixed(1)}
            </span>
          </div>
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

      {/* Getting started prompt */}
      {squads.length === 0 && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-xl bg-muted/10">
          <div className="text-4xl mb-4">{"🚀"}</div>
          <h2 className="text-lg font-semibold">Get started in seconds</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Load sample data to see the optimizer in action, or create your own squads and projects below.
          </p>
          <div className="flex gap-3 mt-5">
            <Button onClick={loadSample} size="sm" className="h-9 text-sm px-6">
              Load sample data
            </Button>
            <Button variant="outline" size="sm" className="h-9 text-sm px-6" onClick={() => {
              const el = document.getElementById("squads-section");
              el?.scrollIntoView({ behavior: "smooth" });
            }}>
              Start from scratch
            </Button>
          </div>
        </div>
      )}

      {/* Data input: Squads + Projects */}
      <section id="squads-section" className={`grid grid-cols-1 gap-6 items-start ${
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
          {displaySchedule ? (() => {
            const totalPmFte = squads.reduce(
              (sum, s) => sum + s.members.filter((m) => m.role === "pm").reduce((ms, m) => ms + (m.allocation / 100) * (m.skill ?? 1), 0),
              0,
            );
            let peakConcurrent = 0;
            if (displaySchedule.entries.length > 0) {
              const maxMonth = Math.max(...displaySchedule.entries.map((e) => e.endMonth));
              for (let m = 0; m < maxMonth; m++) {
                const active = displaySchedule.entries.filter((e) => e.startMonth <= m && e.endMonth > m).length;
                peakConcurrent = Math.max(peakConcurrent, active);
              }
            }
            const pmRatio = totalPmFte > 0 ? peakConcurrent / totalPmFte : 0;
            const pmRisk = pmRatio > 5 ? "high" : pmRatio > 3 ? "medium" : "low";
            const pmColor = pmRisk === "high" ? "text-red-600" : pmRisk === "medium" ? "text-amber-600" : "text-green-600";

            return (
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
              {totalPmFte > 0 && (
                <>
                  <span className="mx-1">&middot;</span>
                  <span className={`text-xs font-medium ${pmColor}`}>
                    PM load: {pmRatio.toFixed(1)} proj/PM ({pmRisk})
                  </span>
                </>
              )}
              {!schedule && <span className="text-xs text-muted-foreground/60 ml-1">updating&hellip;</span>}
            </div>
            );
          })() : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Optimizing&hellip;</span>
            </div>
          )}
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
          if (utilPct >= 80) return null;

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

      {/* View toggle */}
      {hasData && displaySchedule && (
        <div className="space-y-2">
          <div className="flex items-center gap-1 border rounded-lg p-1 w-fit">
            <button
              onClick={() => setActiveView("schedule")}
              className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${
                activeView === "schedule"
                  ? "bg-foreground text-background"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              Schedule
            </button>
            <button
              onClick={() => setActiveView("forecast")}
              className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${
                activeView === "forecast"
                  ? "bg-foreground text-background"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              Forecast
            </button>
            <button
              onClick={() => setActiveView("comparison")}
              className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${
                activeView === "comparison"
                  ? "bg-violet-600 text-white"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              AI Comparison
              <span className="ml-1.5 text-[0.6rem] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                Experimental
              </span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground pl-1">
            {activeView === "schedule" && "Gantt chart showing the optimized delivery timeline for each squad."}
            {activeView === "forecast" && "Monte Carlo simulation \u2014 run hundreds of scenarios to see how likely your plan is to succeed."}
            {activeView === "comparison" && "Compare your current team setup against AI-augmented alternatives."}
          </p>
        </div>
      )}

      {/* Schedule view */}
      {activeView === "schedule" && (
        <GanttChart />
      )}

      {/* Forecast view */}
      {activeView === "forecast" && displaySchedule && (
        <ForecastView deterministicScheduledCount={displaySchedule.entries.length} />
      )}

      {/* AI Comparison view */}
      {activeView === "comparison" && comparison && (
        <ComparisonDashboard
          comparison={comparison}
          projects={projects}
          horizonMonths={horizonMonths}
          cycleLengthWeeks={cycleLengthWeeks}
          cycleOverheadPct={cycleOverheadPct}
        />
      )}
    </main>
  );
}
