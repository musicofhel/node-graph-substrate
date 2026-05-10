import { memo, useCallback, useEffect, useState } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/nodes/registry";

type PromptData = {
  config?: { prompt?: string };
  status?: "idle" | "computing" | "error";
  outputs?: Record<string, unknown>;
};

export const PromptInputNode = memo(({ id }: NodeProps) => {
  const nodeData = useNodesData<Node<PromptData>>(id);
  const [localPrompt, setLocalPrompt] = useState("");
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!synced && nodeData?.data?.config?.prompt) {
      setLocalPrompt(nodeData.data.config.prompt);
      setSynced(true);
    }
  }, [synced, nodeData?.data?.config?.prompt]);
  const def = NODE_REGISTRY.prompt_input;

  const handleAnalyze = useCallback(() => {
    const event = new CustomEvent("substrate:compute_request", {
      detail: {
        type: "compute_request",
        request_id: `req-${Date.now()}`,
        node_id: id,
        inputs: { config: { prompt: localPrompt } },
      },
    });
    window.dispatchEvent(event);
  }, [id, localPrompt]);

  const status = nodeData?.data?.status ?? "idle";

  return (
    <BaseNodeShell
      label={def.label}
      category={def.category}
      outputs={def.outputs}
      status={status}
    >
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
