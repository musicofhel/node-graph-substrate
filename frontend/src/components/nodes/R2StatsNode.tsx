import { memo, useEffect, useRef, useState } from "react";
import { useNodesData } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { PaperPoolSection, type PoolPaper } from "./PaperPoolSection";
import { useCanvasStore } from "../../lib/store/canvas-store";

interface CompletedPaper {
  queue_id: string;
  title: string;
  success: boolean;
  processing_time_ms: number;
}

const MAX_PAPERS = 100;

export const R2StatsNode = memo(({ id }: { id: string }) => {
  const nodeData = useNodesData(id);
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;
  const lastSeenRef = useRef<string | null>(null);
  const [papers, setPapers] = useState<CompletedPaper[]>([]);
  const starredPapers = useCanvasStore((s) => s.starredPapers);
  const flushCounter = useCanvasStore((s) => s.flushCounter);

  useEffect(() => {
    const eventKey = String(data.queue_id ?? "") + ":" + String(data.completed_at ?? "");
    if (!data.queue_id || eventKey === lastSeenRef.current) return;
    lastSeenRef.current = eventKey;

    const entry: CompletedPaper = {
      queue_id: String(data.queue_id),
      title: typeof data.title === "string" ? data.title : `#${data.queue_id}`,
      success: data.success === true || data.success === "true",
      processing_time_ms: Number(data.processing_time_ms ?? 0),
    };

    setPapers((prev) => {
      if (prev.some((p) => p.queue_id === entry.queue_id)) return prev;
      return [entry, ...prev].slice(0, MAX_PAPERS);
    });
  }, [data.queue_id, data.completed_at, data.success, data.processing_time_ms, data.title]);

  useEffect(() => {
    if (flushCounter === 0) return;
    setPapers((prev) => prev.filter((p) => starredPapers.has(p.queue_id)));
  }, [flushCounter, starredPapers]);

  const successCount = papers.filter((p) => p.success).length;
  const failCount = papers.filter((p) => !p.success).length;
  const total = papers.length;
  const avgMs = successCount > 0
    ? Math.round(papers.filter((p) => p.success).reduce((acc, p) => acc + p.processing_time_ms, 0) / successCount)
    : 0;

  const poolPapers: PoolPaper[] = papers.map((p) => ({
    id: p.queue_id,
    label: p.title,
    sublabel: `${p.processing_time_ms}ms`,
    badges: [
      {
        text: p.success ? "success" : "failed",
        className: p.success ? "bg-emerald-900/60 text-emerald-400" : "bg-red-900/60 text-red-400",
      },
    ],
  }));

  return (
    <BaseNodeShell label="Pipeline Stats" category="scoring">
      <div style={{ width: 360 }}>
        <div className="grid grid-cols-4 gap-2 text-xs text-neutral-400 mb-1">
          <div>Total: <span className="text-neutral-200">{total}</span></div>
          <div>OK: <span className="text-emerald-400">{successCount}</span></div>
          <div>Fail: <span className="text-red-400">{failCount}</span></div>
          <div>Avg: <span className="text-neutral-200">{avgMs}ms</span></div>
        </div>
        <PaperPoolSection papers={poolPapers} emptyText="Waiting for completed events..." />
      </div>
    </BaseNodeShell>
  );
});
R2StatsNode.displayName = "R2StatsNode";
