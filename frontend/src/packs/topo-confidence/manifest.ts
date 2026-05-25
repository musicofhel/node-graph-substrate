import type { PackManifest } from "../../types/pack";

export const manifest: PackManifest = {
  id: "topo-confidence",
  version: "0.1.0",
  acceptsRuntimeRange: ">=0.1.0",
  canvasKinds: [
    {
      id: "pipeline",
      label: "Pipeline",
      nodeTypeIds: [
        "prompt_input", "feature_bars", "hidden_state_cloud", "persistence_diagram",
        "confidence_gauge", "bridge_monitor", "explain_waterfall", "drift_matrix",
        "breathing_heatmap", "h1_loop",
      ],
      hasRuns: true,
    },
  ],
  nodes: {
    prompt_input: {
      typeId: "prompt_input",
      label: "Prompt Input",
      category: "input",
      inputs: [],
      outputs: [
        { id: "features_out", type: "features", position: "bottom", label: "Features" },
      ],
      configFields: [
        { key: "prompt", label: "Prompt", type: "text", default: "" },
      ],
      subscribesTo: [],
    },
    feature_bars: {
      typeId: "feature_bars",
      label: "Feature Bars",
      category: "topology",
      inputs: [
        { id: "features_in", type: "features", position: "top", label: "Features" },
      ],
      outputs: [],
      configFields: [
        { key: "normalize", label: "Normalization", type: "select", options: [{ label: "Raw", value: "raw" }, { label: "Z-Score", value: "z-score" }, { label: "Min-Max", value: "min-max" }], default: "raw" },
        { key: "sort_by", label: "Sort", type: "select", options: [{ label: "Default", value: "default" }, { label: "Value ↓", value: "value_desc" }, { label: "Value ↑", value: "value_asc" }, { label: "Alpha", value: "alpha" }], default: "default" },
      ],
      subscribesTo: ["topoconf:scoring:features_computed"],
    },
    hidden_state_cloud: {
      typeId: "hidden_state_cloud",
      label: "Hidden State Cloud",
      category: "extraction",
      inputs: [
        { id: "features_in", type: "features", position: "top", label: "Features" },
      ],
      outputs: [],
      configFields: [
        { key: "point_size", label: "Point Size", type: "slider", min: 1, max: 10, step: 0.5, default: 3 },
        { key: "show_bridge", label: "Highlight Bridge", type: "boolean", default: true },
      ],
      subscribesTo: ["topoconf:scoring:hidden_state_cloud"],
    },
    persistence_diagram: {
      typeId: "persistence_diagram",
      label: "Persistence Diagram",
      category: "topology",
      inputs: [
        { id: "features_in", type: "features", position: "top", label: "Features" },
      ],
      outputs: [],
      configFields: [
        { key: "show_h0", label: "Show H0", type: "boolean", default: true },
        { key: "show_h1", label: "Show H1", type: "boolean", default: true },
        { key: "show_h2", label: "Show H2", type: "boolean", default: true },
        { key: "min_lifetime", label: "Min Lifetime", type: "slider", min: 0, max: 1, step: 0.01, default: 0 },
      ],
      subscribesTo: ["topoconf:scoring:persistence_computed"],
    },
    confidence_gauge: {
      typeId: "confidence_gauge",
      label: "Confidence Gauge",
      category: "scoring",
      inputs: [
        { id: "features_in", type: "features", position: "top", label: "Features" },
      ],
      outputs: [],
      configFields: [
        { key: "threshold_low", label: "Low Threshold", type: "slider", min: 0, max: 1, step: 0.05, default: 0.4 },
        { key: "threshold_high", label: "High Threshold", type: "slider", min: 0, max: 1, step: 0.05, default: 0.7 },
        { key: "alert_enabled", label: "Alerts", type: "boolean", default: true },
      ],
      subscribesTo: ["topoconf:scoring:confidence_scored"],
    },
    bridge_monitor: {
      typeId: "bridge_monitor",
      label: "Bridge Monitor",
      category: "scoring",
      inputs: [
        { id: "features_in", type: "features", position: "top", label: "Features" },
      ],
      outputs: [],
      configFields: [
        { key: "silhouette_threshold", label: "Sil Threshold", type: "slider", min: -1, max: 1, step: 0.05, default: 0 },
        { key: "crystallization_threshold", label: "Cryst Threshold", type: "slider", min: 0, max: 1, step: 0.05, default: 0.8 },
      ],
      subscribesTo: ["topoconf:scoring:bridge_health"],
    },
    explain_waterfall: {
      typeId: "explain_waterfall",
      label: "Explain Waterfall",
      category: "scoring",
      inputs: [
        { id: "features_in", type: "features", position: "top", label: "Features" },
      ],
      outputs: [],
      configFields: [
        { key: "top_n", label: "Top N Features", type: "slider", min: 5, max: 13, step: 1, default: 13 },
        { key: "sort_order", label: "Sort", type: "select", options: [{ label: "Abs Contribution", value: "abs_contribution" }, { label: "Positive First", value: "positive_first" }, { label: "Negative First", value: "negative_first" }, { label: "Alpha", value: "alpha" }], default: "abs_contribution" },
      ],
      subscribesTo: ["topoconf:scoring:explain_result"],
    },
    drift_matrix: {
      typeId: "drift_matrix",
      label: "Drift Matrix",
      category: "scoring",
      inputs: [],
      outputs: [],
      configFields: [],
      subscribesTo: [],
    },
    breathing_heatmap: {
      typeId: "breathing_heatmap",
      label: "Layer Breathing Heatmap",
      category: "topology",
      inputs: [{ id: "features_in", type: "features", position: "top", label: "Features" }],
      outputs: [],
      configFields: [],
      subscribesTo: ["topoconf:scoring:breathing_profile"],
    },
    h1_loop: {
      typeId: "h1_loop",
      label: "H1 Topological Loops",
      category: "topology",
      inputs: [{ id: "features_in", type: "features", position: "top", label: "Features" }],
      outputs: [],
      configFields: [
        { key: "reduction", label: "Reduction", type: "select",
          options: [{ label: "PCA", value: "pca" }, { label: "UMAP", value: "umap" }], default: "pca" },
        { key: "layer", label: "Layer", type: "select",
          options: [{ label: "L28 (final)", value: "28" }, { label: "L19 (peak)", value: "19" }], default: "28" },
      ],
      subscribesTo: [],
    },
  },
  streams: [
    { name: "topoconf:scoring:features_computed", tier: "interactive" },
    { name: "topoconf:scoring:hidden_state_cloud", tier: "interactive" },
    { name: "topoconf:scoring:persistence_computed", tier: "interactive" },
    { name: "topoconf:scoring:confidence_scored", tier: "interactive" },
    { name: "topoconf:scoring:bridge_health", tier: "interactive" },
    { name: "topoconf:scoring:explain_result", tier: "interactive" },
    { name: "topoconf:scoring:breathing_profile", tier: "interactive" },
  ],
};
