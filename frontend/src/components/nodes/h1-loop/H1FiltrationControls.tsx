import { memo, useCallback } from "react";

type Props = {
  active: boolean;
  epsilon: number;
  epsilonMax: number;
  playing: boolean;
  speed: number;
  loading: boolean;
  onToggle: () => void;
  onEpsilonChange: (e: number) => void;
  onPlayPause: () => void;
  onSpeedChange: (delta: number) => void;
  onReset: () => void;
  cycleCount: { alive: number; total: number };
};

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export const H1FiltrationControls = memo(
  ({
    active,
    epsilon,
    epsilonMax,
    playing,
    speed,
    loading,
    onToggle,
    onEpsilonChange,
    onPlayPause,
    onSpeedChange,
    onReset,
    cycleCount,
  }: Props) => {
    const handleSlider = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onEpsilonChange(parseFloat(e.target.value));
      },
      [onEpsilonChange],
    );

    if (!active) {
      return (
        <button
          onClick={onToggle}
          className="nodrag ngs-text-micro px-2 py-0.5 rounded text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700"
        >
          Filtration
        </button>
      );
    }

    return (
      <div className="nodrag flex flex-col gap-0.5 ngs-text-micro text-neutral-400">
        <div className="flex items-center gap-1">
          <button
            onClick={onToggle}
            className="px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-200"
          >
            Filtration
          </button>
          {loading ? (
            <span className="text-neutral-500">Loading distances...</span>
          ) : (
            <>
              <button
                onClick={onPlayPause}
                className="px-1 rounded hover:bg-neutral-700"
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
                {cycleCount.alive}/{cycleCount.total} alive
              </span>
            </>
          )}
        </div>
        {!loading && (
          <div className="flex items-center gap-1">
            <span className="ngs-tabular w-8 text-right text-neutral-500">
              {epsilon.toFixed(1)}
            </span>
            <input
              type="range"
              min={0}
              max={epsilonMax}
              step={epsilonMax / 500}
              value={epsilon}
              onChange={handleSlider}
              className="flex-1 h-1 accent-cyan-500"
            />
            <span className="ngs-tabular w-8 text-neutral-500">
              {epsilonMax.toFixed(1)}
            </span>
          </div>
        )}
      </div>
    );
  },
);
H1FiltrationControls.displayName = "H1FiltrationControls";
