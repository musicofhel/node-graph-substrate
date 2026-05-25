import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/pack-registry";
import { useFindings } from "../../packs/experiments/hooks/useExperimentData";

const STRENGTH_COLORS: Record<string, string> = {
  STRONG: "bg-emerald-600",
  MODERATE: "bg-amber-600",
  PRELIMINARY: "bg-neutral-600",
};

export const FindingsSummaryNode = memo(({ selected }: NodeProps) => {
  const def = NODE_REGISTRY.findings_summary;
  const { findings, loading } = useFindings();

  return (
    <BaseNodeShell selected={selected} label={def.label} category={def.category}>
      <div className="nodrag" style={{ minWidth: 300, maxHeight: 360, overflowY: "auto" }}>
        {loading ? (
          <div className="text-[10px] text-neutral-500">Loading findings...</div>
        ) : findings.length === 0 ? (
          <div className="text-[10px] text-neutral-500">No findings found</div>
        ) : (
          <div className="flex flex-col gap-1">
            {findings.map((f) => (
              <div key={f.id} className="flex items-start gap-1.5 px-2 py-1 rounded bg-neutral-800/50">
                <span className="text-[10px] font-mono font-bold text-cyan-400 shrink-0 w-8">
                  {f.id}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] text-neutral-300 leading-tight">
                    {f.headline}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`text-[8px] px-1 py-0.5 rounded text-white ${STRENGTH_COLORS[f.strength] ?? "bg-neutral-600"}`}>
                      {f.strength}
                    </span>
                    {f.key_auroc != null && (
                      <div className="flex items-center gap-0.5">
                        <span className="text-[8px] text-neutral-500">AUROC</span>
                        <span className="text-[9px] font-mono text-neutral-300">{f.key_auroc.toFixed(4)}</span>
                        <div className="w-16 h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-500 rounded-full"
                            style={{ width: `${Math.min(f.key_auroc * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </BaseNodeShell>
  );
});
FindingsSummaryNode.displayName = "FindingsSummaryNode";
