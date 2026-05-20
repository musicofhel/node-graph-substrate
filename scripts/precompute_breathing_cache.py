#!/usr/bin/env python3
"""Pre-compute per-problem PR heatmaps from MATH-500 hidden states.

Reads 500 NPZ files from ~/topo-confidence/pathway8_layerwise/data/math500/,
computes participation ratio at 8 CoT positions × 28 transformer layers using
a sliding window of W=32 tokens, and writes two output files:

  data/math500_breathing_cache.json   — full cache for synthetic_daemon.py
  frontend/public/math500_prompts.json — lightweight prompts for the frontend
"""
from __future__ import annotations

import json
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

TOPO_ROOT = Path.home() / "topo-confidence"
DATA_DIR = TOPO_ROOT / "pathway8_layerwise" / "data" / "math500"
OUT_DIR = Path(__file__).resolve().parent.parent
CACHE_PATH = OUT_DIR / "data" / "math500_breathing_cache.json"
PROMPTS_PATH = OUT_DIR / "frontend" / "public" / "math500_prompts.json"

TARGET_POSITIONS = [0, 1, 10, 25, 50, 100, 200]  # final appended per-problem
POSITION_LABELS = ["prefill", "pos 1", "pos 10", "pos 25", "pos 50", "pos 100", "pos 200", "final"]
N_LAYERS = 28
W = 32  # sliding window size


def participation_ratio(X: np.ndarray) -> float:
    if X.shape[0] < 2:
        return float("nan")
    Xc = X.astype(np.float64) - X.astype(np.float64).mean(axis=0, keepdims=True)
    s = np.linalg.svd(Xc, full_matrices=False, compute_uv=False)
    s2 = s ** 2
    den = (s2 ** 2).sum()
    if den <= 0:
        return float("nan")
    return float(s2.sum() ** 2 / den)


def process_problem(idx: int) -> dict | None:
    npz_path = DATA_DIR / f"problem_{idx:03d}.npz"
    if not npz_path.exists():
        return None

    d = np.load(npz_path, allow_pickle=True)
    states = d["states"]  # (29, N_tokens, 1536)
    N = states.shape[1]
    correct = bool(d["correct"])
    mean_logprob = float(d["mean_logprob"])

    positions = [min(p, N - 1) for p in TARGET_POSITIONS] + [N - 1]

    heatmap = []
    for pos in positions:
        row = []
        start = max(0, pos - W + 1)
        end = pos + 1
        window_size = end - start
        for layer in range(N_LAYERS):
            layer_idx = layer + 1  # skip embedding at index 0
            window = states[layer_idx, start:end, :]
            if window_size < 2:
                row.append(0.0)
            else:
                pr = participation_ratio(window)
                row.append(round(pr, 2) if not np.isnan(pr) else 0.0)
        heatmap.append(row)

    l19_values = [row[19] for row in heatmap]
    peak = max(l19_values) if l19_values else 1.0
    collapse_ratio = round(l19_values[-1] / peak, 4) if peak > 0 else 0.0

    # Also extract single hidden state vectors at each position for population PR
    pop_vectors = {}
    for pi, pos in enumerate(positions):
        for layer in range(N_LAYERS):
            layer_idx = layer + 1
            vec = states[layer_idx, pos, :].astype(np.float32)
            pop_vectors[(pi, layer)] = vec

    return {
        "idx": idx,
        "correct": correct,
        "mean_logprob": round(mean_logprob, 6),
        "n_gen_tokens": N,
        "heatmap": heatmap,
        "l19_values": l19_values,
        "collapse_ratio": collapse_ratio,
        "pop_vectors": pop_vectors,
    }


def compute_population_pr(results: list[dict]) -> dict:
    """Compute population-level PR at each (position, layer) pair."""
    n_positions = len(POSITION_LABELS)
    correct_vecs: dict[tuple[int, int], list] = {}
    incorrect_vecs: dict[tuple[int, int], list] = {}
    all_vecs: dict[tuple[int, int], list] = {}

    for pi in range(n_positions):
        for li in range(N_LAYERS):
            correct_vecs[(pi, li)] = []
            incorrect_vecs[(pi, li)] = []
            all_vecs[(pi, li)] = []

    for r in results:
        pop = r["pop_vectors"]
        for pi in range(n_positions):
            for li in range(N_LAYERS):
                key = (pi, li)
                if key in pop:
                    vec = pop[key]
                    all_vecs[key].append(vec)
                    if r["correct"]:
                        correct_vecs[key].append(vec)
                    else:
                        incorrect_vecs[key].append(vec)

    def build_heatmap(vecs_dict):
        heatmap = []
        for pi in range(n_positions):
            row = []
            for li in range(N_LAYERS):
                vs = vecs_dict[(pi, li)]
                if len(vs) >= 5:
                    X = np.stack(vs, axis=0)
                    pr = participation_ratio(X)
                    row.append(round(pr, 2) if not np.isnan(pr) else 0.0)
                else:
                    row.append(0.0)
            heatmap.append(row)
        return heatmap

    print("  Computing population PR (all)...")
    pop_all = build_heatmap(all_vecs)
    print("  Computing population PR (correct)...")
    pop_correct = build_heatmap(correct_vecs)
    print("  Computing population PR (incorrect)...")
    pop_incorrect = build_heatmap(incorrect_vecs)

    return {"all": pop_all, "correct": pop_correct, "incorrect": pop_incorrect}


def main():
    t0 = time.time()

    # Load MATH-500 prompts from HuggingFace
    print("Loading MATH-500 from HuggingFace...")
    from datasets import load_dataset
    ds = load_dataset("HuggingFaceH4/MATH-500", split="test")
    hf_problems = []
    for item in ds:
        hf_problems.append({
            "problem": item["problem"],
            "subject": item.get("subject", ""),
            "level": item.get("level", ""),
            "answer": item.get("answer", ""),
            "unique_id": item.get("unique_id", ""),
        })
    print(f"  Loaded {len(hf_problems)} prompts")

    # Load manifest for alignment check
    manifest = json.load(open(DATA_DIR / "manifest.json"))
    manifest_problems = manifest.get("problems", [])
    n_problems = min(len(hf_problems), len(manifest_problems), 500)

    # Process NPZ files in parallel
    print(f"Processing {n_problems} NPZ files with 4 workers (W={W})...")
    results_map: dict[int, dict] = {}
    with ProcessPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(process_problem, i): i for i in range(n_problems)}
        done = 0
        for future in as_completed(futures):
            idx = futures[future]
            try:
                result = future.result()
                if result:
                    results_map[idx] = result
            except Exception as e:
                print(f"  ERROR on problem {idx}: {e}", file=sys.stderr)
            done += 1
            if done % 50 == 0:
                print(f"  {done}/{n_problems} problems processed")

    print(f"  {len(results_map)}/{n_problems} problems succeeded")

    # Compute population PR
    print("Computing population-level PR...")
    population_pr = compute_population_pr(list(results_map.values()))

    # Build output
    n_correct = sum(1 for r in results_map.values() if r["correct"])
    problems_out = []
    prompts_out = []

    for idx in range(n_problems):
        if idx not in results_map:
            continue
        r = results_map[idx]
        hf = hf_problems[idx] if idx < len(hf_problems) else {}
        mp = manifest_problems[idx] if idx < len(manifest_problems) else {}

        # Strip pop_vectors before saving (not JSON-serializable and large)
        problems_out.append({
            "idx": r["idx"],
            "correct": r["correct"],
            "mean_logprob": r["mean_logprob"],
            "n_gen_tokens": r["n_gen_tokens"],
            "subject": hf.get("subject", ""),
            "level": hf.get("level", ""),
            "unique_id": mp.get("unique_id", hf.get("unique_id", "")),
            "math_prompt": hf.get("problem", ""),
            "heatmap": r["heatmap"],
            "l19_values": r["l19_values"],
            "collapse_ratio": r["collapse_ratio"],
        })

        prompts_out.append({
            "idx": idx,
            "prompt": hf.get("problem", ""),
            "subject": hf.get("subject", ""),
            "level": hf.get("level", ""),
            "correct": r["correct"],
        })

    cache = {
        "metadata": {
            "created": datetime.now(timezone.utc).isoformat(),
            "model": "Qwen/Qwen2.5-1.5B-Instruct",
            "n_problems": len(problems_out),
            "n_correct": n_correct,
            "accuracy": round(n_correct / len(problems_out), 4) if problems_out else 0,
            "window_size": W,
            "positions": POSITION_LABELS,
            "n_layers": N_LAYERS,
        },
        "population_pr": population_pr,
        "problems": problems_out,
    }

    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_PATH, "w") as f:
        json.dump(cache, f)
    cache_size = CACHE_PATH.stat().st_size / 1024 / 1024
    print(f"Wrote {CACHE_PATH} ({cache_size:.1f} MB)")

    PROMPTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(PROMPTS_PATH, "w") as f:
        json.dump({"problems": prompts_out}, f)
    prompts_size = PROMPTS_PATH.stat().st_size / 1024
    print(f"Wrote {PROMPTS_PATH} ({prompts_size:.0f} KB)")

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.0f}s. {len(problems_out)} problems, {n_correct} correct ({cache['metadata']['accuracy']*100:.1f}%)")


if __name__ == "__main__":
    main()
