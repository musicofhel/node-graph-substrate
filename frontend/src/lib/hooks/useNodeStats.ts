import { useMemo } from "react";

export interface NodeStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  p25: number;
  p50: number;
  p75: number;
  trend: "up" | "down" | "flat";
  count: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

function linearTrend(values: number[]): "up" | "down" | "flat" {
  const n = values.length;
  if (n < 3) return "flat";
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const range = Math.max(...values) - Math.min(...values);
  if (range === 0) return "flat";
  const normalizedSlope = (slope * n) / range;
  if (normalizedSlope > 0.15) return "up";
  if (normalizedSlope < -0.15) return "down";
  return "flat";
}

export function useNodeStats(values: number[]): NodeStats | null {
  return useMemo(() => {
    if (values.length === 0) return null;
    const n = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    const sorted = [...values].sort((a, b) => a - b);
    return {
      mean,
      std,
      min: sorted[0],
      max: sorted[n - 1],
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      trend: linearTrend(values),
      count: n,
    };
  }, [values]);
}
