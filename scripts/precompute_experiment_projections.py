#!/usr/bin/env python3
"""Precompute 6 algorithm projections on MATH-500 hidden states.

Reads cached activations from ~/topo-confidence and writes per-problem
JSON projections to docs/sketches/experiments/data/{algorithm}/.

Algorithms:
  pca_raw        — Standard PCA on raw L19 activations
  dom_probe      — DoM direction highlighted in PCA space
  spectral_alpha — SVD power-law exponent (scatter: alpha vs correctness)
  position_decomp — Song-Zhong residualized PCA
  label_moment   — Label-weighted moment operator eigenvectors
  umap           — UMAP embedding

Usage:
  python scripts/precompute_experiment_projections.py
  python scripts/precompute_experiment_projections.py --limit 50  # first N only
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

TOPO_ROOT = Path.home() / "topo-confidence"
PREFILL_CACHE = TOPO_ROOT / "pathway11_h100" / "prefill_inversion" / "cache" / "m15b_prefill.npz"
NPZ_DIR = TOPO_ROOT / "pathway8_layerwise" / "data" / "math500"
OUT_ROOT = Path(__file__).resolve().parent.parent / "docs" / "sketches" / "experiments"
OUT_DATA = OUT_ROOT / "data"

N_PROBLEMS = 500
LAYER_19_IDX = 19
SEED = 9999


def auroc(scores: np.ndarray, labels: np.ndarray) -> float:
    pos = scores[labels.astype(bool)]
    neg = scores[~labels.astype(bool)]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    diff = pos[:, None] - neg[None, :]
    wins = (diff > 0).sum() + 0.5 * (diff == 0).sum()
    return float(wins / (len(pos) * len(neg)))


def stratified_kfold(y: np.ndarray, k: int = 5, seed: int = SEED) -> list[np.ndarray]:
    rng = np.random.default_rng(seed)
    pos = np.flatnonzero(y)
    neg = np.flatnonzero(~y)
    rng.shuffle(pos)
    rng.shuffle(neg)
    return [np.concatenate([p, n]) for p, n in zip(np.array_split(pos, k), np.array_split(neg, k))]


def pca_project(X: np.ndarray, n_2d: int = 2, n_3d: int = 3) -> tuple[np.ndarray, np.ndarray]:
    mu = X.mean(axis=0)
    Xc = X - mu
    _, S, Vt = np.linalg.svd(Xc, full_matrices=False)
    pts_2d = (Xc @ Vt[:n_2d].T).tolist()
    pts_3d = (Xc @ Vt[:n_3d].T).tolist()
    return pts_2d, pts_3d


def compute_dom_direction(X: np.ndarray, y: np.ndarray) -> np.ndarray:
    d = X[y].mean(axis=0) - X[~y].mean(axis=0)
    norm = np.linalg.norm(d)
    if norm < 1e-12:
        return np.zeros_like(d)
    return d / norm


def algo_pca_raw(
    prefill: np.ndarray, correct: np.ndarray, n: int
) -> list[dict]:
    X = prefill[:n].astype(np.float64)
    pts_2d, pts_3d = pca_project(X)
    dom_auroc = _oof_dom_auroc(X, correct[:n])
    results = []
    for i in range(n):
        results.append({
            "idx": i,
            "algorithm": "pca_raw",
            "layer": "19",
            "viz_type": "cloud",
            "points_2d": pts_2d[i],
            "points_3d": pts_3d[i],
            "n_points": 1,
            "correctness": bool(correct[i]),
            "metadata": {"method": "PCA on raw L19 prefill"},
        })
    return results


def algo_dom_probe(
    prefill: np.ndarray, correct: np.ndarray, n: int
) -> list[dict]:
    X = prefill[:n].astype(np.float64)
    y = correct[:n]
    dom_dir = compute_dom_direction(X, y)
    dom_scores = X @ dom_dir
    dom_auroc_val = _oof_dom_auroc(X, y)

    mu = X.mean(axis=0)
    Xc = X - mu
    residual = Xc - np.outer(Xc @ dom_dir, dom_dir)
    _, _, Vt_res = np.linalg.svd(residual, full_matrices=False)

    results = []
    for i in range(n):
        pc1_res = float(residual[i] @ Vt_res[0])
        pc2_res = float(residual[i] @ Vt_res[1])
        results.append({
            "idx": i,
            "algorithm": "dom_probe",
            "layer": "19",
            "viz_type": "cloud",
            "points_2d": [float(dom_scores[i]), pc1_res],
            "points_3d": [float(dom_scores[i]), pc1_res, pc2_res],
            "n_points": 1,
            "correctness": bool(y[i]),
            "metadata": {
                "dom_score": float(dom_scores[i]),
                "auroc": dom_auroc_val,
                "key_metric_name": "DoM AUROC (OOF)",
            },
        })
    return results


def algo_spectral_alpha(n: int, correct: np.ndarray) -> list[dict]:
    results = []
    for i in range(n):
        npz_path = NPZ_DIR / f"problem_{i:03d}.npz"
        if not npz_path.exists():
            continue
        d = np.load(npz_path, allow_pickle=True)
        states = d["states"][LAYER_19_IDX].astype(np.float64)

        sigma = np.linalg.svd(states, compute_uv=False)
        k = min(50, len(sigma))
        if k < 5:
            continue

        sig = sigma[:k]
        if (sig <= 0).any():
            continue

        log_k = np.log(np.arange(1, k + 1, dtype=np.float64))
        log_s = np.log(sig)
        log_k_c = log_k - log_k.mean()
        log_s_c = log_s - log_s.mean()
        alpha = float(-(log_k_c * log_s_c).sum() / (log_k_c * log_k_c).sum())

        results.append({
            "idx": i,
            "algorithm": "spectral_alpha",
            "layer": "19",
            "viz_type": "scatter",
            "points_2d": [alpha, 1.0 if bool(correct[i]) else 0.0],
            "points_3d": [alpha, 1.0 if bool(correct[i]) else 0.0, float(sigma[0])],
            "n_points": 1,
            "correctness": bool(correct[i]),
            "metadata": {
                "alpha": alpha,
                "top_singular": float(sigma[0]),
                "key_metric_name": "Spectral alpha",
            },
        })

    return results


def algo_position_decomp(
    prefill: np.ndarray, correct: np.ndarray, n: int
) -> list[dict]:
    X_raw = prefill[:n].astype(np.float64)
    y = correct[:n]

    lengths = np.zeros(n, dtype=np.int64)
    global_sum = np.zeros(1536, dtype=np.float64)
    global_count = 0
    T_max = 0

    for i in range(n):
        npz_path = NPZ_DIR / f"problem_{i:03d}.npz"
        if not npz_path.exists():
            continue
        d = np.load(npz_path, allow_pickle=True)
        T_i = d["states"].shape[1]
        lengths[i] = T_i
        T_max = max(T_max, T_i)
        s0 = d["states"][LAYER_19_IDX, 0].astype(np.float64)
        global_sum += s0
        global_count += 1

    mu = global_sum / max(global_count, 1)

    pos_sum = np.zeros((min(T_max, 2), 1536), dtype=np.float64)
    pos_count = np.zeros(min(T_max, 2), dtype=np.int64)
    for i in range(n):
        npz_path = NPZ_DIR / f"problem_{i:03d}.npz"
        if not npz_path.exists():
            continue
        s0 = np.load(npz_path, allow_pickle=True)["states"][LAYER_19_IDX, 0].astype(np.float64)
        pos_sum[0] += s0
        pos_count[0] += 1

    pos_bias = np.zeros_like(pos_sum)
    valid = pos_count > 0
    pos_bias[valid] = pos_sum[valid] / pos_count[valid, None] - mu

    prefill_resid = X_raw - mu - pos_bias[0]

    pts_2d, pts_3d = pca_project(prefill_resid)
    resid_auroc = _oof_dom_auroc(prefill_resid, y)

    results = []
    for i in range(n):
        results.append({
            "idx": i,
            "algorithm": "position_decomp",
            "layer": "19",
            "viz_type": "cloud",
            "points_2d": pts_2d[i],
            "points_3d": pts_3d[i],
            "n_points": 1,
            "correctness": bool(y[i]),
            "metadata": {
                "auroc_residualized": resid_auroc,
                "key_metric_name": "DoM AUROC (residualized)",
            },
        })
    return results


def algo_label_moment(
    prefill: np.ndarray, correct: np.ndarray, n: int
) -> list[dict]:
    X = prefill[:n].astype(np.float64)
    y = correct[:n].astype(np.float64)

    y_centered = y - y.mean()
    C = (X.T * y_centered) @ X / n
    C = (C + C.T) / 2

    eigvals, eigvecs = np.linalg.eigh(C)
    top_idx = np.argsort(np.abs(eigvals))[::-1]
    v1 = eigvecs[:, top_idx[0]]
    v2 = eigvecs[:, top_idx[1]]
    v3 = eigvecs[:, top_idx[2]]

    proj_2d = np.column_stack([X @ v1, X @ v2])
    proj_3d = np.column_stack([X @ v1, X @ v2, X @ v3])

    scores_v1 = X @ v1
    lm_auroc = auroc(scores_v1, correct[:n])

    results = []
    for i in range(n):
        results.append({
            "idx": i,
            "algorithm": "label_moment",
            "layer": "19",
            "viz_type": "cloud",
            "points_2d": proj_2d[i].tolist(),
            "points_3d": proj_3d[i].tolist(),
            "n_points": 1,
            "correctness": bool(correct[i]),
            "metadata": {
                "lm_score": float(scores_v1[i]),
                "auroc_v1": lm_auroc,
                "key_metric_name": "Label-moment V1 AUROC",
            },
        })
    return results


def algo_umap(
    prefill: np.ndarray, correct: np.ndarray, n: int
) -> list[dict]:
    try:
        import umap
    except ImportError:
        log.warning("umap-learn not installed, skipping UMAP algorithm")
        return []

    X = prefill[:n].astype(np.float64)

    reducer_2d = umap.UMAP(n_components=2, n_neighbors=15, min_dist=0.1, random_state=42)
    pts_2d = reducer_2d.fit_transform(X)

    reducer_3d = umap.UMAP(n_components=3, n_neighbors=15, min_dist=0.1, random_state=42)
    pts_3d = reducer_3d.fit_transform(X)

    results = []
    for i in range(n):
        results.append({
            "idx": i,
            "algorithm": "umap",
            "layer": "19",
            "viz_type": "cloud",
            "points_2d": pts_2d[i].tolist(),
            "points_3d": pts_3d[i].tolist(),
            "n_points": 1,
            "correctness": bool(correct[i]),
            "metadata": {"method": "UMAP (n_neighbors=15, min_dist=0.1)"},
        })
    return results


def _oof_dom_auroc(X: np.ndarray, y: np.ndarray) -> float:
    folds = stratified_kfold(y, 5, SEED)
    scores = np.zeros(len(y), dtype=np.float64)
    for test_idx in folds:
        train_mask = np.ones(len(y), dtype=bool)
        train_mask[test_idx] = False
        d = X[train_mask & y].mean(axis=0) - X[train_mask & ~y].mean(axis=0)
        scores[test_idx] = X[test_idx] @ d
    return auroc(scores, y)


def write_results(algo_name: str, results: list[dict], out_dir: Path) -> int:
    algo_dir = out_dir / algo_name
    algo_dir.mkdir(parents=True, exist_ok=True)
    for r in results:
        filepath = algo_dir / f"problem_{r['idx']:03d}_L{r['layer']}.json"
        filepath.write_text(json.dumps(r))
    return len(results)


def main():
    parser = argparse.ArgumentParser(description="Precompute experiment projections")
    parser.add_argument("--limit", type=int, default=None, help="Process first N problems only")
    parser.add_argument("--skip-umap", action="store_true", help="Skip UMAP (slow)")
    parser.add_argument("--skip-spectral", action="store_true", help="Skip spectral alpha (reads NPZs)")
    parser.add_argument("--skip-position", action="store_true", help="Skip position decomposition (reads NPZs)")
    args = parser.parse_args()

    if not PREFILL_CACHE.exists():
        log.error("Prefill cache not found at %s", PREFILL_CACHE)
        return 1

    t0 = time.time()
    log.info("Loading prefill cache from %s", PREFILL_CACHE)
    cache = np.load(PREFILL_CACHE)
    prefill = cache["prefill"]
    correct = cache["correct"].astype(bool)
    n = args.limit or N_PROBLEMS
    n = min(n, len(prefill))
    log.info("Processing %d problems (prefill shape: %s)", n, prefill.shape)

    OUT_DATA.mkdir(parents=True, exist_ok=True)

    algorithms = {
        "pca_raw": lambda: algo_pca_raw(prefill, correct, n),
        "dom_probe": lambda: algo_dom_probe(prefill, correct, n),
        "label_moment": lambda: algo_label_moment(prefill, correct, n),
    }

    if not args.skip_spectral:
        algorithms["spectral_alpha"] = lambda: algo_spectral_alpha(n, correct)
    if not args.skip_position:
        algorithms["position_decomp"] = lambda: algo_position_decomp(prefill, correct, n)
    if not args.skip_umap:
        algorithms["umap"] = lambda: algo_umap(prefill, correct, n)

    manifest = {
        "created": datetime.now(timezone.utc).isoformat(),
        "model": "Qwen/Qwen2.5-1.5B-Instruct",
        "n_problems": n,
        "algorithms": {},
    }

    for name, fn in algorithms.items():
        log.info("Computing %s...", name)
        t1 = time.time()
        results = fn()
        count = write_results(name, results, OUT_DATA)
        elapsed = time.time() - t1
        log.info("  %s: %d problems in %.1fs", name, count, elapsed)
        manifest["algorithms"][name] = {
            "n_problems": count,
            "compute_seconds": round(elapsed, 1),
        }

    manifest_path = OUT_ROOT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    log.info("Manifest written to %s", manifest_path)
    log.info("Total: %.1fs", time.time() - t0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
