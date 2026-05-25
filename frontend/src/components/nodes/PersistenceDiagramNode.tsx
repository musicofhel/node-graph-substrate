import { memo, useMemo } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/pack-registry";

type DiagramData = {
  H0?: number[][];
  H1?: number[][];
  H2?: number[][];
};

const DIM_COLORS: Record<string, string> = {
  H0: "#58a6ff",
  H1: "#22d3ee",
  H2: "#a78bfa",
};

const SVG_SIZE = 250;
const PADDING = 30;

export const PersistenceDiagramNode = memo(({ id, selected }: NodeProps) => {
  const nodeData = useNodesData<Node<DiagramData>>(id);
  const data = nodeData?.data ?? {};
  const def = NODE_REGISTRY.persistence_diagram;

  const { points, maxVal } = useMemo(() => {
    const allPoints: { b: number; d: number; dim: string }[] = [];
    for (const dim of ["H0", "H1", "H2"] as const) {
      const pairs = data[dim] ?? [];
      for (const [b, d] of pairs) {
        if (isFinite(b) && isFinite(d)) {
          allPoints.push({ b, d, dim });
        }
      }
    }
    const max = Math.max(
      1,
      ...allPoints.map((p) => Math.max(p.b, p.d)),
    );
    return { points: allPoints, maxVal: max };
  }, [data]);

  const hasData = points.length > 0;
  const plotSize = SVG_SIZE - PADDING * 2;

  const toX = (v: number) => PADDING + (v / maxVal) * plotSize;
  const toY = (v: number) => SVG_SIZE - PADDING - (v / maxVal) * plotSize;

  return (
    <BaseNodeShell selected={selected} label={def.label} category={def.category} inputs={def.inputs}>
      <div className="w-full min-w-[200px]" style={{ aspectRatio: "1" }}>
        {hasData ? (
          <svg width="100%" height="100%" viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} preserveAspectRatio="xMidYMid meet">
            {/* Axes */}
            <line
              x1={PADDING}
              y1={SVG_SIZE - PADDING}
              x2={SVG_SIZE - PADDING}
              y2={SVG_SIZE - PADDING}
              stroke="#525252"
              strokeWidth={1}
            />
            <line
              x1={PADDING}
              y1={SVG_SIZE - PADDING}
              x2={PADDING}
              y2={PADDING}
              stroke="#525252"
              strokeWidth={1}
            />
            {/* Diagonal (birth = death) */}
            <line
              x1={toX(0)}
              y1={toY(0)}
              x2={toX(maxVal)}
              y2={toY(maxVal)}
              stroke="#404040"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
            {/* Points */}
            {points.map((p) => (
              <circle
                key={`${p.dim}-${p.b.toFixed(4)}-${p.d.toFixed(4)}`}
                cx={toX(p.b)}
                cy={toY(p.d)}
                r={3}
                fill={DIM_COLORS[p.dim]}
                opacity={0.8}
              />
            ))}
            {/* Labels */}
            <text x={SVG_SIZE / 2} y={SVG_SIZE - 5} fill="#666" fontSize={10} textAnchor="middle">
              Birth
            </text>
            <text x={10} y={SVG_SIZE / 2} fill="#666" fontSize={10} textAnchor="middle" transform={`rotate(-90,10,${SVG_SIZE / 2})`}>
              Death
            </text>
            {/* Legend */}
            {(["H0", "H1", "H2"] as const).map((dim, i) => (
              <g key={dim}>
                <circle cx={SVG_SIZE - 50} cy={PADDING + i * 14} r={4} fill={DIM_COLORS[dim]} />
                <text x={SVG_SIZE - 42} y={PADDING + i * 14 + 4} fill="#999" fontSize={9}>
                  {dim}
                </text>
              </g>
            ))}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-500">
            Waiting for PH data...
          </div>
        )}
      </div>
    </BaseNodeShell>
  );
});
PersistenceDiagramNode.displayName = "PersistenceDiagramNode";
