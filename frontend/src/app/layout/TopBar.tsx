import { useParams } from "react-router";

export function TopBar() {
  const { projectId, canvasId } = useParams();

  return (
    <div className="flex h-10 shrink-0 items-center border-b border-neutral-800 bg-neutral-950 px-3">
      <div className="flex flex-1 items-center gap-1.5 text-sm text-neutral-400">
        {projectId && (
          <>
            <span className="truncate max-w-[120px]" title={projectId}>
              {projectId.slice(0, 8)}...
            </span>
            {canvasId && (
              <>
                <span className="text-neutral-600">/</span>
                <span className="truncate max-w-[120px]" title={canvasId}>
                  {canvasId.slice(0, 8)}...
                </span>
              </>
            )}
          </>
        )}
      </div>
      <button
        className="rounded px-3 py-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
        onClick={() => {}}
        title="Search (Ctrl+K)"
      >
        Search
      </button>
      <div className="ml-3 h-2 w-2 rounded-full bg-green-500" title="Connected" />
    </div>
  );
}
