import { memo, useEffect, useRef, useState } from "react";
import { useNodesData } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { PaperPoolSection, type PoolPaper } from "./PaperPoolSection";
import { useLinkForgeStore } from "../../packs/link-forge/store";

interface BridgedPaper {
  queue_id: string;
  arxiv_id: string;
  research_relevant: boolean;
  relevance_note: string;
}

const MAX_ENTRIES = 100;

export const R2BridgeNode = memo(({ id, selected }: { id: string; selected?: boolean }) => {
  const nodeData = useNodesData(id);
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;
  const lastSeenRef = useRef<string | null>(null);
  const [papers, setPapers] = useState<BridgedPaper[]>([]);
  const starredPapers = useLinkForgeStore((s) => s.starredPapers);
  const flushCounter = useLinkForgeStore((s) => s.flushCounter);

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

  useEffect(() => {
    if (flushCounter === 0) return;
    setPapers((prev) => prev.filter((p) => starredPapers.has(p.arxiv_id || p.queue_id)));
  }, [flushCounter, starredPapers]);

  const total = papers.length;
  const relevant = papers.filter((p) => p.research_relevant).length;

  const poolPapers: PoolPaper[] = papers.map((p) => ({
    id: p.arxiv_id || p.queue_id,
    label: p.arxiv_id || `#${p.queue_id}`,
    sublabel: p.relevance_note,
    badges: [
      {
        text: p.research_relevant ? "relevant" : "not relevant",
        className: p.research_relevant
          ? "bg-emerald-900/60 text-emerald-400"
          : "bg-neutral-800 text-neutral-500",
      },
    ],
  }));

  return (
    <BaseNodeShell selected={selected} label="Research Bridge" category="input">
      <div className="w-full min-w-[320px]">
        <div className="flex justify-between text-xs text-neutral-400 mb-1">
          <span>Bridged: <span className="text-neutral-200">{total}</span></span>
          <span>Relevant: <span className="text-emerald-400">{relevant}</span></span>
        </div>
        <PaperPoolSection papers={poolPapers} emptyText="Waiting for bridge events..." />
      </div>
    </BaseNodeShell>
  );
});
R2BridgeNode.displayName = "R2BridgeNode";
