import { create } from "zustand";
import { useMemo } from "react";
import { computePSI, driftSeverity, type DriftSeverity } from "../drift/psi";

interface HistoryRecord {
  ts: number;
  values: Record<string, number>;
}

interface BaselineEntry {
  name: string;
  ts: number;
  samples: HistoryRecord[];
}

interface DriftState {
  histories: Map<string, HistoryRecord[]>;
  lastEventTs: Map<string, number>;
  baselines: Map<string, BaselineEntry>;
  baselineMode: "rolling" | "snapshot";
  pushSample: (nodeId: string, ts: number, values: Record<string, number>) => void;
  getHistory: (nodeId: string) => HistoryRecord[];
  saveAllBaselines: (name: string) => void;
  clearAllBaselines: () => void;
  setBaselineMode: (mode: "rolling" | "snapshot") => void;
}

const HISTORY_LIMIT = 100;

function loadBaselines(): Map<string, BaselineEntry> {
  try {
    const raw = localStorage.getItem("substrate:drift:baselines");
    if (!raw) return new Map();
    return new Map(JSON.parse(raw));
  } catch {
    return new Map();
  }
}

function persistBaselines(baselines: Map<string, BaselineEntry>) {
  localStorage.setItem("substrate:drift:baselines", JSON.stringify(Array.from(baselines.entries())));
}

export const useDriftStore = create<DriftState>((set, get) => ({
  histories: new Map(),
  lastEventTs: new Map(),
  baselines: loadBaselines(),
  baselineMode: "rolling",

  pushSample: (nodeId, ts, values) => {
    if (Object.keys(values).length === 0) return;
    set((state) => {
      const histories = new Map(state.histories);
      const existing = histories.get(nodeId) ?? [];
      const updated = [...existing, { ts, values }];
      if (updated.length > HISTORY_LIMIT) {
        updated.splice(0, updated.length - HISTORY_LIMIT);
      }
      histories.set(nodeId, updated);

      const lastEventTs = new Map(state.lastEventTs);
      lastEventTs.set(nodeId, ts);

      return { histories, lastEventTs };
    });
  },

  getHistory: (nodeId) => get().histories.get(nodeId) ?? [],

  saveAllBaselines: (name) => {
    const baselines = new Map<string, BaselineEntry>();
    for (const [nodeId, history] of get().histories) {
      if (history.length > 0) {
        baselines.set(nodeId, { name, ts: Date.now(), samples: [...history] });
      }
    }
    persistBaselines(baselines);
    set({ baselines });
  },

  clearAllBaselines: () => {
    localStorage.removeItem("substrate:drift:baselines");
    set({ baselines: new Map(), baselineMode: "rolling" });
  },

  setBaselineMode: (mode) => set({ baselineMode: mode }),
}));

interface FieldDrift {
  psi: number;
  severity: DriftSeverity;
}

interface NodeDriftResult {
  fields: Record<string, FieldDrift>;
  worst: DriftSeverity;
}

export function useNodeDrift(nodeId: string): NodeDriftResult | null {
  const history = useDriftStore((s) => s.histories.get(nodeId));
  const baseline = useDriftStore((s) => s.baselines.get(nodeId));
  const mode = useDriftStore((s) => s.baselineMode);
  const len = history?.length ?? 0;
  const hasBaseline = !!baseline;

  return useMemo(() => {
    if (!history || history.length < 20) return null;

    let baselineRecords: HistoryRecord[];
    let currentRecords: HistoryRecord[];

    if (mode === "snapshot" && baseline) {
      baselineRecords = baseline.samples;
      currentRecords = history;
    } else {
      const mid = Math.floor(history.length / 2);
      baselineRecords = history.slice(0, mid);
      currentRecords = history.slice(mid);
    }

    const allKeys = new Set<string>();
    for (const rec of [...baselineRecords, ...currentRecords]) {
      for (const k of Object.keys(rec.values)) allKeys.add(k);
    }

    const fields: Record<string, FieldDrift> = {};
    let worst: DriftSeverity = "ok";

    for (const key of allKeys) {
      const baseVals = baselineRecords.map((r) => r.values[key]).filter((v): v is number => v !== undefined);
      const currVals = currentRecords.map((r) => r.values[key]).filter((v): v is number => v !== undefined);
      if (baseVals.length < 5 || currVals.length < 5) continue;

      const psi = computePSI(baseVals, currVals);
      const severity = driftSeverity(psi);
      fields[key] = { psi, severity };

      if (severity === "alert" || (severity === "warning" && worst === "ok")) {
        worst = severity;
      }
    }

    return { fields, worst };
  }, [len, mode, hasBaseline]);
}
