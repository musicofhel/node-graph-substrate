import { useCallback, useRef, useMemo } from "react";
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
import { useUIStore } from "../../lib/store/ui-store";
import { CanvasControls } from "./CanvasControls";
import { PipelineTimeline } from "./PipelineTimeline";
import { nodeTypes } from "./node-types";
import { NodePalette } from "../sidebar/NodePalette";
import { NODE_REGISTRY } from "../../lib/nodes/registry";
import { EventLog } from "../panels/EventLog";
import { ConfigPanel } from "../panels/ConfigPanel";

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
  const eventLogOpen = useUIStore((s) => s.eventLogOpen);
  const configPanelNodeId = useUIStore((s) => s.configPanelNodeId);
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: { id: string }) => {
    setSelectedNodeId(node.id);
  }, [setSelectedNodeId]);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  const handleInit = useCallback((instance: ReactFlowInstance) => {
    rfInstance.current = instance;
  }, []);

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
    <div className="absolute inset-0 flex">
      <div className="w-[180px] shrink-0 overflow-y-auto border-r border-neutral-800 bg-neutral-950">
        <NodePalette />
      </div>
      <div className="relative flex-1 flex flex-col overflow-hidden">
        <div className="relative flex-1 min-h-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            isValidConnection={isValidConnection}
            onInit={handleInit}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            colorMode="dark"
            fitView
            snapToGrid
            snapGrid={[20, 20]}
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background color="#333" gap={20} />
            <Controls />
            <MiniMap
              nodeColor="#10b981"
              maskColor="rgba(0,0,0,0.7)"
              bgColor="#171717"
            />
            <PipelineTimeline />
          </ReactFlow>
          <CanvasControls />
          {configPanelNodeId && (
            <div className="absolute right-0 top-0 bottom-0 w-[300px] z-40">
              <ConfigPanel />
            </div>
          )}
        </div>
        {eventLogOpen && (
          <div className="h-[250px] shrink-0 border-t border-neutral-800">
            <EventLog />
          </div>
        )}
      </div>
    </div>
  );
}
