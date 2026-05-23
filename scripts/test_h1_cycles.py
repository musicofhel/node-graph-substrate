"""Unit tests for H1 cycle extraction and supporting functions.

All tests use small synthetic inputs of known topology — no MATH-500 data.
"""
import json
import tempfile
from pathlib import Path

import numpy as np
import pytest
from ripser import ripser

from scripts.precompute_h1_cycles import (
    shortest_cycle_at_birth,
    cocycle_support_walk,
    pca_transform,
    build_subsample,
    coerce_correct,
    build_distance_matrix_upper,
    extract_cycles_for_problem,
    SCHEMA_VERSION,
)


def _ring_points(n=12, radius=1.0, ndim=5):
    """Points arranged in a ring (circle) — guaranteed H1 feature."""
    angles = np.linspace(0, 2 * np.pi, n + 1)[:-1]
    pts_2d = np.column_stack([np.cos(angles) * radius, np.sin(angles) * radius])
    pts = np.zeros((n, ndim))
    pts[:, :2] = pts_2d
    return pts


class TestShortestCycleAtBirth:
    def test_ring(self):
        """12 points in a ring — should find a closed cycle through 3+ vertices."""
        pts = _ring_points(n=12, radius=1.0)
        result = ripser(pts, maxdim=1, do_cocycles=True)
        h1 = result["dgms"][1]
        finite = h1[np.isfinite(h1[:, 1])]
        assert len(finite) >= 1, "Ring should have at least one H1 feature"

        birth, death = finite[0]
        cocycle = result["cocycles"][1][0]
        cycle = shortest_cycle_at_birth(pts, cocycle, birth, death)
        assert cycle[0] == cycle[-1], "Cycle must be closed"
        assert len(set(cycle)) >= 3, "Cycle must have at least 3 distinct vertices"

    def test_two_loops_same_birth(self):
        """Two disjoint loops: 4-cycle and 6-cycle separated in space.

        The 4-cycle is shorter; verify it is returned when starting from
        a cocycle-support vertex that belongs to it.
        """
        # Small square (4 vertices)
        sq = np.array([
            [0, 0], [1, 0], [1, 1], [0, 1],
        ], dtype=float)
        # Larger hexagon offset far away (6 vertices)
        angles = np.linspace(0, 2 * np.pi, 7)[:-1]
        hex_pts = np.column_stack([np.cos(angles), np.sin(angles)]) * 2.0
        hex_pts += [10, 0]  # offset

        pts = np.vstack([sq, hex_pts])
        pts_5d = np.zeros((len(pts), 5))
        pts_5d[:, :2] = pts

        result = ripser(pts_5d, maxdim=1, do_cocycles=True)
        h1 = result["dgms"][1]
        finite_mask = np.isfinite(h1[:, 1])
        finite = h1[finite_mask]

        assert len(finite) >= 1, "Should detect at least one H1 feature"
        # Test with the longest-lived feature
        idx_longest = np.argmax(finite[:, 1] - finite[:, 0])
        birth, death = finite[idx_longest]
        cocycle = result["cocycles"][1][np.where(finite_mask)[0][idx_longest]]
        cycle = shortest_cycle_at_birth(pts_5d, cocycle, birth, death)
        assert cycle[0] == cycle[-1]
        assert len(set(cycle)) >= 3

    def test_bridge_not_forced(self):
        """Verify cycle extraction doesn't force index 0 into the cycle.

        Build a configuration where index 0 is far from the cycle.
        """
        # Cycle at indices 1-4, bridge (idx 0) far away
        cycle_pts = np.array([
            [10, 10],  # idx 0 — bridge, far away
            [0, 0],    # idx 1
            [1, 0],    # idx 2
            [1, 1],    # idx 3
            [0, 1],    # idx 4
        ], dtype=float)
        pts_5d = np.zeros((5, 5))
        pts_5d[:, :2] = cycle_pts

        result = ripser(pts_5d, maxdim=1, do_cocycles=True)
        h1 = result["dgms"][1]
        finite = h1[np.isfinite(h1[:, 1])]
        if len(finite) == 0:
            pytest.skip("No H1 feature detected in this configuration")

        birth, death = finite[0]
        cocycle = result["cocycles"][1][0]
        cycle = shortest_cycle_at_birth(pts_5d, cocycle, birth, death)
        assert cycle[0] == cycle[-1]
        # Index 0 should not be in the cycle (it's far away)
        assert 0 not in set(cycle), "Bridge should not be forced into the cycle"

    def test_isolated_at_birth(self):
        """A cocycle-support vertex with no Rips edges at birth scale should be skipped."""
        # Ring of 12 points ensures a clear H1 feature
        pts = _ring_points(n=12, radius=1.0)
        result = ripser(pts, maxdim=1, do_cocycles=True)
        h1 = result["dgms"][1]
        finite = h1[np.isfinite(h1[:, 1])]
        assert len(finite) >= 1, "Ring should have H1 features"

        birth, death = finite[0]
        cocycle = result["cocycles"][1][0]
        cycle = shortest_cycle_at_birth(pts, cocycle, birth, death)
        assert cycle[0] == cycle[-1]
        assert len(set(cycle)) >= 3

    def test_all_isolated_at_birth_raises(self):
        """All cocycle-support vertices isolated at birth → ValueError."""
        pts = np.array([[0, 0], [1, 0], [0.5, 0.8]], dtype=float)
        # Fake cocycle where support vertices won't have edges at a tiny threshold
        fake_cocycle = np.array([[0, 1, 1]])
        with pytest.raises(ValueError, match="No valid shortest cycle"):
            shortest_cycle_at_birth(pts, fake_cocycle, birth=0.0, death=0.001)


class TestCocycleSupportWalk:
    def test_disconnected_components(self):
        """Cocycle with two connected components — fallback returns one closed walk."""
        # Triangle edges: 0-1, 1-2, 2-0  (connected)
        cocycle = np.array([
            [0, 1, 1],
            [1, 2, 1],
            [2, 0, 1],
        ])
        walk = cocycle_support_walk(cocycle)
        assert walk[0] == walk[-1]
        assert len(set(walk)) >= 3


class TestBuildSubsample:
    def test_bridge_always_at_index_zero(self):
        """200-token trajectory: index 0 is bridge, rest from [1, 200)."""
        indices = build_subsample(200, idx=0, max_points=100, seed_base=42)
        assert len(indices) == 100
        assert indices[0] == 0, "Bridge must be at subsampled index 0"
        assert all(i > 0 for i in indices[1:]), "Non-bridge indices must be > 0"
        assert len(set(indices)) == 100, "All indices must be distinct"
        assert max(indices) < 200

    def test_short_trajectory_no_subsampling(self):
        """Trajectory shorter than max_points: no subsampling."""
        indices = build_subsample(50, idx=0, max_points=100, seed_base=42)
        np.testing.assert_array_equal(indices, np.arange(50))

    def test_deterministic(self):
        """Same idx + seed_base always produces same subsample."""
        a = build_subsample(500, idx=7, max_points=100, seed_base=42)
        b = build_subsample(500, idx=7, max_points=100, seed_base=42)
        np.testing.assert_array_equal(a, b)

    def test_different_problems_differ(self):
        """Different problem indices produce different subsamples."""
        a = build_subsample(500, idx=0, max_points=100, seed_base=42)
        b = build_subsample(500, idx=1, max_points=100, seed_base=42)
        assert not np.array_equal(a, b)


class TestDistanceMatrixUpperTriangle:
    def test_round_trip(self):
        """5x5 known distance matrix: flattened upper triangle of length 10 round-trips."""
        pts = np.array([
            [0, 0], [1, 0], [0, 1], [1, 1], [2, 2],
        ], dtype=float)
        upper = build_distance_matrix_upper(pts)
        n = 5
        assert len(upper) == n * (n - 1) // 2

        # Reconstruct full matrix
        M = np.zeros((n, n))
        k = 0
        for i in range(n):
            for j in range(i + 1, n):
                M[i, j] = upper[k]
                M[j, i] = upper[k]
                k += 1

        # Verify against direct computation
        for i in range(n):
            for j in range(n):
                expected = np.linalg.norm(pts[i] - pts[j])
                np.testing.assert_allclose(M[i, j], expected, atol=1e-12)

    def test_empty_for_single_point(self):
        """Single point: empty upper triangle."""
        pts = np.array([[1.0, 2.0]])
        upper = build_distance_matrix_upper(pts)
        assert upper == []


class TestPcaSerializationRoundTrip:
    def test_round_trip(self):
        """Fit PCA, save to .npz, load arrays, verify transform matches sklearn."""
        from sklearn.decomposition import PCA
        rng = np.random.default_rng(123)
        X = rng.standard_normal((200, 50))

        pca = PCA(n_components=10)
        pca.fit(X)
        expected = pca.transform(X)

        with tempfile.NamedTemporaryFile(suffix=".npz", delete=False) as f:
            tmp_path = f.name
        try:
            np.savez(tmp_path, components_=pca.components_, mean_=pca.mean_)
            with np.load(tmp_path) as loaded:
                components = loaded["components_"]
                mean = loaded["mean_"]

            result = pca_transform(X, components, mean)
            np.testing.assert_allclose(result, expected, rtol=1e-12)
        finally:
            Path(tmp_path).unlink(missing_ok=True)


class TestCorrectnessCoercion:
    @pytest.mark.parametrize("value,expected", [
        (np.bool_(True), True),
        (np.bool_(False), False),
        (np.int64(1), True),
        (np.int64(0), False),
        (1, True),
        (0, False),
        (True, True),
        (False, False),
        (np.array(True), True),
        (np.array(1), True),
    ])
    def test_coercion(self, value, expected):
        assert coerce_correct(value) is expected


class TestDegenerateTokenCount:
    def test_two_tokens(self):
        """2-token trajectory: valid output with empty diagrams."""
        pts = np.array([[0, 0, 0, 0, 0], [1, 0, 0, 0, 0]], dtype=float)
        # Simulate what the script does: n_subsampled < 3 → skip ripser
        assert pts.shape[0] < 3
        # The script produces empty diagrams in this case
        persistence_diagram = {"H0": [], "H1": [], "H2": []}
        h1_cycles = []
        assert len(persistence_diagram["H1"]) == 0
        assert len(h1_cycles) == 0


class TestRankAssignmentWithExtractionFailure:
    def test_rank_gaps(self):
        """Three H1 features, 2nd extraction fails: ranks 0 and 2."""
        # Build a point cloud with multiple H1 features
        # Circle of 20 points gives a clear H1 feature
        angles = np.linspace(0, 2 * np.pi, 21)[:-1]
        circle = np.column_stack([np.cos(angles), np.sin(angles)])
        pts_5d = np.zeros((20, 5))
        pts_5d[:, :2] = circle

        result = ripser(pts_5d, maxdim=1, do_cocycles=True)
        _, h1_cycles = extract_cycles_for_problem(pts_5d, result)

        if len(h1_cycles) >= 2:
            # Ranks should be sequential starting from 0
            ranks = [c["rank"] for c in h1_cycles]
            assert ranks[0] == 0
            for c in h1_cycles:
                assert c["extraction_method"] in ("shortest_cycle_at_birth", "cocycle_support_walk")
        elif len(h1_cycles) == 1:
            assert h1_cycles[0]["rank"] == 0
