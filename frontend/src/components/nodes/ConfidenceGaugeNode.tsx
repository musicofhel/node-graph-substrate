import { memo } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/nodes/registry";

type GaugeData = {
  confidence?: number;
  mode?: string;
};

function gaugeColor(v: number): string {
  if (v >= 0.7) return "#10b981";
  if (v >= 0.4) return "#f59e0b";
  return "#ef4444";
}

const ARC_R = 50;
const CX = 60;
const CY = 60;

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

export const ConfidenceGaugeNode = memo(({ id }: NodeProps) => {
  const nodeData = useNodesData<Node<GaugeData>>(id);
  const confidence = nodeData?.data?.confidence;
  const mode = nodeData?.data?.mode ?? "—";
  const def = NODE_REGISTRY.confidence_gauge;

  return (
    <BaseNodeShell label={def.label} category={def.category}>
      <div className="flex flex-col items-center" style={{ width: 120 }}>
        {confidence !== undefined ? (
          <>
            <svg width={120} height={70} viewBox="0 0 120 70">
              {/* Background arc */}
              <path
                d={describeArc(1)}
                fill="none"
                stroke="#333"
                strokeWidth={8}
                strokeLinecap="round"
              />
              {/* Value arc */}
              <path
                d={describeArc(confidence)}
                fill="none"
                stroke={gaugeColor(confidence)}
                strokeWidth={8}
                strokeLinecap="round"
              />
              <text
                x={CX}
                y={CY - 5}
                textAnchor="middle"
                fill={gaugeColor(confidence)}
                fontSize={22}
                fontWeight="bold"
                fontFamily="monospace"
              >
                {(confidence * 100).toFixed(0)}%
              </text>
            </svg>
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
