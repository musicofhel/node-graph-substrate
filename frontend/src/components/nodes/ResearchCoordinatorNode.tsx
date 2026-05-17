import { memo, useEffect, useRef, useState } from "react";
import { useNodesData } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";

const LIFECYCLE_STAGES = ["triaged", "script_generated", "experiment_started", "experiment_completed", "promoted"] as const;

const STAGE_SHORT: Record<string, string> = {
  triaged: "T",
  script_generated: "S",
  experiment_started: "R",
  experiment_completed: "C",
  promoted: "P",
};

const VERDICT_COLORS: Record<string, string> = {
  HIT: "text-emerald-400",
  NEAR_MISS: "text-amber-400",
  NULL: "text-red-400",
  INCONCLUSIVE: "text-neutral-400",
};

interface PaperState {
  arxiv_id: string;
  stages: Set<string>;
  fe_count?: number;
  hypothesis_count?: number;
  auroc?: number;
  verdict?: string;
}

const MAX_PAPERS = 20;

export const ResearchCoordinatorNode = memo(({ id, selected }: { id: string; selected?: boolean }) => {
  const nodeData = useNodesData(id);
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;
  const lastEventRef = useRef<string>("");
  const [papers, setPapers] = useState<PaperState[]>([]);

  useEffect(() => {
    const arxivId = typeof data.arxiv_id === "string" ? data.arxiv_id : "";
    if (!arxivId) return;

    const eventKey = arxivId + ":" + String(data.fe_id ?? "") + ":" + String(data.fe_count ?? "") + ":" + String(data.auroc ?? "") + ":" + String(data.verdict ?? "");
    if (eventKey === lastEventRef.current) return;
    lastEventRef.current = eventKey;

    setPapers((prev) => {
      const idx = prev.findIndex((p) => p.arxiv_id === arxivId);
      const existing = idx >= 0 ? prev[idx] : { arxiv_id: arxivId, stages: new Set<string>() };
      const updated = { ...existing, stages: new Set(existing.stages) };

      for (const stage of LIFECYCLE_STAGES) {
        if (data[stage] === true || data[stage] === "true") {
          updated.stages.add(stage);
        }
      }

      if (typeof data.fe_count === "number") updated.fe_count = data.fe_count;
      if (typeof data.hypothesis_count === "number") updated.hypothesis_count = data.hypothesis_count;

      const auroc = Number(data.auroc);
      if (!isNaN(auroc) && data.auroc != null) updated.auroc = auroc;
      if (typeof data.verdict === "string" && data.verdict) updated.verdict = data.verdict;

      const currentStage = LIFECYCLE_STAGES.find(
        (s) => data[s] === true || data[s] === "true"
      ) ?? (typeof data.status === "string" ? data.status : "");
      if (currentStage) updated.stages.add(currentStage);

      if (idx >= 0) {
        const next = [...prev];
        next.splice(idx, 1);
        return [updated, ...next].slice(0, MAX_PAPERS);
      }
      return [updated, ...prev].slice(0, MAX_PAPERS);
    });
  }, [data]);

  return (
    <BaseNodeShell selected={selected} label="Research Coordinator" category="scoring">
      <div style={{ width: 240, maxHeight: 240, overflowY: "auto" }} className="scrollbar-thin">
        {papers.length > 0 ? (
          <div className="space-y-1.5">
            {papers.map((p) => (
              <div key={p.arxiv_id} className="rounded border border-neutral-700 bg-neutral-800/50 px-2 py-1">
                <div className="text-xs font-mono text-emerald-400 truncate">{p.arxiv_id}</div>
                <div className="flex items-center gap-0.5 mt-0.5">
                  {LIFECYCLE_STAGES.map((stage) => (
                    <span
                      key={stage}
                      title={stage}
                      className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold ${
                        p.stages.has(stage)
                          ? "bg-emerald-900/60 text-emerald-400"
                          : "bg-neutral-800 text-neutral-600"
                      }`}
                    >
                      {STAGE_SHORT[stage]}
                    </span>
                  ))}
                  {p.auroc != null && (
                    <span className="ml-auto text-[10px] text-neutral-400">
                      {p.auroc.toFixed(2)}
                    </span>
                  )}
                  {p.verdict && (
                    <span className={`text-[10px] font-medium ${VERDICT_COLORS[p.verdict] ?? "text-neutral-400"}`}>
                      {p.verdict}
                    </span>
                  )}
                </div>
              </div>
            ))}
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
