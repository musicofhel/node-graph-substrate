"""Experiment Explorer API — serves precomputed projections and metadata.

Follows the h1_loop_data.py pattern: precomputed JSON files served via
FastAPI endpoints with module-level singletons initialized at startup.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from substrate.packs.experiments.parser import parse_findings, parse_next_experiments

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/experiments", tags=["experiments"])

_DATA_DIR: Path | None = None
_MANIFEST: dict | None = None
_ROI_CACHE: list[dict] | None = None
_FINDINGS_CACHE: list[dict] | None = None
_BATCH_CACHE: dict[str, dict] = {}

ALGORITHMS = [
    {"name": "pca_raw", "label": "PCA (raw)", "description": "Standard PCA on raw activations"},
    {"name": "dom_probe", "label": "DoM Probe", "description": "Difference-of-Means correctness direction"},
    {"name": "spectral_alpha", "label": "Spectral Alpha", "description": "SVD power-law exponent per layer"},
    {"name": "position_decomp", "label": "Position Decomp", "description": "Song-Zhong residualized activations"},
    {"name": "label_moment", "label": "Label Moment", "description": "Label-weighted moment operator eigenvectors"},
    {"name": "umap", "label": "UMAP", "description": "UMAP embedding of activations"},
]


def _find_data_dir() -> Path:
    candidates = [
        Path(__file__).resolve().parent.parent.parent.parent.parent / "docs" / "sketches" / "experiments" / "data",
        Path("/app/docs/sketches/experiments/data"),
    ]
    for c in candidates:
        if c.exists():
            return c
    raise FileNotFoundError("Experiment projection data dir not found")


def init_experiment_data():
    global _DATA_DIR, _MANIFEST, _ROI_CACHE, _FINDINGS_CACHE

    try:
        _DATA_DIR = _find_data_dir()
        manifest_path = _DATA_DIR.parent / "manifest.json"
        if manifest_path.exists():
            _MANIFEST = json.loads(manifest_path.read_text())
        logger.info("Experiment data loaded: dir=%s", _DATA_DIR)
        for algo_dir in _DATA_DIR.iterdir():
            if not algo_dir.is_dir():
                continue
            points = []
            for idx in range(500):
                fp = algo_dir / f"problem_{idx:03d}_L19.json"
                if fp.exists():
                    points.append(json.loads(fp.read_bytes()))
            if points:
                _BATCH_CACHE[f"{algo_dir.name}:19"] = {
                    "algorithm": algo_dir.name,
                    "layer": "19",
                    "n_points": len(points),
                    "viz_type": points[0].get("viz_type", "cloud"),
                    "points_2d": [p["points_2d"] for p in points],
                    "points_3d": [p["points_3d"] for p in points],
                    "correctness": [p["correctness"] for p in points],
                    "metadata": points[0].get("metadata", {}),
                }
        logger.info("Batch cache: %d algorithm-layer combos", len(_BATCH_CACHE))
    except FileNotFoundError:
        logger.info("Experiment projection data not found (optional, run precompute script)")

    _ROI_CACHE = parse_next_experiments()
    _FINDINGS_CACHE = parse_findings()
    logger.info(
        "Experiment metadata: %d experiments, %d findings",
        len(_ROI_CACHE or []),
        len(_FINDINGS_CACHE or []),
    )


@router.get("/algorithms")
async def get_algorithms() -> list[dict]:
    available = set()
    if _DATA_DIR:
        available = {d.name for d in _DATA_DIR.iterdir() if d.is_dir()}
    result = []
    for algo in ALGORITHMS:
        result.append({**algo, "available": algo["name"] in available})
    return result


@router.get("/manifest")
async def get_manifest() -> dict:
    if not _MANIFEST:
        raise HTTPException(404, "Manifest not found — run precompute script first")
    return _MANIFEST


@router.get("/algorithms/{algo}/problem/{idx}")
async def get_projection(algo: str, idx: int, layer: str = "19"):
    if not _DATA_DIR:
        raise HTTPException(404, "No projection data — run precompute script first")

    algo_dir = _DATA_DIR / algo
    if not algo_dir.is_dir():
        raise HTTPException(404, f"Algorithm '{algo}' not found")

    filepath = algo_dir / f"problem_{idx:03d}_L{layer}.json"
    if not filepath.exists():
        raise HTTPException(404, f"Problem {idx} layer {layer} not found for {algo}")

    return Response(content=filepath.read_bytes(), media_type="application/json")


@router.get("/algorithms/{algo}/all")
async def get_all_projections(algo: str, layer: str = "19"):
    key = f"{algo}:{layer}"
    if key in _BATCH_CACHE:
        return _BATCH_CACHE[key]

    if not _DATA_DIR:
        raise HTTPException(404, "No projection data")

    algo_dir = _DATA_DIR / algo
    if not algo_dir.is_dir():
        raise HTTPException(404, f"Algorithm '{algo}' not found")

    points = []
    for idx in range(500):
        fp = algo_dir / f"problem_{idx:03d}_L{layer}.json"
        if fp.exists():
            points.append(json.loads(fp.read_bytes()))
    if not points:
        raise HTTPException(404, f"No data for {algo} layer {layer}")

    result = {
        "algorithm": algo,
        "layer": layer,
        "n_points": len(points),
        "viz_type": points[0].get("viz_type", "cloud"),
        "points_2d": [p["points_2d"] for p in points],
        "points_3d": [p["points_3d"] for p in points],
        "correctness": [p["correctness"] for p in points],
        "metadata": points[0].get("metadata", {}),
    }
    _BATCH_CACHE[key] = result
    return result


@router.get("/roi")
async def get_roi(
    limit: int = Query(20, ge=1, le=200),
    status: str | None = None,
) -> list[dict]:
    if not _ROI_CACHE:
        return []
    results = _ROI_CACHE
    if status:
        results = [e for e in results if e["status"] == status.upper()]
    return results[:limit]


@router.get("/findings")
async def get_findings() -> list[dict]:
    return _FINDINGS_CACHE or []


@router.post("/refresh")
async def refresh_metadata():
    global _ROI_CACHE, _FINDINGS_CACHE
    _ROI_CACHE = parse_next_experiments()
    _FINDINGS_CACHE = parse_findings()
    return {
        "experiments": len(_ROI_CACHE or []),
        "findings": len(_FINDINGS_CACHE or []),
    }
