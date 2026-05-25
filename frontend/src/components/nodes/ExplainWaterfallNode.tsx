import { memo, useState } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/pack-registry";

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
  correctness?: boolean | null;
  subject?: string;
  level?: number | string;
  math_idx?: number;
  top_n?: number;
  sort_order?: string;
};

type FeatureInfo = {
  label: string;
  description: string;
  high: string;
  low: string;
};

const FEATURE_INFO: Record<string, FeatureInfo> = {
  H0_persistence_entropy: {
    label: "Component Entropy",
    description: "Diversity of connected components in the hidden state point cloud.",
    high: "Exploring multiple reasoning paths simultaneously.",
    low: "Dominated by few concentrated clusters.",
  },
  H1_max_lifetime: {
    label: "Loop Stability",
    description: "Longest-lived topological loop in hidden state space.",
    high: "Sustained internal verification cycles — revisiting and refining.",
    low: "Linear progression without revisiting.",
  },
  H0_total_persistence: {
    label: "Component Mass",
    description: "Total topological structure at the connected-component level.",
    high: "Rich sub-problem decomposition.",
    low: "Minimal structural differentiation.",
  },
  H0_n_features: {
    label: "Component Count",
    description: "Number of distinct connected components detected.",
    high: "Many separate representation clusters.",
    low: "Few, merged representation regions.",
  },
  H1_persistence_entropy: {
    label: "Loop Diversity",
    description: "Diversity of 1-dimensional loops/cycles in hidden states.",
    high: "Multiple reasoning loops at varying scale.",
    low: "Dominated by a single cyclic pattern.",
  },
  H1_n_features: {
    label: "Loop Count",
    description: "Number of independent topological loops detected.",
    high: "Complex multi-loop reasoning structure.",
    low: "Simple or linear reasoning path.",
  },
  H2_n_features: {
    label: "Void Count",
    description: "Number of 2-dimensional voids (cavities) in topology.",
    high: "Higher-order structural complexity.",
    low: "Simpler topological structure.",
  },
  H2_total_persistence: {
    label: "Void Mass",
    description: "Total persistence of 2-dimensional cavities.",
    high: "Significant higher-order features present.",
    low: "Higher-order topology negligible.",
  },
  H2_persistence_entropy: {
    label: "Void Diversity",
    description: "Diversity of 2-dimensional topological cavities.",
    high: "Multiple distinct higher-order structures.",
    low: "Few or no cavities.",
  },
  bridge_silhouette: {
    label: "Bridge Quality",
    description: "Separation quality between hidden state clusters.",
    high: "Clean, well-separated cluster bridges.",
    low: "Poorly separated or overlapping clusters.",
  },
  H0_ph_significance: {
    label: "Component Significance",
    description: "Statistical significance of H0 topological features.",
    high: "Components are statistically meaningful.",
    low: "Structure may be noise.",
  },
  H1_ph_significance: {
    label: "Loop Significance",
    description: "Statistical significance of H1 topological features.",
    high: "Loops are genuine structural features.",
    low: "Loop patterns may be spurious.",
  },
  topological_sensitivity: {
    label: "Sensitivity",
    description: "Overall sensitivity of topology to perturbation.",
    high: "Topology is fragile — small changes cause big shifts.",
    low: "Stable, robust structure.",
  },
};

function getValueLevel(raw: number): "high" | "moderate" | "low" {
  if (raw > 1.5) return "high";
  if (raw < -0.5) return "low";
  return "moderate";
}

function sortEntries(
  entries: [string, FeatureExplain][],
  order: string,
): [string, FeatureExplain][] {
  const sorted = [...entries];
  switch (order) {
    case "positive_first":
      return sorted.sort((a, b) => b[1].contribution - a[1].contribution);
    case "negative_first":
      return sorted.sort((a, b) => a[1].contribution - b[1].contribution);
    case "alpha":
      return sorted.sort((a, b) => a[0].localeCompare(b[0]));
    default:
      return sorted.sort(
        (a, b) => Math.abs(b[1].contribution) - Math.abs(a[1].contribution),
      );
  }
}

export const ExplainWaterfallNode = memo(({ id, selected }: NodeProps) => {
  const nodeData = useNodesData<Node<ExplainData>>(id);
  const data = nodeData?.data ?? {};
  const def = NODE_REGISTRY.explain_waterfall;
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!data.features) {
    return (
      <BaseNodeShell selected={selected} label={def.label} category={def.category} inputs={def.inputs}>
        <div className="py-4 text-center text-xs text-neutral-500">
          Requires calibration
        </div>
      </BaseNodeShell>
    );
  }

  const topN = data.top_n ?? 13;
  const sortOrder = data.sort_order ?? "abs_contribution";

  const allEntries = Object.entries(data.features);
  const sorted = sortEntries(allEntries, sortOrder);
  const entries = sorted.slice(0, topN);
  const maxAbs = Math.max(
    0.01,
    ...entries.map(([, f]) => Math.abs(f.contribution)),
  );

  const topName = data.top_contributor;
  const topFeat = topName ? data.features[topName] : null;
  const topInfo = topName ? FEATURE_INFO[topName] : null;

  const topLevel = topFeat ? getValueLevel(topFeat.raw_value) : null;
  const topDirection = topFeat && topFeat.contribution >= 0;

  return (
    <BaseNodeShell selected={selected} label={def.label} category={def.category} inputs={def.inputs}>
      <div className="nodrag flex w-full min-w-[320px] flex-col gap-1">
        {/* Summary header */}
        <div className="mb-1 rounded bg-neutral-800/80 px-2 py-1.5">
          <div className="flex items-center gap-2">
            {data.correctness != null && (
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                  data.correctness
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {data.correctness ? "CORRECT" : "INCORRECT"}
              </span>
            )}
            {data.confidence != null && (
              <span className="text-sm font-bold text-neutral-200">
                {(data.confidence * 100).toFixed(1)}%
              </span>
            )}
            {data.subject && data.level != null && (
              <span className="ml-auto rounded bg-neutral-700 px-1.5 py-0.5 text-[9px] text-neutral-400">
                {data.subject} L{data.level}
                {data.math_idx != null ? ` #${data.math_idx}` : ""}
              </span>
            )}
          </div>
          {topInfo && topFeat && (
            <div className="mt-1 text-[10px] leading-tight text-neutral-400">
              <span className="text-neutral-300">Top signal: </span>
              <span className="font-medium text-amber-300">{topInfo.label}</span>
              <span className="text-neutral-500"> ({topLevel}) </span>
              <span className="text-neutral-500">— </span>
              <span>{topLevel === "high" ? topInfo.high.toLowerCase() : topLevel === "low" ? topInfo.low.toLowerCase() : topInfo.description.toLowerCase()}</span>
              {" "}
              <span className={topDirection ? "text-emerald-400" : "text-red-400"}>
                {topDirection ? "pushing confidence ↑" : "pulling confidence ↓"}
              </span>
            </div>
          )}
        </div>

        {/* Waterfall bars */}
        {entries.map(([name, feat]) => {
          const pct = Math.abs(feat.contribution) / maxAbs;
          const isPositive = feat.contribution >= 0;
          const isTop = name === topName;
          const isExpanded = expanded === name;
          const info = FEATURE_INFO[name];
          const label = info?.label ?? name.replace(/_/g, " ");
          const level = getValueLevel(feat.raw_value);

          return (
            <div key={name}>
              <div
                className={`flex cursor-pointer items-center gap-1 rounded px-0.5 py-0.5 transition-colors hover:bg-neutral-700/40 ${
                  isExpanded ? "bg-neutral-700/30" : ""
                }`}
                onClick={() => setExpanded(isExpanded ? null : name)}
              >
                <span
                  className={`w-[110px] truncate text-right text-[10px] ${
                    isTop ? "font-bold text-amber-300" : "text-neutral-400"
                  }`}
                  title={name}
                >
                  {label}
                  {isTop && " ★"}
                </span>
                <div className="relative h-3 flex-1 rounded-sm bg-neutral-800">
                  <div
                    className="absolute top-0 h-full rounded-sm transition-all duration-700 ease-out"
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

              {/* Expanded detail panel */}
              {isExpanded && info && (
                <div
                  className="mb-1 ml-1 rounded border-l-2 bg-neutral-800/60 px-2.5 py-1.5"
                  style={{ borderColor: isPositive ? "#4ade80" : "#f87171" }}
                >
                  <div className="text-[10px] leading-relaxed text-neutral-400">
                    <div className="mb-1 text-neutral-300">{info.description}</div>
                    <div className="mb-1">
                      <span className="text-neutral-500">Value is </span>
                      <span className={
                        level === "high" ? "text-amber-300" : level === "low" ? "text-blue-300" : "text-neutral-300"
                      }>
                        {level}
                      </span>
                      <span className="text-neutral-500"> — </span>
                      {level === "high" ? info.high : level === "low" ? info.low : info.description}
                    </div>
                    <div className="flex items-center gap-1 font-mono text-[9px] text-neutral-500">
                      <span>raw {feat.raw_value.toFixed(2)}</span>
                      <span>×</span>
                      <span>coef {feat.coefficient.toFixed(3)}</span>
                      <span>=</span>
                      <span className={isPositive ? "text-emerald-400" : "text-red-400"}>
                        {feat.contribution >= 0 ? "+" : ""}{feat.contribution.toFixed(4)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[9px]">
                      <span className={isPositive ? "text-emerald-400" : "text-red-400"}>
                        {isPositive ? "↑ Increases" : "↓ Decreases"} confidence by {Math.abs(feat.contribution).toFixed(3)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </BaseNodeShell>
  );
});
ExplainWaterfallNode.displayName = "ExplainWaterfallNode";
