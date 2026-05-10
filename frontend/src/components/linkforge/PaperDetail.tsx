import { memo, useEffect, useState } from "react";

const API_BASE = `http://${window.location.hostname}:8080`;

interface StageInfo {
  name: string;
  label: string;
  done: boolean;
}

const STAGES: StageInfo[] = [
  { name: "ingested", label: "Ingested", done: false },
  { name: "extracted", label: "Extracted", done: false },
  { name: "categorized", label: "Categorized", done: false },
  { name: "embedded", label: "Embedded", done: false },
  { name: "stored", label: "Stored", done: false },
  { name: "chunked", label: "Chunked", done: false },
  { name: "auto_related", label: "Auto Related", done: false },
  { name: "research_bridged", label: "Research Bridge", done: false },
  { name: "url_discovered", label: "URLs Discovered", done: false },
  { name: "completed", label: "Completed", done: false },
];

const STAGE_INDICATORS: Record<string, string[]> = {
  ingested: ["url", "source"],
  extracted: ["title", "summary"],
  categorized: ["category"],
  embedded: [],
  stored: ["stored_done", "relationship_count"],
  chunked: ["chunk_count"],
  auto_related: ["match_count"],
  research_bridged: ["research_relevant"],
  url_discovered: ["urls_found"],
  completed: ["completed_at", "success"],
};

interface Props {
  queueId: string;
}

export const PaperDetail = memo(({ queueId }: Props) => {
  const [paper, setPaper] = useState<Record<string, string> | null>(null);
  const [research, setResearch] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/linkforge/paper/${queueId}`);
        if (!resp.ok || cancelled) return;
        const data = await resp.json();
        if (cancelled) return;
        setPaper(data);

        if (data.research_relevant === "true" && data.arxiv_id) {
          const rResp = await fetch(`${API_BASE}/api/linkforge/paper/${queueId}/research`);
          if (rResp.ok && !cancelled) {
            setResearch(await rResp.json());
          }
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [queueId]);

  if (loading) {
    return <div className="p-4 text-xs text-neutral-500">Loading...</div>;
  }
  if (!paper) {
    return <div className="p-4 text-xs text-neutral-500">Paper not found</div>;
  }

  const success = paper.success === "true";
  const highestDone = STAGES.reduce((acc, s, i) => {
    const indicators = STAGE_INDICATORS[s.name] ?? [];
    if (indicators.some((k) => k in paper && paper[k] !== "")) return i;
    return acc;
  }, -1);
  const stages = STAGES.map((s, i) => ({
    ...s,
    done: i <= highestDone,
  }));

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-neutral-200 truncate">
          {paper.title || paper.url || queueId}
        </h3>
        {paper.url && (
          <a href={paper.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline truncate block">
            {paper.url}
          </a>
        )}
      </div>

      <div className="mb-4">
        <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
          Pipeline Stages
        </h4>
        <div className="space-y-1">
          {stages.map((s) => (
            <div key={s.name} className="flex items-center gap-2 text-xs">
              <span className={`h-3 w-3 rounded-full border ${
                s.done
                  ? s.name === "completed" && !success
                    ? "border-red-500 bg-red-500"
                    : "border-emerald-500 bg-emerald-500"
                  : "border-neutral-600"
              }`} />
              <span className={s.done ? "text-neutral-300" : "text-neutral-600"}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {paper.summary && (
        <div className="mb-3">
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Summary</h4>
          <p className="text-xs text-neutral-400">{paper.summary}</p>
        </div>
      )}

      {paper.category && (
        <div className="mb-3 flex flex-wrap gap-1">
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300">{paper.category}</span>
          {paper.content_type && (
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">{paper.content_type}</span>
          )}
        </div>
      )}

      {research && (
        <div className="mt-4 border-t border-neutral-800 pt-3">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
            Research Lifecycle
          </h4>
          <div className="space-y-1 text-xs text-neutral-400">
            {research.status && (
              <div className="flex justify-between">
                <span>Status</span>
                <span className="text-neutral-200">{research.status}</span>
              </div>
            )}
            {research.fe_count && (
              <div className="flex justify-between">
                <span>Experiments</span>
                <span>{research.fe_count}</span>
              </div>
            )}
            {research.triaged_at && (
              <div className="flex justify-between">
                <span>Triaged</span>
                <span>{new Date(research.triaged_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
PaperDetail.displayName = "PaperDetail";
