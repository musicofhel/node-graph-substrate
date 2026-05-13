import { memo, useEffect, useRef, useState } from "react";
import { useNodesData } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { useCanvasStore } from "../../lib/store/canvas-store";

interface SweepEntry {
  id: string;
  total_created: number;
  total_pruned: number;
  duration_ms: number;
  timestamp: string;
}

const MAX_ENTRIES = 20;

export const R2AutoRelNode = memo(({ id }: { id: string }) => {
  const nodeData = useNodesData(id);
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;
  const lastSeenRef = useRef<string | null>(null);
  const [sweeps, setSweeps] = useState<SweepEntry[]>([]);
  const flushCounter = useCanvasStore((s) => s.flushCounter);

  useEffect(() => {
    const created = Number(data.total_edges_created ?? 0);
    const pruned = Number(data.total_edges_pruned ?? 0);
    const dur = Number(data.duration_ms ?? 0);
    const eventKey = `${created}:${pruned}:${dur}`;
    if (eventKey === "0:0:0" || eventKey === lastSeenRef.current) return;
    lastSeenRef.current = eventKey;

    const entry: SweepEntry = {
      id: `sweep-${Date.now()}`,
      total_created: created,
      total_pruned: pruned,
      duration_ms: dur,
      timestamp: new Date().toLocaleTimeString(),
    };

    setSweeps((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
  }, [data.total_edges_created, data.total_edges_pruned, data.duration_ms]);

  useEffect(() => {
    if (flushCounter === 0) return;
    setSweeps([]);
  }, [flushCounter]);

  const totalCreated = sweeps.reduce((acc, s) => acc + s.total_created, 0);
  const totalPruned = sweeps.reduce((acc, s) => acc + s.total_pruned, 0);

  return (
    <BaseNodeShell label="AutoRel Status" category="scoring">
      <div style={{ width: 360 }}>
        <div className="flex justify-between text-xs text-neutral-400 mb-1">
          <span>Sweeps: <span className="text-neutral-200">{sweeps.length}</span></span>
          <span>Created: <span className="text-emerald-400">+{totalCreated}</span></span>
          <span>Pruned: <span className="text-red-400">-{totalPruned}</span></span>
        </div>
        <div className="border-t border-neutral-800 mt-2 pt-2">
          {sweeps.length > 0 ? (
            <div className="space-y-1 max-h-[280px] overflow-y-auto scrollbar-thin pr-0.5">
              {sweeps.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded border border-neutral-700 bg-neutral-800/50 px-2 py-1 text-xs">
                  <span className="text-neutral-500">{s.timestamp}</span>
                  <span className="text-emerald-400">+{s.total_created}</span>
                  <span className="text-red-400">-{s.total_pruned}</span>
                  <span className="text-neutral-400">{(s.duration_ms / 1000).toFixed(1)}s</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-2 text-center text-[10px] text-neutral-500">Waiting for sweeps...</div>
          )}
        </div>
      </div>
    </BaseNodeShell>
  );
});
R2AutoRelNode.displayName = "R2AutoRelNode";
