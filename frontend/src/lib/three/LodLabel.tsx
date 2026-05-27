import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";

export type LodTier = "close" | "mid" | "far";

const TIER_RANK: Record<LodTier, number> = { close: 0, mid: 1, far: 2 };

export function LodLabel({
  position,
  children,
  minTier,
}: {
  position: [number, number, number];
  children: ReactNode;
  minTier: LodTier;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const d = state.camera.position.length();
    const tier: LodTier = d < 8 ? "close" : d < 16 ? "mid" : "far";
    ref.current.style.opacity = TIER_RANK[tier] <= TIER_RANK[minTier] ? "1" : "0";
  });

  return (
    <Html position={position} center>
      <div
        ref={ref}
        className="pointer-events-none select-none whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white/90 backdrop-blur-sm"
        style={{ transition: "opacity 150ms" }}
      >
        {children}
      </div>
    </Html>
  );
}
