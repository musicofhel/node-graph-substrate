import { memo } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/pack-registry";
import { useDriftStore, useNodeDrift } from "../../lib/store/drift-store";
import { Sparkline } from "./Sparkline";
import { useZoomTier } from "../../lib/hooks/useZoomTier";

type GaugeData = {
  confidence?: number;
  mode?: string;
};

const VIRIDIS_STEPS = [
  "var(--ngs-viridis-0)",
  "var(--ngs-viridis-1)",
  "var(--ngs-viridis-2)",
  "var(--ngs-viridis-3)",
  "var(--ngs-viridis-4)",
];

function viridisColor(v: number): string {
  const bin = Math.min(4, Math.floor(v * 5));
  return VIRIDIS_STEPS[bin];
}

const ARC_R = 70;
const CX = 90;
const CY = 80;
const SVG_W = 180;
const SVG_H = 100;
const ARC_LEN = Math.PI * ARC_R;

function describeArc(pct: number): string {
  const startAngle = Math.PI;
  const endAngle = Math.PI + Math.PI * pct;
  const x1 = CX + ARC_R * Math.cos(startAngle);
  const y1 = CY + ARC_R * Math.sin(startAngle);
  const x2 = CX + ARC_R * Math.cos(endAngle);
  const y2 = CY + ARC_R * Math.sin(endAngle);
  const largeArc = pct > 0.5 ? 1 : 0;
  return `M ${x1} ${y1} A ${ARC_R} ${ARC_R} 0 ${largeArc} 1 ${x2} ${y2}`;
}

const FULL_ARC = describeArc(1);

export const ConfidenceGaugeNode = memo(({ id, selected }: NodeProps) => {
  const nodeData = useNodesData<Node<GaugeData>>(id);
  const rawConf = nodeData?.data?.confidence;
  const confidence = rawConf !== undefined ? Math.max(0, Math.min(1, rawConf)) : undefined;
  const mode = nodeData?.data?.mode ?? "—";
  const def = NODE_REGISTRY.confidence_gauge;
  const history = useDriftStore((s) => s.histories.get(id));
  const confidenceValues = history?.map((h) => h.values.confidence).filter((v): v is number => v !== undefined) ?? [];
  const drift = useNodeDrift(id);
  const tier = useZoomTier();

  const dashOffset = confidence !== undefined ? ARC_LEN * (1 - confidence) : ARC_LEN;
  const color = confidence !== undefined ? viridisColor(confidence) : "#666";
  const pctText = confidence !== undefined ? `${(confidence * 100).toFixed(0)}%` : null;
  const ariaLabel = `Confidence gauge: ${pctText ?? "no data"}`;

  if (tier === "T0") {
    return (
      <BaseNodeShell selected={selected} label={def.label} category={def.category} inputs={def.inputs} healthStatus={drift?.worst} minWidth={240} minHeight={200} ariaLabel={ariaLabel}>
        <div className="flex h-full w-full items-center justify-center rounded" style={{ background: color, minHeight: 80 }} />
      </BaseNodeShell>
    );
  }

  if (tier === "T1") {
    return (
      <BaseNodeShell selected={selected} label={def.label} category={def.category} inputs={def.inputs} healthStatus={drift?.worst} minWidth={240} minHeight={200} ariaLabel={ariaLabel}>
        <div className="flex h-full w-full items-center justify-center rounded" style={{ background: color, minHeight: 80 }}>
          {pctText && <span className="ngs-text-title text-white">{pctText}</span>}
        </div>
      </BaseNodeShell>
    );
  }

  if (tier === "T2") {
    return (
      <BaseNodeShell selected={selected} label={def.label} category={def.category} inputs={def.inputs} healthStatus={drift?.worst} minWidth={240} minHeight={200} ariaLabel={ariaLabel}>
        <div className="flex w-full flex-col items-center">
          {confidence !== undefined ? (
            <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="xMidYMid meet">
              <path d={FULL_ARC} fill="none" stroke="#333" strokeWidth={8} strokeLinecap="round" />
              <path
                d={FULL_ARC}
                fill="none"
                stroke={color}
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={ARC_LEN}
                strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 0.7s ease-out, stroke 0.7s ease-out" }}
              />
              <text
                x={CX}
                y={CY - 2}
                textAnchor="middle"
                fill={color}
                fontSize={16}
                fontWeight="bold"
                className="ngs-tabular"
                style={{ transition: "fill 0.7s ease-out" }}
              >
                {pctText}
              </text>
            </svg>
          ) : (
            <div className="ngs-text-body py-4 text-neutral-500">Waiting...</div>
          )}
        </div>
      </BaseNodeShell>
    );
  }

  return (
    <BaseNodeShell selected={selected} label={def.label} category={def.category} inputs={def.inputs} healthStatus={drift?.worst} minWidth={240} minHeight={200} ariaLabel={ariaLabel}>
      <div className="flex w-full flex-col items-center">
        {confidence !== undefined ? (
          <>
            <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="xMidYMid meet">
              <path d={FULL_ARC} fill="none" stroke="#333" strokeWidth={8} strokeLinecap="round" />
              <path
                d={FULL_ARC}
                fill="none"
                stroke={color}
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={ARC_LEN}
                strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 0.7s ease-out, stroke 0.7s ease-out" }}
              />
              <text
                x={CX}
                y={CY - 2}
                textAnchor="middle"
                fill={color}
                fontSize={16}
                fontWeight="bold"
                className="ngs-tabular"
                style={{ transition: "fill 0.7s ease-out" }}
              >
                {pctText}
              </text>
            </svg>
            <div aria-label="Confidence sparkline">
              <Sparkline values={confidenceValues} width={240} height={36} color="var(--ngs-sign-pos)" />
            </div>
            <span className="ngs-text-meta mt-1 text-neutral-500">{mode}</span>
            {confidenceValues.length > 1 && (
              <div className="ngs-text-micro ngs-tabular mt-1.5 flex w-full justify-between text-neutral-500">
                <span>min {(Math.min(...confidenceValues) * 100).toFixed(0)}%</span>
                <span>avg {((confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length) * 100).toFixed(0)}%</span>
                <span>max {(Math.max(...confidenceValues) * 100).toFixed(0)}%</span>
              </div>
            )}
          </>
        ) : (
          <div className="ngs-text-body py-4 text-neutral-500">Waiting...</div>
        )}
      </div>
    </BaseNodeShell>
  );
});
ConfidenceGaugeNode.displayName = "ConfidenceGaugeNode";
