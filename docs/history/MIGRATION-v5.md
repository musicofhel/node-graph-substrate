# Migration v5: v2 to v5

How to get from the current `node-graph-substrate` codebase (commit `487b9b1`, 43 commits) to the structure specified in SPEC-v5.md. This document supersedes MIGRATION-v4.md, which is archived in `docs/history/`.

**The fundamental character of v5's migration is different from v4's.** v4 was 70% "build new things" and 30% "rewrite existing." v5 is roughly **20% build new, 50% refactor existing into pack shape, and 30% mechanical file moves**. The reason is that the codebase has shipped a lot of v4's planned work — drift observability, ELK auto-layout, PSI math, custom edges, Sparkline, DetailPanel, experiments canvas — and v5 integrates them into the pack architecture rather than rebuilding them.

Every step in this migration was validated against `v5-anchors.md` (the local-filesystem read by Claude Code at commit `487b9b1`). Where a step references a line number, that line number was confirmed.

## Section 1. Strategy

The v5 reorganization is a refactor on a working codebase. The principle:

- **Refactor in place** the routing layer (new), pack registry (new), pack manifest extraction from existing `registry.ts` (refactor), canvas-store pack-leak removal (refactor), server-side API split (refactor), the WebSocket resume protocol (extend existing client.ts and ws.py), StreamHub tier-aware multiplex (refactor).
- **Move into pack folders** the 25 existing node components, 18 server-side component modules, 3 stores (drift, event-log, experiment), 2 panels (DetailPanel, EventLog), 3 server modules (experiment_data, experiment_parser, h1_loop_data), 4 hooks, the linkforge components, and the precompute scripts.
- **Build new** only: the pack contract types and validator, the routing layer, the pages (workspace, project, canvas, etc.), the project workspace session restore, the Cmd+K palette, the bearer-token auth flow, the pack version pinning UI.
- **Leave alone** ELK layout, PSI math, charts, edges, Sparkline, the DetailPanel internals, the Cypress test suite, the h1-loop sub-components, the visual test runner, the existing migrations 001-002.
- **Archive** the v2/v3/v4 design docs into `docs/history/`.

Work in a feature branch `v5-migration`. Land the schema migrations first.

## Section 2. Documentation Reorganization

The first step is mechanical. From the repository root:

```bash
mkdir -p docs/history

# Archive v2 design docs
git mv SPEC.md docs/history/SPEC-v2.md
git mv SPEC-linkforge-v2.md docs/history/SPEC-linkforge-v2.md
git mv SPEC-tabs-and-linkforge.md docs/history/SPEC-tabs-and-linkforge.md
git mv HANDOFF-tabs-linkforge.md docs/history/HANDOFF-tabs-linkforge.md
git mv HANDOFF-drift-observability.md docs/history/HANDOFF-drift-observability.md
git mv PLAN-tabs.md docs/history/PLAN-tabs.md

# Archive earlier v3/v4 attempts if they landed
[ -f SPEC-v3.md ] && git mv SPEC-v3.md docs/history/
[ -f SPEC-v4.md ] && git mv SPEC-v4.md docs/history/
[ -f MIGRATION.md ] && git mv MIGRATION.md docs/history/MIGRATION-v3.md
[ -f MIGRATION-v4.md ] && git mv MIGRATION-v4.md docs/history/

# Drop in v5 docs from the scaffold
cp <scaffold>/SPEC-v5.md .
cp <scaffold>/MIGRATION-v5.md .
cp <scaffold>/README-v5.md .
cp <scaffold>/AUDIT-RESPONSE-v5.md .
cp <scaffold>/v5-deltas.md .
cp <scaffold>/verify-paths.sh .
chmod +x verify-paths.sh

git commit -m "Archive design docs; add v5 spec, migration, deltas, audit response, verify script"
```

## Section 3. Pack-Leak Rip List

These items are the **only** ones that get ripped rather than ported. They are pack-specific concepts currently leaking into the global canvas-store.

| Leak | Location (validated) | Destination |
|---|---|---|
| `starredPapers: Set<string>` interface field | `canvas-store.ts:29` | `packs/link-forge/store.ts` |
| `starredPapers: new Set<string>()` initial value | `canvas-store.ts:62` | `packs/link-forge/store.ts` |
| `toggleStar` action | `canvas-store.ts:88-103` | `packs/link-forge/store.ts` |
| `flushUnstarred` action | `canvas-store.ts:105-107` | `packs/link-forge/store.ts` |
| `flushCounter: number` | `canvas-store.ts:30` | `packs/link-forge/store.ts` |
| r2_state detection in `toggleStar` | `canvas-store.ts:93` | move with toggleStar |
| r2_state detection in `loadGraph` (restore starredPapers from r2_state config, lines 194-197) | `canvas-store.ts:194-197` | `packs/link-forge/hooks/useStarredPapersRestore.ts` (new) |
| r2_state config write in `saveGraph` | wherever it writes r2_state config back | `packs/link-forge/hooks/useStarredPapersPersist.ts` (new) |

**After the rip**, `canvas-store.ts` contains only generic graph state (nodes, edges, viewport, selection, dirty, server diff sets). The interface shrinks from `CanvasState` (lines 16-45, 14 fields + actions) to something smaller. The link-forge pack's store wraps canvas-store and adds the link-forge-specific actions back.

**Note on `node-types.ts`:** The previous audit said this file "hardcodes canvas-type knowledge." That was wrong. `node-types.ts` is a flat `Record<string, ComponentType>` with 26 snake_case entries (25 registry nodes + `lf_pipeline_group` which is a layout container, not draggable). It has no canvas-type awareness. The actual canvas-type knowledge lives in `registry.ts:296-313` (`CanvasType` union and `CANVAS_NODE_TYPES` Record). v5 does not rip `node-types.ts`; v5 extracts its content into the four pack manifests (Section 4.4).

## Section 4. Rewrite Required

The following items are net-new or substantially restructured. They are listed in the order they need to land to keep the application working.

### Section 4.1. Schema Migrations

In order:

**Migration 003: project-level pack versioning + canvas kind and slug.**

```sql
ALTER TABLE projects ADD COLUMN pack_versions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE graphs ADD COLUMN kind TEXT;
ALTER TABLE graphs ADD COLUMN pack_id TEXT;
ALTER TABLE graphs ADD COLUMN pack_versions_override JSONB;
ALTER TABLE graphs ADD COLUMN slug TEXT;

-- Kind backfill from existing node types, using snake_case prefixes.
-- (The v4 plan used camelCase Lf*/R2* prefixes which DO NOT MATCH the actual
-- snake_case type_id values stored in the nodes table. The validation pass
-- confirmed type_id is always snake_case: lf_*, r2_*, research_*, etc.)
WITH node_signatures AS (
  SELECT
    graph_id,
    bool_or(type_id LIKE 'lf\_%' ESCAPE '\') AS has_lf,
    bool_or(type_id LIKE 'r2\_%' ESCAPE '\') AS has_r2,
    bool_or(type_id LIKE 'research\_%' ESCAPE '\') AS has_research,
    bool_or(type_id LIKE 'experiment\_%' ESCAPE '\'
            OR type_id IN ('algorithm_selector', 'findings_summary')) AS has_experiments
  FROM nodes
  GROUP BY graph_id
)
UPDATE graphs g
SET
  kind = CASE
    WHEN ns.has_experiments THEN 'experiments'
    WHEN ns.has_r2 THEN 'research2'
    WHEN ns.has_research OR ns.has_lf THEN 'research'
    ELSE 'pipeline'
  END,
  pack_id = CASE
    WHEN ns.has_experiments THEN 'experiments'
    WHEN ns.has_r2 OR ns.has_research OR ns.has_lf THEN 'link-forge'
    ELSE 'topo-confidence'
  END
FROM node_signatures ns
WHERE g.id = ns.graph_id;

-- Graphs with no nodes default to pipeline / topo-confidence.
UPDATE graphs SET kind = 'pipeline', pack_id = 'topo-confidence'
WHERE kind IS NULL;

-- Slug backfill with collision avoidance via window function.
WITH slugified AS (
  SELECT
    id, project_id,
    lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) AS base_slug,
    row_number() OVER (
      PARTITION BY project_id, lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
      ORDER BY id
    ) AS rn
  FROM graphs
)
UPDATE graphs g
SET slug = CASE WHEN s.rn = 1 THEN s.base_slug ELSE s.base_slug || '-' || s.rn::text END
FROM slugified s
WHERE g.id = s.id;

-- Default project-level pack_versions for existing projects.
UPDATE projects SET pack_versions = '{
  "core": "0.1.0",
  "topo-confidence": "0.1.0",
  "experiments": "0.1.0",
  "link-forge": "0.1.0"
}'::jsonb
WHERE pack_versions = '{}'::jsonb;

ALTER TABLE graphs ALTER COLUMN kind SET NOT NULL;
ALTER TABLE graphs ALTER COLUMN pack_id SET NOT NULL;
ALTER TABLE graphs ALTER COLUMN slug SET NOT NULL;

CREATE INDEX idx_graphs_project_kind ON graphs (project_id, kind);
CREATE UNIQUE INDEX uq_graphs_project_slug ON graphs (project_id, slug);
```

**Note on the v4 plan's migration 008:** The v4 plan included an `008_graph_versions_unique.sql` to add a UNIQUE constraint on `graph_versions(graph_id, version)`. **This migration is not in v5.** The validation pass confirmed `migrations/001_init.sql` already declares this as a composite PRIMARY KEY. The runs FK in migration 004 references the existing PK.

**Migration 004: runs table with race-safe creation.**

```sql
CREATE TABLE runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id           UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  run_id_external     TEXT NOT NULL,
  graph_version       INTEGER NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at         TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'completed', 'failed', 'aborted')),
  kind_specific_data  JSONB NOT NULL DEFAULT '{}'::jsonb,

  UNIQUE (canvas_id, run_id_external),
  FOREIGN KEY (canvas_id, graph_version)
    REFERENCES graph_versions (graph_id, version)
);

CREATE INDEX idx_runs_canvas_started ON runs (canvas_id, started_at DESC);
CREATE INDEX idx_runs_status ON runs (status) WHERE status = 'running';
```

(graph_id is UUID per migrations/001_init.sql, so canvas_id is also UUID, corrected from v4 which used BIGINT.)

**Migration 005: node_observations partitioned via pg_partman.**

```sql
CREATE EXTENSION IF NOT EXISTS pg_partman;

CREATE TABLE node_observations (
  node_id    TEXT NOT NULL,
  ts         TIMESTAMPTZ NOT NULL,
  run_id     UUID REFERENCES runs(id) ON DELETE CASCADE,
  value      JSONB NOT NULL,
  PRIMARY KEY (node_id, ts)
) PARTITION BY RANGE (ts);

CREATE TABLE node_observations_default PARTITION OF node_observations DEFAULT;
CREATE INDEX idx_node_obs_run ON node_observations (run_id, ts) WHERE run_id IS NOT NULL;

SELECT partman.create_parent(
  p_parent_table => 'public.node_observations',
  p_control => 'ts',
  p_type => 'native',
  p_interval => 'monthly',
  p_premake => 3
);
```

If pg_partman is not available in the deployment target, a fallback FastAPI background task creates next-month partitions on a weekly cron. This is acceptable but adds operational complexity.

**Migration 006: workspace_session_state.**

```sql
CREATE TABLE workspace_session_state (
  project_id        UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  open_canvas_ids   UUID[] NOT NULL DEFAULT '{}',
  active_canvas_id  UUID REFERENCES graphs(id),
  per_canvas_state  JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

(UUID throughout, corrected from v4's BIGINT.)

**Migration 007: search_index materialized view for Cmd+K.**

```sql
CREATE MATERIALIZED VIEW search_index AS
  SELECT 'project' AS kind, id::text AS id, slug AS target_slug,
         display_name AS label, NULL::text AS sublabel,
         setweight(to_tsvector('english', display_name), 'A') AS tsv
  FROM projects
  UNION ALL
  SELECT 'canvas' AS kind, id::text AS id, slug AS target_slug,
         name AS label, kind AS sublabel,
         setweight(to_tsvector('english', name), 'A') AS tsv
  FROM graphs
  UNION ALL
  SELECT 'run' AS kind, id::text AS id, NULL::text AS target_slug,
         to_char(started_at, 'YYYY-MM-DD HH24:MI') AS label,
         status AS sublabel,
         to_tsvector('english', id::text || ' ' || COALESCE(status, '')) AS tsv
  FROM runs;

CREATE INDEX idx_search_tsv ON search_index USING gin(tsv);
```

Refresh policy: best-effort 30 seconds via scheduled job or pg_cron. The Cmd+K palette is informational; a 30-second-stale view is acceptable.

### Section 4.2. Backend Route Split

The current `server/substrate/main.py` (361 lines, validated) is the FastAPI app with all HTTP routes inline. The v5 split moves route handlers into `api/*` files while preserving the existing route paths and behaviors.

The new endpoints to add: `POST /api/login`, `POST /api/logout` (session cookie auth); `GET /api/projects/:id/session` and `PATCH /api/projects/:id/session` (workspace session); `GET /api/canvases/:id/runs`, `GET /api/runs/:id`, `GET /api/runs/:id/events?since_ts=`, `POST /api/runs/compare`; `GET /api/streams`, `GET /api/streams/:name/tail?n=`; `GET /api/daemons` (reads heartbeat streams); `GET /api/packs`, `GET /api/packs/:id`; `GET /api/search?q=&scope=`.

The existing experiment endpoints in `experiment_data.py` (185 lines) wrap into `server/substrate/api/experiments.py` and the new `packs/experiments/` server-side pack module. The existing `h1_loop_data.py` (97 lines) wraps into `api/h1_loops.py`. The existing `linkforge_history.py` (56 lines) wraps into `api/canvases.py` (the linkforge history endpoints are canvas-scoped).

### Section 4.3. SDK Rewrite

The existing `server/substrate/sdk.py` (82 lines) contains the SocketType enum and Component base class. v5 refactors:

`sdk/pack.py` — new. PackManifest, NodeDef, PortDef, CanvasKindDef, StreamDef, RestEndpointDef, DaemonDef Pydantic v2 models, mirroring `frontend/src/types/pack.ts`.

`sdk/component.py` — existing Component base class moves here unchanged.

`sdk/ports.py` — base port types (json, tensor, timeseries, tabular, image, text, event) and the compatibility rules.

`sdk/validate.py` — `validate_pack_manifest()` function.

**The SocketType enum is preserved**, not deleted. It's the foundation of handle-type compatibility validation (used by NODE_REGISTRY.handles and by edge validation at canvas save time). Removing it would break edge validation across all 25 existing nodes. v5 may add new SocketType values as new packs need them; the existing 7 (PROMPT, EXTRACTION, FEATURES, CONFIDENCE, BRIDGE_HEALTH, EXPLANATION, DIAGRAMS) stay.

### Section 4.4. Pack Manifest Extraction from registry.ts

The existing `frontend/src/lib/nodes/registry.ts` (320 lines, 25 NODE_REGISTRY entries, 4-variant CanvasType, CANVAS_NODE_TYPES Record) is the v2 source of truth for node-to-canvas mapping. v5 extracts it into four pack manifests **without breaking the existing imports**.

The strategy is staged extraction:

1. **Phase A** (Day 1): Create the four pack manifest files (`packs/{core,topo-confidence,experiments,link-forge}/manifest.ts`) and re-export `NODE_REGISTRY` and `CANVAS_NODE_TYPES` from `registry.ts` using the new pack manifests as the source. `registry.ts` becomes a thin compatibility shim. Existing imports keep working.

2. **Phase B** (Day 2): Update every import of `NODE_REGISTRY` / `CANVAS_NODE_TYPES` / `canvasTypeFromName` to use the pack-registry instead. Confirm via grep that `lib/nodes/registry.ts` has zero remaining importers.

3. **Phase C** (Day 3): Delete `lib/nodes/registry.ts`. Move `lib/nodes/handle-colors.ts` to `lib/ports/handle-colors.ts`.

**Node-to-pack assignment** (validated against `CANVAS_NODE_TYPES` in registry.ts:298-313):

| Node | Pack | Canvas kind(s) |
|---|---|---|
| prompt_input, feature_bars, hidden_state_cloud, persistence_diagram, confidence_gauge, bridge_monitor, explain_waterfall, drift_matrix, breathing_heatmap, h1_loop | topo-confidence | pipeline |
| experiment_cloud, algorithm_selector, experiment_roi, findings_summary | experiments | experiments |
| research_bridge, research_coordinator, lf_autorel, lf_stats | link-forge | research |
| r2_bridge, r2_coordinator, r2_stats, r2_autorel, r2_state | link-forge | research2 |
| lf_stage, lf_coordinator, lf_pipeline_group | link-forge | (used by both research and research2; lf_pipeline_group is in node-types but not registry — keep that arrangement) |
| (none yet) | core | (core ships zero canvas-pack-nodes; only generic primitives) |

Note: The four hooks under `lib/hooks/` (`useExperimentData`, `useH1LoopData`, `useNodeHistory`, `useNodeStats`) are pack-specific. The first two move to `packs/experiments/hooks/` and `packs/topo-confidence/hooks/` (h1_loop is topo-confidence-specific). The last two stay under `lib/hooks/` because they're generic (any node can use them).

### Section 4.5. Canvas-Store Refactor

The existing `frontend/src/lib/store/canvas-store.ts` (290 lines, validated). v5 refactor steps:

1. Extract the link-forge-specific pieces (Section 3 rip list) into `packs/link-forge/store.ts`.
2. The `autoLayout` action at lines 109-115 stays in canvas-store; it's generic.
3. The `loadGraph` action at lines 152-212 must be split: the generic load logic stays; the r2_state-config-restore at lines 194-197 moves into a link-forge `onCanvasLoad` hook that the pack registry wires up.
4. The `saveGraph` action at lines 214-281 stays; the r2_state config-write (wherever it is) becomes a link-forge `onCanvasSave` hook.
5. The store moves from `lib/store/canvas-store.ts` to `features/canvas/canvas-store.ts`.
6. The zundo wrapper preserved with `{nodes, edges}` partializer scope (viewport changes not undoable).

The pack-registry contract gains `onCanvasLoad` and `onCanvasSave` lifecycle hooks for packs that need to participate in graph load/save. Link-forge uses both for r2_state. Topo-confidence, experiments, and core do not implement them.

### Section 4.6. Routing Layer

Net-new. `app/router.tsx` per SPEC-v5 Section 5. Wire up `RouterProvider` from React Router v7 (package name `react-router`, not `react-router-dom`). Each page lazy-loaded.

The v2 `App.tsx` is the Init flow, handleMessage, WS lifecycle composition. v5's App.tsx is a thin composition of providers and router. The init flow moves to `pages/canvas/CanvasPage.tsx` (which depends on a single canvas_id from the URL). The WS lifecycle moves to a `lib/ws/useWebSocket.ts` hook that pages call.

### Section 4.7. Workspace Session Restore

Net-new. `features/workspace/useProjectSession.ts` hydrates on `/p/:slug` mount; debounced 500ms PATCH on store mutations; localStorage mirror with server-authoritative conflict resolution.

### Section 4.8. WebSocket Resume Support

The existing `ws/client.ts` (207 lines, validated) is well-factored. v5 extends it without rewriting.

Add to `ws/client.ts`:
- `lastIdByStream: Map<string, string>` field, updated on every received `stream_event` from line 122 (the cursor extraction point).
- On `attemptConnect` after successful connect, before sending `resubscribe` at lines 74-79, send `subscribe_with_resume` instead with last_ids per stream.
- Handle a new `resumed` server message at lines 82-137 (just logs the missed_count for now).

Modify `server/substrate/ws.py` (52 lines, validated) and `streamhub.py` (103 lines):
- Track per-connection subscriptions with last cursor.
- On `subscribe_with_resume`, XREAD from each cursor forward until exhausted, then emit `resumed`.

The existing reconnection logic at `attemptConnect:54-150` (exponential backoff 1s→10s, reset on success) is preserved.

### Section 4.9. StreamHub Tier-Aware Multiplex

The existing `streamhub.py` does one asyncio.Task per stream-name (validated). v5 consolidates to one task per tier.

Three tier coroutines:
- `_realtime_loop()`: XREAD BLOCK 0 across all realtime-tier streams.
- `_interactive_loop()`: XREAD BLOCK 5000 across all interactive-tier streams.
- `_background_loop()`: XREAD BLOCK 30000 across all background-tier streams.

Each pack's StreamDefs declare the tier; StreamHub reads pack manifests at startup and routes each stream to the right tier's loop.

Coalescing runs per-tier: realtime pass-through; interactive maintains per-(stream, node_id) latest-value buffer flushed on 500ms tick; background does the same with 5-second tick. The 500ms tick **matches the existing client-side `throttleMs = 500`**.

### Section 4.10. Pack Version Pinning UI

The schema work lands with 4.1. The UI work:
- At canvas load, runtime resolves effective version (override if present, else project-level) and checks acceptsRuntimeRange. If outside, canvas opens in read-only "incompatible pack" mode.
- `features/workspace/PackUpgradeDialog.tsx` shows a "pack updates available" indicator when installed > effective pinned. Diff preview + Apply button. Calls `POST /api/canvases/:id/pack-upgrade`.

Can land last; not load-bearing for v1.

### Section 4.11. Cross-Canvas Reference Nodes

Three small components in `packs/core/nodes/`: `CanvasRefNode`, `RunRefNode`, `NodeRefNode`. Each click triggers React Router navigate.

### Section 4.12. Cmd+K Search

Net-new. `features/search/CommandPalette.tsx` using cmdk + Radix Dialog. `useGlobalSearch.ts` hook calling `GET /api/search` with TanStack Query, debounced 150ms. Keyboard shortcut wires up at AppShell level.

### Section 4.13. Error Boundaries and Observability

`RootErrorBoundary` wraps the router. Toast container at AppShell. Client logger at `lib/logging/index.ts`. Server-side: structlog setup in `observability/logging.py`, optional Prometheus in `observability/metrics.py`.

### Section 4.14. 3D Dependency Lazy Loading

`@react-three/fiber`, `@react-three/drei`, three are removed from the eager-import chain. `HiddenStateCloudNode.tsx` (119 lines) and `H1LoopNode.tsx` (519 lines, with `h1-loop/` sub-components) use `React.lazy` and `Suspense` to load these only when the node first renders. Drops ~600 KB from the initial bundle.

### Section 4.15. Experiments Pack Server-Side Integration

The existing `experiment_data.py` (185 lines), `experiment_parser.py` (107 lines), and `h1_loop_data.py` (97 lines) live at `server/substrate/`. v5 moves them into `server/substrate/packs/experiments/` and `server/substrate/packs/topo_confidence/` (h1_loop_data is topo-confidence specific). They expose REST endpoints via the new `restEndpoints` declaration in the pack manifest.

The frontend hooks (`useExperimentData.ts` 218 lines, `useH1LoopData.ts` 273 lines) move to `packs/experiments/hooks/` and `packs/topo-confidence/hooks/` respectively.

## Section 5. Step-by-Step Migration Sequence

The recommended order, each step buildable.

**Step 1**: Documentation reorganization per Section 2.

**Step 2**: Schema migrations 003-007 per Section 4.1, rehearsed on a snapshot of the development database. Run backfills. Validate no NULL columns and no failed FK creations. **Skip the v4-planned migration 008** — graph_versions already has a composite PK.

**Step 3**: Backend SDK refactor per Section 4.3. Move sdk.py to sdk/ directory. Preserve SocketType enum.

**Step 4**: Backend route split per Section 4.2. New endpoints stubbed to return empty.

**Step 5**: Pack manifest extraction per Section 4.4 Phase A. Create the four pack manifest files. registry.ts becomes a compatibility shim.

**Step 6**: Frontend routing layer per Section 4.6. Wire up React Router. Create pages/ files importing from features/.

**Step 7**: Canvas-store refactor per Section 4.5 (without moving the file yet). Extract link-forge leaks into packs/link-forge/store.ts. Add onCanvasLoad / onCanvasSave hooks.

**Step 8**: Pack manifest extraction per Section 4.4 Phase B. Update all imports to use pack-registry.

**Step 9**: WebSocket resume support per Section 4.8.

**Step 10**: StreamHub multiplex per Section 4.9.

**Step 11**: Workspace session restore per Section 4.7.

**Step 12**: Cmd+K search per Section 4.12.

**Step 13**: Error boundaries and observability per Section 4.13.

**Step 14**: 3D lazy loading per Section 4.14.

**Step 15**: Experiments pack server-side integration per Section 4.15. Move experiment_data, experiment_parser, h1_loop_data into pack server folders.

**Step 16**: Reference nodes per Section 4.11 and pack-version pinning UI per Section 4.10. Round out the feature surface.

**Step 17**: Pack manifest extraction per Section 4.4 Phase C. Delete registry.ts. Move handle-colors.ts.

At any step, if the application is broken for more than a session, either revert or land smaller commits within the step.

## Section 6. Port As-Is Reference (Validated)

For every file v5 keeps from v2, the validated source path and v5 destination:

| From (v2, validated) | To (v5) | Action |
|---|---|---|
| `frontend/src/lib/ws/client.ts` (207 lines) | `frontend/src/lib/ws/client.ts` | Extend with resume support |
| `frontend/src/lib/layout/elk-layout.ts` (181 lines) | `frontend/src/lib/layout/elk-layout.ts` | Leave alone |
| `frontend/src/lib/layout/elk-worker.ts` (50 lines) | `frontend/src/lib/layout/elk-worker.ts` | Leave alone |
| `frontend/src/lib/drift/psi.ts` (38 lines) | `frontend/src/features/drift/psi.ts` | git mv |
| `frontend/src/lib/store/canvas-store.ts` (290 lines) | `frontend/src/features/canvas/canvas-store.ts` | git mv + refactor (Section 4.5) |
| `frontend/src/lib/store/ui-store.ts` (49 lines) | `frontend/src/features/workspace/ui-store.ts` | git mv |
| `frontend/src/lib/store/drift-store.ts` (145 lines) | `frontend/src/features/drift/drift-store.ts` | git mv |
| `frontend/src/lib/store/event-log-store.ts` (45 lines) | `frontend/src/features/event-log/event-log-store.ts` | git mv |
| `frontend/src/lib/store/experiment-store.ts` (27 lines) | `frontend/src/packs/experiments/store.ts` | git mv |
| `frontend/src/lib/hooks/useNodeHistory.ts` (30 lines) | `frontend/src/lib/hooks/useNodeHistory.ts` | Leave alone (generic) |
| `frontend/src/lib/hooks/useNodeStats.ts` (64 lines) | `frontend/src/lib/hooks/useNodeStats.ts` | Leave alone (generic) |
| `frontend/src/lib/hooks/useExperimentData.ts` (218 lines) | `frontend/src/packs/experiments/hooks/useExperimentData.ts` | git mv |
| `frontend/src/lib/hooks/useH1LoopData.ts` (273 lines) | `frontend/src/packs/topo-confidence/hooks/useH1LoopData.ts` | git mv |
| `frontend/src/components/canvas/SubstrateCanvas.tsx` (134) | `frontend/src/features/canvas/SubstrateCanvas.tsx` | git mv |
| `frontend/src/components/canvas/CanvasControls.tsx` (160) | `frontend/src/features/canvas/CanvasControls.tsx` | git mv |
| `frontend/src/components/canvas/TabBar.tsx` (92) | `frontend/src/features/workspace/ProjectTabBar.tsx` | git mv + rename |
| `frontend/src/components/canvas/PipelineTimeline.tsx` (62) | `frontend/src/packs/link-forge/components/PipelineTimeline.tsx` | git mv (pack-specific) |
| `frontend/src/components/canvas/SplitPane.tsx` (98) | `frontend/src/features/canvas/SplitPane.tsx` | git mv |
| `frontend/src/components/canvas/node-types.ts` (56) | (deleted; content split across four pack manifests) | RIP after Phase C |
| `frontend/src/components/charts/*` (3 files) | `frontend/src/components/charts/*` | Leave alone |
| `frontend/src/components/edges/*` (2 files) | `frontend/src/components/edges/*` | Leave alone |
| `frontend/src/components/panels/DetailPanel.tsx` (646) | `frontend/src/components/panels/DetailPanel.tsx` | Leave alone |
| `frontend/src/components/panels/EventLog.tsx` (151) | `frontend/src/components/panels/EventLog.tsx` | Leave alone |
| `frontend/src/components/linkforge/*` (3 files) | `frontend/src/packs/link-forge/components/*` | git mv |
| `frontend/src/components/sidebar/NodePalette.tsx` | `frontend/src/features/canvas/NodePalette.tsx` | git mv + refactor to read pack-registry |
| `frontend/src/components/nodes/BaseNodeShell.tsx` (97) | `frontend/src/features/canvas/BaseNodeShell.tsx` | git mv |
| `frontend/src/components/nodes/Sparkline.tsx` (49) | `frontend/src/features/canvas/Sparkline.tsx` | git mv |
| 10 topo-confidence `*Node.tsx` files | `frontend/src/packs/topo-confidence/nodes/*` | git mv |
| `frontend/src/components/nodes/h1-loop/` (7 sub-components) | `frontend/src/packs/topo-confidence/nodes/h1-loop/` | git mv |
| 4 experiments `*Node.tsx` files | `frontend/src/packs/experiments/nodes/*` | git mv |
| 13 link-forge `*Node.tsx` files (Lf*, R2*, Research*, PipelineGroupNode, PaperPoolSection) | `frontend/src/packs/link-forge/nodes/*` | git mv |
| `tests/visual/` (existing) | `tests/visual/` | Leave alone |
| `frontend/cypress/` (existing 11 specs, 841 lines) | `frontend/cypress/` | Leave alone |
| `scripts/` (7 precompute/test files) | `scripts/` | Leave alone |
| `synthetic_daemon.py`, `synthetic_linkforge.py`, `take_screenshots.py` | `scripts/` (move into existing dir) | git mv |
| 5 root `e2e_*.py` | `tests/e2e/` (port assertions into named Playwright tests) | Audit + port |
| `server/substrate/main.py` (361) | split per Section 4.2 | Refactor |
| `server/substrate/ws.py` (52) | `server/substrate/ws.py` | Extend with resume |
| `server/substrate/streamhub.py` (103) | `server/substrate/streamhub.py` | Refactor to multiplex |
| `server/substrate/sdk.py` (82) | split per Section 4.3 | Refactor |
| `server/substrate/{db,crud,schemas,messages,registry,linkforge_history}.py` | `server/substrate/{db,crud,schemas,messages,registry,linkforge_history}.py` | Leave alone |
| `server/substrate/experiment_data.py` (185) | `server/substrate/packs/experiments/data.py` | git mv |
| `server/substrate/experiment_parser.py` (107) | `server/substrate/packs/experiments/parser.py` | git mv |
| `server/substrate/h1_loop_data.py` (97) | `server/substrate/packs/topo_confidence/h1_loop_data.py` | git mv |
| `server/substrate/components/__init__.py` (18 imports) | refactor into per-pack `__init__.py` | Refactor |
| 18 `server/substrate/components/*.py` | `server/substrate/packs/<pack>/components/*.py` per Section 4.4 mapping | git mv |
| `daemons/topoconf/*` (4 files) | `daemons/topoconf/*` | Leave alone |
| `migrations/001_init.sql`, `migrations/002_schema_fixes.sql` | `server/substrate/db/migrations/{001,002}*` | git mv |
| `docker-compose.yml` | `docker-compose.yml` | Leave alone (update pg_partman image) |
| `CLAUDE.md` | `CLAUDE.md` | Update to reference SPEC-v5 |

## Section 7. Validation Checklist

Before merging the v5-migration branch, all of these must pass. The `verify-paths.sh` script in this scaffold automates the grep-based checks.

```bash
# 1. Pack isolation invariant (must return zero lines)
grep -r "topo_confidence\|TopoConfidence" \
  server/substrate/ --include="*.py" \
  | grep -v packs/topo_confidence/ \
  | grep -v __pycache__

# 2. Pack-leak removal from canvas-store (must return zero lines)
grep -n "starredPapers\|flushUnstarred\|r2_state" \
  frontend/src/features/canvas/canvas-store.ts

# 3. Legacy SocketType references in non-pack code (should return zero outside of sdk/ + packs/)
grep -rn "SocketType" server/substrate/ --include="*.py" \
  | grep -v sdk/ | grep -v packs/

# 4. Direct pack imports outside the registry (must return zero lines)
grep -rn "from .*packs/" \
  frontend/src/app frontend/src/pages frontend/src/features \
  frontend/src/lib frontend/src/components

# 5. React Router v6 imports (must return zero lines)
grep -rn "react-router-dom" frontend/src/

# 6. Stale registry.ts importers (must return zero lines after Phase B)
grep -rn "from .*lib/nodes/registry" frontend/src/

# 7. Validate every URL is reachable
# Run cypress + new playwright suite; both must pass.

# 8. Validate the heartbeat streams are not redundant with drift-store
# Manual: confirm /daemons page shows daemon status, /streams page shows event log,
# DetailPanel drift tab shows PSI per feature. All three exist independently.

# 9. Validate the 500ms throttle is preserved
grep -n "throttleMs = 500" frontend/src/lib/ws/client.ts
# Expect: line 36 (or thereabouts after edits)

# 10. Validate run-replay round-trip
# Boot the stack, create a canvas, run synthetic_daemon for 60s, save a run, replay it.
# Confirm RunScrubber shows 5-second cached snapshots.

# 11. Validate session restore
# Open 3 tabs in a project, close browser, reopen, confirm same 3 tabs in same order.

# 12. Validate Cmd+K
# Search for a project name, a canvas name, a run timestamp. All three deep-link correctly.

# 13. Validate pack-version pinning
# Open a v0.1.0-pinned canvas; manually bump topo-confidence in package.json to 0.2.0;
# confirm "pack update available" indicator surfaces. Click upgrade. Confirm diff preview.
```

## Section 8. Rollback Plan

Each migration in 003-007 has a corresponding rollback recipe documented as a comment at the end of each migration file. Roll back in reverse order.

The code work lives on the v5-migration branch. If validation fails catastrophically, revert the branch. The schema changes are forward-compatible enough that the v2 frontend can still load against the v5 schema (new columns are NULL-safe defaults).

Data loss is zero. All v2 data is preserved through the migrations. No DROP TABLE, no destructive UPDATE.

## Section 9. Post-Migration Tasks

After the migration lands:

Bump versions. `frontend/package.json` and the new SDK package move from 0.x to 1.0.0-rc.1.

Update `CLAUDE.md` to reference SPEC-v5.md, the new pack architecture, and the new pages layout. Update the "Tab restoration" doc section if it exists.

Pack extraction proof of concept. Extract the core pack to `@ngs/pack-core` as an npm package. Validate the lint rule (no internal imports). Do not extract topo-confidence, experiments, or link-forge yet; those need real semver discipline first.

Performance test pass. Validate the aspirational 100-node, 200-edge canvas budget on a representative machine before promising it.

Document the experiment-store / drift-store / event-log-store boundaries in a new `docs/observability.md`. The v5 spec splits them across features/drift, features/event-log, and packs/experiments — a short doc helps future readers find them.

Roadmap a v5.1. Likely candidates: dev-loop pack scaffolding (if you build dev-loop), the pack-version diff UI polish, multi-canvas search enhancements, real-time tier validation with synthetic load.
