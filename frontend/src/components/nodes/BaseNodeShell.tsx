import { memo, type ReactNode } from "react";
import { Handle, Position, NodeResizer } from "@xyflow/react";
import type { HandleDefinition } from "../../types/nodes";
import { HANDLE_COLORS } from "../../lib/ports/handle-colors";
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
  minWidth?: number;
  minHeight?: number;
  ariaLabel?: string;
  children: ReactNode;
}

const CATEGORY_BORDER: Record<string, string> = {
  input: "border-amber-700",
  extraction: "border-blue-700",
  topology: "border-cyan-700",
  scoring: "border-emerald-700",
  experiment: "border-violet-700",
  navigation: "border-sky-700",
};

export const BaseNodeShell = memo(
  ({ selected, label, category, inputs = [], outputs = [], status, healthStatus, minWidth = 200, minHeight = 100, ariaLabel, children }: Props) => {
    const borderClass = CATEGORY_BORDER[category] ?? "border-neutral-700";
    const isBaselineMode = useDriftStore((s) => s.baselineMode === "snapshot" && s.baselines.size > 0);
    const HEALTH_BG: Record<DriftSeverity, string> = {
      ok: "color-mix(in srgb, var(--ngs-sign-pos) 60%, transparent)",
      warning: "rgb(245 158 11 / 0.8)",
      alert: "var(--ngs-sign-neg)",
    };
    const alertGlow = healthStatus === "alert"
      ? { boxShadow: "0 0 8px color-mix(in srgb, var(--ngs-sign-neg) 30%, transparent)" }
      : undefined;
    const resolvedAriaLabel = ariaLabel ?? `${category} node: ${label}`;
    return (
      <div
        role="region"
        aria-label={resolvedAriaLabel}
        className={`relative min-w-[200px] rounded-lg border ${borderClass} bg-neutral-900 shadow-lg`}
        style={alertGlow}
      >
        <NodeResizer
          isVisible={!!selected}
          minWidth={minWidth}
          minHeight={minHeight}
          color="#3b82f6"
          lineStyle={{ borderWidth: 1 }}
          handleStyle={{ width: 8, height: 8 }}
        />
        {healthStatus && (
          <div
            className={`h-[3px] rounded-t-lg transition-colors duration-500 ${healthStatus === "alert" ? "motion-safe:animate-pulse" : ""}`}
            style={{ backgroundColor: HEALTH_BG[healthStatus] }}
          />
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
          <span className="ngs-text-title tracking-wide text-neutral-300 uppercase">
            {label}
          </span>
          {isBaselineMode && healthStatus && (
            <span className="rounded bg-blue-600 px-0.5 ngs-text-micro font-bold text-white">B</span>
          )}
          {status === "computing" && (
            <span className="h-2 w-2 motion-safe:animate-pulse rounded-full bg-amber-400" />
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
