import { memo } from "react";
import { useNodesData } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";

const LIFECYCLE_STAGES = ["triaged", "script_generated", "experiment_started", "experiment_completed", "promoted"] as const;

const STAGE_LABELS: Record<string, string> = {
  triaged: "Triaged",
  script_generated: "Script Generated",
  experiment_started: "Experiment Started",
  experiment_completed: "Experiment Completed",
  promoted: "Promoted",
};

export const ResearchCoordinatorNode = memo(({ id }: { id: string }) => {
  const nodeData = useNodesData(id);
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;

  const arxivId = typeof data.arxiv_id === "string" ? data.arxiv_id : "";
  const status = typeof data.status === "string" ? data.status : "";
  const hasData = !!arxivId || !!status;

  return (
    <BaseNodeShell label="Research Coordinator" category="scoring">
      <div style={{ width: 220 }}>
        {hasData ? (
          <div className="space-y-1.5">
            {arxivId && (
              <div className="text-xs text-emerald-400 font-mono truncate">
                {arxivId}
              </div>
            )}
            <div className="space-y-0.5">
              {LIFECYCLE_STAGES.map((stage) => {
                const active = stage === status || data[stage] === true || data[stage] === "true";
                return (
                  <div key={stage} className="flex items-center gap-2 text-[11px]">
                    <span className={`h-2 w-2 rounded-full ${
                      active ? "bg-emerald-500" : "border border-neutral-600"
                    }`} />
                    <span className={active ? "text-neutral-300" : "text-neutral-600"}>
                      {STAGE_LABELS[stage]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="py-3 text-center text-xs text-neutral-500">
            Waiting for research events...
          </div>
        )}
      </div>
    </BaseNodeShell>
  );
});
ResearchCoordinatorNode.displayName = "ResearchCoordinatorNode";
