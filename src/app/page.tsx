"use client";

import Link from "next/link";
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
import { PilotSimulator } from "@/components/pilot-simulator";
import { Button } from "@/components/ui/button";
import { OnboardingWizard, HelpButton } from "@/components/onboarding";

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

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeView, setActiveView] = useState<"schedule" | "forecast" | "pilot" | "comparison">("schedule");

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
      <OnboardingWizard onLoadSample={loadSample} />

      {/* ── Header ── */}
      <header className="flex items-center gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Portfolio Optimizer</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Plan what your teams deliver and when.
          </p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Link
            href="/learn"
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
          >
            Learn
          </Link>
          <HelpButton />
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

      {/* ── Settings ── */}
      <section className="p-4 border rounded-lg bg-muted/20 space-y-4">
        {/* Row 1: Essential settings */}
        <div className="flex flex-wrap items-end gap-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">When do you start?</label>
            <div className="flex gap-2">
              <select
                value={horizonStartMonth}
                onChange={(e) => setHorizonStart(Number(e.target.value), horizonStartYear)}
                className="flex h-8 w-32 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
              <input
                type="number" min={2024} max={2030} value={horizonStartYear}
                onChange={(e) => setHorizonStart(horizonStartMonth, parseInt(e.target.value) || 2026)}
                className="flex h-8 w-20 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">How far ahead to plan?</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={1} max={24} value={horizonMonths}
                onChange={(e) => setHorizonMonths(parseInt(e.target.value) || 6)}
                className="flex h-8 w-16 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <span className="text-xs text-muted-foreground">months</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">How to prioritize?</label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value as Objective)}
              className="flex h-8 w-48 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {OBJECTIVES.map((o) => (
                <option key={o.id} value={o.id}>{o.label} — {o.desc}</option>
              ))}
            </select>
          </div>

          {/* Capacity bar (simple) */}
          {squads.length > 0 && projects.length > 0 && (
            <div className="ml-auto space-y-1.5 min-w-[200px]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Team workload</label>
                <span className={`text-xs font-bold tabular-nums ${
                  utilPct > 100 ? "text-red-600" : utilPct > 85 ? "text-amber-600" : "text-emerald-600"
                }`}>
                  {utilPct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    utilPct > 100 ? "bg-red-500" : utilPct > 85 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, utilPct)}%` }}
                />
              </div>
              <p className="text-[0.65rem] text-muted-foreground">
                {utilPct > 100
                  ? "Too much work for your teams \u2014 some projects will be deferred"
                  : utilPct > 85
                    ? "Teams are nearly full \u2014 tight but doable"
                    : utilPct > 50
                      ? "Good balance \u2014 teams have some breathing room"
                      : "Lots of spare capacity \u2014 you could take on more work"
                }
              </p>
            </div>
          )}
        </div>

        {/* Advanced toggle */}
        <div>
          <button
            onClick={() => setShowAdvanced((p) => !p)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? "Hide advanced settings \u25B4" : "Show advanced settings \u25BE"}
          </button>

          {showAdvanced && (
            <div className="flex flex-wrap items-end gap-5 mt-3 pt-3 border-t">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Sprint length</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={4} value={cycleLengthWeeks}
                    onChange={(e) => setCycleLengthWeeks(Math.max(1, Math.min(4, parseInt(e.target.value) || 1)))}
                    className="flex h-8 w-14 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <span className="text-xs text-muted-foreground">weeks</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Time lost to meetings</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={50} value={cycleOverheadPct}
                    onChange={(e) => setCycleOverheadPct(Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
                    className="flex h-8 w-14 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">AI productivity boost</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min={-10} max={10} step={1}
                    value={Math.round(aiEffect * 10)}
                    onChange={(e) => setAiEffect(parseInt(e.target.value) / 10)}
                    className="w-24 h-1.5 accent-current"
                  />
                  <span className={`text-xs font-bold tabular-nums w-12 ${
                    aiEffect > 0 ? "text-green-600" : aiEffect < 0 ? "text-red-600" : "text-muted-foreground"
                  }`}>
                    {aiEffect === 0 ? "None" : aiEffect > 0 ? `+${(aiEffect * 100).toFixed(0)}%` : `${(aiEffect * 100).toFixed(0)}%`}
                  </span>
                </div>
                <p className="text-[0.65rem] text-muted-foreground">
                  How much AI tools help (or hinder) your engineers
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Empty state ── */}
      {squads.length === 0 && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-xl bg-muted/10">
          <h2 className="text-lg font-semibold">Get started in seconds</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            Load sample data to see a working example, or add your own teams and projects below.
          </p>
          <div className="flex gap-3 mt-5">
            <Button onClick={loadSample} size="sm" className="h-9 text-sm px-6">
              Try with sample data
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 1: Teams + Projects ── */}
      <section className="space-y-2">
        {(squads.length > 0 || projects.length > 0) && (
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold">1</div>
            <h2 className="text-sm font-semibold">Your teams and projects</h2>
          </div>
        )}
        <div className={`grid grid-cols-1 gap-6 items-start ${
          squads.length > 0 || projects.length > 0
            ? "lg:grid-cols-[20rem_1fr]"
            : "lg:grid-cols-2"
        }`}>
          <SquadTable />
          <ProjectTable alerts={alerts} />
        </div>
      </section>

      {/* ── Step 2: Results ── */}
      {hasData && displaySchedule && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold">2</div>
            <h2 className="text-sm font-semibold">Your optimized plan</h2>
            <span className="text-xs text-muted-foreground ml-1">
              {displaySchedule.entries.length} project{displaySchedule.entries.length !== 1 ? "s" : ""} scheduled
              {displaySchedule.deferred.length > 0 && (
                <span className="text-red-600 font-medium">
                  {" \u00B7 "}{displaySchedule.deferred.length} won&apos;t fit
                </span>
              )}
            </span>
            {!schedule && <span className="text-xs text-muted-foreground/60 ml-1 animate-pulse">updating...</span>}
          </div>

          {/* Capacity insight (simplified) */}
          {utilPct < 60 && displaySchedule.deferred.length === 0 && (
            <div className="flex items-center gap-3 p-3 border rounded-lg bg-blue-50/50 border-blue-200/60">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-blue-800">
                  Your teams have spare capacity — you could take on more work
                </p>
              </div>
              <Button
                variant="outline" size="sm"
                className="shrink-0 h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                onClick={() => {
                  addProject({
                    id: crypto.randomUUID(),
                    name: `Project ${projects.length + 1}`,
                    duration: 2, feNeeded: 1, beNeeded: 1,
                    businessValue: 5, timeCriticality: 5, riskReduction: 3,
                    squadId: squads[0]?.id || "", dependencies: [],
                  });
                }}
              >
                + Add project
              </Button>
            </div>
          )}

          {/* Recommendations + diff */}
          <RecommendationsPanel
            recommendations={recommendations}
            optimalPlan={optimalPlan}
            diff={diff}
            projectNames={projectNames}
            onApply={applyRecommendation}
            onApplyPlan={(plan) => plan.actions.forEach(applyRecommendation)}
          />

          {/* View tabs */}
          <div className="flex items-center gap-1 border rounded-lg p-1 w-fit">
            {([
              { key: "schedule" as const, label: "Timeline", desc: "See when each project gets delivered" },
              { key: "forecast" as const, label: "Risk analysis", desc: "How likely is your plan to succeed?" },
              { key: "pilot" as const, label: "Pilot simulator", desc: "Test an AI squad on one project before going all-in" },
              { key: "comparison" as const, label: "Team comparison", desc: "What if you changed your entire team setup?" },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveView(tab.key)}
                title={tab.desc}
                className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${
                  activeView === tab.key
                    ? "bg-foreground text-background"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            {activeView === "schedule" && "This timeline shows when each project is planned to start and finish, organized by team."}
            {activeView === "forecast" && "This runs hundreds of \"what if\" scenarios to show the chance your plan delivers on time."}
            {activeView === "pilot" && "Pick one project, set up a small AI team, and see if they can deliver it faster."}
            {activeView === "comparison" && "See how your plan changes if you reorganize all your teams or add AI tools."}
          </p>

          {/* Views */}
          {activeView === "schedule" && <GanttChart />}
          {activeView === "forecast" && (
            <ForecastView deterministicScheduledCount={displaySchedule.entries.length} />
          )}
          {activeView === "pilot" && (
            <PilotSimulator
              projects={projects}
              squads={squads}
              horizonMonths={horizonMonths}
            />
          )}
          {activeView === "comparison" && comparison && (
            <ComparisonDashboard
              comparison={comparison}
              projects={projects}
              horizonMonths={horizonMonths}
              cycleLengthWeeks={cycleLengthWeeks}
              cycleOverheadPct={cycleOverheadPct}
            />
          )}
        </section>
      )}
    </main>
  );
}
