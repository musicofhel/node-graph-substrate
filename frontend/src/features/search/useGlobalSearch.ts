import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { API_BASE } from "../../lib/api";
import { useCanvasStore } from "../../lib/store/canvas-store";
import { NODE_REGISTRY } from "../../lib/pack-registry";

export interface SearchResult {
  kind: "project" | "canvas" | "run" | "node";
  id: string;
  label: string;
  sublabel?: string | null;
  url: string;
}

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

async function fetchSearch(query: string): Promise<SearchResult[]> {
  const resp = await fetch(
    `${API_BASE}/api/search?q=${encodeURIComponent(query)}`,
  );
  if (!resp.ok) return [];
  return resp.json();
}

export function useGlobalSearch() {
  const [rawQuery, setQuery] = useState("");
  const debouncedQuery = useDebounce(rawQuery, 150);

  const { data: serverResults = [], isFetching } = useQuery({
    queryKey: ["global-search", debouncedQuery],
    queryFn: () => fetchSearch(debouncedQuery),
    enabled: debouncedQuery.length > 0,
    staleTime: 10_000,
    placeholderData: (prev: SearchResult[] | undefined) => prev,
  });

  const nodes = useCanvasStore((s) => s.nodes);
  const projectId = useCanvasStore((s) => s.projectId);
  const graphId = useCanvasStore((s) => s.graphId);

  const nodeResults: SearchResult[] = useMemo(() => {
    const q = rawQuery.toLowerCase().trim();
    if (!q || !graphId) return [];
    return nodes
      .filter((n) => {
        const def = NODE_REGISTRY[n.type ?? ""];
        const label = def?.label ?? n.type ?? "";
        const typeId = n.type ?? "";
        return label.toLowerCase().includes(q) || typeId.toLowerCase().includes(q);
      })
      .slice(0, 10)
      .map((n) => {
        const def = NODE_REGISTRY[n.type ?? ""];
        return {
          kind: "node" as const,
          id: n.id,
          label: def?.label ?? n.type ?? n.id,
          sublabel: n.type,
          url: `/p/${projectId}/c/${graphId}`,
        };
      });
  }, [rawQuery, nodes, projectId, graphId]);

  const results = useMemo(
    () => [...serverResults, ...nodeResults],
    [serverResults, nodeResults],
  );

  return { query: rawQuery, setQuery, results, isFetching };
}
