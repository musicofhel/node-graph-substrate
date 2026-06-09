# NGS v5 Scaffold

This is the v5 redesign bundle for `musicofhel/node-graph-substrate`. **Unlike v3/v4, v5 is grounded in actual codebase reality** — every path, every line anchor, every architectural assumption was validated against commit `487b9b1` via local filesystem reads (`v5-anchors.md`, `ground_truth_validation.json`).

## What This Bundle Contains

Five documents and a scaffold of approximately 130 files.

**SPEC-v5.md** (~32 KB) — the canonical target architecture. Twenty-one sections plus three appendices, incorporating ground-truth-validated corrections to v4 across six categories: reversed decisions (research-v2 collapse revoked, frame-level coalescing revoked, Cypress rip revoked), added decisions (experiments pack, RestEndpointDef, drift-vs-heartbeat split, throttleMsOverride), factual corrections (25 NODE_REGISTRY entries not 18, 4-variant CanvasType, 10 pipeline nodes), backfill corrections (snake_case prefixes not camelCase, UUID not BIGINT), validation corrections (the 500ms throttle exists, Cypress is in use, NodeDetailModal is deleted), and forward-compatible additions (SplitPane, h1-loop subfolder, 7 precompute scripts).

**MIGRATION-v5.md** (~21 KB) — the refactor-to-pack-shape plan. Nine sections including the validated schema migrations 003-007 (no 008 — graph_versions PK already exists), the pack-leak rip list with line anchors from canvas-store.ts:29/62/88-103/93/194-197, the seventeen-step migration sequence, the validated port-as-is reference table covering every v2 file, and the validation checklist with grep-based assertions.

**v5-deltas.md** (~14 KB) — the file-by-file action table. For every file in the v2 codebase, what happens: LEAVE, MOVE, REFACTOR, BUILD, or RIP. ~186 files touched: 22% build-new, 27% move-only, 11% refactor, 22% leave-alone, 2% delete. The most actionable document for Claude Code to execute against.

**AUDIT-RESPONSE-v5.md** (~9 KB) — the audit trail explaining every revision from v4. Six categories (revoked decisions, added decisions, factual corrections, backfill corrections, validation corrections, forward-compatible additions), with the source of each correction traced to one of three sources: the v4 audit, the v2 Ground Truth Report, or the local filesystem validation pass.

**README-v5.md** (this file) — orientation.

**verify-paths.sh** — self-check script. Runs the 13 grep-based validations from MIGRATION-v5 Section 7 against the current working directory. Designed to be run during migration to catch regressions, not as a one-time audit.

**The scaffold itself** (`ngs-v5-scaffold.zip`) — file tree with stubs at every v5 location, with real content in the schema migrations, type definitions, pack manifest skeletons, and entry points. Stubs carry header comments pointing at the SPEC-v5 section they relate to.

## How v5 Differs From v4 — One Paragraph

v4 was 70% "build new things" because v4 was written against doc-level reads of the v2 codebase that were stale. v5 is 22% build new because the codebase already shipped drift observability, ELK auto-layout, PSI math, custom edges, Sparkline, DetailPanel, the experiments canvas, the H1 loop visualization, the breathing heatmap, the visual test suite, and the scripts directory. v5's migration is mostly mechanical refactoring: extract pack manifests from the existing 25-entry NODE_REGISTRY, move 51 files into pack folders, refactor the canvas-store to strip link-forge leaks, extend the WS client with resume support, refactor StreamHub to multiplex per tier. The architectural seam (pack contract, routing, project workspace, run model, pages, login flow, Cmd+K) is still net-new.

## Using This Bundle

1. Read **SPEC-v5.md** end to end. It is the target architecture and the design contract.
2. Read **AUDIT-RESPONSE-v5.md** to understand why v5 differs from v4. Skim if you trust the v5 docs; read carefully if you want to challenge any decision.
3. Read **MIGRATION-v5.md** to understand the seventeen-step transition plan.
4. Open **v5-deltas.md** in a second window when you start the migration. This is the action table you check against as you move files.
5. Run **`verify-paths.sh`** locally to confirm the current repo state matches the migration's preconditions. Run it again after each major migration step.

## What This Scaffold Does Not Include

- Updated `package.json` / `pyproject.toml`. New dependencies (React Router v7, TanStack Query, Radix Primitives, cmdk, structlog, pg_partman) are enumerated in SPEC-v5 Section 15. Add them by hand to avoid clobbering existing deps.
- The Postgres image with pg_partman pre-installed. Update `docker-compose.yml` during migration step 2.
- Working tests beyond the existing v2 Cypress and tests/visual/ suites. New v5-surface Playwright tests get written during migration step 6+.
- Production code in the BUILD-classified files. Those are stubs with header comments; the real implementation follows the migration sequence.

## Honest Caveats Carried Forward From v4

The aspirational 100-node canvas performance budget still needs a real perf test pass. The proven v2 baseline is 30 nodes per canvas.

The compatibility-range mechanism in SPEC-v5 Section 12 is a contract pack authors must honor. The runtime respects `acceptsRuntimeRange` but doesn't enforce backward-compatibility within the range — that's the pack author's responsibility.

The pg_partman dependency is the recommended choice for `node_observations` partition management. If the deployment target cannot install Postgres extensions, the fallback is a FastAPI background task. This is acceptable but adds operational complexity.

The cookie-based WebSocket authentication path is more robust than the v3 `Sec-WebSocket-Protocol` smuggling, but requires a login screen and session lifecycle management. For single-user localhost deployments, `NGS_ALLOW_LOOPBACK=true` makes the friction skippable.

## What's Honestly Different This Time

The v3 and v4 docs both shipped to you with phantom paths and stale anchors because the planning happened against doc-level fetches that lagged the code. v5 is the first revision built on a confirmed local filesystem read. That doesn't make v5 immune to drift — if you ship more code before the migration starts, line anchors will move again — but the structural decisions (which packs exist, what nodes go where, what stores live where, what migrations are needed) are grounded in what actually exists rather than what once existed.

The verify-paths.sh script exists precisely so you can catch drift before it ships. Run it before each migration step.

## When You Start the Migration

The recommended starting commit is `git checkout -b v5-migration` from `main` at `487b9b1` or later. The first three commits land doc reorg, schema migration 003, and schema migration 004 — each independently testable. After that, the migration is the seventeen-step sequence in MIGRATION-v5 Section 5.

If something fails in a way the spec did not anticipate, document it. A v5.1 revision is the right answer; mute "make it work" is not.
