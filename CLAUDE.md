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
python synthetic_daemon.py       # fake streaming data (no GPU needed)

# Skip NGS when starting the rest of the pipeline:
bash ~/start-research-pipeline.sh --no-dashboard
```

NGS observes topo-confidence compute scoring (topology features, persistence diagrams, confidence gauges). It does NOT observe link-forge ingestion events — those are separate systems with no cross-system event bridge.

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

- Full spec: `SPEC.md`
- Plan: `~/.claude/plans/c-users-aaron-downloads-compass-artifact-concurrent-narwhal.md`
- `~/pipeline-studio/src/lib/store/pipeline-store.ts` — Zustand + zundo pattern to adapt
- `~/pipeline-studio/src/components/canvas/PipelineCanvas.tsx` — ReactFlow wrapper to adapt

## Working norms

- `grep -r "topo_confidence\|TopoConfidence" server/substrate/` must always return 0 lines
- Redis Streams use plain `XREAD` (not `XREADGROUP`) for broadcast semantics
- All streams: `MAXLEN ~ 10000`
- React Flow: `useNodesData(id)` never `useNodes()`, `memo()` all custom nodes, module-scope `nodeTypes`
