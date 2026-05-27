import { memo } from "react";
import type { NodeProps } from "@xyflow/react";

const COLOR_MAP: Record<string, { bg: string; border: string; text: string }> = {
  blue: {
    bg: "rgba(59,130,246,0.03)",
    border: "rgba(59,130,246,0.15)",
    text: "rgba(59,130,246,0.4)",
  },
  cyan: {
    bg: "rgba(6,182,212,0.03)",
    border: "rgba(6,182,212,0.15)",
    text: "rgba(6,182,212,0.4)",
  },
  purple: {
    bg: "rgba(168,85,247,0.03)",
    border: "rgba(168,85,247,0.15)",
    text: "rgba(168,85,247,0.4)",
  },
};

export const RowLabelNode = memo(({ data }: NodeProps) => {
  const label = (data as { label?: string }).label ?? "";
  const colorKey = (data as { color?: string }).color ?? "blue";
  const colors = COLOR_MAP[colorKey] ?? COLOR_MAP.blue;

  return (
    <div
      className="relative w-full h-full rounded-xl pointer-events-none"
      style={{
        background: colors.bg,
        border: `1px dashed ${colors.border}`,
      }}
    >
      <span
        className="absolute top-2 left-3 text-[9px] font-semibold tracking-widest uppercase"
        style={{ color: colors.text }}
      >
        {label}
      </span>
    </div>
  );
});
RowLabelNode.displayName = "RowLabelNode";
