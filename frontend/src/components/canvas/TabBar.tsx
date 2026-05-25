import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../../lib/api";
import { useSessionStore } from "../../features/workspace/useProjectSession";

interface GraphTab {
  id: string;
  name: string;
  current_version: number;
}

interface TabBarProps {
  projectId: string | null;
  activeGraphId: string | null | undefined;
  onSelectGraph: (graphId: string) => void;
}

export function TabBar({ projectId, activeGraphId, onSelectGraph }: TabBarProps) {
  const [tabs, setTabs] = useState<GraphTab[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchTabs = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return;
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}/graphs`, { signal });
      if (resp.ok && !signal?.aborted) {
        setTabs(await resp.json());
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }, [projectId]);

  useEffect(() => {
    const ac = new AbortController();
    fetchTabs(ac.signal);
    return () => { ac.abort(); };
  }, [fetchTabs]);

  const handleCreate = async () => {
    if (!projectId) return;
    const CANVAS_NAMES = ["Pipeline", "Research", "Research v2", "Experiments"];
    const existingNames = new Set(tabs.map((t) => t.name));
    const name = CANVAS_NAMES.find((n) => !existingNames.has(n)) ?? `Canvas ${tabs.length + 1}`;
    try {
      const resp = await fetch(`${API_BASE}/api/graphs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, name }),
      });
      if (resp.ok) {
        const graph = await resp.json();
        useSessionStore.getState().openCanvas(graph.id);
        await fetchTabs();
        onSelectGraph(graph.id);
      }
    } catch {
      // silent
    }
  };

  if (!projectId) return null;

  return (
    <div className="flex h-9 shrink-0 items-center border-b border-neutral-800 bg-neutral-950">
      <div
        ref={scrollRef}
        className="flex flex-1 items-center gap-px overflow-x-auto px-1"
        style={{ scrollbarWidth: "none" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSelectGraph(tab.id)}
            className={`flex h-7 shrink-0 items-center rounded-t px-3 text-xs transition-colors ${
              tab.id === activeGraphId
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>
      <button
        onClick={handleCreate}
        className="flex h-7 w-7 shrink-0 items-center justify-center text-neutral-500 hover:text-white"
        title="New graph"
      >
        +
      </button>
    </div>
  );
}
