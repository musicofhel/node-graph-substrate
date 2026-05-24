#!/usr/bin/env python3
"""Precompute H1 cycle representatives for the MATH-500 trajectory cache.

Run from the repo root: python scripts/precompute_h1_cycles.py [options]
See docs/sketches/h1-loop/SPEC.md for full specification.
"""

# BLAS threading must be configured before any import that pulls in numpy.
import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

import argparse
import hashlib
import json
import logging
import sys
import uuid
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import networkx as nx
import numpy as np
import psutil
from ripser import ripser
from sklearn.decomposition import PCA
from tqdm import tqdm

SCHEMA_VERSION = "1.1.0"

_TOKENIZER = None


def _get_tokenizer():
    """Lazy-init tokenizer (loaded once per worker process)."""
    global _TOKENIZER
    if _TOKENIZER is None:
        from transformers import AutoTokenizer
        _TOKENIZER = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-1.5B-Instruct")
    return _TOKENIZER


def _load_prompts_lookup():
    """Load actual math prompts from frontend/public/math500_prompts.json."""
    prompts_path = (
        Path(__file__).resolve().parent.parent
        / "frontend" / "public" / "math500_prompts.json"
    )
    if prompts_path.exists():
        data = json.loads(prompts_path.read_text())
        return {p["idx"]: p for p in data.get("problems", [])}
    return {}


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("precompute_h1_cycles")


# ---------------------------------------------------------------------------
# Algorithm functions (module scope, importable by tests)
# ---------------------------------------------------------------------------

def pca_transform(X, components, mean):
    """Manual PCA transform: (X - mean) @ components.T"""
    return (X.astype(np.float64) - mean) @ components.T


def build_subsample(n_tokens, idx, max_points=100, seed_base=42):
    """Build subsampled token indices with bridge always at index 0.

    Returns:
        Array of token indices into the original trajectory.
        Index 0 is always the bridge (token position 0).
    """
    if n_tokens <= max_points:
        return np.arange(n_tokens)
    rng = np.random.default_rng(seed_base + idx)
    drawn = rng.choice(n_tokens - 1, size=max_points - 1, replace=False) + 1
    drawn = np.sort(drawn)
    return np.concatenate([[0], drawn])


def build_distance_matrix_upper(points):
    """Compute flattened upper triangle of pairwise Euclidean distance matrix.

    Returns list of distances for pairs (i,j) with 0 <= i < j < n.
    """
    n = len(points)
    if n < 2:
        return []
    diffs = points[:, None, :] - points[None, :, :]
    dists = np.sqrt((diffs ** 2).sum(axis=-1))
    upper = []
    for i in range(n):
        for j in range(i + 1, n):
            upper.append(float(dists[i, j]))
    return upper


def coerce_correct(value):
    """Coerce numpy/Python scalar to Python bool."""
    if isinstance(value, np.ndarray):
        value = value.item()
    return bool(int(value))


def shortest_cycle_at_birth(points_intermediate, cocycle, birth, death,
                             fraction=0.01, floor=1e-9):
    """Extract a shortest-cycle representative for an H1 feature.

    Args:
        points_intermediate: (n, dim) array of subsampled points in intermediate space.
        cocycle: (k, 3) array from ripser with non-zero coefficients by construction.
        birth, death: birth/death values of the H1 feature.
        fraction, floor: birth-epsilon margin parameters.

    Returns:
        A closed list of vertex indices (first == last).

    Raises:
        ValueError if no valid cycle can be extracted.
    """
    n = len(points_intermediate)
    eps = max((death - birth) * fraction, floor)
    threshold = birth + eps

    diffs = points_intermediate[:, None, :] - points_intermediate[None, :, :]
    dists = np.sqrt((diffs ** 2).sum(axis=-1))

    G = nx.Graph()
    G.add_nodes_from(range(n))
    iu = np.triu_indices(n, k=1)
    edge_mask = dists[iu] <= threshold
    for i, j in zip(iu[0][edge_mask], iu[1][edge_mask]):
        G.add_edge(int(i), int(j), weight=float(dists[i, j]))

    candidates = set()
    for row in cocycle:
        candidates.add(int(row[0]))
        candidates.add(int(row[1]))
    if not candidates:
        raise ValueError("Cocycle is empty")

    best_cycle = None
    best_length = float("inf")

    for s in candidates:
        if s not in G.nodes or G.degree(s) == 0:
            continue
        for v in list(G.neighbors(s)):
            edge_weight = G[s][v]["weight"]
            G.remove_edge(s, v)
            try:
                path = nx.shortest_path(G, source=v, target=s, weight="weight")
                path_length = sum(
                    G[a][b]["weight"] for a, b in zip(path[:-1], path[1:])
                )
                total_length = edge_weight + path_length
                if total_length < best_length and len(path) >= 2:
                    candidate_cycle = [s] + path
                    if len(set(candidate_cycle)) >= 3:
                        best_length = total_length
                        best_cycle = candidate_cycle
            except nx.NetworkXNoPath:
                pass
            finally:
                G.add_edge(s, v, weight=edge_weight)

    if best_cycle is None:
        raise ValueError(
            "No valid shortest cycle found at birth scale; "
            "all candidate starting vertices isolated or disconnected"
        )

    return best_cycle


def cocycle_support_walk(cocycle):
    """Fallback: walk the cocycle's edge support to find any closed walk."""
    edges = [(int(c[0]), int(c[1])) for c in cocycle]
    if not edges:
        raise ValueError("Cocycle is empty")

    adj = defaultdict(set)
    for i, j in edges:
        adj[i].add(j)
        adj[j].add(i)

    start = min(adj.keys())
    walk = [start]
    used_edges = set()
    current = start
    while True:
        neighbors = [
            n for n in adj[current] if frozenset((current, n)) not in used_edges
        ]
        if not neighbors:
            break
        if start in neighbors and len(walk) >= 3:
            walk.append(start)
            used_edges.add(frozenset((current, start)))
            break
        next_vertex = min(neighbors)
        used_edges.add(frozenset((current, next_vertex)))
        walk.append(next_vertex)
        current = next_vertex
        if current == start and len(walk) >= 4:
            break
    if walk[0] != walk[-1] or len(set(walk)) < 3:
        raise ValueError("Fallback could not extract closed walk")
    return walk


def validate_cycle(cycle, points_intermediate, threshold):
    """Validate a cycle representative.

    Returns True if: first == last, >= 3 distinct vertices,
    and consecutive pairs within threshold.
    """
    if not cycle or cycle[0] != cycle[-1]:
        return False
    if len(set(cycle)) < 3:
        return False
    for a, b in zip(cycle[:-1], cycle[1:]):
        dist = np.linalg.norm(points_intermediate[a] - points_intermediate[b])
        if dist > threshold + 1e-9:
            return False
    return True


def extract_cycles_for_problem(ph_cloud, ripser_result, lifetime_threshold=0.0,
                                birth_fraction=0.01, birth_floor=1e-9):
    """Extract H1 cycle representatives from ripser results.

    Returns:
        (persistence_diagram, h1_cycles) where persistence_diagram is
        {H0: [...], H1: [...], H2: [...]} and h1_cycles is a list of dicts.
    """
    persistence_diagram = {}
    for dim_label, dim_idx in [("H0", 0), ("H1", 1), ("H2", 2)]:
        if dim_idx < len(ripser_result["dgms"]):
            dgm = ripser_result["dgms"][dim_idx]
            finite_mask = np.isfinite(dgm[:, 1])
            pairs = dgm[finite_mask].tolist()
            persistence_diagram[dim_label] = [[round(b, 6), round(d, 6)] for b, d in pairs]
        else:
            persistence_diagram[dim_label] = []

    h1_pairs = persistence_diagram.get("H1", [])
    ranked = sorted(enumerate(h1_pairs), key=lambda x: -(x[1][1] - x[1][0]))

    h1_cycles = []
    for rank, (orig_idx, (birth, death)) in enumerate(ranked):
        lifetime = death - birth
        if lifetime < lifetime_threshold:
            continue

        cocycle_idx = orig_idx
        if cocycle_idx >= len(ripser_result.get("cocycles", [[], []])[1]):
            continue
        cocycle = ripser_result["cocycles"][1][cocycle_idx]
        if len(cocycle) == 0:
            continue

        eps = max((death - birth) * birth_fraction, birth_floor)
        threshold = birth + eps
        method = "shortest_cycle_at_birth"

        try:
            cycle = shortest_cycle_at_birth(
                ph_cloud, cocycle, birth, death,
                fraction=birth_fraction, floor=birth_floor,
            )
            if not validate_cycle(cycle, ph_cloud, threshold):
                raise ValueError("Cycle failed validation")
        except (ValueError, Exception):
            method = "cocycle_support_walk"
            try:
                cycle = cocycle_support_walk(cocycle)
            except (ValueError, Exception):
                continue

        h1_cycles.append({
            "rank": rank,
            "birth": round(birth, 6),
            "death": round(death, 6),
            "lifetime": round(lifetime, 6),
            "extraction_method": method,
            "representative_subsampled_indices": cycle,
        })

    return persistence_diagram, h1_cycles


# ---------------------------------------------------------------------------
# Worker function for Pass 2
# ---------------------------------------------------------------------------

_PCA_ARRAYS = None
_OUTPUT_DIR = None


def _init_worker(output_dir):
    """Initialize worker process: load PCA arrays once."""
    global _PCA_ARRAYS, _OUTPUT_DIR
    _OUTPUT_DIR = output_dir
    pca_path = Path(output_dir) / "pca_fit.npz"
    with np.load(pca_path) as f:
        _PCA_ARRAYS = {
            "components": f["components_"].copy(),
            "mean": f["mean_"].copy(),
        }


def process_problem(args):
    """Process a single problem in a worker process.

    args is a tuple of (idx, npz_path, layer_index_npz, max_points,
                        seed_base, lifetime_threshold, birth_fraction,
                        birth_floor, max_dimension, breathing_cache,
                        source_manifest, prompts_lookup)
    """
    (idx, npz_path, layer_index_npz, max_points, seed_base,
     lifetime_threshold, birth_fraction, birth_floor, max_dimension,
     breathing_cache, source_manifest, prompts_lookup) = args

    npz_path = Path(npz_path)
    npz_sha = hashlib.sha256(npz_path.read_bytes()).hexdigest()

    with np.load(str(npz_path), allow_pickle=True) as data:
        states = data["states"]
        trajectory = states[layer_index_npz].astype(np.float64)
        n_tokens = trajectory.shape[0]

        correct_raw = data["correct"]
        correctness = coerce_correct(correct_raw)

        mean_logprob_raw = data["mean_logprob"]
        if isinstance(mean_logprob_raw, np.ndarray):
            mean_logprob_raw = mean_logprob_raw.item()
        mean_logprob = float(mean_logprob_raw)

        generated_response = ""
        if "text" in data:
            text_val = data["text"]
            if isinstance(text_val, np.ndarray):
                text_val = text_val.item()
            generated_response = str(text_val) if text_val else ""

    math_prompt = (prompts_lookup or {}).get(idx, {}).get("prompt", "")

    token_texts = []
    n_retokenized = 0
    if generated_response:
        tokenizer = _get_tokenizer()
        token_ids = tokenizer.encode(generated_response, add_special_tokens=False)
        token_texts = [tokenizer.decode([tid]) for tid in token_ids]
        n_retokenized = len(token_texts)

    subject = "unknown"
    level = 0
    if source_manifest and idx < len(source_manifest.get("problems", [])):
        prob_entry = source_manifest["problems"][idx]
        uid = prob_entry.get("unique_id", "")
        parts = uid.split("/")
        if len(parts) >= 2:
            subject = parts[1].replace("_", " ").title()

    if breathing_cache and idx < len(breathing_cache.get("problems", [])):
        bc_entry = breathing_cache["problems"][idx]
        if "subject" in bc_entry:
            subject = bc_entry["subject"]
        if "level" in bc_entry:
            level = bc_entry["level"]

    reduced = pca_transform(trajectory, _PCA_ARRAYS["components"], _PCA_ARRAYS["mean"])

    subsample_indices = build_subsample(n_tokens, idx, max_points, seed_base)
    ph_cloud = reduced[subsample_indices]
    n_subsampled = len(subsample_indices)

    points_2d = ph_cloud[:, :2].tolist()
    points_3d = ph_cloud[:, :3].tolist()

    distance_matrix_upper = build_distance_matrix_upper(ph_cloud)

    if n_subsampled < 3:
        persistence_diagram = {"H0": [], "H1": [], "H2": []}
        h1_cycles = []
    else:
        result = ripser(ph_cloud, maxdim=max_dimension, do_cocycles=True)
        persistence_diagram, h1_cycles = extract_cycles_for_problem(
            ph_cloud, result, lifetime_threshold, birth_fraction, birth_floor,
        )

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    per_problem = {
        "idx": idx,
        "schema_version": SCHEMA_VERSION,
        "math_prompt": math_prompt,
        "generated_response": generated_response,
        "token_texts": token_texts,
        "n_retokenized": n_retokenized,
        "subject": subject,
        "level": level,
        "correctness": {"default": correctness},
        "mean_logprob": round(mean_logprob, 6),
        "n_tokens": n_tokens,
        "n_subsampled": n_subsampled,
        "subsampled_token_indices": subsample_indices.tolist(),
        "points_2d": points_2d,
        "points_3d": points_3d,
        "points_intermediate": ph_cloud.tolist(),
        "bridge_subsampled_index": 0,
        "distance_matrix_upper": distance_matrix_upper,
        "persistence_diagram": persistence_diagram,
        "h1_cycles": h1_cycles,
        "generated_at": now,
    }

    h1_all = persistence_diagram.get("H1", [])
    h1_above = [p for p in h1_all if (p[1] - p[0]) >= lifetime_threshold]
    longest_h1 = max((p[1] - p[0] for p in h1_all), default=0.0)
    n_fallback = sum(1 for c in h1_cycles if c["extraction_method"] == "cocycle_support_walk")

    manifest_entry = {
        "idx": idx,
        "subject": subject,
        "level": level,
        "n_tokens": n_tokens,
        "n_subsampled": n_subsampled,
        "n_h1_features_in_diagram": len(h1_all),
        "n_h1_features_above_threshold": len(h1_above),
        "n_h1_cycles_extracted": len(h1_cycles),
        "n_h1_cycles_via_fallback": n_fallback,
        "longest_h1_lifetime": round(longest_h1, 6),
        "correctness_default": correctness,
        "mean_logprob": round(mean_logprob, 6),
        "file": f"{idx:03d}.json",
        "source_npz_sha256": npz_sha,
        "generated_at": now,
    }

    output_path = Path(_OUTPUT_DIR) / f"{idx:03d}.json"
    output_path.write_text(json.dumps(per_problem, separators=(",", ":")))

    return manifest_entry


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _compute_params(args, ripser_version):
    """Build the compute parameters block for the manifest."""
    return {
        "ph_backend": "ripser",
        "ph_backend_version": ripser_version,
        "max_dimension": args.max_dimension,
        "reduction": {
            "method": "pca",
            "source_dim": 1536,
            "intermediate_dim": args.intermediate_dim,
            "final_dim_2d": 2,
            "final_dim_3d": 3,
            "pca_fit_strategy": "pooled_all_tokens_all_problems",
            "pca_fit_subsample": args.pca_fit_subsample,
            "pca_serialized_at": "pca_fit.npz",
            "pca_transform_method": "manual_numpy",
            "distance_metric": "euclidean",
        },
        "trajectory": {
            "layer_index_npz": args.layer_index_npz,
            "layer_index_model": args.layer_index_npz - 1,
            "layer_index_meaning": (
                f"Transformer layer {args.layer_index_npz - 1} "
                f"(NPZ index {args.layer_index_npz}). "
                "NPZ index 0 is embedding, indices 1..N are transformer layers."
            ),
            "token_subset": "all_generated",
        },
        "subsampling": {
            "enabled": True,
            "max_points": args.subsample,
            "rng_seed_strategy": "per_problem_independent",
            "rng_seed_base": args.subsample_seed_base,
            "always_include_bridge": True,
            "live_system_divergences": [
                "Live system uses a single shared rng advanced across problems; "
                "precompute uses per-problem independent rng seeded at seed_base + idx.",
                "Live system does not force-include position 0; precompute always "
                "prepends position 0 to the subsample for trajectories longer than max_points.",
            ],
        },
        "lifetime_threshold": args.lifetime_threshold,
        "cycle_extraction": {
            "algorithm": "shortest_cycle_at_birth",
            "fallback_algorithm": "cocycle_support_walk",
            "starting_vertex_strategy": "minimum_over_cocycle_support",
            "birth_lifetime_fraction": 0.01,
            "birth_absolute_floor": 1e-9,
            "algorithm_description_section": "5.7",
        },
        "distance_matrix_included": True,
    }


_IDEMPOTENCY_KEYS = [
    "ph_backend", "ph_backend_version", "max_dimension",
]
_IDEMPOTENCY_REDUCTION_KEYS = [
    "method", "intermediate_dim", "final_dim_2d", "final_dim_3d",
    "pca_fit_strategy", "pca_fit_subsample", "distance_metric",
]
_IDEMPOTENCY_TRAJECTORY_KEYS = [
    "layer_index_npz", "token_subset",
]
_IDEMPOTENCY_SUBSAMPLING_KEYS = [
    "max_points", "rng_seed_strategy", "rng_seed_base", "always_include_bridge",
]
_IDEMPOTENCY_CYCLE_KEYS = [
    "algorithm", "fallback_algorithm", "starting_vertex_strategy",
    "birth_lifetime_fraction", "birth_absolute_floor",
]


def _params_match(existing, current):
    """Compare compute parameter blocks for idempotency. Returns (match, diff_description)."""
    diffs = []
    for k in _IDEMPOTENCY_KEYS:
        if existing.get(k) != current.get(k):
            diffs.append(f"{k}: {existing.get(k)} -> {current.get(k)}")

    er = existing.get("reduction", {})
    cr = current.get("reduction", {})
    for k in _IDEMPOTENCY_REDUCTION_KEYS:
        if er.get(k) != cr.get(k):
            diffs.append(f"reduction.{k}: {er.get(k)} -> {cr.get(k)}")

    et = existing.get("trajectory", {})
    ct = current.get("trajectory", {})
    for k in _IDEMPOTENCY_TRAJECTORY_KEYS:
        if et.get(k) != ct.get(k):
            diffs.append(f"trajectory.{k}: {et.get(k)} -> {ct.get(k)}")

    es = existing.get("subsampling", {})
    cs = current.get("subsampling", {})
    for k in _IDEMPOTENCY_SUBSAMPLING_KEYS:
        if es.get(k) != cs.get(k):
            diffs.append(f"subsampling.{k}: {es.get(k)} -> {cs.get(k)}")

    if existing.get("lifetime_threshold") != current.get("lifetime_threshold"):
        diffs.append(
            f"lifetime_threshold: {existing.get('lifetime_threshold')} "
            f"-> {current.get('lifetime_threshold')}"
        )

    ec = existing.get("cycle_extraction", {})
    cc = current.get("cycle_extraction", {})
    for k in _IDEMPOTENCY_CYCLE_KEYS:
        if ec.get(k) != cc.get(k):
            diffs.append(f"cycle_extraction.{k}: {ec.get(k)} -> {cc.get(k)}")

    if existing.get("distance_matrix_included") != current.get("distance_matrix_included"):
        diffs.append(
            f"distance_matrix_included: {existing.get('distance_matrix_included')} "
            f"-> {current.get('distance_matrix_included')}"
        )

    return (len(diffs) == 0, "; ".join(diffs))


def main():
    parser = argparse.ArgumentParser(
        description="Precompute H1 cycle representatives for MATH-500 trajectories.",
    )
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path.home() / "topo-confidence" / "pathway8_layerwise" / "data" / "math500",
        help="Source NPZ directory",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "docs" / "sketches" / "h1-loop" / "data",
        help="Output directory (created if needed)",
    )
    parser.add_argument(
        "--breathing-cache",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "data" / "math500_breathing_cache.json",
        help="Existing breathing cache for prompt/subject/level metadata",
    )
    parser.add_argument("--problem", type=int, default=None, help="Process only one problem index")
    parser.add_argument("--limit", type=int, default=None, help="Process first N problems")
    parser.add_argument("--force", action="store_true", help="Recompute even if up to date")
    parser.add_argument("--layer-index-npz", type=int, default=28, help="NPZ layer index")
    parser.add_argument("--max-dimension", type=int, default=2, help="Max PH dimension")
    parser.add_argument("--intermediate-dim", type=int, default=30, help="PCA intermediate dim")
    parser.add_argument("--subsample", type=int, default=100, help="Max points after subsampling")
    parser.add_argument("--subsample-seed-base", type=int, default=42, help="RNG seed base")
    parser.add_argument("--pca-fit-subsample", type=int, default=None,
                        help="Fit PCA on this many randomly-chosen pooled tokens")
    parser.add_argument("--lifetime-threshold", type=float, default=0.0,
                        help="Minimum H1 lifetime to retain")
    parser.add_argument("--workers", type=int, default=4, help="Parallel workers for Pass 2")
    parser.add_argument("--verbose", action="store_true", help="Log per-problem progress")
    args = parser.parse_args()

    if args.verbose:
        log.setLevel(logging.DEBUG)

    source_dir = args.source_dir
    output_dir = args.output_dir

    if not source_dir.exists():
        log.error("Source directory not found: %s. "
                  "Set --source-dir or ensure topo-confidence is at the expected path.", source_dir)
        sys.exit(1)

    source_manifest_path = source_dir / "manifest.json"
    if not source_manifest_path.exists():
        log.error("Source NPZ manifest not found: %s. "
                  "The pathway8 extraction script writes this; cannot proceed without it.",
                  source_manifest_path)
        sys.exit(1)

    source_manifest = json.loads(source_manifest_path.read_text())
    source_manifest_sha = hashlib.sha256(source_manifest_path.read_bytes()).hexdigest()

    output_dir.mkdir(parents=True, exist_ok=True)
    test_file = output_dir / ".write_test"
    try:
        test_file.write_text("ok")
        test_file.unlink()
    except OSError:
        log.error("Cannot write to %s. Check permissions.", output_dir)
        sys.exit(2)

    try:
        import ripser as _ripser_mod
        ripser_version = getattr(_ripser_mod, "__version__", "unknown")
    except AttributeError:
        ripser_version = "unknown"

    current_compute = _compute_params(args, ripser_version)
    script_path = Path(__file__).resolve()
    script_sha = hashlib.sha256(script_path.read_bytes()).hexdigest()

    existing_manifest_path = output_dir / "manifest.json"
    existing_manifest = None
    force_all = args.force
    if existing_manifest_path.exists():
        existing_manifest = json.loads(existing_manifest_path.read_text())

        if not force_all:
            existing_source_sha = existing_manifest.get("source", {}).get("npz_manifest_sha256")
            existing_script_sha = existing_manifest.get("precompute_script_sha256")
            existing_compute = existing_manifest.get("compute", {})

            if existing_source_sha != source_manifest_sha:
                log.info("Source NPZ manifest changed; recomputing all.")
                force_all = True
            elif existing_script_sha != script_sha:
                log.info("Precompute script changed; recomputing all.")
                force_all = True
            else:
                match, diff = _params_match(existing_compute, current_compute)
                if not match:
                    log.error(
                        "Existing manifest at %s was generated with different compute parameters: %s. "
                        "Use --output-dir to write to a sibling directory, or --force to overwrite.",
                        existing_manifest_path, diff,
                    )
                    sys.exit(3)

    npz_files = sorted(source_dir.glob("problem_*.npz"))
    if not npz_files:
        log.error("No NPZ files found in %s", source_dir)
        sys.exit(1)

    idx_to_npz = {}
    for p in npz_files:
        stem = p.stem
        try:
            idx_val = int(stem.split("_")[1])
            idx_to_npz[idx_val] = p
        except (IndexError, ValueError):
            log.warning("Skipping non-standard NPZ filename: %s", p.name)

    if args.problem is not None:
        if args.problem not in idx_to_npz:
            log.error("Problem %d not found in source directory", args.problem)
            sys.exit(1)
        target_indices = [args.problem]
    else:
        target_indices = sorted(idx_to_npz.keys())
        if args.limit:
            target_indices = target_indices[:args.limit]

    breathing_cache = None
    if args.breathing_cache.exists():
        try:
            breathing_cache = json.loads(args.breathing_cache.read_text())
            log.info("Loaded breathing cache with %d problems",
                     len(breathing_cache.get("problems", [])))
        except (json.JSONDecodeError, OSError) as e:
            log.warning("Could not load breathing cache: %s", e)

    prompts_lookup = _load_prompts_lookup()
    if prompts_lookup:
        log.info("Loaded %d math prompts for schema v1.1.0 fields", len(prompts_lookup))
    else:
        log.warning("No math prompts found — math_prompt field will be empty")

    # -----------------------------------------------------------------------
    # Pass 1: Fit PCA
    # -----------------------------------------------------------------------
    pca_path = output_dir / "pca_fit.npz"
    need_pca = not pca_path.exists()

    if need_pca:
        log.info("Pass 1: Fitting PCA on pooled trajectories (layer %d)...", args.layer_index_npz)

        total_memory_bytes = 0
        npz_token_counts = {}
        for idx_val in sorted(idx_to_npz.keys()):
            with np.load(str(idx_to_npz[idx_val])) as data:
                n_tok = data["states"].shape[1]
                npz_token_counts[idx_val] = n_tok
                total_memory_bytes += n_tok * 1536 * 8  # float64

        available = psutil.virtual_memory().available
        if total_memory_bytes > 0.8 * available and args.pca_fit_subsample is None:
            est_gb = total_memory_bytes / (1024 ** 3)
            avail_gb = available / (1024 ** 3)
            log.error(
                "Pooled trajectory array would exceed 80%% of available memory "
                "(%.1f GB needed, %.1f GB available). "
                "Set --pca-fit-subsample N to fit PCA on a random subsample of tokens. "
                "A subsample of 50000 tokens typically suffices.",
                est_gb, avail_gb,
            )
            sys.exit(4)

        all_trajectories = []
        for idx_val in tqdm(sorted(idx_to_npz.keys()), desc="Loading trajectories"):
            with np.load(str(idx_to_npz[idx_val])) as data:
                traj = data["states"][args.layer_index_npz].astype(np.float64)
                all_trajectories.append(traj)

        pooled = np.concatenate(all_trajectories, axis=0)
        log.info("Pooled %d tokens from %d problems", len(pooled), len(all_trajectories))
        del all_trajectories

        if args.pca_fit_subsample and args.pca_fit_subsample < len(pooled):
            rng = np.random.default_rng(42)
            subsample_idx = rng.choice(len(pooled), size=args.pca_fit_subsample, replace=False)
            pooled = pooled[subsample_idx]
            log.info("PCA fit subsampled to %d tokens", len(pooled))

        pca = PCA(n_components=args.intermediate_dim)
        pca.fit(pooled)
        del pooled

        np.savez(
            pca_path,
            components_=pca.components_,
            mean_=pca.mean_,
            explained_variance_=pca.explained_variance_,
            explained_variance_ratio_=pca.explained_variance_ratio_,
            n_features_in_=np.array(pca.n_features_in_),
        )
        log.info("PCA saved to %s (explained variance: %.3f)",
                 pca_path, pca.explained_variance_ratio_.sum())
        del pca
    else:
        log.info("Pass 1: PCA already exists at %s, skipping.", pca_path)

    # -----------------------------------------------------------------------
    # Pass 2: Per-problem processing
    # -----------------------------------------------------------------------
    existing_entries = {}
    if existing_manifest:
        for entry in existing_manifest.get("problems", []):
            existing_entries[entry["idx"]] = entry

    work_items = []
    skipped = 0
    for idx_val in target_indices:
        if idx_val not in idx_to_npz:
            continue

        if not force_all and idx_val in existing_entries:
            entry = existing_entries[idx_val]
            npz_sha = hashlib.sha256(idx_to_npz[idx_val].read_bytes()).hexdigest()
            output_file = output_dir / f"{idx_val:03d}.json"
            if (entry.get("source_npz_sha256") == npz_sha
                    and output_file.exists()):
                try:
                    existing_data = json.loads(output_file.read_text())
                    if existing_data.get("schema_version", "").split(".")[0] == SCHEMA_VERSION.split(".")[0]:
                        skipped += 1
                        continue
                except (json.JSONDecodeError, OSError):
                    pass

        work_items.append((
            idx_val, str(idx_to_npz[idx_val]), args.layer_index_npz,
            args.subsample, args.subsample_seed_base,
            args.lifetime_threshold, 0.01, 1e-9, args.max_dimension,
            breathing_cache, source_manifest, prompts_lookup,
        ))

    if not work_items:
        log.info("Idempotency check passed, no work to do. (%d problems already up to date)", skipped)
        if existing_manifest:
            existing_manifest["last_run_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            existing_manifest_path.write_text(json.dumps(existing_manifest, indent=2))
        return

    log.info("Pass 2: Processing %d problems (%d skipped, %d workers)...",
             len(work_items), skipped, args.workers)

    run_id = str(uuid.uuid4())
    results = []
    failures = []

    if existing_manifest:
        failures = [f for f in existing_manifest.get("failures", [])
                    if f["idx"] not in {w[0] for w in work_items}]

    with ProcessPoolExecutor(
        max_workers=args.workers,
        initializer=_init_worker,
        initargs=(str(output_dir),),
    ) as executor:
        future_to_idx = {}
        for item in work_items:
            future = executor.submit(process_problem, item)
            future_to_idx[future] = item[0]

        for future in tqdm(as_completed(future_to_idx), total=len(future_to_idx),
                           desc="Processing"):
            idx_val = future_to_idx[future]
            try:
                entry = future.result()
                results.append(entry)
            except Exception as e:
                log.error("Problem %d failed: %s", idx_val, e)
                existing_failure = next(
                    (f for f in failures if f["idx"] == idx_val), None
                )
                if existing_failure:
                    existing_failure["exception_type"] = type(e).__name__
                    existing_failure["exception_message"] = str(e)
                    existing_failure["timestamp"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                    existing_failure["run_id"] = run_id
                    existing_failure["attempt_count"] = existing_failure.get("attempt_count", 0) + 1
                else:
                    failures.append({
                        "idx": idx_val,
                        "exception_type": type(e).__name__,
                        "exception_message": str(e),
                        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "run_id": run_id,
                        "attempt_count": 1,
                    })

    new_entries = {e["idx"]: e for e in results}
    all_entries = dict(existing_entries)
    all_entries.update(new_entries)

    for f in failures:
        all_entries.pop(f["idx"], None)

    if args.problem is not None or args.limit:
        pass
    else:
        for idx_val in sorted(idx_to_npz.keys()):
            if idx_val not in all_entries and idx_val not in {f["idx"] for f in failures}:
                pass

    sorted_entries = [all_entries[k] for k in sorted(all_entries.keys())]

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    all_generated = [e.get("generated_at", now) for e in sorted_entries]
    last_modified = max(all_generated) if all_generated else now

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "created_at": (
            existing_manifest.get("created_at", now) if existing_manifest else now
        ),
        "last_run_at": now,
        "last_modified_at": last_modified,
        "precompute_script_sha256": script_sha,
        "source": {
            "npz_directory": str(source_dir),
            "npz_manifest_path": str(source_manifest_path),
            "npz_manifest_sha256": source_manifest_sha,
            "npz_count_total": len(idx_to_npz),
            "npz_count_processed": len(sorted_entries),
        },
        "compute": current_compute,
        "failures": failures,
        "problems": sorted_entries,
    }

    existing_manifest_path.write_text(json.dumps(manifest, indent=2))

    log.info(
        "Done! %d problems processed, %d failures, %d total in manifest.",
        len(results), len(failures), len(sorted_entries),
    )
    if failures:
        for f in failures:
            log.warning("  Failed: problem %d (%s: %s, attempt %d)",
                        f["idx"], f["exception_type"], f["exception_message"],
                        f.get("attempt_count", 1))


if __name__ == "__main__":
    main()
