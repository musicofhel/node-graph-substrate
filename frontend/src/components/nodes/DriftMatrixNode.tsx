import { memo, useMemo, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/pack-registry";
import { useDriftStore } from "../../lib/store/drift-store";
import { computePSI, driftSeverity, type DriftSeverity } from "../../lib/drift/psi";
import { FEATURES, FEATURE_META, type FeatureName } from "../../packs/topo-confidence/features";
import { useZoomTier } from "../../lib/hooks/useZoomTier";

const DRIFT_STEPS = [
  "var(--ngs-drift-0)",
  "var(--ngs-drift-1)",
  "var(--ngs-drift-2)",
  "var(--ngs-drift-3)",
  "var(--ngs-drift-4)",
];

function driftColor(psi: number): string {
  if (psi < 0.05) return DRIFT_STEPS[0];
  if (psi < 0.10) return DRIFT_STEPS[1];
  if (psi < 0.20) return DRIFT_STEPS[2];
  if (psi < 0.30) return DRIFT_STEPS[3];
  return DRIFT_STEPS[4];
}

const SEVERITY_BORDER: Record<DriftSeverity, string> = {
  ok: "transparent",
  warning: "#f59e0b",
  alert: "#ef4444",
};

const CELL_W = 22;
const CELL_H = 16;
const LABEL_W = 90;
const HEADER_H = 50;

interface CellData {
  feature: FeatureName;
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
  const tier = useZoomTier();

  const baselineName = baselineMode === "snapshot" && baselines.size > 0
    ? baselines.values().next().value?.name ?? "snapshot"
    : null;

  const { cells, nodeIds, worst } = useMemo(() => {
    const nodeIds: string[] = [];
    const cells: CellData[] = [];
    let worst: { feature: FeatureName; nodeId: string; psi: number } | null = null;

    for (const [nid, history] of histories) {
      if (nid === id || history.length < 20) continue;
      nodeIds.push(nid);

      const useSnapshot = baselineMode === "snapshot" && baselines.has(nid);
      const baseRecords = useSnapshot ? baselines.get(nid)!.samples : history.slice(0, Math.floor(history.length / 2));
      const currRecords = useSnapshot ? history : history.slice(Math.floor(history.length / 2));

      for (const feat of FEATURES) {
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

  const nodeCount = nodeIds.length;
  const ariaLabel = `Drift matrix: ${nodeCount} nodes × ${FEATURES.length} features`;

  const shell = (children: React.ReactNode) => (
    <BaseNodeShell
      selected={selected}
      label={def.label}
      category={def.category}
      healthStatus={worst ? driftSeverity(worst.psi) : undefined}
      minWidth={240}
      minHeight={320}
      ariaLabel={ariaLabel}
    >
      {children}
    </BaseNodeShell>
  );

  if (nodeIds.length === 0) {
    return shell(
      <div className="ngs-text-body text-neutral-500">
        Waiting for history (need 20+ samples on at least one node)...
      </div>
    );
  }

  if (tier === "T0") {
    return shell(
      <div className="flex h-full w-full items-center justify-center rounded" style={{ background: "var(--ngs-drift-2)", minHeight: 80 }} />
    );
  }

  if (tier === "T1") {
    return shell(
      <div className="flex h-full w-full items-center justify-center rounded" style={{ background: "var(--ngs-drift-2)", minHeight: 80 }}>
        <span className="ngs-text-title text-white">Drift Matrix</span>
      </div>
    );
  }

  const svgW = LABEL_W + nodeIds.length * CELL_W + 4;
  const svgH = HEADER_H + FEATURES.length * CELL_H + 20;

  if (tier === "T2") {
    return shell(
      <div className="nodrag nowheel relative overflow-x-auto">
        <svg width={svgW} height={svgH} className="block">
          {FEATURES.map((feat, row) => (
            <g key={feat}>
              {nodeIds.map((nid, col) => {
                const cell = cells.find((c) => c.feature === feat && c.nodeId === nid);
                if (!cell) return null;
                return (
                  <g key={`${feat}-${nid}`}>
                    <rect
                      x={LABEL_W + col * CELL_W + 1}
                      y={HEADER_H + row * CELL_H + 1}
                      width={CELL_W - 2}
                      height={CELL_H - 2}
                      rx={2}
                      fill={driftColor(cell.psi)}
                      opacity={0.8}
                    />
                    {cell.severity !== "ok" && (
                      <rect
                        x={LABEL_W + col * CELL_W + 2}
                        y={HEADER_H + row * CELL_H + 2}
                        width={CELL_W - 4}
                        height={CELL_H - 4}
                        rx={1}
                        fill="none"
                        stroke={SEVERITY_BORDER[cell.severity]}
                        strokeWidth={1.5}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
    );
  }

  return shell(
    <div className="nodrag nowheel relative overflow-x-auto">
      <div className="ngs-text-micro mb-1 text-neutral-500">
        {baselineName ? `vs baseline: ${baselineName}` : "vs rolling"}
      </div>
      <svg width={svgW} height={svgH} className="block">
        {nodeIds.map((nid, col) => {
          const shortId = nid.length > 6 ? nid.slice(0, 6) : nid;
          return (
            <text
              key={`hdr-${nid}`}
              x={LABEL_W + col * CELL_W + CELL_W / 2}
              y={HEADER_H - 4}
              textAnchor="middle"
              fill="#737373"
              fontSize={9}
              transform={`rotate(-45 ${LABEL_W + col * CELL_W + CELL_W / 2} ${HEADER_H - 4})`}
            >
              {shortId}
            </text>
          );
        })}

        {FEATURES.map((feat, row) => {
          const meta = FEATURE_META[feat];
          return (
            <g key={feat}>
              <text
                x={LABEL_W - 4}
                y={HEADER_H + row * CELL_H + CELL_H / 2 + 3}
                textAnchor="end"
                fill="#a3a3a3"
                fontSize={9}
              >
                {meta.shortName}
              </text>
              {nodeIds.map((nid, col) => {
                const cell = cells.find((c) => c.feature === feat && c.nodeId === nid);
                if (!cell) return null;
                const tipText = `${meta.shortName} @ ${nid.slice(0, 8)}: PSI=${cell.psi.toFixed(3)}`;
                return (
                  <g key={`${feat}-${nid}`}>
                    <rect
                      x={LABEL_W + col * CELL_W + 1}
                      y={HEADER_H + row * CELL_H + 1}
                      width={CELL_W - 2}
                      height={CELL_H - 2}
                      rx={2}
                      fill={driftColor(cell.psi)}
                      opacity={0.8}
                      onMouseEnter={() => setTooltip(tipText)}
                      onMouseLeave={() => setTooltip(null)}
                    />
                    {cell.severity !== "ok" && (
                      <rect
                        x={LABEL_W + col * CELL_W + 2}
                        y={HEADER_H + row * CELL_H + 2}
                        width={CELL_W - 4}
                        height={CELL_H - 4}
                        rx={1}
                        fill="none"
                        stroke={SEVERITY_BORDER[cell.severity]}
                        strokeWidth={1.5}
                        onMouseEnter={() => setTooltip(tipText)}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {tooltip && (
        <div className="ngs-text-micro absolute bottom-0 left-0 right-0 rounded bg-neutral-800 px-2 py-0.5 text-neutral-300">
          {tooltip}
        </div>
      )}
      {worst && (
        <div className="ngs-text-micro ngs-tabular mt-1 truncate text-neutral-400" style={{ maxWidth: svgW }}>
          Worst: {FEATURE_META[worst.feature].shortName} @ {worst.nodeId.slice(0, 8)} (PSI {worst.psi.toFixed(3)})
        </div>
      )}
    </div>
  );
});
DriftMatrixNode.displayName = "DriftMatrixNode";
