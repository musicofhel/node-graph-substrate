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
    inputs: [
      { id: "features_in", type: "features", position: "top", label: "Features" },
    ],
    outputs: [],
    configFields: [],
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
    configFields: [],
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
    configFields: [],
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
    configFields: [],
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
    configFields: [],
    subscribesTo: ["topoconf:scoring:explain_result"],
  },
  lf_stage: {
    typeId: "lf_stage",
    label: "Pipeline Stage",
    category: "extraction",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: [],
  },
  lf_coordinator: {
    typeId: "lf_coordinator",
    label: "Pipeline Coordinator",
    category: "input",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: [
      "linkforge:ingested",
      "linkforge:extracted",
      "linkforge:categorized",
      "linkforge:embedded",
      "linkforge:stored",
      "linkforge:chunked",
      "linkforge:auto_related",
      "linkforge:research_bridged",
      "linkforge:url_discovered",
      "linkforge:completed",
    ],
  },
  lf_stats: {
    typeId: "lf_stats",
    label: "Pipeline Stats",
    category: "scoring",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: ["linkforge:completed"],
  },
  lf_autorel: {
    typeId: "lf_autorel",
    label: "AutoRel Status",
    category: "scoring",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: ["linkforge:autorel:sweep_completed"],
  },
  research_bridge: {
    typeId: "research_bridge",
    label: "Research Bridge",
    category: "input",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: ["linkforge:research_bridged"],
  },
  research_coordinator: {
    typeId: "research_coordinator",
    label: "Research Coordinator",
    category: "scoring",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: [
      "topoconf:research:triaged",
      "topoconf:research:script_generated",
      "topoconf:research:experiment_started",
      "topoconf:research:experiment_completed",
      "topoconf:research:promoted",
    ],
  },
  r2_bridge: {
    typeId: "r2_bridge",
    label: "Research Bridge",
    category: "input",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: ["linkforge:research_bridged"],
  },
  r2_coordinator: {
    typeId: "r2_coordinator",
    label: "Research Coordinator",
    category: "scoring",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: [
      "topoconf:research:triaged",
      "topoconf:research:script_generated",
      "topoconf:research:experiment_started",
      "topoconf:research:experiment_completed",
      "topoconf:research:promoted",
    ],
  },
  r2_stats: {
    typeId: "r2_stats",
    label: "Pipeline Stats",
    category: "scoring",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: ["linkforge:completed"],
  },
  r2_autorel: {
    typeId: "r2_autorel",
    label: "AutoRel Status",
    category: "scoring",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: ["linkforge:autorel:sweep_completed"],
  },
  r2_state: {
    typeId: "r2_state",
    label: "State",
    category: "input",
    inputs: [],
    outputs: [],
    configFields: [],
    subscribesTo: [],
  },
};

export type CanvasType = "pipeline" | "research" | "research2";

export const CANVAS_NODE_TYPES: Record<CanvasType, Set<string>> = {
  pipeline: new Set([
    "prompt_input", "feature_bars", "hidden_state_cloud", "persistence_diagram",
    "confidence_gauge", "bridge_monitor", "explain_waterfall",
  ]),
  research: new Set([
    "research_bridge", "research_coordinator", "lf_autorel", "lf_stats",
  ]),
  research2: new Set([
    "r2_bridge", "r2_coordinator", "r2_stats", "r2_autorel",
  ]),
};

export function canvasTypeFromName(name: string | null): CanvasType {
  if (name && /research\s*v?2/i.test(name)) return "research2";
  if (name && name.toLowerCase().includes("research")) return "research";
  return "pipeline";
}
