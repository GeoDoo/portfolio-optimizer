"use client";

import { useEffect, useRef, useMemo } from "react";
import { useStore } from "@/lib/store";
import { useSimulation } from "@/lib/use-simulation";
import { SimulationInput } from "@/lib/simulator";
import { SimulationResult, UncertaintyParams } from "@/lib/types";
import { Button } from "@/components/ui/button";

const RUN_COUNTS = [200, 500, 1000] as const;

function ReliabilityBanner({ reliability, numRuns }: { reliability: number; numRuns: number }) {
  const color = reliability >= 80 ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : reliability >= 50 ? "bg-amber-50 border-amber-200 text-amber-800"
    : "bg-red-50 border-red-200 text-red-800";

  return (
    <div className={`p-3 rounded-lg border ${color}`}>
      <p className="text-sm font-semibold">
        {reliability.toFixed(0)}% plan reliability
      </p>
      <p className="text-xs mt-0.5 opacity-80">
        In {reliability.toFixed(0)}% of {numRuns} simulations, all planned projects deliver within the horizon.
      </p>
    </div>
  );
}

function DistributionCards({ result }: { result: SimulationResult }) {
  const cards = [
    { label: "Projects delivered", p10: result.scheduledCountP10, p50: result.scheduledCountP50, p90: result.scheduledCountP90, fmt: (n: number) => String(Math.round(n)) },
    { label: "Total value", p10: result.totalValueP10, p50: result.totalValueP50, p90: result.totalValueP90, fmt: (n: number) => String(Math.round(n)) },
    { label: "Last delivery month", p10: result.lastMonthP10, p50: result.lastMonthP50, p90: result.lastMonthP90, fmt: (n: number) => `M${Math.round(n)}` },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="border rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{c.label}</p>
          <div className="flex items-baseline gap-3">
            <div className="text-center">
              <p className="text-[0.65rem] text-muted-foreground">P10</p>
              <p className="text-sm font-semibold tabular-nums">{c.fmt(c.p10)}</p>
            </div>
            <div className="text-center">
              <p className="text-[0.65rem] text-muted-foreground">P50</p>
              <p className="text-lg font-bold tabular-nums">{c.fmt(c.p50)}</p>
            </div>
            <div className="text-center">
              <p className="text-[0.65rem] text-muted-foreground">P90</p>
              <p className="text-sm font-semibold tabular-nums">{c.fmt(c.p90)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectProbabilityTable({ result, projectNames }: { result: SimulationResult; projectNames: Map<string, string> }) {
  const sorted = [...result.projectStats].sort((a, b) => b.completionPct - a.completionPct);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-muted/30 border-b">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Per-project probability</p>
      </div>
      <div className="divide-y">
        {sorted.map((ps) => {
          const barColor = ps.completionPct >= 80 ? "bg-emerald-500"
            : ps.completionPct >= 60 ? "bg-amber-500"
            : "bg-red-500";
          const textColor = ps.completionPct < 60 ? "text-red-700" : "";

          return (
            <div key={ps.projectId} className={`flex items-center gap-3 px-3 py-1.5 ${textColor}`}>
              <span className="text-xs font-medium truncate w-40 shrink-0">
                {projectNames.get(ps.projectId) ?? ps.projectId}
              </span>
              <div className="flex-1 min-w-0">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${Math.min(100, ps.completionPct)}%` }}
                  />
                </div>
              </div>
              <span className="text-[0.7rem] font-semibold tabular-nums w-10 text-right">
                {ps.completionPct.toFixed(0)}%
              </span>
              <div className="flex gap-2 text-[0.65rem] text-muted-foreground tabular-nums shrink-0">
                <span>P10: M{ps.deliveryP10}</span>
                <span>P50: M{ps.deliveryP50}</span>
                <span>P90: M{ps.deliveryP90}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UncertaintyControls({
  params,
  onChange,
  numRuns,
  onNumRunsChange,
  onRun,
  running,
  progress,
}: {
  params: UncertaintyParams;
  onChange: (p: Partial<UncertaintyParams>) => void;
  numRuns: number;
  onNumRunsChange: (n: number) => void;
  onRun: () => void;
  running: boolean;
  progress: number;
}) {
  const sliders = [
    { key: "estimationErrorPct" as const, label: "Estimation error", max: 80, tip: "How much project durations vary from estimates" },
    { key: "reworkProbPct" as const, label: "Rework probability", max: 50, tip: "Chance a project needs 50% more time due to rework" },
    { key: "dependencyDelayPct" as const, label: "Dependency delay", max: 50, tip: "Chance each dependency adds a 1-month delay" },
    { key: "interruptionProbPct" as const, label: "Squad interruption", max: 40, tip: "Chance a squad loses a month to unplanned work" },
  ];

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Uncertainty parameters</p>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-input overflow-hidden">
            {RUN_COUNTS.map((n) => (
              <button
                key={n}
                onClick={() => onNumRunsChange(n)}
                className={`px-2 py-0.5 text-[0.65rem] font-medium transition-colors ${
                  numRuns === n ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={onRun} disabled={running} className="h-7 text-xs">
            {running ? `${progress.toFixed(0)}%` : "Run simulation"}
          </Button>
        </div>
      </div>

      {running && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-foreground transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {sliders.map((s) => (
          <div key={s.key} className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground" title={s.tip}>{s.label}</label>
              <span className="text-xs font-semibold tabular-nums">{params[s.key]}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={s.max}
              step={5}
              value={params[s.key]}
              onChange={(e) => onChange({ [s.key]: parseInt(e.target.value) })}
              className="w-full h-1.5 accent-current"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ForecastView({
  deterministicScheduledCount,
}: {
  deterministicScheduledCount: number;
}) {
  const { projects, squads, horizonMonths, objective, aiEffect, uncertainty, setUncertainty } = useStore();
  const { running, progress, result, run, cancel } = useSimulation();
  const numRunsRef = useRef(500);

  const projectNames = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current || projects.length === 0 || squads.length === 0) return;
    hasRun.current = true;
    const input: SimulationInput = {
      projects, squads, horizonMonths, objective, aiEffect, uncertainty,
      numRuns: numRunsRef.current,
      deterministicScheduledCount,
    };
    run(input);
  }, [projects, squads, horizonMonths, objective, aiEffect, uncertainty, deterministicScheduledCount, run]);

  const handleRun = () => {
    const input: SimulationInput = {
      projects, squads, horizonMonths, objective, aiEffect, uncertainty,
      numRuns: numRunsRef.current,
      deterministicScheduledCount,
    };
    run(input);
  };

  return (
    <div className="space-y-4">
      <UncertaintyControls
        params={uncertainty}
        onChange={setUncertainty}
        numRuns={numRunsRef.current}
        onNumRunsChange={(n) => { numRunsRef.current = n; }}
        onRun={handleRun}
        running={running}
        progress={progress}
      />

      {result && (
        <>
          <ReliabilityBanner reliability={result.planReliability} numRuns={result.numRuns} />
          <DistributionCards result={result} />
          <ProjectProbabilityTable result={result} projectNames={projectNames} />
        </>
      )}

      {!result && !running && (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg">
          <p className="text-sm font-medium">Ready to simulate</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Click &quot;Run simulation&quot; above to run {numRunsRef.current} Monte Carlo scenarios. Each scenario adds random estimation errors, rework, and interruptions to stress-test your plan.
          </p>
          <button
            onClick={handleRun}
            className="mt-4 px-5 py-2 text-xs font-semibold rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            Run simulation now
          </button>
        </div>
      )}
    </div>
  );
}
