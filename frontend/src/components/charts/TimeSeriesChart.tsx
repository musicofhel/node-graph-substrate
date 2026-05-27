import { memo, useMemo, useState, useCallback, useRef } from "react";

interface Threshold {
  value: number;
  color: string;
  label?: string;
}

interface Props {
  data: { ts: number; value: number }[];
  color?: string;
  height?: number;
  thresholds?: Threshold[];
  yDomain?: [number, number];
}

const PADDING = { top: 12, right: 12, bottom: 24, left: 44 };

export const TimeSeriesChart = memo(({ data, color = "#3b82f6", height = 160, thresholds, yDomain }: Props) => {
  const [hover, setHover] = useState<{ x: number; y: number; ts: number; value: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const width = 380;

  const { plotW, plotH, xScale, yScale, pathD, yTicks, xTicks } = useMemo(() => {
    const pw = width - PADDING.left - PADDING.right;
    const ph = height - PADDING.top - PADDING.bottom;
    if (data.length === 0) return { plotW: pw, plotH: ph, xScale: () => 0, yScale: () => 0, pathD: "", yTicks: [], xTicks: [] };

    const tsMin = data[0].ts;
    const tsMax = data[data.length - 1].ts;
    const vals = data.map((d) => d.value);
    const [yMin, yMax] = yDomain ?? [Math.min(...vals), Math.max(...vals)];
    const yPad = (yMax - yMin) * 0.1 || 0.1;
    const yLo = yDomain ? yMin : yMin - yPad;
    const yHi = yDomain ? yMax : yMax + yPad;

    const xs = (ts: number) => PADDING.left + ((ts - tsMin) / (tsMax - tsMin || 1)) * pw;
    const ys = (v: number) => PADDING.top + (1 - (v - yLo) / (yHi - yLo || 1)) * ph;

    const d = data.map((p, i) => `${i === 0 ? "M" : "L"}${xs(p.ts).toFixed(1)},${ys(p.value).toFixed(1)}`).join("");

    const yt: number[] = [];
    const steps = 4;
    for (let i = 0; i <= steps; i++) yt.push(yLo + (i / steps) * (yHi - yLo));

    const xt: number[] = [];
    const xSteps = Math.min(4, data.length - 1);
    for (let i = 0; i <= xSteps; i++) xt.push(tsMin + (i / xSteps) * (tsMax - tsMin));

    return { plotW: pw, plotH: ph, xScale: xs, yScale: ys, pathD: d, yTicks: yt, xTicks: xt };
  }, [data, height, yDomain]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || data.length === 0) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const fraction = (mx - PADDING.left) / plotW;
      const idx = Math.round(fraction * (data.length - 1));
      const clamped = Math.max(0, Math.min(data.length - 1, idx));
      const pt = data[clamped];
      setHover({ x: xScale(pt.ts), y: yScale(pt.value), ts: pt.ts, value: pt.value });
    },
    [data, plotW, xScale, yScale],
  );

  const handleMouseLeave = useCallback(() => setHover(null), []);

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-neutral-500" style={{ height }}>
        Insufficient data ({data.length} sample{data.length !== 1 ? "s" : ""})
      </div>
    );
  }

  const gradId = `tsc-grad-${color.replace("#", "")}`;

  return (
    <svg
      ref={svgRef}
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="select-none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Y axis ticks */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PADDING.left} y1={yScale(v)} x2={width - PADDING.right} y2={yScale(v)} stroke="#333" strokeWidth={0.5} />
          <text x={PADDING.left - 4} y={yScale(v) + 3} fill="#666" fontSize={9} textAnchor="end">
            {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(v % 1 === 0 ? 0 : 2)}
          </text>
        </g>
      ))}

      {/* X axis ticks */}
      {xTicks.map((ts) => (
        <text key={ts} x={xScale(ts)} y={height - 4} fill="#666" fontSize={8} textAnchor="middle">
          {new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </text>
      ))}

      {/* Thresholds */}
      {thresholds?.map((t) => (
        <g key={t.value}>
          <line x1={PADDING.left} y1={yScale(t.value)} x2={width - PADDING.right} y2={yScale(t.value)} stroke={t.color} strokeWidth={1} strokeDasharray="4,3" />
          {t.label && (
            <text x={width - PADDING.right + 2} y={yScale(t.value) + 3} fill={t.color} fontSize={8}>
              {t.label}
            </text>
          )}
        </g>
      ))}

      {/* Area fill */}
      <path
        d={`${pathD}L${xScale(data[data.length - 1].ts).toFixed(1)},${PADDING.top + plotH}L${PADDING.left},${PADDING.top + plotH}Z`}
        fill={`url(#${gradId})`}
      />

      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />

      {/* Hover crosshair */}
      {hover && (
        <>
          <line x1={hover.x} y1={PADDING.top} x2={hover.x} y2={PADDING.top + plotH} stroke="#666" strokeWidth={0.5} strokeDasharray="2,2" />
          <circle cx={hover.x} cy={hover.y} r={3.5} fill={color} stroke="#fff" strokeWidth={1} />
          <rect x={hover.x - 28} y={hover.y - 18} width={56} height={14} rx={2} fill="var(--ngs-surface-raised)" stroke="#444" strokeWidth={0.5} />
          <text x={hover.x} y={hover.y - 8} fill="#eee" fontSize={9} textAnchor="middle">
            {hover.value.toFixed(3)}
          </text>
        </>
      )}
    </svg>
  );
});
TimeSeriesChart.displayName = "TimeSeriesChart";
