import { create } from "zustand";

const SPLIT_KEY = "substrate:splitRatio";
const DEFAULT_SPLIT = 0.55;

function loadSplitRatio(): number {
  try {
    const v = localStorage.getItem(SPLIT_KEY);
    if (v) {
      const n = parseFloat(v);
      if (!isNaN(n) && n >= 0.2 && n <= 0.8) return n;
    }
  } catch {}
  return DEFAULT_SPLIT;
}

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  configPanelNodeId: string | null;
  openConfigPanel: (nodeId: string) => void;
  closeConfigPanel: () => void;

  eventLogOpen: boolean;
  toggleEventLog: () => void;

  canvasSplitRatio: number;
  setCanvasSplitRatio: (ratio: number) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  configPanelNodeId: null,
  openConfigPanel: (nodeId) => set({ configPanelNodeId: nodeId }),
  closeConfigPanel: () => set({ configPanelNodeId: null }),

  eventLogOpen: false,
  toggleEventLog: () => set((s) => ({ eventLogOpen: !s.eventLogOpen })),

  canvasSplitRatio: loadSplitRatio(),
  setCanvasSplitRatio: (ratio) => {
    const clamped = Math.min(0.8, Math.max(0.2, ratio));
    localStorage.setItem(SPLIT_KEY, String(clamped));
    set({ canvasSplitRatio: clamped });
  },
}));
