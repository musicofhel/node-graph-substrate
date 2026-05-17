import { memo, useEffect, useRef, useState } from "react";
import { useNodesData } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";

interface BridgedPaper {
  queue_id: string;
  arxiv_id: string;
  research_relevant: boolean;
  relevance_note: string;
}

const MAX_ENTRIES = 50;

export const ResearchBridgeNode = memo(({ id, selected }: { id: string; selected?: boolean }) => {
  const nodeData = useNodesData(id);
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;
  const lastSeenRef = useRef<string | null>(null);
  const [papers, setPapers] = useState<BridgedPaper[]>([]);

  useEffect(() => {
    const qid = String(data.queue_id ?? "");
    if (!qid || qid === lastSeenRef.current) return;
    lastSeenRef.current = qid;

    const entry: BridgedPaper = {
      queue_id: qid,
      arxiv_id: typeof data.arxiv_id === "string" ? data.arxiv_id : "",
      research_relevant: data.research_relevant === true || data.research_relevant === "true",
      relevance_note: typeof data.relevance_note === "string" ? data.relevance_note : "",
    };

    setPapers((prev) => {
      if (prev.some((p) => p.queue_id === qid)) return prev;
      return [entry, ...prev].slice(0, MAX_ENTRIES);
    });
  }, [data.queue_id, data.arxiv_id, data.research_relevant, data.relevance_note]);

  return (
    <BaseNodeShell selected={selected} label="Research Bridge" category="input">
      <div style={{ width: 230, maxHeight: 200, overflowY: "auto" }} className="scrollbar-thin">
        {papers.length > 0 ? (
          <div className="space-y-1">
            {papers.map((p) => (
              <div key={p.queue_id} className="rounded border border-neutral-700 bg-neutral-800/50 px-2 py-1">
                {p.arxiv_id ? (
                  <div className="text-xs font-mono text-emerald-400 truncate">{p.arxiv_id}</div>
                ) : (
                  <div className="text-xs text-neutral-500">#{p.queue_id}</div>
                )}
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${p.research_relevant ? "bg-emerald-500" : "bg-neutral-600"}`} />
                  <span className="text-[10px] text-neutral-500 truncate">{p.relevance_note}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-3 text-center text-xs text-neutral-500">
            Waiting for bridge events...
          </div>
        )}
      </div>
    </BaseNodeShell>
  );
});
ResearchBridgeNode.displayName = "ResearchBridgeNode";
