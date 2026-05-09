import { memo, type ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";
import type { HandleDefinition } from "../../types/nodes";
import { HANDLE_COLORS } from "../../lib/nodes/handle-colors";

const POSITION_MAP = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
} as const;

interface Props {
  label: string;
  category: string;
  inputs?: HandleDefinition[];
  outputs?: HandleDefinition[];
  status?: "idle" | "computing" | "error";
  children: ReactNode;
}

const CATEGORY_BORDER: Record<string, string> = {
  input: "border-amber-700",
  extraction: "border-blue-700",
  topology: "border-cyan-700",
  scoring: "border-emerald-700",
};

export const BaseNodeShell = memo(
  ({ label, category, inputs = [], outputs = [], status, children }: Props) => {
    const borderClass = CATEGORY_BORDER[category] ?? "border-neutral-700";
    return (
      <div
        className={`relative min-w-[200px] rounded-lg border ${borderClass} bg-neutral-900 shadow-lg`}
      >
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
