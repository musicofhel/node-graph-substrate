export function computePSI(baseline: number[], current: number[], bins = 10): number {
  if (baseline.length < 2 || current.length < 2) return 0;

  const allVals = [...baseline, ...current];
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  if (min === max) return 0;

  const binWidth = (max - min) / bins;
  const EPSILON = 0.0001;

  const histogram = (arr: number[]): number[] => {
    const counts = new Array(bins).fill(0);
    for (const v of arr) {
      let idx = Math.floor((v - min) / binWidth);
      if (idx >= bins) idx = bins - 1;
      counts[idx]++;
    }
    return counts.map((c) => Math.max(c / arr.length, EPSILON));
  };

  const bHist = histogram(baseline);
  const cHist = histogram(current);

  let psi = 0;
  for (let i = 0; i < bins; i++) {
    psi += (cHist[i] - bHist[i]) * Math.log(cHist[i] / bHist[i]);
  }
  return psi;
}

export type DriftSeverity = "ok" | "warning" | "alert";

export function driftSeverity(psi: number): DriftSeverity {
  if (psi < 0.1) return "ok";
  if (psi < 0.25) return "warning";
  return "alert";
}
