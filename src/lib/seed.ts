import { Squad, Project } from "./types";

let _id = 0;
const id = () => `seed-${++_id}`;

const s1 = id(), s2 = id(), s3 = id();

export const SEED_SQUADS: Squad[] = [
  {
    id: s1,
    name: "Payments",
    members: [
      { id: id(), role: "pm", allocation: 100 },
      { id: id(), role: "fe", allocation: 100 },
      { id: id(), role: "fe", allocation: 80 },
      { id: id(), role: "be", allocation: 100 },
      { id: id(), role: "be", allocation: 100 },
    ],
  },
  {
    id: s2,
    name: "Growth",
    members: [
      { id: id(), role: "pm", allocation: 100 },
      { id: id(), role: "fe", allocation: 100 },
      { id: id(), role: "fe", allocation: 60 },
      { id: id(), role: "be", allocation: 100 },
    ],
  },
  {
    id: s3,
    name: "Platform",
    members: [
      { id: id(), role: "pm", allocation: 100 },
      { id: id(), role: "fe", allocation: 50 },
      { id: id(), role: "be", allocation: 100 },
      { id: id(), role: "be", allocation: 100 },
      { id: id(), role: "be", allocation: 80 },
    ],
  },
];

const p1 = id(), p2 = id(), p3 = id(), p4 = id(), p5 = id();
const p6 = id(), p7 = id(), p8 = id(), p9 = id(), p10 = id();

//                                                          bv  tc  rr
export const SEED_PROJECTS: Project[] = [
  { id: p1, name: "Checkout v2",          duration: 3, feNeeded: 1, beNeeded: 2, businessValue: 9, timeCriticality: 8, riskReduction: 3, squadId: s1, dependencies: [] },
  { id: p2, name: "Subscription billing", duration: 2, feNeeded: 1, beNeeded: 1, businessValue: 8, timeCriticality: 7, riskReduction: 4, squadId: s1, dependencies: [p1] },
  { id: p3, name: "Referral program",     duration: 2, feNeeded: 1, beNeeded: 1, businessValue: 7, timeCriticality: 6, riskReduction: 5, squadId: s2, dependencies: [] },
  { id: p4, name: "Onboarding revamp",    duration: 2, feNeeded: 2, beNeeded: 0, businessValue: 6, timeCriticality: 5, riskReduction: 4, squadId: s2, dependencies: [], deadline: 6 },
  { id: p5, name: "API v3 migration",     duration: 4, feNeeded: 0, beNeeded: 2, businessValue: 8, timeCriticality: 9, riskReduction: 10,squadId: s3, dependencies: [] },
  { id: p6, name: "Dashboard analytics",  duration: 2, feNeeded: 1, beNeeded: 1, businessValue: 5, timeCriticality: 4, riskReduction: 3, squadId: s2, dependencies: [p5] },
  { id: p7, name: "Mobile push notifs",   duration: 1, feNeeded: 1, beNeeded: 1, businessValue: 4, timeCriticality: 3, riskReduction: 2, squadId: s3, dependencies: [] },
  { id: p8, name: "Payment retry logic",  duration: 1, feNeeded: 0, beNeeded: 1, businessValue: 7, timeCriticality: 8, riskReduction: 6, squadId: s1, dependencies: [p1] },
  { id: p9, name: "Search overhaul",      duration: 3, feNeeded: 1, beNeeded: 2, businessValue: 6, timeCriticality: 5, riskReduction: 4, squadId: s3, dependencies: [p5] },
  { id: p10,name: "Admin portal",         duration: 2, feNeeded: 1, beNeeded: 1, businessValue: 3, timeCriticality: 2, riskReduction: 2, squadId: s2, dependencies: [] },
];
