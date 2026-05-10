import { memo } from "react";

export interface PaperSummary {
  queue_id: string;
  url?: string;
  title?: string;
  category?: string;
  content_type?: string;
  forge_score?: string;
  processing_time_ms?: string;
  success?: string;
  error?: string;
  completed_at?: string;
  _isNew?: boolean;
}

function scoreColor(score: number): string {
  if (score >= 0.65) return "bg-green-500";
  if (score >= 0.45) return "bg-yellow-500";
  if (score >= 0.25) return "bg-orange-500";
  return "bg-red-500";
}

interface Props {
  paper: PaperSummary;
  selected: boolean;
  onClick: () => void;
}

export const PaperCard = memo(({ paper, selected, onClick }: Props) => {
  const failed = paper.success === "false";
  const score = parseFloat(paper.forge_score ?? "0");
  const timeMs = parseInt(paper.processing_time_ms ?? "0", 10);

  return (
    <button
      onClick={onClick}
      className={`relative w-full rounded-lg border p-2.5 text-left transition-all ${
        selected
          ? "border-blue-500 bg-neutral-800"
          : failed
            ? "border-red-900 bg-neutral-900 hover:bg-neutral-800"
            : "border-neutral-800 bg-neutral-900 hover:border-neutral-700 hover:bg-neutral-800"
      }`}
    >
      {paper._isNew && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold text-white">
          N
        </span>
      )}
      <div className="mb-1.5 truncate text-xs font-medium text-neutral-200">
        {paper.title || paper.url || paper.queue_id}
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`h-1.5 w-8 rounded-full ${scoreColor(score)}`} />
        <span className="text-[10px] text-neutral-500">{score.toFixed(2)}</span>
        {paper.category && (
          <span className="rounded bg-neutral-800 px-1 py-0.5 text-[10px] text-neutral-400">
            {paper.category}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-500">
        {paper.content_type && <span>{paper.content_type}</span>}
        {timeMs > 0 && <span>{(timeMs / 1000).toFixed(1)}s</span>}
        {failed && <span className="text-red-400">failed</span>}
      </div>
    </button>
  );
});
PaperCard.displayName = "PaperCard";
