# CLAUDE.md — node-graph-substrate

## What this is

Self-hosted React Flow canvas + FastAPI + Redis Streams + Postgres that makes `~/topo-confidence` fully observable via live streaming. Three loops: graph CRUD (Postgres), request/response compute (FastAPI WS), subscriber fan-out (Redis Streams → WS → React Flow nodes).

**The substrate server NEVER imports topo-confidence.** Communication is Redis Streams only. The topo-confidence adapter runs in a separate daemon container.

## Port allocation

| Service  | Port | Avoids                              |
|----------|------|--------------------------------------|
| FastAPI  | 8080 | enterprise-pipeline 8000             |
| Vite     | 5173 | (clear)                              |
| Postgres | 5434 | enterprise-pipeline 5432, langfuse 5433 |
| Redis    | 6381 | enterprise-pipeline 6379, langfuse 6380 |

## Quick start

```bash
# PREFERRED — unified pipeline script starts NGS alongside link-forge + research-graph + autopilot:
bash ~/start-research-pipeline.sh
bash ~/start-research-pipeline.sh --status     # check what's running

# MANUAL — NGS only:
docker compose up                # postgres, redis, fastapi
cd frontend && npm run dev       # vite (native — not in Docker on WSL2)

# Synthetic daemon with real MATH-500 data (pre-computed, no GPU needed):
python scripts/synthetic_daemon.py --math500-cache data/math500_breathing_cache.json

# Pre-compute breathing cache from NPZ hidden states (one-time, ~5 min):
OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 python scripts/precompute_breathing_cache.py

# Skip NGS when starting the rest of the pipeline:
bash ~/start-research-pipeline.sh --no-dashboard
```

NGS observes three pipelines via 23 Redis streams: topo-confidence compute scoring (7 streams), link-forge paper ingestion (10 streams + autorel), and topo-confidence research lifecycle (5 streams). Three canvas types: pipeline (topo scoring), research (link-forge waterfall), research2 (R2 nodes with paper starring).

## MATH-500 breathing pipeline

Real data from `~/topo-confidence/pathway8_layerwise/data/math500/` (500 NPZ files, Qwen2.5-1.5B-Instruct).

- **Pre-compute**: `scripts/precompute_breathing_cache.py` — computes 8×28 participation ratio heatmaps (W=32 window) from real hidden states. Outputs `data/math500_breathing_cache.json` (daemon) + `frontend/public/math500_prompts.json` (frontend). Must set `OMP_NUM_THREADS=1` to avoid BLAS thread contention.
- **Daemon**: `scripts/synthetic_daemon.py --math500-cache` loads cache on startup, serves real heatmaps + correctness when `math_idx` is present in control messages, falls back to fake data otherwise.
- **Frontend**: PromptInputNode fetches `math500_prompts.json` on mount, pre-populates with MATH-500 problems. Navigation bar (◄/►) browses 500 problems. Demo mode auto-cycles every 15s with skip/back controls.
- **BreathingHeatmapNode**: SVG visualization — 8 positions × 28 layers, color-coded PR values, L19 sparkline, peak/collapse markers, correctness badge, subject/level tag.
- **ExplainWaterfallNode**: 13 TDA features with human-readable labels, clickable detail panels showing mechanistic interpretations, summary header with correctness + confidence + primary driver sentence. `top_n` and `sort_order` config fields wired up.

Generated data files are gitignored: `data/math500_breathing_cache.json`, `frontend/public/math500_prompts.json`.

## Build order (tracer-bullet slices)

| Slice | What                        | Gate                     |
|-------|-----------------------------|--------------------------|
| 0     | Hello-world (counter node)  | HARD GATE — blocks all   |
| 1     | Graph persistence (Postgres)| —                        |
| 2     | Computed node path          | —                        |
| 3     | Subscriber path + R3F       | —                        |
| 4     | Real topo-confidence adapter| —                        |
| 5     | Explain + calibration + polish | —                     |

## Corrected topo-confidence API (spec was wrong)

- **13 features** (not 7): see `topo_confidence/features.py:16-30` for `FEATURE_NAMES`
- **No public `extract_hidden_and_reduce`**: use `tc.extractor.extract(prompts)` → `{hidden_states, token_trajectories, token_counts}`
- **PH methods are private**: `feature_extractor._compute_ph()`, `_features_from_diagrams()`, `_reduce()`
- **PCA guard**: `extract_single()` needs `_pca` pre-fitted
- **`BridgeHealth.to_dict()`** converts int layer keys to strings
- Adapter hooks at 3 public seams: `extractor.extract()`, `feature_extractor.extract_single()`, `predict_confidence()`

## Key references

- v5 spec (canonical): `SPEC-v5.md`
- v5 migration plan: `MIGRATION-v5.md`
- v5 file action table: `v5-deltas.md`
- v2 spec (archived): `docs/history/SPEC-v2.md`
- `~/pipeline-studio/src/lib/store/pipeline-store.ts` — Zustand + zundo pattern to adapt
- `~/pipeline-studio/src/components/canvas/PipelineCanvas.tsx` — ReactFlow wrapper to adapt

## Working norms

- `grep -r "topo_confidence\|TopoConfidence" server/substrate/` must always return 0 lines
- Redis Streams use plain `XREAD` (not `XREADGROUP`) for broadcast semantics
- All streams: `MAXLEN ~ 10000`
- React Flow: `useNodesData(id)` never `useNodes()`, `memo()` all custom nodes, module-scope `nodeTypes`
