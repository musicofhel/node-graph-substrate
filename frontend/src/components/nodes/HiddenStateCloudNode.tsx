import { Component, memo, useMemo, type ReactNode } from "react";
import { useNodesData, type Node, type NodeProps } from "@xyflow/react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { BaseNodeShell } from "./BaseNodeShell";
import { NODE_REGISTRY } from "../../lib/nodes/registry";
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

type CloudData = {
  umap_3d?: number[][];
  clusters?: number[];
  bridge_idx?: number;
  bridge_silhouette?: number;
};

function PointCloud({ data }: { data: CloudData }) {
  const { positions, colors } = useMemo(() => {
    const pts = data.umap_3d ?? [];
    const cls = data.clusters ?? [];
    const bridgeIdx = data.bridge_idx ?? 0;

    const pos = new Float32Array(pts.length * 3);
    const col = new Float32Array(pts.length * 3);

    for (let i = 0; i < pts.length; i++) {
      pos[i * 3] = pts[i][0];
      pos[i * 3 + 1] = pts[i][1];
      pos[i * 3 + 2] = pts[i][2];

      const c = i === bridgeIdx ? BRIDGE_COLOR : CLUSTER_COLORS[cls[i] ?? 0];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }

    return { positions: pos, colors: col };
  }, [data.umap_3d, data.clusters, data.bridge_idx]);

  if (positions.length === 0) return null;

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial size={0.15} vertexColors sizeAttenuation />
    </points>
  );
}

export const HiddenStateCloudNode = memo(({ id }: NodeProps) => {
  const nodeData = useNodesData<Node<CloudData>>(id);
  const data = nodeData?.data ?? {};
  const def = NODE_REGISTRY.hidden_state_cloud;
  const hasData = !!data.umap_3d;

  return (
    <BaseNodeShell label={def.label} category={def.category} inputs={def.inputs}>
      <div className="nodrag nowheel" style={{ width: 300, height: 250 }}>
        {hasData ? (
          <R3FErrorBoundary>
            <Canvas
              frameloop="demand"
              camera={{ position: [5, 5, 5], fov: 50 }}
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
