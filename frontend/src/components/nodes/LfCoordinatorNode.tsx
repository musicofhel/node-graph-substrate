import { memo } from "react";
import { useNodesData } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";

export const LfCoordinatorNode = memo(({ id }: { id: string }) => {
  const nodeData = useNodesData(id);
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;
  const paperCount = Number(data.paper_count ?? 0);

  return (
    <BaseNodeShell label="Pipeline Coordinator" category="input">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        <span className="text-xs text-neutral-400">watching 10 streams</span>
      </div>
      {paperCount > 0 && (
        <div className="mt-1 text-xs text-neutral-500">
          {paperCount} papers tracked
        </div>
      )}
    </BaseNodeShell>
  );
});
LfCoordinatorNode.displayName = "LfCoordinatorNode";
