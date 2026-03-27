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

  const emoji = reliability >= 80 ? "\u2705" : reliability >= 50 ? "\u26A0\uFE0F" : "\u274C";
  const verdict = reliability >= 80 ? "Your plan looks solid"
    : reliability >= 50 ? "Your plan has some risk"
    : "Your plan is quite risky";

  return (
    <div className={`p-3 rounded-lg border ${color}`}>
      <p className="text-sm font-semibold">
        {emoji} {verdict} — {reliability.toFixed(0)}% chance of delivering everything on time
      </p>
      <p className="text-xs mt-0.5 opacity-80">
        Tested across {numRuns} random scenarios with estimation errors, interruptions, and rework.
      </p>
    </div>
  );
}

function DistributionCards({ result }: { result: SimulationResult }) {
  const cards = [
    {
      label: "Projects delivered",
      best: result.scheduledCountP90,
      expected: result.scheduledCountP50,
      worst: result.scheduledCountP10,
      fmt: (n: number) => String(Math.round(n)),
    },
    {
      label: "Total value delivered",
      best: result.totalValueP90,
      expected: result.totalValueP50,
      worst: result.totalValueP10,
      fmt: (n: number) => String(Math.round(n)),
    },
    {
      label: "Everything done by",
      best: result.lastMonthP10,
      expected: result.lastMonthP50,
      worst: result.lastMonthP90,
      fmt: (n: number) => `Month ${Math.round(n)}`,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="border rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
          <div className="flex items-baseline gap-4">
            <div className="text-center">
              <p className="text-[0.65rem] text-green-600 font-medium">Best case</p>
              <p className="text-sm font-semibold tabular-nums">{c.fmt(c.best)}</p>
            </div>
            <div className="text-center">
              <p className="text-[0.65rem] text-foreground font-medium">Most likely</p>
              <p className="text-lg font-bold tabular-nums">{c.fmt(c.expected)}</p>
            </div>
            <div className="text-center">
              <p className="text-[0.65rem] text-red-600 font-medium">Worst case</p>
              <p className="text-sm font-semibold tabular-nums">{c.fmt(c.worst)}</p>
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
        <p className="text-xs font-semibold text-muted-foreground">How likely is each project to finish on time?</p>
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
              <div className="flex gap-3 text-[0.65rem] text-muted-foreground tabular-nums shrink-0">
                <span title="Best case delivery month">Best: M{ps.deliveryP10}</span>
                <span title="Most likely delivery month">Likely: M{ps.deliveryP50}</span>
                <span title="Worst case delivery month">Worst: M{ps.deliveryP90}</span>
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
    { key: "estimationErrorPct" as const, label: "How wrong are estimates?", max: 80, tip: "Real projects rarely take exactly as long as planned" },
    { key: "reworkProbPct" as const, label: "Chance of rework?", max: 50, tip: "How often a project needs to redo some work" },
    { key: "dependencyDelayPct" as const, label: "Chance of delays from blockers?", max: 50, tip: "How often a dependency causes a delay" },
    { key: "interruptionProbPct" as const, label: "Chance of unexpected work?", max: 40, tip: "How often a team gets pulled into unplanned work" },
  ];

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">Uncertainty</p>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-input overflow-hidden">
            {RUN_COUNTS.map((n) => {
              const label = n <= 100 ? "Quick" : n <= 500 ? "Standard" : "Thorough";
              return (
                <button
                  key={n}
                  onClick={() => onNumRunsChange(n)}
                  title={`Run ${n} scenarios`}
                  className={`px-2 py-0.5 text-[0.65rem] font-medium transition-colors ${
                    numRuns === n ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <Button size="sm" onClick={onRun} disabled={running} className="h-7 text-xs">
            {running ? `${progress.toFixed(0)}%...` : "Run analysis"}
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
        <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground">Click &ldquo;Run analysis&rdquo; to stress-test your plan</p>
        </div>
      )}
    </div>
  );
}
