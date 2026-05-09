import { memo, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  useNodesData,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SubstrateWS } from "./lib/ws/client";

type CounterData = { counter: number };

const CounterNode = memo(({ id }: NodeProps) => {
  const nodeData = useNodesData<Node<CounterData>>(id);
  const counter = nodeData?.data?.counter ?? 0;

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-6 py-4 shadow-lg">
      <div className="mb-1 text-xs font-medium tracking-wide text-neutral-400 uppercase">
        Counter
      </div>
      <div className="text-4xl font-bold tabular-nums text-emerald-400">
        {counter}
      </div>
    </div>
  );
});
CounterNode.displayName = "CounterNode";

const nodeTypes = { counter: CounterNode };

const initialNodes: Node<CounterData>[] = [
  {
    id: "n1",
    type: "counter",
    position: { x: 250, y: 200 },
    data: { counter: 0 },
  },
];

export default function App() {
  const { setNodes } = useReactFlow();
  const wsRef = useRef<SubstrateWS | null>(null);

  const handleMessage = useCallback(
    (msg: Record<string, unknown>) => {
      if (msg.type === "stream_event") {
        const nodeId = msg.node_id as string;
        const payload = msg.payload as Record<string, unknown>;
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, ...payload } } : n,
          ),
        );
      }
    },
    [setNodes],
  );

  useEffect(() => {
    const ws = new SubstrateWS("demo");
    wsRef.current = ws;
    ws.onMessage(handleMessage);
    ws.connect();
    return () => ws.disconnect();
  }, [handleMessage]);

  return (
    <div className="h-screen w-screen">
      <ReactFlow
        defaultNodes={initialNodes}
        nodeTypes={nodeTypes}
        fitView
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
    </div>
  );
}
