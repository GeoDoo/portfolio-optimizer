"use client";

import { useStore } from "@/lib/store";
import { effectiveFe, effectiveBe } from "@/lib/optimizer";
import { Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ROLE_LABELS: Record<Role, string> = { fe: "Frontend", be: "Backend", pm: "PM" };
const ROLE_SHORT: Record<Role, string> = { fe: "FE", be: "BE", pm: "PM" };
const ROLE_COLORS: Record<Role, string> = {
  fe: "bg-blue-100 text-blue-700 hover:bg-blue-200",
  be: "bg-amber-100 text-amber-700 hover:bg-amber-200",
  pm: "bg-purple-100 text-purple-700 hover:bg-purple-200",
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
    horizonMonths,
  } = useStore();

  const handleAddSquad = () => {
    addSquad({
      id: crypto.randomUUID(),
      name: `Team ${squads.length + 1}`,
      members: [],
    });
  };

  const handleAddMember = (squadId: string, role: Role) => {
    addMember(squadId, {
      id: crypto.randomUUID(),
      role,
      allocation: 100,
      skill: 1,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Teams
        </h2>
        <Button size="sm" variant="outline" onClick={handleAddSquad} className="h-7 text-xs">
          + Add team
        </Button>
      </div>

      {squads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground">No teams yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add a team to get started
          </p>
        </div>
      )}

      <div className="space-y-2">
        {squads.map((s) => {
          const eFe = effectiveFe(s);
          const eBe = effectiveBe(s);
          const feCount = s.members.filter((m) => m.role === "fe").length;
          const beCount = s.members.filter((m) => m.role === "be").length;
          const pmCount = s.members.filter((m) => m.role === "pm").length;

          const parts: string[] = [];
          if (feCount > 0) parts.push(`${feCount} frontend`);
          if (beCount > 0) parts.push(`${beCount} backend`);
          if (pmCount > 0) parts.push(`${pmCount} PM`);
          const summary = parts.length > 0 ? parts.join(", ") : "Empty";

          return (
            <div key={s.id} className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/30">
                <Input
                  value={s.name}
                  onChange={(e) => updateSquad(s.id, { name: e.target.value })}
                  className="h-6 text-xs font-medium flex-1 min-w-0 border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background transition-colors px-1.5"
                />
                <span className="text-[0.65rem] text-muted-foreground tabular-nums whitespace-nowrap" title={`${eFe.toFixed(1)} frontend + ${eBe.toFixed(1)} backend effective capacity`}>
                  {summary}
                </span>
                <button
                  onClick={() => removeSquad(s.id)}
                  className="text-muted-foreground/40 hover:text-destructive transition-colors text-sm ml-1"
                >
                  &times;
                </button>
              </div>

              {s.members.length > 0 && (
                <div className="divide-y">
                  {s.members.map((m, idx) => (
                    <div key={m.id} className="flex items-center gap-1.5 px-2.5 py-1">
                      <span className="text-[0.65rem] text-muted-foreground/50 w-3 text-right tabular-nums">
                        {idx + 1}
                      </span>
                      <button
                        onClick={() => {
                          const next: Role = m.role === "fe" ? "be" : m.role === "be" ? "pm" : "fe";
                          updateMember(s.id, m.id, { role: next });
                        }}
                        title={`${ROLE_LABELS[m.role]} \u2014 click to change role`}
                        className={`text-[0.65rem] font-bold px-1.5 py-0.5 rounded transition-colors ${ROLE_COLORS[m.role]}`}
                      >
                        {ROLE_SHORT[m.role]}
                      </button>
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
                      <div className="flex items-center gap-0.5" title="Skill level: 1.0 = senior, 0.5 = mid, lower = junior">
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.1}
                          value={m.skill}
                          onChange={(e) =>
                            updateMember(s.id, m.id, {
                              skill: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)),
                            })
                          }
                          className="h-5 w-10 text-[0.7rem] text-center rounded border border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background transition-colors tabular-nums outline-none"
                        />
                        <span className="text-[0.65rem] text-muted-foreground" title="Skill level">skill</span>
                      </div>
                      <button
                        onClick={() => removeMember(s.id, m.id)}
                        className="text-muted-foreground/30 hover:text-destructive transition-colors text-xs ml-auto"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-t bg-muted/20">
                <span className="text-[0.6rem] text-muted-foreground mr-1">Add:</span>
                <Button
                  variant="ghost" size="sm"
                  className="h-5 text-[0.65rem] px-1.5 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                  onClick={() => handleAddMember(s.id, "pm")}
                >
                  Product Manager
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className="h-5 text-[0.65rem] px-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  onClick={() => handleAddMember(s.id, "fe")}
                >
                  Frontend
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className="h-5 text-[0.65rem] px-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                  onClick={() => handleAddMember(s.id, "be")}
                >
                  Backend
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
