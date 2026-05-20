import { memo, useState } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/nodes/registry";

type BreathingData = {
  prompt_id?: string;
  heatmap?: number[][];
  l19_values?: number[];
  correctness?: boolean;
  collapse_ratio?: number;
  math_prompt?: string;
  subject?: string;
  level?: number | string;
  math_idx?: number;
};

const POSITIONS = ["prefill", "pos 1", "pos 10", "pos 25", "pos 50", "pos 100", "pos 200", "final"];
const NUM_LAYERS = 28;
const L19 = 19;

const GRID_X = 56;
const GRID_Y = 8;
const CELL_W = 13;
const CELL_H = 30;
const COL_S = 14;
const ROW_S = 35;
const GRID_H = POSITIONS.length * ROW_S;

const SPARK_X = GRID_X + NUM_LAYERS * COL_S + 8;
const SPARK_W = 36;
const SVG_W = SPARK_X + SPARK_W + 20;
const XLABEL_Y = GRID_Y + GRID_H + 12;
const FOOTER_Y = XLABEL_Y + 14;
const SVG_H = FOOTER_Y + 28;

const COLOR_STOPS: [number, [number, number, number]][] = [
  [0, [0x11, 0x20, 0x40]],
  [5, [0x13, 0x4e, 0x6e]],
  [10, [0x15, 0x5e, 0x75]],
  [15, [0x18, 0x8e, 0x90]],
  [20, [0x2e, 0xc4, 0xa0]],
  [25, [0x6e, 0xe7, 0x8c]],
  [30, [0xa3, 0xe6, 0x35]],
  [35, [0xea, 0xb3, 0x08]],
];

function prToColor(pr: number): string {
  if (pr <= 0) return "#112040";
  if (pr >= 35) return "#eab308";
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const [v0, c0] = COLOR_STOPS[i];
    const [v1, c1] = COLOR_STOPS[i + 1];
    if (pr <= v1) {
      const t = (pr - v0) / (v1 - v0);
      const r = Math.round(c0[0] + t * (c1[0] - c0[0]));
      const g = Math.round(c0[1] + t * (c1[1] - c0[1]));
      const b = Math.round(c0[2] + t * (c1[2] - c0[2]));
      return `rgb(${r},${g},${b})`;
    }
  }
  return "#eab308";
}

const X_LABELS: [number, string, string][] = [
  [0, "L0", "#737373"],
  [5, "L5", "#737373"],
  [10, "L10", "#737373"],
  [15, "L15", "#737373"],
  [L19, "L19", "#f9e2af"],
  [23, "L23", "#737373"],
  [27, "L27", "#737373"],
];

export const BreathingHeatmapNode = memo(({ id, selected }: NodeProps) => {
  const def = NODE_REGISTRY.breathing_heatmap;
  const nodeData = useNodesData<Node<BreathingData>>(id);
  const heatmap = nodeData?.data?.heatmap;
  const l19Values = nodeData?.data?.l19_values;
  const correctness = nodeData?.data?.correctness;
  const collapseRatio = nodeData?.data?.collapse_ratio;
  const promptId = nodeData?.data?.prompt_id;
  const subject = nodeData?.data?.subject;
  const level = nodeData?.data?.level;
  const mathIdx = nodeData?.data?.math_idx;
  const [tooltip, setTooltip] = useState<string | null>(null);

  if (!heatmap) {
    return (
      <BaseNodeShell selected={selected} label={def.label} category={def.category} inputs={def.inputs}>
        <div className="text-xs text-neutral-500 w-[200px]">Waiting for breathing data...</div>
      </BaseNodeShell>
    );
  }

  let peakIdx = 0;
  let collapseIdx = 0;
  if (l19Values) {
    for (let i = 1; i < l19Values.length; i++) {
      if (l19Values[i] > l19Values[peakIdx]) peakIdx = i;
    }
    collapseIdx = peakIdx;
    for (let i = peakIdx + 1; i < l19Values.length; i++) {
      if (l19Values[i] < l19Values[collapseIdx]) collapseIdx = i;
    }
  }

  const sparkPoints = l19Values?.map((v, i) => {
    const x = SPARK_X + (v / 35) * SPARK_W;
    const y = GRID_Y + i * ROW_S + CELL_H / 2;
    return `${x},${y}`;
  });

  return (
    <BaseNodeShell selected={selected} label={def.label} category={def.category} inputs={def.inputs}>
      <div className="relative">
        <svg width={SVG_W} height={SVG_H} className="block">
          {POSITIONS.map((pos, row) => (
            <text
              key={pos}
              x={GRID_X - 6}
              y={GRID_Y + row * ROW_S + CELL_H / 2 + 3}
              textAnchor="end"
              fill="#a6adc8"
              fontSize={9}
              fontFamily="monospace"
            >
              {pos}
            </text>
          ))}

          {heatmap.map((row, ri) =>
            row.map((pr, ci) => (
              <rect
                key={`${ri}-${ci}`}
                x={GRID_X + ci * COL_S}
                y={GRID_Y + ri * ROW_S}
                width={CELL_W}
                height={CELL_H}
                rx={1}
                fill={prToColor(pr)}
                onMouseEnter={() => setTooltip(`L${ci} @ ${POSITIONS[ri]}: PR=${pr.toFixed(1)}`)}
                onMouseLeave={() => setTooltip(null)}
              />
            ))
          )}

          <rect
            x={GRID_X + L19 * COL_S - 1}
            y={GRID_Y - 1}
            width={CELL_W + 2}
            height={GRID_H}
            fill="none"
            stroke="#f9e2af"
            strokeWidth={1}
            strokeDasharray="3,2"
            opacity={0.6}
          />

          {X_LABELS.map(([col, label, color]) => (
            <text
              key={label}
              x={GRID_X + col * COL_S + CELL_W / 2}
              y={XLABEL_Y}
              textAnchor="middle"
              fill={color}
              fontSize={7}
              fontFamily="monospace"
            >
              {label}
            </text>
          ))}

          {sparkPoints && l19Values && (
            <g>
              <polyline
                points={sparkPoints.join(" ")}
                fill="none"
                stroke="#10b981"
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
              <circle cx={SPARK_X + (l19Values[peakIdx] / 35) * SPARK_W} cy={GRID_Y + peakIdx * ROW_S + CELL_H / 2} r={2.5} fill="#eab308" />
              {collapseIdx !== peakIdx && (
                <circle cx={SPARK_X + (l19Values[collapseIdx] / 35) * SPARK_W} cy={GRID_Y + collapseIdx * ROW_S + CELL_H / 2} r={2.5} fill="#3b82f6" />
              )}
              <text x={SPARK_X + (l19Values[peakIdx] / 35) * SPARK_W + 6} y={GRID_Y + peakIdx * ROW_S + CELL_H / 2 + 3} fill="#eab308" fontSize={6} fontFamily="monospace">
                {l19Values[peakIdx].toFixed(0)}
              </text>
              {collapseIdx !== peakIdx && (
                <text x={SPARK_X + (l19Values[collapseIdx] / 35) * SPARK_W - 2} y={GRID_Y + collapseIdx * ROW_S + CELL_H / 2 + 3} fill="#3b82f6" fontSize={6} fontFamily="monospace" textAnchor="end">
                  {l19Values[collapseIdx].toFixed(0)}
                </text>
              )}
            </g>
          )}

          <line x1={20} y1={FOOTER_Y - 6} x2={SVG_W - 20} y2={FOOTER_Y - 6} stroke="#313244" strokeWidth={0.5} />

          <text x={10} y={FOOTER_Y + 8} fill="#6c7086" fontSize={8}>PR</text>
          {COLOR_STOPS.map(([v], i) => (
            <rect key={v} x={26 + i * 21} y={FOOTER_Y} width={20} height={10} rx={1} fill={prToColor(v)} />
          ))}
          <text x={26} y={FOOTER_Y + 20} fill="#585b70" fontSize={7} fontFamily="monospace">0</text>
          <text x={26 + 3 * 21} y={FOOTER_Y + 20} fill="#585b70" fontSize={7} fontFamily="monospace">15</text>
          <text x={26 + 7 * 21} y={FOOTER_Y + 20} fill="#585b70" fontSize={7} fontFamily="monospace">35</text>

          {correctness !== undefined && (
            <g>
              <rect x={210} y={FOOTER_Y - 1} width={correctness ? 52 : 68} height={16} rx={8} fill={correctness ? "#10b981" : "#ef4444"} opacity={0.15} />
              <text x={correctness ? 236 : 244} y={FOOTER_Y + 11} fill={correctness ? "#10b981" : "#ef4444"} fontSize={9} fontWeight={600} textAnchor="middle">
                {correctness ? "CORRECT" : "INCORRECT"}
              </text>
            </g>
          )}

          {collapseRatio !== undefined && (
            <g>
              <text x={290} y={FOOTER_Y + 11} fill="#6c7086" fontSize={8}>collapse</text>
              <text x={340} y={FOOTER_Y + 11} fill="#f9e2af" fontSize={9} fontWeight={600} fontFamily="monospace">{collapseRatio.toFixed(3)}</text>
            </g>
          )}

          {subject && level != null ? (
            <g>
              <rect x={380} y={FOOTER_Y - 1} width={110} height={16} rx={8} fill="#313244" />
              <text x={435} y={FOOTER_Y + 11} fill="#a6adc8" fontSize={8} textAnchor="middle">
                {subject} L{level}{mathIdx != null ? ` #${mathIdx}` : ""}
              </text>
            </g>
          ) : promptId ? (
            <g>
              <rect x={390} y={FOOTER_Y - 1} width={96} height={16} rx={8} fill="#313244" />
              <text x={438} y={FOOTER_Y + 11} fill="#a6adc8" fontSize={8} textAnchor="middle">{promptId}</text>
            </g>
          ) : null}
        </svg>

        {tooltip && (
          <div className="absolute bottom-0 left-0 right-0 bg-neutral-800 px-2 py-0.5 text-[9px] text-neutral-300 rounded">
            {tooltip}
          </div>
        )}
      </div>
    </BaseNodeShell>
  );
});
BreathingHeatmapNode.displayName = "BreathingHeatmapNode";
