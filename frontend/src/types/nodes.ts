export type HandleType =
  | "prompt"
  | "extraction"
  | "features"
  | "confidence"
  | "bridge_health"
  | "explanation"
  | "diagrams";

export type NodeCategory = "input" | "extraction" | "topology" | "scoring";

export interface HandleDefinition {
  id: string;
  type: HandleType;
  position: "top" | "bottom" | "left" | "right";
  label?: string;
}

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "slider";
  default?: unknown;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
}

export interface NodeDefinition {
  typeId: string;
  label: string;
  category: NodeCategory;
  inputs: HandleDefinition[];
  outputs: HandleDefinition[];
  configFields: ConfigField[];
  subscribesTo: string[];
}
