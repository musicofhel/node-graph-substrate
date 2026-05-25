# Spec: Link-Forge Pipeline — v2 (Revised)

**Date**: 2026-05-10
**Status (2026-05-13)**: Waves 1,3,4,5,7 complete in-repo. Wave 2 (link-forge publisher) and Wave 6 (topo-confidence research publisher) are in external repos.
**Supersedes**: `SPEC-tabs-and-linkforge.md` Phases 3-4, `HANDOFF-tabs-linkforge.md` Phases 3-4

Phase 1 (Tabs) in `SPEC-tabs-and-linkforge.md` is **unchanged and still authoritative**.
Phase 2 (Link-forge publisher) is **replaced by Wave 2 below** (10 streams + Redis hashes, was 6 streams).

---

## What Changed from v1

| Area | v1 (old) | v2 (this doc) |
|------|----------|---------------|
| Waterfall stages | 6 | 10 (added embedded, chunked, auto_related, url_discovered) |
| Node types for stages | 1 (`lf_stage`) | 1 (`lf_stage`) — same, 10 internal renderers |
| Pool below waterfall | None | Hybrid card grid + detail panel |
| Historical data | None | Redis hashes + query endpoint |
| Cross-system visibility | None | Topo-confidence research lifecycle in pool detail |
| AutoRel sweep | None | Small status panel widget |
| Redis streams total | 6 linkforge | 10 linkforge + 5 topoconf:research + 1 autorel = 16 new |
| Backend components | 2 (coordinator, stats) | 4 (+autorel, +research_coordinator) |
| Publisher in link-forge | 6 XADD calls | 10 XADD + 10 HSET calls + hash TTL |
| Publisher in topo-conf | None | 5 XADD + HSET calls (new) |

---

## Architecture (Revised)

```
                    +-------------------------------+
                    |   Browser (localhost:5173)     |
                    |                               |
                    |  +--- Tab Bar ---------------+|
                    |  | [Topo Scoring] [LF] [+]   ||
                    |  +---------------------------+|
                    |  +--- React Flow Canvas -----+|
                    |  | WATERFALL: 10-stage cols   ||
                    |  | Coordinator / Stats / AR   ||
                    |  +---------------------------+|
                    |  +--- Pool ------------------+|
                    |  | Card Grid  | Detail Panel  ||
                    |  | (history   | (pipeline +   ||
                    |  |  + live)   |  experiments)  ||
                    |  +---------------------------+|
                    +---------------+---------------+
                                    | WS + REST
                    +---------------v---------------+
                    |   Substrate Server (8080)      |
                    |   StreamHub: 23 stream readers  |
                    |   REST: /api/linkforge/history  |
                    +---------------+---------------+
                                    | XREAD + HGETALL
                    +---------------v---------------+
                    |   Redis (6381)                  |
                    |   topoconf:scoring:*      (7)   |
                    |   linkforge:*            (10)   |
                    |   topoconf:research:*    (5)    |
                    |   linkforge:autorel:*    (1)    |
                    |   linkforge:paper:{qid}  (hash) |
                    |   topoconf:research:{id} (hash) |
                    +-------+---------------+--------+
                            |               |
              XADD ---------+               +--------- XADD
                            |                         |
              +-------------v--+     +----------------v---+
              | topo-confidence|     |   link-forge        |
              | autopilot      |     |   processor          |
              | (research pub) |     |   (pipeline pub)     |
              +----------------+     +---------------------+
```

**Key invariant**: The substrate server never imports link-forge or topo-confidence. All communication is Redis Streams + Redis hashes.

---

## Complete Redis Stream Inventory

### Link-Forge Pipeline (10 streams, publisher in link-forge)

All streams: `MAXLEN ~ 10000`, JSON in `data` field, plain `XREAD`.

| Stream | Payload |
|--------|---------|
| `linkforge:ingested` | `{queue_id, url, source_type, source, discord_author, timestamp}` |
| `linkforge:extracted` | `{queue_id, url, title, content_length, domain, file_type, success}` |
| `linkforge:categorized` | `{queue_id, url, title, category, tags[], forge_score, content_type, key_concepts[], authors[], difficulty, quality, summary}` |
| `linkforge:embedded` | `{queue_id, url, title, embedding_dim, model_name, success}` |
| `linkforge:stored` | `{queue_id, url, title, category, chunk_count, relationship_count, tag_count, tool_count, concept_count, author_count}` |
| `linkforge:chunked` | `{queue_id, url, title, chunk_count, chunk_size, coverage_pct, embeddings_generated}` |
| `linkforge:auto_related` | `{queue_id, url, title, match_count, best_match_title, best_match_score, avg_confidence}` |
| `linkforge:research_bridged` | `{queue_id, url, title, arxiv_id, relevant, relevance_note, triage_status}` |
| `linkforge:url_discovered` | `{queue_id, url, title, urls_found, urls_enqueued, urls_existing}` |
| `linkforge:completed` | `{queue_id, url, title, forge_score, category, processing_time_ms, success, error?}` |

### Topo-Confidence Research (5 streams, publisher in topo-confidence autopilot)

| Stream | Payload |
|--------|---------|
| `topoconf:research:triaged` | `{arxiv_id, brief_path, fe_count, hypothesis_count, status, triaged_at}` |
| `topoconf:research:script_generated` | `{fe_id, arxiv_id, script_path, fe_description}` |
| `topoconf:research:experiment_started` | `{fe_id, arxiv_id, started_at}` |
| `topoconf:research:experiment_completed` | `{fe_id, arxiv_id, result_path, auroc, verdict, duration_seconds, success}` |
| `topoconf:research:promoted` | `{fe_id, arxiv_id, findings_updated[], experiment_log_id, new_claims_count}` |

### Link-Forge AutoRel (1 stream, publisher in link-forge autorel)

| Stream | Payload |
|--------|---------|
| `linkforge:autorel:sweep_completed` | `{sweep_id, duration_ms, total_edges_created, total_edges_pruned, phases: {co_access, temporal, transitive, topology, decay}, completed_at}` |

### Topo-Confidence Scoring (7 streams, existing — unchanged)

| Stream | Payload |
|--------|---------|
| `topoconf:control` | `{command, prompt, run_id}` |
| `topoconf:scoring:hidden_state_cloud` | `{prompt_id, umap_3d, clusters, bridge_idx, bridge_silhouette}` |
| `topoconf:scoring:persistence_computed` | `{prompt_id, H0, H1, H2}` |
| `topoconf:scoring:features_computed` | `{prompt_id, features}` |
| `topoconf:scoring:confidence_scored` | `{prompt_id, confidence, mode}` |
| `topoconf:scoring:bridge_health` | `{prompt_id, healthy, bridge_at_pos0, silhouette_by_layer, ...}` |
| `topoconf:scoring:explain_result` | `{prompt_id, confidence, features, top_contributor}` |

**Total: 23 streams** (StreamHub runs 1 asyncio.Task per active stream)

---

## Redis Hashes (Paper History)

### Link-Forge Paper Hash

Key: `linkforge:paper:{queue_id}`
TTL: 604800 (7 days)

Written incrementally by the link-forge publisher as each stage completes. Fields accumulate over the pipeline:

```
url, source_type, source, discord_author          # after ingested
title, domain, content_length, file_type          # after extracted
category, tags, forge_score, content_type,        # after categorized
  concepts, authors, key_takeaways, difficulty,
  summary, quality, functional_roles
embedding_dim                                     # after embedded
chunk_count, relationship_count, tag_count,       # after stored
  tool_count, concept_count, author_count
chunk_size, coverage_pct                          # after chunked
match_count, best_match_title, best_match_score   # after auto_related
arxiv_id, research_relevant, relevance_note       # after research_bridged
urls_found, urls_enqueued, urls_existing          # after url_discovered
processing_time_ms, success, error, completed_at  # after completed
```

### Topo-Confidence Research Hash

Key: `topoconf:research:{arxiv_id}`
TTL: 2592000 (30 days — experiments take longer)

Written by the topo-confidence autopilot publisher:

```
status, brief_path, fe_count,                     # after triaged
  hypothesis_count, triaged_at
fe_{id}_script, fe_{id}_desc                      # after script_generated
fe_{id}_status, fe_{id}_started_at                # after experiment_started
fe_{id}_auroc, fe_{id}_verdict,                   # after experiment_completed
  fe_{id}_duration_s
fe_{id}_findings_updated,                         # after promoted
  fe_{id}_experiment_log_id
```

---

## Wave 2 (Revised): Link-Forge Publisher

**Time estimate**: ~2.5h
**Repo**: `~/link-forge` (NOT node-graph-substrate)

### W2-1. Dependencies

**File:** `~/link-forge/package.json`

Add: `"ioredis": "^5.4.0"`

### W2-2. Publisher Module

**New file:** `~/link-forge/src/publisher/redis.ts`

```typescript
import Redis from "ioredis";

let client: Redis | null = null;

export function initRedisPublisher(): void {
  const url = process.env.PUBLISHER_REDIS_URL;
  if (!url) return;
  client = new Redis(url, { maxRetriesPerRequest: 0, lazyConnect: true });
  client.connect().catch(() => {});
}

export async function publish(stream: string, data: Record<string, unknown>): Promise<void> {
  if (!client) return;
  try {
    await client.xadd(stream, "MAXLEN", "~", "10000", "*", "data", JSON.stringify(data));
  } catch {}
}

export async function setPaperField(
  queueId: string,
  fields: Record<string, string>
): Promise<void> {
  if (!client) return;
  try {
    const key = `linkforge:paper:${queueId}`;
    const args = Object.entries(fields).flat();
    await client.hset(key, ...args);
    await client.expire(key, 604800); // 7 days
  } catch {}
}

export async function closeRedisPublisher(): Promise<void> {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
  }
}
```

### W2-3. Configuration

**File:** `~/link-forge/src/config/index.ts`

Add to config:
```typescript
publisher: {
  redisUrl: process.env.PUBLISHER_REDIS_URL || "",
}
```

### W2-4. Publish Points in processOne()

**File:** `~/link-forge/src/processor/index.ts`

10 publish points + 10 hash writes. All fire-and-forget.

```
Location   | Stage           | Stream                    | Hash fields
-----------|-----------------|---------------------------|---------------------------
~line 82   | After dequeue   | linkforge:ingested        | url, source_type, source, discord_author
~line 116  | After scrape    | linkforge:extracted       | title, domain, content_length, file_type
~line 142  | After categorize| linkforge:categorized     | category, tags, forge_score, content_type, concepts, authors, difficulty, quality, summary, functional_roles
~line 165  | After embedding | linkforge:embedded        | embedding_dim
~line 258  | After Neo4j     | linkforge:stored          | chunk_count, relationship_count, tag_count, tool_count, concept_count, author_count
~line 275  | After chunking  | linkforge:chunked         | chunk_size, coverage_pct
~line 290  | After similarity| linkforge:auto_related    | match_count, best_match_title, best_match_score, avg_confidence
~line 302  | After research  | linkforge:research_bridged| arxiv_id, research_relevant, relevance_note
~line 340  | After URL disc. | linkforge:url_discovered  | urls_found, urls_enqueued, urls_existing
~line 387  | After complete  | linkforge:completed       | processing_time_ms, success, completed_at
~line 407  | On failure      | linkforge:completed       | success=false, error, completed_at
```

### W2-5. Startup/Shutdown Wiring

**File:** `~/link-forge/src/index.ts`

```typescript
import { initRedisPublisher, closeRedisPublisher } from "./publisher/redis.js";

// In startup:
initRedisPublisher();

// In shutdown:
await closeRedisPublisher();
```

### W2-6. AutoRel Sweep Publisher

**File:** `~/link-forge/src/autorel/sweep.ts`

After sweep completes, add one publish call:
```typescript
await publish("linkforge:autorel:sweep_completed", {
  sweep_id: crypto.randomUUID(),
  duration_ms: elapsed,
  total_edges_created: totals.created,
  total_edges_pruned: totals.pruned,
  phases: {
    co_access: { edges_created: ..., edges_updated: ... },
    temporal:  { edges_created: ..., sessions_analyzed: ... },
    transitive: { edges_inferred: ... },
    topology:  { edges_created: ..., pairs_evaluated: ... },
    decay:     { edges_decayed: ..., edges_pruned: ... },
  },
  completed_at: new Date().toISOString(),
});
```

All publishes are fire-and-forget. Link-forge works identically when `PUBLISHER_REDIS_URL` is empty.

---

## Wave 3 (Revised): Backend Components

**Time estimate**: ~30m
**Repo**: `~/node-graph-substrate`

4 new files in `server/substrate/components/`:

### W3-1. lf_coordinator.py

Subscribes to all 10 linkforge pipeline streams:

```python
@registry.register
class LfCoordinatorComponent(Component):
    type_id = "lf_coordinator"
    kind = NodeKind.SUBSCRIBER
    inputs = []
    outputs = []
    subscribed_streams = [
        "linkforge:ingested", "linkforge:extracted",
        "linkforge:categorized", "linkforge:embedded",
        "linkforge:stored", "linkforge:chunked",
        "linkforge:auto_related", "linkforge:research_bridged",
        "linkforge:url_discovered", "linkforge:completed",
    ]
```

### W3-2. lf_stats.py

Subscribes to `linkforge:completed` only. Frontend accumulates stats.

```python
@registry.register
class LfStatsComponent(Component):
    type_id = "lf_stats"
    kind = NodeKind.SUBSCRIBER
    inputs = []
    outputs = []
    subscribed_streams = ["linkforge:completed"]
```

### W3-3. lf_autorel.py (NEW)

Subscribes to autorel sweep events:

```python
@registry.register
class LfAutoRelComponent(Component):
    type_id = "lf_autorel"
    kind = NodeKind.SUBSCRIBER
    inputs = []
    outputs = []
    subscribed_streams = ["linkforge:autorel:sweep_completed"]
```

### W3-4. research_coordinator.py (NEW)

Subscribes to topo-confidence research lifecycle streams:

```python
@registry.register
class ResearchCoordinatorComponent(Component):
    type_id = "research_coordinator"
    kind = NodeKind.SUBSCRIBER
    inputs = []
    outputs = []
    subscribed_streams = [
        "topoconf:research:triaged",
        "topoconf:research:script_generated",
        "topoconf:research:experiment_started",
        "topoconf:research:experiment_completed",
        "topoconf:research:promoted",
    ]
```

### W3-5. History Query Module (NEW)

**New file:** `server/substrate/linkforge_history.py`

```python
async def get_paper_history(
    redis, limit: int = 50, offset: int = 0,
    category: str | None = None,
    research_only: bool = False,
) -> list[dict]:
    """SCAN for linkforge:paper:* keys, HGETALL each,
    sort by completed_at desc, filter, paginate."""
    ...

async def get_paper_detail(redis, queue_id: str) -> dict | None:
    """HGETALL linkforge:paper:{queue_id}"""
    ...

async def get_research_lifecycle(redis, arxiv_id: str) -> dict | None:
    """HGETALL topoconf:research:{arxiv_id}"""
    ...
```

### W3-6. History Routes

**File:** `server/substrate/main.py`

```python
@app.get("/api/linkforge/history")
async def linkforge_history(
    limit: int = 50, offset: int = 0,
    category: str | None = None,
    research_only: bool = False,
):
    return await get_paper_history(redis, limit, offset, category, research_only)

@app.get("/api/linkforge/paper/{queue_id}")
async def linkforge_paper(queue_id: str):
    paper = await get_paper_detail(redis, queue_id)
    if not paper:
        raise HTTPException(404)
    return paper

@app.get("/api/linkforge/paper/{queue_id}/research")
async def linkforge_paper_research(queue_id: str):
    paper = await get_paper_detail(redis, queue_id)
    if not paper or not paper.get("arxiv_id"):
        raise HTTPException(404, "No research bridge for this paper")
    return await get_research_lifecycle(redis, paper["arxiv_id"])
```

### W3-7. Component Registry Import

**File:** `server/substrate/components/__init__.py`

Add imports for all 4 new components.

---

## Wave 4 (Revised): Frontend Waterfall — 10 Stages

**Time estimate**: ~6h
**Repo**: `~/node-graph-substrate`

### W4-1. WS Client Modification

**File:** `frontend/src/lib/ws/client.ts`

In the `onmessage` handler, BEFORE the RAF coalescing path, add bypass for linkforge AND research streams:

```typescript
const stream = msg.stream as string | undefined;
if (stream?.startsWith("linkforge:") || stream?.startsWith("topoconf:research:")) {
  this.handlers.forEach((h) => h(msg));
  return;
}
```

**Why**: RAF coalescing shallow-merges payloads by node_id. All linkforge events route to the coordinator's single node_id — they'd overwrite each other. Plus the handler needs the `stream` field to know which stage completed.

### W4-2. App.tsx Coordinator Logic

**File:** `frontend/src/App.tsx`

Add refs for paper tracking:

```typescript
interface PaperTracker {
  queueId: string;
  columnIndex: number;
  stageNodes: Map<string, string>; // stage -> nodeId
  url: string;
  title?: string;
}

const paperTrackerRef = useRef<Map<string, PaperTracker>>(new Map());
const columnCounterRef = useRef(0);
```

In `handleMessage`, intercept linkforge stream events:

```typescript
if (msg.type === "stream_event" && (msg.stream as string)?.startsWith("linkforge:")) {
  handleLinkforgeEvent(msg.stream, msg.payload);
  return;
}
```

`handleLinkforgeEvent` does:

1. Extract `queue_id` from payload — correlates events to the same paper
2. If new queue_id: create `lf_pipeline_group` parent container at x=0, shift ALL existing group nodes right by `GROUP_SPACING` (280px)
3. Determine stage name from stream (e.g., `linkforge:categorized` -> `categorized`)
4. Create `lf_stage` child node inside the group at vertical position:
   - x relative to group: `GROUP_PAD_X` (16px)
   - y relative to group: `GROUP_PAD_TOP + stageIdx * STAGE_HEIGHT` (40 + idx * 62)
5. If previous stage exists for this paper: create edge (`source-bottom` → `target-top`)
6. If paper count > 30: remove oldest (rightmost) paper's group + child nodes + edges

Layout constants (as implemented):
```
STAGE_HEIGHT   = 62       # vertical spacing between stages
GROUP_PAD_X    = 16       # left padding inside group
GROUP_PAD_TOP  = 40       # top padding inside group (room for title)
GROUP_WIDTH    = 250      # group container width
GROUP_HEIGHT   = GROUP_PAD_TOP + 10 * STAGE_HEIGHT + 16  = 676
GROUP_SPACING  = 280      # horizontal gap between paper columns
```

Each paper is wrapped in an `lf_pipeline_group` parent node. Stage cards are children with `parentId` and `extent: "parent"`. New papers always appear at x=0; existing papers shift right. A `PipelineTimeline` horizontal slider (visible when 2+ groups exist) maps slider position to viewport x for navigating older papers.

### W4-3. LfStageCard Component

**New file:** `frontend/src/components/nodes/LfStageCard.tsx`

ONE component with 10 internal renderers based on `data._stage`. Each uses `BaseNodeShell` with stage-appropriate category.

Card width: ~210px. Height: 70-140px depending on stage content.

#### Stage 1: ingested (amber border, `input` category)

```
+---------------------------+
| * INGESTED          0.2s  |
| arxiv.org/abs/2401...     |
| discord . wobblychair     |
| @musicofhel               |
+---------------------------+
```

Fields: url (truncated), source_type badge, source channel, discord_author

#### Stage 2: extracted (blue border, `extraction` category)

```
+---------------------------+
| * EXTRACTED         1.4s  |
| "Topological Data..."     |
| arxiv.org . 24.3 KB       |
| check success             |
+---------------------------+
```

Fields: title (truncated), domain, content_length (human-readable), success/fail, file_type if not web

#### Stage 3: categorized (blue border, `extraction` category)

```
+---------------------------+
| * CATEGORIZED       3.1s  |
| TDA . forge: 0.91 [====]  |
| content: research_paper   |
| concepts: betti, filtr..  |
| tags: topology, ph, ...   |
| difficulty: advanced      |
+---------------------------+
```

Fields: category, forge_score bar (color-coded), content_type, key_concepts (chips), tags (chips), difficulty badge

Forge score color tiers: >=0.65 green, >=0.45 yellow, >=0.25 orange, <0.25 red

**Richest card** — most fields from Claude categorization.

#### Stage 4: embedded (purple border, `topology` category)

```
+---------------------------+
| * EMBEDDED          0.3s  |
| 384-dim MiniLM . check    |
+---------------------------+
```

Fields: embedding_dim, model_name, success indicator

**Smallest card** — just confirmation that embedding was generated.

#### Stage 5: stored (cyan border, `topology` category)

```
+---------------------------+
| * STORED            0.8s  |
| TDA . 8 relationships     |
| 3 tags . 2 tools          |
| 4 concepts . 1 author     |
+---------------------------+
```

Fields: category, relationship_count, tag/tool/concept/author counts

#### Stage 6: chunked (cyan border, `topology` category)

```
+---------------------------+
| * CHUNKED           1.2s  |
| 12 chunks . 500ch each    |
| coverage: 94%             |
| 12 embeddings generated   |
+---------------------------+
```

Fields: chunk_count, chunk_size, coverage_pct, embeddings_generated

#### Stage 7: auto_related (emerald border, `scoring` category)

```
+---------------------------+
| * AUTO-RELATED      0.5s  |
| 3 similar papers found    |
| best: 0.94 "Persistent."  |
| conf: [===_] 0.87 avg     |
+---------------------------+
```

OR when no matches:
```
+---------------------------+
| * AUTO-RELATED      0.5s  |
| 0 similar papers found    |
+---------------------------+
```

Fields: match_count, best_match (title+score), avg_confidence

#### Stage 8: research_bridged (emerald border, `scoring` category)

```
+---------------------------+
| * RESEARCH-BRIDGED  2.1s  |
| arxiv: 2401.12345         |
| verdict: RELEVANT (green) |
| "Extends H0 persistence   |
|  entropy to transformers"  |
| status: pending_triage     |
+---------------------------+
```

OR if not research:
```
+---------------------------+
| * RESEARCH-BRIDGED        |
| -- skipped (not research) |
+---------------------------+
```

Fields: arxiv_id, relevant (green/red verdict badge), relevance_note, triage_status

#### Stage 9: url_discovered (blue border, `extraction` category)

```
+---------------------------+
| * URL-DISCOVERED    0.1s  |
| 3 URLs extracted          |
| 2 new -> enqueued         |
| 1 already in graph        |
+---------------------------+
```

OR when no URLs:
```
+---------------------------+
| * URL-DISCOVERED          |
| -- no links found         |
+---------------------------+
```

Fields: urls_found, urls_enqueued, urls_existing

#### Stage 10: completed (emerald border for success, red for fail)

```
+---------------------------+
| * COMPLETED        12.4s  |
| forge: 0.91 [=========]  |
| TDA . research_paper      |
| total: 12.4s              |
+---------------------------+
```

OR on failure:
```
+---------------------------+
| X FAILED            3.2s  |
| Error: scrape timeout     |
+---------------------------+
```

Fields: forge_score bar, category, processing_time, success/fail, error message

All cards: `memo()`'d, each uses `useNodesData(id)`.

### W4-4. LfCoordinatorNode

**New file:** `frontend/src/components/nodes/LfCoordinatorNode.tsx`

```
+-------------------------------+
| * PIPELINE COORDINATOR        |
| watching 10 streams (pulse)   |
| papers tracked: 12            |
+-------------------------------+
```

Minimal card. Green pulse dot when receiving events. Sits in a corner. Its job is the StreamHub subscription anchor.

### W4-5. LfStatsNode

**New file:** `frontend/src/components/nodes/LfStatsNode.tsx`

Accumulates `completed` events in a ref:

```
+-------------------------------+
| PIPELINE STATS                |
| rate:     4.2 items/hr        |
| success:  47 (94%)            |
| failed:   3                   |
| avg time: 8.2s                |
| latest:   "Topological..."   |
+-------------------------------+
```

### W4-6. LfAutoRelNode (NEW)

**New file:** `frontend/src/components/nodes/LfAutoRelNode.tsx`

Small status widget for batch relationship discovery:

```
+-------------------------------+
| AUTOREL SWEEP                 |
| Last: 3m ago . 4.2s           |
|                               |
| co-access:    +4 edges        |
| temporal:     +2 edges        |
| transitive:   +1 inferred     |
| topology:     +5 edges        |
| decay:        -3 pruned       |
|                               |
| net: +9 edges this sweep      |
+-------------------------------+
```

Updates live from `linkforge:autorel:sweep_completed` stream. Shows "no recent sweep" if >10 minutes since last event.

### W4-7. Registry + Type Map + Default Graph

**File:** `frontend/src/lib/nodes/registry.ts`

Add entries: `lf_stage`, `lf_coordinator`, `lf_stats`, `lf_autorel`, `research_coordinator`

**File:** `frontend/src/components/canvas/node-types.ts`

Import and register all 5 new components.

**File:** `frontend/src/App.tsx` — default graph seeding

When creating "Link-Forge Pipeline" tab, seed with:
- `coordinator-1` (lf_coordinator) — top-left area
- `stats-1` (lf_stats) — below coordinator
- `autorel-1` (lf_autorel) — next to stats
- `research-coordinator-1` (research_coordinator) — corner, hidden-ish

No edges between static nodes. Dynamic stage cards and edges appear from events.

---

## Wave 5 (NEW): Pool + Detail Panel + History

**Time estimate**: ~8h
**Repo**: `~/node-graph-substrate`

### W5-1. Layout — Waterfall + Pool Split

The link-forge tab has two zones stacked vertically:

```
+------------------------------------------------------+
|  WATERFALL ZONE (React Flow canvas)                   |
|  Height: ~55% of viewport (resizable drag handle)    |
|  Contains: stage card columns + static nodes          |
+======================================================+
|  POOL ZONE (HTML, not React Flow)                     |
|  Height: ~45% of viewport                            |
|  Split: 60% card grid | 40% detail panel             |
+------------------------------------------------------+
```

The split between waterfall and pool uses a draggable resize handle. The pool is plain HTML/CSS, NOT React Flow — it's a scrollable card grid with a side detail panel.

### W5-2. PaperPool Component

**New file:** `frontend/src/components/linkforge/PaperPool.tsx`

Top-level pool container. Renders filter bar, card grid, and detail panel.

```typescript
interface PaperPoolProps {
  papers: PaperSummary[];
  livePaperIds: Set<string>;  // queue_ids processed this session
  selectedId: string | null;
  onSelect: (queueId: string) => void;
}

interface PaperSummary {
  queue_id: string;
  url: string;
  title: string;
  category: string;
  forge_score: number;
  content_type: string;
  processing_time_ms: number;
  success: boolean;
  error?: string;
  completed_at: string;
  research_relevant?: boolean;
  arxiv_id?: string;
}
```

Layout:

```
+---filter bar (full width)---------------------------+
| [Category: All v] [Sort: Recent v] [Search:_______] |
| [x Research only]                                    |
+----card grid (60%)----------+----detail panel (40%)--+
| +--------+ +--------+      |                        |
| | Card 1 | | Card 2 |      |  (select a paper)      |
| | NEW    | | NEW    |      |                        |
| +--------+ +--------+      |                        |
| +--------+ +--------+      |                        |
| | Card 3 | | Card 4 |      |                        |
| +--------+ +--------+      |                        |
|                             |                        |
| [Load more...]              |                        |
+-----------------------------+------------------------+
```

Filter options:
- Category dropdown (populated from distinct categories in data)
- Sort: Recent (default), Forge Score (desc), Processing Time (desc), Category (grouped)
- Text search: matches title, tags, concepts
- Research only toggle: filters to `research_relevant === true`

### W5-3. PaperCard Component

**New file:** `frontend/src/components/linkforge/PaperCard.tsx`

Compact card (~180x120px):

```
+--------------------+
| NEW (star badge)   |   <- "NEW" badge for papers processed
| "Title trunca..."  |      this session, fades after 5 min
| .91 [=========_]   |   <- forge_score color bar
| [TDA] research     |   <- category badge + content_type
| 12.4s . check      |   <- processing time + success
+--------------------+
```

Failed variant:
```
+--------------------+
| X FAILED           |
| "Some URL..."      |
| scrape timeout     |
| 3.2s               |
+--------------------+
```

States:
- Default: dark card with subtle border
- Hover: slight lift + lighter border
- Selected: highlighted border (matching category color) + shadow
- NEW: star badge in top-left, auto-removes after 5 minutes

### W5-4. PaperDetail Component

**New file:** `frontend/src/components/linkforge/PaperDetail.tsx`

Fetches full paper data on selection: `GET /api/linkforge/paper/{queue_id}`

Two sections that scroll vertically:

**Section 1: Link-Forge Pipeline** (always shown)

Vertical timeline of 10 stages with status indicators:

```
"Topological Data Analysis for Transformers"
arxiv.org/abs/2401.12345

--- Link-Forge Pipeline -----------------------
check  ingested       0.2s   discord/wobblychair
check  extracted      1.4s   24.3 KB
check  categorized    3.1s   TDA, score: 0.91
check  embedded       0.3s   384-dim
check  stored         0.8s   8 rels, 4 concepts
check  chunked        1.2s   12 chunks, 94%
check  auto_related   0.5s   3 matches (best: 0.94)
check  research_bridged 2.1s RELEVANT
check  url_discovered 0.1s   2 enqueued
check  completed     12.4s   success
```

Each row is expandable — click to show full stage data (all fields from that stage's stream event).

**Section 2: Research Lifecycle** (shown only if `research_relevant`)

Fetches: `GET /api/linkforge/paper/{queue_id}/research`

```
--- Research Lifecycle -------------------------
arxiv: 2401.12345
Status: graphed

+- TRIAGE ---------------------------------+
| check  Brief generated                    |
|   3 FutureExperiments proposed            |
|   2 hypotheses added                      |
|   Brief: triage-2026-05-10-2401...        |
+-------------------------------------------+

+- FE-447: H0 entropy scaling --------+
| check  Script generated              |
| check  Experiment completed (2.1h)   |
|   AUROC: 0.79 (HIT >= 0.75)          |
| check  Findings promoted             |
|   F-7 strength: 0.83 -> 0.87         |
|   EXP-042 logged                     |
+--------------------------------------+

+- FE-448: Bridge sil per-layer -------+
| check  Script generated              |
| (spin) Experiment running (47min)    |
+--------------------------------------+

+- FE-449: Cross-model transfer -------+
| (circle) Pending script generation   |
+--------------------------------------+
```

Each FE block is collapsible. Status indicators:
- `check` = completed
- `(spin)` = in progress (animated spinner)
- `(circle)` = pending (hollow circle)
- `X` = failed (red)

Live updates: when `topoconf:research:*` stream events arrive matching this paper's arxiv_id, the detail panel updates in real-time without re-fetching.

### W5-5. Pool State + Data Flow

**In App.tsx** (or a dedicated store):

```typescript
// Pool state
const [poolPapers, setPoolPapers] = useState<PaperSummary[]>([]);
const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
const [poolFilters, setPoolFilters] = useState<PoolFilters>(DEFAULT_FILTERS);
const livePaperIdsRef = useRef<Set<string>>(new Set());
```

**On link-forge tab open:**
1. Fetch `GET /api/linkforge/history?limit=50`
2. Populate `poolPapers`
3. All fetched papers have `is_new = false`

**On `linkforge:completed` stream event:**
1. Extract `queue_id` from payload
2. Fetch `GET /api/linkforge/paper/{queue_id}` for full data
3. Prepend to `poolPapers` (newest first in grid, left-to-right top-to-bottom)
4. Add `queue_id` to `livePaperIdsRef` (for "NEW" badge)
5. After 5 minutes, remove from `livePaperIdsRef`

**On paper card click:**
1. Set `selectedPaperId`
2. Detail panel fetches full paper data + research lifecycle (if applicable)

**On research stream event (topoconf:research:*):**
1. If detail panel is open AND arxiv_id matches: update detail in-place
2. No re-fetch needed — apply the stream event data directly

### W5-6. Pagination

The "Load more" button fetches the next page:
`GET /api/linkforge/history?limit=50&offset={current_count}`

Appends to `poolPapers`. No infinite scroll — explicit button click.

---

## Wave 6 (NEW): Topo-Confidence Research Publisher

**Time estimate**: ~2h
**Repo**: `~/topo-confidence`

Same opt-in pattern as link-forge: `PUBLISHER_REDIS_URL` env var, fire-and-forget, empty = no Redis dependency.

### W6-1. Publisher Module

**New file:** `~/topo-confidence/pipeline/publisher.py`

```python
import os
import json
import redis

_client: redis.Redis | None = None

def init_redis_publisher() -> None:
    url = os.environ.get("PUBLISHER_REDIS_URL", "")
    if not url:
        return
    global _client
    _client = redis.from_url(url)

def publish(stream: str, data: dict) -> None:
    if not _client:
        return
    try:
        _client.xadd(stream, {"data": json.dumps(data)}, maxlen=10000, approximate=True)
    except Exception:
        pass

def set_research_field(arxiv_id: str, fields: dict[str, str]) -> None:
    if not _client:
        return
    try:
        key = f"topoconf:research:{arxiv_id}"
        _client.hset(key, mapping=fields)
        _client.expire(key, 2592000)  # 30 days
    except Exception:
        pass

def close_redis_publisher() -> None:
    global _client
    if _client:
        _client.close()
        _client = None
```

### W6-2. Publish Points

5 publish points across the autopilot pipeline:

**1. After triage** — in `promote_brief.py` (after successful promotion):

```python
publish("topoconf:research:triaged", {
    "arxiv_id": arxiv_id,
    "brief_path": brief_path,
    "fe_count": len(future_experiments),
    "hypothesis_count": len(new_hypotheses),
    "status": "graphed",
    "triaged_at": datetime.utcnow().isoformat(),
})
set_research_field(arxiv_id, {
    "status": "graphed",
    "brief_path": brief_path,
    "fe_count": str(len(future_experiments)),
    "hypothesis_count": str(len(new_hypotheses)),
    "triaged_at": datetime.utcnow().isoformat(),
})
```

**2. After script generation** — in `generate_recompute.py`:

```python
publish("topoconf:research:script_generated", {
    "fe_id": fe_id,
    "arxiv_id": arxiv_id,
    "script_path": script_path,
    "fe_description": fe_description,
})
set_research_field(arxiv_id, {
    f"fe_{fe_id}_script": "true",
    f"fe_{fe_id}_desc": fe_description,
})
```

**3. Before experiment starts** — in `pipeline/nodes.py` (run_experiment node):

```python
publish("topoconf:research:experiment_started", {
    "fe_id": fe_id,
    "arxiv_id": arxiv_id,
    "started_at": datetime.utcnow().isoformat(),
})
set_research_field(arxiv_id, {
    f"fe_{fe_id}_status": "running",
    f"fe_{fe_id}_started_at": datetime.utcnow().isoformat(),
})
```

**4. After experiment completes** — in `pipeline/nodes.py` (parse_results node):

```python
publish("topoconf:research:experiment_completed", {
    "fe_id": fe_id,
    "arxiv_id": arxiv_id,
    "result_path": result_path,
    "auroc": auroc,
    "verdict": verdict,  # HIT / NEAR_MISS / NULL
    "duration_seconds": duration,
    "success": True,
})
set_research_field(arxiv_id, {
    f"fe_{fe_id}_status": "completed",
    f"fe_{fe_id}_auroc": str(auroc),
    f"fe_{fe_id}_verdict": verdict,
    f"fe_{fe_id}_duration_s": str(duration),
})
```

**5. After promotion** — in `promote_result.py`:

```python
publish("topoconf:research:promoted", {
    "fe_id": fe_id,
    "arxiv_id": arxiv_id,
    "findings_updated": findings_list,
    "experiment_log_id": exp_id,
    "new_claims_count": len(new_claims),
})
set_research_field(arxiv_id, {
    f"fe_{fe_id}_status": "promoted",
    f"fe_{fe_id}_findings_updated": json.dumps(findings_list),
    f"fe_{fe_id}_experiment_log_id": exp_id,
})
```

### W6-3. Autopilot Wiring

**File:** `~/topo-confidence/pipeline/autopilot.py`

```python
from .publisher import init_redis_publisher, close_redis_publisher

# In startup (after argument parsing):
init_redis_publisher()

# In shutdown (signal handler / finally block):
close_redis_publisher()
```

### W6-4. Arxiv ID Correlation

The link between link-forge and topo-confidence is `arxiv_id`:
- Link-forge publisher writes `arxiv_id` to `linkforge:paper:{queue_id}` hash
- Topo-confidence publisher writes to `topoconf:research:{arxiv_id}` hash
- Frontend joins on `arxiv_id`: paper detail fetches research lifecycle via `GET /api/linkforge/paper/{queue_id}/research`

---

## Wave 7: AutoRel Status Panel

**Time estimate**: ~1.5h

Covered in W4-6 (LfAutoRelNode component) and W2-6 (publisher in sweep.ts). No additional work beyond what's in those sections.

---

## Execution Order

```
Wave 1: Tabs (Phase 1)                          ~2h
  See SPEC-tabs-and-linkforge.md P1-B1 through P1-F3
  Unchanged from original spec.

Wave 2: Link-forge Publisher (10 streams)        ~2.5h
  W2-1 through W2-6
  Changes in ~/link-forge only.

Wave 3: Backend Components + History API         ~30m (components) + ~1.5h (history)
  W3-1 through W3-7
  Changes in ~/node-graph-substrate only.

Wave 4: Frontend Waterfall (10 stages)           ~6h
  W4-1 through W4-7
  Changes in ~/node-graph-substrate only.

Wave 5: Pool + Detail Panel                      ~8h
  W5-1 through W5-6
  Changes in ~/node-graph-substrate only.

Wave 6: Topo-confidence Research Publisher        ~2h
  W6-1 through W6-4
  Changes in ~/topo-confidence only.

Wave 7: AutoRel Status Panel                     ~1.5h
  Already covered in W2-6 + W4-6.

TOTAL: ~24h
```

Dependencies:
- Wave 1 (tabs) must be first — unblocks all else
- Wave 2 (publisher) can run in parallel with Wave 1
- Wave 3 (backend) depends on nothing, but should come before Wave 4
- Wave 4 (waterfall) depends on Wave 2 + Wave 3
- Wave 5 (pool) depends on Wave 3 (history API) + Wave 4 (waterfall layout)
- Wave 6 (research publisher) is independent, but Wave 5 detail panel needs it for research lifecycle display
- Wave 7 is done as part of Waves 2 + 4

---

## Key Architecture Decisions

1. **10 granular stages** over 6: includes embedded, chunked, auto_related, url_discovered for full pipeline visibility
2. **Dynamic node creation**: stage cards appear on canvas as stream events arrive (not pre-placed)
3. **Coordinator pattern**: static nodes subscribe to streams, App.tsx intercepts events and creates dynamic stage cards
4. **WS bypass**: linkforge + research stream events skip RAF coalescing, go directly to handlers
5. **Single node type**: `lf_stage` renders 10 different card layouts based on `data._stage`
6. **Newest at x=0**: new papers appear at x=0, existing papers shift right by `GROUP_SPACING` (280px). Each paper wrapped in `lf_pipeline_group` parent node.
7. **30 paper cap**: oldest paper's nodes removed when 31st arrives
8. **Pool is HTML, not React Flow**: scrollable card grid + detail panel below the canvas
9. **Hybrid pool layout**: 60/40 split — card grid left, detail panel right
10. **Historical + live**: pool loads history from Redis hashes on tab open, appends live completions with "NEW" badge
11. **Cross-system correlation via arxiv_id**: links link-forge papers to topo-confidence experiments
12. **Redis hashes for history**: publishers write incrementally to hashes alongside streams. 7-day TTL for link-forge, 30-day for research
13. **Opt-in publishing**: both link-forge and topo-confidence use `PUBLISHER_REDIS_URL` env var. Empty = no Redis dep
14. **Fire-and-forget**: all publishes are non-blocking with try/catch. Pipeline works identically without Redis
15. **AutoRel as small widget**: batch sweep status shown in a compact node, not a full waterfall

---

## Files Created/Modified (Complete List)

### New files (~/node-graph-substrate):
- `frontend/src/components/nodes/LfStageCard.tsx`
- `frontend/src/components/nodes/LfCoordinatorNode.tsx`
- `frontend/src/components/nodes/LfStatsNode.tsx`
- `frontend/src/components/nodes/LfAutoRelNode.tsx`
- `frontend/src/components/nodes/PipelineGroupNode.tsx`
- `frontend/src/components/nodes/ResearchBridgeNode.tsx`
- `frontend/src/components/nodes/ResearchCoordinatorNode.tsx`
- `frontend/src/components/nodes/PaperPoolSection.tsx`
- `frontend/src/components/nodes/R2BridgeNode.tsx`
- `frontend/src/components/nodes/R2CoordinatorNode.tsx`
- `frontend/src/components/nodes/R2StatsNode.tsx`
- `frontend/src/components/nodes/R2AutoRelNode.tsx`
- `frontend/src/components/nodes/R2StateNode.tsx`
- `frontend/src/components/canvas/TabBar.tsx`
- `frontend/src/components/canvas/NodeDetailModal.tsx`
- `frontend/src/components/canvas/PipelineTimeline.tsx`
- `frontend/src/components/linkforge/PaperPool.tsx`
- `frontend/src/components/linkforge/PaperCard.tsx`
- `frontend/src/components/linkforge/PaperDetail.tsx`
- `server/substrate/components/lf_coordinator.py`
- `server/substrate/components/lf_stats.py`
- `server/substrate/components/lf_autorel.py`
- `server/substrate/components/research_bridge.py`
- `server/substrate/components/research_coordinator.py`
- `server/substrate/linkforge_history.py`

### Modified files (~/node-graph-substrate):
- `server/substrate/crud.py` — add `list_graphs()`
- `server/substrate/main.py` — add list_graphs route + 3 history routes
- `server/substrate/components/__init__.py` — import all new components
- `frontend/src/App.tsx` — TabBar, projectId, linkforge event handler, paper tracker, pool state
- `frontend/src/lib/store/canvas-store.ts` — add projectId, starredPapers, flushCounter
- `frontend/src/lib/ws/client.ts` — linkforge + research bypass in onmessage
- `frontend/src/lib/nodes/registry.ts` — 18 entries + CanvasType + CANVAS_NODE_TYPES
- `frontend/src/components/canvas/node-types.ts` — all node type imports

### New files (~/link-forge):
- `src/publisher/redis.ts`

### Modified files (~/link-forge):
- `package.json` — add ioredis
- `src/config/index.ts` — publisher.redisUrl
- `src/processor/index.ts` — 10 publish() + setPaperField() calls
- `src/autorel/sweep.ts` — 1 publish() call
- `src/index.ts` — init/close publisher

### New files (~/topo-confidence):
- `pipeline/publisher.py`

### Modified files (~/topo-confidence):
- `pipeline/autopilot.py` — init/close publisher
- `research-graph/promote_brief.py` — 1 publish + hash write
- `pipeline/generate_recompute.py` — 1 publish + hash write
- `pipeline/nodes.py` — 2 publish + hash writes (experiment start/complete)
- `research-graph/promote_result.py` — 1 publish + hash write

---

## Wave 8 (Post-Spec): Research v2 Canvas

**Status (2026-05-13):** Implemented. Not in original spec — documenting retroactively.

### Canvas Type System

`frontend/src/lib/nodes/registry.ts` introduces a multi-canvas type system:

```typescript
type CanvasType = "pipeline" | "research" | "research2";

const CANVAS_NODE_TYPES: Record<CanvasType, Set<string>> = {
  pipeline: new Set(["prompt_input", "feature_bars", "hidden_state_cloud",
    "persistence_diagram", "confidence_gauge", "bridge_monitor", "explain_waterfall"]),
  research: new Set(["research_bridge", "research_coordinator", "lf_autorel", "lf_stats"]),
  research2: new Set(["r2_bridge", "r2_coordinator", "r2_stats", "r2_autorel"]),
};

function canvasTypeFromName(name: string | null): CanvasType;
```

The `NodePalette` sidebar filters available nodes by the active canvas type. `canvasTypeFromName` infers type from the graph name (e.g., "Research v2" → `research2`).

### Research v2 Node Types (5 new)

| type_id | Label | Category | Subscribes To |
|---------|-------|----------|---------------|
| `r2_bridge` | Research Bridge | input | `linkforge:research_bridged` |
| `r2_coordinator` | Research Coordinator | scoring | `topoconf:research:*` (5 streams) |
| `r2_stats` | Pipeline Stats | scoring | `linkforge:completed` |
| `r2_autorel` | AutoRel Status | scoring | `linkforge:autorel:sweep_completed` |
| `r2_state` | State | input | (none — hidden persistence node) |

### Paper Starring

Canvas store additions for research v2:
- `starredPapers: Set<string>` — queue_ids the user has starred
- `flushCounter: number` — incremented on flush
- `toggleStar(queueId)` — add/remove from starred set
- `flushUnstarred()` — remove all unstarred paper data

`R2StateNode` is a hidden 1px node that persists `starredPapers` in its config via the graph save flow. `PaperPoolSection` is a reusable embedded paper list with star toggle, used inside `R2BridgeNode` and `R2CoordinatorNode`.

`CanvasControls` includes a "Flush Unstarred" button (visible only on research2 canvas) and a star count badge.
