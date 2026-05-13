import { useCallback, useMemo } from "react";
import { NODE_REGISTRY, CANVAS_NODE_TYPES, canvasTypeFromName } from "../../lib/nodes/registry";
import { useCanvasStore } from "../../lib/store/canvas-store";
import type { NodeCategory } from "../../types/nodes";

const CATEGORY_ORDER: NodeCategory[] = [
  "input",
  "extraction",
  "topology",
  "scoring",
];

const CATEGORY_COLORS: Record<NodeCategory, string> = {
  input: "bg-amber-900/40 border-amber-700",
  extraction: "bg-blue-900/40 border-blue-700",
  topology: "bg-cyan-900/40 border-cyan-700",
  scoring: "bg-emerald-900/40 border-emerald-700",
};

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  input: "Input",
  extraction: "Extraction",
  topology: "Topology",
  scoring: "Scoring",
};

export function NodePalette() {
  const addNode = useCanvasStore((s) => s.addNode);
  const graphName = useCanvasStore((s) => s.graphName);
  const allowedTypes = CANVAS_NODE_TYPES[canvasTypeFromName(graphName)];

  const handleAdd = useCallback(
    (typeId: string) => {
      const def = NODE_REGISTRY[typeId];
      if (!def) return;
      addNode({
        id: `${typeId}-${Date.now()}`,
        type: typeId,
        position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
        data: {},
      });
    },
    [addNode],
  );

  const grouped = useMemo(() => CATEGORY_ORDER.map((cat) => ({
    category: cat,
    nodes: Object.values(NODE_REGISTRY).filter((n) => n.category === cat && allowedTypes.has(n.typeId)),
  })).filter((g) => g.nodes.length > 0), [allowedTypes]);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
        Node Palette
      </div>
      {grouped.map(({ category, nodes }) => (
        <div key={category}>
          <div className="mb-1 text-[10px] font-medium text-neutral-500 uppercase">
            {CATEGORY_LABELS[category]}
          </div>
          <div className="flex flex-col gap-1">
            {nodes.map((def) => (
              <button
                key={def.typeId}
                onClick={() => handleAdd(def.typeId)}
                className={`rounded border px-2 py-1.5 text-left text-xs text-neutral-200 transition-colors hover:brightness-125 ${CATEGORY_COLORS[category]}`}
              >
                {def.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
