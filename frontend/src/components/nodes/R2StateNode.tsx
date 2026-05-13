import { memo } from "react";

export const R2StateNode = memo(() => {
  return <div style={{ width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />;
});
R2StateNode.displayName = "R2StateNode";
