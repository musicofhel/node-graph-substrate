import { useCallback, useState } from "react";
import { useCanvasStore } from "../../lib/store/canvas-store";
import { useUIStore } from "../../lib/store/ui-store";
import { useDriftStore } from "../../lib/store/drift-store";
import { useLinkForgeStore } from "../../packs/link-forge/store";
import { canvasTypeFromName } from "../../lib/pack-registry";

export function CanvasControls() {
  const graphId = useCanvasStore((s) => s.graphId);
  const graphName = useCanvasStore((s) => s.graphName);
  const graphVersion = useCanvasStore((s) => s.graphVersion);
  const dirty = useCanvasStore((s) => s.dirty);
  const saveGraph = useCanvasStore((s) => s.saveGraph);
  const loadGraph = useCanvasStore((s) => s.loadGraph);
  const autoLayout = useCanvasStore((s) => s.autoLayout);
  const flushUnstarred = useLinkForgeStore((s) => s.flushUnstarred);
  const starredCount = useLinkForgeStore((s) => s.starredPapers.size);
  const eventLogOpen = useUIStore((s) => s.eventLogOpen);
  const toggleEventLog = useUIStore((s) => s.toggleEventLog);
  const baselineMode = useDriftStore((s) => s.baselineMode);
  const hasBaselines = useDriftStore((s) => s.baselines.size > 0);
  const saveAllBaselines = useDriftStore((s) => s.saveAllBaselines);
  const clearAllBaselines = useDriftStore((s) => s.clearAllBaselines);
  const setBaselineMode = useDriftStore((s) => s.setBaselineMode);
  const [saving, setSaving] = useState(false);
  const [layouting, setLayouting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasType = canvasTypeFromName(graphName);

  const handleSave = useCallback(async () => {
    if (!graphId) return;
    setSaving(true);
    setError(null);
    try {
      await saveGraph();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [graphId, saveGraph]);

  const handleLoad = useCallback(async () => {
    const id = prompt("Enter graph ID:");
    if (!id) return;
    setError(null);
    try {
      await loadGraph(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [loadGraph]);

  const handleLayout = useCallback(async () => {
    setLayouting(true);
    setError(null);
    try {
      await autoLayout();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Layout failed");
    } finally {
      setLayouting(false);
    }
  }, [autoLayout]);

  // Layout breaks shift-right group positioning on research canvas
  const layoutEnabled = canvasType !== "research";

  return (
    <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
      {error && (
        <span className="rounded bg-red-900/80 px-2 py-1 text-xs text-red-200">
          {error}
        </span>
      )}
      {graphId && (
        <span className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-400">
          v{graphVersion}
          {dirty ? " *" : ""}
        </span>
      )}
      {canvasType === "research2" && (
        <>
          {starredCount > 0 && (
            <span className="rounded bg-amber-900/50 px-2 py-1 text-xs text-amber-400">
              ★ {starredCount}
            </span>
          )}
          <button
            onClick={flushUnstarred}
            className="rounded bg-red-900/80 px-3 py-1 text-sm text-red-200 hover:bg-red-800"
          >
            Flush
          </button>
        </>
      )}
      {layoutEnabled && (
        <button
          onClick={handleLayout}
          disabled={layouting}
          className="rounded bg-indigo-700 px-3 py-1 text-sm text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {layouting ? "..." : "Layout"}
        </button>
      )}
      <div className="flex items-center rounded bg-neutral-800 text-xs">
        <button
          onClick={() => setBaselineMode("rolling")}
          className={`rounded-l px-2 py-1 ${baselineMode === "rolling" ? "bg-blue-700 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
        >
          Rolling
        </button>
        <button
          onClick={() => setBaselineMode("snapshot")}
          className={`rounded-r px-2 py-1 ${baselineMode === "snapshot" ? "bg-blue-700 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
        >
          Baseline
        </button>
      </div>
      <button
        onClick={() => saveAllBaselines(`manual-${Date.now()}`)}
        className="rounded bg-cyan-800 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-700"
        title="Snapshot current distributions as baseline"
      >
        Snapshot
      </button>
      {hasBaselines && (
        <button
          onClick={clearAllBaselines}
          className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-600"
        >
          Clear
        </button>
      )}
      <button
        onClick={toggleEventLog}
        className={`rounded px-3 py-1 text-sm ${
          eventLogOpen
            ? "bg-blue-700 text-white"
            : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
        }`}
      >
        Log
      </button>
      <button
        onClick={handleSave}
        disabled={!graphId || saving || !dirty}
        className="rounded bg-emerald-700 px-3 py-1 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>
      <button
        onClick={handleLoad}
        className="rounded bg-neutral-700 px-3 py-1 text-sm text-white hover:bg-neutral-600"
      >
        Load
      </button>
    </div>
  );
}
