import { useParams } from "react-router";
import { StatusDot } from "../../components/ui/StatusDot";
import { useUIStore, type AppTheme } from "../../lib/store/ui-store";

const THEME_CYCLE: AppTheme[] = ["dark", "light", "screenshot"];
const THEME_ICONS: Record<AppTheme, string> = {
  dark: "\u{263E}",
  light: "\u{2600}",
  screenshot: "\u{2B1A}",
};

export function TopBar() {
  const { projectId, canvasId } = useParams();
  const wsStatus = useUIStore((s) => s.wsStatus);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

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
        onClick={cycleTheme}
        className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
        title={`Theme: ${theme}`}
      >
        {THEME_ICONS[theme]}
      </button>
      <button
        className="rounded px-3 py-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
        onClick={() =>
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
          )
        }
        title="Search (Ctrl+K)"
      >
        Search
      </button>
      <StatusDot status={wsStatus} />
    </div>
  );
}
