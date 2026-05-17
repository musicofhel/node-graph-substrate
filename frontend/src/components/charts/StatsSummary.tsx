import { memo } from "react";
import type { NodeStats } from "../../lib/hooks/useNodeStats";

interface Props {
  stats: NodeStats;
  label?: string;
}

const TREND_ICONS: Record<string, string> = { up: "↑", down: "↓", flat: "→" };
const TREND_COLORS: Record<string, string> = { up: "#4ade80", down: "#f87171", flat: "#a3a3a3" };

export const StatsSummary = memo(({ stats, label }: Props) => {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/50 p-2">
      {label && <div className="mb-1.5 text-[10px] font-medium text-neutral-300">{label}</div>}
      <div className="grid grid-cols-4 gap-x-3 gap-y-1 text-[10px]">
        <div>
          <span className="text-neutral-500">Mean</span>
          <div className="font-mono text-neutral-200">{stats.mean.toFixed(3)}</div>
        </div>
        <div>
          <span className="text-neutral-500">Std</span>
          <div className="font-mono text-neutral-200">{stats.std.toFixed(3)}</div>
        </div>
        <div>
          <span className="text-neutral-500">Min</span>
          <div className="font-mono text-neutral-200">{stats.min.toFixed(3)}</div>
        </div>
        <div>
          <span className="text-neutral-500">Max</span>
          <div className="font-mono text-neutral-200">{stats.max.toFixed(3)}</div>
        </div>
        <div>
          <span className="text-neutral-500">P25</span>
          <div className="font-mono text-neutral-200">{stats.p25.toFixed(3)}</div>
        </div>
        <div>
          <span className="text-neutral-500">P50</span>
          <div className="font-mono text-neutral-200">{stats.p50.toFixed(3)}</div>
        </div>
        <div>
          <span className="text-neutral-500">P75</span>
          <div className="font-mono text-neutral-200">{stats.p75.toFixed(3)}</div>
        </div>
        <div>
          <span className="text-neutral-500">Trend</span>
          <div className="font-mono" style={{ color: TREND_COLORS[stats.trend] }}>
            {TREND_ICONS[stats.trend]} {stats.trend}
          </div>
        </div>
      </div>
      <div className="mt-1 text-right text-[9px] text-neutral-600">{stats.count} samples</div>
    </div>
  );
});
StatsSummary.displayName = "StatsSummary";
