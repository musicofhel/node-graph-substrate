import { memo, useMemo, useState, useCallback } from "react";
import type { H1Problem } from "../../../packs/topo-confidence/hooks/useH1LoopData";
import { turboColor, cycleColor, cycleOpacity } from "./turbo-colormap";

const POINT_R = 2.5;
const BRIDGE_R = 5.5;
const HIGHLIGHT_R = 7;
const MARGIN = 20;
const COLOR_POINT = "#a0a0c0";
const COLOR_BRIDGE = "#ffd700";

type Props = {
  problem: H1Problem;
  points: number[][];
  width: number;
  height: number;
  highlightedCycle: number | null;
  onCycleHover: (rank: number | null) => void;
  highlightedPointIdx?: number | null;
  onPointHover?: (subsampledIdx: number | null) => void;
  replayProgress?: number | null;
  filtrationEpsilon?: number | null;
};

type Tooltip = { x: number; y: number; text: string };

export const H1Cloud2D = memo(({
  problem,
  points: rawPoints,
  width,
  height,
  highlightedCycle,
  onCycleHover,
  highlightedPointIdx,
  onPointHover,
  replayProgress,
  filtrationEpsilon,
}: Props) => {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const plotW = width - 2 * MARGIN;
  const plotH = height - 2 * MARGIN;

  const { xScale, yScale } = useMemo(() => {
    const xs = rawPoints.map((p) => p[0]);
    const ys = rawPoints.map((p) => p[1]);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const pad = 0.05;
    const xRange = (xMax - xMin) || 1;
    const yRange = (yMax - yMin) || 1;

    return {
      xScale: (v: number) =>
        MARGIN + ((v - xMin + xRange * pad) / (xRange * (1 + 2 * pad))) * plotW,
      yScale: (v: number) =>
        MARGIN + ((v - yMin + yRange * pad) / (yRange * (1 + 2 * pad))) * plotH,
    };
  }, [rawPoints, plotW, plotH]);

  const projected = useMemo(
    () =>
      rawPoints.map((p, i) => ({
        cx: xScale(p[0]),
        cy: yScale(p[1]),
        isBridge: i === problem.bridge_subsampled_index,
        tokenIdx: problem.subsampled_token_indices[i],
        t: rawPoints.length > 1 ? i / (rawPoints.length - 1) : 0,
      })),
    [rawPoints, xScale, yScale, problem.bridge_subsampled_index, problem.subsampled_token_indices],
  );

  const maxRank = useMemo(
    () => Math.max(0, ...problem.h1_cycles.map((c) => c.rank)),
    [problem.h1_cycles],
  );

  const cycles = useMemo(() => {
    const sorted = [...problem.h1_cycles].sort((a, b) => b.rank - a.rank);
    return sorted.map((c) => ({
      rank: c.rank,
      pointsStr: c.representative_subsampled_indices
        .map((i) => `${xScale(rawPoints[i][0])},${yScale(rawPoints[i][1])}`)
        .join(" "),
      color: cycleColor(c.rank, maxRank),
      opacity: cycleOpacity(c.rank),
      birth: c.birth,
      death: c.death,
      lifetime: c.lifetime,
      isFallback: c.extraction_method === "cocycle_support_walk",
    }));
  }, [problem.h1_cycles, rawPoints, xScale, yScale, maxRank]);

  const edgePath = useMemo(() => {
    if (
      filtrationEpsilon == null ||
      !problem.distance_matrix_upper ||
      problem.distance_matrix_upper.length === 0
    )
      return "";

    const n = problem.n_subsampled;
    const parts: string[] = [];
    let k = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (problem.distance_matrix_upper[k] <= filtrationEpsilon) {
          const x1 = xScale(rawPoints[i][0]),
            y1 = yScale(rawPoints[i][1]);
          const x2 = xScale(rawPoints[j][0]),
            y2 = yScale(rawPoints[j][1]);
          parts.push(`M${x1},${y1}L${x2},${y2}`);
        }
        k++;
      }
    }
    return parts.join("");
  }, [filtrationEpsilon, problem.distance_matrix_upper, problem.n_subsampled, rawPoints, xScale, yScale]);

  const replayLine = useMemo(() => {
    if (replayProgress == null || replayProgress < 1) return "";
    const pts = projected.slice(0, replayProgress + 1);
    return pts.map((p) => `${p.cx},${p.cy}`).join(" ");
  }, [replayProgress, projected]);

  const handlePointEnter = useCallback(
    (e: React.MouseEvent, i: number) => {
      const p = projected[i];
      const label = p.isBridge
        ? `Bridge (token ${p.tokenIdx})`
        : `Token ${p.tokenIdx} (point ${i})`;
      setTooltip({ x: e.clientX, y: e.clientY, text: label });
      onPointHover?.(i);
    },
    [projected, onPointHover],
  );

  const handlePointLeave = useCallback(() => {
    setTooltip(null);
    onPointHover?.(null);
  }, [onPointHover]);

  const handleCycleEnter = useCallback(
    (e: React.MouseEvent, c: (typeof cycles)[number]) => {
      onCycleHover(c.rank);
      setTooltip({
        x: e.clientX,
        y: e.clientY,
        text: `Cycle ${c.rank} | life: ${c.lifetime.toFixed(2)} | ${c.birth.toFixed(2)} → ${c.death.toFixed(2)}`,
      });
    },
    [onCycleHover],
  );

  const handleCycleLeave = useCallback(() => {
    onCycleHover(null);
    setTooltip(null);
  }, [onCycleHover]);

  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        <rect width={width} height={height} fill="#0f0f23" rx={4} />

        {/* Rips edges (filtration) */}
        {edgePath && (
          <path d={edgePath} stroke="#4a4a6a" strokeWidth={0.8} opacity={0.25} fill="none" />
        )}

        {/* Replay trajectory line */}
        {replayLine && (
          <polyline
            points={replayLine}
            fill="none"
            stroke="#7070a0"
            strokeWidth={1}
            opacity={0.35}
          />
        )}

        {/* Cycle polygons (high-rank drawn first = behind) */}
        {cycles.map((c) => {
          const isActive = highlightedCycle === c.rank;
          const isDimmed = highlightedCycle != null && !isActive;
          const lifecycleHidden =
            filtrationEpsilon != null && filtrationEpsilon < c.birth;
          const lifecycleDead =
            filtrationEpsilon != null && filtrationEpsilon >= c.death;

          if (lifecycleHidden) return null;

          return (
            <polygon
              key={c.rank}
              points={c.pointsStr}
              fill="none"
              stroke={lifecycleDead ? "#555" : c.color}
              strokeWidth={isActive ? 3 : c.rank === 0 ? 2 : 1.5}
              strokeDasharray={c.isFallback ? "6,3" : "none"}
              opacity={isDimmed ? 0.15 : lifecycleDead ? 0.3 : c.opacity}
              onMouseEnter={(e) => handleCycleEnter(e, c)}
              onMouseLeave={handleCycleLeave}
              className="cursor-pointer"
            />
          );
        })}

        {/* Points */}
        {projected.map((p, i) => {
          if (replayProgress != null && i > replayProgress) return null;

          const isHighlighted = highlightedPointIdx === i;
          const r = isHighlighted
            ? HIGHLIGHT_R
            : p.isBridge
              ? BRIDGE_R
              : POINT_R;
          const fill = p.isBridge ? COLOR_BRIDGE : COLOR_POINT;

          return (
            <g key={i}>
              {isHighlighted && (
                <circle
                  cx={p.cx}
                  cy={p.cy}
                  r={HIGHLIGHT_R + 2}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  className="animate-pulse"
                />
              )}
              <circle
                cx={p.cx}
                cy={p.cy}
                r={r}
                fill={fill}
                opacity={p.isBridge ? 1 : 0.7}
                stroke={p.isBridge ? "#fff" : undefined}
                strokeWidth={p.isBridge ? 1 : undefined}
                onMouseEnter={(e) => handlePointEnter(e, i)}
                onMouseLeave={handlePointLeave}
                className="cursor-crosshair"
              />
            </g>
          );
        })}
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="fixed pointer-events-none z-50 rounded bg-neutral-900/95 border border-neutral-700 px-2 py-1 text-[10px] font-mono text-neutral-200 whitespace-nowrap"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.text}
        </div>
      )}
    </>
  );
});
H1Cloud2D.displayName = "H1Cloud2D";
