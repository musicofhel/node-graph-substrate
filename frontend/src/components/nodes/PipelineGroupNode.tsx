import { memo } from "react";
import { useNodesData } from "@xyflow/react";

export const PipelineGroupNode = memo(({ id }: { id: string }) => {
  const nodeData = useNodesData(id);
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;
  const title = String(data.title ?? data.queueId ?? "Pipeline");

  return (
    <div className="h-full w-full rounded-lg border border-neutral-700/40 bg-neutral-950/70 shadow-lg">
      <div className="border-b border-neutral-800/60 px-3 py-2">
        <span className="block truncate text-xs font-medium text-neutral-400">
          {title}
        </span>
      </div>
    </div>
  );
});
PipelineGroupNode.displayName = "PipelineGroupNode";
