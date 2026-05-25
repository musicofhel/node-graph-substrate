# SPEC-v5: Node-Graph Substrate

**Status:** v5, canonical specification. Supersedes SPEC-v4.md, which is archived as `docs/history/SPEC-v4.md`. SPEC-v5 incorporates ground-truth validation against the actual codebase (commit `487b9b1`, 43 commits, validated 2026-05-25), reflecting what has already shipped rather than what was once aspirational.

**Audience:** Aaron Cohen and Claude Code agents implementing against this spec. Both must be able to read this document top to bottom without external context.

**The fundamental shift from v4 to v5:** v4 was a redesign-from-doc-reading. v5 is a **refactor-to-pack-shape** of an already-working system. The architectural seam (pack contract, routing, project workspace, run model, pages structure) is still net-new. But ELK auto-layout, drift observability, PSI math, custom edges, charts, Sparkline, tests/visual, scripts, the experiments canvas, the H1 loop visualization, the breathing heatmap, and DetailPanel are all **already implemented and working in v2.** v5 integrates them into the pack architecture rather than rebuilding them.

## Section 1. Goal

Node-Graph Substrate is a node-graph-first observability dashboard for arbitrary daemons that publish structured events to Redis Streams. The dashboard is a substrate; observability for specific systems (topo-confidence scoring, link-forge ingestion, the experiments analysis pillar) plugs in as **packs**. A pack ships with declared canvas kinds, node types, port types, stream subscriptions, and an optional daemon heartbeat configuration. Adding a new pack must be possible without modifying any core substrate code.

The architectural seam that makes this real is the grep test. Running `grep -r "topo_confidence\|TopoConfidence" server/substrate/ --include="*.py" | grep -v packs/topo_confidence/` must always return zero lines. The validation pass on commit `487b9b1` confirmed this invariant currently holds (zero lines).

## Section 2. Locked Decisions

For traceability, every decision below is locked. Changes require an explicit spec revision rather than an ad-hoc commit. Decisions inherited from earlier rounds are preserved; v5-specific resolutions are marked.

### Round 1 (preserved). Domain shape.

The substrate hosts many projects per workspace, with 5 to 50 canvases expected per project rather than thousands. A canvas kind is a first-class enum but it is owned by a pack rather than by the substrate core. The substrate must remain a generic tool that any daemon can plug into. The tension between this and the desire for per-kind feature folders is resolved by making packs the unit of code organization. Packs own kinds; kinds live under `packs/<pack-id>/kinds/<kind-id>/`. Run is a first-class persistable noun, but it is optional per kind.

### Round 2 (preserved with one reversal). Stack and tooling.

React Router v7 (package name `react-router`, not `react-router-dom`). React Query for server state; Zustand for client state. Radix Primitives with custom styling. Each pack daemon declares its own heartbeat cadence. Pack extraction to npm and pip is in v1 scope. Canvas creation auto-seeds with the kind's `defaultSeed` with a "blank canvas" override available.

**Reversed from v4:** The "research-v2 collapses into research" decision is **revoked**. The codebase ships both `research` (research_bridge, research_coordinator, lf_autorel, lf_stats) and `research2` (r2_bridge, r2_coordinator, r2_stats, r2_autorel, r2_state) as distinct canvas kinds with distinct nodes, distinct persistence semantics (r2_state carries `starredPapers`), and active use. Forcing a collapse creates persisted-state migration risk for zero architectural benefit; the link-forge pack declares both kinds.

### Round 3 (preserved). Replay, versioning, persistence, protocol, auth.

Run replay uses structural snapshots; `runs.graph_version` foreign-keys into the existing `graph_versions` table whose composite primary key `(graph_id, version)` already exists in `migrations/001_init.sql` (no new uniqueness migration is required). Pack versioning pins versions per project with optional per-canvas override; upgrades are manual with a diff preview. Time-series persistence uses `node_observations`, partitioned monthly via pg_partman. WebSocket resume tracks last Redis stream IDs per subscribed stream. Cross-canvas references go through reference nodes in the core pack, not through edges. Stream tiers are realtime, interactive, and background. Authentication uses a bearer-token fence with cookie session.

### Round 4 (v5 ground-truth resolutions).

The package name for React Router v7 is `react-router`. Pack version pinning lives on projects with optional per-canvas override. The compatibility-range mechanism allows packs to declare which canvas-pinned ranges they serve. Run creation uses INSERT with ON CONFLICT to handle race conditions. WebSocket authentication uses a session cookie set by `POST /api/login` rather than the `Sec-WebSocket-Protocol` header. A per-user "default to blank canvas" override is available in `/settings/appearance`. Workspace session conflicts resolve server-authoritative; localStorage is the fallback only when the server is unreachable.

### Round 5 (v5 codebase-validated resolutions). New in v5.

The 500ms throttle in `ws/client.ts:36` is **preserved**. The two-stage coalescing pattern is `scheduleFlush() → 500ms throttle timer → flushPending() → requestAnimationFrame → batchFn(updates)`. Pack manifests can override the throttle for streams in the `realtime` tier (zero throttle, RAF-only).

The drift observability stack (`drift-store.ts`, `psi.ts`, health bands on `BaseNodeShell`, `StaleEdge`, `DriftMatrixNode`) is **preserved and integrated**. v5 does not replace it; v5 ports it into `features/drift/` and exposes its hooks to all packs.

The `pack:<id>:heartbeat` Redis stream pattern is **kept as a separate concern from drift**. Heartbeat answers "is the daemon's process alive and emitting?". Drift answers "are the values the daemon emits statistically stable?". Both are needed.

The `experiments` canvas kind is its **own pack** named `experiments`. It is not folded into `topo-confidence` because the lifecycle is different (precomputed batch projections served via REST, not streams) and the pack boundary is the cleanest seam for future analytical canvases.

The Cypress devDependency is **kept**. 11 spec files / 841 lines of working tests live at `frontend/cypress/`. v5 keeps the Cypress suite and adds Playwright tests for the new v5 surface (project workspace, run replay, pack registry).

`NodeDetailModal.tsx` is **gone** as of commit `a1ff77d`. It was replaced by `DetailPanel.tsx` (646 lines) and `EventLog.tsx` (151 lines) under `components/panels/`. v5 documents this; no restoration.

## Section 3. Architectural Principles

Three principles govern every other decision in this specification.

The first principle is that the substrate is domain-agnostic. The core code knows about packs, the pack contract, the port system, and the canvas primitives. It knows nothing about language models, knowledge graphs, scoring, ingestion, experiments, or any specific daemon's vocabulary. The grep test from Section 1 is the operational expression of this principle.

The second principle is that packs are the unit of evolution. A pack is a self-contained folder with its own manifest, store, nodes, kinds, and migrations. Packs are versioned independently. A canvas pins the pack version it was created with; upgrades are explicit user actions rather than silent migrations. The compatibility range mechanism (Section 12) prevents the runtime from needing to ship every historical version while still allowing the spec's "old canvases keep working" promise to hold.

The third principle is that the browser is a stateless observer. All persistent state lives in Postgres or Redis. Browser-only state such as zoom level or in-flight edits is mirrored to `workspace_session_state` so a second device sees the same view. The browser's only durable-only state is a localStorage cache used as a fallback when the server is unreachable, with the server being authoritative on conflict.

## Section 4. Domain Nouns

The full object hierarchy: A Project contains many Canvases, each of which has a kind, a pack_id, and pinned pack versions inherited from the project with optional per-canvas override. Each Canvas contains Nodes (each with a type_id of the form `<pack>.<node>`, a position, and a config) and Edges with optional port-typed connections. When a canvas's kind has hasRuns set to true, each canvas accumulates Runs over time. Each Run carries a graph_version snapshot pointer and kind_specific_data validated against the kind's runSchema. When a node has persistHistory set to true, the Run accumulates NodeObservation rows. Stream and Daemon are infrastructure peers; they are not nested under projects. They are discoverable globally via /streams and /daemons. WorkspaceSessionState is per-project: which canvases are open, which is active, and per-canvas viewport and selection.

A Pack is the cross-cutting unit. It declares CanvasKindDefs (each with id, label, defaultSeed, paletteNodeIds, hasRuns, runSchema, and minRuntimeVersion), NodeDefs (each with typeId, inputs and outputs as PortRefs, kind, persistHistory, and a lazy-imported component), PortDefs (each with id, baseType, color, and optional tags), StreamDefs (each with name, tier, coalesce strategy, and retentionMaxLen, with an optional throttleMsOverride for realtime tier), and an optional DaemonDef. Packs also declare RestEndpointDefs for canvases like experiments that consume precomputed data via REST rather than streams.

## Section 5. Routes

All routes use React Router v7 with a browser router. Every route is lazy-loaded.

The root path `/` serves the Home page with recent projects, recent canvases, and a Cmd+K search target. `/projects` shows the project list. `/p/:projectSlug` shows the project workspace with a tab bar restored from workspace_session_state. `/p/:projectSlug/c/:canvasSlug` shows the canvas live view composing the React Flow surface, DetailPanel, and NodePalette. `/p/:projectSlug/c/:canvasSlug/r/:runId` shows the run-pinned canvas with events sourced from the persisted run and a scrubber at the bottom. `/p/:projectSlug/c/:canvasSlug/compare?runs=a,b,c` shows the run comparison with side-by-side snapshots and an explicit "structure changed" banner when graph_versions differ between runs. `/streams` shows the stream inspector. `/daemons` shows the daemon health board reading heartbeat streams. `/packs` shows the installed pack catalog. `/packs/:packId` shows the pack manifest expanded. `/settings` and its subroutes (connections, appearance, keyboard) handle user and substrate settings. `/login` handles the bearer-token entry flow.

URL slugs are stable. Canvases have a slug column that is NOT NULL and UNIQUE per project. Numeric IDs are not exposed in URLs. The slug backfill during migration uses a window function to disambiguate collisions.

## Section 6. Navigation

The left rail (Sidebar.tsx) always has exactly six items: Home, Projects, Streams, Daemons, Packs, Settings (with Settings pinned to the bottom). The rail never expands with project context and is collapsible to icon-only.

The top bar (TopBar.tsx) has the breadcrumb (project, then canvas) on the left, the global Cmd+K search trigger in the middle, and the connection status indicator plus user menu on the right.

The tab bar (ProjectTabBar.tsx) only appears inside `/p/:slug`. It shows one tab per open canvas, with drag-reorder, close, and a "+" action that opens a new-canvas dialog. State persists on every change with a 500-millisecond debounced PATCH to `workspace_session_state`.

### Section 6.1. Cmd+K Global Search

The Cmd+K palette uses the open-source `cmdk` library wrapped with Radix Dialog. The keyboard shortcut is Cmd+K on macOS, Ctrl+K on Linux and Windows.

Searchable at v1: projects (by name), canvases (by name, scoped to all projects with the active project preferred when inside a project context), runs (by short ID prefix or by date), packs (by name and node type label), streams (by name), and nodes on the current canvas (by label and typeId, only when inside a canvas route).

The search index is server-side, exposed via `GET /api/search?q=<query>&scope=<scope>`. It uses Postgres full-text search on a denormalized `search_index` materialized view (migration 007). Results are limited to 20 per query, ranked exact-match-first then by recency. The client debounces at 150 milliseconds.

The result deep-link format matches the route table directly. The keyboard UX follows standard command-palette conventions: arrow keys to move, enter to select, escape to dismiss, Cmd+Enter to open in a new browser tab.

## Section 7. Folder Structure

The frontend lives under `frontend/src/` with the following layout. Items marked **(existing)** ship in v2; v5 keeps them. Items marked **(new in v5)** are net-new.

```
app/                              new in v5
  router.tsx                      React Router v7 browser router
  providers.tsx                   QueryClient, Theme, PackRegistry, WS
  layout/
    AppShell.tsx
    Sidebar.tsx
    TopBar.tsx
  errors/
    RootErrorBoundary.tsx
    PackRegistryErrorPage.tsx
    NotFoundPage.tsx
pages/                            new in v5 (lazy-loaded)
  home/, projects/, project/, canvas/, run-compare/,
  streams/, daemons/, packs/, settings/, login/
features/                         mixed
  workspace/                      new (project list, tabs, session)
  canvas/                         new (composes existing SubstrateCanvas)
  runs/                           new
  streams/                        new (consumes existing event log)
  daemons/                        new
  drift/                          ported from existing drift stack
  event-log/                      ported from existing event-log-store
  search/                         new
  errors/                         new
packs/                            new in v5 (refactor of registry.ts)
  core/                           generic primitives + ref nodes
  topo-confidence/                pipeline canvas + 10 nodes
  experiments/                    experiments canvas + 4 nodes (separate pack)
  link-forge/                     research + research2 canvases + 13 nodes
lib/
  pack-registry.ts                new
  ports/                          new (typed port system)
  ws/client.ts                    existing (extended with resume support)
  layout/elk-layout.ts            existing
  layout/elk-worker.ts            existing
  hooks/                          existing (4 data hooks: useExperimentData,
                                  useH1LoopData, useNodeHistory, useNodeStats)
  persistence/                    new
  logging/                        new (client-side structured logger)
components/
  ui/                             new (Radix-based primitives)
  charts/                         existing (DistributionChart, StatsSummary,
                                  TimeSeriesChart)
  edges/                          existing (StaleEdge, edge-types)
  panels/                         existing (DetailPanel, EventLog)
  linkforge/                      existing (PaperPool, PaperCard, PaperDetail)
types/
  domain.ts, messages.ts, pack.ts  new
```

The backend lives under `server/substrate/` with the following layout.

```
main.py                  existing, refactored to mount api/* routers
ws.py                    existing, extended with resume support
streamhub.py             existing, extended with tier-aware multiplex
api/                     new in v5 (route handlers, split by resource)
  projects.py, canvases.py, runs.py, streams.py,
  packs.py, daemons.py, session.py, auth.py, search.py,
  experiments.py        (wraps existing experiment_data.py / experiment_parser.py)
  h1_loops.py           (wraps existing h1_loop_data.py)
sdk/                     new in v5
  pack.py, component.py, ports.py, validate.py
packs/                   new in v5 (server-side mirror of frontend packs)
  core/, topo_confidence/, experiments/, link_forge/
db/
  models.py              new (asyncpg query functions, not an ORM)
  migrations/
    003_canvas_kind.sql, 004_runs.sql,
    005_node_observations.sql, 006_session_state.sql,
    007_search_index.sql
observability/           new
  logging.py, metrics.py
```

Note: there is no migration 008. The v4 plan included an `008_graph_versions_unique.sql` to add a UNIQUE constraint, but `migrations/001_init.sql` already declares `graph_versions(graph_id, version)` as a composite PRIMARY KEY. The runs FK in migration 004 references the existing PK directly.

The structural rules: Nothing under app, pages, features, lib, or components imports from packs. The pack registry inverts the dependency. Nothing under `packs/<pack>/` imports from another pack; cross-pack communication is through streams only. The `features/canvas/canvas-store.ts` does not contain pack-specific keys; the existing `starredPapers` and `flushUnstarred` move to `packs/link-forge/store.ts` during the migration (see MIGRATION-v5 Section 4.5).

## Section 8. The Pack Contract

A pack is a folder under `frontend/src/packs/<pack-id>/` on the frontend and `server/substrate/packs/<pack_id>/` on the backend (snake_case in Python, kebab-case in TypeScript). Both halves ship as one npm or pip package after extraction.

### Section 8.1. Frontend Manifest

```typescript
interface PackManifest {
  id: string;                       // 'topo-confidence', 'link-forge', 'experiments'
  version: string;                  // semver, pinned per-project
  label: string;
  description?: string;

  acceptsRuntimeRange?: string;     // semver range, e.g. ">=1.0.0 <2.0.0"

  canvasKinds: CanvasKindDef[];
  nodes: NodeDef[];
  ports?: PortDef[];                // custom ports extending baseTypes
  streams: StreamDef[];             // streams this pack's daemon publishes
  restEndpoints?: RestEndpointDef[]; // for packs like experiments that consume REST
  daemon?: DaemonDef;
}

interface CanvasKindDef {
  id: string;                       // 'pipeline', 'research', 'research2', 'experiments'
  label: string;
  defaultSeed: NodeSeed[];
  paletteNodeIds: string[];
  hasRuns: boolean;
  runSchema?: JSONSchema;
}

interface NodeDef {
  typeId: string;                   // '<pack>.<node>' globally unique; legacy snake_case
                                    // ids (e.g. 'prompt_input') keep their original form
                                    // for back-compat — see MIGRATION-v5 Section 4.4
  label: string;
  category: string;                 // 'input' | 'topology' | 'scoring' | 'experiment' | ...
  kind: 'computed' | 'subscriber' | 'state';
  inputs: PortRef[];
  outputs: PortRef[];
  subscribedStreams?: string[];
  configSchema?: JSONSchema;
  persistHistory?: boolean;         // opt into node_observations
  minWidth?: number;                // default 200
  minHeight?: number;               // default 80
  component: () => Promise<{ default: ComponentType<NodeComponentProps> }>;
}

interface StreamDef {
  name: string;
  tier: 'realtime' | 'interactive' | 'background';
  coalesce: 'latest' | 'append' | { rateLimitPerSec: number };
  retentionMaxLen?: number;         // default 10_000
  throttleMsOverride?: number;      // realtime tier only; defaults to 0 (RAF-only)
}

interface RestEndpointDef {
  id: string;                       // 'experiments.projection'
  path: string;                     // '/api/packs/experiments/projection'
  method: 'GET' | 'POST';
  cacheKey: string;                 // for React Query
}

interface DaemonDef {
  id: string;
  heartbeatStream: string;          // 'pack:<id>:heartbeat'
  heartbeatIntervalSec: number;
  degradedAfterSec: number;
  downAfterSec: number;
}
```

### Section 8.2. Port Compatibility

A connection from output port A to input port B is allowed when either the port IDs match exactly or the baseTypes match with no exclusive tag mismatch. An exclusive tag mismatch occurs when both ports have tags, neither tag set is a subset of the other, and their intersection is empty. Compatibility is checked client-side at edge-creation time and re-checked server-side at save time.

### Section 8.3. Pack Registration and Validation

At startup, `lib/pack-registry.ts` imports every pack's manifest. The `validatePackManifest()` function in `sdk/validate.py` (mirrored by a TypeScript version) checks: no two packs declare the same NodeDef.typeId; no two packs declare the same CanvasKindDef.id; every NodeDef.subscribedStreams entry appears in streams; every PortRef.type resolves to a known PortDef; heartbeat intervals are in [1, 600] seconds; the pack's acceptsRuntimeRange, if present, accepts the current substrate runtime version.

Validation failures route to `app/errors/PackRegistryErrorPage.tsx`, which lists conflicts and offers a "skip this pack" action.

### Section 8.4. npm and pip Extraction

The pack folder is structured so that extracting to `@ngs/pack-topo-confidence` (npm) and `ngs-pack-topo-confidence` (pip) is mechanical. The pack imports from `@ngs/sdk` exclusively. A CI lint rule enforces that pack source files do not import from `../../../` or absolute paths outside `@ngs/*`.

## Section 9. Stream Tiering and Coalescing

Streams declare a tier and a coalescing strategy in the pack manifest.

**Tiers and throttling.** The realtime tier uses XREAD BLOCK 0 (the lowest-latency option since there is no polling overhead) and applies no client-side throttle by default; per-stream throttleMsOverride may set a non-zero value if a node specifically wants to slow down. The interactive tier uses XREAD BLOCK 5000 and applies a **500-millisecond client throttle** — this matches the existing `throttleMs = 500` at `ws/client.ts:36` and the two-stage coalescing pattern `scheduleFlush → 500ms throttle → flushPending → requestAnimationFrame → batchFn(updates)` documented in MIGRATION-v5 Section 5. The background tier uses XREAD BLOCK 30000 and applies a 5-second client throttle.

**Coalescing.** The `latest` strategy replaces the previous value with the newest, scoped per (stream, node_id). The `append` strategy keeps every event and is bounded by retentionMaxLen. The `rateLimitPerSec` strategy accepts the first N events per second and drops overflow.

**StreamHub multiplex.** Server-side, StreamHub uses a single XREAD per tier across all streams in that tier rather than one task per stream. This avoids linear scaling at hundreds of streams. The current v2 implementation does one task per stream; the v5 refactor (MIGRATION-v5 Section 4.9) consolidates them.

## Section 10. Persistence Layer

### Section 10.1. Postgres Schema

The starting point is the existing schema from migrations 001 and 002, which provides projects, graphs, graph_versions, nodes, node_configs, edges, with `graph_versions(graph_id, version)` already a composite primary key. The v5 schema additions are migrations 003 through 007.

Migration 003 adds kind, pack_id, and slug to graphs, and adds pack_versions JSONB to projects with an optional pack_versions_override on graphs. Migration 004 adds the runs table with a UNIQUE constraint on `(canvas_id, run_id_external)` for race-safe ON CONFLICT semantics. Migration 005 adds the partitioned node_observations table via pg_partman. Migration 006 adds workspace_session_state. Migration 007 adds the search_index materialized view.

### Section 10.2. Run Model

A run is created when a daemon publishes its first event tagged with a new run_id for a given canvas. The substrate creates the run row using `INSERT INTO runs (canvas_id, run_id_external, ...) VALUES (...) ON CONFLICT (canvas_id, run_id_external) DO NOTHING RETURNING id`. Concurrent event delivery for the same run_id is safe; only one row is created.

Run replay reconstructs the canvas from graph_versions.snapshot (already JSONB-stored), then plays events tagged with the run's id in timestamp order. RunScrubber semantics are linear replay with per-tick snapshots cached at 5-second intervals; no reverse-play in v1. Run comparison across different graph_versions renders both shapes side by side with a "structure changed" banner.

### Section 10.3. Node Observations

Opt-in via NodeDef.persistHistory. The substrate writes to `node_observations(node_id, ts, run_id, value)` for every observation that node receives. Retention is 30 days hot, archive older. The partition management uses pg_partman. The drift detector (drift-store) and the time-series viewer both read from this table.

### Section 10.4. Workspace Session State

The workspace_session_state row is hydrated on `/p/:slug` mount. Debounced PATCH at 500 milliseconds persists every mutation. The localStorage mirror at `ngs.session.<projectId>` provides offline fallback; the server is authoritative on conflict.

## Section 11. WebSocket Protocol

The endpoint is `ws://host:8080/ws/canvas/{graph_id}` (note: the path parameter is `graph_id`, the graph PK, not a separate `canvas_id` concept — this matches `ws/client.ts:39` and the v2 README). One connection serves one canvas. Authentication is via session cookie set by `POST /api/login`.

**Existing v2 message types** (preserved):
- Client-to-server: `compute_request`, `config_update`, `resubscribe`, `ping`.
- Server-to-client: `graph_loaded`, `computation_result`, `stream_event`, `node_state_updated`, `error`, `pong`.

**The stream_event envelope** (verbatim from `streamhub.py:75-82`):
```python
{
    "type": "stream_event",
    "node_id": node_id,
    "stream": stream,
    "cursor": entry_id,
    "payload": payload,
    "ts": time.time(),
}
```

The `stream` field is present and is what the existing linkforge bypass at `ws/client.ts:108-115` keys on. v5 does not change this envelope.

**New v5 message types** (additions):
- Client-to-server: `subscribe_with_resume` (extends `resubscribe` with optional `last_ids: Record<stream, cursor>`).
- Server-to-client: `resumed` (with `missed_count`), structured `error` with code field (`gap_exceeded`, `auth_required`).

**Reconnect with replay.** The client tracks the last cursor it received per stream. On reconnect (after the exponential backoff cycle 1s to 10s with reset on success, already in v2 at `ws/client.ts:54-150`), the client sends `subscribe_with_resume` with last_ids per stream. The server runs XREAD from each cursor forward until it catches up, then signals resumed. Missed events between disconnect and reconnect are recovered up to MAXLEN (10,000). If the gap exceeds MAXLEN, the server emits `error: {code: 'gap_exceeded'}` and the client falls back to full state refetch.

## Section 12. Pack Versioning

A project's pack_versions JSONB column carries a pinned semver per pack. A canvas may override via `graphs.pack_versions_override`. Example: `{ "core": "0.1.0", "topo-confidence": "1.4.2", "experiments": "0.2.0", "link-forge": "2.0.0" }`. Every canvas pins core plus its kind's owning pack plus any pack from which it uses a node.

The compatibility range mechanism handles version mismatches. Each pack manifest declares `acceptsRuntimeRange`, a semver range indicating which canvas-pinned versions this build can serve. If the canvas's pin falls inside the range, the runtime serves the canvas using the current pack code. If the pin falls outside the range, the canvas opens in a read-only "incompatible pack" mode with an explicit upgrade prompt.

The upgrade flow surfaces a "pack updates available" indicator. Clicking opens a diff preview showing added/removed/modified node types and migrated configs computed by `migrate(fromVersion, toVersion, oldData)`. There is no auto-migration; the user always sees the diff first.

## Section 13. Authentication and Deployment

The substrate is single-user. There is no users table, no row-level ownership, and no permissions model.

The bearer-token fence: if `NGS_BEARER_TOKEN` is set, the first browser request must carry the bearer token to `POST /api/login`, which sets a HttpOnly, SameSite=Strict, Secure-when-HTTPS session cookie. Subsequent API requests and WebSocket upgrades validate the cookie. Requests bound to loopback (127.0.0.1) may skip authentication when `NGS_ALLOW_LOOPBACK=true`.

Connection configuration: `NGS_DATABASE_URL` and `NGS_REDIS_URL`. Both fall back to docker-compose defaults for development. The `/settings/connections` page surfaces the current URLs as read-only.

## Section 14. Cross-Canvas References

Data flow between canvases goes through streams only. Navigation uses three reference nodes in the core pack: `core.canvas-ref`, `core.run-ref`, `core.node-ref`. Each is a pure navigation affordance, not a typed edge.

## Section 15. Build and Tooling

Frontend: Vite with TypeScript 5.7+, React 19.2.6 (existing), `@xyflow/react` 12.10.2 (existing), React Router v7 (new), TanStack Query (new), Zustand 5.0.13 (existing) with zundo 2.3.0 (existing) — zundo partializer is scoped to `{nodes, edges}` only so viewport changes are not undoable. Radix UI Primitives with Tailwind 4 (existing). cmdk for Cmd+K (new). `@react-three/fiber` 9.6.1 + `@react-three/drei` 10.7.7 + three 0.184.0 (existing, used by HiddenStateCloudNode and H1LoopNode — lazy-loaded). elkjs 0.11.1 (existing). Cypress 15.15.0 (existing, kept). Playwright (existing at root for `e2e_*.py` audits, kept for v5 surface tests).

Backend: Python 3.12+, FastAPI, asyncpg, redis-py 5, Pydantic v2, pytest with httpx, structlog for JSON logging, optionally prometheus-client gated by `NGS_METRICS_ENABLED`.

Operational: Postgres 16 with pg_partman, Redis 7, docker-compose. Ports remain: 5173 frontend, 8080 backend, 5434 postgres, 6381 redis.

## Section 16. The Four Built-in Packs

### core

Ships with the substrate. Declares zero canvas kinds. Provides base port types (json, tensor, timeseries, tabular, image, text, event), three generic nodes (`core.stream-subscriber`, `core.json-inspector`, `core.timeseries-viewer`), and three reference nodes (`core.canvas-ref`, `core.run-ref`, `core.node-ref`). No daemon, no streams.

### topo-confidence

Declares the `pipeline` canvas kind with `hasRuns: true`. **10 nodes** (validated against `CANVAS_NODE_TYPES.pipeline` in `registry.ts:298-313`): `prompt_input`, `feature_bars`, `hidden_state_cloud`, `persistence_diagram`, `confidence_gauge`, `bridge_monitor`, `explain_waterfall`, `drift_matrix`, `breathing_heatmap`, `h1_loop`. The `drift_matrix` and `breathing_heatmap` and `h1_loop` are part of the topo-confidence pack rather than the core pack because they consume topo-confidence-specific data shapes (PSI over scoring features, MATH-500 layer breathing profiles, persistent H1 cycles).

Custom ports: `topo-confidence.features` (tensor, 13-dim), `topo-confidence.persistence` (json), `topo-confidence.bridge-health` (json), `topo-confidence.breathing-profile` (tensor, layer x dim), `topo-confidence.h1-cycles` (json).

Streams (8, all interactive tier with latest coalesce except where noted):
- `topoconf:scoring:hidden_state_cloud` (latest)
- `topoconf:scoring:persistence_computed` (latest)
- `topoconf:scoring:features_computed` (latest)
- `topoconf:scoring:confidence_scored` (latest)
- `topoconf:scoring:bridge_health` (latest)
- `topoconf:scoring:explain_result` (latest)
- `topoconf:scoring:breathing_profile` (latest)
- `pack:topo-confidence:heartbeat` (background tier, latest coalesce)

REST endpoints: `experiments.projection`, `experiments.findings`, `h1_loops.cycles`, `h1_loops.umap` (these last four served by the experiments pack server-side but exposed for topo-confidence-canvas nodes that consume them via hooks).

Daemon: topoconf-daemon. Heartbeat every 5s. Degraded after 15s. Down after 60s.

Run schema: `{ prompt: string, confidence_score: number, n_features: number, drift_signature?: object }`.

### experiments

Declares the `experiments` canvas kind with `hasRuns: false` (experiments is an analysis pillar consuming precomputed batches, not a per-execution flow). **4 nodes** (validated against `CANVAS_NODE_TYPES.experiments`): `experiment_cloud`, `algorithm_selector`, `experiment_roi`, `findings_summary`.

Custom ports: `experiments.projection` (tabular, rows are 500-point cloud entries), `experiments.algorithm-selection` (text, one of "A" | "B"), `experiments.roi-summary` (json), `experiments.findings` (text).

Streams: none. The experiments canvas is REST-driven via the existing `experiment_data.py` (185 lines) and `experiment_parser.py` (107 lines) on the server side, accessed through `lib/hooks/useExperimentData.ts` (218 lines, existing).

REST endpoints (declared via `restEndpoints` in the manifest):
- `experiments.projection` → `GET /api/packs/experiments/projection?algorithm=&problem=` — returns 500-point batched projection clouds.
- `experiments.findings` → `GET /api/packs/experiments/findings` — parses `FINDINGS.md`.
- `experiments.next` → `GET /api/packs/experiments/next` — parses `NEXT_EXPERIMENTS.md`.

The experiment_data backend ships in v2; v5 wraps it in `server/substrate/api/experiments.py` and `server/substrate/packs/experiments/`.

Daemon: experiments-precompute-daemon (offline batch job). Heartbeat every 60s (this daemon does not run continuously; the heartbeat reflects last successful batch completion). Degraded after 24h. Down after 7 days.

The `experiment-store.ts` (27 lines, existing) carrying cross-node experiment state (algorithmA/B, problemIdx, layer, viewMode) lives at `packs/experiments/store.ts` in v5.

### link-forge

Declares **two canvas kinds**: `research` (with `hasRuns: false`) and `research2` (with `hasRuns: false`). Both are long-running observatories.

The `research` kind nodes (4, validated): `research_bridge`, `research_coordinator`, `lf_autorel`, `lf_stats`. Default seed: those four nodes auto-placed.

The `research2` kind nodes (5, validated): `r2_bridge`, `r2_coordinator`, `r2_stats`, `r2_autorel`, `r2_state` (where r2_state is a hidden 1px state-carrier node persisting `starredPapers` via its node config in the graph save flow).

Additional pack nodes (not visible in palette but registered): `lf_stage` (dynamic per-paper card, used inside `lf_pipeline_group` containers), `lf_coordinator` (top-level coordinator), `lf_pipeline_group` (parent container — registered in `node-types.ts` but not in NODE_REGISTRY, intentionally not draggable).

Custom ports: `link-forge.paper` (json), `link-forge.ingestion-stage` (text), `link-forge.research-bridge-event` (json).

Streams (16):
- 10 `linkforge:*` ingestion stages (interactive, append coalesce): ingested, extracted, categorized, embedded, stored, chunked, auto_related, research_bridged, url_discovered, completed.
- 1 `linkforge:autorel:sweep_completed` (background, latest).
- 5 `topoconf:research:*` lifecycle (background, append): triaged, script_generated, experiment_started, experiment_completed, promoted.
- `pack:link-forge:heartbeat` (background, latest).

Daemon: linkforge-daemon. Heartbeat every 10s. Degraded after 30s. Down after 120s.

The `starredPapers: Set<string>` and `flushUnstarred()` action move from the global `canvas-store.ts` to `packs/link-forge/store.ts`. The `r2_state` detection in `loadGraph` and `toggleStar` (validated at `canvas-store.ts:194` and `canvas-store.ts:93`) becomes pack-local logic on link-forge's store.

## Section 17. Error Handling and Observability

### Section 17.1. Error Taxonomy

Four error classes with specific UI presentations.

Fatal page errors are caught by `app/errors/RootErrorBoundary.tsx` and render a full-page screen with Reload and Report-to-clipboard actions. API request errors surface via Toast (Radix Toast) with a retry action: 5xx red, 4xx amber, 401 informational with auto-redirect to /login. Validation errors render inline next to the offending input or node (port-compatibility tooltip, config-schema field outline). WebSocket connection issues surface via StatusDot in the TopBar: green connected, amber pulsing reconnecting, red disconnected with gap_exceeded.

### Section 17.2. Drift vs. Heartbeat

The substrate distinguishes two failure modes with separate observability channels.

**Heartbeat observability** answers "is the daemon's process alive and emitting?". Each pack daemon writes to `pack:<id>:heartbeat` at its declared cadence. The `/daemons` page reads these streams and shows status (ok/degraded/down) based on `degradedAfterSec` and `downAfterSec` thresholds. HeartbeatPayload: `{status, version, last_event_at, lag_ms}`.

**Drift observability** answers "are the values the daemon emits statistically stable?". This is the existing `drift-store.ts` (145 lines, validated) with rolling and snapshot baselines, per-field PSI via `lib/drift/psi.ts` (38 lines, existing), health bands on `BaseNodeShell.tsx`, `StaleEdge.tsx` (59 lines, existing) for going-stale edges, and `DriftMatrixNode.tsx` (169 lines, existing) as a heatmap view. The drift store push happens in `ws/client.ts:94-106` **before** the linkforge bypass at lines 108-115, with the explicit comment "MUST be before the linkforge/research bypass."

These are complementary, not redundant. A daemon can be healthy (heartbeat green) but emitting drifting values (drift red). A daemon can be silent (heartbeat red) but the last values it emitted may have been stable (drift gray).

### Section 17.3. Event Log

The existing `event-log-store.ts` (45 lines, validated) provides a pause/filter event log. v5 moves this under `features/event-log/` and exposes it as the `/streams` page's data source plus the EventLog panel inside DetailPanel.

### Section 17.4. Server-Side Observability

The substrate ships structured JSON logs to stdout via structlog. Log levels are configurable via `NGS_LOG_LEVEL`. Every log line carries trace_id, canvas_id (when relevant), pack_id (when relevant), and event.

Prometheus metrics are optional, gated by `NGS_METRICS_ENABLED=true`. When enabled, metrics expose at `/metrics` covering request rates and latencies per endpoint, WebSocket connection counts, StreamHub lag per stream, and pack registration health.

Client-side logging uses a thin `lib/logging/` wrapper around console with structured payloads, suppressed in production unless `localStorage.NGS_DEBUG=true`.

## Section 18. Testing

The frontend test stack has three tiers:
- **Vitest** for component tests covering the pack registry, port compatibility rules, and canvas-store mutations.
- **Cypress** (existing) for the 11 spec files / 841 lines of E2E tests at `frontend/cypress/`. v5 keeps these.
- **Playwright** for new v5 surface tests covering project workspace, run replay, pack registry, login flow.

Existing root-level Playwright scripts (`e2e_*.py`) are preserved for backward compatibility but their assertion content is ported into named Playwright tests under `tests/e2e/` during the migration (MIGRATION-v5 Section 4).

Backend: pytest with httpx for unit and integration tests. Pack contract conformance runs as a CI test loading every pack and asserting validatePackManifest.

## Section 19. Performance Budget

Canvas size: proven at 30 nodes / 50 edges (v2 baseline), aspirational at 100 nodes / 200 edges contingent on perf test pass. Beyond aspirational, users split into multiple canvases connected by canvas-ref nodes.

Stream throughput per tier: interactive up to 50 events per second across all subscribed streams per canvas after 500ms coalescing (= ~25 batches per second peak); realtime up to 500 events per second per connection (no client throttle); background up to 5 events per second.

Stream count per pack: soft-capped at 50; above this the single-XREAD multiplex (Section 9) is preferred.

Latency budgets target P95: canvas save round-trip under 250 milliseconds for a 30-node canvas; canvas cold open under 500 milliseconds; session restore for a 10-tab project under 1 second; drift PSI compute over a 1000-sample window under 50 milliseconds client-side.

## Section 20. Out of Scope

Explicitly not in v1: multi-user, organizations, teams, permissions; real-time collaborative editing with multiple cursors; server-side rendering; plugin marketplace UI; mobile canvas editing; authoring nodes outside the running app; auto-migration on canvas open; cross-canvas data-flow edges (streams handle this); audio/video as base port types.

## Section 21. Appendices

### Appendix A. Glossary

Canvas: a saved React Flow surface within a project; the unit of observability work. Canvas kind: the type-level template — which nodes available, default seed, hasRuns. Daemon: a producer process that publishes to Redis streams; the substrate observes, never spawns. Edge: a connection between two nodes' ports. Node: an instance of a NodeDef on a canvas with position, config, and a runtime component. Pack: a versioned bundle of canvas kinds, node definitions, port definitions, stream definitions, and optionally a daemon spec. Port: a typed input or output on a node. Project: the top-level container. Run: one execution of a daemon's work, snapshot-pinned to a canvas version (only for kinds with hasRuns). Stream: a Redis stream a daemon publishes to; tiered and coalesced per the manifest.

### Appendix B. Diff Versus SPEC-v4

Items reversed from v4 to v5:
- `research-v2 → research` collapse: revoked. Both canvas kinds ship in link-forge pack.
- "Frame-level coalescing (no 500ms throttle)": revoked. The existing 500ms throttle stays; realtime tier can override per-stream.
- "Cypress is a vestigial dep, rip it": revoked. 11 working spec files / 841 lines. Keep.
- "BUILD_NEW_IN_V5 for psi.ts, Sparkline.tsx, charts/, edges/, tests/visual/, scripts/": revoked. All ship in v2. v5 integrates.
- "Restore NodeDetailModal.tsx": revoked. It's gone, replaced by DetailPanel + EventLog. v5 documents this.
- "Migration 008 to add UNIQUE on graph_versions(graph_id, version)": revoked. Already a composite PK in migrations/001_init.sql.
- "Build new in v5: drift-matrix node": revoked. Already exists as DriftMatrixNode.tsx.

Items added in v5 not in v4:
- The `experiments` canvas kind and the `experiments` pack (entirely new architectural pillar that v4 missed).
- The `breathing_heatmap`, `h1_loop` nodes in topo-confidence pack.
- The `RestEndpointDef` in the pack manifest (for experiments canvas's REST data flow).
- The throttleMsOverride field on StreamDef (for realtime tier overrides).
- The pg_partman dependency for node_observations partition management.
- The drift-vs-heartbeat observability split in Section 17.2.
- The lib/hooks/ directory carrying useExperimentData, useH1LoopData, useNodeHistory, useNodeStats.
- The components/panels/ directory (DetailPanel 646 lines, EventLog 151 lines).
- 3 new stores documented: drift-store, event-log-store, experiment-store.
- 3 new server modules documented: experiment_data, experiment_parser, h1_loop_data.

Items corrected from v4:
- NODE_REGISTRY count: 25 entries, not 18.
- CanvasType: 4 variants (pipeline, research, research2, experiments), not 3.
- Pipeline canvas: 10 nodes, not 7.
- canvas-store.ts line anchors: `setGraphMeta` at line 142 (not ~99), `starredPapers` at line 29 + 62 + 88-103, `r2_state` detection at line 194 (loadGraph) + line 93 (toggleStar).
- ws/client.ts: throttle at line 36, scheduleFlush 152-163, flushPending 165-173, drift push 94-106, linkforge bypass 108-115.
- streamhub.py stream_event emit at line 75 (not ~73), with field order `type, node_id, stream, cursor, payload, ts`.
- 23 Redis streams becomes 24 (`breathing_profile` added post-CLAUDE.md).
- migrations/002 statement order: DROP COLUMN first, then ADD CONSTRAINT.

### Appendix C. Migration Index

See MIGRATION-v5.md for the step-by-step refactor-to-pack-shape plan. See v5-deltas.md for the file-by-file action table (leave / move / refactor / build).
