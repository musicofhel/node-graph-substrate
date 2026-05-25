import { create } from "zustand";

interface ExperimentState {
  algorithmA: string;
  algorithmB: string;
  problemIdx: number;
  layer: string;
  viewMode: "2d" | "3d";
  setAlgorithmA: (algo: string) => void;
  setAlgorithmB: (algo: string) => void;
  setProblemIdx: (idx: number) => void;
  setLayer: (layer: string) => void;
  setViewMode: (mode: "2d" | "3d") => void;
}

export const useExperimentStore = create<ExperimentState>((set) => ({
  algorithmA: "pca_raw",
  algorithmB: "dom_probe",
  problemIdx: 0,
  layer: "19",
  viewMode: "3d",
  setAlgorithmA: (algo) => set({ algorithmA: algo }),
  setAlgorithmB: (algo) => set({ algorithmB: algo }),
  setProblemIdx: (idx) => set({ problemIdx: idx }),
  setLayer: (layer) => set({ layer }),
  setViewMode: (mode) => set({ viewMode: mode }),
}));
