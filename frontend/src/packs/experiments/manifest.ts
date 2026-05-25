import type { PackManifest } from "../../types/pack";

export const manifest: PackManifest = {
  id: "experiments",
  version: "0.1.0",
  canvasKinds: [
    {
      id: "experiments",
      label: "Experiments",
      nodeTypeIds: [
        "experiment_cloud", "algorithm_selector", "experiment_roi", "findings_summary",
      ],
    },
  ],
  nodes: {
    experiment_cloud: {
      typeId: "experiment_cloud",
      label: "Experiment Cloud",
      category: "experiment",
      inputs: [],
      outputs: [],
      configFields: [],
      subscribesTo: [],
    },
    algorithm_selector: {
      typeId: "algorithm_selector",
      label: "Algorithm Selector",
      category: "experiment",
      inputs: [],
      outputs: [],
      configFields: [],
      subscribesTo: [],
    },
    experiment_roi: {
      typeId: "experiment_roi",
      label: "Experiment ROI",
      category: "experiment",
      inputs: [],
      outputs: [],
      configFields: [],
      subscribesTo: [],
    },
    findings_summary: {
      typeId: "findings_summary",
      label: "Findings Summary",
      category: "experiment",
      inputs: [],
      outputs: [],
      configFields: [],
      subscribesTo: [],
    },
  },
  streams: [],
  restEndpoints: [
    { method: "GET", path: "/api/experiments/algorithms" },
    { method: "GET", path: "/api/experiments/data" },
  ],
};
