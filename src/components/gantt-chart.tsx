"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { ScheduleEntry, ZoomLevel, Project } from "@/lib/types";
import { effectiveFe, effectiveBe, getWsjf } from "@/lib/optimizer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-pink-500",
  "bg-indigo-500",
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

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
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
  const [measuredGridHeight, setMeasuredGridHeight] = useState(0);
  const gridBodyRef = useRef<HTMLDivElement>(null);

  const scheduleEntries = displaySchedule?.entries ?? [];
  const scheduleDeferred = displaySchedule?.deferred ?? [];

  // --- All hooks must be above the early return ---

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

  const computeSquadStats = useCallback((squadId: string) => {
    const squad = squads.find((s) => s.id === squadId)!;
    const eFe = effectiveFe(squad);
    const eBe = effectiveBe(squad);
    const totalCap = (eFe + eBe) * horizonMonths;
    const se = scheduleEntries.filter((e) => e.squadId === squadId);

    let feUsed = 0, beUsed = 0, lastEnd = 0;
    for (const e of se) {
      const p = projectMap.get(e.projectId);
      if (!p) continue;
      feUsed += p.feNeeded * p.duration;
      beUsed += p.beNeeded * p.duration;
      lastEnd = Math.max(lastEnd, e.endMonth);
    }

    const totalUsed = feUsed + beUsed;
    return {
      utilization: totalCap > 0 ? (totalUsed / totalCap) * 100 : 0,
      idleMonths: horizonMonths - lastEnd,
      feIdle: eFe * horizonMonths - feUsed,
      beIdle: eBe * horizonMonths - beUsed,
    };
  }, [squads, scheduleEntries, horizonMonths, projectMap]);

  const squadRowData = useMemo(() => {
    return sortedSquads.map((squad) => {
      const sqEntries = scheduleEntries.filter(
        (e) => e.squadId === squad.id && isActiveInPeriod(e),
      );
      const lanes = computeLanes(sqEntries, projectMap);
      const height = Math.max(1, lanes.length) * LANE_H;
      const stats = computeSquadStats(squad.id);
      const lastEnd = sqEntries.reduce((max, e) => Math.max(max, e.endMonth), 0);
      return { squad, entries: sqEntries, lanes, height, stats, lastEnd };
    });
  }, [sortedSquads, scheduleEntries, isActiveInPeriod, projectMap, computeSquadStats]);

  const measureBarPositions = useCallback(() => {
    const container = gridBodyRef.current;
    if (!container || zoom !== "year") return;

    const containerRect = container.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const sidebarW = 12 * rem;

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
    setMeasuredGridHeight(container.scrollHeight);
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

  const totalCap = useMemo(
    () => squads.reduce((s, sq) => s + (effectiveFe(sq) + effectiveBe(sq)) * horizonMonths, 0),
    [squads, horizonMonths],
  );

  const { totalUsed, totalFeUsed, totalBeUsed } = useMemo(() => {
    let used = 0, feUsed = 0, beUsed = 0;
    for (const e of scheduleEntries) {
      const p = projectMap.get(e.projectId);
      if (!p) continue;
      used += (p.feNeeded + p.beNeeded) * p.duration;
      feUsed += p.feNeeded * p.duration;
      beUsed += p.beNeeded * p.duration;
    }
    return { totalUsed: used, totalFeUsed: feUsed, totalBeUsed: beUsed };
  }, [scheduleEntries, projectMap]);

  const globalUtil = totalCap > 0 ? (totalUsed / totalCap) * 100 : 0;
  const totalFeCap = useMemo(
    () => squads.reduce((s, sq) => s + effectiveFe(sq) * horizonMonths, 0),
    [squads, horizonMonths],
  );
  const totalBeCap = useMemo(
    () => squads.reduce((s, sq) => s + effectiveBe(sq) * horizonMonths, 0),
    [squads, horizonMonths],
  );

  // --- Early return after all hooks ---
  if (!displaySchedule) return null;

  function verdictBadge(): { text: string; cls: string } {
    if (globalUtil >= 90) return { text: "At capacity", cls: "text-red-700 bg-red-50 border-red-200" };
    if (globalUtil >= 70) return { text: "Healthy", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    return { text: "Under-utilized", cls: "text-amber-700 bg-amber-50 border-amber-200" };
  }
  const verdict = verdictBadge();

  return (
    <div className={`space-y-4 transition-opacity duration-150 ${isReoptimizing ? "opacity-50 pointer-events-none" : ""}`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mr-auto">
          Schedule
        </h2>
        {zoom !== "year" && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setZoom(zoom === "week" ? "month" : "year")}>
            &larr; Back
          </Button>
        )}
        <div className="flex rounded-md border overflow-hidden text-xs">
          {(["year", "month", "week"] as ZoomLevel[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`px-3 py-1.5 font-medium capitalize transition-colors ${
                zoom === z
                  ? "bg-foreground text-background"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              {z}
            </button>
          ))}
        </div>
      </div>

      {/* Pipeline health */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3 border rounded-lg bg-muted/20">
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-muted-foreground">Utilization</span>
          <div className="w-28 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${utilBg(globalUtil)}`}
              style={{ width: `${Math.min(globalUtil, 100)}%` }}
            />
          </div>
          <span className={`text-sm font-bold tabular-nums ${utilColor(globalUtil)}`}>
            {pct(globalUtil)}
          </span>
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">FE&ensp;</span>
            <span className={`font-semibold tabular-nums ${utilColor(totalFeCap > 0 ? (totalFeUsed / totalFeCap) * 100 : 0)}`}>
              {fmt(totalFeUsed)}<span className="text-muted-foreground font-normal">/{fmt(totalFeCap)}</span>
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">BE&ensp;</span>
            <span className={`font-semibold tabular-nums ${utilColor(totalBeCap > 0 ? (totalBeUsed / totalBeCap) * 100 : 0)}`}>
              {fmt(totalBeUsed)}<span className="text-muted-foreground font-normal">/{fmt(totalBeCap)}</span>
            </span>
          </div>
        </div>
        <div className={`text-xs font-medium px-2.5 py-1 rounded-full border ml-auto ${verdict.cls}`}>
          {verdict.text}
        </div>
      </div>

      {/* Sub-nav for month/week zoom */}
      {zoom !== "year" && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground text-xs">Viewing:</span>
          <span className="text-xs font-medium">
            {MONTH_LABELS[actualMonth]} {actualYear}
            {zoom === "week" && ` — W${focusWeek + 1}`}
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
          <div className="w-48 shrink-0 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-r">
            Squad
          </div>
          <div
            className="flex-1 grid"
            style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
          >
            {columns.map((label, i) => (
              <div
                key={i}
                className={`px-1 py-2.5 text-center text-xs font-medium text-muted-foreground border-l transition-colors ${
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

        {/* Squad rows + overlay container */}
        <div className="relative" ref={gridBodyRef} onMouseLeave={() => setHoveredId(null)}>
          {squadRowData.map((row) => (
            <div key={row.squad.id} className="flex border-t">
              {/* Squad sidebar */}
              <div className="w-48 shrink-0 px-3 py-2 border-r flex flex-col justify-center gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate">{row.squad.name}</span>
                  <span className={`text-xs font-bold tabular-nums ${utilColor(row.stats.utilization)}`}>
                    {pct(row.stats.utilization)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${utilBg(row.stats.utilization)}`}
                    style={{ width: `${Math.min(row.stats.utilization, 100)}%` }}
                  />
                </div>
                {row.stats.idleMonths > 0 && zoom === "year" && (
                  <div className="text-xs text-muted-foreground tabular-nums leading-tight">
                    {fmt(row.stats.feIdle)} FE + {fmt(row.stats.beIdle)} BE spare
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="flex-1 relative" style={{ minHeight: row.height }}>
                {/* Grid lines + idle shading */}
                <div
                  className="absolute inset-0 grid pointer-events-none"
                  style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
                >
                  {columns.map((_, i) => {
                    const isIdle = zoom === "year" && i >= row.lastEnd && row.entries.length > 0;
                    return (
                      <div key={i} className={`border-l h-full ${isIdle ? "bg-amber-50/60" : ""}`} />
                    );
                  })}
                </div>

                {/* Project bars */}
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
                        data-rank={rank}
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

                {/* Idle label */}
                {zoom === "year" && row.stats.idleMonths > 0 && row.entries.length > 0 && (
                  <div
                    className="absolute flex items-center justify-center text-xs text-amber-500/60 font-medium pointer-events-none"
                    style={{
                      left: `${(row.lastEnd / colCount) * 100}%`,
                      width: `${(row.stats.idleMonths / colCount) * 100}%`,
                      top: 0, height: "100%",
                    }}
                  >
                    {row.stats.idleMonths} mo idle
                  </div>
                )}

                {row.entries.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/40">
                    No projects assigned
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Overlay container for arrows + tooltip, aligned to timeline area */}
          {zoom === "year" && (arrows.length > 0 || tooltip) && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: "12rem", right: 0 }}
              data-gantt-overlay
            >
              {/* Dependency arrows (HTML-based for pixel-accurate positioning) */}
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
                        left: a.x1,
                        top: a.y1,
                        width: length,
                        height: 0,
                        borderTop: "2px dashed rgba(0,0,0,0.35)",
                        transform: `rotate(${angle}deg)`,
                      }}
                    />
                    <div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        left: a.x2 - 4,
                        top: a.y2 - 4,
                        width: 8,
                        height: 8,
                        backgroundColor: "rgba(0,0,0,0.4)",
                      }}
                    />
                  </div>
                );
              })}

              {/* Hover tooltip */}
              {tooltip && (
                <div
                  className="absolute z-20"
                  style={{
                    left: (tooltip.pos.xStart + tooltip.pos.xEnd) / 2,
                    top: tooltip.pos.yBottom + 6,
                    transform: "translateX(-50%)",
                  }}
                  data-gantt-tooltip
                >
                  <div className="bg-popover text-popover-foreground shadow-lg border rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-nowrap">
                    <div className="font-semibold">
                      #{tooltip.rank} &middot; WSJF {tooltip.w.toFixed(1)} &middot; {tooltip.proj.feNeeded} FE + {tooltip.proj.beNeeded} BE &times; {tooltip.proj.duration} mo
                    </div>
                    {tooltip.blockedBy.length > 0 && (
                      <div className="text-muted-foreground">
                        Blocked by: {tooltip.blockedBy.join(", ")}
                      </div>
                    )}
                    {tooltip.unblocks.length > 0 && (
                      <div className="text-muted-foreground">
                        Unblocks: {tooltip.unblocks.join(", ")}
                      </div>
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
        <div className="p-4 border border-destructive/20 rounded-lg bg-destructive/5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-destructive mb-3">
            Deferred &mdash; {scheduleDeferred.length} project{scheduleDeferred.length > 1 ? "s" : ""}
          </h3>
          <div className="space-y-2">
            {scheduleDeferred.map((d) => {
              const p = projectMap.get(d.projectId);
              if (!p) return null;
              return (
                <div key={d.projectId} className="flex items-start gap-2">
                  <Badge variant="destructive" className="shrink-0 text-xs">{p.name}</Badge>
                  <span className="text-xs text-muted-foreground leading-relaxed">{d.reason}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
