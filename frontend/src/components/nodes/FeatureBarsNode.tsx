import { memo } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/nodes/registry";
import { useDriftStore, useNodeDrift } from "../../lib/store/drift-store";
import { Sparkline } from "./Sparkline";

const FEATURE_NAMES = [
  "H0_persistence_entropy",
  "H1_max_lifetime",
  "H0_total_persistence",
  "H0_n_features",
  "H1_persistence_entropy",
  "H1_n_features",
  "H2_n_features",
  "H2_total_persistence",
  "H2_persistence_entropy",
  "bridge_silhouette",
  "H0_ph_significance",
  "H1_ph_significance",
  "topological_sensitivity",
] as const;

const FEATURE_COLORS: Record<string, string> = {
  H0_persistence_entropy: "#58a6ff",
  H1_max_lifetime: "#22d3ee",
  H0_total_persistence: "#58a6ff",
  H0_n_features: "#58a6ff",
  H1_persistence_entropy: "#22d3ee",
  H1_n_features: "#22d3ee",
  H2_n_features: "#a78bfa",
  H2_total_persistence: "#a78bfa",
  H2_persistence_entropy: "#a78bfa",
  bridge_silhouette: "#ffd700",
  H0_ph_significance: "#4ade80",
  H1_ph_significance: "#4ade80",
  topological_sensitivity: "#f87171",
};

type FeatureData = {
  features?: Record<string, number>;
};

export const FeatureBarsNode = memo(({ id }: NodeProps) => {
  const nodeData = useNodesData<Node<FeatureData>>(id);
  const features = nodeData?.data?.features;
  const def = NODE_REGISTRY.feature_bars;
  const drift = useNodeDrift(id);
  const history = useDriftStore((s) => s.histories.get(id));

  if (!features) {
    return (
      <BaseNodeShell
        label={def.label}
        category={def.category}
        inputs={def.inputs}
      >
        <div className="text-xs text-neutral-500">Waiting for data...</div>
      </BaseNodeShell>
    );
  }

  const maxAbs = Math.max(
    1,
    ...Object.values(features).map((v) => Math.abs(v)),
  );

  return (
    <BaseNodeShell
      label={def.label}
      category={def.category}
      inputs={def.inputs}
      healthStatus={drift?.worst}
    >
      <div className="flex w-[320px] flex-col gap-0.5">
        {FEATURE_NAMES.map((name) => {
          const val = features[name] ?? 0;
          const pct = Math.abs(val) / maxAbs;
          const color = FEATURE_COLORS[name] ?? "#888";
          const shortName = name.replace(/_/g, " ").replace(/persistence /g, "p.");
          const featureHistory = history?.map((h) => h.values[name]).filter((v): v is number => v !== undefined) ?? [];

          return (
            <div key={name} className="flex items-center gap-1">
              <span
                className="w-[100px] truncate text-right text-[10px] text-neutral-400"
                title={name}
              >
                {shortName}
              </span>
              <div className="relative h-3 flex-1 rounded-sm bg-neutral-800">
                <div
                  className="absolute top-0 h-full rounded-sm"
                  style={{
                    width: `${pct * 100}%`,
                    backgroundColor: color,
                    left: val >= 0 ? 0 : undefined,
                    right: val < 0 ? 0 : undefined,
                    opacity: 0.85,
                  }}
                />
              </div>
              {featureHistory.length > 1 && (
                <Sparkline values={featureHistory} width={40} height={12} color={color} />
              )}
              <span className="w-[40px] text-right font-mono text-[10px] text-neutral-400">
                {val.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </BaseNodeShell>
  );
});
FeatureBarsNode.displayName = "FeatureBarsNode";
