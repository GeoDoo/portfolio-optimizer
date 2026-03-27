import { Squad, Scenario } from "./types";

/**
 * Same team composition but every engineer becomes full-stack.
 * All engineering capacity flows to BOTH FE and BE pools.
 * PMs stay as PMs. Headcount is unchanged.
 */
export function buildFullStackSquads(squads: Squad[]): Squad[] {
  return squads.map((s) => {
    const pms = s.members.filter((m) => m.role === "pm");
    const engineers = s.members.filter((m) => m.role === "fe" || m.role === "be");
    const totalEffective = engineers.reduce((sum, m) => sum + m.allocation * (m.skill ?? 1), 0);
    return {
      id: s.id,
      name: s.name,
      members: [
        ...pms.map((m) => ({ ...m })),
        { id: `${s.id}-fs-fe`, role: "fe" as const, allocation: totalEffective, skill: 1 },
        { id: `${s.id}-fs-be`, role: "be" as const, allocation: totalEffective, skill: 1 },
      ],
    };
  });
}

/**
 * AI mini squad: 1 full-stack engineer + 1 PM per traditional squad.
 * The engineer's capacity is `multiplier * 100` for both FE and BE.
 */
export function buildMiniSquads(squads: Squad[], multiplier: number): Squad[] {
  return squads.map((s) => ({
    id: s.id,
    name: s.name,
    members: [
      { id: `${s.id}-ai-pm`, role: "pm" as const, allocation: 100, skill: 1 },
      { id: `${s.id}-ai-fe`, role: "fe" as const, allocation: Math.round(multiplier * 100), skill: 1 },
      { id: `${s.id}-ai-be`, role: "be" as const, allocation: Math.round(multiplier * 100), skill: 1 },
    ],
  }));
}

/**
 * Generates 3 preset scenarios from the user's current working state:
 *   1. "Current setup" — exact snapshot
 *   2. "Full-stack AI" — same headcount, engineers become full-stack
 *   3. "AI Mini Squad" — 1 PM + 1 eng per squad
 */
function cloneBase(base: Scenario, overrides: Partial<Scenario>): Scenario {
  return {
    ...base,
    id: crypto.randomUUID(),
    squads: structuredClone(base.squads),
    projects: structuredClone(base.projects),
    uncertainty: { ...base.uncertainty },
    ...overrides,
  };
}

export function buildPresetScenarios(base: Scenario): Scenario[] {
  return [
    cloneBase(base, { name: "Current setup" }),
    cloneBase(base, { name: "Full-stack AI", squads: buildFullStackSquads(base.squads) }),
    cloneBase(base, { name: "AI Mini Squad", squads: buildMiniSquads(base.squads, 1) }),
  ];
}
