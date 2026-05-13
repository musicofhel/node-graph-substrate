# Implementation Handoff: Tabs + Link-Forge Pipeline v2

**Date**: 2026-05-10
**Status**: Spec complete, zero implementation started
**Latest commit**: `46179ce` on main, no uncommitted changes
**Full spec**: `SPEC-linkforge-v2.md` (Waves 2-7), `SPEC-tabs-and-linkforge.md` (Wave 1 tabs only)

---

## What We're Building

1. **Chrome-style tab bar** above the React Flow canvas to switch between graphs
2. **10-stage pipeline waterfall** — each paper flowing through link-forge spawns a column of React Flow stage cards growing downward. Newest papers on LEFT, staircase pattern forms naturally.
3. **Completed paper pool** below the waterfall — hybrid card grid (60%) + detail panel (40%) with historical + live data, "NEW" badges on live items
4. **Cross-system experiment visibility** — pool detail panel shows topo-confidence research lifecycle (triage, script gen, experiment, findings) for research-bridged papers
5. **AutoRel sweep status widget** — compact node showing batch relationship discovery results

---

## 7 Waves, ~24h Total

| Wave | What | Time | Repo |
|------|------|------|------|
| 1 | Chrome tabs | ~2h | node-graph-substrate |
| 2 | Link-forge publisher (10 streams + hashes) | ~2.5h | link-forge |
| 3 | Backend components + history API | ~2h | node-graph-substrate |
| 4 | Frontend waterfall (10 stages) | ~6h | node-graph-substrate |
| 5 | Pool + detail panel + history | ~8h | node-graph-substrate |
| 6 | Topo-confidence research publisher | ~2h | topo-confidence |
| 7 | AutoRel status panel | ~1.5h | link-forge + node-graph-substrate |

Dependencies: Wave 1 first. Waves 2+6 can run in parallel with anything. Wave 3 before 4. Wave 4 before 5. Wave 6 before 5's research lifecycle display.

---

## Wave 1: Chrome Tabs (~2h)

### MODIFY: `/home/musicofhel/node-graph-substrate/server/substrate/crud.py`
- Add `list_graphs(project_id)` function
- Queries: `SELECT id, project_id, name, current_version, created_at, updated_at FROM graphs WHERE project_id = $1 ORDER BY created_at`

### MODIFY: `/home/musicofhel/node-graph-substrate/server/substrate/main.py`
- Add route: `GET /api/projects/{project_id}/graphs` calling `crud.list_graphs()`

### MODIFY: `/home/musicofhel/node-graph-substrate/frontend/src/lib/store/canvas-store.ts`
- Add `projectId: string | null` to CanvasState interface (~line 14)
- Set it in `setGraphMeta` (~line 99)

### CREATE: `/home/musicofhel/node-graph-substrate/frontend/src/components/canvas/TabBar.tsx`
- Chrome-style horizontal tabs above canvas
- Props: `projectId`, `activeGraphId`, `onSelectGraph`
- Fetches graph list from `GET /api/projects/{projectId}/graphs`
- One tab per graph, active tab highlighted
- "+" button to create new graph (POST /api/graphs)
- Dark theme, ~36px height, horizontal scroll

### MODIFY: `/home/musicofhel/node-graph-substrate/frontend/src/App.tsx`
- Store `projectId` alongside `graphId` in init flow
- Render `<TabBar>` above `<SubstrateCanvas>` in flex column layout
- `handleSwitchGraph`: disconnect WS, loadGraph(newId), update localStorage, create new SubstrateWS, rebuild subscriptions

Layout:
```tsx
<div className="flex h-screen w-screen flex-col">
  <TabBar projectId={projectId} activeGraphId={graphId} onSelectGraph={handleSwitchGraph} />
  <div className="flex-1 min-h-0">
    <SubstrateCanvas />
  </div>
</div>
```

Full spec: `SPEC-tabs-and-linkforge.md` sections P1-B1 through P1-F3.

---

## Wave 2: Link-Forge Publisher (~2.5h)

All changes in `~/link-forge`. Opt-in via `PUBLISHER_REDIS_URL` env var. Empty = disabled, zero runtime impact.

### MODIFY: `/home/musicofhel/link-forge/package.json`
- Add dependency: `"ioredis": "^5.4.0"`

### CREATE: `/home/musicofhel/link-forge/src/publisher/redis.ts`
- `initRedisPublisher()` — connects if PUBLISHER_REDIS_URL set
- `publish(stream, data)` — XADD with MAXLEN ~ 10000, fire-and-forget
- `setPaperField(queueId, fields)` — HSET to `linkforge:paper:{queueId}`, EXPIRE 604800 (7 days)
- `closeRedisPublisher()` — clean shutdown

### MODIFY: `/home/musicofhel/link-forge/src/config/index.ts`
- Add: `publisher: { redisUrl: process.env.PUBLISHER_REDIS_URL || "" }`

### MODIFY: `/home/musicofhel/link-forge/src/processor/index.ts`
10 publish + hash write points in `processOne()`:

| Line | Stage | Stream | Key hash fields |
|------|-------|--------|-----------------|
| ~82 | After dequeue | `linkforge:ingested` | url, source_type, source, discord_author |
| ~116 | After scrape/extract | `linkforge:extracted` | title, domain, content_length, file_type |
| ~142 | After categorize | `linkforge:categorized` | category, tags, forge_score, content_type, concepts, authors, difficulty, quality, summary |
| ~165 | After embedding | `linkforge:embedded` | embedding_dim |
| ~258 | After Neo4j store | `linkforge:stored` | chunk_count, relationship_count, tag_count, tool_count, concept_count |
| ~275 | After chunk embeddings | `linkforge:chunked` | chunk_size, coverage_pct |
| ~290 | After similarity | `linkforge:auto_related` | match_count, best_match_title, best_match_score, avg_confidence |
| ~302 | After research bridge | `linkforge:research_bridged` | arxiv_id, research_relevant, relevance_note |
| ~340 | After URL discovery | `linkforge:url_discovered` | urls_found, urls_enqueued, urls_existing |
| ~387 | After completion | `linkforge:completed` | processing_time_ms, success, completed_at |
| ~407 | On failure | `linkforge:completed` | success=false, error, completed_at |

### MODIFY: `/home/musicofhel/link-forge/src/autorel/sweep.ts`
- After sweep completes, publish to `linkforge:autorel:sweep_completed`
- Payload: `{sweep_id, duration_ms, total_edges_created, total_edges_pruned, phases: {...}, completed_at}`

### MODIFY: `/home/musicofhel/link-forge/src/index.ts`
- Import `initRedisPublisher`, `closeRedisPublisher`
- Call `initRedisPublisher()` in startup
- Call `closeRedisPublisher()` in shutdown

---

## Wave 3: Backend Components + History API (~2h)

All changes in `~/node-graph-substrate`.

### CREATE: `/home/musicofhel/node-graph-substrate/server/substrate/components/lf_coordinator.py`
- `type_id = "lf_coordinator"`, `kind = NodeKind.SUBSCRIBER`
- `subscribed_streams` = all 10 `linkforge:*` pipeline streams

### CREATE: `/home/musicofhel/node-graph-substrate/server/substrate/components/lf_stats.py`
- `type_id = "lf_stats"`, `kind = NodeKind.SUBSCRIBER`
- `subscribed_streams = ["linkforge:completed"]`

### CREATE: `/home/musicofhel/node-graph-substrate/server/substrate/components/lf_autorel.py`
- `type_id = "lf_autorel"`, `kind = NodeKind.SUBSCRIBER`
- `subscribed_streams = ["linkforge:autorel:sweep_completed"]`

### CREATE: `/home/musicofhel/node-graph-substrate/server/substrate/components/research_coordinator.py`
- `type_id = "research_coordinator"`, `kind = NodeKind.SUBSCRIBER`
- `subscribed_streams` = all 5 `topoconf:research:*` streams

### MODIFY: `/home/musicofhel/node-graph-substrate/server/substrate/components/__init__.py`
- Import all 4 new components

### CREATE: `/home/musicofhel/node-graph-substrate/server/substrate/linkforge_history.py`
- `get_paper_history(redis, limit, offset, category, research_only)` — SCAN `linkforge:paper:*`, HGETALL, sort by completed_at desc, paginate
- `get_paper_detail(redis, queue_id)` — HGETALL `linkforge:paper:{queue_id}`
- `get_research_lifecycle(redis, arxiv_id)` — HGETALL `topoconf:research:{arxiv_id}`

### MODIFY: `/home/musicofhel/node-graph-substrate/server/substrate/main.py`
- Add route: `GET /api/linkforge/history?limit=50&offset=0&category=&research_only=false`
- Add route: `GET /api/linkforge/paper/{queue_id}`
- Add route: `GET /api/linkforge/paper/{queue_id}/research`

---

## Wave 4: Frontend Waterfall — 10 Stages (~6h)

All changes in `~/node-graph-substrate`.

### MODIFY: `/home/musicofhel/node-graph-substrate/frontend/src/lib/ws/client.ts`
- In `onmessage` handler (~line 54), BEFORE the RAF coalescing path, add bypass:
- If `stream?.startsWith("linkforge:") || stream?.startsWith("topoconf:research:")` → pass directly to handlers, skip coalescing
- **Why**: RAF coalescing shallow-merges by node_id. All linkforge events share the coordinator's node_id — they'd overwrite each other and lose the stream name.

### MODIFY: `/home/musicofhel/node-graph-substrate/frontend/src/App.tsx`
- Add `PaperTracker` type: `{queueId, columnIndex, stageNodes: Map<string, string>, url, title?}`
- Add refs: `paperTrackerRef = useRef<Map<string, PaperTracker>>()`, `columnCounterRef = useRef(0)`
- In `handleMessage`, intercept linkforge stream events → `handleLinkforgeEvent(stream, payload)`
- `handleLinkforgeEvent`:
  1. Extract `queue_id` from payload
  2. If new queue_id → create PaperTracker, increment column counter
  3. Create `lf_stage` node at `x = -(columnIndex * 260)`, `y = STAGE_Y[stage]`
  4. If previous stage exists for this paper → create vertical edge
  5. If paper count > 30 → remove oldest paper's nodes + edges

Stage Y positions (140px spacing):
```
ingested: 0, extracted: 140, categorized: 280, embedded: 420,
stored: 560, chunked: 700, auto_related: 840,
research_bridged: 980, url_discovered: 1120, completed: 1260
```

### CREATE: `/home/musicofhel/node-graph-substrate/frontend/src/components/nodes/LfStageCard.tsx`
- ONE component, 10 internal renderers based on `data._stage`
- Uses `BaseNodeShell` (at `/home/musicofhel/node-graph-substrate/frontend/src/components/nodes/BaseNodeShell.tsx`)
- Category border mapping:
  - `ingested` → `input` (amber)
  - `extracted` → `extraction` (blue)
  - `categorized` → `extraction` (blue)
  - `embedded` → `topology` (purple — note: BaseNodeShell may need a purple category added)
  - `stored` → `topology` (cyan)
  - `chunked` → `topology` (cyan)
  - `auto_related` → `scoring` (emerald)
  - `research_bridged` → `scoring` (emerald)
  - `url_discovered` → `extraction` (blue)
  - `completed` → `scoring` (emerald for success, red border for fail)
- Card width: ~210px, height: 70-140px
- `memo()`'d, uses `useNodesData(id)`
- Forge score color tiers: >=0.65 green, >=0.45 yellow, >=0.25 orange, <0.25 red

### CREATE: `/home/musicofhel/node-graph-substrate/frontend/src/components/nodes/LfCoordinatorNode.tsx`
- "PIPELINE COORDINATOR" header, green pulse dot, "watching 10 streams", papers tracked count
- Sits in a corner, subscription anchor

### CREATE: `/home/musicofhel/node-graph-substrate/frontend/src/components/nodes/LfStatsNode.tsx`
- Accumulates `completed` events in a ref
- Shows: rate (items/hr), success count/pct, failed count, avg processing time, latest item title

### CREATE: `/home/musicofhel/node-graph-substrate/frontend/src/components/nodes/LfAutoRelNode.tsx`
- Small status widget for batch relationship discovery
- Shows: last sweep time, per-phase edge counts (co-access, temporal, transitive, topology, decay), net edges
- Updates from `linkforge:autorel:sweep_completed` stream

### MODIFY: `/home/musicofhel/node-graph-substrate/frontend/src/lib/nodes/registry.ts`
- Add 5 entries: `lf_stage`, `lf_coordinator`, `lf_stats`, `lf_autorel`, `research_coordinator`

### MODIFY: `/home/musicofhel/node-graph-substrate/frontend/src/components/canvas/node-types.ts`
- Import and register: `LfStageCard`, `LfCoordinatorNode`, `LfStatsNode`, `LfAutoRelNode`
- (`research_coordinator` has no visual node — it's a backend-only subscription anchor)

### MODIFY: `/home/musicofhel/node-graph-substrate/frontend/src/App.tsx` (default graph seeding)
- When creating "Link-Forge Pipeline" tab, seed with:
  - `coordinator-1` (lf_coordinator) — top-left
  - `stats-1` (lf_stats) — below coordinator
  - `autorel-1` (lf_autorel) — next to stats
  - `research-coordinator-1` (research_coordinator) — hidden corner
- No edges between static nodes. Dynamic stage cards appear from events.

---

## Wave 5: Pool + Detail Panel (~8h)

All changes in `~/node-graph-substrate`. Pool is HTML (not React Flow), sits below the waterfall canvas.

### MODIFY: `/home/musicofhel/node-graph-substrate/frontend/src/App.tsx`
- Link-forge tab layout becomes two zones with draggable resize handle:
  - Top ~55%: React Flow waterfall canvas
  - Bottom ~45%: PaperPool component
- Pool state: `poolPapers[]`, `selectedPaperId`, `poolFilters`, `livePaperIdsRef`
- On link-forge tab open: fetch `GET /api/linkforge/history?limit=50`, populate pool
- On `linkforge:completed` stream event: fetch full paper hash, prepend to pool with "NEW" badge
- "NEW" badge fades after 5 minutes

### CREATE: `/home/musicofhel/node-graph-substrate/frontend/src/components/linkforge/PaperPool.tsx`
- Top-level pool container
- Renders: filter bar (category dropdown, sort dropdown, search, research-only toggle) + card grid (60% width) + detail panel (40% width)
- Sort options: Recent (default), Forge Score, Processing Time, Category
- "Load more" button for pagination

### CREATE: `/home/musicofhel/node-graph-substrate/frontend/src/components/linkforge/PaperCard.tsx`
- Compact card (~180x120px)
- Shows: title (truncated), forge_score color bar, category badge, content_type, processing time, success indicator
- "NEW" star badge for live-processed papers
- Failed variant: red, shows error message
- States: default, hover (lift), selected (highlighted border)

### CREATE: `/home/musicofhel/node-graph-substrate/frontend/src/components/linkforge/PaperDetail.tsx`
- Fetches full paper on selection: `GET /api/linkforge/paper/{queue_id}`
- **Section 1: Link-Forge Pipeline** (always shown)
  - Vertical timeline of 10 stages with check/X/circle indicators
  - Duration per stage, key data at each stage
  - Each row expandable to show full stage data
- **Section 2: Research Lifecycle** (only if `research_relevant`)
  - Fetches: `GET /api/linkforge/paper/{queue_id}/research`
  - Shows triage status, FutureExperiment list, experiment results
  - Each FE in collapsible section with status (check/spinner/circle/X)
  - Live updates from `topoconf:research:*` stream events (no re-fetch needed)

---

## Wave 6: Topo-Confidence Research Publisher (~2h)

All changes in `~/topo-confidence`. Same opt-in pattern: `PUBLISHER_REDIS_URL` env var.

### CREATE: `/home/musicofhel/topo-confidence/pipeline/publisher.py`
- `init_redis_publisher()` — connects via `redis-py` if env var set
- `publish(stream, data)` — XADD, fire-and-forget
- `set_research_field(arxiv_id, fields)` — HSET to `topoconf:research:{arxiv_id}`, EXPIRE 2592000 (30 days)
- `close_redis_publisher()`

### MODIFY: `/home/musicofhel/topo-confidence/pipeline/autopilot.py`
- Import `init_redis_publisher`, `close_redis_publisher`
- Call init in startup, close in shutdown/signal handler

### MODIFY: `/home/musicofhel/topo-confidence/research-graph/promote_brief.py`
- After successful promotion: publish to `topoconf:research:triaged`
- Hash write: status, brief_path, fe_count, hypothesis_count, triaged_at

### MODIFY: `/home/musicofhel/topo-confidence/pipeline/generate_recompute.py`
- After script generation: publish to `topoconf:research:script_generated`
- Hash write: fe_{id}_script, fe_{id}_desc

### MODIFY: `/home/musicofhel/topo-confidence/pipeline/nodes.py`
- Before experiment starts (run_experiment node): publish to `topoconf:research:experiment_started`
- After experiment completes (parse_results node): publish to `topoconf:research:experiment_completed`
- Hash writes: fe_{id}_status, fe_{id}_started_at, fe_{id}_auroc, fe_{id}_verdict, fe_{id}_duration_s

### MODIFY: `/home/musicofhel/topo-confidence/research-graph/promote_result.py`
- After promotion: publish to `topoconf:research:promoted`
- Hash write: fe_{id}_findings_updated, fe_{id}_experiment_log_id

---

## Wave 7: AutoRel Status Panel (~1.5h)

Already covered:
- Publisher: Wave 2 (`/home/musicofhel/link-forge/src/autorel/sweep.ts`)
- Backend component: Wave 3 (`lf_autorel.py`)
- Frontend node: Wave 4 (`LfAutoRelNode.tsx`)
- Registry: Wave 4

No additional work.

---

## Key Architecture Rules

1. **Substrate isolation**: substrate server NEVER imports link-forge or topo-confidence. Redis only.
2. **Opt-in publishing**: `PUBLISHER_REDIS_URL` env var in both link-forge and topo-confidence. Empty = no Redis dep.
3. **Fire-and-forget**: all publishes wrapped in try/catch, pipeline works identically without Redis.
4. **RAF bypass**: linkforge + research stream events skip coalescing, go directly to handlers.
5. **Single node type**: `lf_stage` renders 10 card layouts via `data._stage`, not 10 separate types.
6. **Newest on LEFT**: `x = -(columnIndex * 260)`, negative X positioning.
7. **30 paper cap**: oldest paper's nodes removed when 31st arrives.
8. **Cross-system correlation**: `arxiv_id` joins linkforge paper hashes to topoconf research hashes.
9. **Pool is HTML, not React Flow**: scrollable card grid below the canvas.
10. **React Flow norms**: `useNodesData(id)` never `useNodes()`, `memo()` all custom nodes, module-scope `nodeTypes`.

---

## Reference: Existing Files You'll Read

| File | Why |
|------|-----|
| `/home/musicofhel/node-graph-substrate/frontend/src/components/nodes/BaseNodeShell.tsx` | Stage cards wrap in this. Category border colors at ~line 22. |
| `/home/musicofhel/node-graph-substrate/frontend/src/lib/ws/client.ts` | RAF coalescing at lines 54-77. Bypass goes before this. |
| `/home/musicofhel/node-graph-substrate/frontend/src/App.tsx` | Init flow, handleMessage, WS lifecycle. Heavy modification target. |
| `/home/musicofhel/node-graph-substrate/frontend/src/lib/store/canvas-store.ts` | State interface ~line 14, setGraphMeta ~line 99. |
| `/home/musicofhel/node-graph-substrate/frontend/src/lib/nodes/registry.ts` | 7 existing entries. Add 5 more. |
| `/home/musicofhel/node-graph-substrate/frontend/src/components/canvas/node-types.ts` | Type map. Add 4 visual imports. |
| `/home/musicofhel/node-graph-substrate/server/substrate/components/__init__.py` | Import pattern for new components. |
| `/home/musicofhel/node-graph-substrate/server/substrate/sdk.py` | Component base class, NodeKind enum. |
| `/home/musicofhel/node-graph-substrate/server/substrate/streamhub.py` | stream_event message format (~line 73) includes `"stream": stream` field. |
| `/home/musicofhel/link-forge/src/processor/index.ts` | processOne() lines 76-408. All 10 publish hook points. |
| `/home/musicofhel/link-forge/src/config/index.ts` | Config structure for adding publisher.redisUrl. |
| `/home/musicofhel/link-forge/src/index.ts` | Startup/shutdown for wiring publisher init/close. |
| `/home/musicofhel/link-forge/src/autorel/sweep.ts` | Sweep completion point for autorel publish. |
| `/home/musicofhel/topo-confidence/pipeline/autopilot.py` | Daemon startup/shutdown for publisher wiring. |
| `/home/musicofhel/topo-confidence/pipeline/nodes.py` | run_experiment and parse_results nodes for experiment publish. |
| `/home/musicofhel/topo-confidence/pipeline/generate_recompute.py` | Script generation completion for publish. |
| `/home/musicofhel/topo-confidence/research-graph/promote_brief.py` | Triage promotion for publish. |
| `/home/musicofhel/topo-confidence/research-graph/promote_result.py` | Result promotion for publish. |

---

## Reference: All Files Created/Modified

### NEW FILES (13):
```
/home/musicofhel/node-graph-substrate/frontend/src/components/canvas/TabBar.tsx
/home/musicofhel/node-graph-substrate/frontend/src/components/nodes/LfStageCard.tsx
/home/musicofhel/node-graph-substrate/frontend/src/components/nodes/LfCoordinatorNode.tsx
/home/musicofhel/node-graph-substrate/frontend/src/components/nodes/LfStatsNode.tsx
/home/musicofhel/node-graph-substrate/frontend/src/components/nodes/LfAutoRelNode.tsx
/home/musicofhel/node-graph-substrate/frontend/src/components/linkforge/PaperPool.tsx
/home/musicofhel/node-graph-substrate/frontend/src/components/linkforge/PaperCard.tsx
/home/musicofhel/node-graph-substrate/frontend/src/components/linkforge/PaperDetail.tsx
/home/musicofhel/node-graph-substrate/server/substrate/components/lf_coordinator.py
/home/musicofhel/node-graph-substrate/server/substrate/components/lf_stats.py
/home/musicofhel/node-graph-substrate/server/substrate/components/lf_autorel.py
/home/musicofhel/node-graph-substrate/server/substrate/components/research_coordinator.py
/home/musicofhel/node-graph-substrate/server/substrate/linkforge_history.py
/home/musicofhel/link-forge/src/publisher/redis.ts
/home/musicofhel/topo-confidence/pipeline/publisher.py
```

### MODIFIED FILES (16):
```
/home/musicofhel/node-graph-substrate/server/substrate/crud.py
/home/musicofhel/node-graph-substrate/server/substrate/main.py
/home/musicofhel/node-graph-substrate/server/substrate/components/__init__.py
/home/musicofhel/node-graph-substrate/frontend/src/App.tsx
/home/musicofhel/node-graph-substrate/frontend/src/lib/store/canvas-store.ts
/home/musicofhel/node-graph-substrate/frontend/src/lib/ws/client.ts
/home/musicofhel/node-graph-substrate/frontend/src/lib/nodes/registry.ts
/home/musicofhel/node-graph-substrate/frontend/src/components/canvas/node-types.ts
/home/musicofhel/link-forge/package.json
/home/musicofhel/link-forge/src/config/index.ts
/home/musicofhel/link-forge/src/processor/index.ts
/home/musicofhel/link-forge/src/autorel/sweep.ts
/home/musicofhel/link-forge/src/index.ts
/home/musicofhel/topo-confidence/pipeline/autopilot.py
/home/musicofhel/topo-confidence/pipeline/generate_recompute.py
/home/musicofhel/topo-confidence/pipeline/nodes.py
/home/musicofhel/topo-confidence/research-graph/promote_brief.py
/home/musicofhel/topo-confidence/research-graph/promote_result.py
```

---

## Git State

```
46179ce Add E2E screenshot gallery and fix idempotent graph creation
ad6a035 Add README with 12 D2-rendered architecture diagrams
bf781a3 Fix 21 audit findings
5305cfc Fix default canvas creation, prompt sync, op validation
f2f3f49 Fix dynamic node config source, add subscriber compute guard
390e061 Fix 15 bugs from E2E audit
6833573 Slice 5: ExplainWaterfall + NodePalette + default 7-node canvas
46717be Slice 4: topo-confidence adapter daemon
076bda1 Slice 3: subscriber path + StreamHub + R3F
d7a4001 Slice 2: computed node path
```

No uncommitted changes. All pushed to GitHub main.

---

## Start Here

Wave 1 (tabs) is the simplest and unblocks everything. `docker compose up` to test tab switching. Then proceed through Waves 2-7 in order.
