import { useCallback, useRef, type ReactNode } from "react";

interface SplitPaneProps {
  ratio: number;
  onRatioChange: (ratio: number) => void;
  top: ReactNode;
  bottom: ReactNode;
}

export function SplitPane({ ratio, onRatioChange, top, bottom }: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startRatio = useRef(0);
  const rafRef = useRef<number | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const updateRatio = useCallback(
    (clientY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const deltaY = clientY - startY.current;
      const deltaRatio = deltaY / rect.height;
      const newRatio = Math.min(0.8, Math.max(0.2, startRatio.current + deltaRatio));
      onRatioChange(newRatio);
    },
    [onRatioChange],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging.current) return;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        updateRatio(e.clientY);
      });
    },
    [updateRatio],
  );

  const stopDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (topRef.current) topRef.current.style.pointerEvents = "";
    if (bottomRef.current) bottomRef.current.style.pointerEvents = "";
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", stopDrag);
    document.removeEventListener("mouseleave", stopDrag);
    window.dispatchEvent(new Event("resize"));
  }, [handleMouseMove]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startRatio.current = ratio;
      if (topRef.current) topRef.current.style.pointerEvents = "none";
      if (bottomRef.current) bottomRef.current.style.pointerEvents = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", stopDrag);
      document.addEventListener("mouseleave", stopDrag);
    },
    [ratio, handleMouseMove, stopDrag],
  );

  return (
    <div ref={containerRef} className="flex flex-1 flex-col min-h-0">
      <div
        ref={topRef}
        className="relative min-h-0"
        style={{ flex: `${ratio * 100} 1 0%` }}
      >
        {top}
      </div>
      <div
        onMouseDown={handleMouseDown}
        className="h-2 shrink-0 cursor-row-resize bg-neutral-800 hover:bg-neutral-700 active:bg-blue-900/60 flex items-center justify-center select-none"
      >
        <div className="w-8 h-0.5 rounded bg-neutral-600" />
      </div>
      <div
        ref={bottomRef}
        className="min-h-0 overflow-hidden border-t border-neutral-800"
        style={{ flex: `${(1 - ratio) * 100} 1 0%` }}
      >
        {bottom}
      </div>
    </div>
  );
}
