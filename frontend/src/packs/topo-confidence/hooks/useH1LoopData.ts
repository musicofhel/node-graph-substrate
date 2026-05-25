import { useState, useEffect, useCallback, useRef } from "react";

export type H1Problem = {
  idx: number;
  schema_version: string;
  math_prompt: string;
  generated_response?: string;
  token_texts?: string[];
  n_retokenized?: number;
  subject: string;
  level: number;
  correctness: { default: boolean };
  mean_logprob: number;
  n_tokens: number;
  n_subsampled: number;
  subsampled_token_indices: number[];
  bridge_subsampled_index: number;
  points_2d: number[][];
  points_3d: number[][];
  points_intermediate?: number[][];
  umap_2d?: number[][];
  umap_3d?: number[][];
  distance_matrix_upper?: number[];
  persistence_diagram: {
    H0: number[][];
    H1: number[][];
    H2: number[][];
  };
  h1_cycles: Array<{
    rank: number;
    birth: number;
    death: number;
    lifetime: number;
    extraction_method: string;
    representative_subsampled_indices: number[];
  }>;
};

type ManifestProblem = {
  idx: number;
  subject: string;
  level: number;
  correctness_default: boolean;
  n_tokens: number;
  n_h1_cycles_extracted: number;
  file: string;
};

type Manifest = {
  schema_version: string;
  problems: ManifestProblem[];
  compute: {
    reduction: { method: string; intermediate_dim: number };
    trajectory: { layer_index_npz: number };
  };
};

type ManifestSummary = {
  available_layers: string[];
  problems_per_layer: Record<string, number>;
  schema_versions: Record<string, string>;
};

export function useH1LoopData() {
  const [summary, setSummary] = useState<ManifestSummary | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [problem, setProblem] = useState<H1Problem | null>(null);
  const [problemIdx, setProblemIdx] = useState(0);
  const [layer, setLayer] = useState<string>("28");
  const [reduction, setReduction] = useState<"pca" | "umap">("pca");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const caches = useRef(new Map<string, Map<number, H1Problem>>());

  function getCache(l: string): Map<number, H1Problem> {
    if (!caches.current.has(l)) caches.current.set(l, new Map());
    return caches.current.get(l)!;
  }

  useEffect(() => {
    fetch("/api/h1loop/manifest/summary")
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(setSummary)
      .catch((e) => setError(`H1 data unavailable: ${e.message}`));
  }, []);

  useEffect(() => {
    if (!summary) return;
    if (!summary.available_layers.includes(layer)) {
      if (summary.available_layers.length === 0) {
        setError("No H1 data found. Run: python scripts/precompute_h1_cycles.py");
      } else {
        setError(
          `Layer ${layer} not available. Available: ${summary.available_layers.join(", ")}`,
        );
      }
      setLoading(false);
      return;
    }
    fetch(`/api/h1loop/manifest?layer=${layer}`)
      .then((r) => r.json())
      .then((m) => {
        setManifest(m);
        setError(null);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [summary, layer]);

  useEffect(() => {
    if (!manifest) return;
    const cache = getCache(layer);
    const cached = cache.get(problemIdx);
    if (cached) {
      setProblem(cached);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    fetch(`/api/h1loop/problem/${problemIdx}/lightweight?layer=${layer}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((p) => {
        cache.set(problemIdx, p);
        setProblem(p);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [manifest, problemIdx, layer]);

  const loadFiltrationData = useCallback(async () => {
    if (!problem || problem.distance_matrix_upper) return;
    try {
      const resp = await fetch(
        `/api/h1loop/problem/${problemIdx}/filtration?layer=${layer}`,
      );
      const data = await resp.json();
      const updated = {
        ...problem,
        distance_matrix_upper: data.distance_matrix_upper,
      };
      const cache = getCache(layer);
      cache.set(problemIdx, updated);
      setProblem(updated);
    } catch (e) {
      console.error("Failed to load filtration data:", e);
    }
  }, [problem, problemIdx, layer]);

  const navigate = useCallback(
    (delta: number) => {
      if (!manifest) return;
      const len = manifest.problems.length;
      setProblemIdx((i) => ((i + delta) % len + len) % len);
    },
    [manifest],
  );

  const goTo = useCallback(
    (idx: number) => {
      if (!manifest) return;
      setProblemIdx(Math.max(0, Math.min(idx, manifest.problems.length - 1)));
    },
    [manifest],
  );

  // --- Compare mode: fetch the other layer's problem alongside the active one ---
  const [compareLayer, setCompareLayer] = useState<string | null>(null);
  const [compareProblem, setCompareProblem] = useState<H1Problem | null>(null);

  useEffect(() => {
    if (!compareLayer || !manifest) {
      setCompareProblem(null);
      return;
    }
    const cache = getCache(compareLayer);
    const cached = cache.get(problemIdx);
    if (cached) {
      setCompareProblem(cached);
      return;
    }

    const controller = new AbortController();
    fetch(`/api/h1loop/problem/${problemIdx}/lightweight?layer=${compareLayer}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((p) => {
        cache.set(problemIdx, p);
        setCompareProblem(p);
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          console.warn(`Layer ${compareLayer} data not available:`, e);
      });
    return () => controller.abort();
  }, [compareLayer, problemIdx, manifest]);

  const toggleCompare = useCallback(() => {
    setCompareLayer((prev) => (prev ? null : layer === "28" ? "19" : "28"));
  }, [layer]);

  // --- Computed points based on reduction method ---
  const activePoints2d = problem
    ? reduction === "umap" && problem.umap_2d
      ? problem.umap_2d
      : problem.points_2d
    : null;
  const activePoints3d = problem
    ? reduction === "umap" && problem.umap_3d
      ? problem.umap_3d
      : problem.points_3d
    : null;
  const hasUmap = problem?.umap_2d != null;

  const comparePoints2d = compareProblem
    ? reduction === "umap" && compareProblem.umap_2d
      ? compareProblem.umap_2d
      : compareProblem.points_2d
    : null;
  const comparePoints3d = compareProblem
    ? reduction === "umap" && compareProblem.umap_3d
      ? compareProblem.umap_3d
      : compareProblem.points_3d
    : null;

  return {
    summary,
    manifest,
    problem,
    problemIdx,
    layer,
    reduction,
    loading,
    error,
    navigate,
    goTo,
    setLayer,
    setReduction,
    loadFiltrationData,
    activePoints2d,
    activePoints3d,
    hasUmap,
    totalProblems: manifest?.problems.length ?? 0,
    availableLayers: summary?.available_layers ?? [],
    compareProblem,
    compareLayer,
    toggleCompare,
    comparePoints2d,
    comparePoints3d,
  };
}
