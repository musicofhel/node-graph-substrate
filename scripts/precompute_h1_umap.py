#!/usr/bin/env python3
"""Add UMAP 2D/3D coordinates to existing H1 loop cache.

Reads points_intermediate (30D PCA space) from each per-problem JSON,
fits UMAP globally (all problems pooled), then writes umap_2d/umap_3d
back into each file.

Requires schema v1.1.0 (points_intermediate field).

Usage:
    python scripts/precompute_h1_umap.py [--data-dir DIR] [--limit N]
"""

import argparse
import json
import logging
import sys
from pathlib import Path

import numpy as np
import umap

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("precompute_h1_umap")


def main():
    parser = argparse.ArgumentParser(description="Add UMAP coordinates to H1 loop cache.")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "docs" / "sketches" / "h1-loop" / "data",
        help="H1 cache directory containing manifest.json and per-problem JSONs",
    )
    parser.add_argument("--limit", type=int, default=None, help="Process first N problems only")
    parser.add_argument("--n-neighbors", type=int, default=15, help="UMAP n_neighbors")
    parser.add_argument("--min-dist", type=float, default=0.1, help="UMAP min_dist")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    data_dir = args.data_dir
    manifest_path = data_dir / "manifest.json"
    if not manifest_path.exists():
        log.error("Manifest not found at %s", manifest_path)
        sys.exit(1)

    manifest = json.loads(manifest_path.read_text())
    problems = manifest.get("problems", [])
    if args.limit:
        problems = problems[:args.limit]

    log.info("Loading points_intermediate from %d problems...", len(problems))
    all_points = []
    slices = []
    skip_count = 0

    for entry in problems:
        fpath = data_dir / entry["file"]
        pdata = json.loads(fpath.read_text())

        pts = pdata.get("points_intermediate")
        if pts is None:
            log.warning("Problem %d missing points_intermediate (schema < 1.1.0), skipping", entry["idx"])
            skip_count += 1
            slices.append((entry, None, 0))
            continue

        arr = np.array(pts, dtype=np.float64)
        slices.append((entry, fpath, len(arr)))
        all_points.append(arr)

    if not all_points:
        log.error("No problems with points_intermediate found. Run precompute_h1_cycles.py first (schema v1.1.0).")
        sys.exit(1)

    pooled = np.vstack(all_points)
    log.info("Pooled %d points from %d problems (%d skipped)", len(pooled), len(all_points), skip_count)

    log.info("Fitting UMAP 2D (n_neighbors=%d, min_dist=%.2f)...", args.n_neighbors, args.min_dist)
    reducer_2d = umap.UMAP(
        n_components=2,
        n_neighbors=args.n_neighbors,
        min_dist=args.min_dist,
        random_state=args.seed,
    )
    umap_2d_all = reducer_2d.fit_transform(pooled)

    log.info("Fitting UMAP 3D...")
    reducer_3d = umap.UMAP(
        n_components=3,
        n_neighbors=args.n_neighbors,
        min_dist=args.min_dist,
        random_state=args.seed,
    )
    umap_3d_all = reducer_3d.fit_transform(pooled)

    log.info("Writing UMAP coordinates back to per-problem files...")
    offset = 0
    written = 0
    for entry, fpath, n in slices:
        if fpath is None:
            continue

        pdata = json.loads(fpath.read_text())
        pdata["umap_2d"] = umap_2d_all[offset:offset + n].tolist()
        pdata["umap_3d"] = umap_3d_all[offset:offset + n].tolist()
        fpath.write_text(json.dumps(pdata, separators=(",", ":")))
        offset += n
        written += 1

    log.info("Done! UMAP coordinates written to %d problems.", written)


if __name__ == "__main__":
    main()
