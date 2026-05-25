import { Component, memo, useMemo, type ReactNode } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";
import type { H1Problem } from "../../../packs/topo-confidence/hooks/useH1LoopData";
import { turboColor, cycleColor, cycleOpacity } from "./turbo-colormap";

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
          3D render error
        </div>
      );
    }
    return this.props.children;
  }
}

const BRIDGE_COLOR = new THREE.Color("#ffd700");
const POINT_COLOR = new THREE.Color("#a0a0c0");

type Props = {
  problem: H1Problem;
  points: number[][];
  highlightedCycle: number | null;
  onCycleHover: (rank: number | null) => void;
  highlightedPointIdx?: number | null;
  replayProgress?: number | null;
  filtrationEpsilon?: number | null;
};

function PointCloud3D({
  problem,
  points,
  replayProgress,
}: {
  problem: H1Problem;
  points: number[][];
  replayProgress?: number | null;
}) {
  const { positions, colors } = useMemo(() => {
    const count = replayProgress != null ? replayProgress + 1 : points.length;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      pos[i * 3] = points[i][0];
      pos[i * 3 + 1] = points[i][1];
      pos[i * 3 + 2] = points[i][2];

      if (i === problem.bridge_subsampled_index) {
        col[i * 3] = BRIDGE_COLOR.r;
        col[i * 3 + 1] = BRIDGE_COLOR.g;
        col[i * 3 + 2] = BRIDGE_COLOR.b;
      } else {
        const c = new THREE.Color(POINT_COLOR);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
    }

    return { positions: pos, colors: col };
  }, [points, problem.bridge_subsampled_index, replayProgress]);

  if (positions.length === 0) return null;

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.12} vertexColors sizeAttenuation />
    </points>
  );
}

function BridgeSphere({
  problem,
  points,
  replayProgress,
}: {
  problem: H1Problem;
  points: number[][];
  replayProgress?: number | null;
}) {
  const bridgeIdx = problem.bridge_subsampled_index;
  if (replayProgress != null && bridgeIdx > replayProgress) return null;
  if (bridgeIdx < 0 || bridgeIdx >= points.length) return null;

  const pos = points[bridgeIdx];
  return (
    <mesh position={[pos[0], pos[1], pos[2]]}>
      <sphereGeometry args={[0.08, 12, 12]} />
      <meshBasicMaterial color="#ffd700" />
    </mesh>
  );
}

function HighlightSphere({
  points,
  highlightedPointIdx,
}: {
  points: number[][];
  highlightedPointIdx: number;
}) {
  if (highlightedPointIdx < 0 || highlightedPointIdx >= points.length)
    return null;
  const pos = points[highlightedPointIdx];
  return (
    <mesh position={[pos[0], pos[1], pos[2]]}>
      <sphereGeometry args={[0.1, 12, 12]} />
      <meshBasicMaterial color="#22d3ee" transparent opacity={0.8} />
    </mesh>
  );
}

function CycleLines3D({
  problem,
  points,
  highlightedCycle,
  filtrationEpsilon,
}: {
  problem: H1Problem;
  points: number[][];
  highlightedCycle: number | null;
  filtrationEpsilon?: number | null;
}) {
  const maxRank = useMemo(
    () => Math.max(0, ...problem.h1_cycles.map((c) => c.rank)),
    [problem.h1_cycles],
  );

  const sortedCycles = useMemo(
    () => [...problem.h1_cycles].sort((a, b) => b.rank - a.rank),
    [problem.h1_cycles],
  );

  return (
    <>
      {sortedCycles.map((cycle) => {
        if (filtrationEpsilon != null && filtrationEpsilon < cycle.birth)
          return null;

        const isHighlighted = highlightedCycle === cycle.rank;
        const isDimmed = highlightedCycle != null && !isHighlighted;
        const isDead =
          filtrationEpsilon != null && filtrationEpsilon >= cycle.death;

        const loopIndices = [
          ...cycle.representative_subsampled_indices,
          cycle.representative_subsampled_indices[0],
        ];
        const linePoints = loopIndices.map(
          (i) => [points[i][0], points[i][1], points[i][2]] as [number, number, number],
        );

        return (
          <Line
            key={cycle.rank}
            points={linePoints}
            color={isDead ? "#555" : cycleColor(cycle.rank, maxRank)}
            lineWidth={isHighlighted ? 3 : cycle.rank === 0 ? 2 : 1.5}
            transparent
            opacity={isDimmed ? 0.15 : isDead ? 0.3 : cycleOpacity(cycle.rank)}
            dashed={cycle.extraction_method === "cocycle_support_walk"}
            dashSize={0.15}
            gapSize={0.08}
          />
        );
      })}
    </>
  );
}

function RipsEdges3D({
  problem,
  points,
  filtrationEpsilon,
}: {
  problem: H1Problem;
  points: number[][];
  filtrationEpsilon: number;
}) {
  const edgePositions = useMemo(() => {
    if (!problem.distance_matrix_upper || problem.distance_matrix_upper.length === 0)
      return null;

    const positions: number[] = [];
    const n = problem.n_subsampled;
    let k = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (problem.distance_matrix_upper[k] <= filtrationEpsilon) {
          positions.push(points[i][0], points[i][1], points[i][2]);
          positions.push(points[j][0], points[j][1], points[j][2]);
        }
        k++;
      }
    }
    return positions.length > 0 ? new Float32Array(positions) : null;
  }, [filtrationEpsilon, problem.distance_matrix_upper, problem.n_subsampled, points]);

  if (!edgePositions) return null;

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[edgePositions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#4a4a6a" transparent opacity={0.25} />
    </lineSegments>
  );
}

function Scene({
  problem,
  points,
  highlightedCycle,
  onCycleHover,
  highlightedPointIdx,
  replayProgress,
  filtrationEpsilon,
}: Props) {
  return (
    <>
      <ambientLight intensity={0.6} />
      {filtrationEpsilon != null && (
        <RipsEdges3D
          problem={problem}
          points={points}
          filtrationEpsilon={filtrationEpsilon}
        />
      )}
      <CycleLines3D
        problem={problem}
        points={points}
        highlightedCycle={highlightedCycle}
        filtrationEpsilon={filtrationEpsilon}
      />
      <PointCloud3D
        problem={problem}
        points={points}
        replayProgress={replayProgress}
      />
      <BridgeSphere
        problem={problem}
        points={points}
        replayProgress={replayProgress}
      />
      {highlightedPointIdx != null && (
        <HighlightSphere
          points={points}
          highlightedPointIdx={highlightedPointIdx}
        />
      )}
      <OrbitControls enablePan enableZoom enableRotate />
    </>
  );
}

export const H1Cloud3D = memo(
  ({
    problem,
    points,
    highlightedCycle,
    onCycleHover,
    highlightedPointIdx,
    replayProgress,
    filtrationEpsilon,
  }: Props) => {
    return (
      <R3FErrorBoundary>
        <Canvas
          frameloop="demand"
          camera={{ position: [3, 3, 3], fov: 50 }}
          style={{ background: "#0f0f23", borderRadius: 4 }}
        >
          <Scene
            problem={problem}
            points={points}
            highlightedCycle={highlightedCycle}
            onCycleHover={onCycleHover}
            highlightedPointIdx={highlightedPointIdx}
            replayProgress={replayProgress}
            filtrationEpsilon={filtrationEpsilon}
          />
        </Canvas>
      </R3FErrorBoundary>
    );
  },
);
H1Cloud3D.displayName = "H1Cloud3D";
