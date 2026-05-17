import { memo, useEffect, useRef, useState } from "react";
import { useNodesData } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";

export const LfStatsNode = memo(({ id, selected }: { id: string; selected?: boolean }) => {
  const nodeData = useNodesData(id);
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;
  const lastSeenRef = useRef<string | null>(null);
  const [stats, setStats] = useState({ successCount: 0, failCount: 0, totalTimeMs: 0 });

  useEffect(() => {
    const eventKey = String(data.queue_id ?? "") + ":" + String(data.completed_at ?? "");
    if (!data.queue_id || eventKey === lastSeenRef.current) return;
    lastSeenRef.current = eventKey;

    if (data.success === true || data.success === "true") {
      setStats((prev) => ({
        ...prev,
        successCount: prev.successCount + 1,
        totalTimeMs: prev.totalTimeMs + Number(data.processing_time_ms ?? 0),
      }));
    } else if (data.success === false || data.success === "false") {
      setStats((prev) => ({ ...prev, failCount: prev.failCount + 1 }));
    }
  }, [data.queue_id, data.completed_at, data.success, data.processing_time_ms]);

  const s = stats;
  const total = s.successCount + s.failCount;
  const avgMs = s.successCount > 0 ? Math.round(s.totalTimeMs / s.successCount) : 0;
  const pct = total > 0 ? Math.round((s.successCount / total) * 100) : 0;

  return (
    <BaseNodeShell selected={selected} label="Pipeline Stats" category="scoring">
      <div className="space-y-1 text-xs text-neutral-400">
        <div className="flex justify-between">
          <span>Success</span>
          <span className="text-emerald-400">{s.successCount} ({pct}%)</span>
        </div>
        <div className="flex justify-between">
          <span>Failed</span>
          <span className="text-red-400">{s.failCount}</span>
        </div>
        <div className="flex justify-between">
          <span>Avg time</span>
          <span>{avgMs}ms</span>
        </div>
        {typeof data.title === "string" && data.title && (
          <div className="truncate text-neutral-500 mt-1">
            latest: {data.title}
          </div>
        )}
      </div>
    </BaseNodeShell>
  );
});
LfStatsNode.displayName = "LfStatsNode";
