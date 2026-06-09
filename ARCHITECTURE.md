# Architecture reference

Deep reference for **node-graph-substrate**. The [README](README.md) is the scannable overview;
this document holds the full tables. For the diagrams, open the **[interactive viewer](docs/architecture.html)**
(tabbed, one diagram per tab) — published at
<https://musicofhel.github.io/node-graph-substrate/architecture.html>.

> **Single rule that shapes everything:** the substrate server **never imports topo-confidence**.
> `grep -rn "topo_confidence" server/substrate/` returns 0. All coupling is via Redis Streams; the
> topo-confidence adapter lives in a separate daemon container.

**Contents:** [Three loops](#the-three-loops) · [Packs & canvases](#packs--canvas-kinds) ·
[Node registry](#node-registry) · [Component SDK](#backend-component-sdk) · [Redis streams](#redis-streams) ·
[WebSocket protocol](#websocket-protocol) · [Database](#database-schema) · [Lifecycles](#lifecycles) ·
[Design decisions](#key-design-decisions) · [Repo layout](#repository-layout)

---

## The three loops

Everything the system does is one of three loops:

| Loop | Transport | Path |
|------|-----------|------|
| **Graph CRUD** | HTTP (PostgreSQL) | `PATCH /api/graphs/{id}/ops` → optimistic-locked apply → version bump |
| **Compute** (request/response) | WebSocket | `compute_request` → `component.build()` → `computation_result` |
| **Subscriber** (fan-out) | Redis Streams → WebSocket | `XADD` → StreamHub `XREAD` → `stream_event` → React Flow node |

---

## Packs & canvas kinds

The app is **pack-based**. Each pack contributes node types, streams, and *canvas kinds*. Both the
frontend (`frontend/src/packs/`) and server (`server/substrate/packs/`) carry a manifest per pack.

| Pack | Canvas kind(s) | Seeded node types |
|------|----------------|-------------------|
| **topo-confidence** | `scoring` ("Scoring") | prompt_input, feature_bars, hidden_state_cloud, persistence_diagram, confidence_gauge, bridge_monitor, explain_waterfall, drift_matrix, breathing_heatmap, h1_loop |
| **link-forge** | `research-bridge` ("Research Bridge") | research_bridge, research_coordinator, lf_autorel, lf_stats |
| **link-forge** | `ingestion` ("Ingestion") | lf_stage, lf_pipeline_group |
| **experiments** | `experiments` ("Experiments") | experiment_cloud, algorithm_selector, experiment_roi, findings_summary |
| **core** | — (no canvas) | canvas_ref, run_ref, node_ref (navigation/meta nodes) |

`canvasTypeFromName()` (`frontend/src/lib/pack-registry.ts`) maps a graph's name to its kind:
`scoring | ingestion | research-bridge | research2 | experiments` (`research2` is the legacy R2 canvas
whose `r2_*` nodes are still registered for backward compatibility).

> **Note on older docs:** earlier READMEs described "three canvas types (Pipeline / Research / Research v2)."
> That predates the pack refactor. Canvas *kinds* are now pack-defined as above; migration `003_canvas_kind.sql`
> backfills legacy graphs (`pipeline`/`research`/`research2`) into pack ids.

---

## Node registry

~30 React Flow node components live in `frontend/src/components/nodes/` and are keyed in
`frontend/src/components/canvas/node-types.tsx`. All wrap **BaseNodeShell** (NodeResizer handles, selection
state, category color band, health status). Use `useNodesData(id)` (never `useNodes()`) and `memo()` every node.

<details>
<summary><b>Scoring canvas — topo-confidence pack</b></summary>

| Node | Category | Kind | Subscribes to |
|------|----------|------|---------------|
| Prompt Input | input | COMPUTED | — (publishes to `topoconf:control`) |
| Feature Bars | topology | SUBSCRIBER | `topoconf:scoring:features_computed` |
| Hidden State Cloud | extraction | SUBSCRIBER | `topoconf:scoring:hidden_state_cloud` |
| Persistence Diagram | topology | SUBSCRIBER | `topoconf:scoring:persistence_computed` |
| Confidence Gauge | scoring | SUBSCRIBER | `topoconf:scoring:confidence_scored` |
| Bridge Monitor | scoring | SUBSCRIBER | `topoconf:scoring:bridge_health` |
| Explain Waterfall | scoring | SUBSCRIBER | `topoconf:scoring:explain_result` |
| Drift Matrix | scoring | SUBSCRIBER | — (local PSI compute) |
| **Layer Breathing Heatmap** | topology | SUBSCRIBER | `topoconf:scoring:breathing_profile` |
| H1 Topological Loops | topology | SUBSCRIBER | — (REST-backed projections) |

</details>

<details>
<summary><b>Research Bridge & Ingestion canvases — link-forge pack</b></summary>

| Node | Category | Kind | Subscribes to |
|------|----------|------|---------------|
| LF Coordinator | input | SUBSCRIBER | `linkforge:*` (10 streams) |
| LF Stage / Paper Group | extraction/input | view | — (created by coordinator) |
| LF Stats | scoring | SUBSCRIBER | `linkforge:completed` |
| LF AutoRel | scoring | SUBSCRIBER | `linkforge:autorel:sweep_completed` |
| Research Bridge | input | SUBSCRIBER | `linkforge:research_bridged` |
| Research Coordinator | scoring | SUBSCRIBER | `topoconf:research:*` (5 streams) |
| R2 Bridge / Coordinator / Stats / AutoRel / State | various | SUBSCRIBER | same streams as above (legacy `research2` canvas) |

</details>

<details>
<summary><b>Experiments canvas — experiments pack</b></summary>

| Node | Category | Streams | Data source |
|------|----------|---------|-------------|
| Experiment Cloud | experiment | — | `GET /api/experiments/data` |
| Algorithm Selector | experiment | — | `GET /api/experiments/algorithms` |
| Experiment ROI | experiment | — | REST |
| Findings Summary | experiment | — | REST |

</details>

<details>
<summary><b>Core — navigation/meta nodes</b></summary>

`canvas_ref`, `run_ref`, `node_ref`, `row_label` — cross-canvas references and layout helpers; no streams.

</details>

---

## Backend Component SDK

Components are Python classes extending `Component` (`server/substrate/sdk/component.py`). They declare a
`type_id`, a `kind`, ports, and (for subscribers) `subscribed_streams`. **18 components** self-register via
the `ComponentRegistry` when `substrate.components` is imported at startup.

```python
@registry.register
class MyComponent(Component):
    type_id = "my_type"
    kind = NodeKind.SUBSCRIBER          # or COMPUTED
    subscribed_streams = ["topoconf:scoring:features_computed"]

    async def build(self, **inputs):    # COMPUTED nodes only
        return {"result": compute(inputs)}
```

- **COMPUTED** nodes implement `build()` — invoked by a `compute_request`. Only **prompt_input** today.
- **SUBSCRIBER** nodes declare `subscribed_streams` — StreamHub auto-subscribes them on WS connect.

<details>
<summary><b>All 18 registered components</b> (1 COMPUTED, 17 SUBSCRIBER)</summary>

| Component | Kind | Streams |
|-----------|------|---------|
| prompt_input | COMPUTED | — |
| feature_bars | SUBSCRIBER | `topoconf:scoring:features_computed` |
| hidden_state_cloud | SUBSCRIBER | `topoconf:scoring:hidden_state_cloud` |
| persistence_diagram | SUBSCRIBER | `topoconf:scoring:persistence_computed` |
| confidence_gauge | SUBSCRIBER | `topoconf:scoring:confidence_scored` |
| bridge_monitor | SUBSCRIBER | `topoconf:scoring:bridge_health` |
| explain_waterfall | SUBSCRIBER | `topoconf:scoring:explain_result` |
| breathing_heatmap | SUBSCRIBER | `topoconf:scoring:breathing_profile` |
| drift_matrix | SUBSCRIBER | — (local) |
| algorithm_selector | SUBSCRIBER | — (REST) |
| experiment_cloud | SUBSCRIBER | — (REST) |
| experiment_roi | SUBSCRIBER | — (REST) |
| findings_summary | SUBSCRIBER | — (REST) |
| lf_coordinator | SUBSCRIBER | `linkforge:*` (10 streams) |
| lf_stats | SUBSCRIBER | `linkforge:completed` |
| lf_autorel | SUBSCRIBER | `linkforge:autorel:sweep_completed` |
| research_bridge | SUBSCRIBER | `linkforge:research_bridged` |
| research_coordinator | SUBSCRIBER | `topoconf:research:*` (5 streams) |

</details>

---

## Redis streams

**24 streams** total = 23 data + 1 control. All `MAXLEN ~ 10000`, plain `XREAD` (not `XREADGROUP`) so every
connected client sees every event, with a 256 KB payload assertion. Tiers come from
`server/substrate/stream_tiers.py` (`StreamTier = "realtime" | "interactive" | "background"`); today
everything is **interactive** except the autorel sweep, which is **background**.

<details>
<summary><b>Control channel</b> — server → daemon (1)</summary>

| Stream | Payload | Size |
|--------|---------|------|
| `topoconf:control` | `{command, prompt, run_id, math_idx?}` | ~1 KB |

</details>

<details>
<summary><b>TopoConf scoring</b> — daemon → server (7, interactive)</summary>

| Stream | Payload | Size |
|--------|---------|------|
| `topoconf:scoring:hidden_state_cloud` | `{umap_3d (N×3), clusters, bridge_idx}` | ~40 KB |
| `topoconf:scoring:persistence_computed` | `{H0, H1, H2 birth–death pairs}` | ~5 KB |
| `topoconf:scoring:features_computed` | `{features: {name: value} × 13}` | ~1 KB |
| `topoconf:scoring:confidence_scored` | `{confidence, mode}` | ~0.5 KB |
| `topoconf:scoring:bridge_health` | `{healthy, bridge_at_pos0, silhouette_by_layer}` | ~1 KB |
| `topoconf:scoring:explain_result` | `{features: {raw, scaled, coef, contrib}, top_contributor}` | ~2 KB |
| `topoconf:scoring:breathing_profile` | `{heatmap 8×28 PR, l19_curve, correctness, subject, level}` | ~5 KB |

</details>

<details>
<summary><b>LinkForge ingestion</b> — link-forge bot (10 interactive + 1 background)</summary>

| Stream | Payload |
|--------|---------|
| `linkforge:ingested` | `{paper_id, url, title, source}` |
| `linkforge:extracted` | `{paper_id, abstract, authors, year}` |
| `linkforge:categorized` | `{paper_id, categories, relevance}` |
| `linkforge:embedded` | `{paper_id, vector_dim, model}` |
| `linkforge:stored` | `{paper_id, neo4j_id}` |
| `linkforge:chunked` | `{paper_id, chunk_count}` |
| `linkforge:auto_related` | `{paper_id, related_ids, scores}` |
| `linkforge:research_bridged` | `{paper_id, triage_candidate}` |
| `linkforge:url_discovered` | `{url, source, context}` |
| `linkforge:completed` | `{paper_id, duration_ms, stages_ok}` |
| `linkforge:autorel:sweep_completed` | `{sweep_id, papers_scored, new_relations, duration_ms}` — **background tier** |

</details>

<details>
<summary><b>Research lifecycle</b> — research pipeline (5 interactive)</summary>

| Stream | Payload |
|--------|---------|
| `topoconf:research:triaged` | `{paper_id, priority, rationale}` |
| `topoconf:research:script_generated` | `{paper_id, script_path}` |
| `topoconf:research:experiment_started` | `{paper_id, run_id, gpu}` |
| `topoconf:research:experiment_completed` | `{paper_id, run_id, metrics}` |
| `topoconf:research:promoted` | `{paper_id, target_pathway}` |

</details>

---

## WebSocket protocol

Single endpoint: `ws://host:8080/ws/canvas/{graph_id}`. All messages JSON; client messages validated via
Pydantic discriminated unions (`server/substrate/messages.py`).

| Direction | Message | Purpose |
|-----------|---------|---------|
| C → S | `compute_request` | Trigger `component.build()` for a COMPUTED node |
| C → S | `config_update` | Update node config — persisted + broadcast |
| C → S | `resubscribe` | Re-register stream subscriptions after reconnect |
| S → C | `graph_loaded` | Full graph state + component manifests (on connect) |
| S → C | `computation_result` | Response to a compute_request (`ok`/error) |
| S → C | `stream_event` | A Redis stream payload relayed to a subscriber node |
| S → C | `node_state_updated` | Config change broadcast to all canvas clients |
| S → C | `replay_gap` | Requested cursor predates the earliest available entry |
| S → C | `error` | Parse errors / invalid requests |

---

## Database schema

Six core tables with cascade deletes, extended over 10 migrations (`migrations/001_init.sql` →
`010_backfill_scoring_node_widths.sql`). Migrations auto-apply on server startup, each inside an explicit
transaction with its `_migrations` row insert.

| Table | Role |
|-------|------|
| **projects** | Top-level container (unique slug); `pack_versions` JSONB |
| **graphs** | Canvas instance; optimistic `version` counter, `kind`, `pack_id`, `slug` |
| **graph_versions** | JSONB snapshot per save |
| **nodes** | Position, type, dimensions (text PKs for client-generated IDs) |
| **node_configs** | JSONB config per node (separated for frequent updates) |
| **edges** | source/target + handle metadata, FK cascade on node delete |
| runs · node_observations · session_state · search index | experiment runs, time-series observations, session restore, full-text search (migrations 004–007) |

---

## Lifecycles

<details>
<summary><b>Graph CRUD</b></summary>

**First visit** — resolve `?graph=` / localStorage → create default project + graph → seed per-canvas nodes
→ `saveGraph()`.
**Save** — diff current node/edge IDs against `_serverNodeIds`/`_serverEdgeIds` → emit `remove_*`/`upsert_*`
ops → `PATCH /api/graphs/{id}/ops` with `expected_version` → server `SELECT FOR UPDATE` → version check →
apply → snapshot → bump.
**Conflict (409)** — client receives `current_version` + full state and calls `loadGraph()` to re-sync.

</details>

<details>
<summary><b>WebSocket connect / reconnect / cleanup</b></summary>

**Connect** — `App` resolves `graphId` → `SubstrateWS(graphId)` → `connect()` → server loads graph, sends
`graph_loaded`, instantiates components, subscribes streams.
**Reconnect** — exponential backoff 1s→2→4→8→10s cap; on success sends `resubscribe`, server resumes XREAD
from last cursor, backoff resets.
**Cleanup** — `shouldReconnect = false`, cancel RAF, clear pending map; server `unsubscribe_all`, destroy
components, drop from ConnectionManager.

</details>

---

## Key design decisions

- **Substrate isolation** — server never imports topo-confidence (`grep -rn topo_confidence server/substrate/` = 0).
- **Broadcast semantics** — plain `XREAD`, not consumer groups: every client sees every event.
- **Throttled flushing** — stream_events within a 500 ms window merge before hitting React state.
- **Per-node subscriptions** — `useNodesData(id)` re-renders only the affected node.
- **Optimistic concurrency** — `expected_version` on save prevents silent overwrites; 409 → full re-sync.
- **Server-side ID tracking** — client tracks `_serverNodeIds`/`_serverEdgeIds` to compute remove ops.
- **R3F `frameloop="demand"`** — the 3D point cloud re-renders only on data change.
- **Pack architecture** — node types, streams, and canvas kinds are contributed by packs on both ends.

---

## Repository layout

```
node-graph-substrate/
├── docker-compose.yml              # postgres (5434), redis (6381), server (8080)
├── migrations/                     # 001..010 (.sql, auto-applied on startup)
├── scripts/
│   ├── synthetic_daemon.py         # topoconf scoring data (+ --math500-cache)
│   ├── synthetic_linkforge.py      # linkforge ingestion data
│   ├── precompute_breathing_cache.py
│   └── take_screenshots.py
├── server/
│   ├── pyproject.toml              # fastapi, asyncpg, redis, structlog, prometheus
│   └── substrate/
│       ├── main.py                 # FastAPI app + /ws/canvas/{id}
│       ├── db.py crud.py ws.py     # asyncpg pool, optimistic locking, ConnectionManager
│       ├── streamhub.py            # tiered XREAD readers + fan-out
│       ├── stream_tiers.py messages.py registry.py schemas.py
│       ├── sdk/                    # component.py, pack.py, ports.py, validate.py
│       ├── components/             # 18 registered components
│       ├── api/                    # canvases, projects, runs, streams, experiments, h1_loops, …
│       ├── packs/                  # core, topo_confidence, link_forge, experiments
│       └── observability/          # structlog + prometheus
├── frontend/
│   ├── package.json                # Vite 6, React 19, @xyflow/react 12, Zustand 5 + zundo, R3F, Tailwind 4
│   └── src/
│       ├── App.tsx                 # React Router
│       ├── pages/                  # home, canvas, projects, packs, settings, daemons, streams, login
│       ├── components/{nodes,canvas,panels,charts,edges,linkforge}/
│       ├── packs/                  # core, topo-confidence, link-forge, experiments
│       └── lib/{ws,store,hooks,drift,layout}/
├── daemons/topoconf/               # adapter.py + topoconf_daemon.py (opt-in container)
├── docs/
│   ├── architecture.html           # ← tabbed diagram viewer
│   ├── diagrams/                    # 13 D2 sources + PNG renders + render-all.sh
│   ├── screenshots/                 # 77 PNGs
│   └── mockups/ · history/
└── tests/visual/                   # 19 Playwright specs
```
