const TURBO: readonly [number, number, number][] = [
  [0.18995, 0.07176, 0.23217],
  [0.22500, 0.16354, 0.45096],
  [0.25107, 0.25237, 0.63374],
  [0.26816, 0.33825, 0.78420],
  [0.24363, 0.44337, 0.87274],
  [0.15844, 0.57020, 0.92159],
  [0.09267, 0.68163, 0.90686],
  [0.19659, 0.77670, 0.80600],
  [0.42778, 0.84914, 0.62290],
  [0.64362, 0.89460, 0.43702],
  [0.80396, 0.90063, 0.30151],
  [0.92563, 0.85788, 0.20764],
  [0.98163, 0.76417, 0.15490],
  [0.98680, 0.63825, 0.12116],
  [0.95099, 0.50430, 0.10376],
  [0.88254, 0.36950, 0.10244],
  [0.79270, 0.24184, 0.12047],
  [0.67539, 0.13712, 0.13747],
  [0.56324, 0.06614, 0.12454],
  [0.47960, 0.01583, 0.01055],
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function turboColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const idx = clamped * (TURBO.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, TURBO.length - 1);
  const frac = idx - lo;
  const r = Math.round(lerp(TURBO[lo][0], TURBO[hi][0], frac) * 255);
  const g = Math.round(lerp(TURBO[lo][1], TURBO[hi][1], frac) * 255);
  const b = Math.round(lerp(TURBO[lo][2], TURBO[hi][2], frac) * 255);
  return `rgb(${r},${g},${b})`;
}

export function cycleColor(rank: number, maxRank: number): string {
  if (maxRank <= 0) return turboColor(0.92);
  const t = 0.92 - (rank / maxRank) * 0.84;
  return turboColor(t);
}

export function cycleOpacity(rank: number): number {
  return Math.max(0.25, 0.9 - rank * 0.03);
}
