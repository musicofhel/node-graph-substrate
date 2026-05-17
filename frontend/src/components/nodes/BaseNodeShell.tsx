import { memo, type ReactNode } from "react";
import { Handle, Position, NodeResizer } from "@xyflow/react";
import type { HandleDefinition } from "../../types/nodes";
import { HANDLE_COLORS } from "../../lib/nodes/handle-colors";
import { useDriftStore } from "../../lib/store/drift-store";

const POSITION_MAP = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
} as const;

import type { DriftSeverity } from "../../lib/drift/psi";

interface Props {
  selected?: boolean;
  label: string;
  category: string;
  inputs?: HandleDefinition[];
  outputs?: HandleDefinition[];
  status?: "idle" | "computing" | "error";
  healthStatus?: DriftSeverity;
  children: ReactNode;
}

const CATEGORY_BORDER: Record<string, string> = {
  input: "border-amber-700",
  extraction: "border-blue-700",
  topology: "border-cyan-700",
  scoring: "border-emerald-700",
};

export const BaseNodeShell = memo(
  ({ selected, label, category, inputs = [], outputs = [], status, healthStatus, children }: Props) => {
    const borderClass = CATEGORY_BORDER[category] ?? "border-neutral-700";
    const isBaselineMode = useDriftStore((s) => s.baselineMode === "snapshot" && s.baselines.size > 0);
    const HEALTH_BAND: Record<DriftSeverity, string> = {
      ok: "bg-emerald-500/60",
      warning: "bg-amber-500/80",
      alert: "bg-red-500 animate-pulse",
    };
    const alertGlow = healthStatus === "alert" ? "shadow-[0_0_8px_rgba(239,68,68,0.3)]" : "";
    return (
      <div
        className={`relative min-w-[200px] rounded-lg border ${borderClass} bg-neutral-900 shadow-lg ${alertGlow}`}
      >
        <NodeResizer
          isVisible={!!selected}
          minWidth={200}
          minHeight={100}
          color="#3b82f6"
          lineStyle={{ borderWidth: 1 }}
          handleStyle={{ width: 8, height: 8 }}
        />
        {healthStatus && (
          <div className={`h-[3px] rounded-t-lg transition-colors duration-500 ${HEALTH_BAND[healthStatus]}`} />
        )}
        {inputs.map((h) => (
          <Handle
            key={h.id}
            id={h.id}
            type="target"
            position={POSITION_MAP[h.position]}
            style={{ background: HANDLE_COLORS[h.type] }}
          />
        ))}
        <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1.5">
          <span className="text-xs font-semibold tracking-wide text-neutral-300 uppercase">
            {label}
          </span>
          {isBaselineMode && healthStatus && (
            <span className="rounded bg-blue-600 px-0.5 text-[8px] font-bold text-white">B</span>
          )}
          {status === "computing" && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          )}
          {status === "error" && (
            <span className="h-2 w-2 rounded-full bg-red-500" />
          )}
        </div>
        <div className="p-3">{children}</div>
        {outputs.map((h) => (
          <Handle
            key={h.id}
            id={h.id}
            type="source"
            position={POSITION_MAP[h.position]}
            style={{ background: HANDLE_COLORS[h.type] }}
          />
        ))}
      </div>
    );
  },
);
BaseNodeShell.displayName = "BaseNodeShell";
