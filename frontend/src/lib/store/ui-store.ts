import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  configPanelNodeId: string | null;
  setSidebarOpen: (open: boolean) => void;
  setConfigPanelNodeId: (id: string | null) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: false,
  configPanelNodeId: null,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setConfigPanelNodeId: (id) => set({ configPanelNodeId: id }),
}));
