"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { ScheduleEntry, ZoomLevel, Project } from "@/lib/types";
import { effectiveFe, effectiveBe, getWsjf } from "@/lib/optimizer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500",
  "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-teal-500",
  "bg-pink-500", "bg-indigo-500",
];

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const LANE_H = 44;

function monthLabel(startMonth: number, startYear: number, offset: number) {
  const m = (startMonth + offset) % 12;
  const y = startYear + Math.floor((startMonth + offset) / 12);
  return `${MONTH_LABELS[m]} '${String(y).slice(2)}`;
}

function weeksInMonth(month: number, year: number): number {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  return Math.ceil((last.getDate() + first.getDay()) / 7);
}

function utilColor(u: number): string {
  if (u >= 80) return "text-emerald-700";
  if (u >= 50) return "text-amber-700";
  return "text-red-600";
}

function utilBg(u: number): string {
  if (u >= 80) return "bg-emerald-500";
  if (u >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function computeLanes(
  entries: ScheduleEntry[],
  projectMap: Map<string, Project>,
): ScheduleEntry[][] {
  const lanes: ScheduleEntry[][] = [];
  const sorted = [...entries].sort((a, b) => {
    const timeDiff = a.startMonth - b.startMonth;
    if (timeDiff !== 0) return timeDiff;
    const pa = projectMap.get(a.projectId);
    const pb = projectMap.get(b.projectId);
    return (pb ? getWsjf(pb) : 0) - (pa ? getWsjf(pa) : 0);
  });
  for (const entry of sorted) {
    let placed = false;
    for (const lane of lanes) {
      if (!lane.some((e) => e.startMonth < entry.endMonth && entry.startMonth < e.endMonth)) {
        lane.push(entry);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([entry]);
  }
  return lanes;
}

type BarPos = {
  xStart: number;
  xEnd: number;
  yCenter: number;
  yTop: number;
  yBottom: number;
};

export function GanttChart() {
  const {
    schedule, prevSchedule, squads, projects,
    horizonMonths, horizonStartMonth, horizonStartYear,
  } = useStore();
  const hasData = squads.length > 0 && projects.length > 0;
  const displaySchedule = schedule ?? (hasData ? prevSchedule : null);
  const isReoptimizing = schedule === null && displaySchedule !== null;

  const [zoom, setZoom] = useState<ZoomLevel>("year");
  const [focusMonth, setFocusMonth] = useState(0);
  const [focusWeek, setFocusWeek] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [barPositions, setBarPositions] = useState(() => new Map<string, BarPos>());
  const gridBodyRef = useRef<HTMLDivElement>(null);

  const scheduleEntries = displaySchedule?.entries ?? [];
  const scheduleDeferred = displaySchedule?.deferred ?? [];

  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    projects.forEach((p, i) => m.set(p.id, BAR_COLORS[i % BAR_COLORS.length]));
    return m;
  }, [projects]);

  const rankMap = useMemo(() => {
    const sorted = [...projects].sort((a, b) => getWsjf(b) - getWsjf(a));
    return new Map(sorted.map((p, i) => [p.id, i + 1]));
  }, [projects]);

  const dependentsMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of projects) {
      for (const depId of p.dependencies) {
        if (!m.has(depId)) m.set(depId, []);
        m.get(depId)!.push(p.id);
      }
    }
    return m;
  }, [projects]);

  const sortedSquads = useMemo(() => {
    if (!scheduleEntries.length) return [...squads];
    const pm = new Map(projects.map((p) => [p.id, p]));
    return [...squads].sort((a, b) => {
      const aMax = Math.max(0, ...scheduleEntries.filter((e) => e.squadId === a.id).map((e) => { const p = pm.get(e.projectId); return p ? getWsjf(p) : 0; }));
      const bMax = Math.max(0, ...scheduleEntries.filter((e) => e.squadId === b.id).map((e) => { const p = pm.get(e.projectId); return p ? getWsjf(p) : 0; }));
      return bMax - aMax;
    });
  }, [squads, scheduleEntries, projects]);

  const actualMonth = (horizonStartMonth + focusMonth) % 12;
  const actualYear = horizonStartYear + Math.floor((horizonStartMonth + focusMonth) / 12);

  const { columns, colCount } = useMemo(() => {
    if (zoom === "year") {
      return {
        columns: Array.from({ length: horizonMonths }, (_, i) =>
          monthLabel(horizonStartMonth, horizonStartYear, i),
        ),
        colCount: horizonMonths,
      };
    }
    if (zoom === "month") {
      const m = (horizonStartMonth + focusMonth) % 12;
      const y = horizonStartYear + Math.floor((horizonStartMonth + focusMonth) / 12);
      const wc = weeksInMonth(m, y);
      return { columns: Array.from({ length: wc }, (_, i) => `W${i + 1}`), colCount: wc };
    }
    return { columns: ["Mon", "Tue", "Wed", "Thu", "Fri"], colCount: 5 };
  }, [zoom, horizonMonths, horizonStartMonth, horizonStartYear, focusMonth]);

  const isActiveInPeriod = useCallback((entry: ScheduleEntry): boolean => {
    if (zoom === "year") return true;
    return entry.startMonth <= focusMonth && entry.endMonth > focusMonth;
  }, [zoom, focusMonth]);

  const barStyleFn = useCallback((entry: ScheduleEntry): React.CSSProperties => {
    if (zoom === "year") {
      return {
        left: `${(entry.startMonth / colCount) * 100}%`,
        width: `${((entry.endMonth - entry.startMonth) / colCount) * 100}%`,
      };
    }
    return { left: "0%", width: "100%" };
  }, [zoom, colCount]);

  const computeSquadUtil = useCallback((squadId: string) => {
    const squad = squads.find((s) => s.id === squadId)!;
    const totalCap = (effectiveFe(squad) + effectiveBe(squad)) * horizonMonths;
    const se = scheduleEntries.filter((e) => e.squadId === squadId);
    let used = 0;
    for (const e of se) {
      const p = projectMap.get(e.projectId);
      if (p) used += (p.feNeeded + p.beNeeded) * p.duration;
    }
    return totalCap > 0 ? (used / totalCap) * 100 : 0;
  }, [squads, scheduleEntries, horizonMonths, projectMap]);

  const squadRowData = useMemo(() => {
    return sortedSquads.map((squad) => {
      const sqEntries = scheduleEntries.filter(
        (e) => e.squadId === squad.id && isActiveInPeriod(e),
      );
      const lanes = computeLanes(sqEntries, projectMap);
      const height = Math.max(1, lanes.length) * LANE_H;
      const util = computeSquadUtil(squad.id);
      return { squad, entries: sqEntries, lanes, height, util };
    });
  }, [sortedSquads, scheduleEntries, isActiveInPeriod, projectMap, computeSquadUtil]);

  const measureBarPositions = useCallback(() => {
    const container = gridBodyRef.current;
    if (!container || zoom !== "year") return;

    const containerRect = container.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const sidebarW = 10 * rem;

    const positions = new Map<string, BarPos>();
    container.querySelectorAll<HTMLElement>("[data-gantt-bar]").forEach((el) => {
      const id = el.dataset.ganttBar!;
      const r = el.getBoundingClientRect();
      positions.set(id, {
        xStart: r.left - containerRect.left - sidebarW,
        xEnd: r.right - containerRect.left - sidebarW,
        yCenter: r.top - containerRect.top + r.height / 2,
        yTop: r.top - containerRect.top,
        yBottom: r.bottom - containerRect.top,
      });
    });
    setBarPositions(positions);
  }, [zoom]);

  const handleBarEnter = useCallback((projectId: string) => {
    measureBarPositions();
    setHoveredId(projectId);
  }, [measureBarPositions]);

  const arrows = useMemo(() => {
    if (!hoveredId || zoom !== "year") return [];
    const proj = projectMap.get(hoveredId);
    if (!proj) return [];
    const hoveredPos = barPositions.get(hoveredId);
    if (!hoveredPos) return [];

    const result: { id: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const depId of proj.dependencies) {
      const depPos = barPositions.get(depId);
      if (!depPos) continue;
      result.push({ id: `from-${depId}`, x1: depPos.xEnd, y1: depPos.yCenter, x2: hoveredPos.xStart, y2: hoveredPos.yCenter });
    }
    for (const childId of dependentsMap.get(hoveredId) ?? []) {
      const childPos = barPositions.get(childId);
      if (!childPos) continue;
      result.push({ id: `to-${childId}`, x1: hoveredPos.xEnd, y1: hoveredPos.yCenter, x2: childPos.xStart, y2: childPos.yCenter });
    }
    return result;
  }, [hoveredId, barPositions, zoom, projectMap, dependentsMap]);

  const tooltip = useMemo(() => {
    if (!hoveredId) return null;
    const proj = projectMap.get(hoveredId);
    if (!proj) return null;
    const pos = barPositions.get(hoveredId);
    if (!pos) return null;
    const rank = rankMap.get(hoveredId) ?? 0;
    const w = getWsjf(proj);
    const blockedBy = proj.dependencies
      .map((id) => projectMap.get(id)?.name)
      .filter(Boolean) as string[];
    const unblocks = (dependentsMap.get(hoveredId) ?? [])
      .map((id) => projectMap.get(id)?.name)
      .filter(Boolean) as string[];
    return { proj, pos, rank, w, blockedBy, unblocks };
  }, [hoveredId, barPositions, projectMap, rankMap, dependentsMap]);

  if (!displaySchedule) return null;

  return (
    <div className={`space-y-3 transition-opacity duration-150 ${isReoptimizing ? "opacity-50 pointer-events-none" : ""}`}>
      {/* Header */}
      {zoom !== "year" && (
        <div className="flex items-center gap-2 text-sm">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setZoom(zoom === "week" ? "month" : "year")}>
            &larr; Back
          </Button>
          <span className="text-xs font-medium">
            {MONTH_LABELS[actualMonth]} {actualYear}
            {zoom === "week" && ` \u2014 W${focusWeek + 1}`}
          </span>
          {zoom === "month" && (
            <div className="flex gap-1 ml-1">
              <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs"
                disabled={focusMonth === 0} onClick={() => setFocusMonth((m) => m - 1)}>&lsaquo;</Button>
              <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs"
                disabled={focusMonth >= horizonMonths - 1} onClick={() => setFocusMonth((m) => m + 1)}>&rsaquo;</Button>
            </div>
          )}
          {zoom === "week" && (
            <div className="flex gap-1 ml-1">
              <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs"
                disabled={focusWeek === 0} onClick={() => setFocusWeek((w) => w - 1)}>&lsaquo;</Button>
              <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs"
                disabled={focusWeek >= colCount - 1} onClick={() => setFocusWeek((w) => w + 1)}>&rsaquo;</Button>
            </div>
          )}
        </div>
      )}

      {/* Gantt grid */}
      <div className="border rounded-lg overflow-hidden">
        {/* Column headers */}
        <div className="flex bg-muted/40">
          <div className="w-40 shrink-0 px-3 py-2 text-xs font-semibold text-muted-foreground border-r">
            Team
          </div>
          <div
            className="flex-1 grid"
            style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
          >
            {columns.map((label, i) => (
              <div
                key={i}
                className={`px-1 py-2 text-center text-xs font-medium text-muted-foreground border-l transition-colors ${
                  zoom !== "week" ? "cursor-pointer hover:bg-accent/50" : ""
                }`}
                onClick={() => {
                  if (zoom === "year") { setFocusMonth(i); setFocusWeek(0); setZoom("month"); }
                  else if (zoom === "month") { setFocusWeek(i); setZoom("week"); }
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Squad rows */}
        <div className="relative" ref={gridBodyRef} onMouseLeave={() => setHoveredId(null)}>
          {squadRowData.map((row) => (
            <div key={row.squad.id} className="flex border-t">
              {/* Squad sidebar */}
              <div className="w-40 shrink-0 px-3 py-2 border-r flex flex-col justify-center gap-0.5">
                <span className="text-xs font-semibold truncate">{row.squad.name}</span>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${utilBg(row.util)}`}
                      style={{ width: `${Math.min(row.util, 100)}%` }}
                    />
                  </div>
                  <span className={`text-[0.6rem] font-bold tabular-nums ${utilColor(row.util)}`}>
                    {Math.round(row.util)}%
                  </span>
                </div>
              </div>

              {/* Timeline */}
              <div className="flex-1 relative" style={{ minHeight: row.height }}>
                <div
                  className="absolute inset-0 grid pointer-events-none"
                  style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
                >
                  {columns.map((_, i) => (
                    <div key={i} className="border-l h-full" />
                  ))}
                </div>

                {row.lanes.map((lane, li) =>
                  lane.map((entry) => {
                    const proj = projectMap.get(entry.projectId);
                    if (!proj) return null;
                    const style = barStyleFn(entry);
                    const reassigned = entry.squadId !== proj.squadId;
                    const missedDeadline = proj.deadline !== undefined && entry.endMonth > proj.deadline;
                    const rank = rankMap.get(entry.projectId) ?? 0;
                    const isHovered = hoveredId === entry.projectId;
                    const isRelated = hoveredId !== null && (
                      proj.dependencies.includes(hoveredId) ||
                      (dependentsMap.get(hoveredId) ?? []).includes(entry.projectId) ||
                      (projectMap.get(hoveredId)?.dependencies ?? []).includes(entry.projectId) ||
                      (dependentsMap.get(entry.projectId) ?? []).includes(hoveredId)
                    );
                    const dimmed = hoveredId !== null && !isHovered && !isRelated;

                    return (
                      <div
                        key={entry.projectId}
                        data-gantt-bar={entry.projectId}
                        className={`absolute rounded-md px-2 text-xs text-white font-medium flex items-center gap-1.5 shadow-sm transition-opacity ${colorMap.get(entry.projectId)} ${
                          reassigned ? "ring-2 ring-amber-400/80 ring-offset-1" : ""
                        } ${missedDeadline ? "ring-2 ring-red-400/80 ring-offset-1" : ""} ${
                          dimmed ? "opacity-30" : ""
                        } ${isHovered ? "ring-2 ring-white/60 ring-offset-1" : ""}`}
                        style={{ ...style, top: li * LANE_H + 4, height: LANE_H - 8, zIndex: isHovered ? 5 : 1 }}
                        onMouseEnter={() => handleBarEnter(entry.projectId)}
                      >
                        <span className="shrink-0 text-[0.6rem] font-bold bg-white/20 rounded px-1 py-0.5 leading-none">
                          {rank}
                        </span>
                        <span className="truncate leading-tight">{proj.name}</span>
                        {reassigned && <span className="shrink-0 opacity-70 text-[0.65rem]">{"\u2197"}</span>}
                        {missedDeadline && <span className="shrink-0 text-red-200 text-[0.65rem] font-bold">!</span>}
                      </div>
                    );
                  }),
                )}

                {row.entries.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/40">
                    No projects
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Dependency arrows + tooltip overlay */}
          {zoom === "year" && (arrows.length > 0 || tooltip) && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: "10rem", right: 0 }}
            >
              {arrows.map((a) => {
                const dx = a.x2 - a.x1;
                const dy = a.y2 - a.y1;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                return (
                  <div key={a.id}>
                    <div
                      className="absolute origin-left pointer-events-none"
                      style={{
                        left: a.x1, top: a.y1,
                        width: length, height: 0,
                        borderTop: "2px dashed rgba(0,0,0,0.35)",
                        transform: `rotate(${angle}deg)`,
                      }}
                    />
                    <div
                      className="absolute rounded-full pointer-events-none"
                      style={{ left: a.x2 - 4, top: a.y2 - 4, width: 8, height: 8, backgroundColor: "rgba(0,0,0,0.4)" }}
                    />
                  </div>
                );
              })}

              {tooltip && (
                <div
                  className="absolute z-20"
                  style={{
                    left: (tooltip.pos.xStart + tooltip.pos.xEnd) / 2,
                    top: tooltip.pos.yBottom + 6,
                    transform: "translateX(-50%)",
                  }}
                >
                  <div className="bg-popover text-popover-foreground shadow-lg border rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-nowrap">
                    <div className="font-semibold">
                      #{tooltip.rank} &middot; {tooltip.proj.feNeeded}FE + {tooltip.proj.beNeeded}BE &times; {tooltip.proj.duration}mo
                    </div>
                    {tooltip.blockedBy.length > 0 && (
                      <div className="text-muted-foreground">Blocked by: {tooltip.blockedBy.join(", ")}</div>
                    )}
                    {tooltip.unblocks.length > 0 && (
                      <div className="text-muted-foreground">Unblocks: {tooltip.unblocks.join(", ")}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Deferred */}
      {scheduleDeferred.length > 0 && (
        <div className="p-3 border border-destructive/20 rounded-lg bg-destructive/5">
          <h3 className="text-xs font-semibold text-destructive mb-2">
            Won&apos;t fit &mdash; {scheduleDeferred.length} project{scheduleDeferred.length > 1 ? "s" : ""}
          </h3>
          <div className="space-y-1.5">
            {scheduleDeferred.map((d) => {
              const p = projectMap.get(d.projectId);
              if (!p) return null;
              return (
                <div key={d.projectId} className="flex items-start gap-2">
                  <Badge variant="destructive" className="shrink-0 text-xs">{p.name}</Badge>
                  <span className="text-[0.65rem] text-muted-foreground leading-relaxed">{d.reason}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
