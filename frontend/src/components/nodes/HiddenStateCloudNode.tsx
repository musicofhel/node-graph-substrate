// 3D polish patterns (bounding-box auto-fit, active-node pulse) inspired by
// PeakScripter/Neural-Visualizer (GPLv3). Reimplemented from scratch — no GPL code copied.
import { Component, memo, useMemo, useRef, type ReactNode } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/pack-registry";
import * as THREE from "three";

class R3FErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center text-xs text-red-400">
          Render error
        </div>
      );
    }
    return this.props.children;
  }
}

const CLUSTER_COLORS = [
  new THREE.Color("#3b82f6"), // blue
  new THREE.Color("#ef4444"), // red
];
const BRIDGE_COLOR = new THREE.Color("#fbbf24"); // gold

const TARGET_EXTENT = 6;

type CloudData = {
  umap_3d?: number[][];
  clusters?: number[];
  bridge_idx?: number;
  bridge_silhouette?: number;
};

function PointCloud({ data }: { data: CloudData }) {
  const { positions, colors, bridgePos } = useMemo(() => {
    const pts = data.umap_3d ?? [];
    const cls = data.clusters ?? [];
    const bridgeIdx = data.bridge_idx ?? 0;

    if (pts.length === 0) {
      return { positions: new Float32Array(0), colors: new Float32Array(0), bridgePos: null };
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const [x, y, z] of pts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
    const scale = TARGET_EXTENT / span;

    const pos = new Float32Array(pts.length * 3);
    const col = new Float32Array(pts.length * 3);
    let bp: [number, number, number] | null = null;

    for (let i = 0; i < pts.length; i++) {
      const nx = (pts[i][0] - cx) * scale;
      const ny = (pts[i][1] - cy) * scale;
      const nz = (pts[i][2] - cz) * scale;
      pos[i * 3] = nx;
      pos[i * 3 + 1] = ny;
      pos[i * 3 + 2] = nz;

      if (i === bridgeIdx) bp = [nx, ny, nz];

      const c = i === bridgeIdx ? BRIDGE_COLOR : CLUSTER_COLORS[cls[i] ?? 0];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }

    return { positions: pos, colors: col, bridgePos: bp };
  }, [data.umap_3d, data.clusters, data.bridge_idx]);

  if (positions.length === 0) return null;

  return (
    <>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.15} vertexColors sizeAttenuation />
      </points>
      {bridgePos && <BridgePulse position={bridgePos} />}
    </>
  );
}

function BridgePulse({ position }: { position: [number, number, number] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    meshRef.current.scale.setScalar(1 + Math.sin(t * 4) * 0.18);
  });
  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.18, 16, 16]} />
      <meshBasicMaterial color="#fbbf24" transparent opacity={0.45} />
    </mesh>
  );
}

export const HiddenStateCloudNode = memo(({ id, selected }: NodeProps) => {
  const nodeData = useNodesData<Node<CloudData>>(id);
  const data = nodeData?.data ?? {};
  const def = NODE_REGISTRY.hidden_state_cloud;
  const hasData = !!data.umap_3d;

  return (
    <BaseNodeShell selected={selected} label={def.label} category={def.category} inputs={def.inputs}>
      <div className="nodrag nowheel w-full min-w-[260px]" style={{ height: 250 }}>
        {hasData ? (
          <R3FErrorBoundary>
            <Canvas
              frameloop="always"
              camera={{ position: [8, 8, 8], fov: 50 }}
              style={{ background: "#0a0a0a", borderRadius: 4 }}
            >
              <ambientLight intensity={0.6} />
              <PointCloud data={data} />
              <OrbitControls enablePan enableZoom enableRotate />
            </Canvas>
          </R3FErrorBoundary>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-500">
            Waiting for hidden states...
          </div>
        )}
      </div>
      {data.bridge_silhouette !== undefined && (
        <div className="mt-1 text-[10px] text-neutral-400">
          Bridge sil: {data.bridge_silhouette.toFixed(3)}
        </div>
      )}
    </BaseNodeShell>
  );
});
HiddenStateCloudNode.displayName = "HiddenStateCloudNode";
