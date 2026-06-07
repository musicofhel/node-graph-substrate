import { useStore } from "@xyflow/react";

export type ZoomTier = "T0" | "T1" | "T2" | "T3" | "T4";

const TIER_THRESHOLDS: Array<[number, ZoomTier]> = [
  [0.30, "T0"],
  [0.55, "T1"],
  [0.85, "T2"],
  [1.50, "T3"],
  [Infinity, "T4"],
];

export function useZoomTier(): ZoomTier {
  const zoom = useStore((s) => s.transform[2]);
  for (const [threshold, tier] of TIER_THRESHOLDS) {
    if (zoom < threshold) return tier;
  }
  return "T4";
}
