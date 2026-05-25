# Spec: Chrome Tabs + Link-Forge Pipeline

**Status (2026-05-13):** Phase 1 (Tabs) COMPLETE. Phases 2-4 SUPERSEDED by `SPEC-linkforge-v2.md` — do not implement from this doc.

## Overview

Two features that compose:

1. **Chrome-style graph tabs** — switch between multiple React Flow canvases within one project
2. **Link-forge pipeline graph** — a second tab showing link-forge's ingestion pipeline in real-time

The substrate already supports multiple graphs per project. Tabs are pure frontend. The link-forge integration follows the same pattern as topo-confidence: a separate process publishes to Redis Streams, StreamHub fans out to subscriber nodes via WebSocket.

---

## Architecture

```
                    ┌─────────────────────────────┐
                    │   Browser (localhost:5173)   │
                    │                              │
                    │  ┌─── Tab Bar ────────────┐  │
                    │  │ [Topo Scoring] [LF] [+]│  │
                    │  └────────────────────────┘  │
                    │  ┌─── React Flow ─────────┐  │
                    │  │ Tab 1: 7 topo nodes     │  │
                    │  │ Tab 2: 7 link-forge     │  │
                    │  └────────────────────────┘  │
                    └───────────┬──────────────────┘
                                │ WS /ws/canvas/{graphId}
                    ┌───────────▼──────────────────┐
                    │   Substrate Server (8080)     │
                    │   StreamHub reads all streams │
                    │   (topoconf:* + linkforge:*)  │
                    └───────────┬──────────────────┘
                                │ XREAD
                    ┌───────────▼──────────────────┐
                    │   Redis (6381)                │
                    │   topoconf:scoring:*  (6)     │
                    │   linkforge:*         (6)     │
                    └───────┬───────────┬──────────┘
                            │           │
              XADD ─────────┘           └───────── XADD
                            │                       │
              ┌─────────────▼──┐     ┌──────────────▼──┐
              │ topo-confidence│     │   link-forge     │
              │ daemon (GPU)   │     │   (existing)     │
              │ (adapter.py)   │     │   + redis publish │
              └────────────────┘     └──────────────────┘
```

**Key invariant**: The substrate server never imports link-forge or topo-confidence. All communication is Redis Streams.

---

## Phase 1: Chrome-Style Tabs

### P1-B1. Backend: `GET /api/projects/{project_id}/graphs`

**File:** `server/substrate/crud.py`

```python
async def list_graphs(project_id: str) -> list[dict[str, Any]]:
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT id, project_id, name, current_version, created_at, updated_at "
        "FROM graphs WHERE project_id = $1 ORDER BY created_at",
        project_id,
    )
    return [dict(r) for r in rows]
```

**File:** `server/substrate/main.py`

```python
@app.get("/api/projects/{project_id}/graphs")
async def list_graphs(project_id: str):
    graphs = await crud.list_graphs(project_id)
    return [_serialize_row(g) for g in graphs]
```

### P1-F1. Canvas store: add `projectId`

**File:** `frontend/src/lib/store/canvas-store.ts`

Add to `CanvasState`:
```typescript
projectId: string | null;
```

Set it in `setGraphMeta` and the init flow in `App.tsx`.

### P1-F2. `TabBar` component

**New file:** `frontend/src/components/canvas/TabBar.tsx`

Horizontal tab bar above the canvas.

```
┌──────────────────────────────────────────────────────────────┐
│ [Topo Scoring ×] [Link-Forge Pipeline ×] [+]                │
└──────────────────────────────────────────────────────────────┘
```

Props:
```typescript
interface TabBarProps {
  projectId: string;
  activeGraphId: string;
  onSelectGraph: (graphId: string) => void;
}
```

Behavior:
- On mount: `GET /api/projects/{projectId}/graphs` → render tabs
- Active tab: highlighted bottom border (e.g. `border-b-2 border-emerald-500`)
- Click tab → `onSelectGraph(graphId)`
- "+" button → inline text input → `POST /api/graphs { project_id, name }` → switch to new graph
- Close "×" on tabs (deferred — out of scope for now)
- Styling: `bg-neutral-950`, height ~36px, `overflow-x-auto` for many tabs
- Refetch graph list after creating a new graph

### P1-F3. Wire tabs into `App.tsx`

Current init flow:
1. Resolve `graphId` (URL param → localStorage → create default)
2. `loadGraph(graphId)` → hydrate store
3. `new SubstrateWS(graphId)` → connect

New flow:
1. Resolve `projectId` + `graphId` (same logic, but also store `projectId`)
2. Store both in canvas store
3. Render `<TabBar>` above `<SubstrateCanvas>`
4. On `onSelectGraph(newGraphId)`:
   a. `wsRef.current.disconnect()`
   b. `loadGraph(newGraphId)` → re-hydrate store
   c. `localStorage.setItem("substrate:lastGraphId", newGraphId)`
   d. Create new `SubstrateWS(newGraphId)` → connect
   e. Rebuild subscriptions from new graph's nodes

Layout:
```tsx
<div className="flex h-screen w-screen flex-col">
  <TabBar
    projectId={projectId}
    activeGraphId={graphId}
    onSelectGraph={handleSwitchGraph}
  />
  <div className="flex-1 min-h-0">
    <SubstrateCanvas />
  </div>
</div>
```

### P1 Estimate: ~2 hours

---

## Phase 2: Link-Forge Redis Publisher

Add Redis publishing to link-forge's processor. Publishes an event at each processing stage.

### P2-1. Add ioredis dependency

**File:** `~/link-forge/package.json`

```json
"ioredis": "^5.4.0"
```

### P2-2. Redis publisher module

**New file:** `~/link-forge/src/publisher/redis.ts`

```typescript
import Redis from "ioredis";

let client: Redis | null = null;

export function initRedisPublisher(url: string): void {
  client = new Redis(url);
}

export async function publish(stream: string, data: Record<string, unknown>): Promise<void> {
  if (!client) return;
  const payload = JSON.stringify(data);
  if (payload.length > 256_000) {
    console.warn(`[publisher] payload too large for ${stream}: ${payload.length} bytes`);
    return;
  }
  await client.xadd(stream, "MAXLEN", "~", "10000", "*", "data", payload);
}

export async function closeRedisPublisher(): Promise<void> {
  await client?.quit();
  client = null;
}
```

### P2-3. Config

**File:** `~/link-forge/src/config/index.ts`

Add:
```typescript
publisher: {
  redisUrl: process.env.PUBLISHER_REDIS_URL || "",  // empty = disabled
}
```

### P2-4. Hook into processor

**File:** `~/link-forge/src/processor/index.ts`

Add `publish()` calls at 6 points in `processOne()`:

| After line | Stream | Payload |
|------------|--------|---------|
| ~82 (dequeue) | `linkforge:ingested` | `{queue_id, url, source_type, source, discord_author, timestamp}` |
| ~116 (scrape done) | `linkforge:scraped` | `{queue_id, url, title, content_length, domain, success: true}` |
| ~142 (categorize done) | `linkforge:categorized` | `{queue_id, url, title, category, tags, forge_score, content_type, key_concepts, authors}` |
| ~258 (chunks done) | `linkforge:stored` | `{queue_id, url, title, category, chunk_count, relationships_created}` |
| ~302 (research-graph) | `linkforge:research_bridged` | `{queue_id, url, title, arxiv_id, relevant, relevance_note}` |
| ~387 (completed) | `linkforge:completed` | `{queue_id, url, title, forge_score, category, processing_time_ms}` |

On failure (~407):
- `linkforge:completed` with `{queue_id, url, error, success: false}`

### P2-5. Startup wiring

**File:** `~/link-forge/src/index.ts`

```typescript
import { initRedisPublisher, closeRedisPublisher } from "./publisher/redis.js";

// In startup, after config load:
if (config.publisher.redisUrl) {
  initRedisPublisher(config.publisher.redisUrl);
}

// In shutdown:
await closeRedisPublisher();
```

### P2 Estimate: ~1.5 hours

### P2 Risk: Low

Link-forge continues to work identically when `PUBLISHER_REDIS_URL` is empty. All publishes are fire-and-forget with try/catch. No new polling, no new dependencies on Redis for core functionality.

---

## Phase 3: Substrate Backend Components

> **SUPERSEDED (2026-05-13):** This phase was replaced by `SPEC-linkforge-v2.md` Wave 3, which uses 4 consolidated components instead of 7 individual stage components. Do not implement from this section.

7 new SUBSCRIBER components in the substrate server. These are thin shells — they declare `subscribed_streams` and the frontend handles all visualization.

### P3-1. New component files

**Directory:** `server/substrate/components/`

| File | type_id | subscribed_streams |
|------|---------|-------------------|
| `lf_ingested.py` | `lf_ingested` | `["linkforge:ingested"]` |
| `lf_scraped.py` | `lf_scraped` | `["linkforge:scraped"]` |
| `lf_categorized.py` | `lf_categorized` | `["linkforge:categorized"]` |
| `lf_stored.py` | `lf_stored` | `["linkforge:stored"]` |
| `lf_research_bridge.py` | `lf_research_bridge` | `["linkforge:research_bridged"]` |
| `lf_completed.py` | `lf_completed` | `["linkforge:completed"]` |
| `lf_queue_stats.py` | `lf_queue_stats` | `["linkforge:completed"]` |

Each follows the same pattern:
```python
from substrate.sdk import Component, NodeKind, Socket, SocketType

@registry.register
class LfIngestedComponent(Component):
    type_id = "lf_ingested"
    kind = NodeKind.SUBSCRIBER
    inputs = []
    outputs = [Socket("out", SocketType.FEATURES, "Events")]
    subscribed_streams = ["linkforge:ingested"]
```

### P3-2. Import registration

**File:** `server/substrate/components/__init__.py`

Add imports for all 7 new components.

### P3-3. SocketType additions

**File:** `server/substrate/sdk.py`

Add to `SocketType` enum if needed. The link-forge nodes don't connect to topo-confidence nodes, so we may want a new socket type `LINKFORGE` to prevent invalid cross-pipeline connections. Or we can keep it simple and not add connection validation between pipelines — nodes within a tab are self-contained.

Decision: **No new SocketType needed.** Each tab is its own graph with its own nodes. Cross-graph connections don't exist.

### P3 Estimate: ~30 minutes

---

## Phase 4: Substrate Frontend — Link-Forge Node Types

> **SUPERSEDED (2026-05-13):** This phase was replaced by `SPEC-linkforge-v2.md` Wave 4, which uses a single unified `LfStageCard` with 10 internal renderers instead of 7 separate components. Do not implement from this section.

7 new React components for visualizing the link-forge pipeline.

### P4-1. Node registry additions

**File:** `frontend/src/lib/nodes/registry.ts`

Add 7 entries to `NODE_REGISTRY`:

```typescript
lf_ingested: {
  type_id: "lf_ingested",
  name: "Discord Feed",
  category: "input",
  inputs: [],
  outputs: [{ id: "out", type: "linkforge", name: "Events" }],
  subscribesTo: ["linkforge:ingested"],
},
lf_scraped: {
  type_id: "lf_scraped",
  name: "Scraper",
  category: "extraction",
  inputs: [],
  outputs: [{ id: "out", type: "linkforge", name: "Content" }],
  subscribesTo: ["linkforge:scraped"],
},
lf_categorized: {
  type_id: "lf_categorized",
  name: "Categorizer",
  category: "extraction",
  inputs: [],
  outputs: [{ id: "out", type: "linkforge", name: "Categorized" }],
  subscribesTo: ["linkforge:categorized"],
},
lf_stored: {
  type_id: "lf_stored",
  name: "Graph Store",
  category: "topology",
  inputs: [],
  outputs: [{ id: "out", type: "linkforge", name: "Stored" }],
  subscribesTo: ["linkforge:stored"],
},
lf_research_bridge: {
  type_id: "lf_research_bridge",
  name: "Research Bridge",
  category: "scoring",
  inputs: [],
  outputs: [],
  subscribesTo: ["linkforge:research_bridged"],
},
lf_completed: {
  type_id: "lf_completed",
  name: "Pipeline Status",
  category: "scoring",
  inputs: [],
  outputs: [],
  subscribesTo: ["linkforge:completed"],
},
lf_queue_stats: {
  type_id: "lf_queue_stats",
  name: "Queue Monitor",
  category: "input",
  inputs: [],
  outputs: [],
  subscribesTo: ["linkforge:completed"],
},
```

### P4-2. Node components

**Directory:** `frontend/src/components/nodes/`

#### `LfIngestedNode.tsx` — "Discord Feed"
Rolling list of recently ingested URLs. Shows:
- URL (truncated, linkable)
- Source badge (discord / inbox / huggingface / arxiv)
- Timestamp
- Max 20 items, newest on top, auto-scroll

```
┌─────────────────────────┐
│ 📥 Discord Feed         │
├─────────────────────────┤
│ ● arxiv.org/abs/2406... │
│   source: huggingface   │
│   3s ago                │
│─────────────────────────│
│ ● github.com/owner/re.. │
│   source: discord       │
│   12s ago               │
│─────────────────────────│
│ ● nature.com/articles.. │
│   source: discord       │
│   45s ago               │
└─────────────────────────┘
```

#### `LfScrapedNode.tsx` — "Scraper"
Shows latest scrape result:
- Title (extracted)
- Domain
- Content length (KB)
- Success/failure indicator

```
┌─────────────────────────┐
│ 🔍 Scraper              │
├─────────────────────────┤
│ "Attention Is All..."   │
│ domain: arxiv.org       │
│ content: 42.3 KB        │
│ status: ✓ extracted     │
└─────────────────────────┘
```

#### `LfCategorizedNode.tsx` — "Categorizer"
Shows Claude's categorization output:
- Category badge
- Forge score (0-1 bar, color-coded like confidence gauge)
- Content type
- Tags (chip list, max 5)
- Key concepts (chip list, max 5)

```
┌─────────────────────────┐
│ 🏷️ Categorizer          │
├─────────────────────────┤
│ Category: ML Research   │
│ Score: ████████░░ 0.82  │
│ Type: research-paper    │
│ Tags: [tda] [topology]  │
│       [neural-nets]     │
│ Concepts: [attention]   │
│           [transformer] │
└─────────────────────────┘
```

#### `LfStoredNode.tsx` — "Graph Store"
Shows Neo4j write result:
- Title
- Chunk count
- Relationships created count
- Category stored under
- Rolling counter of total items stored this session

```
┌─────────────────────────┐
│ 🗄️ Graph Store          │
├─────────────────────────┤
│ "Attention Is All..."   │
│ chunks: 24              │
│ relationships: 8        │
│ category: ML Research   │
│ ─────────────────────── │
│ session total: 47       │
└─────────────────────────┘
```

#### `LfResearchBridgeNode.tsx` — "Research Bridge"
Shows topo-confidence relevance triage:
- Title
- Arxiv ID (if found)
- Relevant? (green check / red x)
- Relevance note (Claude's reasoning)
- Rolling stats: admitted/rejected/skipped

```
┌─────────────────────────┐
│ 🔬 Research Bridge      │
├─────────────────────────┤
│ "Topological Data..."   │
│ arxiv: 2406.12345       │
│ verdict: ✓ relevant     │
│ "Addresses H-3 on       │
│  bridge persistence"    │
│ ─────────────────────── │
│ ✓ 12  ✗ 38  ⊘ 156     │
└─────────────────────────┘
```

#### `LfCompletedNode.tsx` — "Pipeline Status"
Shows processing pipeline health:
- Latest completed item (title, time, forge score)
- Processing rate (items/hour, rolling 1h window)
- Success/failure counts
- Average processing time

```
┌─────────────────────────┐
│ ✅ Pipeline Status       │
├─────────────────────────┤
│ Latest: "Attention..."  │
│ Score: 0.82 | 14.2s     │
│ ─────────────────────── │
│ Rate: 24/hr             │
│ Success: 47  Failed: 2  │
│ Avg time: 12.8s         │
└─────────────────────────┘
```

#### `LfQueueStatsNode.tsx` — "Queue Monitor"
Shows queue depth and throughput over time:
- Pending / processing / completed / failed counts
- Simple bar chart of last N completions (colored by forge_score)
- Worker utilization (if derivable from event timestamps)

```
┌─────────────────────────┐
│ 📊 Queue Monitor        │
├─────────────────────────┤
│ Pending:    12          │
│ Processing:  2          │
│ Completed: 847          │
│ Failed:     23          │
│ ─────────────────────── │
│ Last 20: ██▓▓█▓░▓██▓█░ │
│ (color = forge score)   │
└─────────────────────────┘
```

Note: Queue Monitor derives its state from `linkforge:completed` events (counting successes/failures). Real-time queue depth would require a separate endpoint or stream — defer to a future enhancement.

### P4-3. Node type map

**File:** `frontend/src/components/canvas/node-types.ts`

Add all 7 new components to `nodeTypes`.

### P4-4. Default link-forge graph

When the "+" tab creates a "Link-Forge Pipeline" graph, seed it with all 7 nodes in a pipeline layout:

```
Discord Feed ──→ Scraper ──→ Categorizer ──→ Graph Store ──→ Research Bridge
                                                              │
Queue Monitor                                  Pipeline Status ◄┘
```

This mirrors how `App.tsx` currently seeds the default topo-confidence graph with 7 nodes + 6 edges.

### P4 Estimate: ~4 hours

---

## Redis Stream Schema

All streams use `MAXLEN ~ 10000` and publish JSON in a single `data` field.

### Link-Forge Streams (6)

| Stream | Published by | Payload |
|--------|-------------|---------|
| `linkforge:ingested` | link-forge processor (dequeue) | `{queue_id, url, source_type, source, discord_author, timestamp}` |
| `linkforge:scraped` | link-forge processor (scrape) | `{queue_id, url, title, content_length, domain, success}` |
| `linkforge:categorized` | link-forge processor (claude) | `{queue_id, url, title, category, tags[], forge_score, content_type, key_concepts[], authors[]}` |
| `linkforge:stored` | link-forge processor (neo4j) | `{queue_id, url, title, category, chunk_count, relationships_created}` |
| `linkforge:research_bridged` | link-forge processor (bridge) | `{queue_id, url, title, arxiv_id, relevant, relevance_note}` |
| `linkforge:completed` | link-forge processor (done/fail) | `{queue_id, url, title, forge_score, category, processing_time_ms, success, error?}` |

### Existing Topo-Confidence Streams (6 + 1 control)

| Stream | Published by |
|--------|-------------|
| `topoconf:control` | substrate server |
| `topoconf:scoring:hidden_state_cloud` | topo-confidence daemon |
| `topoconf:scoring:persistence_computed` | topo-confidence daemon |
| `topoconf:scoring:features_computed` | topo-confidence daemon |
| `topoconf:scoring:confidence_scored` | topo-confidence daemon |
| `topoconf:scoring:bridge_health` | topo-confidence daemon |
| `topoconf:scoring:explain_result` | topo-confidence daemon |

---

## Default Graph Layouts

### Tab 1: "Topo Scoring" (existing, unchanged)

```
PromptInput ──→ HiddenStateCloud
             ├→ FeatureBars
             ├→ PersistenceDiagram
             ├→ ConfidenceGauge
             ├→ BridgeMonitor
             └→ ExplainWaterfall
```

### Tab 2: "Link-Forge Pipeline"

```
                                                      ┌──────────────┐
┌──────────┐   ┌─────────┐   ┌────────────┐   ┌──────┤ Research      │
│ Discord  ├──→│ Scraper ├──→│ Categorizer├──→│Graph │ Bridge       │
│ Feed     │   │         │   │            │   │Store │              │
└──────────┘   └─────────┘   └────────────┘   └──┬───┴──────────────┘
                                                  │
┌──────────┐                          ┌───────────▼──┐
│ Queue    │                          │ Pipeline     │
│ Monitor  │                          │ Status       │
└──────────┘                          └──────────────┘
```

---

## Execution Order

### Wave 1: Tabs (Phase 1) — ~2h
1. `crud.py` — add `list_graphs()`
2. `main.py` — add `GET /api/projects/{project_id}/graphs` route
3. `canvas-store.ts` — add `projectId` to state
4. `TabBar.tsx` — new component
5. `App.tsx` — wire tabs, handle graph switching

### Wave 2: Link-Forge Publisher (Phase 2) — ~1.5h
6. `~/link-forge/package.json` — add `ioredis`
7. `~/link-forge/src/publisher/redis.ts` — new module
8. `~/link-forge/src/config/index.ts` — add `publisher.redisUrl`
9. `~/link-forge/src/processor/index.ts` — add publish calls at 6 points
10. `~/link-forge/src/index.ts` — wire startup/shutdown

### Wave 3: Substrate Backend (Phase 3) — ~30m
11. `server/substrate/components/lf_*.py` — 7 new subscriber components
12. `server/substrate/components/__init__.py` — register imports

### Wave 4: Substrate Frontend (Phase 4) — ~4h
13. `registry.ts` — add 7 link-forge node definitions
14. `Lf*.tsx` — 7 new React node components
15. `node-types.ts` — add to type map
16. `App.tsx` — add default link-forge graph seeding (when creating "Link-Forge Pipeline" tab)

### Wave 5: Integration Test
17. Start substrate: `docker compose up`
18. Start link-forge with `PUBLISHER_REDIS_URL=redis://localhost:6381/0`
19. Open browser → verify two tabs exist
20. Drop a URL in Discord → watch it flow through all 7 link-forge nodes
21. Switch to Topo Scoring tab → verify existing pipeline still works
22. Switch back → verify link-forge state persisted

---

## Total Estimate: ~8 hours across 4 waves

| Phase | Time | Risk |
|-------|------|------|
| 1: Tabs | ~2h | Low — pure frontend, backend endpoint trivial |
| 2: LF Publisher | ~1.5h | Low — opt-in, fire-and-forget, no core changes |
| 3: Backend Components | ~0.5h | Low — boilerplate subscriber shells |
| 4: Frontend Nodes | ~4h | Medium — 7 new visualizations, but all follow BaseNodeShell pattern |
| **Total** | **~8h** | |

---

## Out of Scope

- Tab drag-to-reorder
- Tab close/delete graph
- Tab rename (inline edit)
- Cross-tab node connections (graphs are independent)
- Real-time queue depth from link-forge (would need separate polling endpoint)
- Link-forge MCP tool integration from within substrate
- Neo4j graph visualization node (force-directed graph of link-forge's knowledge graph)
- Embedding visualization node (UMAP of link-forge's 384-dim vectors)
- AutoRel sweep visualization

---

## Future: More Pipeline Tabs

The tab system is generic. Any process that can publish to Redis Streams gets a tab:

| Pipeline | Streams prefix | Status |
|----------|---------------|--------|
| Topo-Confidence Scoring | `topoconf:scoring:*` | Built |
| Link-Forge Ingestion | `linkforge:*` | This spec |
| HF Daily Papers | `hfpapers:*` | Future |
| Research Sweep | `researchsweep:*` | Future |
| Experiment Runner | `experiments:*` | Future |

Each tab's nodes are self-contained. The substrate server doesn't care what the stream names mean — it just reads and fans out.
