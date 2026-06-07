import { memo, useMemo, useState, useCallback } from "react";
import type { H1Problem } from "../../../packs/topo-confidence/hooks/useH1LoopData";
import { cycleColor } from "./turbo-colormap";

const DOT_R = 4;
const DOT_R_HIGHLIGHT = 6;
const COLOR_H0 = "#58a6ff";
const COLOR_H1 = "#22d3ee";
const COLOR_H2 = "#a78bfa";
const PAD = { top: 20, right: 12, bottom: 30, left: 36 };

type Props = {
  problem: H1Problem;
  width: number;
  height: number;
  highlightedCycle: number | null;
  onCycleHover: (rank: number | null) => void;
  filtrationEpsilon?: number | null;
};

type DiagramDot = {
  dim: number;
  birth: number;
  death: number;
  cycleRank: number;
  color: string;
};

type Tooltip = { x: number; y: number; text: string };

export const H1PersistenceDiagram = memo(({
  problem,
  width,
  height,
  highlightedCycle,
  onCycleHover,
  filtrationEpsilon,
}: Props) => {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const { dots, domainMax, xScale, yScale } = useMemo(() => {
    const maxRank = Math.max(0, ...problem.h1_cycles.map((c) => c.rank));
    const allDots: DiagramDot[] = [];

    const dimEntries: [number, number[][], string][] = [
      [0, problem.persistence_diagram.H0, COLOR_H0],
      [1, problem.persistence_diagram.H1, COLOR_H1],
      [2, problem.persistence_diagram.H2, COLOR_H2],
    ];

    for (const [dim, pairs, baseColor] of dimEntries) {
      for (const [b, d] of pairs) {
        if (!isFinite(b) || !isFinite(d)) continue;
        let rank = -1;
        let color = baseColor;
        if (dim === 1) {
          const match = problem.h1_cycles.find(
            (c) => Math.abs(c.birth - b) < 1e-6 && Math.abs(c.death - d) < 1e-6,
          );
          rank = match?.rank ?? -1;
          if (rank >= 0) color = cycleColor(rank, maxRank);
        }
        allDots.push({ dim, birth: b, death: d, cycleRank: rank, color });
      }
    }

    const maxVal = Math.max(
      1,
      ...allDots.map((d) => Math.max(d.birth, d.death)),
    );
    const dm = maxVal * 1.08;

    return {
      dots: allDots,
      domainMax: dm,
      xScale: (v: number) => PAD.left + (v / dm) * plotW,
      yScale: (v: number) => PAD.top + plotH - (v / dm) * plotH,
    };
  }, [problem, plotW, plotH]);

  const ticks = useMemo(() => {
    const count = 4;
    const step = domainMax / count;
    const vals: number[] = [];
    for (let i = 0; i <= count; i++) vals.push(Math.round(i * step));
    return vals;
  }, [domainMax]);

  const paintOrder: number[] = [0, 2, 1];

  const handleDotEnter = useCallback(
    (e: React.MouseEvent, d: DiagramDot) => {
      if (d.dim === 1 && d.cycleRank >= 0) onCycleHover(d.cycleRank);
      const dimLabel = `H${d.dim}`;
      const life = (d.death - d.birth).toFixed(2);
      setTooltip({
        x: e.clientX,
        y: e.clientY,
        text:
          d.dim === 1 && d.cycleRank >= 0
            ? `H1 cycle ${d.cycleRank} | life: ${life} | ${d.birth.toFixed(2)} → ${d.death.toFixed(2)}`
            : `${dimLabel} | life: ${life} | ${d.birth.toFixed(2)} → ${d.death.toFixed(2)}`,
      });
    },
    [onCycleHover],
  );

  const handleDotLeave = useCallback(() => {
    onCycleHover(null);
    setTooltip(null);
  }, [onCycleHover]);

  if (dots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center ngs-text-meta text-neutral-500">
        No persistence features
      </div>
    );
  }

  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        <rect width={width} height={height} fill="var(--ngs-canvas-deep)" rx={4} />

        {/* Axes */}
        <line
          x1={xScale(0)} y1={yScale(0)}
          x2={xScale(domainMax)} y2={yScale(0)}
          stroke="#555" strokeWidth={1}
        />
        <line
          x1={xScale(0)} y1={yScale(0)}
          x2={xScale(0)} y2={yScale(domainMax)}
          stroke="#555" strokeWidth={1}
        />

        {/* Diagonal (birth = death) */}
        <line
          x1={xScale(0)} y1={yScale(0)}
          x2={xScale(domainMax)} y2={yScale(domainMax)}
          stroke="#555" strokeWidth={1} strokeDasharray="4,3"
        />

        {/* Tick labels */}
        {ticks.map((v) => (
          <g key={v}>
            <text
              x={xScale(v)} y={yScale(0) + 12}
              textAnchor="middle" fill="#777" fontSize={9} style={{ fontFeatureSettings: "'tnum'" }}
            >
              {v}
            </text>
            <text
              x={xScale(0) - 4} y={yScale(v) + 3}
              textAnchor="end" fill="#777" fontSize={9} style={{ fontFeatureSettings: "'tnum'" }}
            >
              {v}
            </text>
          </g>
        ))}

        {/* Axis labels */}
        <text
          x={PAD.left + plotW / 2} y={height - 3}
          textAnchor="middle" fill="#999" fontSize={9}
        >
          Birth
        </text>
        <text
          transform={`rotate(-90)`}
          x={-(PAD.top + plotH / 2)} y={10}
          textAnchor="middle" fill="#999" fontSize={9}
        >
          Death
        </text>

        {/* Filtration sweep lines */}
        {filtrationEpsilon != null && (
          <>
            <line
              x1={xScale(filtrationEpsilon)} y1={yScale(0)}
              x2={xScale(filtrationEpsilon)} y2={yScale(domainMax)}
              stroke="#ff6b6b" strokeWidth={1.5} strokeDasharray="4,4"
            />
            <line
              x1={xScale(0)} y1={yScale(filtrationEpsilon)}
              x2={xScale(domainMax)} y2={yScale(filtrationEpsilon)}
              stroke="#ff6b6b" strokeWidth={1.5} strokeDasharray="4,4"
            />
            <rect
              x={xScale(0)} y={yScale(domainMax)}
              width={xScale(filtrationEpsilon) - xScale(0)}
              height={yScale(filtrationEpsilon) - yScale(domainMax)}
              fill="#22d3ee" opacity={0.05}
            />
          </>
        )}

        {/* Dots — paint H0 first, then H2, then H1 on top */}
        {paintOrder.map((dim) =>
          dots
            .filter((d) => d.dim === dim)
            .map((d, i) => {
              const isH1Match = d.dim === 1 && d.cycleRank >= 0;
              const isHighlighted =
                highlightedCycle != null && isH1Match && d.cycleRank === highlightedCycle;
              const isDimmed =
                highlightedCycle != null && !isHighlighted;
              const r =
                isHighlighted
                  ? DOT_R_HIGHLIGHT
                  : isH1Match && d.cycleRank === 0
                    ? DOT_R_HIGHLIGHT
                    : DOT_R;

              return (
                <circle
                  key={`${dim}-${i}`}
                  cx={xScale(d.birth)}
                  cy={yScale(d.death)}
                  r={r}
                  fill={d.color}
                  opacity={isDimmed ? 0.15 : 1}
                  className="cursor-pointer"
                  onMouseEnter={(e) => handleDotEnter(e, d)}
                  onMouseLeave={handleDotLeave}
                />
              );
            }),
        )}

        {/* Legend */}
        {([
          ["H0", COLOR_H0],
          ["H1", COLOR_H1],
          ["H2", COLOR_H2],
        ] as const).map(([label, color], i) => (
          <g key={label} transform={`translate(${PAD.left + 6}, ${PAD.top + 6 + i * 13})`}>
            <circle cx={4} cy={0} r={3} fill={color} />
            <text x={11} y={3} fill="#999" fontSize={9} style={{ fontFeatureSettings: "'tnum'" }}>
              {label}
            </text>
          </g>
        ))}
      </svg>

      {tooltip && (
        <div
          className="fixed pointer-events-none z-50 rounded bg-neutral-900/95 border border-neutral-700 px-2 py-1 ngs-text-meta ngs-tabular text-neutral-200 whitespace-nowrap"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.text}
        </div>
      )}
    </>
  );
});
H1PersistenceDiagram.displayName = "H1PersistenceDiagram";

type CycleTableProps = {
  problem: H1Problem;
  highlightedCycle: number | null;
  onCycleHover: (rank: number | null) => void;
};

export const H1CycleTable = memo(({ problem, highlightedCycle, onCycleHover }: CycleTableProps) => {
  const maxRank = Math.max(0, ...problem.h1_cycles.map((c) => c.rank));
  const cycles = problem.h1_cycles;

  if (cycles.length === 0) {
    return (
      <div className="ngs-text-meta text-neutral-600 italic p-1">
        No H1 cycles detected
      </div>
    );
  }

  return (
    <div className="overflow-y-auto max-h-[120px] ngs-text-micro ngs-tabular">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-neutral-500 uppercase tracking-wider ngs-text-micro sticky top-0 bg-neutral-900">
            <th className="text-left py-0.5 px-1">Rank</th>
            <th className="text-right py-0.5 px-1">Life</th>
            <th className="text-right py-0.5 px-1">Birth</th>
            <th className="text-right py-0.5 px-1">Verts</th>
            <th className="text-left py-0.5 px-1">Method</th>
          </tr>
        </thead>
        <tbody>
          {cycles.map((c) => {
            const isHighlighted = highlightedCycle === c.rank;
            return (
              <tr
                key={c.rank}
                className={`cursor-pointer transition-colors ${
                  isHighlighted ? "bg-neutral-700/50" : "hover:bg-neutral-800"
                }`}
                onMouseEnter={() => onCycleHover(c.rank)}
                onMouseLeave={() => onCycleHover(null)}
              >
                <td className="py-0.5 px-1 flex items-center gap-1">
                  <span
                    className="inline-block w-2 h-2 rounded-sm shrink-0"
                    style={{ background: cycleColor(c.rank, maxRank) }}
                  />
                  {c.rank}
                </td>
                <td className="py-0.5 px-1 text-right text-neutral-300">
                  {c.lifetime.toFixed(2)}
                </td>
                <td className="py-0.5 px-1 text-right text-neutral-400">
                  {c.birth.toFixed(2)}
                </td>
                <td className="py-0.5 px-1 text-right text-neutral-400">
                  {c.representative_subsampled_indices.length - 1}
                </td>
                <td className="py-0.5 px-1 text-neutral-500">
                  {c.extraction_method === "shortest_cycle_at_birth" ? "shortest" : "fallback"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
H1CycleTable.displayName = "H1CycleTable";
