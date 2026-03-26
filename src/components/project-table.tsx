"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { getWsjf } from "@/lib/optimizer";
import { Alert } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ALERT_DOT: Record<string, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
};

export function ProjectTable({ alerts }: { alerts?: Alert[] }) {
  const { projects, squads, horizonMonths, addProject, updateProject, removeProject } =
    useStore();

  const safeAlerts = alerts ?? [];
  const alertMap = new Map(safeAlerts.map((a) => [a.projectId, a]));

  const sorted = useMemo(
    () =>
      [...projects]
        .map((p) => ({ ...p, _wsjf: getWsjf(p) }))
        .sort((a, b) => b._wsjf - a._wsjf),
    [projects],
  );

  const handleAdd = () => {
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
  };

  function wsjfStyle(val: number): string {
    if (val >= 3) return "text-emerald-700 bg-emerald-50";
    if (val >= 1.5) return "text-amber-700 bg-amber-50";
    return "text-orange-700 bg-orange-50";
  }

  const selectClass =
    "h-6 w-full rounded border border-input bg-background px-1.5 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-ring";
  const inputClass =
    "h-6 text-center text-xs rounded border border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring transition-colors tabular-nums";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Projects
        </h2>
        <Button size="sm" variant="outline" onClick={handleAdd} className="h-7 text-xs">
          + Add project
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground">No projects yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Add a project or load sample data to get started
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="w-7 px-1 py-2.5 text-center text-xs font-semibold text-muted-foreground">#</th>
                  <th className="w-6 px-1 py-2.5" />
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Name</th>
                  <th className="text-center px-1 py-2.5 text-xs font-semibold text-muted-foreground w-14" title="Weighted Shortest Job First — higher = higher priority">WSJF</th>
                  <th className="text-center px-1 py-2.5 text-xs font-semibold text-muted-foreground w-12">Mo</th>
                  <th className="text-center px-1 py-2.5 text-xs font-semibold text-muted-foreground w-10">FE</th>
                  <th className="text-center px-1 py-2.5 text-xs font-semibold text-muted-foreground w-10">BE</th>
                  <th className="text-center px-1 py-2.5 text-xs font-semibold text-muted-foreground w-10" title="Business Value (1–10)">BV</th>
                  <th className="text-center px-1 py-2.5 text-xs font-semibold text-muted-foreground w-10" title="Time Criticality (1–10)">TC</th>
                  <th className="text-center px-1 py-2.5 text-xs font-semibold text-muted-foreground w-10" title="Risk Reduction (1–10)">RR</th>
                  <th className="text-center px-1 py-2.5 text-xs font-semibold text-muted-foreground w-12" title="Soft deadline (month #)">DL</th>
                  <th className="text-left px-2 py-2.5 text-xs font-semibold text-muted-foreground w-24">Squad</th>
                  <th className="text-left px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[120px]">Dependencies</th>
                  <th className="w-7 px-1 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, rank) => {
                  const alert = alertMap.get(p.id);
                  return (
                    <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors group">
                      {/* Rank */}
                      <td className="px-1 py-1.5 text-center text-xs text-muted-foreground/60 tabular-nums">
                        {rank + 1}
                      </td>

                      {/* Alert dot */}
                      <td className="px-1 py-1.5 text-center">
                        {alert && (
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${ALERT_DOT[alert.level]} mx-auto`}
                            title={alert.message}
                          />
                        )}
                      </td>

                      {/* Name */}
                      <td className="px-3 py-1.5">
                        <Input
                          value={p.name}
                          onChange={(e) => updateProject(p.id, { name: e.target.value })}
                          className="h-6 text-xs min-w-[120px] border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background transition-colors px-1.5"
                        />
                      </td>

                      {/* WSJF — right after name for visibility */}
                      <td className="px-1 py-1.5 text-center">
                        <span className={`inline-block font-mono text-xs font-bold px-1.5 py-0.5 rounded ${wsjfStyle(p._wsjf)}`}>
                          {p._wsjf.toFixed(1)}
                        </span>
                      </td>

                      {/* Duration */}
                      <td className="px-1 py-1.5">
                        <input
                          type="number" min={1} max={24} value={p.duration}
                          onChange={(e) => updateProject(p.id, { duration: parseInt(e.target.value) || 1 })}
                          className={`${inputClass} w-10 mx-auto block`}
                        />
                      </td>

                      {/* FE */}
                      <td className="px-1 py-1.5">
                        <input
                          type="number" min={0} value={p.feNeeded}
                          onChange={(e) => updateProject(p.id, { feNeeded: parseInt(e.target.value) || 0 })}
                          className={`${inputClass} w-9 mx-auto block`}
                        />
                      </td>

                      {/* BE */}
                      <td className="px-1 py-1.5">
                        <input
                          type="number" min={0} value={p.beNeeded}
                          onChange={(e) => updateProject(p.id, { beNeeded: parseInt(e.target.value) || 0 })}
                          className={`${inputClass} w-9 mx-auto block`}
                        />
                      </td>

                      {/* BV */}
                      <td className="px-1 py-1.5">
                        <input
                          type="number" min={1} max={10} value={p.businessValue}
                          onChange={(e) => updateProject(p.id, { businessValue: parseInt(e.target.value) || 1 })}
                          className={`${inputClass} w-9 mx-auto block`}
                        />
                      </td>

                      {/* TC */}
                      <td className="px-1 py-1.5">
                        <input
                          type="number" min={1} max={10} value={p.timeCriticality}
                          onChange={(e) => updateProject(p.id, { timeCriticality: parseInt(e.target.value) || 1 })}
                          className={`${inputClass} w-9 mx-auto block`}
                        />
                      </td>

                      {/* RR */}
                      <td className="px-1 py-1.5">
                        <input
                          type="number" min={1} max={10} value={p.riskReduction}
                          onChange={(e) => updateProject(p.id, { riskReduction: parseInt(e.target.value) || 1 })}
                          className={`${inputClass} w-9 mx-auto block`}
                        />
                      </td>

                      {/* Deadline */}
                      <td className="px-1 py-1.5">
                        <input
                          type="number" min={1} max={horizonMonths}
                          value={p.deadline !== undefined ? p.deadline : ""}
                          placeholder="--"
                          onChange={(e) => {
                            const raw = e.target.value;
                            updateProject(p.id, {
                              deadline: raw === "" ? undefined : (parseInt(raw) || undefined),
                            });
                          }}
                          className={`${inputClass} w-10 mx-auto block`}
                        />
                      </td>

                      {/* Squad */}
                      <td className="px-2 py-1.5">
                        <select
                          value={p.squadId}
                          onChange={(e) => updateProject(p.id, { squadId: e.target.value })}
                          className={selectClass}
                        >
                          {squads.length === 0 && <option value="">No squads</option>}
                          {squads.map((sq) => (
                            <option key={sq.id} value={sq.id}>{sq.name}</option>
                          ))}
                        </select>
                      </td>

                      {/* Dependencies */}
                      <td className="px-2 py-1.5">
                        <div className="flex flex-wrap gap-1 items-center">
                          {p.dependencies.map((depId) => {
                            const dep = projects.find((pr) => pr.id === depId);
                            if (!dep) return null;
                            return (
                              <span
                                key={depId}
                                className="inline-flex items-center gap-0.5 text-xs bg-muted rounded px-1.5 py-0.5 cursor-pointer hover:bg-destructive/10 hover:line-through transition-colors"
                                onClick={() => updateProject(p.id, { dependencies: p.dependencies.filter((d) => d !== depId) })}
                                title={`Click to remove dependency on ${dep.name}`}
                              >
                                {dep.name}
                              </span>
                            );
                          })}
                          {projects.filter((o) => o.id !== p.id && !p.dependencies.includes(o.id)).length > 0 && (
                            <select
                              value=""
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v && !p.dependencies.includes(v)) {
                                  updateProject(p.id, { dependencies: [...p.dependencies, v] });
                                }
                              }}
                              className="h-6 w-12 rounded border border-dashed border-input bg-transparent text-xs text-muted-foreground opacity-60 hover:opacity-100 transition-opacity cursor-pointer focus:outline-none"
                            >
                              <option value="">+</option>
                              {projects
                                .filter((o) => o.id !== p.id && !p.dependencies.includes(o.id))
                                .map((o) => (
                                  <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                            </select>
                          )}
                        </div>
                      </td>

                      {/* Remove */}
                      <td className="px-1 py-1.5 text-center">
                        <button
                          onClick={() => removeProject(p.id)}
                          className="text-muted-foreground/30 hover:text-destructive transition-colors text-sm opacity-0 group-hover:opacity-100"
                          title="Remove project"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
