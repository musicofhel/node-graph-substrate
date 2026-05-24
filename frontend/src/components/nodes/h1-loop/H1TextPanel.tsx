import { memo, useMemo, useRef, useEffect } from "react";
import type { H1Problem } from "../../../lib/hooks/useH1LoopData";

type Props = {
  problem: H1Problem;
  highlightedTokenIdx: number | null;
  onTokenHover: (tokenIdx: number | null) => void;
};

export const H1TextPanel = memo(
  ({ problem, highlightedTokenIdx, onTokenHover }: Props) => {
    const highlightRef = useRef<HTMLSpanElement>(null);
    const subsampledSet = useMemo(
      () => new Set(problem.subsampled_token_indices),
      [problem.subsampled_token_indices],
    );

    useEffect(() => {
      highlightRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }, [highlightedTokenIdx]);

    if (!problem.token_texts) {
      return (
        <div className="flex h-full items-center justify-center text-[10px] text-neutral-500 italic p-2">
          Token text requires schema v1.1.0 — re-run precompute
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full gap-1 overflow-hidden">
        {problem.math_prompt && (
          <div className="shrink-0">
            <div className="text-[8px] text-neutral-500 uppercase tracking-wider mb-0.5">
              Problem
            </div>
            <div className="text-[10px] text-neutral-400 leading-relaxed border-b border-neutral-800 pb-1 mb-1 max-h-16 overflow-y-auto">
              {problem.math_prompt}
            </div>
          </div>
        )}

        <div className="text-[8px] text-neutral-500 uppercase tracking-wider shrink-0">
          Response{" "}
          <span className="normal-case text-neutral-600">
            ({problem.token_texts.length} tokens, {subsampledSet.size}{" "}
            sampled)
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto text-[10px] leading-relaxed">
          {problem.token_texts.map((tok, i) => {
            const isSampled = subsampledSet.has(i);
            const isHighlighted = highlightedTokenIdx === i;

            return (
              <span
                key={i}
                ref={isHighlighted ? highlightRef : undefined}
                className={
                  isHighlighted
                    ? "bg-cyan-800 text-white rounded px-0.5"
                    : isSampled
                      ? "text-neutral-200 cursor-crosshair hover:bg-neutral-700/50 rounded"
                      : "text-neutral-600"
                }
                onMouseEnter={isSampled ? () => onTokenHover(i) : undefined}
                onMouseLeave={isSampled ? () => onTokenHover(null) : undefined}
              >
                {tok}
              </span>
            );
          })}
        </div>
      </div>
    );
  },
);
H1TextPanel.displayName = "H1TextPanel";
