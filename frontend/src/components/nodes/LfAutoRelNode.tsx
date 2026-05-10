import { memo } from "react";
import { useNodesData } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";

export const LfAutoRelNode = memo(({ id }: { id: string }) => {
  const nodeData = useNodesData(id);
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;

  const phases = typeof data.phases === "object" && data.phases !== null && !Array.isArray(data.phases)
    ? (data.phases as Record<string, Record<string, number>>)
    : undefined;
  const totalCreated = Number(data.total_edges_created ?? 0);
  const totalPruned = Number(data.total_edges_pruned ?? 0);
  const durationMs = Number(data.duration_ms ?? 0);

  return (
    <BaseNodeShell label="AutoRel Status" category="scoring">
      <div className="space-y-1 text-xs text-neutral-400">
        {totalCreated > 0 || totalPruned > 0 ? (
          <>
            <div className="flex justify-between">
              <span>Edges created</span>
              <span className="text-emerald-400">+{totalCreated}</span>
            </div>
            <div className="flex justify-between">
              <span>Edges pruned</span>
              <span className="text-red-400">-{totalPruned}</span>
            </div>
            <div className="flex justify-between">
              <span>Duration</span>
              <span>{(durationMs / 1000).toFixed(1)}s</span>
            </div>
            {phases && (
              <div className="mt-1 text-[10px] text-neutral-500 space-y-0.5">
                {Object.entries(phases).map(([phase, result]) => (
                  <div key={phase} className="flex justify-between">
                    <span>{phase}</span>
                    <span>{result.written ?? 0}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <span className="text-neutral-500">waiting for sweep...</span>
        )}
      </div>
    </BaseNodeShell>
  );
});
LfAutoRelNode.displayName = "LfAutoRelNode";
