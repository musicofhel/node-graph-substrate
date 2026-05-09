import { useCallback, useState } from "react";
import { useCanvasStore } from "../../lib/store/canvas-store";

export function CanvasControls() {
  const graphId = useCanvasStore((s) => s.graphId);
  const graphVersion = useCanvasStore((s) => s.graphVersion);
  const dirty = useCanvasStore((s) => s.dirty);
  const saveGraph = useCanvasStore((s) => s.saveGraph);
  const loadGraph = useCanvasStore((s) => s.loadGraph);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
