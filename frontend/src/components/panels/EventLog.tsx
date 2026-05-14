import { memo, useCallback, useMemo, useState } from "react";
import { useEventLogStore, type LogEntry } from "../../lib/store/event-log-store";

const TYPE_COLORS: Record<string, string> = {
  stream_event: "bg-blue-900/60 text-blue-400",
  computation_result: "bg-amber-900/60 text-amber-400",
  graph_loaded: "bg-emerald-900/60 text-emerald-400",
  node_state_updated: "bg-cyan-900/60 text-cyan-400",
  error: "bg-red-900/60 text-red-400",
  replay_gap: "bg-orange-900/60 text-orange-400",
};

function formatTs(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

const LogRow = memo(function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const typeBadge = TYPE_COLORS[entry.type] ?? "bg-neutral-800 text-neutral-400";

  return (
    <div className="border-b border-neutral-800/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1 text-left text-[11px] hover:bg-neutral-800/40"
      >
        <span className="shrink-0 font-mono text-neutral-500 w-[90px]">
          {formatTs(entry.ts)}
        </span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${typeBadge}`}>
          {entry.type}
        </span>
        {entry.stream && (
          <span className="shrink-0 font-mono text-neutral-400 truncate max-w-[200px]">
            {entry.stream}
          </span>
        )}
        {entry.nodeId && (
          <span className="shrink-0 font-mono text-neutral-600 truncate max-w-[140px]">
            {entry.nodeId}
          </span>
        )}
        <span className="ml-auto text-neutral-600">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <pre className="mx-3 mb-2 max-h-[200px] overflow-auto rounded border border-neutral-800 bg-neutral-950 p-2 text-[10px] text-neutral-300 leading-relaxed">
          {JSON.stringify(entry.raw, null, 2)}
        </pre>
      )}
    </div>
  );
});

export function EventLog() {
  const entries = useEventLogStore((s) => s.entries);
  const paused = useEventLogStore((s) => s.paused);
  const setPaused = useEventLogStore((s) => s.setPaused);
  const clear = useEventLogStore((s) => s.clear);
  const filter = useEventLogStore((s) => s.filter);
  const setFilter = useEventLogStore((s) => s.setFilter);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filter.stream && !e.stream?.includes(filter.stream)) return false;
      if (filter.nodeId && !e.nodeId?.includes(filter.nodeId)) return false;
      if (filter.type && e.type !== filter.type) return false;
      return true;
    });
  }, [entries, filter]);

  const uniqueTypes = useMemo(() => {
    const set = new Set(entries.map((e) => e.type));
    return [...set].sort();
  }, [entries]);

  const handleStreamFilter = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setFilter({ stream: e.target.value || undefined }),
    [setFilter],
  );

  const handleNodeFilter = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setFilter({ nodeId: e.target.value || undefined }),
    [setFilter],
  );

  const handleTypeFilter = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => setFilter({ type: e.target.value || undefined }),
    [setFilter],
  );

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1.5">
        <button
          onClick={() => setPaused(!paused)}
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${
            paused ? "bg-amber-900/60 text-amber-400" : "bg-neutral-800 text-neutral-400"
          }`}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          onClick={clear}
          className="rounded bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-400 hover:bg-neutral-700"
        >
          Clear
        </button>
        <input
          type="text"
          placeholder="stream..."
          value={filter.stream ?? ""}
          onChange={handleStreamFilter}
          className="w-[140px] rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300 placeholder-neutral-600 outline-none focus:border-blue-700"
        />
        <input
          type="text"
          placeholder="node_id..."
          value={filter.nodeId ?? ""}
          onChange={handleNodeFilter}
          className="w-[120px] rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300 placeholder-neutral-600 outline-none focus:border-blue-700"
        />
        <select
          value={filter.type ?? ""}
          onChange={handleTypeFilter}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300 outline-none focus:border-blue-700"
        >
          <option value="">all types</option>
          {uniqueTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <span className="ml-auto text-[10px] text-neutral-600">
          {filtered.length}/{entries.length}
        </span>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-neutral-600">
            {entries.length === 0 ? "No events yet" : "No matching events"}
          </div>
        ) : (
          filtered.map((entry) => <LogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
