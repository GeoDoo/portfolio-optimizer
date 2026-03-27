export type Role = "fe" | "be" | "pm" | "qe" | "sre" | "devops" | "design" | "data";

export function isSchedulingRole(role: Role): boolean {
  return role === "fe" || role === "be";
}

export const ROLE_META: Record<Role, { label: string; color: string }> = {
  fe:     { label: "Frontend",  color: "blue"   },
  be:     { label: "Backend",   color: "amber"  },
  pm:     { label: "PM",        color: "purple" },
  qe:     { label: "QA",        color: "teal"   },
  sre:    { label: "SRE",       color: "orange" },
  devops: { label: "DevOps",    color: "cyan"   },
  design: { label: "Design",    color: "pink"   },
  data:   { label: "Data",      color: "indigo" },
};

export type Seniority = "junior" | "mid" | "senior" | "lead" | "principal";

export const SENIORITY_SKILL: Record<Seniority, number> = {
  junior: 0.5, mid: 0.7, senior: 1.0, lead: 1.0, principal: 1.0,
};

export const SENIORITY_META: Record<Seniority, { label: string }> = {
  junior:    { label: "Junior"    },
  mid:       { label: "Mid"       },
  senior:    { label: "Senior"    },
  lead:      { label: "Lead"      },
  principal: { label: "Principal" },
};

export type Objective = "wsjf" | "max-value" | "min-delay" | "max-throughput";

export type Member = {
  id: string;
  name?: string;
  role: Role;
  seniority?: Seniority;
  allocation: number;
  skill: number; // 0–1 efficiency factor, derived from seniority or set directly
};

export type Squad = {
  id: string;
  name: string;
  members: Member[];
};

export type Project = {
  id: string;
  name: string;
  duration: number;
  feNeeded: number;
  beNeeded: number;
  businessValue: number;
  timeCriticality: number;
  riskReduction: number;
  squadId: string;
  dependencies: string[];
  deadline?: number; // soft: month offset by which it should complete
};

export type ScheduleEntry = {
  projectId: string;
  squadId: string;
  startMonth: number;
  endMonth: number;
};

export type DeferralReason = {
  projectId: string;
  reason: string;
};

export type ScheduleResult = {
  entries: ScheduleEntry[];
  deferred: DeferralReason[];
};

export type AlertLevel = "ok" | "warn" | "error";

export type Alert = {
  projectId: string;
  level: AlertLevel;
  message: string;
};

export type RecommendationAction =
  | { type: "flip-role"; squadId: string; memberId: string; newRole: Role }
  | { type: "bump-allocation"; squadId: string; memberId: string; squadName: string; newAllocation: number }
  | { type: "reduce-requirement"; projectId: string; field: "feNeeded" | "beNeeded"; newValue: number };

export type Recommendation = {
  id: string;
  description: string;
  impact: string;
  action?: RecommendationAction;
};

export type ScheduleDiff = {
  added: string[];
  removed: string[];
  moved: { projectId: string; fromStart: number; toStart: number }[];
  newlyDeferred: string[];
  newlyScheduled: string[];
};

export type OptimalPlan = {
  actions: RecommendationAction[];
  descriptions: string[];
  scheduledCount: number;
  deferredCount: number;
};

export type ZoomLevel = "year" | "month" | "week";

// --- Simulation ---

export type UncertaintyParams = {
  estimationErrorPct: number;
  interruptionProbPct: number;
  dependencyDelayPct: number;
  reworkProbPct: number;
};

export type ProjectStats = {
  projectId: string;
  completionPct: number;
  deliveryP10: number;
  deliveryP50: number;
  deliveryP90: number;
};

export type SimulationResult = {
  numRuns: number;
  projectStats: ProjectStats[];
  totalValueP10: number;
  totalValueP50: number;
  totalValueP90: number;
  scheduledCountP10: number;
  scheduledCountP50: number;
  scheduledCountP90: number;
  lastMonthP10: number;
  lastMonthP50: number;
  lastMonthP90: number;
  planReliability: number;
};

// --- Scenarios ---

export type Scenario = {
  id: string;
  name: string;
  squads: Squad[];
  projects: Project[];
  objective: Objective;
  horizonMonths: number;
  uncertainty: UncertaintyParams;
  cycleLengthWeeks: number;
  cycleOverheadPct: number;
  aiEffect: number;
};

export type ScenarioResult = {
  plan: ScheduleResult;
  simulation: SimulationResult | null;
};

// --- Comparison (legacy) ---

export type ComparisonMetrics = {
  label: string;
  headcount: number;
  engineeringFte: number;
  scheduledCount: number;
  deferredCount: number;
  totalValueDelivered: number;
  avgLeadTime: number;
  utilizationPct: number;
  lastDeliveryMonth: number;
  entries: ScheduleEntry[];
  deferred: DeferralReason[];
};

export type ComparisonResult = {
  traditional: ComparisonMetrics;
  noOverhead: ComparisonMetrics;
  sameTeamAI: ComparisonMetrics;
  miniSquad: ComparisonMetrics;
  overheadGainPct: number;
  flexibilityGainPct: number;
  totalGainPct: number;
  breakEvenMultiplier: number;
};
