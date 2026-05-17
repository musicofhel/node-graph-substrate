import { memo, useMemo } from "react";

interface Props {
  baseline: number[];
  current: number[];
  bins?: number;
  psi?: number;
  height?: number;
}

function buildHistogram(values: number[], binEdges: number[]): number[] {
  const counts = new Array(binEdges.length - 1).fill(0);
  for (const v of values) {
    for (let i = 0; i < counts.length; i++) {
      if (v >= binEdges[i] && (i === counts.length - 1 ? v <= binEdges[i + 1] : v < binEdges[i + 1])) {
        counts[i]++;
        break;
      }
    }
  }
  const total = values.length || 1;
  return counts.map((c) => c / total);
}

function psiSeverity(psi: number): { label: string; color: string } {
  if (psi < 0.1) return { label: "OK", color: "#4ade80" };
  if (psi < 0.2) return { label: "Warning", color: "#fbbf24" };
  return { label: "Alert", color: "#f87171" };
}

const PADDING = { top: 8, right: 8, bottom: 20, left: 8 };

export const DistributionChart = memo(({ baseline, current, bins = 10, psi, height = 120 }: Props) => {
  const width = 380;

  const { baselineBars, currentBars, maxFreq, binEdges } = useMemo(() => {
    const all = [...baseline, ...current];
    if (all.length === 0) return { baselineBars: [], currentBars: [], maxFreq: 1, binEdges: [] };
    const min = Math.min(...all);
    const max = Math.max(...all);
    const range = max - min || 1;
    const edges: number[] = [];
    for (let i = 0; i <= bins; i++) edges.push(min + (i / bins) * range);
    const bHist = buildHistogram(baseline, edges);
    const cHist = buildHistogram(current, edges);
    const mf = Math.max(...bHist, ...cHist, 0.01);
    return { baselineBars: bHist, currentBars: cHist, maxFreq: mf, binEdges: edges };
  }, [baseline, current, bins]);

  if (baseline.length === 0 && current.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-neutral-500" style={{ height }}>
        No distribution data
      </div>
    );
  }

  const plotW = width - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;
  const barW = plotW / (binEdges.length - 1 || 1);
  const sev = psi !== undefined ? psiSeverity(psi) : null;

  return (
    <div>
      {sev && (
        <div className="mb-1 flex items-center gap-2 text-[10px]">
          <span className="text-neutral-400">PSI:</span>
          <span className="font-mono" style={{ color: sev.color }}>{psi!.toFixed(4)}</span>
          <span className="rounded px-1 py-0.5 text-[9px]" style={{ backgroundColor: sev.color + "20", color: sev.color }}>
            {sev.label}
          </span>
        </div>
      )}
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {baselineBars.map((freq, i) => (
          <rect
            key={`b-${i}`}
            x={PADDING.left + i * barW + 1}
            y={PADDING.top + plotH - (freq / maxFreq) * plotH}
            width={barW - 2}
            height={(freq / maxFreq) * plotH}
            fill="#3b82f6"
            opacity={0.3}
          />
        ))}
        {currentBars.map((freq, i) => (
          <rect
            key={`c-${i}`}
            x={PADDING.left + i * barW + 1}
            y={PADDING.top + plotH - (freq / maxFreq) * plotH}
            width={barW - 2}
            height={(freq / maxFreq) * plotH}
            fill="#4ade80"
            opacity={0.3}
          />
        ))}
        {/* X axis labels */}
        {binEdges.filter((_, i) => i % Math.ceil(binEdges.length / 5) === 0).map((edge, i) => {
          const idx = binEdges.indexOf(edge);
          return (
            <text key={i} x={PADDING.left + idx * barW} y={height - 4} fill="#666" fontSize={8} textAnchor="middle">
              {edge.toFixed(2)}
            </text>
          );
        })}
        {/* Legend */}
        <rect x={width - 90} y={4} width={8} height={8} fill="#3b82f6" opacity={0.5} />
        <text x={width - 78} y={11} fill="#999" fontSize={8}>Baseline</text>
        <rect x={width - 90} y={16} width={8} height={8} fill="#4ade80" opacity={0.5} />
        <text x={width - 78} y={23} fill="#999" fontSize={8}>Current</text>
      </svg>
    </div>
  );
});
DistributionChart.displayName = "DistributionChart";
