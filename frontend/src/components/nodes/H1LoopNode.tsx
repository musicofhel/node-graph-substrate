import { memo, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/pack-registry";
import { useZoomTier } from "../../lib/hooks/useZoomTier";
import { useH1LoopData } from "../../packs/topo-confidence/hooks/useH1LoopData";
import { H1Cloud2D } from "./h1-loop/H1Cloud2D";
import { H1PersistenceDiagram, H1CycleTable } from "./h1-loop/H1PersistenceDiagram";
import { H1Cloud3D } from "./h1-loop/H1Cloud3D";
import { H1FiltrationControls } from "./h1-loop/H1FiltrationControls";
import { H1ReplayControls } from "./h1-loop/H1ReplayControls";
import { H1TextPanel } from "./h1-loop/H1TextPanel";
import { turboColor } from "./h1-loop/turbo-colormap";

const SPEEDS = [0.25, 0.5, 1, 2, 4];
const DEMO_INTERVAL = 15_000;

export const H1LoopNode = memo(({ selected }: NodeProps) => {
  const def = NODE_REGISTRY.h1_loop;
  const tier = useZoomTier();
  const {
    problem, problemIdx, loading, error, navigate, goTo,
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

  const [demo, setDemo] = useState(false);
  const [countdown, setCountdown] = useState(DEMO_INTERVAL / 1000);
  const [follow, setFollow] = useState(false);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  useEffect(() => {
    if (!follow) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const idx = detail?.inputs?.config?.math_idx;
      if (idx != null) goToRef.current(idx);
    };
    window.addEventListener("substrate:compute_request", handler);
    return () => window.removeEventListener("substrate:compute_request", handler);
  }, [follow]);

  useEffect(() => {
    if (follow) setDemo(false);
  }, [follow]);

  useEffect(() => {
    if (!demo || !totalProblems || follow) return;
    setCountdown(DEMO_INTERVAL / 1000);
    const tick = setInterval(() => setCountdown((c) => c - 1), 1000);
    const cycle = setInterval(() => {
      navigateRef.current(1);
      setCountdown(DEMO_INTERVAL / 1000);
    }, DEMO_INTERVAL);
    return () => { clearInterval(tick); clearInterval(cycle); };
  }, [demo, totalProblems, follow]);

  const demoSkip = useCallback(() => {
    navigateRef.current(1);
    setCountdown(DEMO_INTERVAL / 1000);
  }, []);

  const demoBack = useCallback(() => {
    navigateRef.current(-1);
    setCountdown(DEMO_INTERVAL / 1000);
  }, []);

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
  const [trailVisible, setTrailVisible] = useState(false);

  useEffect(() => {
    setFiltrationActive(false);
    setFiltrationEpsilon(0);
    setFiltrationPlaying(false);
    setReplayProgress(null);
    setReplayPlaying(false);
    setHighlightedCycle(null);
    setHighlightedPointIdx(null);
    setHighlightedTokenIdx(null);
    setTrailVisible(false);
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

  const ariaLabel = `H1 loop: ${problem ? `problem ${problemIdx + 1} of ${totalProblems}, ${problem.subject} L${problem.level}, ${problem.correctness.default ? "correct" : "incorrect"}, ${problem.h1_cycles.length} cycles` : loading ? "loading" : "no data"}`;

  const shell = (children: ReactNode) => (
    <BaseNodeShell
      selected={selected}
      label={def.label}
      category={def.category}
      minWidth={560}
      minHeight={280}
      ariaLabel={ariaLabel}
    >
      {children}
    </BaseNodeShell>
  );

  if (tier === "T0") {
    return shell(
      <div className="flex h-full w-full items-center justify-center rounded" style={{ background: "var(--ngs-viridis-2)", minHeight: 80 }} />
    );
  }

  if (tier === "T1") {
    return shell(
      <div className="flex h-full w-full items-center justify-center rounded" style={{ background: "var(--ngs-viridis-2)", minHeight: 80 }}>
        <span className="ngs-text-title text-white">H1 Loop</span>
      </div>
    );
  }

  if (tier === "T2") {
    if (!problem) {
      return shell(
        <div className="nodrag nowheel flex items-center justify-center ngs-text-body text-neutral-500" style={{ minHeight: 280 }}>
          {loading ? "Loading..." : error || "No data"}
        </div>
      );
    }
    return shell(
      <div className="nodrag nowheel" style={{ minHeight: 280 }}>
        {viewMode === "2d" && activePoints2d ? (
          <H1Cloud2D
            problem={problem}
            points={activePoints2d}
            width={240}
            height={280}
            highlightedCycle={highlightedCycle}
            onCycleHover={setHighlightedCycle}
            highlightedPointIdx={activeHighlightedPointIdx}
            onPointHover={handlePointHover}
            filtrationEpsilon={activeFiltrationEpsilon}
            replayProgress={activeReplayProgress}
            trailVisible={trailVisible}
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
            trailVisible={trailVisible}
          />
        ) : (
          <div className="flex h-full items-center justify-center ngs-text-meta text-neutral-600">
            No point data
          </div>
        )}
      </div>
    );
  }

  return shell(
    <>
      {/* Navigation bar */}
      <div className="nodrag flex items-center gap-1 mb-1 ngs-text-meta text-neutral-400">
        <button
          onClick={() => navigate(-1)}
          className="px-1 rounded hover:bg-neutral-700"
          aria-label="Previous problem"
        >
          ◄
        </button>
        <span className="flex-1 text-center ngs-tabular">
          {loading ? "..." : `${problemIdx + 1}/${totalProblems}`}
        </span>
        <button
          onClick={() => navigate(1)}
          className="px-1 rounded hover:bg-neutral-700"
          aria-label="Next problem"
        >
          ►
        </button>
      </div>

      {/* Metadata badges */}
      {problem && (
        <div className="flex items-center gap-1 mb-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded bg-neutral-800 ngs-text-micro ngs-tabular text-neutral-300">
            #{String(problemIdx).padStart(3, "0")}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-indigo-900/60 ngs-text-micro text-indigo-300">
            {problem.subject}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-purple-900/40 ngs-text-micro text-purple-300">
            L{problem.level}
          </span>
          <span className="px-1.5 py-0.5 rounded ngs-text-micro font-medium" style={{
            backgroundColor: problem.correctness.default
              ? "color-mix(in srgb, var(--ngs-sign-pos) 20%, transparent)"
              : "color-mix(in srgb, var(--ngs-sign-neg) 20%, transparent)",
            color: problem.correctness.default ? "var(--ngs-sign-pos)" : "var(--ngs-sign-neg)",
          }}>
            {problem.correctness.default ? "CORRECT" : "INCORRECT"}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-neutral-800 ngs-text-micro ngs-tabular text-neutral-500">
            {problem.n_tokens} tok
          </span>
          <span className="px-1.5 py-0.5 rounded bg-neutral-800 ngs-text-micro ngs-tabular text-neutral-500">
            logp {problem.mean_logprob.toFixed(2)}
          </span>
        </div>
      )}

      {/* Demo cycling + Follow */}
      {totalProblems > 0 && (
        <div className="nodrag mb-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="ngs-text-micro font-semibold tracking-widest text-neutral-500 uppercase">Demo</span>
            {demo && !follow && (
              <span className="ngs-text-micro ngs-tabular text-neutral-500">{countdown}s</span>
            )}
            {follow && (
              <span className="ngs-text-micro text-cyan-400">Following prompt</span>
            )}
          </div>
          <div className="flex gap-1">
            <button
              className="rounded px-2 py-1.5 ngs-text-body text-neutral-400 hover:bg-neutral-600 disabled:opacity-30"
              onClick={demoBack}
              disabled={!demo || follow}
              aria-label="Previous problem"
            >
              ◄◄
            </button>
            <button
              className={`flex-1 rounded px-3 py-1.5 ngs-text-body font-medium transition-colors ${
                demo
                  ? "bg-amber-700 text-white hover:bg-amber-600"
                  : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
              }`}
              onClick={() => { setDemo((d) => !d); setFollow(false); }}
              disabled={follow}
            >
              {demo ? "Stop Demo" : "Start Demo"}
            </button>
            <button
              className="rounded px-2 py-1.5 ngs-text-body text-neutral-400 hover:bg-neutral-600 disabled:opacity-30"
              onClick={demoSkip}
              disabled={!demo || follow}
              aria-label="Skip to next problem"
            >
              ►►
            </button>
            <button
              className={`rounded px-2 py-1.5 ngs-text-body font-medium transition-colors ${
                follow
                  ? "bg-cyan-700 text-white hover:bg-cyan-600"
                  : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
              }`}
              onClick={() => setFollow((f) => !f)}
              title="Sync with Prompt Input node"
            >
              {follow ? "Unfollow" : "Follow"}
            </button>
          </div>
          <div className="mt-1.5 border-b border-neutral-700" />
        </div>
      )}

      {/* Mode selector + layer controls */}
      <div className="nodrag flex items-center gap-0.5 mb-1 ngs-text-micro">
        {(["diagram", "replay", "text"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setActiveTab(mode)}
            className={`px-2 py-0.5 rounded ${
              activeTab === mode
                ? "bg-neutral-700 text-neutral-200"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
            aria-label={`${mode === "diagram" ? "Diagram" : mode === "replay" ? "Replay" : "Text"} tab`}
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
            className={`px-1.5 py-0.5 rounded ngs-tabular ${
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
        style={{ minWidth: compareLayer ? 640 : 400, minHeight: 280 }}
      >
        {!problem ? (
          <div className="flex flex-1 items-center justify-center ngs-text-body text-neutral-500">
            {loading
              ? "Loading problem data..."
              : error || "No H1 loop data available"}
          </div>
        ) : (
          <>
            {/* Left: Cloud (always visible, ~60% width) */}
            <div className="flex-[3] min-w-0 flex flex-col">
              <div className="nodrag flex items-center gap-0.5 mb-0.5 ngs-text-micro">
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
                <span className="w-px h-3 bg-neutral-700 mx-0.5" />
                <button
                  onClick={() => setTrailVisible((v) => !v)}
                  className={`px-2 py-0.5 rounded ${
                    trailVisible
                      ? "bg-neutral-700 text-neutral-200"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  Trail
                </button>
              </div>
              {/* Filtration bar — dedicated row */}
              <div className="nodrag mb-0.5">
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
              <div className="flex-1 min-h-0 flex gap-1">
                {/* Primary cloud */}
                <div className={`flex flex-col ${compareLayer ? "flex-1 min-w-0" : "w-full"}`}>
                  {compareLayer && (
                    <div className="ngs-text-micro text-neutral-500 mb-0.5 ngs-tabular">L{layer}</div>
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
                        trailVisible={trailVisible}
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
                        trailVisible={trailVisible}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center ngs-text-meta text-neutral-600">
                        No point data
                      </div>
                    )}
                  </div>
                </div>
                {/* Compare cloud */}
                {compareLayer && compareProblem && (
                  <div className="flex-1 min-w-0 flex flex-col border-l border-neutral-800 pl-1">
                    <div className="ngs-text-micro text-neutral-500 mb-0.5 ngs-tabular">L{compareLayer}</div>
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
                          trailVisible={trailVisible}
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
                          trailVisible={trailVisible}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center ngs-text-meta text-neutral-600">
                          No L{compareLayer} data
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {compareLayer && !compareProblem && (
                  <div className="flex-1 min-w-0 flex items-center justify-center ngs-text-meta text-neutral-600 border-l border-neutral-800 pl-1">
                    Loading L{compareLayer}...
                  </div>
                )}
              </div>
            </div>
            {/* Right: context panel (~40% width) */}
            <div className="flex-[2] min-w-0 border-l border-neutral-800 pl-1">
              {activeTab === "diagram" && (
                <div className="flex flex-col h-full gap-1 overflow-hidden">
                  <div className="shrink-0">
                    <H1PersistenceDiagram
                      problem={problem}
                      width={160}
                      height={180}
                      highlightedCycle={highlightedCycle}
                      onCycleHover={setHighlightedCycle}
                      filtrationEpsilon={activeFiltrationEpsilon}
                    />
                  </div>
                  <H1CycleTable
                    problem={problem}
                    highlightedCycle={highlightedCycle}
                    onCycleHover={setHighlightedCycle}
                  />
                </div>
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
                  <div className="flex-1 min-h-0 overflow-y-auto ngs-text-meta leading-relaxed p-1">
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

      {/* Legend */}
      {problem && (
        <div className="flex items-center gap-2 mt-1 ngs-text-micro text-neutral-500 flex-wrap">
          <span className="flex items-center gap-0.5">
            <svg width="48" height="8" className="shrink-0">
              {Array.from({ length: 12 }, (_, i) => (
                <rect
                  key={i}
                  x={i * 4}
                  y={0}
                  width={4.5}
                  height={8}
                  fill={turboColor(0.92 - (i / 11) * 0.84)}
                  rx={0.5}
                />
              ))}
            </svg>
            H1
          </span>
          <span className="flex items-center gap-0.5">
            <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="#999" strokeWidth="1.5" strokeDasharray="4,2" /></svg>
            fallback
          </span>
          <span className="flex items-center gap-0.5">
            <svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="#ffd700" /></svg>
            bridge
          </span>
          <span className="flex items-center gap-0.5">
            <svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="#58a6ff" /></svg>H0
          </span>
          <span className="flex items-center gap-0.5">
            <svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="#22d3ee" /></svg>H1
          </span>
          <span className="flex items-center gap-0.5">
            <svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="#a78bfa" /></svg>H2
          </span>
          <span className="flex items-center gap-0.5">
            <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="#4a4a6a" strokeWidth="1.5" opacity="0.5" /></svg>
            rips
          </span>
          <span className="flex items-center gap-0.5">
            <svg width="16" height="8"><polyline points="0,6 5,2 11,5 16,1" fill="none" stroke="#7070a0" strokeWidth="1" opacity="0.6" /></svg>
            trail
          </span>
        </div>
      )}

      {/* Stats footer */}
      {problem && (
        <div className="mt-0.5 ngs-text-micro text-neutral-500 ngs-tabular">
          <span>L{layer}: {problem.h1_cycles.length} cycles</span>
          {compareProblem && (
            <span className="ml-2 pl-2 border-l border-neutral-700">
              L{compareLayer}: {compareProblem.h1_cycles.length} cycles · {compareProblem.n_tokens} tok · logp {compareProblem.mean_logprob.toFixed(2)}
            </span>
          )}
        </div>
      )}
    </>
  );
});
H1LoopNode.displayName = "H1LoopNode";
