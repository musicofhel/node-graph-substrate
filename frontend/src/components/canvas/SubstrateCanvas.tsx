import { useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type DefaultEdgeOptions,
  type ReactFlowInstance,
  MarkerType,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCanvasStore } from "../../lib/store/canvas-store";
import { useUIStore } from "../../lib/store/ui-store";
import { CanvasControls } from "./CanvasControls";
import { nodeTypes } from "./node-types";
import { NodePalette } from "../sidebar/NodePalette";

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
  const setConfigPanelNodeId = useUIStore((s) => s.setConfigPanelNodeId);
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      setConfigPanelNodeId(node.id);
    },
    [setSelectedNodeId, setConfigPanelNodeId],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setConfigPanelNodeId(null);
  }, [setSelectedNodeId, setConfigPanelNodeId]);

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
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
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
