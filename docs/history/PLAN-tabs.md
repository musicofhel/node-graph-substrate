# Plan: Chrome-Style Graph Tabs

**Status:** COMPLETE (2026-05-13). Implemented as Phase 1 of `SPEC-tabs-and-linkforge.md`.

## Goal

Add a tab bar above the React Flow canvas so the user can switch between multiple graph flows (e.g., topo-confidence scoring, link-forge pipeline, etc.) within the same project. Each tab = one graph.

## Why It's Simple

The backend already supports multiple graphs per project. The canvas store already switches on `graphId`. The WS already reconnects to a new `graphId`. This is almost entirely a frontend UI addition.

---

## Backend (1 new endpoint)

### B1. `GET /api/projects/{project_id}/graphs` — list all graphs for a project

**File:** `server/substrate/main.py`

Add route:
```python
@app.get("/api/projects/{project_id}/graphs")
async def list_graphs(project_id: str):
    graphs = await crud.list_graphs(project_id)
    return [_serialize_row(g) for g in graphs]
```

**File:** `server/substrate/crud.py`

Add function:
```python
async def list_graphs(project_id: str) -> list[dict[str, Any]]:
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT * FROM graphs WHERE project_id = $1 ORDER BY created_at",
        project_id,
    )
    return [dict(r) for r in rows]
```

That's it for backend. Everything else exists.

---

## Frontend (3 changes)

### F1. `TabBar` component

**New file:** `frontend/src/components/canvas/TabBar.tsx`

Chrome-style horizontal tab bar. Renders above the ReactFlow canvas.

Props/behavior:
- Fetches graph list from `GET /api/projects/{projectId}/graphs`
- Renders one tab per graph, labeled with `graph.name`
- Active tab highlighted (bottom border or background color matching the dark theme)
- Click tab → calls `onSelectGraph(graphId)`
- "+" button at the end → opens a small inline input (or prompt) for new graph name → `POST /api/graphs` → adds tab, switches to it
- Close button (×) on non-active tabs (optional, can defer)
- Styling: dark background (#1a1a2e or similar), ~36px height, horizontal scroll if many tabs

### F2. Wire TabBar into the layout

**File:** `frontend/src/App.tsx`

Current flow:
1. `App.tsx` resolves `graphId` on mount (URL param → localStorage → create default)
2. Creates `SubstrateWS(graphId)`
3. Renders `<SubstrateCanvas />`

Changes:
1. Store `projectId` alongside `graphId` (already available from the init flow)
2. Render `<TabBar>` above `<SubstrateCanvas>`
3. On tab switch:
   - Disconnect current WS
   - Update `graphId` in canvas store
   - Update localStorage `substrate:lastGraphId`
   - Create new `SubstrateWS(newGraphId)` → triggers `graph_loaded` → canvas hydrates
4. On "+" new graph:
   - `POST /api/graphs { project_id, name }` 
   - Switch to the new graph (same as tab switch)
   - New graph starts empty (or with default nodes — TBD)

### F3. Canvas store — expose `projectId`

**File:** `frontend/src/lib/store/canvas-store.ts`

Add `projectId: string | null` to the store state, set it during init alongside `graphId`. The TabBar reads it to fetch the graph list.

---

## Layout

```
┌──────────────────────────────────────────────────────┐
│ [Topo Scoring] [Link-Forge Pipeline] [+]             │  ← TabBar
├──────────┬───────────────────────────────────────────┤
│ NODE     │                                           │
│ PALETTE  │         React Flow Canvas                 │
│          │                                           │
│ (sidebar)│                                           │
│          │                              [Save] [Load]│
├──────────┴───────────────────────────────────────────┤
│ [Controls]                              [MiniMap]    │
└──────────────────────────────────────────────────────┘
```

---

## Execution Order

1. **B1** — Add `list_graphs` to crud.py + route to main.py (~10 min)
2. **F3** — Add `projectId` to canvas store (~5 min)
3. **F1** — Build `TabBar.tsx` component (~45 min)
4. **F2** — Wire into App.tsx, handle tab switch + WS reconnect (~30 min)
5. **Test** — Create second graph via "+", switch between tabs, verify data loads correctly

## Total: ~2 hours

## Out of Scope (for now)
- Tab reordering (drag)
- Tab close/delete graph
- Tab rename (inline edit)
- Per-tab node palette (all tabs share same component registry)
- Tab-specific default node layouts
