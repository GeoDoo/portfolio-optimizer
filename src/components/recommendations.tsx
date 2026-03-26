"use client";

import { useState } from "react";
import { Recommendation, RecommendationAction, ScheduleDiff } from "@/lib/types";

export function RecommendationsPanel({
  recommendations,
  diff,
  projectNames,
  onApply,
}: {
  recommendations: Recommendation[];
  diff: ScheduleDiff | null;
  projectNames: Map<string, string>;
  onApply?: (action: RecommendationAction) => void;
}) {
  const [applied, setApplied] = useState<Set<string>>(new Set());

  if (recommendations.length === 0 && !diff) return null;

  function handleApply(rec: Recommendation) {
    if (!rec.action || !onApply) return;
    onApply(rec.action);
    setApplied((prev) => new Set(prev).add(rec.id));
  }

  return (
    <div className="space-y-3">
      {diff && (
        <div className="p-3 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-800/40 text-sm space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-2">
            Schedule changes
          </h3>
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
              moved month {m.fromStart + 1} &rarr; {m.toStart + 1}
            </div>
          ))}
          {diff.newlyDeferred.map((id) => (
            <div key={id} className="text-xs text-red-600 dark:text-red-400">
              <span className="font-mono">&minus;</span>{" "}
              <span className="font-medium">{projectNames.get(id)}</span> deferred
            </div>
          ))}
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="p-3 border rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/40">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-2">
            Recommendations
          </h3>
          <div className="space-y-2">
            {recommendations.slice(0, 5).map((r) => {
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
                  {r.action && onApply && (
                    <button
                      onClick={() => handleApply(r)}
                      disabled={wasApplied}
                      className={`shrink-0 text-[0.65rem] font-semibold px-2.5 py-1 rounded-md transition-all ${
                        wasApplied
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 cursor-default"
                          : "bg-amber-200/60 text-amber-900 hover:bg-amber-300/80 dark:bg-amber-800/40 dark:text-amber-200 dark:hover:bg-amber-700/50 cursor-pointer"
                      }`}
                    >
                      {wasApplied ? "Applied" : "Apply"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
