import { memo, Component, useMemo, type ReactNode } from "react";
import { type NodeProps } from "@xyflow/react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/pack-registry";
import { useExperimentData, type AlgorithmProjection } from "../../packs/experiments/hooks/useExperimentData";
import { useExperimentStore } from "../../lib/store/experiment-store";

class R3FErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return <div className="flex h-full items-center justify-center text-xs text-red-400">3D render error</div>;
    }
    return this.props.children;
  }
}

const CORRECT_COLOR = new THREE.Color("#22c55e");
const INCORRECT_COLOR = new THREE.Color("#ef4444");
const HIGHLIGHT_COLOR = new THREE.Color("#facc15");

function PointCloud({ projection, highlightIdx }: { projection: AlgorithmProjection; highlightIdx: number }) {
  const { positions, colors } = useMemo(() => {
    const count = projection.n_points;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const p3 = projection.points_3d[i];
      pos[i * 3] = p3[0];
      pos[i * 3 + 1] = p3[1];
      pos[i * 3 + 2] = p3[2];

      const c = i === highlightIdx ? HIGHLIGHT_COLOR : projection.correctness[i] ? CORRECT_COLOR : INCORRECT_COLOR;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return { positions: pos, colors: col };
  }, [projection, highlightIdx]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={4} vertexColors sizeAttenuation={false} />
    </points>
  );
}

function HighlightSphere({ projection, idx }: { projection: AlgorithmProjection; idx: number }) {
  if (idx < 0 || idx >= projection.n_points) return null;
  const p = projection.points_3d[idx];
  return (
    <mesh position={[p[0], p[1], p[2]]}>
      <sphereGeometry args={[0.12, 12, 12]} />
      <meshBasicMaterial color="#facc15" transparent opacity={0.9} />
    </mesh>
  );
}

function CloudPanel({ projection, highlightIdx }: { projection: AlgorithmProjection; highlightIdx: number }) {
  return (
    <R3FErrorBoundary>
      <Canvas frameloop="demand" camera={{ position: [0, 0, 5], fov: 50 }} style={{ height: "100%" }}>
        <ambientLight intensity={0.5} />
        <PointCloud projection={projection} highlightIdx={highlightIdx} />
        <HighlightSphere projection={projection} idx={highlightIdx} />
        <OrbitControls enableDamping={false} />
      </Canvas>
    </R3FErrorBoundary>
  );
}

function ScatterPanel({ projection, highlightIdx }: { projection: AlgorithmProjection; highlightIdx: number }) {
  const { minX, maxX, minY, maxY } = useMemo(() => {
    const xs = projection.points_2d.map((p) => p[0]);
    const ys = projection.points_2d.map((p) => p[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [projection]);

  const w = 240, h = 200, pad = 20;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      {projection.points_2d.map((p, i) => {
        const cx = pad + ((p[0] - minX) / rangeX) * (w - 2 * pad);
        const cy = h - pad - ((p[1] - minY) / rangeY) * (h - 2 * pad);
        const isHl = i === highlightIdx;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={isHl ? 5 : 2}
            fill={isHl ? "#facc15" : projection.correctness[i] ? "#22c55e" : "#ef4444"}
            opacity={isHl ? 1 : 0.6}
            stroke={isHl ? "#fff" : undefined}
            strokeWidth={isHl ? 1 : undefined}
          />
        );
      })}
    </svg>
  );
}

function AlgoPanel({
  projection,
  label,
  viewMode,
  highlightIdx,
  metricName,
  metricValue,
}: {
  projection: AlgorithmProjection | null;
  label: string;
  viewMode: "2d" | "3d";
  highlightIdx: number;
  metricName?: string;
  metricValue?: string;
}) {
  if (!projection || projection.n_points === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] text-neutral-600">
        No data for {label}
      </div>
    );
  }

  const is2d = viewMode === "2d" || projection.viz_type === "scatter";

  return (
    <div className="flex flex-col h-full">
      <div className="text-[8px] text-neutral-500 mb-0.5 font-mono truncate">{label}</div>
      <div className="flex-1 min-h-0">
        {is2d ? (
          <ScatterPanel projection={projection} highlightIdx={highlightIdx} />
        ) : (
          <CloudPanel projection={projection} highlightIdx={highlightIdx} />
        )}
      </div>
      {metricName && metricValue && (
        <div className="text-[8px] text-neutral-500 mt-0.5 font-mono text-center">
          {metricName}: {metricValue}
        </div>
      )}
    </div>
  );
}

export const ExperimentCloudNode = memo(({ selected }: NodeProps) => {
  const def = NODE_REGISTRY.experiment_cloud;
  const {
    projA, projB, loading, error, navigate,
    algorithmA, algorithmB, problemIdx, totalProblems,
  } = useExperimentData();
  const viewMode = useExperimentStore((s) => s.viewMode);
  const setViewMode = useExperimentStore((s) => s.setViewMode);

  const metricA = projA?.metadata;
  const metricB = projB?.metadata;
  const metricNameA = (metricA?.key_metric_name as string) ?? "";
  const metricValA = metricA?.auroc != null ? (metricA.auroc as number).toFixed(4)
    : metricA?.alpha != null ? (metricA.alpha as number).toFixed(3)
    : metricA?.auroc_v1 != null ? (metricA.auroc_v1 as number).toFixed(4)
    : metricA?.auroc_residualized != null ? (metricA.auroc_residualized as number).toFixed(4)
    : "";
  const metricNameB = (metricB?.key_metric_name as string) ?? "";
  const metricValB = metricB?.auroc != null ? (metricB.auroc as number).toFixed(4)
    : metricB?.alpha != null ? (metricB.alpha as number).toFixed(3)
    : metricB?.auroc_v1 != null ? (metricB.auroc_v1 as number).toFixed(4)
    : metricB?.auroc_residualized != null ? (metricB.auroc_residualized as number).toFixed(4)
    : "";

  return (
    <BaseNodeShell selected={selected} label={def.label} category={def.category}>
      <div className="nodrag flex items-center gap-1 mb-1.5 text-[10px] text-neutral-400">
        <button onClick={() => navigate(-1)} className="px-1 rounded hover:bg-neutral-700">◄</button>
        <span className="flex-1 text-center truncate">
          {projA ? (
            <>
              <span className={projA.correctness[problemIdx] ? "text-emerald-400" : "text-red-400"}>
                {projA.correctness[problemIdx] ? "✓" : "✗"}
              </span>{" "}
              Problem {problemIdx + 1}/{totalProblems}
            </>
          ) : loading ? "Loading..." : "No data"}
        </span>
        <button onClick={() => navigate(1)} className="px-1 rounded hover:bg-neutral-700">►</button>
      </div>

      <div className="nodrag flex items-center gap-0.5 mb-1 text-[9px]">
        <button
          onClick={() => setViewMode("2d")}
          className={`px-2 py-0.5 rounded ${viewMode === "2d" ? "bg-neutral-700 text-neutral-200" : "text-neutral-500 hover:text-neutral-300"}`}
        >2D</button>
        <button
          onClick={() => setViewMode("3d")}
          className={`px-2 py-0.5 rounded ${viewMode === "3d" ? "bg-neutral-700 text-neutral-200" : "text-neutral-500 hover:text-neutral-300"}`}
        >3D</button>
      </div>

      <div className="nodrag nowheel flex gap-1" style={{ minWidth: 640, minHeight: 280 }}>
        {error ? (
          <div className="flex flex-1 items-center justify-center text-xs text-neutral-500">{error}</div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <AlgoPanel
                projection={projA}
                label={algorithmA}
                viewMode={viewMode}
                highlightIdx={problemIdx}
                metricName={metricNameA}
                metricValue={metricValA}
              />
            </div>
            <div className="flex-1 min-w-0 border-l border-neutral-800 pl-1">
              <AlgoPanel
                projection={projB}
                label={algorithmB}
                viewMode={viewMode}
                highlightIdx={problemIdx}
                metricName={metricNameB}
                metricValue={metricValB}
              />
            </div>
          </>
        )}
      </div>
    </BaseNodeShell>
  );
});
ExperimentCloudNode.displayName = "ExperimentCloudNode";
