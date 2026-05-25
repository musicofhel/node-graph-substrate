import { memo, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/pack-registry";
import { useExperimentROI } from "../../packs/experiments/hooks/useExperimentData";

const STATUS_COLORS: Record<string, string> = {
  READY: "bg-amber-600",
  COMPLETED: "bg-emerald-600",
  TRIGGERED: "bg-blue-600",
  BLOCKED: "bg-red-600",
};

export const ExperimentROINode = memo(({ selected }: NodeProps) => {
  const def = NODE_REGISTRY.experiment_roi;
  const { experiments, loading } = useExperimentROI(30);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <BaseNodeShell selected={selected} label={def.label} category={def.category}>
      <div className="nodrag" style={{ minWidth: 320, maxHeight: 360, overflowY: "auto" }}>
        {loading ? (
          <div className="text-[10px] text-neutral-500">Loading experiments...</div>
        ) : experiments.length === 0 ? (
          <div className="text-[10px] text-neutral-500">No experiments found</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {experiments.map((exp) => (
              <div key={exp.id}>
                <button
                  onClick={() => setExpandedId(expandedId === exp.id ? null : exp.id)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-800/50 hover:bg-neutral-800 text-left"
                >
                  <span className="text-[10px] font-mono font-bold text-amber-400 w-5 shrink-0">
                    {exp.roi}
                  </span>
                  <span className="text-[9px] font-mono text-neutral-400 w-20 shrink-0 truncate">
                    {exp.id}
                  </span>
                  <span className={`text-[8px] px-1 py-0.5 rounded text-white shrink-0 ${STATUS_COLORS[exp.status] ?? "bg-neutral-600"}`}>
                    {exp.status}
                  </span>
                  <span className="text-[9px] text-neutral-300 flex-1 truncate">
                    {exp.what}
                  </span>
                </button>
                {expandedId === exp.id && (
                  <div className="ml-6 px-2 py-1 text-[9px] text-neutral-400 space-y-0.5">
                    <div><span className="text-neutral-500">Cost:</span> {exp.cost || "—"}</div>
                    <div><span className="text-neutral-500">Depends:</span> {exp.depends_on.length > 0 ? exp.depends_on.map((f) => `F-${f}`).join(", ") : "none"}</div>
                    <div><span className="text-neutral-500">Updates:</span> {exp.would_update.length > 0 ? exp.would_update.map((f) => `F-${f}`).join(", ") : "—"}</div>
                    {exp.blocked_by && <div><span className="text-neutral-500">Blocked:</span> {exp.blocked_by}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </BaseNodeShell>
  );
});
ExperimentROINode.displayName = "ExperimentROINode";
