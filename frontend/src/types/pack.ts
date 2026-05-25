import type { NodeDefinition } from "./nodes";

export interface CanvasKindDef {
  id: string;
  label: string;
  nodeTypeIds: string[];
  hasRuns?: boolean;
}

export interface StreamDef {
  name: string;
  tier: "realtime" | "interactive" | "background";
}

export interface RestEndpointDef {
  method: string;
  path: string;
}

export interface PackManifest {
  id: string;
  version: string;
  canvasKinds: CanvasKindDef[];
  nodes: Record<string, NodeDefinition>;
  streams: StreamDef[];
  restEndpoints?: RestEndpointDef[];
  onCanvasLoad?: () => void;
  onCanvasSave?: () => void;
}
