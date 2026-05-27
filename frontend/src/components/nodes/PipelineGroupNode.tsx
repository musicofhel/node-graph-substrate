import { memo } from "react";
import { useNodesData, useViewport } from "@xyflow/react";

export const PipelineGroupNode = memo(({ id }: { id: string }) => {
  const nodeData = useNodesData(id);
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;
  const title = data.title ? String(data.title) : null;
  const queueId = data.queueId ? String(data.queueId) : null;
  const label = title ?? queueId ?? "Pipeline";
  const { zoom } = useViewport();
  const showDetail = zoom >= 0.7 && title && queueId;

  return (
    <div className="h-full w-full rounded-lg border border-neutral-700/40 bg-neutral-950/70 shadow-lg">
      <div className="border-b border-neutral-800/60 px-3 py-2">
        <span className="block truncate text-xs font-medium text-neutral-400">
          {label}
        </span>
        {showDetail && (
          <span className="block truncate text-[10px] text-neutral-500">
            #{queueId}
          </span>
        )}
      </div>
    </div>
  );
});
PipelineGroupNode.displayName = "PipelineGroupNode";
