import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export type CameraTweenRequest = {
  target: [number, number, number];
  duration: number;
  id: number;
};

type TweenState = {
  from: THREE.Vector3;
  to: THREE.Vector3;
  startTime: number;
  duration: number;
};

interface OrbitControlsLike {
  target: THREE.Vector3;
  update: () => void;
}

export function CameraTween({
  controlsRef,
  requestRef,
}: {
  controlsRef: React.RefObject<OrbitControlsLike | null>;
  requestRef: React.RefObject<CameraTweenRequest | null>;
}) {
  const tweenRef = useRef<TweenState | null>(null);
  const lastId = useRef(0);

  useFrame(() => {
    const req = requestRef.current;
    const controls = controlsRef.current;
    if (!controls) return;

    if (req && req.id !== lastId.current) {
      lastId.current = req.id;
      tweenRef.current = {
        from: controls.target.clone(),
        to: new THREE.Vector3(...req.target),
        startTime: performance.now(),
        duration: req.duration,
      };
    }

    const tween = tweenRef.current;
    if (!tween) return;
    const raw = Math.min((performance.now() - tween.startTime) / tween.duration, 1);
    const t = easeInOutCubic(raw);
    controls.target.lerpVectors(tween.from, tween.to, t);
    controls.update();
    if (raw >= 1) tweenRef.current = null;
  });

  return null;
}
