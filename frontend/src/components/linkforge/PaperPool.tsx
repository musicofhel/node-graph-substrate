import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { PaperCard, type PaperSummary } from "./PaperCard";
import { PaperDetail } from "./PaperDetail";

const API_BASE = `http://${window.location.hostname}:8080`;

type SortKey = "recent" | "forge_score" | "processing_time" | "category";

interface Props {
  livePapers: PaperSummary[];
}

export const PaperPool = memo(({ livePapers }: Props) => {
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("recent");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [researchOnly, setResearchOnly] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const offsetRef = useRef(0);
  const fetchAcRef = useRef<AbortController | null>(null);
  const mergedLiveIds = useRef(new Set<string>());
  const newBadgeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const fetchHistory = useCallback(async (reset: boolean) => {
    if (loadingRef.current && !reset) return;
    fetchAcRef.current?.abort();
    const ac = new AbortController();
    fetchAcRef.current = ac;
    loadingRef.current = true;
    setLoading(true);
    const newOffset = reset ? 0 : offsetRef.current;
    try {
      const params = new URLSearchParams({
        limit: "50",
        offset: String(newOffset),
        ...(categoryFilter ? { category: categoryFilter } : {}),
        ...(researchOnly ? { research_only: "true" } : {}),
      });
      const resp = await fetch(`${API_BASE}/api/linkforge/history?${params}`, { signal: ac.signal });
      if (!resp.ok) return;
      const data: PaperSummary[] = await resp.json();
      if (ac.signal.aborted) return;
      if (reset) {
        setPapers(data);
        offsetRef.current = data.length;
      } else {
        setPapers((prev) => [...prev, ...data]);
        offsetRef.current = newOffset + data.length;
      }
      setHasMore(data.length === 50);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    } finally {
      if (!ac.signal.aborted) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [categoryFilter, researchOnly]);

  useEffect(() => {
    fetchHistory(true);
    return () => { fetchAcRef.current?.abort(); };
  }, [fetchHistory]);

  useEffect(() => {
    for (const lp of livePapers) {
      if (!mergedLiveIds.current.has(lp.queue_id)) {
        mergedLiveIds.current.add(lp.queue_id);
        setPapers((prev) => [{ ...lp, _isNew: true }, ...prev]);
        const qid = lp.queue_id;
        newBadgeTimers.current.push(
          setTimeout(() => {
            setPapers((prev) =>
              prev.map((p) =>
                p.queue_id === qid ? { ...p, _isNew: false } : p,
              ),
            );
          }, 300000),
        );
      }
    }
  }, [livePapers]);

  useEffect(() => {
    return () => { newBadgeTimers.current.forEach(clearTimeout); };
  }, []);

  const filtered = useMemo(() => {
    const sorted = [...papers];
    if (sort === "forge_score") {
      sorted.sort((a, b) => parseFloat(b.forge_score ?? "0") - parseFloat(a.forge_score ?? "0"));
    } else if (sort === "processing_time") {
      sorted.sort((a, b) => parseInt(b.processing_time_ms ?? "0", 10) - parseInt(a.processing_time_ms ?? "0", 10));
    } else if (sort === "category") {
      sorted.sort((a, b) => (a.category ?? "").localeCompare(b.category ?? ""));
    }
    if (!searchQuery) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter(
      (p) =>
        (p.title ?? "").toLowerCase().includes(q) ||
        (p.url ?? "").toLowerCase().includes(q),
    );
  }, [papers, sort, searchQuery]);

  const categories = useMemo(
    () => [...new Set(papers.map((p) => p.category).filter(Boolean))] as string[],
    [papers],
  );

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-1.5">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded bg-neutral-800 px-2 py-1 text-[10px] text-neutral-300 outline-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded bg-neutral-800 px-2 py-1 text-[10px] text-neutral-300 outline-none"
        >
          <option value="recent">Recent</option>
          <option value="forge_score">Forge Score</option>
          <option value="processing_time">Processing Time</option>
          <option value="category">Category</option>
        </select>
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 rounded bg-neutral-800 px-2 py-1 text-[10px] text-neutral-300 outline-none placeholder:text-neutral-600"
        />
        <label className="flex items-center gap-1 text-[10px] text-neutral-400">
          <input
            type="checkbox"
            checked={researchOnly}
            onChange={(e) => setResearchOnly(e.target.checked)}
            className="h-3 w-3"
          />
          Research
        </label>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-[60%] overflow-y-auto border-r border-neutral-800 p-2">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <PaperCard
                key={p.queue_id}
                paper={p}
                selected={p.queue_id === selectedId}
                onClick={() => setSelectedId(p.queue_id)}
              />
            ))}
          </div>
          {hasMore && (
            <button
              onClick={() => fetchHistory(false)}
              disabled={loading}
              className="mt-2 w-full rounded bg-neutral-800 py-1.5 text-[10px] text-neutral-400 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading..." : "Load more"}
            </button>
          )}
        </div>

        <div className="w-[40%]">
          {selectedId ? (
            <PaperDetail queueId={selectedId} />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-neutral-600">
              Select a paper
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
PaperPool.displayName = "PaperPool";
