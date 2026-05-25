import type { NodeDefinition } from "../types/nodes";
import type { PackManifest } from "../types/pack";
import { manifest as coreManifest } from "../packs/core/manifest";
import { manifest as topoConfidenceManifest } from "../packs/topo-confidence/manifest";
import { manifest as experimentsManifest } from "../packs/experiments/manifest";
import { manifest as linkForgeManifest } from "../packs/link-forge/manifest";

export type CanvasType = "pipeline" | "research" | "research2" | "experiments";

const ALL_PACKS: PackManifest[] = [
  coreManifest,
  topoConfidenceManifest,
  experimentsManifest,
  linkForgeManifest,
];

function buildNodeRegistry(): Record<string, NodeDefinition> {
  const registry: Record<string, NodeDefinition> = {};
  for (const pack of ALL_PACKS) {
    for (const [typeId, def] of Object.entries(pack.nodes)) {
      registry[typeId] = def;
    }
  }
  return registry;
}

function buildCanvasNodeTypes(): Record<CanvasType, Set<string>> {
  const map = {} as Record<CanvasType, Set<string>>;
  for (const pack of ALL_PACKS) {
    for (const kind of pack.canvasKinds) {
      map[kind.id as CanvasType] = new Set(kind.nodeTypeIds);
    }
  }
  return map;
}

export const NODE_REGISTRY: Record<string, NodeDefinition> = buildNodeRegistry();

export const CANVAS_NODE_TYPES: Record<CanvasType, Set<string>> = buildCanvasNodeTypes();

export function canvasTypeFromName(name: string | null): CanvasType {
  if (name && /experiment/i.test(name)) return "experiments";
  if (name && /research\s*v?2/i.test(name)) return "research2";
  if (name && name.toLowerCase().includes("research")) return "research";
  return "pipeline";
}

export { ALL_PACKS as packManifests };
