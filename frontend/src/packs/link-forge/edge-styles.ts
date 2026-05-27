export function computeEdgeStyleForStage(
  _stage: string,
  payload: Record<string, unknown>,
): { stroke: string; strokeWidth: number; opacity: number } {
  if (payload.success === true) {
    return { stroke: "#34d399", strokeWidth: 1.5, opacity: 0.8 };
  }
  if (payload.success === false) {
    return { stroke: "#f87171", strokeWidth: 2, opacity: 0.9 };
  }
  return { stroke: "#525252", strokeWidth: 1, opacity: 0.3 };
}
