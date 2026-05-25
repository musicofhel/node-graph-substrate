import { memo } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { useNavigate } from "react-router";
import { BaseNodeShell } from "../../../components/nodes/BaseNodeShell";
import { NODE_REGISTRY } from "../../../lib/pack-registry";

type NodeRefData = {
  targetProjectId?: string;
  targetCanvasId?: string;
  targetNodeId?: string;
  targetLabel?: string;
};

export const NodeRefNode = memo(({ id, selected }: NodeProps) => {
  const nodeData = useNodesData<Node<NodeRefData>>(id);
  const navigate = useNavigate();
  const def = NODE_REGISTRY.node_ref;

  const projectId = nodeData?.data?.targetProjectId;
  const canvasId = nodeData?.data?.targetCanvasId;
  const nodeId = nodeData?.data?.targetNodeId;
  const label = nodeData?.data?.targetLabel;
  const configured = projectId && canvasId;

  return (
    <BaseNodeShell selected={selected} label={def.label} category={def.category}>
      {configured ? (
        <button
          type="button"
          className="w-full rounded px-2 py-1.5 text-left text-xs text-neutral-300 transition-colors hover:bg-sky-900/40"
          onClick={() => navigate(`/p/${projectId}/c/${canvasId}`)}
        >
          <span className="block font-medium text-sky-400">{label ?? "Node"}</span>
          {nodeId && <span className="text-[10px] text-neutral-500">Node {nodeId.slice(0, 8)}</span>}
        </button>
      ) : (
        <div className="py-2 text-center text-xs text-neutral-500">Not configured</div>
      )}
    </BaseNodeShell>
  );
});
NodeRefNode.displayName = "NodeRefNode";
