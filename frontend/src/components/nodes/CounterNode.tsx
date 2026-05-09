import { memo } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";

type CounterData = { counter: number };

export const CounterNode = memo(({ id }: NodeProps) => {
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
