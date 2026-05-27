import { create } from "zustand";

const SPLIT_KEY = "substrate:splitRatio";
const THEME_KEY = "substrate:theme";
const DEFAULT_SPLIT = 0.75;

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

export type AppTheme = "dark" | "light" | "screenshot";
const VALID_THEMES: AppTheme[] = ["dark", "light", "screenshot"];

function loadTheme(): AppTheme {
  try {
    const v = localStorage.getItem(THEME_KEY) as AppTheme | null;
    if (v && VALID_THEMES.includes(v)) return v;
  } catch {}
  return "dark";
}

import type { WsStatus } from "../ws/client";

export type DetailTab = "overview" | "timeseries" | "config" | "drift";

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  detailPanelTab: DetailTab;
  setDetailTab: (tab: DetailTab) => void;

  eventLogOpen: boolean;
  toggleEventLog: () => void;

  canvasSplitRatio: number;
  setCanvasSplitRatio: (ratio: number) => void;

  wsStatus: WsStatus;
  setWsStatus: (status: WsStatus) => void;

  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  detailPanelTab: "overview",
  setDetailTab: (tab) => set({ detailPanelTab: tab }),

  eventLogOpen: false,
  toggleEventLog: () => set((s) => ({ eventLogOpen: !s.eventLogOpen })),

  canvasSplitRatio: loadSplitRatio(),
  setCanvasSplitRatio: (ratio) => {
    const clamped = Math.min(0.8, Math.max(0.2, ratio));
    localStorage.setItem(SPLIT_KEY, String(clamped));
    set({ canvasSplitRatio: clamped });
  },

  wsStatus: "disconnected",
  setWsStatus: (status) => set({ wsStatus: status }),

  theme: loadTheme(),
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    set({ theme });
  },
}));
