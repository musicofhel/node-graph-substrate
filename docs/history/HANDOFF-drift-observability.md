# Handoff: Drift Observability — 7 Tracer-Bullet Slices

**Date**: 2026-05-15
**Status**: Plan approved, not started
**Plan file**: `~/.claude/plans/node-graph-substrate-observability-enha-synchronous-dolphin.md`
**Prerequisite**: `docker compose up` running (postgres on 5434, redis on 6381, fastapi on 8080) + `cd frontend && npm run dev` (vite on 5173)

---

## Ground Rules

- Each slice is end-to-end: store → WS integration → component → visible in browser.
- Validate after each slice before starting the next. Every validation uses `synthetic_daemon.py`.
- No new npm dependencies in slices 1-4. Slice 5 may need `d3-array` — confirm first.
- All drift state lives in a NEW `drift-store.ts`, never in `canvas-store.ts` (avoids polluting zundo undo stack).
- Two new directories need `mkdir`: `frontend/src/lib/drift/` (slice 2) and `frontend/src/components/edges/` (slice 4).

---

## Slice 1: History Buffer + Confidence Sparkline

### What to build

**1. CREATE `frontend/src/lib/store/drift-store.ts`**

Zustand store. NOT wrapped in zundo. Shape:

```typescript
import { create } from "zustand";

interface HistoryRecord {
  ts: number;
  values: Record<string, number>;
}

interface DriftState {
  histories: Map<string, HistoryRecord[]>;
  lastEventTs: Map<string, number>;
  pushSample: (nodeId: string, ts: number, values: Record<string, number>) => void;
  getHistory: (nodeId: string) => HistoryRecord[];
}
```

`pushSample` appends to the array for that nodeId, then slices to keep last 100 entries. Also updates `lastEventTs.set(nodeId, ts)`.

`getHistory` returns `histories.get(nodeId) ?? []`.

**2. CREATE `frontend/src/components/nodes/Sparkline.tsx`**

```typescript
import { memo } from "react";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}
```

Pure SVG. `viewBox="0 0 {width} {height}"`. Map each value to an x,y point. Scale y so min→height, max→0. Render as `<polyline points={...} fill="none" stroke={color} strokeWidth="1.5" />`. Default width=100, height=24, color="#10b981".

If `values.length < 2`, render nothing.

**3. MODIFY `frontend/src/lib/ws/client.ts`**

**CRITICAL — early return trap**: Lines 76-83 check for `linkforge:` and `topoconf:research:` stream prefixes and do `return;` — any code placed AFTER line 74 but BEFORE line 76 will work for all streams, but code placed AFTER line 83 will MISS linkforge/research events entirely. The drift store push must go BETWEEN line 74 (EventLogStore push closing brace) and line 76 (the bypass `if` check).

Add `extractNumericValues` helper: walk `msg.payload` (for `stream_event`) or `msg.data_patch` (for `node_state_updated`) for top-level numbers, and if `payload.features` exists (FeatureBars case), flatten `features.H0_persistence_entropy` → `H0_persistence_entropy` etc. This flattening is required because `batchUpdateNodeData` shallow-merges `{...node.data, ...payload}`, so features end up nested at `node.data.features.H0_...`.

**CRITICAL — timestamp units**: `msg.ts` is Python `time.time()` (seconds since epoch as float), NOT milliseconds like `Date.now()`. Use `Date.now()` for the drift store timestamp (consistent with EventLogStore), NOT `msg.ts` directly. If you need the server timestamp for staleness, multiply: `msg.ts * 1000`.

Only call `pushSample` when `msg.type === "stream_event"` or `msg.type === "node_state_updated"`, and when `msg.node_id` is truthy.

The integration zone (lines 68-83 of client.ts) should look like:
```typescript
// lines 68-74: existing EventLogStore push
useEventLogStore.getState().push({ ... });

// >>> NEW: drift store push — MUST be before the bypass check below
const nodeId = msg.node_id as string;
if (nodeId && (msg.type === "stream_event" || msg.type === "node_state_updated")) {
  const payload = msg.type === "stream_event"
    ? (msg.payload as Record<string, unknown>)
    : (msg.data_patch as Record<string, unknown>);
  if (payload) {
    useDriftStore.getState().pushSample(nodeId, Date.now(), extractNumericValues(payload));
  }
}

// lines 76-83: existing bypass for linkforge/research streams (EARLY RETURN)
if (msg.type === "stream_event" && typeof msg.stream === "string" &&
    (msg.stream.startsWith("linkforge:") || msg.stream.startsWith("topoconf:research:"))) {
  this.handlers.forEach((h) => h(msg));
  return;  // <-- anything after this line misses these streams
}
```

Import: `import { useDriftStore } from "../store/drift-store";`

**4. MODIFY `frontend/src/components/nodes/ConfidenceGaugeNode.tsx`**

After the closing `</svg>` (line 72), before the mode `<span>`, add:

```tsx
const history = useDriftStore((s) => s.getHistory(id));
const confidenceValues = history.map((h) => h.values.confidence).filter((v) => v !== undefined);
```

Render: `<Sparkline values={confidenceValues} width={120} height={24} color="#10b981" />`

Import `useDriftStore` from drift-store and `Sparkline` from Sparkline.

### Validate

```bash
# Terminal 1: services running (docker compose up + npm run dev)
# Terminal 2:
cd ~/node-graph-substrate && python synthetic_daemon.py
```

1. Open `http://localhost:5173` in browser
2. The pipeline canvas should have the default 7 topo-confidence nodes
3. Find the **Confidence Gauge** node — it should show the arc gauge
4. Watch for 20-30 seconds — a sparkline should appear below the gauge, growing with each tick
5. Kill `synthetic_daemon.py` (Ctrl-C) — sparkline freezes
6. Restart daemon — sparkline resumes growing (new points append to existing history)
7. Press Ctrl-Z several times — undo should affect node positions, NOT the sparkline

**Pass criteria**: Sparkline visible, growing, and independent of undo.

---

## Slice 2: PSI Math + Health Band

### What to build

**1. CREATE `frontend/src/lib/drift/psi.ts`**

```bash
mkdir -p ~/node-graph-substrate/frontend/src/lib/drift
```

Two pure functions:

`computePSI(baseline: number[], current: number[], bins = 10): number`
- Find global min/max across both arrays
- Histogram both into `bins` equal-width buckets
- Normalize each histogram to sum to 1.0
- Clamp each bin frequency to max(freq, 0.0001) to avoid log(0)
- Return `sum((current_i - baseline_i) * ln(current_i / baseline_i))`

`driftSeverity(psi: number): "ok" | "warning" | "alert"`
- `<0.1` → "ok", `<0.25` → "warning", `>=0.25` → "alert"

**2. MODIFY `frontend/src/lib/store/drift-store.ts`**

Add a React hook (NOT a store method — it computes on read):

```typescript
export function useNodeDrift(nodeId: string) {
  const history = useDriftStore((s) => s.histories.get(nodeId));
  return useMemo(() => {
    if (!history || history.length < 20) return null;
    const mid = Math.floor(history.length / 2);
    const baselineRecords = history.slice(0, mid);
    const currentRecords = history.slice(mid);
    // For each numeric field present in values, compute PSI
    // Return { fields: Record<string, {psi, severity}>, worst: severity }
  }, [history?.length]);
}
```

The `useMemo` dep is `history?.length` — only recompute when new samples arrive, not on every render.

**3. MODIFY `frontend/src/components/nodes/BaseNodeShell.tsx`**

Add optional prop to the `Props` interface:

```typescript
healthStatus?: "ok" | "warning" | "alert";
```

Render a 3px bar as the FIRST child inside the outer `<div>`:

```tsx
{healthStatus && (
  <div className={`h-[3px] rounded-t-lg transition-colors duration-500 ${
    healthStatus === "ok" ? "bg-emerald-500/60" :
    healthStatus === "warning" ? "bg-amber-500/80" :
    "bg-red-500 animate-pulse"
  }`} />
)}
```

Existing nodes that don't pass `healthStatus` render exactly as before (backwards compatible).

**4. MODIFY three node components**

In each of `ConfidenceGaugeNode.tsx`, `FeatureBarsNode.tsx`, `BridgeMonitorNode.tsx`:

```typescript
import { useNodeDrift } from "../../lib/store/drift-store";
// inside the component:
const drift = useNodeDrift(id);
// pass to BaseNodeShell:
<BaseNodeShell ... healthStatus={drift?.worst}>
```

**5. MODIFY `synthetic_daemon.py`**

Add `argparse` with `--drift-at N` flag. After tick N, shift feature generation:

```python
if args.drift_at and tick > args.drift_at:
    features = {name: round(random.uniform(1, 8), 4) for name in FEATURE_NAMES}  # shifted from [-2,5] to [1,8]
    conf = random.uniform(0.6, 0.99)  # shifted from [0.2,0.95]
```

### Validate

```bash
cd ~/node-graph-substrate && python synthetic_daemon.py --drift-at 25
```

1. Open browser — all nodes should show **green** health bands (or no band if history <20 samples)
2. Wait ~40 seconds (20 ticks) — green bands appear as history fills
3. After tick 25 (~50s) — features shift. Over the next 20-30 seconds:
   - Health bands should transition from green → amber → red
   - The transition should be smooth (CSS transition-colors)
4. The ConfidenceGaugeNode sparkline should show a visible jump in values around tick 25
5. Kill daemon — health bands stay at last computed severity (no flash to default)

**Pass criteria**: Green bands visible before drift, amber/red after drift, smooth transitions.

---

## Slice 3: Per-Feature Sparklines

### What to build

**1. MODIFY `frontend/src/components/nodes/Sparkline.tsx`**

Add optional `gradient` prop (default false). When true, add a `<defs><linearGradient>` and a `<polygon>` fill below the polyline at 15% opacity. The polygon uses the same points as the polyline but closes to the bottom of the viewBox.

**2. MODIFY `frontend/src/components/nodes/FeatureBarsNode.tsx`**

For each feature in the `FEATURE_NAMES.map(...)` render loop, pull history and render a tiny sparkline.

The tricky part: the drift store keys values by field name. In `client.ts`'s `extractNumericValues`, features are flattened from `payload.features.H0_persistence_entropy` to just `H0_persistence_entropy`. So the store history for the feature_bars node has `values.H0_persistence_entropy` etc.

Inside the map callback for each feature:

```tsx
const featureHistory = history?.map((h) => h.values[name]).filter((v) => v !== undefined) ?? [];
// Render between the bar div and the value span:
{featureHistory.length > 1 && (
  <Sparkline values={featureHistory} width={40} height={12} color={color} />
)}
```

The sparkline sits between the progress bar and the numeric value, making each row slightly wider. Adjust the container width from `w-[280px]` to `w-[320px]` if needed.

### Validate

```bash
cd ~/node-graph-substrate && python synthetic_daemon.py
```

1. Open browser, find the **Feature Bars** node
2. Each of the 13 feature rows should show a tiny sparkline between the bar and the number
3. Sparklines should grow with each 2s tick
4. With `--drift-at 25`: sparklines should show a visible trend change around tick 25 for all features

```bash
# Test with drift:
cd ~/node-graph-substrate && python synthetic_daemon.py --drift-at 25
```

5. After 50s, the feature sparklines should show the mean shift — lines visibly jump upward

**Pass criteria**: 13 inline sparklines visible and updating, trend change visible with `--drift-at`.

---

## Slice 4: Stale Edges

### What to build

```bash
mkdir -p ~/node-graph-substrate/frontend/src/components/edges
```

**1. CREATE `frontend/src/components/edges/StaleEdge.tsx`**

Custom React Flow edge component. The function signature follows React Flow v12's edge component pattern:

```typescript
import { type EdgeProps, getSmoothStepPath } from "@xyflow/react";
import { useDriftStore } from "../../lib/store/drift-store";
```

Use `getSmoothStepPath` (matching the current `defaultEdgeOptions` which uses SmoothStep). Read `lastEventTs` for the **target** node from drift store. Compute opacity decay.

**Note on timestamps**: `lastEventTs` in the drift store uses `Date.now()` (milliseconds) per the Slice 1 correction, so the staleness math `Date.now() - lastTs` produces milliseconds directly. No unit conversion needed here because Slice 1 already normalizes at the source.

Important: use `useState` + `useEffect` with `setInterval(1000)` to force periodic re-renders for smooth decay animation. The interval must clean up on unmount.

The edge should render:
- An `<path>` with computed opacity and optional dasharray
- The same stroke color, width, and markerEnd as the current `defaultEdgeOptions` (stroke: "#525252", strokeWidth: 2, ArrowClosed marker)

**2. CREATE `frontend/src/components/edges/edge-types.ts`**

```typescript
import { type EdgeTypes } from "@xyflow/react";
import { StaleEdge } from "./StaleEdge";

export const edgeTypes: EdgeTypes = {
  stale: StaleEdge,
};
```

Module-scope constant — same pattern as `node-types.ts`.

**3. MODIFY `frontend/src/components/canvas/SubstrateCanvas.tsx`**

Import `edgeTypes` from `./edge-types` (NOT from `../edges/edge-types` — check the relative path).

Wait — the file is at `frontend/src/components/canvas/SubstrateCanvas.tsx` and edge-types is at `frontend/src/components/edges/edge-types.ts`. So the import is `import { edgeTypes } from "../edges/edge-types";`.

Pass `edgeTypes={edgeTypes}` as a prop to `<ReactFlow>` alongside the existing `defaultEdgeOptions`.

**4. INJECT `type: "stale"` in THREE places** (audit found all three are needed)

**CRITICAL — edge type does NOT persist to Postgres.** The `EdgeData` Pydantic schema in `server/substrate/schemas.py` has `{id, source, target, source_handle, target_handle, data}` — no `type` field. Edges saved via `_upsert_edge` lose their React Flow `type` property. Two options:
- **(a) Client-side injection (recommended for this slice)**: Inject `type: "stale"` after loading in canvas-store.ts AND in App.tsx edge creation AND in onConnect. Edges round-trip as default but get re-typed on load.
- **(b) Schema migration**: Add `type` column to `edges` table + update EdgeData Pydantic model. Heavier, but edges truly persist. Consider for a future slice.

**4a. MODIFY `frontend/src/lib/store/canvas-store.ts` — `loadGraph`**

Lines 177-191 map server edges WITHOUT a type field:
```typescript
const edges: Edge[] = data.edges.map((e) => ({
  id: e.id, source: e.source, target: e.target,
  sourceHandle: e.source_handle, targetHandle: e.target_handle,
  // NO type field — this is the actual injection point
}));
```
Add `type: "stale"` to each edge in this map. This is the primary injection point — App.tsx alone is NOT enough because loadGraph is what runs on page reload.

**4b. MODIFY `frontend/src/lib/store/canvas-store.ts` — `onConnect`**

The store's `onConnect` calls `addEdge(connection, get().edges)` which does NOT set edge type. New manually-created edges via drag-connect won't be stale edges unless `onConnect` is modified:
```typescript
onConnect: (connection) => {
  set({ edges: addEdge({ ...connection, type: "stale" }, get().edges) });
},
```

**4c. MODIFY `frontend/src/App.tsx`**

In the default edge creation (lines ~398-409 for pipeline canvas seeds), set `type: "stale"` on each edge object. Also in linkforge edge creation if those should also be stale (lines ~110, 125 currently use `type: "smoothstep"` — decide whether to convert these or keep them separate).

### Validate

```bash
cd ~/node-graph-substrate && python synthetic_daemon.py
```

1. Open browser — pipeline edges should render as before (solid, gray, with arrow markers)
2. Edges should be fully opaque while daemon is running
3. Kill `synthetic_daemon.py`
4. Watch edges over the next 2 minutes:
   - Opacity should gradually decrease (linear decay)
   - After ~2 minutes, edges should be at 15% opacity with dashed stroke
5. Restart daemon — edges should snap back to full opacity immediately on next event
6. Ctrl-Z should NOT affect edge opacity (staleness is runtime state in drift-store)

**Pass criteria**: Edges fade when data stops, snap back when data resumes, undo doesn't interfere.

---

## Slice 5: DriftMatrixNode

### What to build

**1. CREATE `server/substrate/components/drift_matrix.py`**

Follow the exact pattern of existing SUBSCRIBER components (e.g., `bridge_monitor.py`):

```python
from substrate.registry import registry
from substrate.sdk import Component, NodeKind, Socket

@registry.register
class DriftMatrixComponent(Component):
    type_id = "drift_matrix"
    kind = NodeKind.SUBSCRIBER
    label = "Drift Matrix"
    category = "scoring"
    inputs = [Socket(id="in_features", type="features", position="left")]
    outputs = []
    subscribed_streams = []  # reads from client-side drift store, not Redis
    config_fields = []
```

**2. MODIFY `server/substrate/components/__init__.py`**

Add: `import substrate.components.drift_matrix  # noqa: F401`

**3. MODIFY `frontend/src/lib/nodes/registry.ts`**

Add `drift_matrix` entry to `NODE_REGISTRY` with `typeId: "drift_matrix"`, `label: "Drift Matrix"`, `category: "scoring"`, appropriate handles.

Add `"drift_matrix"` to the `pipeline` set in `CANVAS_NODE_TYPES`.

**4. CREATE `frontend/src/components/nodes/DriftMatrixNode.tsx`**

This is the most complex component. It reads ALL node histories from drift store and computes PSI for each numeric field.

Structure:
- Header: "DRIFT MATRIX" with mode indicator
- Grid: SVG heatmap. Rows = feature names (use `FEATURE_NAMES` array from FeatureBarsNode — consider extracting to a shared constant). Columns = nodes that have history data.
- Each cell: colored rectangle (green/amber/red based on PSI severity)
- Hover: tooltip with exact PSI value
- Footer: worst-drift summary line

Use `useDriftStore(s => s.histories)` to get all histories. Filter to nodes that have >=20 samples. For each node × each field, call `computePSI` with the rolling half-split.

Size the SVG to fit: each cell ~20x16px. With 13 rows and 3-7 columns, the node is ~280-400px wide and ~250px tall.

Wrap in `BaseNodeShell` with category="scoring".

**5. MODIFY `frontend/src/components/canvas/node-types.ts`**

Add import and registration: `drift_matrix: DriftMatrixNode`.

### Validate

```bash
cd ~/node-graph-substrate && python synthetic_daemon.py
```

1. Open browser — the Node Palette sidebar should show "Drift Matrix" under the scoring category
2. Drag it onto the pipeline canvas
3. Wait 40s+ for nodes to accumulate >=20 samples
4. The heatmap should populate with mostly green cells (i.i.d. data → PSI ≈ 0)
5. Hover over cells — tooltips show PSI values near 0

```bash
# Test with drift:
cd ~/node-graph-substrate && python synthetic_daemon.py --drift-at 25
```

6. After 50s, cells should turn amber/red as features shift
7. Save graph (click Save) — reload page — DriftMatrixNode should persist and reappear
8. The matrix should repopulate as new history accumulates after reload

**Pass criteria**: Heatmap visible, colors respond to drift, persists across save/load.

---

## Slice 6: Baseline Snapshot + Comparison

### What to build

**1. MODIFY `frontend/src/lib/store/drift-store.ts`**

Add to the store interface and implementation:

```typescript
baselines: Map<string, { name: string; ts: number; samples: HistoryRecord[] }>;
baselineMode: "rolling" | "snapshot";
saveAllBaselines: (name: string) => void;
clearAllBaselines: () => void;
setBaselineMode: (mode: "rolling" | "snapshot") => void;
```

`saveAllBaselines` iterates `histories`, snapshots each node's current array into `baselines`.

Persist baselines to localStorage: `localStorage.setItem("substrate:drift:baselines", JSON.stringify(...))`. Hydrate in store creation. Note: Map doesn't JSON.stringify natively — convert to/from `Array.from(map.entries())`.

Modify `useNodeDrift`: when `baselineMode === "snapshot"` and a baseline exists for the node, compute PSI between the baseline samples and the FULL current buffer (not half-split). When no baseline exists or mode is "rolling", use the existing half-split logic.

**2. MODIFY `frontend/src/components/canvas/CanvasControls.tsx`**

Add three controls after the existing buttons:

- "Snapshot" button — calls `useDriftStore.getState().saveAllBaselines("manual-" + Date.now())`
- "Clear" button — only visible when baselines.size > 0 — calls `clearAllBaselines()`
- Mode toggle — two small pills "Rolling" / "Baseline", active one highlighted

Import `useDriftStore` from the drift store.

**3. MODIFY `frontend/src/components/nodes/BaseNodeShell.tsx`**

When baseline mode is "snapshot" and a baseline exists for this node (check via `useDriftStore`), render a small "B" text badge in the header next to the label. Use `text-[8px] bg-blue-600 rounded px-0.5`.

**4. MODIFY `frontend/src/components/nodes/DriftMatrixNode.tsx`**

Show current comparison mode in the header: "vs rolling" or "vs baseline: {name}". The matrix cells should automatically reflect the mode change because they call `useNodeDrift` which already switches based on `baselineMode`.

### Validate

```bash
cd ~/node-graph-substrate && python synthetic_daemon.py --drift-at 25
```

1. Open browser — "Rolling" should be the active mode in CanvasControls
2. Let it run 20 ticks (~40s) — health bands green, matrix green
3. Click "Snapshot" — baselines saved
4. Toggle to "Baseline" mode:
   - "B" badges should appear in node headers
   - DriftMatrixNode header should show "vs baseline: manual-..."
   - Everything still green (current ≈ baseline)
5. After tick 25 (~50s): features shift
   - In "Baseline" mode: health bands and matrix turn amber/red (comparing against frozen pre-drift baseline)
6. Toggle to "Rolling" mode:
   - PSI values should be lower (rolling window adapts to new distribution)
7. Toggle back to "Baseline" — PSI high again
8. Reload page — baselines should persist (localStorage)
9. Click "Clear" — baselines removed, "B" badges disappear, mode forced to "Rolling"

**Pass criteria**: Snapshot/clear works, mode toggle changes PSI behavior, localStorage persistence survives reload.

---

## Slice 7: Drift Scenarios + Polish

### What to build

**1. MODIFY `synthetic_daemon.py`**

Add `--scenario` argument (choices: `sudden`, `gradual`, `periodic`, `partial`, default: `sudden`).

- `sudden`: step function shift at `--drift-at` tick (existing behavior)
- `gradual`: linear interpolation from original range to shifted range over 30 ticks starting at `--drift-at`
- `periodic`: `sin(2π * (tick - drift_at) / 40)` modulates feature mean, oscillating between original and shifted
- `partial`: only first 3 features (`H0_persistence_entropy`, `H1_max_lifetime`, `H0_total_persistence`) shift; rest stay i.i.d.

**2. MODIFY `frontend/src/components/nodes/Sparkline.tsx`**

Add gradient fill: below the polyline, render a `<polygon>` that extends down to the viewBox bottom, filled with the same color at 15% opacity via a `<linearGradient>` in `<defs>`. Always on (no prop needed).

**3. MODIFY `frontend/src/components/nodes/BaseNodeShell.tsx`**

Add subtle `box-shadow` when healthStatus is "alert": `shadow-[0_0_8px_rgba(239,68,68,0.3)]`.

**4. MODIFY `frontend/src/components/edges/StaleEdge.tsx`**

Shift stroke color from `#525252` toward `#3f3f46` (zinc-700) as staleness increases. Interpolate between the two based on the same age ratio used for opacity.

**5. MODIFY `frontend/src/components/nodes/DriftMatrixNode.tsx`**

Add a summary line below the grid: "Worst: {feature_name} @ {node_label} (PSI {value})". Pick the cell with the highest PSI across all nodes and features.

### Validate

Test each scenario:

```bash
# Sudden (default):
python synthetic_daemon.py --drift-at 25 --scenario sudden
# → Instant red flip at tick 25

# Gradual:
python synthetic_daemon.py --drift-at 25 --scenario gradual
# → Slow amber creep starting at tick 25, full red by tick 55

# Periodic:
python synthetic_daemon.py --drift-at 25 --scenario periodic
# → Oscillating green→amber→green→amber... with ~80s period

# Partial:
python synthetic_daemon.py --drift-at 25 --scenario partial
# → DriftMatrixNode shows 3 red rows, 10 green rows
```

Visual checks:
1. Sparkline gradient fill visible (subtle shading below line)
2. Alert state nodes have a faint red glow
3. Stale edges shift color as well as opacity
4. DriftMatrixNode shows worst-drift summary at bottom

**Pass criteria**: All 4 scenarios produce visually distinct drift patterns. Polish items are subtle but present.

---

## File Inventory

### New files (6)
```
frontend/src/lib/store/drift-store.ts          (slice 1, modified in 2, 6)
frontend/src/lib/drift/psi.ts                  (slice 2)
frontend/src/components/nodes/Sparkline.tsx     (slice 1, modified in 3, 7)
frontend/src/components/edges/StaleEdge.tsx     (slice 4, modified in 7)
frontend/src/components/edges/edge-types.ts     (slice 4)
frontend/src/components/nodes/DriftMatrixNode.tsx (slice 5, modified in 6, 7)
server/substrate/components/drift_matrix.py     (slice 5)
```

### Modified files (9)
```
frontend/src/lib/ws/client.ts                  (slice 1)
frontend/src/components/nodes/BaseNodeShell.tsx (slice 2, modified in 6, 7)
frontend/src/components/nodes/ConfidenceGaugeNode.tsx (slice 1, modified in 2)
frontend/src/components/nodes/FeatureBarsNode.tsx (slice 2, modified in 3)
frontend/src/components/nodes/BridgeMonitorNode.tsx (slice 2)
frontend/src/components/canvas/SubstrateCanvas.tsx (slice 4)
frontend/src/components/canvas/CanvasControls.tsx (slice 6)
frontend/src/lib/nodes/registry.ts             (slice 5)
frontend/src/components/canvas/node-types.ts   (slice 5)
server/substrate/components/__init__.py         (slice 5)
synthetic_daemon.py                            (slice 2, modified in 7)
frontend/src/App.tsx                           (slice 4)
```

### New directories (2)
```
frontend/src/lib/drift/       (mkdir in slice 2)
frontend/src/components/edges/ (mkdir in slice 4)
```

---

## Path Validation (2026-05-15)

All 12 modified files confirmed to exist at their listed paths. All parent directories for new files confirmed to exist (except the two new directories noted above which are created during their respective slices). All import paths verified against the actual file tree. `getSmoothStepPath` and `getBezierPath` confirmed exported from `@xyflow/react` v12. No recharts or d3-array dependency needed — sparklines are pure SVG.

---

## Audit Corrections (2026-05-15)

Six issues found by reading actual source code at integration points. All corrections are inlined above into the relevant slice directions. Summary:

### Slice 1 corrections (3 findings)

1. **Linkforge bypass early return** — `client.ts` lines 76-83 do `return;` for `linkforge:` and `topoconf:research:` streams. Drift store push placed "after line 74" but before the bypass check is correct. Placed after line 83 would silently miss all linkforge/research events. **Fix**: inline code sample above shows exact insertion point.

2. **Timestamp units mismatch** — Server `streamhub.py` sends `ts = time.time()` (seconds since epoch). EventLogStore uses `Date.now()` (milliseconds). If the drift store uses `msg.ts` directly, staleness math in Slice 4 breaks (everything looks 1000x older). **Fix**: use `Date.now()` for drift store timestamps, matching EventLogStore convention.

3. **Payload nesting for features** — `batchUpdateNodeData` does shallow merge `{...node.data, ...payload}`. When payload is `{prompt_id, features: {H0_...: 1.23}}`, features end up at `node.data.features.H0_...`. The `extractNumericValues` helper must walk `payload.features.*` and flatten, not just read top-level numbers. **Fix**: explicitly documented in the extractNumericValues description above.

### Slice 4 corrections (3 findings)

4. **EdgeData schema has no `type` field** — `server/substrate/schemas.py` EdgeData is `{id, source, target, source_handle, target_handle, data}`. Edges saved to Postgres via `_upsert_edge` lose their React Flow `type` property. Loading via `loadGraph` produces edges without `type: "stale"`. **Fix**: client-side injection on load (recommended) or schema migration (heavier). Documented in Slice 4 step 4a.

5. **loadGraph doesn't set edge type** — `canvas-store.ts` lines 177-191 map server edges without a type field. This — not App.tsx — is the actual injection point for ensuring loaded edges get `type: "stale"`. The original plan said to modify App.tsx only, which would work for initial seed but break on page reload. **Fix**: documented in Slice 4 step 4a.

6. **onConnect doesn't set edge type** — The store's `onConnect` uses `addEdge(connection, get().edges)` which doesn't set type. New edges created by drag-connecting on the canvas wouldn't be stale edges. **Fix**: spread `type: "stale"` into the connection object. Documented in Slice 4 step 4b.
