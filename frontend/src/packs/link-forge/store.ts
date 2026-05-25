import { create } from "zustand";
import { useCanvasStore } from "../../lib/store/canvas-store";

export interface LinkForgeState {
  starredPapers: Set<string>;
  flushCounter: number;
  toggleStar: (paperId: string) => void;
  flushUnstarred: () => void;
  resetStarred: (papers: Set<string>) => void;
}

export const useLinkForgeStore = create<LinkForgeState>()((set, get) => ({
  starredPapers: new Set<string>(),
  flushCounter: 0,

  toggleStar: (paperId: string) => {
    const starred = new Set(get().starredPapers);
    if (starred.has(paperId)) starred.delete(paperId);
    else starred.add(paperId);
    set({ starredPapers: starred });

    const canvasState = useCanvasStore.getState();
    const stateNode = canvasState.nodes.find((n) => n.type === "r2_state");
    if (stateNode) {
      canvasState.batchUpdateNodeData([
        [stateNode.id, { config: { starred_papers: [...starred] } }],
      ]);
    }
  },

  flushUnstarred: () => {
    set({ flushCounter: get().flushCounter + 1 });
  },

  resetStarred: (papers: Set<string>) => {
    set({ starredPapers: papers, flushCounter: 0 });
  },
}));
