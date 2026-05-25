import { create } from "zustand";
import { API_BASE } from "../../lib/api";

export interface PerCanvasState {
  viewport?: { x: number; y: number; zoom: number };
  splitRatio?: number;
}

interface SessionSnapshot {
  openCanvasIds: string[];
  activeCanvasId: string | null;
  perCanvasState: Record<string, PerCanvasState>;
}

interface SessionStore extends SessionSnapshot {
  projectId: string | null;
  _hydrated: boolean;

  hydrate: (projectId: string) => Promise<void>;
  setActiveCanvas: (canvasId: string) => void;
  openCanvas: (canvasId: string) => void;
  closeCanvas: (canvasId: string) => void;
  updateCanvasState: (
    canvasId: string,
    patch: Partial<PerCanvasState>,
  ) => void;
}

const LS_PREFIX = "ngs.session.";

function lsRead(projectId: string): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + projectId);
    if (raw) return JSON.parse(raw) as SessionSnapshot;
  } catch {}
  return null;
}

function lsMirror(projectId: string, snap: SessionSnapshot) {
  try {
    localStorage.setItem(LS_PREFIX + projectId, JSON.stringify(snap));
  } catch {}
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(projectId: string, snap: SessionSnapshot) {
  lsMirror(projectId, snap);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    fetch(`${API_BASE}/api/projects/${projectId}/session`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        open_canvas_ids: snap.openCanvasIds,
        active_canvas_id: snap.activeCanvasId,
        per_canvas_state: snap.perCanvasState,
      }),
    }).catch(() => {});
  }, 500);
}

function snapshot(s: SessionStore): SessionSnapshot {
  return {
    openCanvasIds: s.openCanvasIds,
    activeCanvasId: s.activeCanvasId,
    perCanvasState: s.perCanvasState,
  };
}

export const useSessionStore = create<SessionStore>()((set, get) => ({
  projectId: null,
  openCanvasIds: [],
  activeCanvasId: null,
  perCanvasState: {},
  _hydrated: false,

  hydrate: async (projectId: string) => {
    try {
      const resp = await fetch(
        `${API_BASE}/api/projects/${projectId}/session`,
      );
      if (resp.ok) {
        const data = await resp.json();
        const hasServer =
          data.active_canvas_id || (data.open_canvas_ids?.length ?? 0) > 0;
        if (hasServer) {
          set({
            projectId,
            openCanvasIds: data.open_canvas_ids ?? [],
            activeCanvasId: data.active_canvas_id ?? null,
            perCanvasState: data.per_canvas_state ?? {},
            _hydrated: true,
          });
          return;
        }
      }
    } catch {}

    const local = lsRead(projectId);
    if (local) {
      set({
        projectId,
        openCanvasIds: local.openCanvasIds,
        activeCanvasId: local.activeCanvasId,
        perCanvasState: local.perCanvasState,
        _hydrated: true,
      });
      return;
    }

    set({
      projectId,
      openCanvasIds: [],
      activeCanvasId: null,
      perCanvasState: {},
      _hydrated: true,
    });
  },

  setActiveCanvas: (canvasId: string) => {
    const s = get();
    const open = s.openCanvasIds.includes(canvasId)
      ? s.openCanvasIds
      : [...s.openCanvasIds, canvasId];
    set({ activeCanvasId: canvasId, openCanvasIds: open });
  },

  openCanvas: (canvasId: string) => {
    const s = get();
    if (s.openCanvasIds.includes(canvasId)) return;
    set({ openCanvasIds: [...s.openCanvasIds, canvasId] });
  },

  closeCanvas: (canvasId: string) => {
    const s = get();
    const filtered = s.openCanvasIds.filter((id) => id !== canvasId);
    const active =
      s.activeCanvasId === canvasId
        ? filtered[filtered.length - 1] ?? null
        : s.activeCanvasId;
    const { [canvasId]: _, ...rest } = s.perCanvasState;
    set({
      openCanvasIds: filtered,
      activeCanvasId: active,
      perCanvasState: rest,
    });
  },

  updateCanvasState: (canvasId: string, patch: Partial<PerCanvasState>) => {
    const s = get();
    set({
      perCanvasState: {
        ...s.perCanvasState,
        [canvasId]: { ...s.perCanvasState[canvasId], ...patch },
      },
    });
  },
}));

useSessionStore.subscribe((state, prev) => {
  if (!state._hydrated || !state.projectId) return;
  if (
    state.openCanvasIds === prev.openCanvasIds &&
    state.activeCanvasId === prev.activeCanvasId &&
    state.perCanvasState === prev.perCanvasState
  )
    return;
  schedulePersist(state.projectId, snapshot(state));
});
