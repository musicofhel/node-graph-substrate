import { useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type DefaultEdgeOptions,
  type ReactFlowInstance,
  type Edge,
  type Connection,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCanvasStore } from "../../lib/store/canvas-store";
import { CanvasControls } from "./CanvasControls";
import { nodeTypes } from "./node-types";
import { NodePalette } from "../sidebar/NodePalette";
import { NODE_REGISTRY } from "../../lib/nodes/registry";

const defaultEdgeOptions: DefaultEdgeOptions = {
  style: { strokeWidth: 2, stroke: "#525252" },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "#525252",
    width: 16,
    height: 16,
  },
};

export function SubstrateCanvas() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const setSelectedNodeId = useCanvasStore((s) => s.setSelectedNodeId);
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  const isValidConnection = useCallback((connection: Edge | Connection) => {
    if (!connection.sourceHandle || !connection.targetHandle) return true;
    const sourceNode = useCanvasStore.getState().nodes.find((n) => n.id === connection.source);
    const targetNode = useCanvasStore.getState().nodes.find((n) => n.id === connection.target);
    if (!sourceNode?.type || !targetNode?.type) return true;
    const sourceDef = NODE_REGISTRY[sourceNode.type];
    const targetDef = NODE_REGISTRY[targetNode.type];
    if (!sourceDef || !targetDef) return true;
    const sourcePort = sourceDef.outputs.find((o) => o.id === connection.sourceHandle);
    const targetPort = targetDef.inputs.find((i) => i.id === connection.targetHandle);
    if (!sourcePort || !targetPort) return true;
    return sourcePort.type === targetPort.type;
  }, []);

  return (
    <div className="relative flex h-full w-full">
      <div className="w-[180px] shrink-0 overflow-y-auto border-r border-neutral-800 bg-neutral-950">
        <NodePalette />
      </div>
      <div className="relative flex-1">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onPaneClick={() => setSelectedNodeId(null)}
        isValidConnection={isValidConnection}
        onInit={(instance) => {
          rfInstance.current = instance;
        }}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#333" gap={20} />
        <Controls />
        <MiniMap
          nodeColor="#10b981"
          maskColor="rgba(0,0,0,0.7)"
          bgColor="#171717"
        />
      </ReactFlow>
      <CanvasControls />
      </div>
    </div>
  );
}
