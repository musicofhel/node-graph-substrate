import { useState, useEffect, useCallback, useRef } from "react";
import { useExperimentStore } from "../store/experiment-store";

const API_BASE = `http://${window.location.hostname}:8080`;

export type ExperimentPoint = {
  idx: number;
  algorithm: string;
  layer: string;
  viz_type: "cloud" | "scatter";
  points_2d: number[];
  points_3d: number[];
  n_points: number;
  correctness: boolean;
  metadata: Record<string, unknown>;
};

export type AlgorithmProjection = {
  algorithm: string;
  layer: string;
  n_points: number;
  viz_type: "cloud" | "scatter";
  points_2d: number[][];
  points_3d: number[][];
  correctness: boolean[];
  metadata: Record<string, unknown>;
};

export type AlgorithmInfo = {
  name: string;
  label: string;
  description: string;
  available: boolean;
};

export type ExperimentManifest = {
  created: string;
  model: string;
  n_problems: number;
  algorithms: Record<string, { n_problems: number; compute_seconds: number }>;
};

export function useExperimentData() {
  const algorithmA = useExperimentStore((s) => s.algorithmA);
  const algorithmB = useExperimentStore((s) => s.algorithmB);
  const problemIdx = useExperimentStore((s) => s.problemIdx);
  const layer = useExperimentStore((s) => s.layer);

  const [algorithms, setAlgorithms] = useState<AlgorithmInfo[]>([]);
  const [manifest, setManifest] = useState<ExperimentManifest | null>(null);
  const [projA, setProjA] = useState<AlgorithmProjection | null>(null);
  const [projB, setProjB] = useState<AlgorithmProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cache = useRef(new Map<string, AlgorithmProjection>());

  useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      fetch(`${API_BASE}/api/experiments/algorithms`, { signal: ac.signal }).then((r) => r.json()),
      fetch(`${API_BASE}/api/experiments/manifest`, { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([algos, man]) => {
        setAlgorithms(algos);
        setManifest(man);
        setError(null);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(`Experiment data unavailable: ${e.message}`);
        }
      });
    return () => ac.abort();
  }, []);

  const fetchBatch = useCallback(
    async (algo: string, l: string, signal?: AbortSignal): Promise<AlgorithmProjection | null> => {
      const key = `${algo}:${l}`;
      const cached = cache.current.get(key);
      if (cached) return cached;

      try {
        const resp = await fetch(
          `${API_BASE}/api/experiments/algorithms/${algo}/all?layer=${l}`,
          { signal },
        );
        if (!resp.ok) return null;
        const data: AlgorithmProjection = await resp.json();
        cache.current.set(key, data);
        return data;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return null;
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    setLoading(true);
    const ac = new AbortController();

    Promise.all([
      fetchBatch(algorithmA, layer, ac.signal),
      fetchBatch(algorithmB, layer, ac.signal),
    ]).then(([a, b]) => {
      if (!ac.signal.aborted) {
        setProjA(a);
        setProjB(b);
        setLoading(false);
      }
    });

    return () => ac.abort();
  }, [algorithmA, algorithmB, layer, fetchBatch]);

  const totalProblems = projA?.n_points ?? projB?.n_points ?? 500;

  const navigate = useCallback(
    (delta: number) => {
      useExperimentStore.getState().setProblemIdx(
        ((useExperimentStore.getState().problemIdx + delta) % totalProblems + totalProblems) % totalProblems,
      );
    },
    [totalProblems],
  );

  const goTo = useCallback(
    (idx: number) => {
      useExperimentStore.getState().setProblemIdx(
        Math.max(0, Math.min(idx, totalProblems - 1)),
      );
    },
    [totalProblems],
  );

  return {
    algorithms,
    manifest,
    projA,
    projB,
    loading,
    error,
    navigate,
    goTo,
    totalProblems,
    algorithmA,
    algorithmB,
    problemIdx,
    layer,
  };
}

export type ROIExperiment = {
  id: string;
  pathway: string;
  roi: number;
  status: string;
  priority: string;
  what: string;
  cost: string;
  depends_on: string[];
  would_update: string[];
  blocked_by: string;
};

export function useExperimentROI(limit: number = 20) {
  const [experiments, setExperiments] = useState<ROIExperiment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`${API_BASE}/api/experiments/roi?limit=${limit}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((data) => {
        setExperiments(data);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setLoading(false);
      });
    return () => ac.abort();
  }, [limit]);

  return { experiments, loading };
}

export type FindingEntry = {
  id: string;
  headline: string;
  strength: string;
  strength_qualifier: string;
  key_auroc: number | null;
};

export function useFindings() {
  const [findings, setFindings] = useState<FindingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`${API_BASE}/api/experiments/findings`, { signal: ac.signal })
      .then((r) => r.json())
      .then((data) => {
        setFindings(data);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setLoading(false);
      });
    return () => ac.abort();
  }, []);

  return { findings, loading };
}
