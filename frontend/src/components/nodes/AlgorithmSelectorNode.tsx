import { memo, useEffect, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/nodes/registry";
import { useExperimentStore } from "../../lib/store/experiment-store";
import { type AlgorithmInfo } from "../../lib/hooks/useExperimentData";

const API_BASE = `http://${window.location.hostname}:8080`;

export const AlgorithmSelectorNode = memo(({ selected }: NodeProps) => {
  const def = NODE_REGISTRY.algorithm_selector;
  const [algorithms, setAlgorithms] = useState<AlgorithmInfo[]>([]);
  const algorithmA = useExperimentStore((s) => s.algorithmA);
  const algorithmB = useExperimentStore((s) => s.algorithmB);
  const setAlgorithmA = useExperimentStore((s) => s.setAlgorithmA);
  const setAlgorithmB = useExperimentStore((s) => s.setAlgorithmB);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`${API_BASE}/api/experiments/algorithms`, { signal: ac.signal })
      .then((r) => r.json())
      .then(setAlgorithms)
      .catch(() => {});
    return () => ac.abort();
  }, []);

  return (
    <BaseNodeShell selected={selected} label={def.label} category={def.category}>
      <div className="nodrag" style={{ minWidth: 260 }}>
        <div className="text-[9px] text-neutral-500 mb-1">
          Click A/B to assign algorithms to comparison panels
        </div>
        <div className="flex flex-col gap-0.5">
          {algorithms.map((algo) => {
            const isA = algorithmA === algo.name;
            const isB = algorithmB === algo.name;
            return (
              <div
                key={algo.name}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${
                  isA ? "bg-violet-900/40 border border-violet-700" :
                  isB ? "bg-cyan-900/40 border border-cyan-700" :
                  "bg-neutral-800/50 border border-transparent"
                }`}
              >
                <span className={`flex-1 truncate ${algo.available ? "text-neutral-200" : "text-neutral-500"}`}>
                  {algo.label}
                </span>
                {!algo.available && (
                  <span className="text-[8px] text-neutral-600">not precomputed</span>
                )}
                <button
                  onClick={() => setAlgorithmA(algo.name)}
                  disabled={!algo.available}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                    isA
                      ? "bg-violet-700 text-white"
                      : algo.available
                        ? "bg-neutral-700 text-neutral-400 hover:bg-violet-800 hover:text-white"
                        : "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                  }`}
                >
                  A
                </button>
                <button
                  onClick={() => setAlgorithmB(algo.name)}
                  disabled={!algo.available}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                    isB
                      ? "bg-cyan-700 text-white"
                      : algo.available
                        ? "bg-neutral-700 text-neutral-400 hover:bg-cyan-800 hover:text-white"
                        : "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                  }`}
                >
                  B
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </BaseNodeShell>
  );
});
AlgorithmSelectorNode.displayName = "AlgorithmSelectorNode";
