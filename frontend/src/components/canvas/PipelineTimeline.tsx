import { useCallback, useEffect, useRef, useState } from "react";
import { useReactFlow, useOnViewportChange } from "@xyflow/react";
import { useCanvasStore } from "../../lib/store/canvas-store";

const WINDOW_WIDTH = 280 * 3;

export function PipelineTimeline() {
  const nodes = useCanvasStore((s) => s.nodes);
  const { setViewport, getViewport } = useReactFlow();
  const [scrollX, setScrollX] = useState(0);
  const slidingRef = useRef(false);

  const groupNodes = nodes.filter((n) => n.type === "lf_pipeline_group");
  const groupCount = groupNodes.length;
  const maxGroupX = groupNodes.reduce((max, n) => Math.max(max, n.position.x), 0);
  const maxGroupXRef = useRef(maxGroupX);
  maxGroupXRef.current = maxGroupX;
  const prevMaxRef = useRef(maxGroupX);

  useEffect(() => {
    if (maxGroupX > prevMaxRef.current) {
      if (scrollX >= prevMaxRef.current - WINDOW_WIDTH) {
        setScrollX(maxGroupX);
        const vp = getViewport();
        setViewport({ x: -maxGroupX * vp.zoom, y: vp.y, zoom: vp.zoom }, { duration: 600 });
      }
      prevMaxRef.current = maxGroupX;
    }
  }, [maxGroupX, scrollX, getViewport, setViewport]);

  useOnViewportChange({
    onChange: useCallback((vp: { x: number; zoom: number }) => {
      if (slidingRef.current) return;
      const worldX = Math.max(0, -vp.x / vp.zoom);
      setScrollX(Math.min(maxGroupXRef.current, worldX));
    }, []),
  });

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      slidingRef.current = true;
      setScrollX(val);
      const vp = getViewport();
      setViewport({ x: -val * vp.zoom, y: vp.y, zoom: vp.zoom });
      requestAnimationFrame(() => {
        slidingRef.current = false;
      });
    },
    [getViewport, setViewport],
  );

  const snapToLatest = useCallback(() => {
    const mx = maxGroupXRef.current;
    setScrollX(mx);
    const vp = getViewport();
    setViewport({ x: -mx * vp.zoom, y: vp.y, zoom: vp.zoom }, { duration: 600 });
  }, [getViewport, setViewport]);

  if (groupCount < 2) return null;

  return (
    <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-neutral-700/50 bg-neutral-900/90 px-4 py-2 shadow-lg backdrop-blur-sm">
      <span className="whitespace-nowrap text-[10px] font-medium text-neutral-500">
        {groupCount} papers
      </span>
      <input
        type="range"
        min={0}
        max={maxGroupX || 1}
        step={1}
        value={scrollX}
        onChange={handleChange}
        className="h-1 w-[280px] cursor-pointer appearance-none rounded-full bg-neutral-700
          [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-emerald-500
          [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500"
      />
      <button
        onClick={snapToLatest}
        className="whitespace-nowrap text-[10px] font-medium text-emerald-400 hover:text-emerald-300"
      >
        now &rarr;
      </button>
    </div>
  );
}
