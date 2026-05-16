import { useEffect, useState } from "react";
import { type EdgeProps, getSmoothStepPath } from "@xyflow/react";
import { useDriftStore } from "../../lib/store/drift-store";

const DECAY_MS = 120_000;
const MIN_OPACITY = 0.15;

export function StaleEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  target,
  markerEnd,
}: EdgeProps) {
  const lastTs = useDriftStore((s) => s.lastEventTs.get(target));
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const ageMs = lastTs ? now - lastTs : 0;
  const opacity = lastTs
    ? Math.max(MIN_OPACITY, 1 - ageMs / DECAY_MS)
    : 1;
  const strokeDasharray = ageMs > DECAY_MS ? "6 4" : undefined;
  const staleness = Math.min(ageMs / DECAY_MS, 1);
  const r = Math.round(0x52 + (0x3f - 0x52) * staleness);
  const g = Math.round(0x52 + (0x3f - 0x52) * staleness);
  const b = Math.round(0x52 + (0x46 - 0x52) * staleness);
  const strokeColor = `rgb(${r},${g},${b})`;

  return (
    <path
      id={id}
      d={edgePath}
      fill="none"
      stroke={strokeColor}
      strokeWidth={2}
      strokeDasharray={strokeDasharray}
      markerEnd={markerEnd}
      style={{ opacity, transition: "opacity 1s ease" }}
    />
  );
}
