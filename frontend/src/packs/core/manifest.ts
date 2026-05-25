import type { PackManifest } from "../../types/pack";

export const manifest: PackManifest = {
  id: "core",
  version: "0.1.0",
  acceptsRuntimeRange: ">=0.1.0",
  canvasKinds: [],
  nodes: {
    canvas_ref: {
      typeId: "canvas_ref",
      label: "Canvas Ref",
      category: "navigation",
      inputs: [],
      outputs: [],
      configFields: [],
      subscribesTo: [],
    },
    run_ref: {
      typeId: "run_ref",
      label: "Run Ref",
      category: "navigation",
      inputs: [],
      outputs: [],
      configFields: [],
      subscribesTo: [],
    },
    node_ref: {
      typeId: "node_ref",
      label: "Node Ref",
      category: "navigation",
      inputs: [],
      outputs: [],
      configFields: [],
      subscribesTo: [],
    },
  },
  streams: [],
};
