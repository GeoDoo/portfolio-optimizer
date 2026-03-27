"use client";

import { useStore } from "@/lib/store";
import { effectiveFe, effectiveBe } from "@/lib/optimizer";
import { Role, Seniority, ROLE_META, SENIORITY_META, SENIORITY_SKILL, isSchedulingRole } from "@/lib/types";
import { Button } from "@/components/ui/button";

const ALL_ROLES = Object.keys(ROLE_META) as Role[];
const ALL_SENIORITIES = Object.keys(SENIORITY_META) as Seniority[];

const ROLE_BADGE_COLORS: Record<string, string> = {
  blue:   "bg-blue-100 text-blue-700",
  amber:  "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700",
  teal:   "bg-teal-100 text-teal-700",
  orange: "bg-orange-100 text-orange-700",
  cyan:   "bg-cyan-100 text-cyan-700",
  pink:   "bg-pink-100 text-pink-700",
  indigo: "bg-indigo-100 text-indigo-700",
};

export function SquadTable() {
  const {
    squads,
    addSquad,
    updateSquad,
    removeSquad,
    addMember,
    updateMember,
    removeMember,
  } = useStore();

  const handleAddSquad = () => {
    addSquad({
      id: crypto.randomUUID(),
      name: `Team ${squads.length + 1}`,
      members: [],
    });
  };

  const handleAddMember = (squadId: string, role: Role) => {
    const squad = squads.find((s) => s.id === squadId);
    const count = squad ? squad.members.length + 1 : 1;
    addMember(squadId, {
      id: crypto.randomUUID(),
      name: `Member ${count}`,
      role,
      seniority: "mid",
      allocation: 100,
      skill: SENIORITY_SKILL.mid,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Teams</h2>
        <Button size="sm" variant="outline" onClick={handleAddSquad} className="h-7 text-xs">
          + Add team
        </Button>
      </div>

      {squads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground">No teams yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add a team to get started</p>
        </div>
      )}

      <div className="space-y-2">
        {squads.map((s) => {
          const eFe = effectiveFe(s);
          const eBe = effectiveBe(s);

          const roleCounts = new Map<Role, number>();
          for (const m of s.members) {
            roleCounts.set(m.role, (roleCounts.get(m.role) || 0) + 1);
          }
          const summaryParts: string[] = [];
          for (const [role, count] of roleCounts) {
            summaryParts.push(`${count} ${ROLE_META[role].label}`);
          }
          const summary = summaryParts.length > 0 ? summaryParts.join(", ") : "Empty";

          return (
            <div key={s.id} className="border rounded-lg overflow-hidden">
              {/* Squad header */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/30">
                <input
                  value={s.name}
                  onChange={(e) => updateSquad(s.id, { name: e.target.value })}
                  className="h-6 text-xs font-medium flex-1 min-w-0 border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background transition-colors px-1.5 rounded outline-none"
                />
                <span className="text-[0.65rem] text-muted-foreground tabular-nums whitespace-nowrap" title={`${eFe.toFixed(1)} FE + ${eBe.toFixed(1)} BE effective capacity`}>
                  {summary}
                </span>
                <button
                  onClick={() => removeSquad(s.id)}
                  className="text-muted-foreground/40 hover:text-destructive transition-colors text-sm ml-1"
                >
                  &times;
                </button>
              </div>

              {/* Members */}
              {s.members.length > 0 && (
                <div className="divide-y">
                  {s.members.map((m) => {
                    const meta = ROLE_META[m.role];
                    const badgeColor = ROLE_BADGE_COLORS[meta.color] || "bg-gray-100 text-gray-700";

                    return (
                      <div key={m.id} className="flex items-center gap-1.5 px-2.5 py-1 group">
                        {/* Name */}
                        <input
                          value={m.name ?? ""}
                          placeholder="Name"
                          onChange={(e) => updateMember(s.id, m.id, { name: e.target.value })}
                          className="h-5 w-20 text-[0.7rem] rounded border border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background transition-colors tabular-nums outline-none px-1"
                        />

                        {/* Role dropdown */}
                        <select
                          value={m.role}
                          onChange={(e) => updateMember(s.id, m.id, { role: e.target.value as Role })}
                          className={`h-5 text-[0.65rem] font-bold px-1 py-0 rounded border-0 cursor-pointer transition-colors ${badgeColor}`}
                        >
                          {ALL_ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_META[r].label}</option>
                          ))}
                        </select>

                        {/* Seniority dropdown */}
                        <select
                          value={m.seniority ?? "senior"}
                          onChange={(e) => {
                            const sen = e.target.value as Seniority;
                            updateMember(s.id, m.id, { seniority: sen, skill: SENIORITY_SKILL[sen] });
                          }}
                          className="h-5 text-[0.65rem] px-1 py-0 rounded border border-transparent bg-transparent hover:border-input focus:border-input cursor-pointer transition-colors"
                        >
                          {ALL_SENIORITIES.map((sen) => (
                            <option key={sen} value={sen}>{SENIORITY_META[sen].label}</option>
                          ))}
                        </select>

                        {/* Allocation */}
                        <div className="flex items-center gap-0.5" title="How much of their time is on this team (0-100%)">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={m.allocation}
                            onChange={(e) =>
                              updateMember(s.id, m.id, {
                                allocation: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)),
                              })
                            }
                            className="h-5 w-10 text-[0.7rem] text-center rounded border border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background transition-colors tabular-nums outline-none"
                          />
                          <span className="text-[0.65rem] text-muted-foreground">%</span>
                        </div>

                        {/* Remove */}
                        <button
                          onClick={() => removeMember(s.id, m.id)}
                          className="text-muted-foreground/30 hover:text-destructive transition-colors text-xs ml-auto opacity-0 group-hover:opacity-100"
                        >
                          &times;
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add member buttons */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-t bg-muted/20">
                <span className="text-[0.6rem] text-muted-foreground mr-1">Add:</span>
                {(["pm", "fe", "be", "qe", "sre", "devops", "design", "data"] as Role[]).map((role) => {
                  const meta = ROLE_META[role];
                  const btnColor = ROLE_BADGE_COLORS[meta.color] || "";
                  return (
                    <Button
                      key={role}
                      variant="ghost"
                      size="sm"
                      className={`h-5 text-[0.65rem] px-1.5 ${btnColor} hover:opacity-80`}
                      onClick={() => handleAddMember(s.id, role)}
                    >
                      {meta.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
