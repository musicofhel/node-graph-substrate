import { memo } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/pack-registry";
import { useDriftStore, useNodeDrift } from "../../lib/store/drift-store";
import { Sparkline } from "./Sparkline";
import { FEATURES, FEATURE_META } from "../../packs/topo-confidence/features";
import { useZoomTier } from "../../lib/hooks/useZoomTier";

type FeatureData = {
  features?: Record<string, number>;
};

export const FeatureBarsNode = memo(({ id, selected }: NodeProps) => {
  const nodeData = useNodesData<Node<FeatureData>>(id);
  const features = nodeData?.data?.features;
  const def = NODE_REGISTRY.feature_bars;
  const drift = useNodeDrift(id);
  const history = useDriftStore((s) => s.histories.get(id));
  const tier = useZoomTier();

  const featureCount = features ? Object.keys(features).length : 0;
  const ariaLabel = `Feature bars: ${featureCount} features`;

  const shell = (children: React.ReactNode) => (
    <BaseNodeShell
      selected={selected}
      label={def.label}
      category={def.category}
      inputs={def.inputs}
      healthStatus={drift?.worst}
      minWidth={240}
      minHeight={280}
      ariaLabel={ariaLabel}
    >
      {children}
    </BaseNodeShell>
  );

  if (!features) {
    return shell(
      <div className="ngs-text-body text-neutral-500">Waiting for data...</div>
    );
  }

  if (tier === "T0") {
    return shell(
      <div className="flex h-full w-full items-center justify-center rounded" style={{ background: "var(--ngs-viridis-2)", minHeight: 80 }} />
    );
  }

  if (tier === "T1") {
    return shell(
      <div className="flex h-full w-full items-center justify-center rounded" style={{ background: "var(--ngs-viridis-2)", minHeight: 80 }}>
        <span className="ngs-text-title text-white">Feature Bars</span>
      </div>
    );
  }

  const maxAbs = Math.max(
    1,
    ...Object.values(features).map((v) => Math.abs(v)),
  );

  if (tier === "T2") {
    return shell(
      <div className="flex w-full flex-col gap-0.5">
        {FEATURES.map((name) => {
          const val = features[name] ?? 0;
          const pct = Math.abs(val) / maxAbs;
          const color = val >= 0 ? "var(--ngs-sign-pos)" : "var(--ngs-sign-neg)";
          return (
            <div key={name} className="flex items-center">
              <div className="relative h-3 flex-1 rounded-sm bg-neutral-800">
                <div
                  className="absolute top-0 h-full rounded-sm transition-all duration-700 ease-out"
                  style={{
                    width: `${pct * 100}%`,
                    backgroundColor: color,
                    left: val >= 0 ? 0 : undefined,
                    right: val < 0 ? 0 : undefined,
                    opacity: 0.85,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return shell(
    <div className="flex w-full flex-col gap-0.5">
      {FEATURES.map((name) => {
        const val = features[name] ?? 0;
        const pct = Math.abs(val) / maxAbs;
        const color = val >= 0 ? "var(--ngs-sign-pos)" : "var(--ngs-sign-neg)";
        const meta = FEATURE_META[name];
        const featureHistory = history?.map((h) => h.values[name]).filter((v): v is number => v !== undefined) ?? [];

        return (
          <div key={name} className="flex items-center gap-1">
            <span
              className="ngs-text-meta w-[100px] truncate text-right text-neutral-400"
              title={name}
            >
              {meta.shortName}
            </span>
            <div className="relative h-3 flex-1 rounded-sm bg-neutral-800">
              <div
                className="absolute top-0 h-full rounded-sm transition-all duration-700 ease-out"
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
            <span className="ngs-text-meta ngs-tabular w-[40px] text-right text-neutral-400">
              {val.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
});
FeatureBarsNode.displayName = "FeatureBarsNode";
