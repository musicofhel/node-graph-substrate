import { memo, Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import { type NodeProps } from "@xyflow/react";
import { Canvas, useFrame } from "@react-three/fiber";
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
const TARGET_EXTENT = 6;

function PointCloud({ projection, highlightIdx }: { projection: AlgorithmProjection; highlightIdx: number }) {
  const geomRef = useRef<THREE.BufferGeometry>(null);

  const { positions, colors } = useMemo(() => {
    const count = projection.n_points;
    const pts = projection.points_3d;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const [x, y, z] = pts[i];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
    const scale = TARGET_EXTENT / span;

    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (pts[i][0] - cx) * scale;
      pos[i * 3 + 1] = (pts[i][1] - cy) * scale;
      pos[i * 3 + 2] = (pts[i][2] - cz) * scale;

      const c = i === highlightIdx ? HIGHLIGHT_COLOR : projection.correctness[i] ? CORRECT_COLOR : INCORRECT_COLOR;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return { positions: pos, colors: col };
  }, [projection, highlightIdx]);

  useEffect(() => {
    const geom = geomRef.current;
    if (!geom) return;
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.computeBoundingSphere();
  }, [positions, colors]);

  return (
    <points>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.15} vertexColors sizeAttenuation />
    </points>
  );
}

function HighlightSphere({ position }: { position: [number, number, number] | null }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 4) * 0.18);
  });
  if (!position) return null;
  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.18, 16, 16]} />
      <meshBasicMaterial color="#facc15" transparent opacity={0.45} />
    </mesh>
  );
}

function CloudPanel({ projection, highlightIdx }: { projection: AlgorithmProjection; highlightIdx: number }) {
  const highlightPos = useMemo<[number, number, number] | null>(() => {
    if (highlightIdx < 0 || highlightIdx >= projection.n_points) return null;
    const pts = projection.points_3d;
    const count = projection.n_points;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const [x, y, z] = pts[i];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
    const scale = TARGET_EXTENT / span;
    return [
      (pts[highlightIdx][0] - cx) * scale,
      (pts[highlightIdx][1] - cy) * scale,
      (pts[highlightIdx][2] - cz) * scale,
    ];
  }, [projection, highlightIdx]);

  return (
    <R3FErrorBoundary>
      <Canvas
        key={`${projection.algorithm}-${projection.layer}`}
        frameloop="always"
        camera={{ position: [8, 8, 8], fov: 50 }}
        style={{ width: "100%", height: "100%", display: "block", background: "var(--ngs-canvas-bg)" }}
      >
        <ambientLight intensity={0.6} />
        <PointCloud projection={projection} highlightIdx={highlightIdx} />
        <HighlightSphere position={highlightPos} />
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

const LABEL_H = 16;
const METRIC_H = 16;

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
  const hasMetric = !!(metricName && metricValue);

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-x-0 top-0 text-[8px] text-neutral-500 font-mono truncate" style={{ height: LABEL_H }}>
        {label}
      </div>
      <div
        className="absolute inset-x-0"
        style={{ top: LABEL_H, bottom: hasMetric ? METRIC_H : 0 }}
      >
        {is2d ? (
          <ScatterPanel projection={projection} highlightIdx={highlightIdx} />
        ) : (
          <CloudPanel projection={projection} highlightIdx={highlightIdx} />
        )}
      </div>
      {hasMetric && (
        <div className="absolute inset-x-0 bottom-0 text-[8px] text-neutral-500 font-mono text-center" style={{ height: METRIC_H }}>
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

      <div className="nodrag nowheel relative" style={{ width: 900, height: 450 }}>
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-500">{error}</div>
        ) : (
          <>
            <div className="absolute top-0 bottom-0 left-0" style={{ width: 446 }}>
              <AlgoPanel
                projection={projA}
                label={algorithmA}
                viewMode={viewMode}
                highlightIdx={problemIdx}
                metricName={metricNameA}
                metricValue={metricValA}
              />
            </div>
            <div className="absolute top-0 bottom-0 right-0 border-l border-neutral-800 pl-1" style={{ width: 446 }}>
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
