# SPEC-h1-loop-sketch — H1 Topological Loop Sketch

Status: Draft 6 for audit
Target executor: Claude Code
Repo: `musicofhel/node-graph-substrate`
Base commit: `f7669952`
Sibling repo (read-only reference): `musicofhel/topo-confidence` at `1921e3ab`

Draft 6 resolves two critical issues and several significant and polish issues found in draft 5's path-traces audit. Change log in section 14.

---

## 0. Purpose of this document

This spec describes a learning artifact: a d3-based sketch that visualizes the H1 topological loop — the central object the `topo-confidence` system measures — using real precomputed data from the MATH-500 dataset. It is not a feature of the live `SubstrateCanvas` dashboard. It is a standalone visualization intended to make the H1 mechanism legible in a way the existing Pipeline canvas does not.

The spec is designed to be executed by Claude Code in tracer-bullet slices, with each slice independently shippable and gated by acceptance criteria. The spec is also designed to remain useful through future experiments that vary the correctness metric, the hidden-state layer choice, the projection method, or other compute parameters, without requiring rewrites of the sketch itself.

### 0.1 Honesty about scope

Two of the spec's natural claims could not be jointly satisfied:

- **Claim A:** "The cycles the sketch shows are byte-identical to the cycles the dashboard reports."
- **Claim B:** "The precompute is parallelizable and reproducible from a single seed."

Claim A requires faithfully replicating the live system's RNG state, which advances sequentially across problems via a shared `self.rng` in `TopologicalFeatureExtractor`. Claim B requires per-problem independence.

This spec chooses Claim B and softens Claim A. The cycles in the cache are **representative cycles for the same trajectories the dashboard analyzes**, computed with the same subsample size (100) and the same per-problem seed (42 + idx), but with each problem's RNG initialized independently rather than inherited from a shared sequential RNG. This produces statistically equivalent cycles but not byte-identical ones. Section 5 documents this explicitly. The pedagogical link is "you are looking at H1 cycles in the same trajectory the dashboard summarizes, with the same parameters, computed independently." The substrate's live confidence pipeline remains the source of truth for confidence scores; the sketch is a window into the same data, not a reproduction of the same pipeline.

### 0.2 What "out of scope" means in this spec

"Out of scope" means "not part of the current build." It does not mean "forbidden forever." Future scaffold items in section 11 are likely future work, deferred until the present spec lands.

### 0.3 Cache governance: source of truth, derived views, sibling caches

**The NPZ files at `~/topo-confidence/pathway8_layerwise/data/math500/` are the source of truth.** Anything stored in `docs/sketches/h1-loop/data/` — the manifest, the per-problem JSON files, the serialized PCA — is a derived artifact whose value is speed and convenience, not authority. If the cache and an NPZ disagree, the NPZ wins; the cache is regenerated. The cache is never edited by hand. The precompute script is the only thing that writes into the data directory.

**The cache stores derived views, not raw data.** Storing 1536D hidden states would duplicate the NPZ files at large cost (~3 GB across 500 problems) and the duplicates would be guaranteed to drift over time. The cache stores `points_2d`, `points_3d`, the persistence diagram, the cycle representatives, the intermediate-dim pairwise distance matrix, and a handful of scalars — precisely what the visualization needs to render without recomputation. If a future experiment needs a different derived view, the answer is not to extend this cache; the answer is a sibling cache.

**Sibling caches are the experimentation mechanism, with honest scope.** When you want to try UMAP instead of PCA, you write a sibling script (or extend the existing script with a `--reduction-method umap` flag) and point it at `docs/sketches/h1-loop/data_umap/`. **The schema is reducer-agnostic by design** — see section 4 for field names that do not embed the choice of reducer. However, the precompute script itself is PCA-specific in this spec; a UMAP sibling requires either a separate script or a non-trivial refactor of the existing one (see section 11.2 for the honest cost). The same pattern works for alternative layer indices (section 11.2), alternative correctness metrics (section 11.1), and alternative intermediate dimensions. The sketch reads from one cache at a time; a future slice can add a cache selector.

---

## 1. Context and motivation

### 1.1 What H1 is in this system

The `topo-confidence` system claims that an LLM's reasoning quality can be measured by the topology of its hidden-state trajectory. Each generated token has a hidden state in a high-dimensional space (1536D for Qwen2.5-1.5B). The sequence of hidden states forms a trajectory. After projecting the trajectory to a reduced space, persistent homology detects topological features. The H1 features are one-dimensional cycles — closed loops in the point cloud that cannot be contracted to a point because the trajectory genuinely revisits a region of representation space.

The interpretation, per the `ExplainWaterfallNode` glossary in the substrate repo and the feature definitions in `topo_confidence/features.py`:
- `H1_max_lifetime` — "Loop Stability — Sustained internal verification cycles — revisiting and refining"
- `H1_persistence_entropy` — "Loop Diversity — Multiple reasoning loops at varying scale"
- `H1_n_features` — "Loop Count — Complex multi-loop reasoning structure"
- `H1_ph_significance` — "Loop Significance — Loops are genuine structural features"

The longest-lived H1 cycle is the principal signal. Its lifetime is the second of thirteen features (index 1) in `FEATURE_NAMES` and contributes to the calibrated confidence score.

### 1.2 What the live system actually computes

The live `TopologicalFeatureExtractor` defaults: `method="token_trajectory"`, `max_dim=2`, `n_pca=30`, `subsample=100`, `null_k=100`, `seed=42`.

The control flow in `extract()`, ordered to disambiguate which subsample is used where:

1. PCA is fit once on the union of all problems' trajectories pooled together (`_fit_pca` at the start of `extract`). The PCA is shared across all subsequent per-problem work.
2. The per-problem trajectory is reduced via this PCA to 30D. Call this the **reduced array**, shape `(n_tokens, 30)`.
3. **Bridge silhouette is computed on the reduced array, unsubsampled.** `_compute_bridge_silhouette` reads `sil_samples[0]`, indexing into the full reduced array. The bridge therefore lives at index 0 of the reduced array.
4. **First subsample drawn**, advancing the shared `self.rng`. `subsampled = subsample_points(reduced, 100, self.rng)`. Used for the null-model significance test (`ph_significance(subsampled, ...)`) and the topological-sensitivity feature (`_compute_topological_sensitivity(subsampled)`). The topological-sensitivity function adds noise and re-runs ripser on its input; it does NOT draw an additional subsample. The first subsample serves two scalar features.
5. **Second subsample drawn**, advancing the same shared rng once more. Inside `_compute_ph(reduced)`, the function calls `subsample_points(reduced, 100, self.rng)` and passes the result to `ripser(...)`. The persistence diagrams (H0, H1, H2) come from this second subsample. **The H1 cycles ripser detects and the cycle representatives this spec extracts live in this second subsample.**

Two distinct subsamples therefore exist per problem, both drawn from the same shared rng:
- (a) The reduced array itself, unsubsampled. The bridge is at index 0.
- (b) The first subsample (used for null/sensitivity features).
- (c) The second subsample (used for the persistence diagrams). Cycle indices are into (c).

The sketch and precompute script care about (a) (for the bridge) and (c) (for cycles). They do not need (b).

### 1.3 What layer the live system uses

`TopoConfidence` defaults to `layers="last"`, which `resolve_layers` converts to `[n_layers - 1]` — the final transformer layer. For Qwen2.5-1.5B that is layer 27 in 0-indexed model terms, which in the NPZ files (where index 0 is the embedding) is `states[28]`. The H1 sketch uses the same layer for the same reason: the cycles the dashboard reports are cycles at this layer, and any divergence makes the sketch and the dashboard talk about different objects.

Note: this differs from the breathing pipeline, which focuses on L19 (NPZ index 20). L19 is where participation ratio peaks; the last layer is where the confidence features are computed. They are different layers for different purposes. The sketch uses the last layer to match the confidence pipeline. L19 is a future sibling cache (section 11.2).

### 1.4 Bridge concept and bridge always-include rule

The live system treats position 0 of the **reduced array** as the "computational bridge." Position 0 is the first generated token's hidden state at the configured layer, after PCA reduction. The `bridge_silhouette` feature in `FEATURE_NAMES` is the silhouette score of this point in a k=2 KMeans clustering of the full reduced array. Position 0 is also the gold dot in `HiddenStateCloudNode`.

For the sketch, the bridge must always be visible alongside any H1 cycles. The precompute **always includes position 0 in subsample (c)**, so the bridge is always at subsampled index 0 in the cache.

Concretely: when `n_tokens <= 100`, no subsampling occurs and position 0 is trivially present. When `n_tokens > 100`, the script draws 99 distinct indices from `[1, n_tokens)` using `np.random.default_rng(42 + idx)`, sorts them ascending, and prepends 0 to form a 100-element array. The resulting `subsampled_token_indices` is `[0, sorted_drawn_indices...]`, and `bridge_subsampled_index` is always `0` in valid cache files.

This is a documented divergence from the live system, which does not force-include position 0 in its PH subsample. The justification:

(a) The cycles ripser detects on the subsampled cloud are statistically equivalent whether or not index 0 is forced; the longest H1 cycle in a 100-point cloud is dominated by the geometry of the cloud, not by whether any particular individual point is present.

(b) The pedagogical value of always showing the bridge alongside the cycle is high.

(c) The divergence is bounded and explicit, recorded in the manifest as `compute.subsampling.always_include_bridge: true`.

This is one of two intentional divergences from the live system in the precompute pipeline. The other is the per-problem independent RNG strategy in section 0.1. All other parameters match the defaults in `topo_confidence/features.py`.

### 1.5 What the current Pipeline canvas reveals and conceals

H1 information appears in five nodes on the canvas (`PersistenceDiagramNode`, `FeatureBarsNode`, `ExplainWaterfallNode`, `ConfidenceGaugeNode`, `HiddenStateCloudNode`), each showing a different projection of the same underlying object. None of them draws the actual cycle — the closed sequence of points in the cloud that constitutes the loop. The persistence diagram shows the cycle's birth and death as a cyan dot but never identifies which points form the cycle. The hidden-state cloud shows the points but never draws the cycle edges. The two views are not coordinated.

This sketch addresses that gap by rendering the cycle as a polygon overlaid on the cloud, linked to its corresponding dot in a persistence diagram, with both views fed from the same precomputed cache. The intent is pedagogical: to make the H1 loop visible as a geometric object, not just as a summary statistic.

### 1.6 Why this is a sketch, not a node

Adding this as a node in `SubstrateCanvas` would be wrong for three reasons. First, the existing canvas is structured around per-node stream subscriptions, and the cycle is a derived artifact that requires loading multiple problems and switching between them — not a stream-driven view of one moment. Second, the canvas is for live observability of the running daemon, while the cycle visualization is for offline learning from precomputed data. Third, learning artifacts evolve faster than production UI, and coupling this to the React build would add friction every time the d3 changes.

Later integration into the substrate as a high-level overview piece remains a clean move and is anticipated, but with caveats about scope. See section 11.4.

---

## 2. Non-goals

- The sketch does NOT modify the live `topoconf` daemon's emission schema. No new streams, no new payloads on existing streams.
- The sketch does NOT modify `SubstrateCanvas`, `nodeTypes`, or `NODE_REGISTRY`. No new node types.
- The sketch does NOT use synthetic data anywhere. If real data is missing, the sketch fails loudly. See section 8.
- The sketch does NOT compute persistent homology at view time. All PH is precomputed and cached.
- The sketch does NOT attempt real-time visualization. It is offline by design.
- The sketch does NOT replace the existing Pipeline canvas visualizations. It complements them.
- The sketch does NOT compute new features beyond what `topo_confidence/features.py` already computes. Branch pressure, logit entropy, and other derived signals are deferred to future sibling caches per section 11.5.
- The sketch does NOT claim byte-identical reproduction of the live system's cycles. See section 0.1.
- The cache does NOT store raw 1536D hidden states. See section 0.3.
- The precompute script in this spec does NOT support non-linear reducers (UMAP, Isomap, t-SNE). A future sibling script can add them; section 11.2 documents the honest cost.

---

## 3. Directory layout

All paths are relative to the repo root of `node-graph-substrate`.

```
docs/sketches/h1-loop/
├── index.html              # entry point, served via local HTTP server bound to 127.0.0.1
├── sketch.js               # d3 + three.js sketch logic
├── sketch.css              # styling
├── README.md               # how to run, what to expect (created in slice 0, expanded each slice)
└── data/                   # gitignored, populated by precompute script
    ├── manifest.json
    ├── pca_fit.npz         # serialized PCA components, mean, variance (npz, NOT pickle)
    ├── 000.json
    ├── 001.json
    ├── ...
    └── 499.json

scripts/
├── __init__.py             # makes scripts/ a Python package so tests can import
├── conftest.py             # pytest discovery hook for the package
├── precompute_h1_cycles.py # precompute script
├── test_h1_cycles.py       # unit tests for cycle extraction and PCA reconstruction
└── requirements.txt        # script dependencies
```

The `__init__.py` and `conftest.py` are added in slice 0 to make `from scripts.precompute_h1_cycles import ...` work reliably from any directory.

### 3.1 Why data lives inside the sketch directory

The existing convention in the substrate repo places generated data at the repo root under `data/` (see `data/math500_breathing_cache.json`). The H1 cycles data is co-located with the sketch instead. The reason is that the sketch is a self-contained learning artifact and should be portable — zipping `docs/sketches/h1-loop/` should give a recipient everything needed to run it. The data path used inside the sketch is then `./data/manifest.json`, a relative fetch that works under any local HTTP server **when the server is started from inside `docs/sketches/h1-loop/`** (see section 6.2 and the hard-fail message in section 6.7).

### 3.2 .gitignore update

Add the following line to `.gitignore`:

```
docs/sketches/h1-loop/data/
```

This matches the existing pattern of gitignoring large generated data files (`data/math500_breathing_cache.json`, `frontend/public/math500_prompts.json`).

---

## 4. Data contracts

The cache is the central artifact. Sketch evolution depends on the cache schema being stable. This section is the most important part of the spec for audit purposes.

### 4.0 Schema reducer-agnosticism

Field names in the schema do not embed the choice of reducer or its intermediate dimension. `distance_matrix_upper` (no `_30d_` infix) is the canonical name; `compute.reduction.intermediate_dim` documents its actual dimension. This is what makes the schema portable across PCA, UMAP, Isomap, and future sibling caches.

### 4.1 Manifest schema

Path: `docs/sketches/h1-loop/data/manifest.json`

```json
{
  "schema_version": "1.0.0",
  "created_at": "2026-05-20T12:34:56Z",
  "last_run_at": "2026-05-21T08:11:02Z",
  "last_modified_at": "2026-05-20T12:34:56Z",
  "precompute_script_sha256": "feedbeef...",
  "source": {
    "npz_directory": "/home/aaron/topo-confidence/pathway8_layerwise/data/math500",
    "npz_manifest_path": "/home/aaron/topo-confidence/pathway8_layerwise/data/math500/manifest.json",
    "npz_manifest_sha256": "def456...",
    "npz_count_total": 500,
    "npz_count_processed": 500
  },
  "compute": {
    "ph_backend": "ripser",
    "ph_backend_version": "0.6.4",
    "max_dimension": 2,
    "reduction": {
      "method": "pca",
      "source_dim": 1536,
      "intermediate_dim": 30,
      "final_dim_2d": 2,
      "final_dim_3d": 3,
      "pca_fit_strategy": "pooled_all_tokens_all_problems",
      "pca_fit_subsample": null,
      "pca_serialized_at": "pca_fit.npz",
      "pca_transform_method": "manual_numpy",
      "distance_metric": "euclidean"
    },
    "trajectory": {
      "layer_index_npz": 28,
      "layer_index_model": 27,
      "layer_index_meaning": "Last transformer layer (matches TopoConfidence default layers='last'). NPZ index 0 is embedding, indices 1..28 are transformer layers, so the last layer is states[28].",
      "token_subset": "all_generated"
    },
    "subsampling": {
      "enabled": true,
      "max_points": 100,
      "rng_seed_strategy": "per_problem_independent",
      "rng_seed_base": 42,
      "always_include_bridge": true,
      "live_system_divergences": [
        "Live system uses a single shared rng advanced across problems; precompute uses per-problem independent rng seeded at 42 + idx.",
        "Live system does not force-include position 0; precompute always prepends position 0 to the subsample for trajectories longer than max_points."
      ]
    },
    "lifetime_threshold": 0.0,
    "cycle_extraction": {
      "algorithm": "shortest_cycle_at_birth",
      "fallback_algorithm": "cocycle_support_walk",
      "starting_vertex_strategy": "minimum_over_cocycle_support",
      "birth_lifetime_fraction": 0.01,
      "birth_absolute_floor": 1e-9,
      "algorithm_description_section": "5.7"
    },
    "distance_matrix_included": true
  },
  "failures": [],
  "problems": [
    {
      "idx": 0,
      "subject": "Algebra",
      "level": 1,
      "n_tokens": 47,
      "n_subsampled": 47,
      "n_h1_features_in_diagram": 3,
      "n_h1_features_above_threshold": 3,
      "n_h1_cycles_extracted": 3,
      "n_h1_cycles_via_fallback": 0,
      "longest_h1_lifetime": 1.642,
      "correctness_default": true,
      "mean_logprob": -0.234,
      "file": "000.json",
      "source_npz_sha256": "abc123...",
      "generated_at": "2026-05-20T12:34:56Z"
    }
  ]
}
```

Field notes:

- `schema_version` follows semver per section 4.3.
- `created_at`, `last_run_at`, `last_modified_at` are three distinct timestamps. `created_at` is set once when the manifest is first written and never changes. `last_run_at` updates on every script invocation regardless of whether any work was done. `last_modified_at` is the maximum of all per-problem `generated_at` values.
- `precompute_script_sha256` is the SHA-256 of the precompute script's source file at run time. Changing the script forces full regeneration per section 5.4.
- `failures` is an array of `{idx, exception_type, exception_message, timestamp, run_id, attempt_count}` records. `run_id` is a UUID generated once per script invocation, letting users distinguish persistent failures from new ones. `attempt_count` is incremented when the same problem fails on a later run, identifying flaky vs. permanent failures. Failure records are removed when the problem succeeds.
- `source.npz_manifest_sha256` enables the precompute script to detect when the source NPZ directory has been regenerated. **Important: when the source-of-truth pipeline regenerates a single NPZ and updates its manifest, the source manifest SHA changes and this script will recompute all problems on next run.** This is intentional — the source manifest is the gating signal — but worth knowing so the user is not surprised.
- `compute.reduction.method` is `"pca"`. The fields under `compute.reduction` are method-specific.
- `compute.reduction.distance_metric` is `"euclidean"`. Recorded explicitly so future sibling caches with different metrics (e.g., UMAP's cosine option) document their choice.
- `compute.reduction.pca_serialized_at` is `"pca_fit.npz"`. The file is a numpy zip archive of arrays. **No pickle.**
- `compute.reduction.pca_transform_method` is `"manual_numpy"`. The transform is reconstructed as `(X - mean_) @ components_.T` directly in numpy, avoiding sklearn version dependence. See section 5.1.
- `compute.trajectory.layer_index_npz` is `28`. `layer_index_model` is `27`.
- `compute.subsampling.rng_seed_strategy` is `"per_problem_independent"`. Each problem uses `np.random.default_rng(rng_seed_base + idx)`.
- `compute.subsampling.always_include_bridge` is `true`.
- `compute.cycle_extraction.starting_vertex_strategy` is `"minimum_over_cocycle_support"`. See section 5.7.
- `compute.cycle_extraction.birth_lifetime_fraction` and `birth_absolute_floor` parameterize the Rips threshold above birth: `birth + max(fraction * (death - birth), floor)`.
- `compute.distance_matrix_included` is `true`.
- `problems[i].n_h1_features_in_diagram` is the count of finite H1 (birth, death) pairs from ripser before lifetime filtering. `n_h1_features_above_threshold` is the count after the `lifetime_threshold` filter. `n_h1_cycles_extracted` is the count for which a valid cycle representative was extracted. `n_h1_cycles_via_fallback` is the subset that used the fallback. Chain: `n_h1_features_in_diagram >= n_h1_features_above_threshold >= n_h1_cycles_extracted >= n_h1_cycles_via_fallback`.

### 4.2 Per-problem file schema

Path: `docs/sketches/h1-loop/data/{idx:03d}.json`

```json
{
  "idx": 0,
  "schema_version": "1.0.0",
  "math_prompt": "Find the value of x in the equation 2x + 3 = 11.",
  "subject": "Algebra",
  "level": 1,
  "correctness": {
    "default": true
  },
  "mean_logprob": -0.234,
  "n_tokens": 47,
  "n_subsampled": 47,
  "subsampled_token_indices": [0, 1, 2, 3, "...", 46],
  "points_2d": [[0.234, -0.891], [0.301, -0.823], "..."],
  "points_3d": [[0.234, -0.891, 0.045], [0.301, -0.823, 0.067], "..."],
  "bridge_subsampled_index": 0,
  "distance_matrix_upper": [0.123, 0.456, "..."],
  "persistence_diagram": {
    "H0": [[0.0, 0.234], [0.0, 0.187], "..."],
    "H1": [[0.234, 1.876], [0.412, 0.891], "..."],
    "H2": [[0.567, 0.892]]
  },
  "h1_cycles": [
    {
      "rank": 0,
      "birth": 0.234,
      "death": 1.876,
      "lifetime": 1.642,
      "extraction_method": "shortest_cycle_at_birth",
      "representative_subsampled_indices": [12, 17, 23, 31, 27, 19, 12]
    },
    {
      "rank": 1,
      "birth": 0.412,
      "death": 0.891,
      "lifetime": 0.479,
      "extraction_method": "shortest_cycle_at_birth",
      "representative_subsampled_indices": [5, 8, 11, 14, 9, 5]
    }
  ],
  "generated_at": "2026-05-20T12:34:56Z"
}
```

Field notes:

- `subsampled_token_indices[i]` is the original token position in the generated sequence corresponding to the point at `points_2d[i]` / `points_3d[i]`. Length equals `n_subsampled`. When `n_tokens <= 100`, this is `[0, 1, 2, ..., n_tokens-1]`. When `n_tokens > 100`, this is `[0, ...]` with the rest being 99 indices from `[1, n_tokens)` sorted ascending; index 0 of this array is always the bridge.
- **Degenerate case `n_tokens < 3`:** ripser cannot compute H1 from fewer than 3 points. The script produces a valid per-problem file with empty `persistence_diagram.H1`, empty `h1_cycles`, and empty `distance_matrix_upper`. `n_subsampled = n_tokens`. The sketch's empty-cycle handling covers this case.
- `points_2d` and `points_3d` are projections of the same intermediate (30D for PCA) space. For PCA they are the first 2 and first 3 components of the same fitted reducer. For non-linear sibling caches (UMAP etc.) they require separate fits per dimension; see section 11.2.
- `bridge_subsampled_index` equals `0` in all valid cache files generated under `always_include_bridge: true`.
- `distance_matrix_upper` is the flattened upper triangle of the pairwise distance matrix in the **intermediate-dim** space (30D for PCA, possibly different for sibling caches), computed on the subsampled cloud. The metric is recorded in `compute.reduction.distance_metric`. **Array length is `n_subsampled * (n_subsampled - 1) / 2`**, with elements in row-major order over pairs `(i, j)` for `0 <= i < j < n_subsampled`. Reconstruction snippet for the sketch (slice 6):
  ```js
  function reconstructDistanceMatrix(upper, n) {
    const M = Array.from({ length: n }, () => new Float64Array(n));
    let k = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        M[i][j] = upper[k];
        M[j][i] = upper[k];
        k++;
      }
    }
    return M;
  }
  ```
- `persistence_diagram` contains **all finite** (birth, death) pairs from ripser on the subsampled cloud, regardless of `lifetime_threshold`. The threshold filters which features get cycle representatives, not which features appear in the diagram. Infinite-death features are filtered out at precompute time.
- `h1_cycles[].rank` is the lifetime rank **in the full diagram-ordered H1 list**. If extraction fails for the 2nd longest feature, the extracted cycles have ranks 0 and 2, with no rank 1.
- `h1_cycles[].extraction_method` is `"shortest_cycle_at_birth"` or `"cocycle_support_walk"`. The sketch renders fallback cycles with a dashed outline (section 6.11).
- `h1_cycles[].representative_subsampled_indices` is a closed sequence (first == last) tracing the cycle. To recover original token positions: `subsampled_token_indices[representative_subsampled_indices[k]]`.
- `correctness.default` is always a Python bool, coerced via `bool(int(value))` at precompute time.

### 4.3 Schema versioning policy

- **Patch version** (1.0.0 -> 1.0.1): typo fixes, comment improvements, documentation-only changes that do not alter how readers interpret any field.
- **Minor version** (1.0.0 -> 1.1.0): additive fields. Sketch reads new caches; older sketches ignore new fields.
- **Major version** (1.0.0 -> 2.0.0): breaking changes (renamed, removed, or semantically-altered fields).

The sketch validates `manifest.schema_version` against an `EXPECTED_SCHEMA_MAJOR` constant on startup. Mismatched major version produces a hard-fail error banner.

---

## 5. The precompute script

Path: `scripts/precompute_h1_cycles.py`

See the implementation for details. The spec sections below document the design decisions.

### 5.7 Cycle representative extraction

This is the highest-risk piece of the script. Ripser's cocycles are 1-cochains and their support does not in general contain a representative cycle of the corresponding H1 feature. The primary algorithm builds the Rips graph at just-above-birth scale and finds the shortest cycle through a vertex from the cocycle support. The fallback walks the cocycle support directly.

### 5.8 Prompt/subject/level fallback chain

Each NPZ may or may not contain `math_prompt`, `subject`, and `level`. The H1 script avoids depending on HuggingFace:

1. If the NPZ has the field, use it.
2. Else if `--breathing-cache` points to a valid file with an entry for this problem, use that.
3. Else extract subject from source manifest's `unique_id` path (e.g. `test/precalculus/807.json` -> "Precalculus").
4. Else use placeholders: `math_prompt = ""`, `subject = "unknown"`, `level = 0`.

---

## 6-14. See full spec in conversation history.

The remaining sections cover the sketch UI (slices 1-7), hard-fail discipline, glossary, resolved decisions, future scaffold, file path index, and spec-level invariants. They are not reproduced here to keep this file focused on the precompute pipeline which is the current slice.
