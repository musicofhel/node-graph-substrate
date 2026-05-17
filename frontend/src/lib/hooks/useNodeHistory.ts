import { useMemo } from "react";
import { useDriftStore } from "../store/drift-store";

export interface TimePoint {
  ts: number;
  value: number;
}

export function useNodeHistory(nodeId: string, field: string): TimePoint[] {
  const history = useDriftStore((s) => s.histories.get(nodeId));
  return useMemo(
    () =>
      (history ?? [])
        .map((r) => ({ ts: r.ts, value: r.values[field] }))
        .filter((r): r is TimePoint => r.value !== undefined),
    [history, field],
  );
}

export function useNodeHistoryFields(nodeId: string): string[] {
  const history = useDriftStore((s) => s.histories.get(nodeId));
  return useMemo(() => {
    if (!history || history.length === 0) return [];
    const keys = new Set<string>();
    for (const rec of history) {
      for (const k of Object.keys(rec.values)) keys.add(k);
    }
    return Array.from(keys).sort();
  }, [history]);
}
