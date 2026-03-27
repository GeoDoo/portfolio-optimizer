export type Role = "fe" | "be" | "pm";

export type Objective = "wsjf" | "max-value" | "min-delay" | "max-throughput";

export type Member = {
  id: string;
  role: Role;
  allocation: number;
  skill: number; // 0–1 efficiency factor, default 1.0
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

// --- Comparison ---

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
