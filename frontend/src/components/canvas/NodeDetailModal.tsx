import { useCallback, useEffect } from "react";
import { useCanvasStore } from "../../lib/store/canvas-store";
import { useUIStore } from "../../lib/store/ui-store";
import { NODE_REGISTRY } from "../../lib/nodes/registry";
import { HANDLE_COLORS } from "../../lib/nodes/handle-colors";
import type { HandleType } from "../../types/nodes";

const CATEGORY_COLORS: Record<string, { border: string; badge: string }> = {
  input: { border: "border-amber-700", badge: "bg-amber-900/60 text-amber-400" },
  extraction: { border: "border-blue-700", badge: "bg-blue-900/60 text-blue-400" },
  topology: { border: "border-cyan-700", badge: "bg-cyan-900/60 text-cyan-400" },
  scoring: { border: "border-emerald-700", badge: "bg-emerald-900/60 text-emerald-400" },
};

function StatusBadge({ status }: { status: string }) {
  if (status === "computing") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-900/50 px-2 py-0.5 text-[10px] font-medium text-amber-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        Computing
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-900/50 px-2 py-0.5 text-[10px] font-medium text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
      <span className="h-1.5 w-1.5 rounded-full bg-neutral-500" />
      Idle
    </span>
  );
}

function HandleDot({ type }: { type: string }) {
  const color = HANDLE_COLORS[type as HandleType] ?? "#737373";
  return <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />;
}

function SectionHeader({ title }: { title: string }) {
  return <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">{title}</div>;
}

function JsonValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-neutral-500">null</span>;
  if (typeof value === "boolean") return <span className="text-cyan-400">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-amber-400">{value}</span>;
  if (typeof value === "string") return <span className="text-emerald-400">"{value.length > 200 ? value.slice(0, 200) + "..." : value}"</span>;
  return (
    <pre className="max-h-[200px] overflow-auto rounded bg-neutral-950 p-2 text-[11px] text-neutral-300 leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function NodeDetailModal() {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useCanvasStore((s) => s.setSelectedNodeId);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  const close = useCallback(() => setSelectedNodeId(null), [setSelectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedNodeId, close]);

  if (!selectedNodeId) return null;

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const def = node.type ? NODE_REGISTRY[node.type] : undefined;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const config = (data.config ?? {}) as Record<string, unknown>;
  const status = typeof data.status === "string" ? data.status : undefined;
  const catColors = CATEGORY_COLORS[def?.category ?? ""] ?? CATEGORY_COLORS.scoring;

  const incomingEdges = edges.filter((e) => e.target === selectedNodeId);
  const outgoingEdges = edges.filter((e) => e.source === selectedNodeId);

  const liveData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k !== "config" && k !== "status") liveData[k] = v;
  }

  const resolveNodeLabel = (nodeId: string) => {
    const n = nodes.find((nd) => nd.id === nodeId);
    if (!n) return nodeId;
    const d = n.type ? NODE_REGISTRY[n.type] : undefined;
    return d ? `${d.label} (${nodeId})` : nodeId;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={close}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto rounded-xl border ${catColors.border} bg-neutral-900 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-neutral-200">
              {def?.label ?? node.type ?? "Unknown"}
            </span>
            {def && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${catColors.badge}`}>
                {def.category}
              </span>
            )}
            {status && <StatusBadge status={status} />}
          </div>
          <button onClick={close} className="text-neutral-500 hover:text-neutral-300 transition-colors text-lg leading-none px-1">
            &times;
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Node ID */}
          <div>
            <SectionHeader title="Node ID" />
            <span className="font-mono text-xs text-neutral-400">{node.id}</span>
          </div>

          {/* Config */}
          {Object.keys(config).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <SectionHeader title="Configuration" />
                {def && def.configFields.length > 0 && (
                  <button
                    onClick={() => {
                      close();
                      useUIStore.getState().openConfigPanel(selectedNodeId);
                    }}
                    className="rounded bg-blue-900/60 px-2 py-0.5 text-[10px] font-medium text-blue-400 hover:bg-blue-800/60"
                  >
                    Edit
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {Object.entries(config).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-xs">
                    <span className="shrink-0 text-neutral-500">{k}:</span>
                    <JsonValue value={v} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inputs & Outputs */}
          {def && (def.inputs.length > 0 || def.outputs.length > 0) && (
            <div className="grid grid-cols-2 gap-4">
              {def.inputs.length > 0 && (
                <div>
                  <SectionHeader title="Inputs" />
                  <div className="space-y-1">
                    {def.inputs.map((h) => (
                      <div key={h.id} className="flex items-center gap-2 text-xs text-neutral-400">
                        <HandleDot type={h.type} />
                        <span className="font-mono">{h.label ?? h.id}</span>
                        <span className="text-neutral-600">({h.type})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {def.outputs.length > 0 && (
                <div>
                  <SectionHeader title="Outputs" />
                  <div className="space-y-1">
                    {def.outputs.map((h) => (
                      <div key={h.id} className="flex items-center gap-2 text-xs text-neutral-400">
                        <HandleDot type={h.type} />
                        <span className="font-mono">{h.label ?? h.id}</span>
                        <span className="text-neutral-600">({h.type})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Connections */}
          {(incomingEdges.length > 0 || outgoingEdges.length > 0) && (
            <div>
              <SectionHeader title="Connections" />
              <div className="space-y-1 text-xs text-neutral-400">
                {incomingEdges.map((e) => (
                  <div key={e.id} className="flex items-center gap-1.5">
                    <span className="text-blue-400">&larr;</span>
                    <span className="font-mono text-neutral-500">{e.sourceHandle ?? "out"}</span>
                    <span className="text-neutral-600">from</span>
                    <span className="truncate">{resolveNodeLabel(e.source)}</span>
                  </div>
                ))}
                {outgoingEdges.map((e) => (
                  <div key={e.id} className="flex items-center gap-1.5">
                    <span className="text-emerald-400">&rarr;</span>
                    <span className="font-mono text-neutral-500">{e.sourceHandle ?? "out"}</span>
                    <span className="text-neutral-600">to</span>
                    <span className="truncate">{resolveNodeLabel(e.target)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subscribed Streams */}
          {def && def.subscribesTo.length > 0 && (
            <div>
              <SectionHeader title="Subscribed Streams" />
              <div className="flex flex-wrap gap-1.5">
                {def.subscribesTo.map((s) => (
                  <span key={s} className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-[11px] text-neutral-400">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Live Data */}
          {Object.keys(liveData).length > 0 && (
            <div>
              <SectionHeader title="Live Data" />
              <pre className="max-h-[200px] overflow-auto rounded border border-neutral-800 bg-neutral-950 p-3 text-[11px] text-neutral-300 leading-relaxed">
                {JSON.stringify(liveData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
