import type { PackManifest } from "../../types/pack";
import { useCanvasStore } from "../../lib/store/canvas-store";
import { useLinkForgeStore } from "./store";

export const manifest: PackManifest = {
  id: "link-forge",
  version: "0.1.0",
  acceptsRuntimeRange: ">=0.1.0",
  onCanvasLoad: () => {
    const nodes = useCanvasStore.getState().nodes;
    const stateNode = nodes.find((n) => n.type === "r2_state");
    const cfg = stateNode?.data?.config as Record<string, unknown> | undefined;
    const savedStars = cfg?.starred_papers;
    const papers = Array.isArray(savedStars)
      ? new Set<string>(savedStars as string[])
      : new Set<string>();
    useLinkForgeStore.getState().resetStarred(papers);
  },
  canvasKinds: [
    {
      id: "research-bridge",
      label: "Research Bridge",
      nodeTypeIds: [
        "research_bridge", "research_coordinator", "lf_autorel", "lf_stats",
      ],
    },
    {
      id: "ingestion",
      label: "Ingestion",
      nodeTypeIds: ["lf_stage", "lf_pipeline_group"],
    },
  ],
  nodes: {
    lf_pipeline_group: {
      typeId: "lf_pipeline_group",
      label: "Paper Group",
      category: "input",
      inputs: [],
      outputs: [],
      configFields: [],
      subscribesTo: [],
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
  },
  streams: [
    { name: "linkforge:ingested", tier: "interactive" },
    { name: "linkforge:extracted", tier: "interactive" },
    { name: "linkforge:categorized", tier: "interactive" },
    { name: "linkforge:embedded", tier: "interactive" },
    { name: "linkforge:stored", tier: "interactive" },
    { name: "linkforge:chunked", tier: "interactive" },
    { name: "linkforge:auto_related", tier: "interactive" },
    { name: "linkforge:research_bridged", tier: "interactive" },
    { name: "linkforge:url_discovered", tier: "interactive" },
    { name: "linkforge:completed", tier: "interactive" },
    { name: "linkforge:autorel:sweep_completed", tier: "background" },
    { name: "topoconf:research:triaged", tier: "interactive" },
    { name: "topoconf:research:script_generated", tier: "interactive" },
    { name: "topoconf:research:experiment_started", tier: "interactive" },
    { name: "topoconf:research:experiment_completed", tier: "interactive" },
    { name: "topoconf:research:promoted", tier: "interactive" },
  ],
};
