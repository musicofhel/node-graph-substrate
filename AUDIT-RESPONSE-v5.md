# Audit Response v5

This document records every revision applied from v4 → v5, organized by category. It is the audit trail for "why does v5 differ from v4?"

## Source of Revisions

The v5 documents incorporate three distinct sources of correction:

1. **The Discrepancy Audit Report (v4 audit)** — 18 discrepancies found via doc-level fetch against the v2 repo. Caught the phantom paths (elk-layout, drift/psi, charts/, edges/, Sparkline, tests/visual/, scripts/) and the Cypress mistake.

2. **The V2 Ground Truth Report (post-audit re-read)** — 35 contradictions, 6 corrections, 8 open questions. Caught the React Router package name, the streamhub multiplex shape, the WS endpoint param name (`graph_id` not `canvas_id`), the snake_case backfill correction (lf_*, r2_* not Lf*, R2*), and confirmed graph_versions PK already exists.

3. **The Local Filesystem Validation (Claude Code pass, commit `487b9b1`)** — 111 PASS, 0 FAIL, 44 CONTRADICTIONS. Caught what the prior reports missed: the experiments canvas + pack, the breathing/h1_loop/drift_matrix nodes, the 500ms throttle that exists, the deletion of NodeDetailModal, the existence of DetailPanel/EventLog/charts/edges/Sparkline/psi/ELK/tests/visual/scripts, the 25-entry registry (not 18), the 4-variant CanvasType (not 3), and the 3 stores + 4 hooks + 3 server modules the prior reports omitted.

The validation pass is the source of truth. Anything in v4 that contradicted commit `487b9b1` is corrected in v5.

## Revisions by Category

### Category A: Decisions Revoked

Six v4 decisions are revoked in v5 because the codebase contradicts them.

**A1. Research-v2 collapse into research.** v4 locked in "research-v2 → research; no need for both" based on a Round 2 user statement. The validation showed both canvas kinds ship and have distinct nodes (research: 4 nodes; research2: 5 nodes including `r2_state` which carries `starredPapers` persistence). Forcing a collapse creates migration risk for zero architectural benefit. **v5 keeps both kinds** in the link-forge pack.

**A2. Frame-level coalescing (no 500ms throttle).** v4 spec'd pure RAF coalescing as a correctness improvement. Validation showed `throttleMs = 500` at `ws/client.ts:36` is intentional and the two-stage pattern `scheduleFlush → 500ms throttle → flushPending → RAF → batchFn` is what production runs. v4's "frame-level" claim was based on a misreading. **v5 preserves the throttle** with a per-stream `throttleMsOverride` field for the realtime tier.

**A3. Cypress as vestigial.** v4 said to rip Cypress. Validation showed Cypress 15.15.0 is a devDependency with 11 spec files / 841 lines of working tests. **v5 keeps Cypress**, adds Playwright for new v5 surface only.

**A4. BUILD_NEW_IN_V5 for psi.ts, Sparkline, charts/, edges/, tests/visual/, scripts/.** v4 classified these as new builds. Validation showed all six already exist. **v5 reclassifies as LEAVE or MOVE**, not BUILD.

**A5. Restore NodeDetailModal.tsx.** v4 listed it as a v2 file to port. Validation showed it was deleted in commit `a1ff77d` (2026-05-17) and replaced by `DetailPanel.tsx` (646 lines) + `EventLog.tsx` (151 lines) under `components/panels/`. **v5 does not restore it**; documents the replacement.

**A6. Migration 008 to add UNIQUE on graph_versions(graph_id, version).** v4 included this as a prerequisite for the runs FK. Validation showed `migrations/001_init.sql` already declares `(graph_id, version)` as a composite PRIMARY KEY. **v5 does not include migration 008**; the runs FK references the existing PK.

### Category B: Decisions Added

Eight architectural additions are net-new in v5 because v4 did not know about them.

**B1. The `experiments` canvas kind and the experiments pack.** v4 had no knowledge of this. Validation revealed a complete fourth pillar with its own canvas type, 4 nodes (experiment_cloud, algorithm_selector, experiment_roi, findings_summary), its own Zustand store, two existing hooks (useExperimentData 218 lines, useH1LoopData 273 lines), and three server modules (experiment_data 185 lines, experiment_parser 107 lines, h1_loop_data 97 lines). v5 makes experiments its own pack rather than folding into topo-confidence because the lifecycle is different (REST-driven batch projections, no streams) and the pack seam is cleaner.

**B2. Three new nodes in the topo-confidence pack.** DriftMatrixNode (169 lines), BreathingHeatmapNode (248 lines), H1LoopNode (519 lines with 7 h1-loop sub-components). v4's "7 nodes in pipeline canvas" becomes v5's 10 nodes.

**B3. The `RestEndpointDef` in the pack manifest.** Needed for the experiments canvas's REST-driven data flow. The pack contract gains `restEndpoints?: RestEndpointDef[]` alongside `streams[]`.

**B4. The `throttleMsOverride` field on StreamDef.** Per-stream override for realtime tier, preserves the 500ms default for interactive/background.

**B5. The drift-vs-heartbeat observability split.** v4 invented `pack:<id>:heartbeat` without knowing the drift stack existed. v5 documents them as complementary: heartbeat answers "is the daemon alive?", drift answers "are the values stable?". Both are needed.

**B6. The lib/hooks/ directory.** Four hooks already exist (useExperimentData, useH1LoopData, useNodeHistory, useNodeStats). v5 documents them; the generic two stay in lib/hooks/, the pack-specific two move to packs/<pack>/hooks/.

**B7. The components/panels/ directory.** DetailPanel + EventLog. Replaces v4's planned "right sidebar in features/canvas/DetailPanel.tsx" with the existing 646-line implementation.

**B8. Three new stores documented.** drift-store (145), event-log-store (45), experiment-store (27). v5 routes them: drift-store → features/drift/, event-log-store → features/event-log/, experiment-store → packs/experiments/.

### Category C: Factual Corrections

Five v4 factual claims are corrected in v5.

**C1. NODE_REGISTRY count.** v4: 18 entries. v5: 25 entries. Sources: SPEC.md §3 ("18 node definitions" — but this was at an earlier commit; the codebase has grown).

**C2. CanvasType variants.** v4: 3 (pipeline, research, research2). v5: 4 (adds experiments). Source: `registry.ts:296`.

**C3. Pipeline canvas nodes.** v4: 7. v5: 10 (adds drift_matrix, breathing_heatmap, h1_loop). Source: `registry.ts:298-313`.

**C4. canvas-store.ts line anchors.** v4 cited HANDOFF anchors ("starredPapers at lines 86-103", "r2_state at lines 175-180", "setGraphMeta ~line 99"). Validation showed `setGraphMeta` at line 142 (massively off from 99), `starredPapers` declaration at line 29 and initial value at line 62 and `toggleStar` body at lines 88-103 (v4's "86-103" was accidentally close for toggleStar but mislabeled), `r2_state` detection in loadGraph at line 194 and in toggleStar at line 93 (v4's "175-180" was wrong).

**C5. ws/client.ts line anchors.** v4 cited HANDOFF's "RAF coalescing at lines 54-77". Validation showed RAF + throttle logic spans lines 117-173 (scheduleFlush at 152-163, flushPending at 165-173), and the drift push happens before the linkforge bypass at lines 94-115. All anchors were stale.

### Category D: Backfill Corrections

The validation revealed that v4's migration backfill query used camelCase node-type prefixes (Lf*, R2*) which do not match the actual snake_case type_id values stored in Postgres.

**D1. The kind backfill query in migration 003** now uses snake_case prefixes correctly: `WHERE type_id LIKE 'lf\_%' ESCAPE '\'` and `WHERE type_id LIKE 'r2\_%' ESCAPE '\'` and `WHERE type_id LIKE 'research\_%' ESCAPE '\''`. v4's query would have matched zero rows.

**D2. The kind backfill query now includes the experiments case.** v4 had no `experiments` canvas kind, so its backfill could not classify experiment_cloud / algorithm_selector / experiment_roi / findings_summary nodes. v5's backfill assigns these to `kind = 'experiments'`.

**D3. UUID vs BIGINT in runs and workspace_session_state FKs.** v4's migration used BIGINT. Validation confirmed `migrations/001_init.sql` uses UUID throughout. v5's migrations use UUID for all FK columns.

### Category E: Validation Corrections (the v2 Ground Truth Report's own errors)

The V2 Ground Truth Report was wrong in three places, caught by the local validation. These are corrected in v5.

**E1. Coalescing.** Ground Truth Report claimed "No 500ms throttle exists; coalescing is per-animation-frame". Validation showed `throttleMs = 500` at `ws/client.ts:36`. **v5 reflects the actual 500ms + RAF pattern.**

**E2. Cypress.** Ground Truth Report claimed "no Cypress — Playwright only, per README". Validation showed Cypress is a devDependency with 11 active spec files. **v5 keeps Cypress.**

**E3. NodeDetailModal.** Ground Truth Report claimed it exists. Validation showed it was deleted. **v5 documents the deletion.**

### Category F: Forward-Compatible Additions

Three additions in v5 are forward-compatible — they document things that exist but were not load-bearing in v4.

**F1. SplitPane.tsx.** Exists at `components/canvas/SplitPane.tsx` (98 lines). v5 moves it to `features/canvas/SplitPane.tsx`.

**F2. The h1-loop/ subfolder.** Seven sub-components used by H1LoopNode. v5 moves them with the parent into `packs/topo-confidence/nodes/h1-loop/`.

**F3. The 7 precompute scripts in scripts/.** v4 listed scripts/ as BUILD_NEW. v5 documents that it already exists with 7 working files (precompute_breathing_cache, precompute_experiment_projections, precompute_h1_cycles, precompute_h1_umap, test_h1_cycles, conftest, requirements.txt) and adds three more (the moved synthetic_daemon, synthetic_linkforge, take_screenshots).

## How to Read This Document Going Forward

Treat this audit response as immutable. If a future revision needs to reverse one of these decisions, it goes into a new AUDIT-RESPONSE-v5.1 document, not this one. The point of recording these revisions is so that the next person to read SPEC-v5 (Aaron in three months, or a future Claude Code session, or another collaborator) can understand why the spec looks the way it does without re-deriving the reasoning from scratch.

The one open caveat: this document was written against commit `487b9b1`. If significant code changes land between this revision and the v5-migration branch starting, those should be captured as a v5.1 delta against the same baseline.
