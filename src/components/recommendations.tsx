"use client";

import { Recommendation, ScheduleDiff } from "@/lib/types";

export function RecommendationsPanel({
  recommendations,
  diff,
  projectNames,
}: {
  recommendations: Recommendation[];
  diff: ScheduleDiff | null;
  projectNames: Map<string, string>;
}) {
  if (recommendations.length === 0 && !diff) return null;

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
          <div className="space-y-1.5">
            {recommendations.slice(0, 5).map((r) => (
              <div key={r.id} className="text-xs leading-relaxed">
                <span className="font-medium text-amber-800 dark:text-amber-200">
                  {r.description}
                </span>
                <span className="text-amber-600/80 dark:text-amber-400/80 ml-1.5">
                  &mdash; {r.impact}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
