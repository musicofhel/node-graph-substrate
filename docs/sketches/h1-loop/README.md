# H1 Topological Loop Sketch

Standalone d3/three.js visualization of H1 topological loops from real MATH-500 hidden-state trajectories. See `SPEC.md` for the full specification.

## Setup

```bash
# From repo root
pip install -r scripts/requirements.txt
pytest scripts/test_h1_cycles.py
```

## Precompute cache

Requires NPZ files at `~/topo-confidence/pathway8_layerwise/data/math500/`.

```bash
# Full run (all 500 problems, ~minutes depending on hardware)
python scripts/precompute_h1_cycles.py

# Single problem (for iteration)
python scripts/precompute_h1_cycles.py --problem 42 --force

# First N problems
python scripts/precompute_h1_cycles.py --limit 10

# Custom output directory (sibling cache)
python scripts/precompute_h1_cycles.py --output-dir docs/sketches/h1-loop/data_test/
```

## Serve the sketch

**Important:** `cd` into the sketch directory first so `./data/manifest.json` resolves correctly.

```bash
cd docs/sketches/h1-loop
python -m http.server --bind 127.0.0.1 8765
```

Open http://localhost:8765 in a browser.

## Data

The `data/` directory is gitignored. It contains:
- `manifest.json` — cache metadata and per-problem index
- `pca_fit.npz` — serialized PCA (numpy arrays, no pickle)
- `000.json` through `499.json` — per-problem cycle data
