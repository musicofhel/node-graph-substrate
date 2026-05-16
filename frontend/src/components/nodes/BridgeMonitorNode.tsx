import { memo } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/nodes/registry";
import { useNodeDrift } from "../../lib/store/drift-store";

type BridgeData = {
  healthy?: boolean;
  bridge_at_pos0?: Record<string, boolean>;
  pos0_silhouette_by_layer?: Record<string, number>;
  silhouette_by_layer?: Record<string, number>;
  crystallization?: number;
  crystallized?: boolean;
  anomaly_reason?: string | null;
};

export const BridgeMonitorNode = memo(({ id }: NodeProps) => {
  const nodeData = useNodesData<Node<BridgeData>>(id);
  const data = nodeData?.data ?? {};
  const def = NODE_REGISTRY.bridge_monitor;
  const hasData = data.bridge_at_pos0 !== undefined;
  const drift = useNodeDrift(id);

  return (
    <BaseNodeShell label={def.label} category={def.category} inputs={def.inputs} healthStatus={drift?.worst}>
      <div style={{ width: 240 }}>
        {hasData ? (
          <>
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`inline-block h-3 w-3 rounded-full ${
                  data.healthy ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              <span className="text-sm font-medium text-neutral-200">
                {data.healthy ? "HEALTHY" : "ANOMALY"}
              </span>
              {(data.crystallization !== undefined || data.crystallized !== undefined) && (
                <span className="ml-auto text-[10px] text-neutral-500">
                  cryst: {data.crystallization !== undefined
                    ? data.crystallization.toFixed(2)
                    : data.crystallized ? "yes" : "no"}
                </span>
              )}
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-neutral-500">
                  <th className="pb-1 text-left font-normal">Layer</th>
                  <th className="pb-1 text-left font-normal">Bridge</th>
                  <th className="pb-1 text-right font-normal">Pos-0 Sil</th>
                  <th className="pb-1 text-right font-normal">Mean Sil</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.bridge_at_pos0 ?? {})
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([layer, isBridge]) => (
                    <tr key={layer} className="text-neutral-300">
                      <td className="py-0.5">L{layer}</td>
                      <td className="py-0.5">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            isBridge ? "bg-amber-400" : "bg-neutral-600"
                          }`}
                        />
                        <span className="ml-1">
                          {isBridge ? "bridge" : "core"}
                        </span>
                      </td>
                      <td className="py-0.5 text-right font-mono">
                        {(data.pos0_silhouette_by_layer?.[layer] ?? data.silhouette_by_layer?.[layer] ?? 0).toFixed(3)}
                      </td>
                      <td className="py-0.5 text-right font-mono">
                        {(data.silhouette_by_layer?.[layer] ?? 0).toFixed(3)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {data.anomaly_reason && (
              <div className="mt-1 text-[10px] text-red-400">
                {data.anomaly_reason}
              </div>
            )}
          </>
        ) : (
          <div className="py-4 text-center text-xs text-neutral-500">
            Waiting for bridge health...
          </div>
        )}
      </div>
    </BaseNodeShell>
  );
});
BridgeMonitorNode.displayName = "BridgeMonitorNode";
