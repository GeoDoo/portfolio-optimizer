import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Squad, Member, Project, ScheduleResult, Objective } from "./types";

type Store = {
  squads: Squad[];
  projects: Project[];
  schedule: ScheduleResult | null;
  prevSchedule: ScheduleResult | null;
  horizonMonths: number;
  horizonStartMonth: number;
  horizonStartYear: number;
  cycleLengthWeeks: number;
  cycleOverheadPct: number;
  objective: Objective;

  addSquad: (squad: Squad) => void;
  updateSquad: (id: string, data: Partial<Omit<Squad, "members">>) => void;
  removeSquad: (id: string) => void;
  addMember: (squadId: string, member: Member) => void;
  updateMember: (squadId: string, memberId: string, data: Partial<Member>) => void;
  removeMember: (squadId: string, memberId: string) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, data: Partial<Project>) => void;
  removeProject: (id: string) => void;
  setSchedule: (schedule: ScheduleResult) => void;
  setHorizonMonths: (n: number) => void;
  setHorizonStart: (month: number, year: number) => void;
  setCycleLengthWeeks: (n: number) => void;
  setCycleOverheadPct: (n: number) => void;
  setObjective: (o: Objective) => void;
  loadData: (squads: Squad[], projects: Project[]) => void;
};

function invalidate(s: { schedule: ScheduleResult | null }) {
  return { prevSchedule: s.schedule, schedule: null };
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      squads: [],
      projects: [],
      schedule: null,
      prevSchedule: null,
      horizonMonths: 9,
      horizonStartMonth: 3,
      horizonStartYear: 2026,
      cycleLengthWeeks: 1,
      cycleOverheadPct: 12,
      objective: "wsjf" as Objective,

      addSquad: (squad) =>
        set((s) => ({ squads: [...s.squads, squad], ...invalidate(s) })),
      updateSquad: (id, data) =>
        set((s) => ({
          squads: s.squads.map((sq) => (sq.id === id ? { ...sq, ...data } : sq)),
          ...invalidate(s),
        })),
      removeSquad: (id) =>
        set((s) => ({
          squads: s.squads.filter((sq) => sq.id !== id),
          ...invalidate(s),
        })),
      addMember: (squadId, member) =>
        set((s) => ({
          squads: s.squads.map((sq) =>
            sq.id === squadId ? { ...sq, members: [...sq.members, member] } : sq,
          ),
          ...invalidate(s),
        })),
      updateMember: (squadId, memberId, data) =>
        set((s) => ({
          squads: s.squads.map((sq) =>
            sq.id === squadId
              ? {
                  ...sq,
                  members: sq.members.map((m) =>
                    m.id === memberId ? { ...m, ...data } : m,
                  ),
                }
              : sq,
          ),
          ...invalidate(s),
        })),
      removeMember: (squadId, memberId) =>
        set((s) => ({
          squads: s.squads.map((sq) =>
            sq.id === squadId
              ? { ...sq, members: sq.members.filter((m) => m.id !== memberId) }
              : sq,
          ),
          ...invalidate(s),
        })),
      addProject: (project) =>
        set((s) => ({ projects: [...s.projects, project], ...invalidate(s) })),
      updateProject: (id, data) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...data } : p)),
          ...invalidate(s),
        })),
      removeProject: (id) =>
        set((s) => ({
          projects: s.projects
            .filter((p) => p.id !== id)
            .map((p) => ({ ...p, dependencies: p.dependencies.filter((d) => d !== id) })),
          ...invalidate(s),
        })),
      loadData: (squads, projects) =>
        set((s) => ({ squads, projects, ...invalidate(s) })),
      setSchedule: (schedule) => set({ schedule }),
      setHorizonMonths: (horizonMonths) =>
        set((s) => ({ horizonMonths, ...invalidate(s) })),
      setHorizonStart: (horizonStartMonth, horizonStartYear) =>
        set((s) => ({ horizonStartMonth, horizonStartYear, ...invalidate(s) })),
      setCycleLengthWeeks: (cycleLengthWeeks) =>
        set((s) => ({ cycleLengthWeeks, ...invalidate(s) })),
      setCycleOverheadPct: (cycleOverheadPct) =>
        set((s) => ({ cycleOverheadPct, ...invalidate(s) })),
      setObjective: (objective) =>
        set((s) => ({ objective, ...invalidate(s) })),
    }),
    {
      name: "portfolio-optimizer",
      version: 7,
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version < 3) {
          const squads = (state.squads as Record<string, unknown>[]) ?? [];
          state.squads = squads.map((s) => {
            if (Array.isArray(s.members) && s.members.length > 0 && typeof s.members[0] === "object") {
              return s;
            }
            const feCount = (s.feCount as number) ?? Math.ceil(((s.members as number) || 3) / 2);
            const beCount = (s.beCount as number) ?? Math.floor(((s.members as number) || 3) / 2);
            const alloc = (s.allocation as number) ?? 100;
            const members: Member[] = [];
            for (let i = 0; i < feCount; i++) members.push({ id: crypto.randomUUID(), role: "fe", allocation: alloc, skill: 1 });
            for (let i = 0; i < beCount; i++) members.push({ id: crypto.randomUUID(), role: "be", allocation: alloc, skill: 1 });
            return { id: s.id, name: s.name, members };
          });
        }
        if (version < 4) {
          const projects = (state.projects as Record<string, unknown>[]) ?? [];
          state.projects = projects.map((p) => ({
            ...p,
            feNeeded: p.feNeeded ?? Math.ceil(((p.peopleNeeded as number) || 2) / 2),
            beNeeded: p.beNeeded ?? Math.floor(((p.peopleNeeded as number) || 2) / 2),
            businessValue: p.businessValue ?? (p.priority as number) ?? 5,
            timeCriticality: p.timeCriticality ?? 5,
            riskReduction: p.riskReduction ?? 3,
          }));
          state.schedule = null;
          state.prevSchedule = null;
        }
        if (version < 5) {
          state.cycleLengthWeeks = state.cycleLengthWeeks ?? 1;
          state.cycleOverheadPct = state.cycleOverheadPct ?? 12;
          state.schedule = null;
          state.prevSchedule = null;
        }
        if (version < 6) {
          state.objective = state.objective ?? "wsjf";
          state.schedule = null;
          state.prevSchedule = null;
        }
        if (version < 7) {
          const squads = (state.squads as Record<string, unknown>[]) ?? [];
          state.squads = squads.map((s) => ({
            ...s,
            members: ((s as { members?: Record<string, unknown>[] }).members ?? []).map((m) => ({
              ...m,
              skill: (m.skill as number) ?? 1,
            })),
          }));
          state.schedule = null;
          state.prevSchedule = null;
        }
        return state;
      },
    },
  ),
);
