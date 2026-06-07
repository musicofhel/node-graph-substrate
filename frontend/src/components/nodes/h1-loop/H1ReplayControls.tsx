import { memo, useCallback } from "react";

type Props = {
  playing: boolean;
  progress: number | null;
  total: number;
  speed: number;
  onPlayPause: () => void;
  onProgressChange: (p: number) => void;
  onSpeedChange: (delta: number) => void;
  onReset: () => void;
};

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export const H1ReplayControls = memo(
  ({
    playing,
    progress,
    total,
    speed,
    onPlayPause,
    onProgressChange,
    onSpeedChange,
    onReset,
  }: Props) => {
    const handleSlider = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onProgressChange(parseInt(e.target.value, 10));
      },
      [onProgressChange],
    );

    const current = progress ?? 0;

    return (
      <div className="nodrag flex flex-col gap-0.5 ngs-text-micro text-neutral-400">
        <div className="flex items-center gap-1">
          <button
            onClick={onPlayPause}
            className="px-1.5 py-0.5 rounded hover:bg-neutral-700"
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button
            onClick={onReset}
            className="px-1 rounded hover:bg-neutral-700"
          >
            ⏮
          </button>
          <button
            onClick={() => onSpeedChange(-1)}
            className="px-0.5 rounded hover:bg-neutral-700"
          >
            −
          </button>
          <span className="ngs-tabular w-6 text-center">{speed}x</span>
          <button
            onClick={() => onSpeedChange(1)}
            className="px-0.5 rounded hover:bg-neutral-700"
          >
            +
          </button>
          <span className="ml-auto ngs-tabular text-neutral-500">
            {current + 1}/{total}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="range"
            min={0}
            max={total - 1}
            step={1}
            value={current}
            onChange={handleSlider}
            className="flex-1 h-1 accent-cyan-500"
          />
        </div>
      </div>
    );
  },
);
H1ReplayControls.displayName = "H1ReplayControls";
