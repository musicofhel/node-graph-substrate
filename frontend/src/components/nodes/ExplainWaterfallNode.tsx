import { memo } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/nodes/registry";

type FeatureExplain = {
  raw_value: number;
  scaled_value: number;
  coefficient: number;
  contribution: number;
};

type ExplainData = {
  confidence?: number;
  features?: Record<string, FeatureExplain>;
  top_contributor?: string;
};

export const ExplainWaterfallNode = memo(({ id }: NodeProps) => {
  const nodeData = useNodesData<Node<ExplainData>>(id);
  const data = nodeData?.data ?? {};
  const def = NODE_REGISTRY.explain_waterfall;

  if (!data.features) {
    return (
      <BaseNodeShell label={def.label} category={def.category}>
        <div className="py-4 text-center text-xs text-neutral-500">
          Requires calibration
        </div>
      </BaseNodeShell>
    );
  }

  const entries = Object.entries(data.features).sort(
    ([, a], [, b]) => Math.abs(b.contribution) - Math.abs(a.contribution),
  );
  const maxAbs = Math.max(
    0.01,
    ...entries.map(([, f]) => Math.abs(f.contribution)),
  );

  return (
    <BaseNodeShell label={def.label} category={def.category}>
      <div className="flex w-[300px] flex-col gap-0.5">
        {entries.map(([name, feat]) => {
          const pct = Math.abs(feat.contribution) / maxAbs;
          const isPositive = feat.contribution >= 0;
          const isTop = name === data.top_contributor;
          const shortName = name.replace(/_/g, " ").replace(/persistence /g, "p.");

          return (
            <div key={name} className="flex items-center gap-1">
              <span
                className={`w-[100px] truncate text-right text-[10px] ${
                  isTop ? "font-bold text-amber-300" : "text-neutral-400"
                }`}
                title={name}
              >
                {shortName}
                {isTop && " ★"}
              </span>
              <div className="relative h-3 flex-1 rounded-sm bg-neutral-800">
                <div
                  className="absolute top-0 h-full rounded-sm"
                  style={{
                    width: `${pct * 100}%`,
                    backgroundColor: isPositive ? "#4ade80" : "#f87171",
                    opacity: 0.85,
                  }}
                />
              </div>
              <span className="w-[45px] text-right font-mono text-[10px] text-neutral-400">
                {feat.contribution >= 0 ? "+" : ""}
                {feat.contribution.toFixed(3)}
              </span>
            </div>
          );
        })}
        {data.confidence !== undefined && (
          <div className="mt-1 text-right text-[10px] text-neutral-400">
            conf: {(data.confidence * 100).toFixed(1)}%
          </div>
        )}
      </div>
    </BaseNodeShell>
  );
});
ExplainWaterfallNode.displayName = "ExplainWaterfallNode";
