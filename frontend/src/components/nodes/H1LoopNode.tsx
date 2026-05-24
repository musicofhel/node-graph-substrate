import { memo, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/nodes/registry";
import { useH1LoopData } from "../../lib/hooks/useH1LoopData";
import { H1Cloud2D } from "./h1-loop/H1Cloud2D";
import { H1PersistenceDiagram } from "./h1-loop/H1PersistenceDiagram";
import { H1Cloud3D } from "./h1-loop/H1Cloud3D";
import { H1FiltrationControls } from "./h1-loop/H1FiltrationControls";
import { H1ReplayControls } from "./h1-loop/H1ReplayControls";
import { H1TextPanel } from "./h1-loop/H1TextPanel";

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export const H1LoopNode = memo(({ selected }: NodeProps) => {
  const def = NODE_REGISTRY.h1_loop;
  const {
    problem, problemIdx, loading, error, navigate,
    activePoints2d, activePoints3d, totalProblems, loadFiltrationData,
    reduction, setReduction, hasUmap,
    layer, setLayer, availableLayers,
    compareProblem, compareLayer, toggleCompare, comparePoints2d, comparePoints3d,
  } = useH1LoopData();
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [activeTab, setActiveTab] = useState<"diagram" | "replay" | "text">(
    "diagram",
  );
  const [highlightedCycle, setHighlightedCycle] = useState<number | null>(null);

  const [filtrationActive, setFiltrationActive] = useState(false);
  const [filtrationEpsilon, setFiltrationEpsilon] = useState(0);
  const [filtrationPlaying, setFiltrationPlaying] = useState(false);
  const [filtrationSpeed, setFiltrationSpeed] = useState(1);
  const [filtrationLoading, setFiltrationLoading] = useState(false);

  const [replayProgress, setReplayProgress] = useState<number | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const currentTokenRef = useRef<HTMLSpanElement>(null);

  const [highlightedPointIdx, setHighlightedPointIdx] = useState<number | null>(null);
  const [highlightedTokenIdx, setHighlightedTokenIdx] = useState<number | null>(null);

  useEffect(() => {
    setFiltrationActive(false);
    setFiltrationEpsilon(0);
    setFiltrationPlaying(false);
    setReplayProgress(null);
    setReplayPlaying(false);
    setHighlightedCycle(null);
    setHighlightedPointIdx(null);
    setHighlightedTokenIdx(null);
  }, [problemIdx, layer]);

  const epsilonMax = useMemo(() => {
    if (!problem?.distance_matrix_upper?.length) return 1;
    return Math.max(...problem.distance_matrix_upper);
  }, [problem?.distance_matrix_upper]);

  const handleFiltrationToggle = useCallback(async () => {
    if (!filtrationActive && problem && !problem.distance_matrix_upper) {
      setFiltrationLoading(true);
      await loadFiltrationData();
      setFiltrationLoading(false);
    }
    setFiltrationActive((prev) => !prev);
    if (filtrationActive) {
      setFiltrationPlaying(false);
      setFiltrationEpsilon(0);
    }
  }, [filtrationActive, problem, loadFiltrationData]);

  const handleFiltrationSpeedChange = useCallback((delta: number) => {
    setFiltrationSpeed((prev) => {
      const idx = SPEEDS.indexOf(prev);
      const next = idx + delta;
      if (next < 0 || next >= SPEEDS.length) return prev;
      return SPEEDS[next];
    });
  }, []);

  const handleFiltrationReset = useCallback(() => {
    setFiltrationPlaying(false);
    setFiltrationEpsilon(0);
  }, []);

  const aliveCycleCount = useMemo(() => {
    if (!problem || !filtrationActive) return { alive: 0, total: 0 };
    const total = problem.h1_cycles.length;
    const alive = problem.h1_cycles.filter(
      (c) => filtrationEpsilon >= c.birth && filtrationEpsilon < c.death,
    ).length;
    return { alive, total };
  }, [problem, filtrationActive, filtrationEpsilon]);

  useEffect(() => {
    if (!filtrationPlaying || !problem?.distance_matrix_upper) return;
    let raf: number;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setFiltrationEpsilon((prev) => {
        const step = (epsilonMax / 15000) * filtrationSpeed * dt;
        const next = prev + step;
        if (next >= epsilonMax) {
          setFiltrationPlaying(false);
          return epsilonMax;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [filtrationPlaying, filtrationSpeed, problem?.distance_matrix_upper, epsilonMax]);

  const activeFiltrationEpsilon = filtrationActive ? filtrationEpsilon : null;

  const currentTokenIdx = useMemo(() => {
    if (replayProgress == null || !problem) return null;
    return problem.subsampled_token_indices[replayProgress] ?? null;
  }, [replayProgress, problem]);

  const handleReplayPlayPause = useCallback(() => {
    if (!replayPlaying && replayProgress == null) {
      setReplayProgress(0);
    }
    setReplayPlaying((p) => !p);
  }, [replayPlaying, replayProgress]);

  const handleReplaySpeedChange = useCallback((delta: number) => {
    setReplaySpeed((prev) => {
      const idx = SPEEDS.indexOf(prev);
      const next = idx + delta;
      if (next < 0 || next >= SPEEDS.length) return prev;
      return SPEEDS[next];
    });
  }, []);

  const handleReplayReset = useCallback(() => {
    setReplayPlaying(false);
    setReplayProgress(0);
  }, []);

  useEffect(() => {
    if (!replayPlaying || !problem) return;
    let raf: number;
    let last = performance.now();
    let accumulator = 0;
    const interval = 200 / replaySpeed;

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      accumulator += dt;
      if (accumulator >= interval) {
        accumulator -= interval;
        setReplayProgress((prev) => {
          const next = (prev ?? -1) + 1;
          if (next >= problem.n_subsampled) {
            setReplayPlaying(false);
            return problem.n_subsampled - 1;
          }
          return next;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [replayPlaying, replaySpeed, problem]);

  useEffect(() => {
    currentTokenRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentTokenIdx]);

  const activeReplayProgress = activeTab === "replay" ? replayProgress : null;

  const handlePointHover = useCallback((subsampledIdx: number | null) => {
    setHighlightedPointIdx(subsampledIdx);
    if (subsampledIdx != null && problem) {
      setHighlightedTokenIdx(problem.subsampled_token_indices[subsampledIdx] ?? null);
    } else {
      setHighlightedTokenIdx(null);
    }
  }, [problem]);

  const handleTokenHover = useCallback((tokenIdx: number | null) => {
    setHighlightedTokenIdx(tokenIdx);
    if (tokenIdx != null && problem) {
      const subIdx = problem.subsampled_token_indices.indexOf(tokenIdx);
      setHighlightedPointIdx(subIdx >= 0 ? subIdx : null);
    } else {
      setHighlightedPointIdx(null);
    }
  }, [problem]);

  const activeHighlightedPointIdx = activeTab === "text" ? highlightedPointIdx : null;

  return (
    <BaseNodeShell selected={selected} label={def.label} category={def.category}>
      {/* Navigation bar */}
      <div className="nodrag flex items-center gap-1 mb-1.5 text-[10px] text-neutral-400">
        <button
          onClick={() => navigate(-1)}
          className="px-1 rounded hover:bg-neutral-700"
        >
          ◄
        </button>
        <span className="flex-1 text-center truncate">
          {problem ? (
            <>
              <span
                className={
                  problem.correctness.default
                    ? "text-emerald-400"
                    : "text-red-400"
                }
              >
                {problem.correctness.default ? "✓" : "✗"}
              </span>{" "}
              {problemIdx + 1}/{totalProblems} — {problem.subject} L
              {problem.level}
            </>
          ) : loading ? (
            "Loading..."
          ) : (
            "No data"
          )}
        </span>
        <button
          onClick={() => navigate(1)}
          className="px-1 rounded hover:bg-neutral-700"
        >
          ►
        </button>
      </div>

      {/* Mode selector + layer controls */}
      <div className="nodrag flex items-center gap-0.5 mb-1 text-[9px]">
        {(["diagram", "replay", "text"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setActiveTab(mode)}
            className={`px-2 py-0.5 rounded ${
              activeTab === mode
                ? "bg-neutral-700 text-neutral-200"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {mode === "diagram"
              ? "Diagram"
              : mode === "replay"
                ? "Replay"
                : "Text"}
          </button>
        ))}
        <span className="w-px h-3 bg-neutral-700 mx-1" />
        {availableLayers.map((l) => (
          <button
            key={l}
            onClick={() => setLayer(l)}
            className={`px-1.5 py-0.5 rounded font-mono ${
              layer === l
                ? "bg-neutral-700 text-neutral-200"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            L{l}
          </button>
        ))}
        {availableLayers.length > 1 && (
          <button
            onClick={toggleCompare}
            className={`ml-0.5 px-1.5 py-0.5 rounded ${
              compareLayer
                ? "bg-cyan-900 text-cyan-300"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {compareLayer ? "Single" : "Compare"}
          </button>
        )}
      </div>

      {/* Content area */}
      <div
        className="nodrag nowheel flex gap-1"
        style={{ minWidth: compareLayer ? 640 : 400, minHeight: 350 }}
      >
        {!problem ? (
          <div className="flex flex-1 items-center justify-center text-xs text-neutral-500">
            {loading
              ? "Loading problem data..."
              : error || "No H1 loop data available"}
          </div>
        ) : (
          <>
            {/* Left: Cloud (always visible, ~60% width) */}
            <div className="flex-[3] min-w-0 flex flex-col">
              <div className="nodrag flex items-center gap-0.5 mb-0.5 text-[9px]">
                <button
                  onClick={() => setViewMode("2d")}
                  className={`px-2 py-0.5 rounded ${
                    viewMode === "2d"
                      ? "bg-neutral-700 text-neutral-200"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  2D
                </button>
                <button
                  onClick={() => setViewMode("3d")}
                  className={`px-2 py-0.5 rounded ${
                    viewMode === "3d"
                      ? "bg-neutral-700 text-neutral-200"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  3D
                </button>
                <span className="w-px h-3 bg-neutral-700 mx-0.5" />
                <button
                  onClick={() => setReduction("pca")}
                  className={`px-2 py-0.5 rounded ${
                    reduction === "pca"
                      ? "bg-neutral-700 text-neutral-200"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  PCA
                </button>
                <button
                  onClick={() => setReduction("umap")}
                  disabled={!hasUmap}
                  className={`px-2 py-0.5 rounded ${
                    reduction === "umap"
                      ? "bg-neutral-700 text-neutral-200"
                      : hasUmap
                        ? "text-neutral-500 hover:text-neutral-300"
                        : "text-neutral-700 cursor-not-allowed"
                  }`}
                >
                  UMAP
                </button>
                <div className="ml-auto">
                  <H1FiltrationControls
                    active={filtrationActive}
                    epsilon={filtrationEpsilon}
                    epsilonMax={epsilonMax}
                    playing={filtrationPlaying}
                    speed={filtrationSpeed}
                    loading={filtrationLoading}
                    onToggle={handleFiltrationToggle}
                    onEpsilonChange={setFiltrationEpsilon}
                    onPlayPause={() => setFiltrationPlaying((p) => !p)}
                    onSpeedChange={handleFiltrationSpeedChange}
                    onReset={handleFiltrationReset}
                    cycleCount={aliveCycleCount}
                  />
                </div>
              </div>
              <div className="flex-1 min-h-0 flex gap-1">
                {/* Primary cloud */}
                <div className={`flex flex-col ${compareLayer ? "flex-1 min-w-0" : "w-full"}`}>
                  {compareLayer && (
                    <div className="text-[8px] text-neutral-500 mb-0.5 font-mono">L{layer}</div>
                  )}
                  <div className="flex-1 min-h-0">
                    {viewMode === "2d" && activePoints2d ? (
                      <H1Cloud2D
                        problem={problem}
                        points={activePoints2d}
                        width={compareLayer ? 200 : 240}
                        height={320}
                        highlightedCycle={highlightedCycle}
                        onCycleHover={setHighlightedCycle}
                        highlightedPointIdx={activeHighlightedPointIdx}
                        onPointHover={handlePointHover}
                        filtrationEpsilon={activeFiltrationEpsilon}
                        replayProgress={activeReplayProgress}
                      />
                    ) : viewMode === "3d" && activePoints3d ? (
                      <H1Cloud3D
                        problem={problem}
                        points={activePoints3d}
                        highlightedCycle={highlightedCycle}
                        onCycleHover={setHighlightedCycle}
                        highlightedPointIdx={activeHighlightedPointIdx}
                        filtrationEpsilon={activeFiltrationEpsilon}
                        replayProgress={activeReplayProgress}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-neutral-600">
                        No point data
                      </div>
                    )}
                  </div>
                </div>
                {/* Compare cloud */}
                {compareLayer && compareProblem && (
                  <div className="flex-1 min-w-0 flex flex-col border-l border-neutral-800 pl-1">
                    <div className="text-[8px] text-neutral-500 mb-0.5 font-mono">L{compareLayer}</div>
                    <div className="flex-1 min-h-0">
                      {viewMode === "2d" && comparePoints2d ? (
                        <H1Cloud2D
                          problem={compareProblem}
                          points={comparePoints2d}
                          width={200}
                          height={320}
                          highlightedCycle={highlightedCycle}
                          onCycleHover={setHighlightedCycle}
                          highlightedPointIdx={null}
                          filtrationEpsilon={null}
                          replayProgress={null}
                        />
                      ) : viewMode === "3d" && comparePoints3d ? (
                        <H1Cloud3D
                          problem={compareProblem}
                          points={comparePoints3d}
                          highlightedCycle={highlightedCycle}
                          onCycleHover={setHighlightedCycle}
                          highlightedPointIdx={null}
                          filtrationEpsilon={null}
                          replayProgress={null}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-neutral-600">
                          No L{compareLayer} data
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {compareLayer && !compareProblem && (
                  <div className="flex-1 min-w-0 flex items-center justify-center text-[10px] text-neutral-600 border-l border-neutral-800 pl-1">
                    Loading L{compareLayer}...
                  </div>
                )}
              </div>
            </div>
            {/* Right: context panel (~40% width) */}
            <div className="flex-[2] min-w-0 border-l border-neutral-800 pl-1">
              {activeTab === "diagram" && (
                <H1PersistenceDiagram
                  problem={problem}
                  width={160}
                  height={320}
                  highlightedCycle={highlightedCycle}
                  onCycleHover={setHighlightedCycle}
                  filtrationEpsilon={activeFiltrationEpsilon}
                />
              )}
              {activeTab === "replay" && (
                <div className="flex flex-col h-full gap-1">
                  <H1ReplayControls
                    playing={replayPlaying}
                    progress={replayProgress}
                    total={problem.n_subsampled}
                    speed={replaySpeed}
                    onPlayPause={handleReplayPlayPause}
                    onProgressChange={setReplayProgress}
                    onSpeedChange={handleReplaySpeedChange}
                    onReset={handleReplayReset}
                  />
                  <div className="flex-1 min-h-0 overflow-y-auto text-[10px] leading-relaxed p-1">
                    {problem.token_texts ? (
                      problem.token_texts.map((tok, i) => (
                        <span
                          key={i}
                          ref={i === currentTokenIdx ? currentTokenRef : undefined}
                          className={
                            i === currentTokenIdx
                              ? "bg-cyan-800 text-white rounded px-0.5"
                              : currentTokenIdx != null && i < currentTokenIdx
                                ? "text-neutral-300"
                                : "text-neutral-600"
                          }
                        >
                          {tok}
                        </span>
                      ))
                    ) : (
                      <span className="text-neutral-500 italic">
                        Token text requires schema v1.1.0 — re-run precompute
                      </span>
                    )}
                  </div>
                </div>
              )}
              {activeTab === "text" && (
                <H1TextPanel
                  problem={problem}
                  highlightedTokenIdx={highlightedTokenIdx}
                  onTokenHover={handleTokenHover}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Stats footer */}
      {problem && (
        <div className="mt-1 text-[9px] text-neutral-500 font-mono">
          <span>L{layer}: {problem.n_tokens} tok · {problem.h1_cycles.length} cycles · logp {problem.mean_logprob.toFixed(2)}</span>
          {compareProblem && (
            <span className="ml-2 pl-2 border-l border-neutral-700">
              L{compareLayer}: {compareProblem.n_tokens} tok · {compareProblem.h1_cycles.length} cycles · logp {compareProblem.mean_logprob.toFixed(2)}
            </span>
          )}
        </div>
      )}
    </BaseNodeShell>
  );
});
H1LoopNode.displayName = "H1LoopNode";
