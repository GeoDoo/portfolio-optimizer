"use client";

import { useState, useEffect, useRef } from "react";
import { Recommendation, RecommendationAction, OptimalPlan, ScheduleDiff } from "@/lib/types";

export function RecommendationsPanel({
  recommendations,
  optimalPlan,
  diff,
  projectNames,
  onApply,
  onApplyPlan,
}: {
  recommendations: Recommendation[];
  optimalPlan?: OptimalPlan | null;
  diff: ScheduleDiff | null;
  projectNames: Map<string, string>;
  onApply?: (action: RecommendationAction) => void;
  onApplyPlan?: (plan: OptimalPlan) => void;
}) {
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [planApplied, setPlanApplied] = useState(false);
  const [showIndividual, setShowIndividual] = useState(false);
  const [showDiffDetails, setShowDiffDetails] = useState(false);
  const prevIdsRef = useRef<string>("");

  const currentIds = recommendations.map((r) => r.id).join(",");
  useEffect(() => {
    if (prevIdsRef.current && currentIds !== prevIdsRef.current) {
      setDismissed(new Set());
      setApplied(new Set());
      setPlanApplied(false);
      setShowIndividual(false);
    }
    prevIdsRef.current = currentIds;
  }, [currentIds]);

  const visible = recommendations.filter((r) => !dismissed.has(r.id));
  const hasContent = visible.length > 0 || optimalPlan || diff;

  if (!hasContent) return null;

  function handleApply(rec: Recommendation) {
    if (!rec.action || !onApply) return;
    onApply(rec.action);
    setApplied((prev) => new Set(prev).add(rec.id));
  }

  function handleDismiss(rec: Recommendation) {
    setDismissed((prev) => new Set(prev).add(rec.id));
  }

  function handleApplyPlan() {
    if (!optimalPlan || !onApplyPlan) return;
    onApplyPlan(optimalPlan);
    setPlanApplied(true);
  }

  return (
    <div className="space-y-3">
      {diff && (() => {
        const totalChanges = diff.newlyScheduled.length + diff.moved.length + diff.newlyDeferred.length;
        return (
        <div className="p-3 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-800/40 text-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
              {totalChanges} schedule change{totalChanges !== 1 ? "s" : ""}
              {diff.newlyScheduled.length > 0 && <span className="text-emerald-600 ml-2">+{diff.newlyScheduled.length} new</span>}
              {diff.newlyDeferred.length > 0 && <span className="text-red-500 ml-2">{diff.newlyDeferred.length} deferred</span>}
              {diff.moved.length > 0 && <span className="text-blue-500 ml-2">{diff.moved.length} moved</span>}
            </h3>
            <button
              onClick={() => setShowDiffDetails((p) => !p)}
              className="text-[0.65rem] font-medium text-blue-600/80 hover:text-blue-700 transition-colors"
            >
              {showDiffDetails ? "Hide details" : "Show details"}
            </button>
          </div>
          {showDiffDetails && (
            <div className="mt-2 space-y-1">
              {diff.newlyScheduled.map((id) => (
                <div key={id} className="text-xs text-blue-700 dark:text-blue-300">
                  <span className="font-mono text-emerald-600">+</span>{" "}
                  <span className="font-medium">{projectNames.get(id)}</span> now scheduled
                </div>
              ))}
              {diff.moved.map((m) => (
                <div key={m.projectId} className="text-xs text-blue-700 dark:text-blue-300">
                  <span className="font-mono text-blue-500">~</span>{" "}
                  <span className="font-medium">{projectNames.get(m.projectId)}</span>{" "}
                  moved month {m.fromStart + 1} {"\u2192"} {m.toStart + 1}
                </div>
              ))}
              {diff.newlyDeferred.map((id) => (
                <div key={id} className="text-xs text-red-600 dark:text-red-400">
                  <span className="font-mono">{"\u2212"}</span>{" "}
                  <span className="font-medium">{projectNames.get(id)}</span> deferred
                </div>
              ))}
            </div>
          )}
        </div>
        );
      })()}

      {/* Optimal plan -- the primary CTA */}
      {optimalPlan && optimalPlan.actions.length > 0 && (
        <div className="p-4 border-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300/70 dark:border-emerald-700/50">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 mb-1.5">
                Recommended plan
              </h3>
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                {optimalPlan.actions.length === 1 ? "1 change" : `${optimalPlan.actions.length} changes`}
                {" "}to schedule{" "}
                <span className="font-bold">{optimalPlan.scheduledCount} projects</span>
                {optimalPlan.deferredCount === 0
                  ? " with nothing deferred"
                  : ` (${optimalPlan.deferredCount} still deferred)`}
              </p>
              <ul className="mt-2 space-y-0.5">
                {optimalPlan.descriptions.map((desc, i) => (
                  <li key={i} className="text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-1.5">
                    <span className="text-emerald-500 mt-0.5 shrink-0">&#10003;</span>
                    {desc}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={handleApplyPlan}
              disabled={planApplied}
              className={`shrink-0 text-xs font-semibold px-4 py-2 rounded-lg transition-all ${
                planApplied
                  ? "bg-emerald-200 text-emerald-700 dark:bg-emerald-800/40 dark:text-emerald-400 cursor-default"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer shadow-sm"
              }`}
            >
              {planApplied ? "Applied" : "Apply all"}
            </button>
          </div>
        </div>
      )}

      {/* Individual recommendations -- collapsed behind a toggle when plan exists */}
      {visible.length > 0 && (
        <div className="p-3 border rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/40">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              {optimalPlan ? "Individual alternatives" : "Recommendations"}
            </h3>
            <div className="flex items-center gap-2">
              {dismissed.size > 0 && (
                <button
                  onClick={() => setDismissed(new Set())}
                  className="text-[0.6rem] text-amber-600/60 hover:text-amber-700 transition-colors"
                >
                  Show dismissed ({dismissed.size})
                </button>
              )}
              {optimalPlan && (
                <button
                  onClick={() => setShowIndividual((p) => !p)}
                  className="text-[0.6rem] font-medium text-amber-600/80 hover:text-amber-700 transition-colors"
                >
                  {showIndividual ? "Hide" : `Show ${visible.length}`}
                </button>
              )}
            </div>
          </div>
          {(!optimalPlan || showIndividual) && (
            <div className="space-y-2">
              {visible.slice(0, 5).map((r) => {
                const wasApplied = applied.has(r.id);
                return (
                  <div key={r.id} className="flex items-start gap-2">
                    <div className="flex-1 text-xs leading-relaxed min-w-0">
                      <span className="font-medium text-amber-800 dark:text-amber-200">
                        {r.description}
                      </span>
                      <span className="text-amber-600/80 dark:text-amber-400/80 ml-1.5">
                        &mdash; {r.impact}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.action && onApply && !wasApplied && (
                        <button
                          onClick={() => handleDismiss(r)}
                          className="text-[0.65rem] font-medium px-2 py-1 rounded-md text-amber-600/50 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                          title="Dismiss this recommendation"
                        >
                          Dismiss
                        </button>
                      )}
                      {r.action && onApply && (
                        <button
                          onClick={() => handleApply(r)}
                          disabled={wasApplied}
                          className={`text-[0.65rem] font-semibold px-2.5 py-1 rounded-md transition-all ${
                            wasApplied
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 cursor-default"
                              : "bg-amber-200/60 text-amber-900 hover:bg-amber-300/80 dark:bg-amber-800/40 dark:text-amber-200 dark:hover:bg-amber-700/50 cursor-pointer"
                          }`}
                        >
                          {wasApplied ? "Applied" : "Apply"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
