# Node-Graph Dashboard Substrate — Technical Specification v2

**Tracer Bullet 0 → Tracer Bullet 5: Making `musicofhel/topo-confidence` fully observable through a self-hosted, React-Flow-based research-pipeline canvas.**

Author: you, for you. Version 2.0, May 2026.

---

## TL;DR

- **The substrate is three loops glued together**: a **persisted graph CRUD** loop (Postgres-backed React Flow canvas with localStorage cache), a **request/response compute** loop (FastAPI WebSocket → component `build()` → result), and a **subscriber fan-out** loop (daemon → `XADD` → Redis Streams → server reader task → WebSocket → React Flow `updateNodeData`). Everything else — Component SDK, message envelope, the topo-confidence adapter — is plumbing around those three loops.
- **All method names, class signatures, and feature counts have been verified** against the actual `topo-confidence` source code at `~/topo-confidence/`. The v1 spec guessed wrong on the API surface (one class vs three, 7 features vs 13, wrong method names). This v2 uses exact signatures copy-pasted from source.
- **The build order is non-negotiable**: Slice 0 (Hello-World counter end-to-end) gates everything. If Slice 0 isn't green — Docker compose up, Redis container reachable, FastAPI WebSocket open, React Flow node showing a live integer — *no other work happens*. Slices 1–5 progressively turn on persistence, computed nodes, subscriber nodes, real topo-confidence, and calibration.

---

## 1. The topo-confidence API Surface (Verified)

Three classes compose the pipeline. `TopoConfidence` is the orchestrator that owns the other two.

### 1.1 Class Hierarchy

```
TopoConfidence (topo_confidence/confidence.py:24)
  ├── self.extractor: HiddenStateExtractor (topo_confidence/extractor.py:23)
  └── self.feature_extractor: TopologicalFeatureExtractor (topo_confidence/features.py:33)

BridgeMonitor (topo_confidence/integrations/monitor.py:59)  — standalone, not owned by TopoConfidence
```

### 1.2 HiddenStateExtractor

**File:** `~/topo-confidence/topo_confidence/extractor.py`

```python
class HiddenStateExtractor:
    def __init__(
        self,
        model_name: str,
        device: str = "auto",        # "auto" → "cuda" if available, else "cpu"
        dtype: str = "float16",      # "float16", "bfloat16", "float32"
        layers: list[int] | str = "last",  # "last", "terminal", or explicit list
    ) -> None

    @torch.no_grad()
    def extract(
        self,
        prompts: list[str],
        max_length: int = 512,
        batch_size: int = 8,
    ) -> dict[str, Any]:
        # Returns:
        # {
        #     "hidden_states": np.ndarray shape (n_prompts, hidden_dim),  # last-token only
        #     "token_trajectories": list[np.ndarray],  # each (n_tokens_i, hidden_dim)
        #     "token_counts": np.ndarray shape (n_prompts,),
        # }

    @torch.no_grad()
    def extract_with_output(
        self,
        prompts: list[str],
        max_new_tokens: int = 256,
        max_length: int = 512,
        batch_size: int = 8,
        collect_logits: bool = False,
    ) -> dict[str, Any]:
        # Returns above + {
        #     "generated_texts": list[str],
        #     "output_logits": list[np.ndarray],  # only if collect_logits=True
        # }

    # Public attributes:
    self.model_name: str
    self.device: str
    self.dtype: torch.dtype
    self.tokenizer: AutoTokenizer
    self.model: AutoModelForCausalLM
    self.layers: list[int]  # concrete layer indices
```

**Model loading** happens in `__init__` (extractor.py:42-57): `AutoModelForCausalLM.from_pretrained(model_name, dtype=..., device_map=...)` followed by `model.eval()`.

**Hidden state extraction** (extractor.py:66-119): uses `output_hidden_states=True` on the forward pass. The `layers` parameter selects which layer(s) to grab from `outputs.hidden_states` (tuple of `n_layers+1` tensors, index 0 = embeddings).

### 1.3 TopologicalFeatureExtractor

**File:** `~/topo-confidence/topo_confidence/features.py`

```python
FEATURE_NAMES = [                          # Line 16-30
    "H0_persistence_entropy",              # 0  — Shannon entropy of H0 lifetimes
    "H1_max_lifetime",                     # 1  — Maximum H1 feature lifetime
    "H0_total_persistence",                # 2  — Sum of H0 lifetimes
    "H0_n_features",                       # 3  — Count of H0 features
    "H1_persistence_entropy",              # 4  — Shannon entropy of H1 lifetimes
    "H1_n_features",                       # 5  — Count of H1 features
    "H2_n_features",                       # 6  — Count of H2 features (cavities/voids)
    "H2_total_persistence",                # 7  — Sum of H2 lifetimes
    "H2_persistence_entropy",              # 8  — Shannon entropy of H2 lifetimes
    "bridge_silhouette",                   # 9  — Position-0 silhouette in k=2 clustering
    "H0_ph_significance",                  # 10 — Z-score vs shuffled-token null
    "H1_ph_significance",                  # 11 — Z-score vs shuffled-token null
    "topological_sensitivity",             # 12 — Slope of H1 persistence vs Gaussian noise
]

class TopologicalFeatureExtractor:
    def __init__(
        self,
        method: str = "token_trajectory",
        max_dim: int = 2,          # max homology dimension (0, 1, 2)
        n_pca: int = 30,
        subsample: int = 100,
        null_k: int = 100,         # shuffled-token null iterations
        seed: int = 42,
    ) -> None

    @property
    def feature_names(self) -> list[str]:   # Returns list(FEATURE_NAMES)
    @property
    def n_features(self) -> int:            # Returns 13

    def extract(
        self,
        hidden_states: np.ndarray | None = None,   # unused for token_trajectory method
        token_trajectories: list[np.ndarray] | None = None,  # REQUIRED
    ) -> np.ndarray:
        # Returns shape (n_problems, 13)
        # SIDE EFFECT: fits PCA on pooled trajectories via _fit_pca()
        # For each trajectory:
        #   reduced = _reduce(traj)              → (n_tokens, n_pca)
        #   diagrams = _compute_ph(reduced)      → {0: H0, 1: H1, 2: H2}
        #   ph_feats = _features_from_diagrams(diagrams)  → ndarray(9,)
        #   bridge_sil = _compute_bridge_silhouette(reduced)  → float
        #   z_scores = ph_significance(subsampled)  → {0: float, 1: float}
        #   sensitivity = _compute_topological_sensitivity(subsampled) → float
        #   features[i] = [*ph_feats, bridge_sil, z0, z1, sensitivity]

    def extract_single(self, trajectory: np.ndarray) -> np.ndarray:
        # Returns shape (13,). Requires PCA already fitted via extract().

    # Internal methods the adapter accesses for visualization:
    def _fit_pca(self, all_points: np.ndarray) -> None
    def _reduce(self, points: np.ndarray) -> np.ndarray    # PCA transform
    def _compute_ph(self, points: np.ndarray) -> dict[int, np.ndarray]  # {dim: diagram}
    def _compute_bridge_silhouette(self, reduced: np.ndarray) -> float
    def _features_from_diagrams(self, diagrams) -> np.ndarray  # 9 PH features
    def _compute_topological_sensitivity(self, points) -> float

    # Public attributes:
    self._pca: PCA | None     # Fitted after calling extract()
```

**Bridge silhouette** (features.py:93-112): `KMeans(n_clusters=2, n_init=10).fit_predict(reduced)` → `silhouette_samples(reduced, labels)` → returns `float(sil_samples[0])`. Position 0 is always the bridge token. If `n_tokens < 10`, returns `0.0`.

**Persistence diagrams** (features.py:85-91): `ripser(points, maxdim=self.max_dim)` → diagrams per dimension. Each diagram is `ndarray(n_features, 2)` with columns `[birth, death]`.

### 1.4 TopoConfidence

**File:** `~/topo-confidence/topo_confidence/confidence.py`

```python
class TopoConfidence:
    def __init__(
        self,
        model_name: str = "Qwen/Qwen2.5-1.5B-Instruct",
        device: str = "auto",
        layers: list[int] | str = "last",
        calibration_size: int = 100,
    ) -> None:
        self.model_name = model_name
        self.extractor = HiddenStateExtractor(model_name, device=device, layers=layers)
        self.feature_extractor = TopologicalFeatureExtractor()
        self.calibrated = False
        # Internal: self._scaler, self._classifier, self._calibrator

    def calibrate(
        self,
        prompts: list[str],
        correct: np.ndarray,       # boolean/int array (1 = correct)
        method: str = "logistic",  # "logistic" or "isotonic"
    ) -> dict[str, float]:
        # Returns {"auroc": float, "accuracy": float, "brier_score": float, "n_samples": int}
        # Internally: extract → features → StandardScaler → LogisticRegression → CV metrics

    def predict_confidence(self, prompts: list[str]) -> np.ndarray:
        # Returns float array in [0, 1], shape (n_prompts,)
        # Requires calibrate() first.
        # Internally: extract → extract_single per traj → _predict_from_features

    def explain(self, prompt: str) -> dict[str, Any]:
        # Returns:
        # {
        #     "confidence": float,
        #     "features": {
        #         "H0_persistence_entropy": {
        #             "raw_value": float,
        #             "scaled_value": float,
        #             "coefficient": float,     # logistic regression weight
        #             "contribution": float,     # scaled_value * coefficient
        #         },
        #         ...  # 13 entries
        #     },
        #     "top_contributor": str,  # name of feature with largest |contribution|
        # }
        # Requires calibrate() first.

    def selective_predict(
        self,
        prompts: list[str],
        threshold: float = 0.7,
        max_new_tokens: int = 256,
    ) -> dict[str, Any]:
        # Returns {"answers": list[str|None], "confidences": ndarray,
        #          "answered_fraction": float, "expected_accuracy_on_answered": float}

    def save(self, path: str | Path) -> None
    def load(self, path: str | Path) -> None

    def _predict_from_features(self, features: np.ndarray) -> np.ndarray:
        # Internal: scaler.transform → classifier.predict_proba → optional isotonic
```

### 1.5 BridgeMonitor

**File:** `~/topo-confidence/topo_confidence/integrations/monitor.py`

```python
@dataclass
class BridgeHealth:
    healthy: bool
    bridge_at_pos0: dict[int, bool]          # {layer: whether pos 0 is bridge}
    silhouette_by_layer: dict[int, float]    # {layer: mean silhouette}
    pos0_silhouette_by_layer: dict[int, float]
    crystallized: bool
    anomaly_reason: str | None

    def summary(self) -> str    # "[HEALTHY] L7=bridge, L14=bridge, L24=core"
    def to_dict(self) -> dict   # JSON-serializable; layer keys become STRINGS

class BridgeMonitor:
    DEFAULT_CHECK_LAYERS = [7, 14, 24]

    def __init__(
        self,
        check_layers: list[int] | None = None,   # default: [7, 14, 24]
        bridge_threshold: float = 0.1,
        crystallization_threshold: float = 0.5,
    ) -> None

    def check(self, layer_hidden_states: dict[int, np.ndarray]) -> BridgeHealth
    def check_from_model(self, model, tokenizer, prompt, max_length=512) -> BridgeHealth
    def attach(self, model) -> None       # registers forward hooks
    def detach(self) -> None
    def check_captured(self) -> BridgeHealth
```

**Overhead:** ~0.002s per request (k-means + silhouette at 3 layers, no PH computation).

**`to_dict()` key conversion** (monitor.py:48-53): converts `int` layer keys to `str` in the output dict — e.g., `{"7": true, "14": true, "24": false}`.

### 1.6 Existing Visualization (Gradio App)

**File:** `~/topo-confidence/spaces/app.py`

The Gradio app is the reference implementation for visualization:
- **2D cluster plot** (line 158-225): `PCA(n_components=2)` on the 30-dim reduced space. Cluster A = `#58a6ff`, Cluster B = `#f97583`. Bridge tokens (`|sil| < 0.1`) = `#ffd700`. Position 0 = size 200, gold, white edge, annotated with token text.
- **Feature bars** (line 228-252): Horizontal barh, but **only 7 features** (pre-H2/significance/sensitivity). The substrate must show all 13.
- **Heuristic confidence** (line 132-153): `0.7 * clip(1 - (h0_ent - 1.5)/3, 0, 1) + 0.3 * clip(1 - |bridge_sil|/0.3, 0, 1)`. Thresholds: >=0.7 green, >=0.4 yellow, <0.4 red.

**The substrate extends this to 3D** (PCA n_components=3 for R3F), shows all 13 features, and adds persistence diagrams, bridge health, and feature attribution — none of which the Gradio app has.

---

## 2. Architecture Diagram

```
┌─────────────────────────────── BROWSER ────────────────────────────────┐
│  Vite dev server (5173) ──> React app                                  │
│    ├─ React Flow canvas (@xyflow/react v12)                            │
│    │    └─ Custom node components (PromptInput, FeatureBars, ...)      │
│    │         each subscribes to: useNodesData(id) for own data         │
│    ├─ R3F <Canvas> mounted inside HiddenStateCloudNode                 │
│    └─ WebSocket client (single, app-scoped, useRef)                    │
│         ├─ outbound: { type: "compute_request" | "subscribe" | ... }   │
│         └─ inbound:  { type: "stream_event" | "computation_result" }   │
│              └─> RAF-coalesced dispatch to Zustand store                │
│                   └─> updateNodeData(node_id, payload) [batched 60fps] │
└────────────────┬────────────────────────────────────┬──────────────────┘
                 │ HTTP (graph CRUD)                  │ WebSocket (events)
                 │  /api/graphs, /api/nodes, ...      │  /ws/canvas/{canvas_id}
                 ▼                                    ▼
┌──────────────────────── FASTAPI SERVER (uvicorn :8080) ────────────────┐
│                                                                        │
│  ┌────────────────────┐    ┌──────────────────────────────────────┐    │
│  │  HTTP routers       │    │  WebSocket endpoint                  │    │
│  │  - /api/graphs      │    │  - ConnectionManager (in-proc dict)  │    │
│  │  - /api/components  │    │  - per-conn: send_lock, reader_task  │    │
│  └────────┬────────────┘    └─────────────────┬────────────────────┘    │
│           │                                   │                        │
│           │                                   │ Redis stream reader    │
│           │                                   │ (one asyncio task per  │
│           │                                   │  stream-name, fans     │
│           │                                   │  out to all listeners) │
│           │                                   ▼                        │
│  ┌────────┴───────────┐   ┌─────────────────────────────────────────┐  │
│  │ ComponentRegistry  │   │ StreamHub                               │  │
│  │ - typed Component  │   │ - {stream_name: [WebSocket, ...]}       │  │
│  │   classes          │   │ - cursor per (client, stream)           │  │
│  │ - import map for   │   │ - launches XREAD BLOCK loops            │  │
│  │   React/Python     │   │ - replay: XRANGE from last cursor       │  │
│  └────────┬───────────┘   └────────┬────────────────────────────────┘  │
│           │                        │                                   │
│           │ exec build() on        │ XREAD via redis.asyncio           │
│           │ computed-node request  │                                   │
└───────────┼────────────────────────┼───────────────────────────────────┘
            │                        │
            ▼                        ▼
   ┌────────────────┐      ┌──────────────────┐      ┌───────────────────┐
   │  POSTGRES 16   │      │   REDIS 7.x      │      │  topo-confidence  │
   │  (:5434)       │      │  (:6381)         │      │  daemon           │
   │                │      │                  │      │  (sibling proc)   │
   │  - graphs      │      │  Streams:        │◄─────┤                   │
   │  - nodes       │      │  topoconf:*      │ XADD │  - holds GPU      │
   │  - edges       │      │                  │      │    transformer    │
   │  - node_configs│      │  Trim: MAXLEN ~  │      │  - publishes      │
   │  - graph_vers  │      │   10000 per stm  │      │    via TopoBridge │
   └────────────────┘      └──────────────────┘      └───────────────────┘
```

**Port allocation** (verified against existing docker-compose files):

| Port | Service | Conflicts avoided |
|------|---------|-------------------|
| 8080 | FastAPI server | 8000 (enterprise-pipeline) |
| 5173 | Vite frontend | 3000 (pipeline-studio), 3100 (langfuse) |
| 5434 | Postgres | 5432 (omniswipe), 5433 (langfuse-db) |
| 6381 | Redis | 6379 (enterprise-pipeline), 6380 (langfuse) |

**Ownership map:**

| Concern | Owned by | Persistence |
|---|---|---|
| Graph topology (nodes/edges) | Postgres `graphs` table | Durable (named volume) |
| Node config | Postgres `node_configs` | Durable |
| Node *runtime* state (cached data) | React Flow store (Zustand) + localStorage mirror | Browser session |
| Stream cursors | Server `StreamHub` per-conn | In-memory, replayed on reconnect |
| Execution state | FastAPI per-WS asyncio task | In-memory |
| Event history | Redis Streams (capped MAXLEN ~10000) | Ephemeral by design |

---

## 3. Project Structure

```
~/node-graph-substrate/
├── docker-compose.yml
├── .env.example
├── CLAUDE.md
│
├── server/                                  # Python FastAPI server
│   ├── pyproject.toml
│   ├── Dockerfile
│   └── substrate/
│       ├── __init__.py
│       ├── main.py                          # FastAPI app factory, lifespan, routers
│       ├── ws.py                            # ConnectionManager (per-socket lock)
│       ├── streamhub.py                     # Redis XREAD fan-out (one task per stream)
│       ├── messages.py                      # Pydantic v2 WS envelope
│       ├── registry.py                      # ComponentRegistry — loads Component subclasses
│       ├── crud.py                          # Postgres graph CRUD (asyncpg)
│       ├── db.py                            # asyncpg pool management
│       ├── schemas.py                       # Pydantic models for HTTP API
│       ├── sdk.py                           # Component base class (NodeKind, Socket, etc.)
│       ├── linkforge_history.py             # Redis hash queries for paper history + research lifecycle
│       └── components/
│           ├── __init__.py
│           ├── prompt_input.py              # PromptInput computed node
│           ├── hidden_state_cloud.py        # HiddenStateCloud subscriber
│           ├── feature_bars.py              # FeatureBars subscriber
│           ├── persistence_diagram.py       # PersistenceDiagram subscriber
│           ├── confidence_gauge.py          # ConfidenceGauge subscriber
│           ├── bridge_monitor.py            # BridgeMonitor subscriber
│           ├── explain_waterfall.py         # ExplainWaterfall subscriber
│           ├── lf_coordinator.py            # LinkForge pipeline coordinator (10 streams)
│           ├── lf_stats.py                  # LinkForge pipeline stats (completed stream)
│           ├── lf_autorel.py                # AutoRel sweep status subscriber
│           ├── research_bridge.py           # Research bridge subscriber
│           └── research_coordinator.py      # Research lifecycle coordinator (5 streams)
│
├── daemons/
│   └── topoconf/
│       ├── Dockerfile                       # python:3.11 + topo-confidence deps
│       ├── pyproject.toml
│       ├── topoconf_daemon.py               # Entrypoint: stdin → adapter → XADD
│       └── adapter.py                       # TopoBridge: wraps three topo-confidence classes
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── postcss.config.mjs
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                           # Init flow, WS wiring, linkforge event handler
│       ├── index.css
│       ├── types/
│       │   ├── nodes.ts                     # NodeDefinition, HandleType, etc.
│       │   └── messages.ts                  # WS message type unions
│       ├── lib/
│       │   ├── nodes/
│       │   │   ├── registry.ts              # 18 node definitions + CanvasType + CANVAS_NODE_TYPES
│       │   │   └── handle-colors.ts         # Handle type → color
│       │   ├── store/
│       │   │   ├── canvas-store.ts          # Zustand + zundo (undo/redo, starredPapers)
│       │   │   └── ui-store.ts              # Sidebar state
│       │   └── ws/
│       │       └── client.ts                # WebSocket client + reconnect + RAF coalescing
│       └── components/
│           ├── canvas/
│           │   ├── SubstrateCanvas.tsx       # ReactFlow wrapper
│           │   ├── CanvasControls.tsx        # Toolbar (save/load + flush starred)
│           │   ├── TabBar.tsx               # Chrome-style graph tabs
│           │   ├── NodeDetailModal.tsx       # Node inspection overlay
│           │   ├── PipelineTimeline.tsx      # Horizontal slider for paper navigation
│           │   └── node-types.ts            # type_id → React component map (snake_case keys)
│           ├── nodes/
│           │   ├── BaseNodeShell.tsx         # Shared header/border/handles
│           │   ├── PromptInputNode.tsx       # Text area + "Analyze" button
│           │   ├── HiddenStateCloudNode.tsx  # R3F Canvas + Points BufferGeometry (3D)
│           │   ├── FeatureBarsNode.tsx       # 13 horizontal bars, color by dimension
│           │   ├── PersistenceDiagramNode.tsx # Birth-death scatter H0/H1/H2
│           │   ├── ConfidenceGaugeNode.tsx   # SVG arc gauge 0-1
│           │   ├── BridgeMonitorNode.tsx     # Layer health matrix
│           │   ├── ExplainWaterfallNode.tsx  # 13-feature contribution waterfall
│           │   ├── LfStageCard.tsx           # Unified 10-stage renderer (polymorphic)
│           │   ├── LfCoordinatorNode.tsx     # Pipeline coordinator status
│           │   ├── LfStatsNode.tsx           # Pipeline stats accumulator
│           │   ├── LfAutoRelNode.tsx         # AutoRel sweep status
│           │   ├── PipelineGroupNode.tsx     # Parent container for paper stage groups
│           │   ├── ResearchBridgeNode.tsx    # Research v1 bridge
│           │   ├── ResearchCoordinatorNode.tsx # Research v1 coordinator
│           │   ├── PaperPoolSection.tsx      # Reusable embedded paper pool (used by R2 nodes)
│           │   ├── R2BridgeNode.tsx          # Research v2 bridge (with paper pool)
│           │   ├── R2CoordinatorNode.tsx     # Research v2 coordinator
│           │   ├── R2StatsNode.tsx           # Research v2 stats
│           │   ├── R2AutoRelNode.tsx         # Research v2 autorel
│           │   └── R2StateNode.tsx           # Research v2 starred paper persistence (hidden)
│           ├── sidebar/
│           │   └── NodePalette.tsx           # Canvas-type-aware drag-and-drop palette
│           └── linkforge/
│               ├── PaperPool.tsx             # History + live paper card grid with filters
│               ├── PaperCard.tsx             # Compact paper summary card
│               └── PaperDetail.tsx           # Full paper detail + research lifecycle
│
├── migrations/
│   ├── 001_init.sql
│   └── 002_schema_fixes.sql                 # Dropped type_version, added edge FKs
│
├── synthetic_daemon.py                      # Fake topoconf:scoring:* events (no GPU needed)
├── synthetic_linkforge.py                   # Fake linkforge:* pipeline events
├── e2e_paper_pipeline.py                    # Playwright E2E: paper pipeline flow
├── e2e_race_audit.py                        # Playwright race condition audit (27/27 pass)
├── e2e_race_audit_v2.py                     # Second-pass race audit (37/37 pass)
├── e2e_visual_inspect.py                    # Visual inspection E2E
└── take_screenshots.py                      # Screenshot generation
```

**Deferred (not yet implemented — see HANDOFF):**
- `frontend/src/lib/layout/elk-layout.ts` — ELK.js auto-layout
- `frontend/src/lib/layout/elk-worker.ts` — ELK worker thread
- `frontend/src/components/panels/ConfigPanel.tsx` — node config editor panel
- `frontend/src/components/panels/EventLog.tsx` — raw WS event viewer

---

## 4. Component SDK Design

Simplified from Langflow's `Component` API. Two node kinds: computed (pull-based `build()`) and subscriber (push-based `on_event()`). Uses semantic socket types matching the topo-confidence domain rather than generic primitives.

```python
# server/substrate/sdk.py
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class SocketType(str, Enum):
    PROMPT = "prompt"
    EXTRACTION = "extraction"
    FEATURES = "features"
    CONFIDENCE = "confidence"
    BRIDGE_HEALTH = "bridge_health"
    EXPLANATION = "explanation"
    DIAGRAMS = "diagrams"


class NodeKind(str, Enum):
    COMPUTED = "computed"
    SUBSCRIBER = "subscriber"


@dataclass
class Socket:
    id: str
    type: SocketType
    label: str = ""


@dataclass
class ComponentManifest:
    type_id: str
    kind: NodeKind
    label: str
    category: str
    inputs: list[Socket]
    outputs: list[Socket]
    subscribed_streams: list[str]
    config_fields: list[dict[str, Any]]


class Component:
    type_id: str = ""
    kind: NodeKind = NodeKind.COMPUTED
    label: str = ""
    category: str = "input"
    inputs: list[Socket] = []
    outputs: list[Socket] = []
    subscribed_streams: list[str] = []
    config_fields: list[dict[str, Any]] = []

    def __init__(self, node_id: str, config: dict[str, Any] | None = None):
        self.node_id = node_id
        self.config = config or {}

    async def on_init(self) -> None:
        pass
    async def build(self, **inputs: Any) -> dict[str, Any]:
        raise NotImplementedError
    async def on_event(self, stream: str, event: dict[str, Any]) -> None:
        pass
    async def on_config_change(self, config: dict[str, Any]) -> None:
        self.config = config
    async def on_destroy(self) -> None:
        pass

    @classmethod
    def manifest(cls) -> ComponentManifest:
        return ComponentManifest(
            type_id=cls.type_id,
            kind=cls.kind,
            label=cls.label,
            category=cls.category,
            inputs=cls.inputs,
            outputs=cls.outputs,
            subscribed_streams=cls.subscribed_streams,
            config_fields=cls.config_fields,
        )
```

**React-component pairing:** explicit registry at `frontend/src/components/canvas/node-types.ts`, using snake_case `type_id` keys (matching `NODE_REGISTRY` in `registry.ts`):

```ts
// frontend/src/components/canvas/node-types.ts
export const nodeTypes: NodeTypes = {
  prompt_input: PromptInputNode,
  feature_bars: FeatureBarsNode,
  hidden_state_cloud: HiddenStateCloudNode,
  persistence_diagram: PersistenceDiagramNode,
  confidence_gauge: ConfidenceGaugeNode,
  bridge_monitor: BridgeMonitorNode,
  explain_waterfall: ExplainWaterfallNode,
  lf_stage: LfStageCard,
  lf_coordinator: LfCoordinatorNode,
  lf_stats: LfStatsNode,
  lf_autorel: LfAutoRelNode,
  research_coordinator: ResearchCoordinatorNode,
  research_bridge: ResearchBridgeNode,
  lf_pipeline_group: PipelineGroupNode,
  r2_bridge: R2BridgeNode,
  r2_coordinator: R2CoordinatorNode,
  r2_stats: R2StatsNode,
  r2_autorel: R2AutoRelNode,
  r2_state: R2StateNode,
};
```

Adding a new node = one Python file + one React file + one line in `node-types.ts` + one entry in `registry.ts`.

---

## 5. WebSocket Protocol

**One WebSocket per browser tab**, scoped to `/ws/canvas/{canvas_id}?token=…`. Multiplexes all nodes on that canvas.

### 5.1 ConnectionManager

```python
# server/substrate/ws.py
from fastapi import WebSocket, WebSocketDisconnect
import asyncio, json
from typing import Any

class ConnectionManager:
    def __init__(self):
        self._conns: dict[str, set[WebSocket]] = {}
        self._send_locks: dict[WebSocket, asyncio.Lock] = {}

    async def connect(self, canvas_id: str, ws: WebSocket):
        await ws.accept()
        self._conns.setdefault(canvas_id, set()).add(ws)
        self._send_locks[ws] = asyncio.Lock()

    def disconnect(self, canvas_id: str, ws: WebSocket):
        self._conns.get(canvas_id, set()).discard(ws)
        self._send_locks.pop(ws, None)

    async def send(self, ws: WebSocket, msg: dict[str, Any]):
        lock = self._send_locks.get(ws)
        if lock is None: return
        async with lock:
            try:
                await ws.send_text(json.dumps(msg, separators=(",", ":")))
            except (WebSocketDisconnect, RuntimeError):
                self._send_locks.pop(ws, None)

    async def broadcast(self, canvas_id: str, msg: dict[str, Any]):
        await asyncio.gather(
            *(self.send(ws, msg) for ws in list(self._conns.get(canvas_id, set()))),
            return_exceptions=True,
        )
```

**Per-socket `asyncio.Lock`:** Starlette's `WebSocket.send()` is not safe under concurrent callers (a stream reader and a `build()` completion can race).

### 5.2 Message Envelope (Pydantic v2)

```python
# server/substrate/messages.py
from pydantic import BaseModel, Field
from typing import Any, Literal, Annotated, Union

# Inbound (client → server)
class ComputeRequest(BaseModel):
    type: Literal["compute_request"] = "compute_request"
    request_id: str
    node_id: str
    inputs: dict[str, Any] = Field(default_factory=dict)

class ConfigUpdate(BaseModel):
    type: Literal["config_update"] = "config_update"
    node_id: str
    config: dict[str, Any]

class Resubscribe(BaseModel):
    type: Literal["resubscribe"] = "resubscribe"
    subscriptions: list[dict[str, str]]

ClientMessage = Annotated[
    Union[ComputeRequest, ConfigUpdate, Resubscribe],
    Field(discriminator="type"),
]

# Outbound (server → client)
class GraphLoaded(BaseModel):
    type: Literal["graph_loaded"] = "graph_loaded"
    graph_id: str
    version: int
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    manifests: list[dict[str, Any]]

class NodeStateUpdated(BaseModel):
    type: Literal["node_state_updated"] = "node_state_updated"
    node_id: str
    data_patch: dict[str, Any]

class StreamEvent(BaseModel):
    type: Literal["stream_event"] = "stream_event"
    node_id: str
    stream: str
    cursor: str
    payload: dict[str, Any]
    ts: float

class ComputationResult(BaseModel):
    type: Literal["computation_result"] = "computation_result"
    request_id: str
    node_id: str
    ok: bool
    outputs: dict[str, Any] | None = None
    error: str | None = None

class ErrorMsg(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str
    node_id: str | None = None

class ReplayGap(BaseModel):
    type: Literal["replay_gap"] = "replay_gap"
    node_id: str
    stream: str
    requested_from: str
    earliest_available: str
```

### 5.3 Concrete Wire Examples

```json
// Canvas opens → server sends full graph
< {"type":"graph_loaded","graph_id":"g_42","version":3,
   "nodes":[{"id":"n1","type":"topoconf.PromptInput","position":{"x":0,"y":0},
             "data":{"prompt":"What is 2+2?"}}],
   "edges":[],
   "manifests":[{"type_id":"topoconf.PromptInput","kind":"computed",
                 "react_component":"PromptInputNode"}]}

// User clicks "Analyze"
> {"type":"compute_request","request_id":"r_8","node_id":"n1","inputs":{}}

// Daemon publishes events as it works; server relays via StreamHub
< {"type":"stream_event","node_id":"n2",
   "stream":"topoconf:scoring:hidden_state_cloud",
   "cursor":"1715300000000-0","ts":1715300000.123,
   "payload":{"run_id":"a1b2c3d4","coords_3d":[[0.1,0.2,0.3],...],"cluster_labels":[0,1,1,...],"pos0_silhouette":-0.08,"bridge_mask":[true,false,...],"n_tokens":47}}

< {"type":"stream_event","node_id":"n3",
   "stream":"topoconf:scoring:persistence_computed",
   "cursor":"1715300000050-0","ts":1715300000.173,
   "payload":{"run_id":"a1b2c3d4","H0":[[0.0,0.42],[0.0,0.31]],"H1":[[0.18,0.55]],"H2":[]}}

< {"type":"stream_event","node_id":"n4",
   "stream":"topoconf:scoring:features_computed",
   "cursor":"1715300000100-0","ts":1715300000.223,
   "payload":{"run_id":"a1b2c3d4","features":{"H0_persistence_entropy":2.31,"H1_max_lifetime":0.55,"H0_total_persistence":1.84,"H0_n_features":12,"H1_persistence_entropy":0.42,"H1_n_features":3,"H2_n_features":0,"H2_total_persistence":0.0,"H2_persistence_entropy":0.0,"bridge_silhouette":-0.08,"H0_ph_significance":3.2,"H1_ph_significance":1.1,"topological_sensitivity":-2.7},"feature_names":["H0_persistence_entropy","H1_max_lifetime","H0_total_persistence","H0_n_features","H1_persistence_entropy","H1_n_features","H2_n_features","H2_total_persistence","H2_persistence_entropy","bridge_silhouette","H0_ph_significance","H1_ph_significance","topological_sensitivity"]}}

// Final compute result
< {"type":"computation_result","request_id":"r_8","node_id":"n1","ok":true,
   "outputs":{"confidence":0.72,"features":{"H0_persistence_entropy":2.31}}}
```

### 5.4 Reconnection and Replay

Client uses exponential backoff (1s, 2s, 4s, capped at 10s) with `shouldReconnect: () => true`. On reconnect, sends:

```json
{"type":"resubscribe","subscriptions":[
   {"node_id":"n2","stream":"topoconf:scoring:hidden_state_cloud","last_id":"1715300000000-3"}
]}
```

Server replays from `last_id` using `XREAD`. If the ID has been trimmed, server sends `replay_gap` and the node shows current state only.

**Cold-start strategy:** subscriber nodes opening into an active stream get only new events by default (`$` cursor). Each node manifest can declare `cold_start: "latest"` (issues `XREVRANGE … + - COUNT 1`) or `{ last_n: 50 }` for history.

---

## 6. Redis Streams Schema

### 6.1 Stream Naming

`{project}:{stage}:{event_type}` — colons for readability with `redis-cli MONITOR`.

### 6.2 Why XREAD, Not XREADGROUP

Consumer groups *partition* messages (one message → one consumer in the group). A dashboard wants *broadcast* (one message → every connected client). **Plain `XREAD` with `$` for live tail** fans out to every blocked reader — documented at `redis.io/docs/latest/commands/xread/`.

### 6.3 Per-Server Reader Task Topology

One `asyncio.Task` per stream-name per FastAPI process. Fans events to all subscribed WebSockets via `ConnectionManager.send`. Keeps Redis connections bounded (1 per stream, not 1 per client × stream).

```python
# server/substrate/streamhub.py — sketch
class StreamHub:
    def __init__(self, redis: Redis, manager: ConnectionManager):
        self.redis = redis
        self.manager = manager
        self.tasks: dict[str, asyncio.Task] = {}
        self.subs: dict[str, dict[WebSocket, set[str]]] = {}  # stream → {ws → {node_ids}}

    def subscribe(self, ws, stream: str, node_id: str):
        per = self.subs.setdefault(stream, {})
        per.setdefault(ws, set()).add(node_id)
        if stream not in self.tasks:
            self.tasks[stream] = asyncio.create_task(self._run(stream))

    async def _run(self, stream: str):
        last_id = "$"
        while stream in self.subs and self.subs[stream]:
            resp = await self.redis.xread({stream: last_id}, block=5000, count=100)
            if not resp: continue
            for _, entries in resp:
                for eid, fields in entries:
                    last_id = eid
                    payload = json.loads(fields[b"data"])
                    for ws, node_ids in list(self.subs[stream].items()):
                        for nid in node_ids:
                            await self.manager.send(ws, {
                                "type": "stream_event",
                                "node_id": nid, "stream": stream,
                                "cursor": eid.decode(), "payload": payload,
                                "ts": int(eid.decode().split("-")[0]) / 1000,
                            })
        self.tasks.pop(stream, None)
```

### 6.4 Event Catalog (Verified Against topo-confidence Return Types)

| Stream | Payload | Size | Trigger |
|---|---|---|---|
| `topoconf:scoring:extraction_started` | `{run_id, prompt_preview, model_name}` | ~200B | Pipeline start |
| `topoconf:scoring:extraction_completed` | `{run_id, n_tokens, hidden_dim}` | ~100B | After `extractor.extract()` |
| `topoconf:scoring:hidden_state_cloud` | `{run_id, coords_3d:[[x,y,z],...], cluster_labels:[0\|1,...], silhouette_samples:[float,...], pos0_silhouette:float, bridge_mask:[bool,...], n_tokens:int}` | ~30-90KB | After PCA 3D + k-means |
| `topoconf:scoring:persistence_computed` | `{run_id, H0:[[birth,death],...], H1:[[b,d],...], H2:[[b,d],...]}` | ~5KB | After `_compute_ph()` |
| `topoconf:scoring:features_computed` | `{run_id, features:{name:float} (13 entries), feature_names:[str]}` | ~1KB | After `extract_single()` |
| `topoconf:scoring:confidence_scored` | `{run_id, confidence:float, heuristic_confidence:float, calibrated:bool, method:str}` | ~200B | After scoring |
| `topoconf:scoring:bridge_health` | `{run_id, healthy, bridge_at_pos0:{"7":bool,...}, silhouette_by_layer:{"7":float,...}, pos0_silhouette_by_layer:{"7":float,...}, crystallized, anomaly_reason}` | ~500B | After `check_from_model()` |
| `topoconf:scoring:explain_result` | `{run_id, confidence, features:{name:{raw_value,scaled_value,coefficient,contribution}}, top_contributor}` | ~2KB | After `explain()` |
| `topoconf:calibration:completed` | `{run_id, metrics:{auroc,accuracy,brier_score,n_samples}, method}` | ~300B | After `calibrate()` |

**Note:** `BridgeHealth.to_dict()` converts layer int keys to strings — `{"7": true}` not `{7: true}`.

---

## 7. Postgres Schema

```sql
-- migrations/001_init.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE graphs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  current_version INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE TABLE graph_versions (
  graph_id    UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  version     INT  NOT NULL,
  snapshot    JSONB NOT NULL,
  message     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (graph_id, version)
);

CREATE TABLE nodes (
  id          TEXT PRIMARY KEY,
  graph_id    UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  type_id     TEXT NOT NULL,
  position_x  REAL NOT NULL,
  position_y  REAL NOT NULL,
  width       REAL,
  height      REAL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON nodes (graph_id);

-- Note: type_version was in 001_init.sql but dropped in 002_schema_fixes.sql

CREATE TABLE node_configs (
  node_id     TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON node_configs USING GIN (config jsonb_path_ops);

CREATE TABLE edges (
  id          TEXT PRIMARY KEY,
  graph_id    UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  source      TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target      TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  source_handle TEXT,
  target_handle TEXT,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ON edges (graph_id);

-- Edge FK constraints added in 002_schema_fixes.sql
```

**Persistence strategy: Postgres + localStorage cache.** Postgres is the source of truth. localStorage mirrors the current graph for instant reload — if `localStorage.version === postgres.current_version`, skip the network fetch. On save, write-through: PATCH Postgres first, then update localStorage. On version mismatch, Postgres wins.

**Two-tab concurrency:** structural mutations go via `PATCH /api/graphs/{id}/ops` with `expected_version` (optimistic concurrency). On success, broadcast `node_state_updated` to all canvas connections. On 409, client re-syncs. Last-writer-wins for `node_configs.config`.

---

## 8. The topo-confidence Adapter

**File:** `daemons/topoconf/adapter.py`

The adapter wraps the three topo-confidence classes and publishes pipeline events to Redis Streams. It accesses internal methods (`_reduce`, `_compute_ph`, `_compute_bridge_silhouette`) for intermediate visualization data that the public API doesn't expose. This is a deliberate choice — the alternative (reimplementing PCA+ripser+kmeans) is worse. If internals change, the adapter breaks loudly and is ~10 lines to fix.

```python
"""Bridge between topo-confidence library and Redis Streams."""
from __future__ import annotations
import asyncio, json, uuid, os, logging
from typing import Any
import numpy as np
from redis.asyncio import Redis
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_samples

from topo_confidence import TopoConfidence, BridgeMonitor

logger = logging.getLogger(__name__)
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
PROJECT = "topoconf"


def _stream(stage: str, event: str) -> str:
    return f"{PROJECT}:{stage}:{event}"


async def _xadd(redis: Redis, stream: str, payload: dict[str, Any]):
    data = json.dumps(payload, separators=(",", ":"), default=_json_default)
    assert len(data) < 256_000, f"Event too large ({len(data)} bytes) for stream {stream}"
    await redis.xadd(stream, {"data": data}, maxlen=10_000, approximate=True)


def _json_default(o):
    if isinstance(o, np.ndarray): return o.tolist()
    if isinstance(o, (np.float32, np.float64)): return float(o)
    if isinstance(o, (np.int32, np.int64)): return int(o)
    raise TypeError(f"Not serializable: {type(o)}")


def _finite_pairs(diag: np.ndarray) -> list[list[float]]:
    if len(diag) == 0: return []
    finite = diag[np.isfinite(diag).all(axis=1)]
    return [[float(b), float(d)] for b, d in finite]


class TopoBridge:
    """Wraps TopoConfidence and publishes pipeline events to Redis Streams.

    Does NOT modify topo-confidence source. The substrate's FastAPI server
    never imports topo-confidence — it only reads from Redis.
    """

    def __init__(self, model_name: str = "Qwen/Qwen2.5-1.5B-Instruct",
                 device: str = "auto", layers: str = "last"):
        self.tc = TopoConfidence(model_name=model_name, device=device, layers=layers)
        self.monitor = BridgeMonitor()
        self.redis: Redis | None = None

    async def connect(self):
        self.redis = Redis.from_url(REDIS_URL)

    async def score_prompt(self, prompt: str) -> dict[str, Any]:
        """Full pipeline: extract → reduce → PH → features → score → bridge."""
        run_id = uuid.uuid4().hex[:8]

        # --- Stage 1: Extract hidden states ---
        await _xadd(self.redis, _stream("scoring", "extraction_started"), {
            "run_id": run_id,
            "prompt_preview": prompt[:100],
            "model_name": self.tc.model_name,
        })

        result = await asyncio.to_thread(
            self.tc.extractor.extract, [prompt], max_length=512, batch_size=1
        )
        trajectory = result["token_trajectories"][0]  # (n_tokens, hidden_dim)
        n_tokens = int(result["token_counts"][0])

        await _xadd(self.redis, _stream("scoring", "extraction_completed"), {
            "run_id": run_id,
            "n_tokens": n_tokens,
            "hidden_dim": trajectory.shape[1],
        })

        # --- Stage 2: PCA reduce + 3D projection for R3F ---
        fe = self.tc.feature_extractor
        if fe._pca is None:
            await asyncio.to_thread(fe._fit_pca, trajectory.copy())

        reduced = fe._reduce(trajectory)  # (n_tokens, n_pca=30)

        # 3D projection for the point cloud (extends Gradio's 2D at spaces/app.py:107)
        pca_3d = PCA(n_components=3)
        coords_3d = pca_3d.fit_transform(reduced)

        # Cluster labels + silhouette (matches spaces/app.py:94-104)
        if n_tokens >= 10:
            km = KMeans(n_clusters=2, n_init=10, random_state=42)
            cluster_labels = km.fit_predict(reduced)
            if len(set(cluster_labels)) == 2:
                sil_samples = silhouette_samples(reduced, cluster_labels)
            else:
                cluster_labels = np.zeros(n_tokens, dtype=int)
                sil_samples = np.zeros(n_tokens)
        else:
            cluster_labels = np.zeros(n_tokens, dtype=int)
            sil_samples = np.zeros(n_tokens)

        pos0_silhouette = float(sil_samples[0])
        bridge_mask = (np.abs(sil_samples) < 0.1).tolist()

        await _xadd(self.redis, _stream("scoring", "hidden_state_cloud"), {
            "run_id": run_id,
            "coords_3d": coords_3d.tolist(),
            "cluster_labels": cluster_labels.astype(int).tolist(),
            "silhouette_samples": [float(s) for s in sil_samples],
            "pos0_silhouette": pos0_silhouette,
            "bridge_mask": bridge_mask,
            "n_tokens": n_tokens,
        })

        # --- Stage 3: Persistence diagrams ---
        diagrams = await asyncio.to_thread(fe._compute_ph, reduced)
        await _xadd(self.redis, _stream("scoring", "persistence_computed"), {
            "run_id": run_id,
            "H0": _finite_pairs(diagrams.get(0, np.empty((0, 2)))),
            "H1": _finite_pairs(diagrams.get(1, np.empty((0, 2)))),
            "H2": _finite_pairs(diagrams.get(2, np.empty((0, 2)))),
        })

        # --- Stage 4: All 13 features ---
        features_arr = await asyncio.to_thread(fe.extract_single, trajectory)
        feature_dict = {name: float(val) for name, val in
                        zip(fe.feature_names, features_arr)}

        await _xadd(self.redis, _stream("scoring", "features_computed"), {
            "run_id": run_id,
            "features": feature_dict,
            "feature_names": fe.feature_names,
        })

        # --- Stage 5: Confidence score ---
        # Heuristic (matches spaces/app.py:132-153)
        h0_ent = features_arr[0]           # H0_persistence_entropy
        bridge_sil = features_arr[9]       # bridge_silhouette (index 9 in FEATURE_NAMES)
        conf_h0 = float(np.clip(1.0 - (h0_ent - 1.5) / 3.0, 0.0, 1.0))
        conf_bridge = float(np.clip(1.0 - abs(bridge_sil) / 0.3, 0.0, 1.0))
        heuristic_conf = 0.7 * conf_h0 + 0.3 * conf_bridge

        calibrated = self.tc.calibrated
        if calibrated:
            cal_score = float(self.tc._predict_from_features(
                features_arr.reshape(1, -1))[0])
        else:
            cal_score = heuristic_conf

        await _xadd(self.redis, _stream("scoring", "confidence_scored"), {
            "run_id": run_id,
            "confidence": cal_score,
            "heuristic_confidence": heuristic_conf,
            "calibrated": calibrated,
            "method": "calibrated" if calibrated else "heuristic",
        })

        # --- Stage 6: Bridge health ---
        health = await asyncio.to_thread(
            self.monitor.check_from_model,
            self.tc.extractor.model,
            self.tc.extractor.tokenizer,
            prompt,
        )
        await _xadd(self.redis, _stream("scoring", "bridge_health"), {
            "run_id": run_id,
            **health.to_dict(),
        })

        return {
            "run_id": run_id,
            "confidence": cal_score,
            "features": feature_dict,
            "bridge_healthy": health.healthy,
        }

    async def explain_prompt(self, prompt: str) -> dict[str, Any]:
        """Feature attribution — requires calibration."""
        if not self.tc.calibrated:
            raise RuntimeError("Must calibrate before explain()")
        run_id = uuid.uuid4().hex[:8]
        explanation = await asyncio.to_thread(self.tc.explain, prompt)
        await _xadd(self.redis, _stream("scoring", "explain_result"), {
            "run_id": run_id, **explanation,
        })
        return {"run_id": run_id, **explanation}

    async def calibrate(self, prompts: list[str], correct: list[int],
                        method: str = "logistic") -> dict[str, Any]:
        """Run calibration and publish metrics."""
        run_id = uuid.uuid4().hex[:8]
        metrics = await asyncio.to_thread(
            self.tc.calibrate, prompts, np.array(correct, dtype=int), method
        )
        await _xadd(self.redis, _stream("calibration", "completed"), {
            "run_id": run_id,
            "metrics": {k: float(v) if not np.isnan(v) else None
                        for k, v in metrics.items()},
            "method": method,
        })
        return {"run_id": run_id, "metrics": metrics}
```

**Daemon entrypoint** (separate container, never part of FastAPI):

```python
# daemons/topoconf/topoconf_daemon.py
import asyncio, sys, os
from adapter import TopoBridge

async def main():
    model = os.environ.get("TOPO_MODEL", "Qwen/Qwen2.5-1.5B-Instruct")
    device = os.environ.get("TOPO_DEVICE", "auto")
    bridge = TopoBridge(model_name=model, device=device)
    await bridge.connect()
    while True:
        line = (await asyncio.to_thread(sys.stdin.readline)).strip()
        if not line: break
        await bridge.score_prompt(line)

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 9. The Seven React Node Components

All wrapped in `React.memo`. Use `useNodesData(id)` for own-data subscription, never `useNodes()`.

| Node | Kind | Subscribes to | Visualization |
|---|---|---|---|
| `PromptInput` | Computed | — | Text area + "Analyze" button |
| `HiddenStateCloud` | Subscriber | `hidden_state_cloud` | R3F `<Canvas>` with `<Points>` BufferGeometry (3D PCA) |
| `FeatureBars` | Subscriber | `features_computed` | 13 horizontal bars, color-coded by dimension |
| `PersistenceDiagram` | Subscriber | `persistence_computed` | Birth-death scatter + diagonal, tabbed H0/H1/H2 |
| `ConfidenceGauge` | Subscriber | `confidence_scored` | SVG arc gauge 0-1, color bands at 0.4/0.7 |
| `BridgeMonitor` | Subscriber | `bridge_health` | 3-row table (layers 7/14/24) + status badge |
| `ExplainWaterfall` | Subscriber | `explain_result` | 13-bar contribution waterfall + top_contributor badge |

### 9.1 HiddenStateCloudNode (R3F 3D Point Cloud)

The most performance-sensitive component. Reference implementation from v1 spec, corrected for actual data:

```tsx
// frontend/src/components/nodes/HiddenStateCloudNode.tsx
import { memo, useMemo } from "react";
import { Handle, Position, useNodesData, type NodeProps } from "@xyflow/react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

type CloudPayload = {
  coords_3d: number[][];        // N×3
  cluster_labels: number[];     // N  (0 or 1)
  pos0_silhouette: number;
  bridge_mask: boolean[];       // N
  n_tokens: number;
};

const CLUSTER_COLORS = [new THREE.Color(0x3b82f6), new THREE.Color(0xef4444)];
const BRIDGE_COLOR = new THREE.Color(0xfbbf24);

function PointCloud({ payload }: { payload: CloudPayload }) {
  const { positions, colors, sizes } = useMemo(() => {
    const n = payload.coords_3d.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = payload.coords_3d[i];
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Position 0 = bridge highlight (gold, large)
      // Bridge mask tokens = gold, medium
      // Core tokens = cluster color, small
      let c: THREE.Color;
      if (i === 0) {
        c = BRIDGE_COLOR;
        sizes[i] = 0.12;
      } else if (payload.bridge_mask[i]) {
        c = BRIDGE_COLOR;
        sizes[i] = 0.07;
      } else {
        c = CLUSTER_COLORS[payload.cluster_labels[i] ?? 0];
        sizes[i] = 0.04;
      }
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { positions, colors, sizes };
  }, [payload]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.05} vertexColors sizeAttenuation />
    </points>
  );
}

function HiddenStateCloudNode({ id }: NodeProps) {
  const nodeData = useNodesData(id);
  const payload = nodeData?.data?.latest as CloudPayload | undefined;

  return (
    <div style={{ width: 360, height: 360, background: "#0a0a0a",
                  border: "1px solid #333", borderRadius: 6 }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ padding: 4, color: "#aaa", fontSize: 11 }}>
        hidden states · k=2 · pos0_sil={payload?.pos0_silhouette?.toFixed(3) ?? "—"}
      </div>
      <Canvas
        frameloop="demand"
        camera={{ position: [3, 3, 3], fov: 50 }}
        style={{ width: "100%", height: 320 }}
      >
        <ambientLight intensity={0.6} />
        {payload && <PointCloud payload={payload} />}
        <OrbitControls makeDefault />
      </Canvas>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default memo(HiddenStateCloudNode);
```

**Three perf-critical details:**
1. `frameloop="demand"` — renders only when props change, not every animation frame.
2. `useNodesData(id)` not `useNodes()` — per-node subscription per React Flow docs.
3. `memo()` on the export — without it, React Flow re-mounts `<Canvas>` on every drag.
4. `Float32Array` for positions/colors — zero-copy to GPU.

### 9.2 FeatureBars Color Coding

```typescript
const FEATURE_COLORS: Record<string, string> = {
  H0_persistence_entropy: "#58a6ff",   // H0 = blue
  H0_total_persistence:   "#58a6ff",
  H0_n_features:          "#58a6ff",
  H1_max_lifetime:        "#22d3ee",   // H1 = cyan
  H1_persistence_entropy: "#22d3ee",
  H1_n_features:          "#22d3ee",
  H2_n_features:          "#a78bfa",   // H2 = purple
  H2_total_persistence:   "#a78bfa",
  H2_persistence_entropy: "#a78bfa",
  bridge_silhouette:      "#ffd700",   // bridge = gold
  H0_ph_significance:     "#4ade80",   // significance = green
  H1_ph_significance:     "#4ade80",
  topological_sensitivity: "#f87171",  // sensitivity = red
};
```

### 9.3 ConfidenceGauge Thresholds

From `spaces/app.py:293-298`:
- `>= 0.7` → green band
- `>= 0.4` → yellow band
- `< 0.4` → red band

Shows "calibrated" or "heuristic" as secondary text.

---

## 10. Pipeline-Studio Patterns: Copy vs Adapt

### Copy directly (minimal changes):
- `~/pipeline-studio/src/lib/layout/elk-layout.ts` → `frontend/src/lib/layout/elk-layout.ts`
  - Change `PipelineNode`/`PipelineEdge` → `SubstrateNode`/`SubstrateEdge`
- `~/pipeline-studio/src/lib/layout/elk-worker.ts` → `frontend/src/lib/layout/elk-worker.ts`
- `~/pipeline-studio/src/components/ui/*` → shadcn/ui components (badge, button, card, tabs, slider)

### Adapt structure, rewrite content:
- `~/pipeline-studio/src/lib/store/pipeline-store.ts` → `canvas-store.ts`
  - Same `zustand` + `zundo` + `temporal` pattern
  - Same `applyNodeChanges`/`applyEdgeChanges` from `@xyflow/react`
  - Remove `ExecutionRun`, `executionRuns`, `currentRunId`
  - Add `runStatus: 'idle' | 'running' | 'completed' | 'error'`, `activeRunId: string | null`
- `~/pipeline-studio/src/lib/nodes/registry.ts` → `registry.ts`
  - Same `NodeDefinition` shape (see `~/pipeline-studio/src/types/nodes.ts:46-61`)
  - Drop `service`, `estimatedLatencyMs`, `estimatedCostPerCall`
  - Add `subscribesTo: string[]` — which stream events trigger updates
- `~/pipeline-studio/src/components/canvas/PipelineCanvas.tsx` → `SubstrateCanvas.tsx`
  - Same ReactFlow + minimap + controls structure
  - Add WS event dispatch

### Do not copy:
- `~/pipeline-studio/src/lib/engine/executor.ts` — no local execution engine
- `~/pipeline-studio/src/app/api/*` — no Next.js API routes (we use Vite)
- `~/pipeline-studio/src/lib/api/pipeline-client.ts` — replaced by WS client

### Frontend Node Registry Interface

Adapted from `~/pipeline-studio/src/types/nodes.ts`:

```typescript
// frontend/src/types/nodes.ts
export type HandleType =
  | 'prompt' | 'extraction' | 'features'
  | 'confidence' | 'bridge_health' | 'explanation' | 'diagrams'

export type NodeCategory = 'input' | 'extraction' | 'topology' | 'scoring'

export interface NodeDefinition {
  type: string
  category: NodeCategory
  label: string
  description: string
  icon: string              // lucide-react icon name
  color: string
  inputs: HandleDefinition[]
  outputs: HandleDefinition[]
  configSchema: ConfigField[]
  defaultConfig: Record<string, unknown>
  subscribesTo: string[]    // stream event types that trigger updates
}
```

---

## 11. docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: substrate
      POSTGRES_USER: substrate
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-substrate_dev}
    volumes: ["pg_data:/var/lib/postgresql/data"]
    ports: ["5434:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U substrate -d substrate"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--maxmemory", "512mb",
              "--maxmemory-policy", "allkeys-lru", "--save", ""]
    ports: ["6381:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5

  fastapi:
    build: { context: ./server, dockerfile: Dockerfile }
    environment:
      DATABASE_URL: postgresql://substrate:substrate_dev@postgres:5432/substrate
      REDIS_URL: redis://redis:6379/0
      LOG_LEVEL: info
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    ports: ["8080:8080"]
    volumes: ["./server:/app"]
    command: ["uvicorn", "substrate.main:app", "--host", "0.0.0.0",
              "--port", "8080", "--reload",
              "--ws-ping-interval", "20", "--ws-ping-timeout", "20"]

  vite:
    image: node:22-alpine
    working_dir: /app
    volumes: ["./frontend:/app"]
    ports: ["5173:5173"]
    command: ["sh", "-c", "npm install && npx vite --host 0.0.0.0"]
    environment:
      VITE_WS_URL: ws://localhost:8080

  topoconf_daemon:
    build: { context: ./daemons/topoconf, dockerfile: Dockerfile }
    environment:
      REDIS_URL: redis://redis:6379/0
      TOPO_MODEL: Qwen/Qwen2.5-1.5B-Instruct
      TOPO_DEVICE: auto
    depends_on: { redis: { condition: service_healthy } }
    volumes:
      - ~/.cache/huggingface:/root/.cache/huggingface
    profiles: ["topoconf"]
    # GPU: uncomment with NVIDIA Container Toolkit
    # deploy:
    #   resources:
    #     reservations:
    #       devices: [{ driver: nvidia, count: 1, capabilities: [gpu] }]

volumes:
  pg_data:
```

**The daemon runs as a sibling container, not inside FastAPI.** Reasons: substrate stays generic (no torch/ripser dep), GPU access is daemon-specific, crashes are isolated, communication is exclusively via Redis Streams.

---

## 12. Dependencies

### Frontend

```json
{
  "dependencies": {
    "@xyflow/react": "^12.10.1",
    "zustand": "^5.0.11",
    "zundo": "^2.3.0",
    "elkjs": "^0.11.0",
    "recharts": "^3.7.0",
    "@react-three/fiber": "^9",
    "@react-three/drei": "^10",
    "three": "^0.175",
    "lucide-react": "^0.575.0",
    "@radix-ui/react-tabs": "^1.4.3",
    "@radix-ui/react-tooltip": "^1.4.3",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "tailwindcss": "^4"
  },
  "devDependencies": {
    "@types/three": "^0.175"
  }
}
```

### Server

```toml
[project]
name = "node-graph-substrate"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "pydantic>=2.10",
    "redis>=5.2",
    "asyncpg>=0.30",
    "structlog>=24.4",
]
```

### Daemon

```toml
[project]
name = "topoconf-daemon"
requires-python = ">=3.10"
dependencies = [
    "topo-confidence",          # editable install from ~/topo-confidence
    "redis>=5.2",
    "scikit-learn>=1.3",
    "numpy>=1.24",
]
```

---

## 13. Tracer-Bullet Build Order

### Slice 0 — Hello-World (Day 1)

**Goal:** Docker compose up → Redis stream ticking → FastAPI WebSocket relaying → React Flow node showing live counter.

**Files to create:**
- `docker-compose.yml` — all 4 services minus topoconf_daemon
- `server/substrate/main.py` — FastAPI with `/ws/canvas/{canvas_id}`, hardcoded graph
- `server/substrate/ws.py` — ConnectionManager
- `server/Dockerfile`, `server/pyproject.toml`
- `frontend/package.json` — all deps listed in §12
- `frontend/src/App.tsx` — ReactFlowProvider + single "counter" node
- `frontend/src/lib/ws/client.ts` — WebSocket connect + reconnect
- `counter_publisher.py` — dummy script: `XADD demo:counter {counter: N}` every second

**Pass criteria:**
1. `docker compose up` starts redis, postgres, fastapi, vite — all healthy
2. `redis-cli -p 6381 XLEN demo:counter` increases
3. Browser at `localhost:5173` shows one node with a ticking number
4. **Until this is green, no Slice 1 work.**

### Slice 1 — Graph Persistence (Day 2-3)

**Goal:** Drag nodes, save graph, restart server, graph preserved. localStorage mirrors Postgres.

**Files:**
- `migrations/001_init.sql` — full schema from §7
- `server/substrate/db.py` — asyncpg pool
- `server/substrate/crud.py` — CRUD: graphs, nodes, edges, node_configs
- `server/substrate/schemas.py` — Pydantic models
- HTTP routes: `POST /api/graphs`, `GET /api/graphs/{id}`, `PATCH /api/graphs/{id}/ops`
- `frontend/src/lib/store/canvas-store.ts` — zustand + zundo
- `frontend/src/components/canvas/SubstrateCanvas.tsx`

**Pass criteria:**
1. POST creates graph, GET returns it
2. Drag updates persist via PATCH with `expected_version`
3. Restart server → reopen → graph at same positions
4. localStorage caches current version

### Slice 2 — Computed Node Path (Day 4-5)

**Goal:** PromptInput → "Analyze" → stub `build()` returns random 13-feature dict → FeatureBars shows them.

**Files:**
- `server/substrate/sdk.py` — Component base class
- `server/substrate/registry.py` — ComponentRegistry
- `server/substrate/messages.py` — WS envelope
- `server/substrate/components/prompt_input.py` — returns random features (mocked)
- `frontend/src/components/nodes/PromptInputNode.tsx`
- `frontend/src/components/nodes/FeatureBarsNode.tsx` — 13 bars
- `frontend/src/lib/nodes/registry.ts`
- `frontend/src/lib/nodes/node-types-map.ts`

**Pass criteria:**
1. `compute_request` sent over WS
2. `Component.build()` invoked, `computation_result` returned with `request_id`
3. FeatureBars renders 13 bars with correct color coding per §9.2

### Slice 3 — Subscriber Path + R3F (Day 6-8)

**Goal:** Dummy daemon publishes synthetic events → StreamHub fans out → HiddenStateCloudNode + PersistenceDiagramNode update live.

**Files:**
- `server/substrate/streamhub.py` — Redis XREAD + fan-out
- `frontend/src/components/nodes/HiddenStateCloudNode.tsx` — R3F Canvas + Points
- `frontend/src/components/nodes/PersistenceDiagramNode.tsx` — birth-death scatter
- `frontend/src/lib/ws/client.ts` — add RAF coalescing for stream_event
- `synthetic_daemon.py` — publishes fake `hidden_state_cloud` + `persistence_computed` events every 2s

**Pass criteria:**
1. Daemon XADDs events every 2s
2. StreamHub reads and broadcasts to all WS clients
3. R3F point cloud updates without Canvas remount (`memo()` prevents it)
4. OrbitControls rotation works, `frameloop="demand"` renders on prop change
5. Persistence diagram shows H0/H1/H2 tabs with birth-death points + diagonal

### Slice 4 — Real topo-confidence (Day 9-11)

**Goal:** Replace stubs with real TopoBridge adapter. Full pipeline visible.

**Files:**
- `daemons/topoconf/adapter.py` — TopoBridge from §8
- `daemons/topoconf/topoconf_daemon.py` — entrypoint
- `daemons/topoconf/Dockerfile` — python:3.11 + topo-confidence
- Update docker-compose.yml to mount `~/topo-confidence`
- `frontend/src/components/nodes/ConfidenceGaugeNode.tsx`
- `frontend/src/components/nodes/BridgeMonitorNode.tsx`

**Pass criteria:**
1. Submit "What is 2+2?" → all 7 nodes update in correct order
2. HiddenStateCloud shows real token positions with pos-0 highlighted gold
3. FeatureBars shows 13 real non-zero values
4. ConfidenceGauge shows heuristic confidence in correct color band (green/yellow/red)
5. BridgeMonitor shows layers 7/14/24 health with correct `to_dict()` string keys
6. `grep -r "topo_confidence\|TopoConfidence" server/substrate/` returns 0 lines

### Slice 5 — Explain + Calibration + Polish (Day 12-14)

**Goal:** ExplainWaterfall (requires calibration). Auto-layout. Default canvas. Full polish.

**Files:**
- `frontend/src/components/nodes/ExplainWaterfallNode.tsx`
- `frontend/src/lib/layout/elk-layout.ts` — copy from pipeline-studio
- `frontend/src/lib/layout/elk-worker.ts` — copy from pipeline-studio
- `frontend/src/components/sidebar/NodePalette.tsx`
- `frontend/src/components/panels/ConfigPanel.tsx`
- `frontend/src/components/panels/EventLog.tsx`
- Add calibration endpoint to daemon

**Pass criteria:**
1. After calibration, ExplainWaterfall shows 13 contribution bars with top_contributor badge
2. ELK auto-layout arranges 7 nodes cleanly
3. Refresh page → layout persists from localStorage, version matches Postgres
4. Event log shows raw WS messages with timestamps

---

## 14. React Flow Performance Mitigations

Apply all of these from day one (documented at `reactflow.dev/learn/advanced-use/performance`):

```tsx
// 1. nodeTypes defined module-scope, never inside component body
const nodeTypes = NODE_TYPES_MAP;  // from node-types-map.ts

// 2. Every custom node wrapped in memo()
export default memo(MyNode);

// 3. useNodesData(id) for own-data, NEVER useNodes()
const data = useNodesData(id);

// 4. RAF coalescing for WS events (prevents re-render storm)
const pending = useRef<Map<string, any>>(new Map());
function onWSMessage(msg: StreamEvent | NodeStateUpdated) {
  const key = msg.node_id;
  pending.current.set(key, { ...pending.current.get(key), ...msg.payload ?? msg.data_patch });
  if (!scheduled.current) {
    scheduled.current = true;
    requestAnimationFrame(() => {
      const updates = Array.from(pending.current.entries());
      pending.current.clear();
      scheduled.current = false;
      // Batch all updates into a single setNodes call
      store.batchUpdateNodeData(updates);
    });
  }
}

// 5. Selectors with shallow equality for derived state
const selectedIds = useStore(useShallow(s =>
  Array.from(s.nodeLookup.values()).filter(n => n.selected).map(n => n.id)
));
```

**Realistic ceiling:** ~30 nodes, ~5 subscribers updating at ~10 Hz, modern laptop. Past that, profile and consider `onlyRenderVisibleElements`.

---

## 15. Honest Risk Assessment

### 15.1 R3F `frameloop="demand"` + OrbitControls

Reports exist where rapid orbit-then-idle leaves a stale frame because Drei's controls call `invalidate()` on user input but the frame may not complete before the next prop update. If observed, switch to `frameloop="always"` for the HiddenStateCloudNode's canvas only (~3% CPU per visible cloud).

### 15.2 JSON-over-WebSocket for large payloads

At ~30-90KB per `hidden_state_cloud` event, JSON is fine. If payloads grow past ~1 MB (e.g., full hidden-state tensors):
1. Side-store + URI in event (already in the design for tensors)
2. Base64-in-JSON for medium blobs (≤1 MB)
3. Binary WebSocket frames + MessagePack
4. Arrow IPC (last resort)

**Trigger:** if any event payload exceeds 100 KB for >1% of events, escalate to step 2.

### 15.3 Internal method stability

The adapter accesses `fe._reduce()`, `fe._compute_ph()`, `fe._compute_bridge_silhouette()`. These are private but stable — they've been unchanged since v0.2.0. If they change, the adapter breaks loudly at import time or with an obvious `AttributeError`. Fix is ~10 lines.

### 15.4 PCA fitting side effect

`TopologicalFeatureExtractor.extract()` fits PCA as a side effect (features.py:204-206). The adapter calls `extract_single()` for subsequent prompts, which requires PCA already fitted. If a fresh daemon restarts and receives an `extract_single()` call before any `extract()`, it will raise `RuntimeError("PCA not fitted")`. The adapter handles this by checking `fe._pca is None` and calling `_fit_pca()` explicitly.

### 15.5 FastAPI WebSocket disconnect detection

If the handler awaits a long compute and the client disconnects, you don't find out until the next `send_text` fails. Mitigations:
1. Run compute as `asyncio.create_task(...)`, race against `ws.receive_text()` using `asyncio.wait(FIRST_COMPLETED)`, cancel on disconnect.
2. `ws_ping_interval=20, ws_ping_timeout=20` on uvicorn for dead TCP detection.

### 15.6 The substrate has zero topo-confidence imports

This is a hard invariant. `grep -r "topo_confidence\|TopoConfidence" server/substrate/` must return 0 lines. The daemon owns all topo-confidence imports; the server only reads Redis. This is the architectural seam that makes the substrate reusable for other projects.

---

## 16. Success Criteria

| Criterion | Verification | Budget |
|---|---|---|
| Add a new node type | Write Component + React file + 2 registry lines | ≤30 min |
| Wire a new daemon's events | Write adapter (~30 lines) + subscriber node | ≤60 min |
| Spot a hung daemon | DaemonHealth overlay turns red when no events in 30s | ≤5 sec |
| Zero topo-confidence imports in server | `grep -r "topo_confidence" server/substrate/` | 0 lines |
| Graph round-trip lossless | Save → restart → reopen → diff is empty | Weekly CI |
| Two-tab concurrency | Drag in tab A → tab B reflects within ~200 ms | Manual test |

---

## 17. What I Am Uncertain About

1. **Whether `frameloop="demand"` + OrbitControls cooperates correctly** — Drei's controls call `invalidate()` internally but stale-frame reports exist. Measure in Slice 3.
2. **Whether 10 Hz subscriber updates need RAF coalescing** — my belief is yes, but measure before adding complexity. Run a 10 Hz sham stream at 5 nodes and check if `setNodes`-per-event sustains 60 FPS.
3. **Whether the daemon should expose an HTTP control plane** vs consuming Redis control messages for start/stop/configure. The current spec uses Redis in both directions (control + results). Validate ergonomics in Slice 4.
4. **Pydantic envelope cost at >1k msg/s** — should be fine; if CPU-dominated by `model_validate_json`, switch to hand-written `match msg["type"]` dispatcher.
5. **Whether a single FastAPI process can handle calibration runs while serving the canvas** — heavy work runs in the daemon (asyncio.to_thread), not in FastAPI's build(). Don't be tempted to put scoring in build().
