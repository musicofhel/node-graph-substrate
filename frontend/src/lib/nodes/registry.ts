import type { NodeDefinition } from "../../types/nodes";

export const NODE_REGISTRY: Record<string, NodeDefinition> = {
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
    configFields: [],
    subscribesTo: ["topoconf:scoring:features_computed"],
  },
  hidden_state_cloud: {
    typeId: "hidden_state_cloud",
    label: "Hidden State Cloud",
    category: "extraction",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: ["topoconf:scoring:hidden_state_cloud"],
  },
  persistence_diagram: {
    typeId: "persistence_diagram",
    label: "Persistence Diagram",
    category: "topology",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: ["topoconf:scoring:persistence_computed"],
  },
  confidence_gauge: {
    typeId: "confidence_gauge",
    label: "Confidence Gauge",
    category: "scoring",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: ["topoconf:scoring:confidence_scored"],
  },
  bridge_monitor: {
    typeId: "bridge_monitor",
    label: "Bridge Monitor",
    category: "scoring",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: ["topoconf:scoring:bridge_health"],
  },
  explain_waterfall: {
    typeId: "explain_waterfall",
    label: "Explain Waterfall",
    category: "scoring",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: ["topoconf:scoring:explain_result"],
  },
};
