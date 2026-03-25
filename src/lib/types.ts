export type Role = "fe" | "be";

export type Member = {
  id: string;
  role: Role;
  allocation: number;
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

export type Recommendation = {
  id: string;
  description: string;
  impact: string;
};

export type ScheduleDiff = {
  added: string[];
  removed: string[];
  moved: { projectId: string; fromStart: number; toStart: number }[];
  newlyDeferred: string[];
  newlyScheduled: string[];
};

export type ZoomLevel = "year" | "month" | "week";
