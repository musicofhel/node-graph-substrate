import { useCanvasStore } from "../../lib/store/canvas-store";

export interface PoolPaper {
  id: string;
  label: string;
  sublabel?: string;
  badges?: { text: string; className: string }[];
}

interface Props {
  papers: PoolPaper[];
  emptyText?: string;
}

export function PaperPoolSection({ papers, emptyText = "No papers yet" }: Props) {
  const starredPapers = useCanvasStore((s) => s.starredPapers);
  const toggleStar = useCanvasStore((s) => s.toggleStar);

  if (papers.length === 0) {
    return (
      <div className="border-t border-neutral-800 mt-2 pt-2">
        <div className="py-2 text-center text-[10px] text-neutral-500">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="border-t border-neutral-800 mt-2 pt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">
          Papers ({papers.length})
        </span>
      </div>
      <div className="space-y-1 max-h-[280px] overflow-y-auto scrollbar-thin pr-0.5">
        {papers.map((p) => {
          const starred = starredPapers.has(p.id);
          return (
            <div
              key={p.id}
              className={`flex items-start gap-1.5 rounded border px-2 py-1 ${
                starred
                  ? "border-amber-700/50 bg-amber-950/20"
                  : "border-neutral-700 bg-neutral-800/50"
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleStar(p.id);
                }}
                className={`mt-0.5 shrink-0 text-sm leading-none transition-colors ${
                  starred ? "text-amber-400" : "text-neutral-600 hover:text-neutral-400"
                }`}
              >
                {starred ? "★" : "☆"}
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-mono text-emerald-400 truncate">{p.label}</div>
                {p.sublabel && (
                  <div className="text-[10px] text-neutral-500 truncate">{p.sublabel}</div>
                )}
                {p.badges && p.badges.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {p.badges.map((b, i) => (
                      <span key={i} className={`inline-block rounded px-1 py-px text-[9px] font-medium ${b.className}`}>
                        {b.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
