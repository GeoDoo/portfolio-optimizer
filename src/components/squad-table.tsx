"use client";

import { useStore } from "@/lib/store";
import { effectiveFe, effectiveBe } from "@/lib/optimizer";
import { Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      name: `Squad ${squads.length + 1}`,
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
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Squads
        </h2>
        <Button size="sm" variant="outline" onClick={handleAddSquad} className="h-7 text-xs">
          + Add squad
        </Button>
      </div>

      {squads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground">No squads yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add a squad to define capacity
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
          const totalPmo = (eFe + eBe) * horizonMonths;

          return (
            <div key={s.id} className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/30">
                <Input
                  value={s.name}
                  onChange={(e) => updateSquad(s.id, { name: e.target.value })}
                  className="h-6 text-xs font-medium flex-1 min-w-0 border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background transition-colors px-1.5"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[0.65rem] text-muted-foreground tabular-nums whitespace-nowrap">
                    {eFe % 1 === 0 ? eFe : eFe.toFixed(1)}FE{" "}
                    {eBe % 1 === 0 ? eBe : eBe.toFixed(1)}BE
                  </span>
                  <span className="text-[0.65rem] font-semibold tabular-nums whitespace-nowrap">
                    {totalPmo % 1 === 0 ? totalPmo : totalPmo.toFixed(1)} p-mo
                  </span>
                  <button
                    onClick={() => removeSquad(s.id)}
                    className="text-muted-foreground/40 hover:text-destructive transition-colors text-sm ml-1"
                  >
                    &times;
                  </button>
                </div>
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
                        className={`text-[0.65rem] font-bold px-1.5 py-0.5 rounded transition-colors ${
                          m.role === "fe"
                            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                            : m.role === "be"
                              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                              : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                        }`}
                      >
                        {m.role.toUpperCase()}
                      </button>
                      <div className="flex items-center gap-0.5 flex-1 min-w-0">
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[0.65rem] px-1.5 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                  onClick={() => handleAddMember(s.id, "pm")}
                >
                  + PM
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[0.65rem] px-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  onClick={() => handleAddMember(s.id, "fe")}
                >
                  + FE
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[0.65rem] px-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                  onClick={() => handleAddMember(s.id, "be")}
                >
                  + BE
                </Button>
                <span className="text-[0.65rem] text-muted-foreground ml-auto tabular-nums">
                  {pmCount}PM {feCount}FE {beCount}BE
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
