import { memo } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/pack-registry";
import { useDriftStore, useNodeDrift } from "../../lib/store/drift-store";
import { Sparkline } from "./Sparkline";

type GaugeData = {
  confidence?: number;
  mode?: string;
};

function gaugeColor(v: number): string {
  if (v >= 0.7) return "#10b981";
  if (v >= 0.4) return "#f59e0b";
  return "#ef4444";
}

const ARC_R = 46;
const CX = 60;
const CY = 52;
const SVG_W = 120;
const SVG_H = 66;
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

  const dashOffset = confidence !== undefined ? ARC_LEN * (1 - confidence) : ARC_LEN;
  const color = confidence !== undefined ? gaugeColor(confidence) : "#666";

  return (
    <BaseNodeShell selected={selected} label={def.label} category={def.category} inputs={def.inputs} healthStatus={drift?.worst}>
      <div className="flex flex-col items-center" style={{ width: SVG_W }}>
        {confidence !== undefined ? (
          <>
            <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}>
              <path
                d={FULL_ARC}
                fill="none"
                stroke="#333"
                strokeWidth={8}
                strokeLinecap="round"
              />
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
                fontSize={20}
                fontWeight="bold"
                fontFamily="monospace"
                style={{ transition: "fill 0.7s ease-out" }}
              >
                {(confidence * 100).toFixed(0)}%
              </text>
            </svg>
            <Sparkline values={confidenceValues} width={120} height={24} color="#10b981" />
            <span className="text-[10px] text-neutral-500">{mode}</span>
          </>
        ) : (
          <div className="py-4 text-xs text-neutral-500">Waiting...</div>
        )}
      </div>
    </BaseNodeShell>
  );
});
ConfidenceGaugeNode.displayName = "ConfidenceGaugeNode";
