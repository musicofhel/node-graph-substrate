# v5 Deltas — Actionable File Table

This document tells you, for every file in the v2 codebase, exactly what happens to it in v5. Four action verbs only: **LEAVE**, **MOVE**, **REFACTOR**, **BUILD**, **RIP**.

- **LEAVE**: file stays where it is, no edits or trivial edits.
- **MOVE**: `git mv` to a new path; minimal content edits to fix imports.
- **REFACTOR**: substantial content changes, possibly with a move.
- **BUILD**: net-new file in v5; no v2 source.
- **RIP**: delete entirely.

Every row is validated against `v5-anchors.md` (commit `487b9b1`).

## Frontend Source Files

### `frontend/src/` root-level

| v2 path | Action | v5 path | Notes |
|---|---|---|---|
| `main.tsx` | LEAVE | `main.tsx` | Vite entry, no changes needed |
| `App.tsx` | REFACTOR | `App.tsx` | Strip to thin provider + router composition; init/WS logic moves to `pages/canvas/CanvasPage.tsx` |
| `index.css` | LEAVE | `index.css` | Tailwind entry |

### `frontend/src/types/`

| v2 path | Action | v5 path | Notes |
|---|---|---|---|
| `types/nodes.ts` | REFACTOR | `types/domain.ts` (merge) + `types/pack.ts` (split) | Extract NodeDefinition into pack.ts; domain types into domain.ts |
| `types/messages.ts` | REFACTOR | `types/messages.ts` | Add `subscribe_with_resume` and `resumed` to union |

### `frontend/src/lib/`

| v2 path | Action | v5 path | Notes |
|---|---|---|---|
| `lib/nodes/registry.ts` (320 lines) | REFACTOR → RIP | (split into 4 pack manifests; deleted after Phase C of Section 4.4) | Source of truth for all 25 NODE_REGISTRY entries; extract to packs |
| `lib/nodes/handle-colors.ts` | MOVE | `lib/ports/handle-colors.ts` | Generic handle styling |
| `lib/store/canvas-store.ts` (290 lines) | REFACTOR | `features/canvas/canvas-store.ts` | Strip starredPapers/flushUnstarred/r2_state per Section 3 rip list |
| `lib/store/ui-store.ts` (49 lines) | MOVE | `features/workspace/ui-store.ts` | Sidebar collapse, theme — workspace-level UI |
| `lib/store/drift-store.ts` (145 lines) | MOVE | `features/drift/drift-store.ts` | Drift-store ships in v2 |
| `lib/store/event-log-store.ts` (45 lines) | MOVE | `features/event-log/event-log-store.ts` | Event log ships in v2 |
| `lib/store/experiment-store.ts` (27 lines) | MOVE | `packs/experiments/store.ts` | Cross-node experiment state, experiments-pack-specific |
| `lib/ws/client.ts` (207 lines) | REFACTOR | `lib/ws/client.ts` | Add `subscribe_with_resume`, track lastIdByStream per Section 4.8 |
| `lib/layout/elk-layout.ts` (181 lines) | LEAVE | `lib/layout/elk-layout.ts` | ELK ships in v2 |
| `lib/layout/elk-worker.ts` (50 lines) | LEAVE | `lib/layout/elk-worker.ts` | ELK worker ships in v2 |
| `lib/drift/psi.ts` (38 lines) | MOVE | `features/drift/psi.ts` | PSI math ships in v2 |
| `lib/hooks/useNodeHistory.ts` (30 lines) | LEAVE | `lib/hooks/useNodeHistory.ts` | Generic — any node can use |
| `lib/hooks/useNodeStats.ts` (64 lines) | LEAVE | `lib/hooks/useNodeStats.ts` | Generic |
| `lib/hooks/useExperimentData.ts` (218 lines) | MOVE | `packs/experiments/hooks/useExperimentData.ts` | Experiments-pack-specific |
| `lib/hooks/useH1LoopData.ts` (273 lines) | MOVE | `packs/topo-confidence/hooks/useH1LoopData.ts` | Topo-confidence-pack-specific |

### `frontend/src/components/canvas/`

| v2 path | Action | v5 path | Notes |
|---|---|---|---|
| `components/canvas/SubstrateCanvas.tsx` (134) | MOVE | `features/canvas/SubstrateCanvas.tsx` | Generic React Flow surface |
| `components/canvas/CanvasControls.tsx` (160) | MOVE | `features/canvas/CanvasControls.tsx` | Toolbar (save/load, autolayout, flush starred) |
| `components/canvas/TabBar.tsx` (92) | MOVE + RENAME | `features/workspace/ProjectTabBar.tsx` | Chrome-style tabs become workspace-level (one tab = one open canvas in current project) |
| `components/canvas/PipelineTimeline.tsx` (62) | MOVE | `packs/link-forge/components/PipelineTimeline.tsx` | Horizontal slider for paper navigation; link-forge-specific |
| `components/canvas/SplitPane.tsx` (98) | MOVE | `features/canvas/SplitPane.tsx` | Resizable split pane |
| `components/canvas/node-types.ts` (56) | REFACTOR → RIP | (content distributed across 4 pack manifests; deleted after Phase C) | Flat snake_case map |

### `frontend/src/components/charts/` (LEAVE entire directory)

| v2 path | Action | v5 path |
|---|---|---|
| `components/charts/DistributionChart.tsx` (115) | LEAVE | `components/charts/DistributionChart.tsx` |
| `components/charts/StatsSummary.tsx` (56) | LEAVE | `components/charts/StatsSummary.tsx` |
| `components/charts/TimeSeriesChart.tsx` (149) | LEAVE | `components/charts/TimeSeriesChart.tsx` |

### `frontend/src/components/edges/` (LEAVE entire directory)

| v2 path | Action | v5 path |
|---|---|---|
| `components/edges/edge-types.ts` (6) | LEAVE | `components/edges/edge-types.ts` |
| `components/edges/StaleEdge.tsx` (59) | LEAVE | `components/edges/StaleEdge.tsx` |

### `frontend/src/components/panels/` (LEAVE entire directory)

| v2 path | Action | v5 path |
|---|---|---|
| `components/panels/DetailPanel.tsx` (646) | LEAVE | `components/panels/DetailPanel.tsx` |
| `components/panels/EventLog.tsx` (151) | LEAVE | `components/panels/EventLog.tsx` |

### `frontend/src/components/linkforge/`

| v2 path | Action | v5 path | Notes |
|---|---|---|---|
| `components/linkforge/PaperPool.tsx` | MOVE | `packs/link-forge/components/PaperPool.tsx` | Pack-specific |
| `components/linkforge/PaperCard.tsx` | MOVE | `packs/link-forge/components/PaperCard.tsx` | |
| `components/linkforge/PaperDetail.tsx` | MOVE | `packs/link-forge/components/PaperDetail.tsx` | |

### `frontend/src/components/sidebar/`

| v2 path | Action | v5 path | Notes |
|---|---|---|---|
| `components/sidebar/NodePalette.tsx` | REFACTOR | `features/canvas/NodePalette.tsx` | Read pack-registry instead of CANVAS_NODE_TYPES directly |

### `frontend/src/components/nodes/` (25 .tsx files + h1-loop subfolder)

**Topo-confidence pack** (10 nodes → `packs/topo-confidence/nodes/`):

| v2 file | Action | v5 path |
|---|---|---|
| `nodes/PromptInputNode.tsx` (216) | MOVE | `packs/topo-confidence/nodes/PromptInputNode.tsx` |
| `nodes/HiddenStateCloudNode.tsx` (119) | REFACTOR | `packs/topo-confidence/nodes/HiddenStateCloudNode.tsx` (lazy R3F load) |
| `nodes/FeatureBarsNode.tsx` (118) | MOVE | `packs/topo-confidence/nodes/FeatureBarsNode.tsx` |
| `nodes/PersistenceDiagramNode.tsx` (118) | MOVE | `packs/topo-confidence/nodes/PersistenceDiagramNode.tsx` |
| `nodes/ConfidenceGaugeNode.tsx` (98) | MOVE | `packs/topo-confidence/nodes/ConfidenceGaugeNode.tsx` |
| `nodes/BridgeMonitorNode.tsx` (96) | MOVE | `packs/topo-confidence/nodes/BridgeMonitorNode.tsx` |
| `nodes/ExplainWaterfallNode.tsx` (301) | MOVE | `packs/topo-confidence/nodes/ExplainWaterfallNode.tsx` |
| `nodes/DriftMatrixNode.tsx` (169) | MOVE | `packs/topo-confidence/nodes/DriftMatrixNode.tsx` |
| `nodes/BreathingHeatmapNode.tsx` (248) | MOVE | `packs/topo-confidence/nodes/BreathingHeatmapNode.tsx` |
| `nodes/H1LoopNode.tsx` (519) | REFACTOR | `packs/topo-confidence/nodes/H1LoopNode.tsx` (lazy R3F load) |
| `nodes/h1-loop/` (7 sub-components) | MOVE | `packs/topo-confidence/nodes/h1-loop/*` |

**Experiments pack** (4 nodes → `packs/experiments/nodes/`):

| v2 file | Action | v5 path |
|---|---|---|
| `nodes/ExperimentCloudNode.tsx` (242) | MOVE | `packs/experiments/nodes/ExperimentCloudNode.tsx` |
| `nodes/AlgorithmSelectorNode.tsx` (86) | MOVE | `packs/experiments/nodes/AlgorithmSelectorNode.tsx` |
| `nodes/ExperimentROINode.tsx` (63) | MOVE | `packs/experiments/nodes/ExperimentROINode.tsx` |
| `nodes/FindingsSummaryNode.tsx` (61) | MOVE | `packs/experiments/nodes/FindingsSummaryNode.tsx` |

**Link-forge pack** (13 nodes → `packs/link-forge/nodes/`):

| v2 file | Action | v5 path |
|---|---|---|
| `nodes/LfStageCard.tsx` (187) | MOVE | `packs/link-forge/nodes/LfStageCard.tsx` |
| `nodes/LfCoordinatorNode.tsx` (24) | MOVE | `packs/link-forge/nodes/LfCoordinatorNode.tsx` |
| `nodes/LfStatsNode.tsx` (56) | MOVE | `packs/link-forge/nodes/LfStatsNode.tsx` |
| `nodes/LfAutoRelNode.tsx` (51) | MOVE | `packs/link-forge/nodes/LfAutoRelNode.tsx` |
| `nodes/PipelineGroupNode.tsx` (19) | MOVE | `packs/link-forge/nodes/PipelineGroupNode.tsx` |
| `nodes/ResearchBridgeNode.tsx` (66) | MOVE | `packs/link-forge/nodes/ResearchBridgeNode.tsx` |
| `nodes/ResearchCoordinatorNode.tsx` (124) | MOVE | `packs/link-forge/nodes/ResearchCoordinatorNode.tsx` |
| `nodes/PaperPoolSection.tsx` (78) | MOVE | `packs/link-forge/nodes/PaperPoolSection.tsx` |
| `nodes/R2BridgeNode.tsx` (76) | MOVE | `packs/link-forge/nodes/R2BridgeNode.tsx` |
| `nodes/R2CoordinatorNode.tsx` (127) | MOVE | `packs/link-forge/nodes/R2CoordinatorNode.tsx` |
| `nodes/R2StatsNode.tsx` (80) | MOVE | `packs/link-forge/nodes/R2StatsNode.tsx` |
| `nodes/R2AutoRelNode.tsx` (78) | MOVE | `packs/link-forge/nodes/R2AutoRelNode.tsx` |
| `nodes/R2StateNode.tsx` (6) | MOVE | `packs/link-forge/nodes/R2StateNode.tsx` |

**Core pack** (2 shells → `features/canvas/`, not into a pack):

| v2 file | Action | v5 path |
|---|---|---|
| `nodes/BaseNodeShell.tsx` (97) | MOVE | `features/canvas/BaseNodeShell.tsx` |
| `nodes/Sparkline.tsx` (49) | MOVE | `features/canvas/Sparkline.tsx` |

Reason BaseNodeShell and Sparkline are in features/canvas/ rather than packs/core/nodes/: they are shared chrome for every pack's nodes, not nodes themselves. The core pack's `nodes/` folder contains generic substrate nodes (StreamSubscriber, JSONInspector, TimeSeriesViewer) and the three reference nodes (CanvasRef, RunRef, NodeRef).

## Frontend Files to BUILD

### `frontend/src/app/`

| BUILD path | Source | Notes |
|---|---|---|
| `app/router.tsx` | BUILD | React Router v7 createBrowserRouter setup |
| `app/providers.tsx` | BUILD | QueryClient, Theme, PackRegistry, WS lifecycle |
| `app/layout/AppShell.tsx` | BUILD | Three-pane shell |
| `app/layout/Sidebar.tsx` | BUILD | Six fixed items |
| `app/layout/TopBar.tsx` | BUILD | Breadcrumb, Cmd+K trigger, status dot |
| `app/errors/RootErrorBoundary.tsx` | BUILD | |
| `app/errors/PackRegistryErrorPage.tsx` | BUILD | |
| `app/errors/NotFoundPage.tsx` | BUILD | |

### `frontend/src/pages/`

| BUILD path | Notes |
|---|---|
| `pages/home/HomePage.tsx` | Recent projects, recent canvases |
| `pages/projects/ProjectsListPage.tsx` | + empty state |
| `pages/project/ProjectPage.tsx` | ProjectTabBar + Outlet, session restore |
| `pages/canvas/CanvasPage.tsx` | Composes SubstrateCanvas + DetailPanel + NodePalette; absorbs v2 App.tsx's init flow |
| `pages/run-compare/RunComparePage.tsx` | Side-by-side run snapshots |
| `pages/streams/StreamsPage.tsx` | Wraps event-log-store |
| `pages/daemons/DaemonsPage.tsx` | Reads pack:*:heartbeat streams |
| `pages/packs/PacksListPage.tsx` | + `pages/packs/PackDetailPage.tsx` |
| `pages/settings/SettingsPage.tsx` | + subroutes for connections/appearance/keyboard |
| `pages/login/LoginPage.tsx` | Bearer-token entry → POST /api/login |

### `frontend/src/features/` (BUILD new ones)

| BUILD path | Notes |
|---|---|
| `features/workspace/workspace-store.ts` | Open tabs, active tab, per-canvas viewport |
| `features/workspace/useProjects.ts` | TanStack Query hooks |
| `features/workspace/useProjectSession.ts` | Hydrate + debounced persist |
| `features/workspace/PackUpgradeDialog.tsx` | Pack version upgrade UI |
| `features/runs/runs-store.ts` | TanStack Query cache + scrubber state |
| `features/runs/RunSelector.tsx` | Picker in CanvasToolbar |
| `features/runs/RunScrubber.tsx` | Linear-replay scrubber |
| `features/runs/RunDiff.tsx` | Diff overlay for /compare |
| `features/streams/streams-store.ts` | Wraps event-log-store with subscription state |
| `features/streams/StreamTail.tsx` | Virtual-scrolled live event list |
| `features/daemons/DaemonStatusCard.tsx` | One per daemon |
| `features/search/CommandPalette.tsx` | cmdk + Radix Dialog |
| `features/search/useGlobalSearch.ts` | TanStack Query hook |
| `features/errors/useApiErrorHandler.ts` | onError driver for TanStack Query |

### `frontend/src/packs/` (BUILD pack manifests + minimal pack-store)

| BUILD path | Notes |
|---|---|
| `packs/core/manifest.ts` | Zero canvas kinds; base ports + ref nodes |
| `packs/core/ports.ts` | Re-exports base port types as PortDefs |
| `packs/core/nodes/CanvasRefNode.tsx` | BUILD |
| `packs/core/nodes/RunRefNode.tsx` | BUILD |
| `packs/core/nodes/NodeRefNode.tsx` | BUILD |
| `packs/core/nodes/StreamSubscriberNode.tsx` | BUILD generic subscriber |
| `packs/core/nodes/JSONInspectorNode.tsx` | BUILD |
| `packs/core/nodes/TimeSeriesViewerNode.tsx` | BUILD |
| `packs/topo-confidence/manifest.ts` | 'pipeline' kind, 10 nodes, 8 streams |
| `packs/topo-confidence/kinds/pipeline/seed.ts` | Default seed |
| `packs/topo-confidence/kinds/pipeline/palette.ts` | paletteNodeIds |
| `packs/topo-confidence/kinds/pipeline/migrations.ts` | pack version migrations |
| `packs/experiments/manifest.ts` | 'experiments' kind, 4 nodes, 0 streams, restEndpoints |
| `packs/experiments/kinds/experiments/seed.ts` | Default seed |
| `packs/experiments/kinds/experiments/palette.ts` | |
| `packs/link-forge/manifest.ts` | Two kinds: 'research' + 'research2', 13 nodes, 16 streams |
| `packs/link-forge/store.ts` | starredPapers + flushUnstarred + r2_state hooks |
| `packs/link-forge/kinds/research/seed.ts` | |
| `packs/link-forge/kinds/research/palette.ts` | |
| `packs/link-forge/kinds/research2/seed.ts` | |
| `packs/link-forge/kinds/research2/palette.ts` | |
| `packs/link-forge/hooks/useStarredPapersRestore.ts` | onCanvasLoad lifecycle for r2_state restore |
| `packs/link-forge/hooks/useStarredPapersPersist.ts` | onCanvasSave lifecycle for r2_state write |

### `frontend/src/lib/` (BUILD new ones)

| BUILD path | Notes |
|---|---|
| `lib/pack-registry.ts` | Pack discovery + validation at startup |
| `lib/ports/types.ts` | Base port types (json, tensor, etc.) |
| `lib/ports/compat.ts` | Port connection compatibility |
| `lib/persistence/session.ts` | localStorage mirror |
| `lib/persistence/api.ts` | fetch() wrappers |
| `lib/logging/index.ts` | Client-side structured logger |

### `frontend/src/components/ui/` (BUILD Radix-based primitives)

| BUILD path | Radix primitive |
|---|---|
| `components/ui/Button.tsx` | Radix Slot |
| `components/ui/Tabs.tsx` | Radix Tabs |
| `components/ui/Input.tsx` | Native input |
| `components/ui/Dialog.tsx` | Radix Dialog |
| `components/ui/Tooltip.tsx` | Radix Tooltip |
| `components/ui/Toast.tsx` | Radix Toast |
| `components/ui/StatusDot.tsx` | (custom — WS connection status) |

### `frontend/src/types/` (BUILD pack contract)

| BUILD path | Notes |
|---|---|
| `types/domain.ts` | Project, Canvas, Run, NodeRecord, EdgeRecord |
| `types/pack.ts` | PackManifest, NodeDef, PortDef, StreamDef, RestEndpointDef, DaemonDef |

## Backend Source Files

### `server/substrate/` root

| v2 path | Action | v5 path | Notes |
|---|---|---|---|
| `__init__.py` | LEAVE | `__init__.py` | |
| `main.py` (361) | REFACTOR | `main.py` | Strip route handlers; mount api/* routers; keep lifespan + middleware |
| `db.py` (67) | LEAVE | `db/connection.py` | asyncpg pool |
| `crud.py` (277) | REFACTOR | `db/models.py` | Query functions stay; move to db/ subfolder |
| `ws.py` (52) | REFACTOR | `ws.py` | Add `subscribe_with_resume` handler |
| `streamhub.py` (103) | REFACTOR | `streamhub.py` | Tier-aware multiplex (Section 4.9) |
| `sdk.py` (82) | REFACTOR | `sdk/` (directory) | Split into pack.py / component.py / ports.py / validate.py; preserve SocketType enum in ports.py |
| `registry.py` (46) | REFACTOR | `sdk/registry.py` | ComponentRegistry → PackRegistry |
| `schemas.py` (60) | LEAVE | `schemas.py` | Pydantic HTTP models |
| `messages.py` (83) | REFACTOR | `messages.py` | Add subscribe_with_resume / resumed types |
| `linkforge_history.py` (56) | MOVE | `packs/link_forge/history.py` | Pack-specific |
| `experiment_data.py` (185) | MOVE | `packs/experiments/data.py` | |
| `experiment_parser.py` (107) | MOVE | `packs/experiments/parser.py` | |
| `h1_loop_data.py` (97) | MOVE | `packs/topo_confidence/h1_loop_data.py` | |

### `server/substrate/api/` (BUILD all)

| BUILD path | Notes |
|---|---|
| `api/projects.py` | CRUD + pack_versions |
| `api/canvases.py` | CRUD + PATCH ops + pack-upgrade |
| `api/runs.py` | List/get/compare + ON CONFLICT creation |
| `api/streams.py` | List + tail |
| `api/packs.py` | List + manifest reflection |
| `api/daemons.py` | Read heartbeat streams |
| `api/session.py` | Workspace session |
| `api/auth.py` | POST /api/login, POST /api/logout |
| `api/search.py` | Cmd+K backend |
| `api/experiments.py` | Wraps packs/experiments/data + parser |
| `api/h1_loops.py` | Wraps packs/topo_confidence/h1_loop_data |

### `server/substrate/components/` (refactor to per-pack)

The current `components/__init__.py` has 18 imports (validated). Each component moves to its pack's components folder:

| v2 path | v5 path |
|---|---|
| `components/prompt_input.py` | `packs/topo_confidence/components/prompt_input.py` |
| `components/hidden_state_cloud.py` | `packs/topo_confidence/components/hidden_state_cloud.py` |
| `components/feature_bars.py` | `packs/topo_confidence/components/feature_bars.py` |
| `components/persistence_diagram.py` | `packs/topo_confidence/components/persistence_diagram.py` |
| `components/confidence_gauge.py` | `packs/topo_confidence/components/confidence_gauge.py` |
| `components/bridge_monitor.py` | `packs/topo_confidence/components/bridge_monitor.py` |
| `components/explain_waterfall.py` | `packs/topo_confidence/components/explain_waterfall.py` |
| `components/drift_matrix.py` | `packs/topo_confidence/components/drift_matrix.py` |
| `components/breathing_heatmap.py` | `packs/topo_confidence/components/breathing_heatmap.py` |
| `components/lf_coordinator.py` | `packs/link_forge/components/lf_coordinator.py` |
| `components/lf_stats.py` | `packs/link_forge/components/lf_stats.py` |
| `components/lf_autorel.py` | `packs/link_forge/components/lf_autorel.py` |
| `components/research_coordinator.py` | `packs/link_forge/components/research_coordinator.py` |
| `components/research_bridge.py` | `packs/link_forge/components/research_bridge.py` |
| `components/experiment_cloud.py` | `packs/experiments/components/experiment_cloud.py` |
| `components/algorithm_selector.py` | `packs/experiments/components/algorithm_selector.py` |
| `components/experiment_roi.py` | `packs/experiments/components/experiment_roi.py` |
| `components/findings_summary.py` | `packs/experiments/components/findings_summary.py` |

Each pack's `__init__.py` imports its own components (18 imports split across three packs). The substrate root `components/__init__.py` is **deleted**.

### `server/substrate/packs/` (BUILD manifests)

| BUILD path | Notes |
|---|---|
| `packs/__init__.py` | Hard-coded imports of each pack module |
| `packs/core/__init__.py` | |
| `packs/core/manifest.py` | Server-side mirror of frontend manifest |
| `packs/topo_confidence/__init__.py` | Imports the 9 topoconf components |
| `packs/topo_confidence/manifest.py` | |
| `packs/experiments/__init__.py` | Imports the 4 experiments components |
| `packs/experiments/manifest.py` | |
| `packs/link_forge/__init__.py` | Imports the 5 linkforge components |
| `packs/link_forge/manifest.py` | |

### `server/substrate/observability/` (BUILD)

| BUILD path | Notes |
|---|---|
| `observability/logging.py` | structlog setup |
| `observability/metrics.py` | Prometheus, gated by env var |

### `server/substrate/db/migrations/` (BUILD)

| BUILD path | Notes |
|---|---|
| `migrations/003_canvas_kind.sql` | Per MIGRATION-v5 Section 4.1 |
| `migrations/004_runs.sql` | |
| `migrations/005_node_observations.sql` | |
| `migrations/006_session_state.sql` | |
| `migrations/007_search_index.sql` | |

Note: no migration 008. graph_versions PK already exists.

The existing `migrations/001_init.sql` and `migrations/002_schema_fixes.sql` MOVE from repo root `migrations/` to `server/substrate/db/migrations/`.

## Test Files

| v2 path | Action | v5 path | Notes |
|---|---|---|---|
| `frontend/cypress/` (11 specs, 841 lines, +config) | LEAVE | `frontend/cypress/` | Keep Cypress suite |
| `tests/visual/` (existing) | LEAVE | `tests/visual/` | Visual regression runner + specs |
| `e2e_paper_pipeline.py` | REFACTOR | `tests/e2e/paper_pipeline.spec.py` | Port assertions into Playwright test |
| `e2e_race_audit.py` (27/27 passes) | REFACTOR | `tests/e2e/race_audit.spec.py` | |
| `e2e_race_audit_v2.py` (37/37 passes) | REFACTOR | `tests/e2e/race_audit_v2.spec.py` | |
| `e2e_visual_inspect.py` | REFACTOR | `tests/e2e/visual_inspect.spec.py` | |
| `e2e_deferred_features_audit.py` | RIP | (deleted) | Audited features now shipped; assertions stale |

After porting, the root `e2e_*.py` files are deleted. The new `tests/e2e/` subdirectory holds Playwright tests for v5's new surface (workspace, runs, packs, login, Cmd+K).

## Root Files

| v2 path | Action | v5 path | Notes |
|---|---|---|---|
| `README.md` | REFACTOR | `README.md` | Update to reflect v5 architecture |
| `CLAUDE.md` (68) | REFACTOR | `CLAUDE.md` | Reference SPEC-v5; update port table if changed |
| `SPEC.md` (72 KB) | MOVE | `docs/history/SPEC-v2.md` | Archive |
| `SPEC-linkforge-v2.md` (44 KB) | MOVE | `docs/history/SPEC-linkforge-v2.md` | Archive |
| `SPEC-tabs-and-linkforge.md` | MOVE | `docs/history/SPEC-tabs-and-linkforge.md` | Archive |
| `HANDOFF-tabs-linkforge.md` (24 KB) | MOVE | `docs/history/HANDOFF-tabs-linkforge.md` | Archive |
| `HANDOFF-drift-observability.md` (652 lines) | MOVE | `docs/history/HANDOFF-drift-observability.md` | Archive |
| `PLAN-tabs.md` | MOVE | `docs/history/PLAN-tabs.md` | Archive |
| `docker-compose.yml` | REFACTOR | `docker-compose.yml` | Update Postgres image to include pg_partman |
| `package.json` (root) | REFACTOR | (deleted; consolidate into frontend/package.json) | The root was a symlink/duplicate per v5-anchors |
| `package-lock.json` | LEAVE | `package-lock.json` | Lockfile |
| `synthetic_daemon.py` | MOVE | `scripts/synthetic_daemon.py` | |
| `synthetic_linkforge.py` | MOVE | `scripts/synthetic_linkforge.py` | |
| `take_screenshots.py` | MOVE | `scripts/take_screenshots.py` | |

## scripts/ (LEAVE entire directory)

| v2 path | Action |
|---|---|
| `scripts/precompute_breathing_cache.py` | LEAVE |
| `scripts/precompute_experiment_projections.py` | LEAVE |
| `scripts/precompute_h1_cycles.py` | LEAVE |
| `scripts/precompute_h1_umap.py` | LEAVE |
| `scripts/test_h1_cycles.py` | LEAVE |
| `scripts/conftest.py` | LEAVE |
| `scripts/__init__.py` | LEAVE |
| `scripts/requirements.txt` | LEAVE |

## daemons/ (LEAVE entire directory)

| v2 path | Action |
|---|---|
| `daemons/topoconf/Dockerfile` | LEAVE |
| `daemons/topoconf/pyproject.toml` | LEAVE |
| `daemons/topoconf/adapter.py` | LEAVE |
| `daemons/topoconf/topoconf_daemon.py` | LEAVE |

## Summary Counts

- **LEAVE** (no edits or trivial): 41 files / 4 directories left in place
- **MOVE** (`git mv` only): 51 files
- **REFACTOR** (substantial content edits): 20 files
- **BUILD** (net-new): ~70 files
- **RIP** (delete entirely): 4 files (registry.ts after Phase C, node-types.ts after Phase C, e2e_deferred_features_audit.py, root package.json)

The migration touches roughly 186 files. About 22% is build-new, 27% is move-only, 11% is refactor, 22% is left alone, and 2% is deletion.
