import { memo, useMemo, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/nodes/registry";
import { useDriftStore } from "../../lib/store/drift-store";
import { computePSI, driftSeverity, type DriftSeverity } from "../../lib/drift/psi";

const FEATURE_NAMES = [
  "H0_persistence_entropy", "H1_max_lifetime", "H0_total_persistence",
  "H0_n_features", "H1_persistence_entropy", "H1_n_features",
  "H2_n_features", "H2_total_persistence", "H2_persistence_entropy",
  "bridge_silhouette", "H0_ph_significance", "H1_ph_significance",
  "topological_sensitivity",
] as const;

const SEVERITY_COLORS: Record<DriftSeverity, string> = {
  ok: "#22c55e",
  warning: "#f59e0b",
  alert: "#ef4444",
};

const CELL_W = 22;
const CELL_H = 16;
const LABEL_W = 80;
const HEADER_H = 50;

interface CellData {
  feature: string;
  nodeId: string;
  psi: number;
  severity: DriftSeverity;
}

export const DriftMatrixNode = memo(({ id, selected }: NodeProps) => {
  const def = NODE_REGISTRY.drift_matrix;
  const histories = useDriftStore((s) => s.histories);
  const baselines = useDriftStore((s) => s.baselines);
  const baselineMode = useDriftStore((s) => s.baselineMode);
  const [tooltip, setTooltip] = useState<string | null>(null);

  const baselineName = baselineMode === "snapshot" && baselines.size > 0
    ? baselines.values().next().value?.name ?? "snapshot"
    : null;

  const { cells, nodeIds, worst } = useMemo(() => {
    const nodeIds: string[] = [];
    const cells: CellData[] = [];
    let worst: { feature: string; nodeId: string; psi: number } | null = null;

    for (const [nid, history] of histories) {
      if (nid === id || history.length < 20) continue;
      nodeIds.push(nid);

      const useSnapshot = baselineMode === "snapshot" && baselines.has(nid);
      const baseRecords = useSnapshot ? baselines.get(nid)!.samples : history.slice(0, Math.floor(history.length / 2));
      const currRecords = useSnapshot ? history : history.slice(Math.floor(history.length / 2));

      for (const feat of FEATURE_NAMES) {
        const baseVals = baseRecords.map((r) => r.values[feat]).filter((v): v is number => v !== undefined);
        const currVals = currRecords.map((r) => r.values[feat]).filter((v): v is number => v !== undefined);

        if (baseVals.length < 5 || currVals.length < 5) {
          cells.push({ feature: feat, nodeId: nid, psi: 0, severity: "ok" });
          continue;
        }

        const psi = computePSI(baseVals, currVals);
        const severity = driftSeverity(psi);
        cells.push({ feature: feat, nodeId: nid, psi, severity });

        if (!worst || psi > worst.psi) {
          worst = { feature: feat, nodeId: nid, psi };
        }
      }
    }

    return { cells, nodeIds, worst };
  }, [histories, baselines, baselineMode, id]);

  if (nodeIds.length === 0) {
    return (
      <BaseNodeShell selected={selected} label={def.label} category={def.category}>
        <div className="text-xs text-neutral-500 w-[200px]">
          Waiting for history (need 20+ samples on at least one node)...
        </div>
      </BaseNodeShell>
    );
  }

  const svgW = LABEL_W + nodeIds.length * CELL_W + 4;
  const svgH = HEADER_H + FEATURE_NAMES.length * CELL_H + 20;

  return (
    <BaseNodeShell selected={selected} label={def.label} category={def.category}>
      <div className="relative">
        <div className="mb-1 text-[9px] text-neutral-500">
          {baselineName ? `vs baseline: ${baselineName}` : "vs rolling"}
        </div>
        <svg width={svgW} height={svgH} className="block">
          {/* Column headers */}
          {nodeIds.map((nid, col) => {
            const shortId = nid.length > 6 ? nid.slice(0, 6) : nid;
            return (
              <text
                key={`hdr-${nid}`}
                x={LABEL_W + col * CELL_W + CELL_W / 2}
                y={HEADER_H - 4}
                textAnchor="middle"
                fill="#737373"
                fontSize={7}
                transform={`rotate(-45 ${LABEL_W + col * CELL_W + CELL_W / 2} ${HEADER_H - 4})`}
              >
                {shortId}
              </text>
            );
          })}

          {/* Rows */}
          {FEATURE_NAMES.map((feat, row) => {
            const shortName = feat.replace(/_/g, " ").replace(/persistence /g, "p.");
            return (
              <g key={feat}>
                <text
                  x={LABEL_W - 4}
                  y={HEADER_H + row * CELL_H + CELL_H / 2 + 3}
                  textAnchor="end"
                  fill="#a3a3a3"
                  fontSize={8}
                >
                  {shortName}
                </text>
                {nodeIds.map((nid, col) => {
                  const cell = cells.find((c) => c.feature === feat && c.nodeId === nid);
                  if (!cell) return null;
                  const tipText = `${feat} @ ${nid.slice(0, 8)}: PSI=${cell.psi.toFixed(3)}`;
                  return (
                    <rect
                      key={`${feat}-${nid}`}
                      x={LABEL_W + col * CELL_W + 1}
                      y={HEADER_H + row * CELL_H + 1}
                      width={CELL_W - 2}
                      height={CELL_H - 2}
                      rx={2}
                      fill={SEVERITY_COLORS[cell.severity]}
                      opacity={0.8}
                      onMouseEnter={() => setTooltip(tipText)}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
        {tooltip && (
          <div className="absolute bottom-0 left-0 right-0 bg-neutral-800 px-2 py-0.5 text-[9px] text-neutral-300 rounded">
            {tooltip}
          </div>
        )}
        {worst && (
          <div className="mt-1 text-[9px] text-neutral-400 truncate" style={{ maxWidth: svgW }}>
            Worst: {worst.feature} @ {worst.nodeId.slice(0, 8)} (PSI {worst.psi.toFixed(3)})
          </div>
        )}
      </div>
    </BaseNodeShell>
  );
});
DriftMatrixNode.displayName = "DriftMatrixNode";
