import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/pack-registry";

type PromptData = {
  config?: { prompt?: string };
  status?: "idle" | "computing" | "error";
  outputs?: Record<string, unknown>;
};

type Math500Problem = {
  idx: number;
  prompt: string;
  subject: string;
  level: string | number;
  correct: boolean;
};

const DEMO_INTERVAL = 15_000;

export const PromptInputNode = memo(({ id, selected }: NodeProps) => {
  const nodeData = useNodesData<Node<PromptData>>(id);
  const [localPrompt, setLocalPrompt] = useState("");
  const [synced, setSynced] = useState(false);
  const [math500, setMath500] = useState<Math500Problem[] | null>(null);
  const [mathIdx, setMathIdx] = useState(0);
  const [demo, setDemo] = useState(false);
  const [countdown, setCountdown] = useState(DEMO_INTERVAL / 1000);
  const mathIdxRef = useRef(0);
  const math500Ref = useRef<Math500Problem[] | null>(null);

  mathIdxRef.current = mathIdx;
  math500Ref.current = math500;

  useEffect(() => {
    fetch("/math500_prompts.json")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.problems?.length) {
          setMath500(data.problems);
          setLocalPrompt(data.problems[0].prompt);
          setSynced(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!synced && !math500 && nodeData?.data?.config?.prompt) {
      setLocalPrompt(nodeData.data.config.prompt);
      setSynced(true);
    }
  }, [synced, math500, nodeData?.data?.config?.prompt]);

  const def = NODE_REGISTRY.prompt_input;

  const navigateProblem = useCallback((delta: number) => {
    if (!math500) return;
    const next = (mathIdx + delta + math500.length) % math500.length;
    setMathIdx(next);
    setLocalPrompt(math500[next].prompt);
  }, [math500, mathIdx]);

  const fireAt = useCallback((idx: number) => {
    const problems = math500Ref.current;
    if (!problems) return;
    const i = ((idx % problems.length) + problems.length) % problems.length;
    const p = problems[i];
    window.dispatchEvent(new CustomEvent("substrate:compute_request", {
      detail: {
        type: "compute_request",
        request_id: `req-${Date.now()}`,
        node_id: id,
        inputs: { config: { prompt: p.prompt, math_idx: i } },
      },
    }));
    const next = (i + 1) % problems.length;
    setMathIdx(next);
    setLocalPrompt(problems[next].prompt);
  }, [id]);

  const handleAnalyze = useCallback(() => {
    if (math500) {
      fireAt(mathIdx);
    } else {
      window.dispatchEvent(new CustomEvent("substrate:compute_request", {
        detail: {
          type: "compute_request",
          request_id: `req-${Date.now()}`,
          node_id: id,
          inputs: { config: { prompt: localPrompt } },
        },
      }));
    }
  }, [id, localPrompt, math500, mathIdx, fireAt]);

  const fireRef = useRef(fireAt);
  fireRef.current = fireAt;

  useEffect(() => {
    if (!demo || !math500) return;
    fireRef.current(mathIdxRef.current);
    setCountdown(DEMO_INTERVAL / 1000);
    const tick = setInterval(() => setCountdown((c) => c - 1), 1000);
    const cycle = setInterval(() => {
      fireRef.current(mathIdxRef.current);
      setCountdown(DEMO_INTERVAL / 1000);
    }, DEMO_INTERVAL);
    return () => { clearInterval(tick); clearInterval(cycle); };
  }, [demo, math500]);

  const demoPrev = useCallback(() => {
    const i = mathIdxRef.current;
    const len = math500Ref.current?.length ?? 1;
    fireRef.current((i - 2 + len) % len);
    setCountdown(DEMO_INTERVAL / 1000);
  }, []);

  const demoNext = useCallback(() => {
    fireRef.current(mathIdxRef.current);
    setCountdown(DEMO_INTERVAL / 1000);
  }, []);

  const status = nodeData?.data?.status ?? "idle";
  const current = math500?.[mathIdx];

  return (
    <BaseNodeShell
      selected={selected}
      label={def.label}
      category={def.category}
      outputs={def.outputs}
      status={status}
    >
      {math500 && (
        <div className="nodrag mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-semibold tracking-widest text-neutral-500 uppercase">Demo</span>
            {demo && (
              <span className="text-[9px] tabular-nums text-neutral-500">{countdown}s</span>
            )}
          </div>
          <div className="flex gap-1">
            <button
              className="rounded px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-600 disabled:opacity-30"
              onClick={demoPrev}
              disabled={!demo}
              title="Previous problem"
            >
              ◄◄
            </button>
            <button
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                demo
                  ? "bg-emerald-700 text-white hover:bg-emerald-600"
                  : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
              }`}
              onClick={() => setDemo((d) => !d)}
            >
              {demo ? "Stop Demo" : "Start Demo"}
            </button>
            <button
              className="rounded px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-600 disabled:opacity-30"
              onClick={demoNext}
              disabled={!demo}
              title="Skip to next problem"
            >
              ►►
            </button>
          </div>
          <div className="mt-1.5 border-b border-neutral-700" />
        </div>
      )}

      {math500 && current && (
        <div className="nodrag flex items-center gap-1 mb-1.5 text-[10px] text-neutral-400">
          <button
            className="px-1 rounded hover:bg-neutral-700 text-neutral-500"
            onClick={() => navigateProblem(-1)}
          >
            ◄
          </button>
          <span className="flex-1 text-center truncate">
            <span className={current.correct ? "text-emerald-400" : "text-red-400"}>
              {current.correct ? "✓" : "✗"}
            </span>
            {" "}
            {mathIdx + 1}/{math500.length} — {current.subject} L{current.level}
          </span>
          <button
            className="px-1 rounded hover:bg-neutral-700 text-neutral-500"
            onClick={() => navigateProblem(1)}
          >
            ►
          </button>
        </div>
      )}
      <textarea
        className="nodrag nowheel w-full resize-none rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-amber-600 focus:outline-none"
        rows={3}
        placeholder="Enter prompt..."
        value={localPrompt}
        onChange={(e) => setLocalPrompt(e.target.value)}
      />
      <button
        className="mt-2 w-full rounded bg-amber-700 px-3 py-1 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        onClick={handleAnalyze}
        disabled={!localPrompt.trim() || status === "computing"}
      >
        {status === "computing" ? "Analyzing..." : "Analyze"}
      </button>
    </BaseNodeShell>
  );
});
PromptInputNode.displayName = "PromptInputNode";
