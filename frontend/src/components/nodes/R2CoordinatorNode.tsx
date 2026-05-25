import { memo, useEffect, useRef, useState } from "react";
import { useNodesData } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { PaperPoolSection, type PoolPaper } from "./PaperPoolSection";
import { useLinkForgeStore } from "../../packs/link-forge/store";

const LIFECYCLE_STAGES = ["triaged", "script_generated", "experiment_started", "experiment_completed", "promoted"] as const;

const STAGE_SHORT: Record<string, string> = {
  triaged: "T",
  script_generated: "S",
  experiment_started: "R",
  experiment_completed: "C",
  promoted: "P",
};

const VERDICT_COLORS: Record<string, string> = {
  HIT: "bg-emerald-900/60 text-emerald-400",
  NEAR_MISS: "bg-amber-900/60 text-amber-400",
  NULL: "bg-red-900/60 text-red-400",
  INCONCLUSIVE: "bg-neutral-800 text-neutral-400",
};

interface PaperState {
  arxiv_id: string;
  stages: Set<string>;
  fe_count?: number;
  hypothesis_count?: number;
  auroc?: number;
  verdict?: string;
}

const MAX_PAPERS = 50;

export const R2CoordinatorNode = memo(({ id, selected }: { id: string; selected?: boolean }) => {
  const nodeData = useNodesData(id);
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;
  const lastEventRef = useRef<string>("");
  const [papers, setPapers] = useState<PaperState[]>([]);
  const starredPapers = useLinkForgeStore((s) => s.starredPapers);
  const flushCounter = useLinkForgeStore((s) => s.flushCounter);

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
        (s) => data[s] === true || data[s] === "true",
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

  useEffect(() => {
    if (flushCounter === 0) return;
    setPapers((prev) => prev.filter((p) => starredPapers.has(p.arxiv_id)));
  }, [flushCounter, starredPapers]);

  const completed = papers.filter((p) => p.stages.has("experiment_completed")).length;
  const promoted = papers.filter((p) => p.stages.has("promoted")).length;

  const poolPapers: PoolPaper[] = papers.map((p) => {
    const badges: PoolPaper["badges"] = [];
    for (const stage of LIFECYCLE_STAGES) {
      badges!.push({
        text: STAGE_SHORT[stage],
        className: p.stages.has(stage)
          ? "bg-emerald-900/60 text-emerald-400"
          : "bg-neutral-800 text-neutral-600",
      });
    }
    if (p.verdict) {
      badges!.push({
        text: p.verdict,
        className: VERDICT_COLORS[p.verdict] ?? "bg-neutral-800 text-neutral-400",
      });
    }
    return {
      id: p.arxiv_id,
      label: p.arxiv_id,
      sublabel: p.auroc != null ? `AUROC: ${p.auroc.toFixed(2)}` : undefined,
      badges,
    };
  });

  return (
    <BaseNodeShell selected={selected} label="Research Coordinator" category="scoring">
      <div style={{ width: 360 }}>
        <div className="flex justify-between text-xs text-neutral-400 mb-1">
          <span>Papers: <span className="text-neutral-200">{papers.length}</span></span>
          <span>Completed: <span className="text-emerald-400">{completed}</span></span>
          <span>Promoted: <span className="text-amber-400">{promoted}</span></span>
        </div>
        <PaperPoolSection papers={poolPapers} emptyText="Waiting for research events..." />
      </div>
    </BaseNodeShell>
  );
});
R2CoordinatorNode.displayName = "R2CoordinatorNode";
