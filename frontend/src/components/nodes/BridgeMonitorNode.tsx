import { memo } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/pack-registry";
import { useNodeDrift } from "../../lib/store/drift-store";
import { useZoomTier } from "../../lib/hooks/useZoomTier";

type BridgeData = {
  healthy?: boolean;
  bridge_at_pos0?: Record<string, boolean>;
  pos0_silhouette_by_layer?: Record<string, number>;
  silhouette_by_layer?: Record<string, number>;
  crystallization?: number;
  crystallized?: boolean;
  anomaly_reason?: string | null;
};

export const BridgeMonitorNode = memo(({ id, selected }: NodeProps) => {
  const nodeData = useNodesData<Node<BridgeData>>(id);
  const data = nodeData?.data ?? {};
  const def = NODE_REGISTRY.bridge_monitor;
  const hasData = data.bridge_at_pos0 !== undefined;
  const drift = useNodeDrift(id);
  const tier = useZoomTier();

  const layers = Object.entries(data.bridge_at_pos0 ?? {}).sort(([a], [b]) => Number(a) - Number(b));
  const ariaLabel = `Bridge monitor: ${hasData ? (data.healthy ? "healthy" : "anomaly") + `, ${layers.length} layers` : "waiting"}`;

  const shell = (children: React.ReactNode) => (
    <BaseNodeShell
      selected={selected}
      label={def.label}
      category={def.category}
      inputs={def.inputs}
      healthStatus={drift?.worst}
      minWidth={240}
      minHeight={200}
      ariaLabel={ariaLabel}
    >
      {children}
    </BaseNodeShell>
  );

  if (!hasData) {
    return shell(
      <div className="ngs-text-body py-4 text-center text-neutral-500">
        Waiting for bridge health...
      </div>
    );
  }

  if (tier === "T0") {
    return shell(
      <div className="flex h-full w-full items-center justify-center rounded" style={{ background: "var(--ngs-viridis-2)", minHeight: 80 }} />
    );
  }

  if (tier === "T1") {
    return shell(
      <div className="flex h-full w-full items-center justify-center rounded" style={{ background: "var(--ngs-viridis-2)", minHeight: 80 }}>
        <span className="ngs-text-title text-white">Bridge Monitor</span>
      </div>
    );
  }

  if (tier === "T2") {
    return shell(
      <div className="w-full min-w-[220px]">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full transition-colors duration-500"
            style={{ backgroundColor: data.healthy ? "var(--ngs-sign-pos)" : "var(--ngs-sign-neg)" }}
          />
        </div>
        <div className="nodrag nowheel max-h-[200px] overflow-y-auto">
          <table className="ngs-text-meta w-full">
            <tbody>
              {layers.map(([layer, isBridge]) => (
                <tr key={layer} className="text-neutral-300">
                  <td className="py-0.5">L{layer}</td>
                  <td className="py-0.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        isBridge ? "bg-amber-400" : "bg-neutral-600"
                      }`}
                    />
                  </td>
                  <td className="ngs-tabular py-0.5 text-right">
                    {(data.pos0_silhouette_by_layer?.[layer] ?? data.silhouette_by_layer?.[layer] ?? 0).toFixed(3)}
                  </td>
                  <td className="ngs-tabular py-0.5 text-right">
                    {(data.silhouette_by_layer?.[layer] ?? 0).toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return shell(
    <div className="w-full min-w-[220px]">
      <div className="mb-2 flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full transition-colors duration-500"
          style={{ backgroundColor: data.healthy ? "var(--ngs-sign-pos)" : "var(--ngs-sign-neg)" }}
        />
        <span className="ngs-text-body font-medium text-neutral-200">
          {data.healthy ? "HEALTHY" : "ANOMALY"}
        </span>
        {(data.crystallization !== undefined || data.crystallized !== undefined) && (
          <span className="ngs-text-meta ml-auto text-neutral-500">
            cryst: {data.crystallization !== undefined
              ? data.crystallization.toFixed(2)
              : data.crystallized ? "yes" : "no"}
          </span>
        )}
      </div>
      <div className="nodrag nowheel max-h-[200px] overflow-y-auto">
        <table className="ngs-text-meta w-full">
          <thead>
            <tr className="text-neutral-500">
              <th className="pb-1 text-left font-normal">Layer</th>
              <th className="pb-1 text-left font-normal">Bridge</th>
              <th className="pb-1 text-right font-normal">Pos-0 Sil</th>
              <th className="pb-1 text-right font-normal">Mean Sil</th>
            </tr>
          </thead>
          <tbody>
            {layers.map(([layer, isBridge]) => (
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
                <td className="ngs-tabular py-0.5 text-right">
                  {(data.pos0_silhouette_by_layer?.[layer] ?? data.silhouette_by_layer?.[layer] ?? 0).toFixed(3)}
                </td>
                <td className="ngs-tabular py-0.5 text-right">
                  {(data.silhouette_by_layer?.[layer] ?? 0).toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.anomaly_reason && (
        <div className="ngs-text-meta mt-1 text-red-400">
          {data.anomaly_reason}
        </div>
      )}
    </div>
  );
});
BridgeMonitorNode.displayName = "BridgeMonitorNode";
