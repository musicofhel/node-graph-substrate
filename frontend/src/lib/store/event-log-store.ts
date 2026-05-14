import { create } from "zustand";

export interface LogEntry {
  id: number;
  ts: number;
  type: string;
  stream?: string;
  nodeId?: string;
  raw: Record<string, unknown>;
}

interface EventLogState {
  entries: LogEntry[];
  paused: boolean;
  maxEntries: number;
  filter: { stream?: string; nodeId?: string; type?: string };
  push: (entry: Omit<LogEntry, "id">) => void;
  clear: () => void;
  setPaused: (p: boolean) => void;
  setFilter: (f: Partial<EventLogState["filter"]>) => void;
}

let nextId = 0;

export const useEventLogStore = create<EventLogState>()((set, get) => ({
  entries: [],
  paused: false,
  maxEntries: 500,
  filter: {},

  push: (entry) => {
    if (get().paused) return;
    const id = ++nextId;
    set((s) => ({
      entries: [{ ...entry, id }, ...s.entries].slice(0, s.maxEntries),
    }));
  },

  clear: () => set({ entries: [] }),

  setPaused: (p) => set({ paused: p }),

  setFilter: (f) =>
    set((s) => ({ filter: { ...s.filter, ...f } })),
}));
