import { memo, useMemo, useState } from "react";
import { useNodesData } from "@xyflow/react";
import { useCanvasStore } from "../../lib/store/canvas-store";
import { useUIStore, type DetailTab } from "../../lib/store/ui-store";
import { useDriftStore, useNodeDrift } from "../../lib/store/drift-store";
import { NODE_REGISTRY } from "../../lib/pack-registry";
import { useNodeHistory, useNodeHistoryFields } from "../../lib/hooks/useNodeHistory";
import { useNodeStats } from "../../lib/hooks/useNodeStats";
import { TimeSeriesChart } from "../charts/TimeSeriesChart";
import { DistributionChart } from "../charts/DistributionChart";
import { StatsSummary } from "../charts/StatsSummary";
import type { ConfigField } from "../../types/nodes";

const TABS: { key: DetailTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "timeseries", label: "Series" },
  { key: "config", label: "Config" },
  { key: "drift", label: "Drift" },
];

const CATEGORY_COLORS: Record<string, string> = {
  input: "#6366f1",
  extraction: "#06b6d4",
  topology: "#8b5cf6",
  scoring: "#10b981",
};

interface Props {
  nodeId: string;
}

export const DetailPanel = memo(({ nodeId }: Props) => {
  const nodeData = useNodesData(nodeId);
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === nodeId));
  const setSelectedNodeId = useCanvasStore((s) => s.setSelectedNodeId);
  const activeTab = useUIStore((s) => s.detailPanelTab);
  const setTab = useUIStore((s) => s.setDetailTab);

  const nodeType = node?.type ?? "";
  const def = NODE_REGISTRY[nodeType];
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;

  if (!def) {
    return (
      <div className="flex h-full flex-col bg-neutral-950 p-4">
        <div className="text-xs text-neutral-500">Unknown node type: {nodeType}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
        <span className="text-sm font-medium text-neutral-100">{def.label}</span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: (CATEGORY_COLORS[def.category] ?? "#666") + "20", color: CATEGORY_COLORS[def.category] ?? "#666" }}
        >
          {def.category}
        </span>
        <button
          onClick={() => setSelectedNodeId(null)}
          className="ml-auto rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-neutral-800">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-blue-500 text-blue-400"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "overview" && <OverviewTab nodeId={nodeId} nodeType={nodeType} data={data} />}
        {activeTab === "timeseries" && <TimeSeriesTab nodeId={nodeId} nodeType={nodeType} />}
        {activeTab === "config" && <ConfigTab nodeId={nodeId} nodeType={nodeType} />}
        {activeTab === "drift" && <DriftTab nodeId={nodeId} nodeType={nodeType} />}
      </div>
    </div>
  );
});
DetailPanel.displayName = "DetailPanel";

// ─── OVERVIEW TAB ────────────────────────────────────────────────────────────

function OverviewTab({ nodeId, nodeType, data }: { nodeId: string; nodeType: string; data: Record<string, unknown> }) {
  switch (nodeType) {
    case "confidence_gauge":
      return <ConfidenceOverview data={data} nodeId={nodeId} />;
    case "feature_bars":
      return <FeatureBarsOverview data={data} />;
    case "bridge_monitor":
      return <BridgeOverview data={data} />;
    case "explain_waterfall":
      return <ExplainOverview data={data} />;
    case "hidden_state_cloud":
      return <CloudOverview data={data} />;
    case "persistence_diagram":
      return <PersistenceOverview data={data} />;
    case "prompt_input":
      return <PromptOverview data={data} />;
    default:
      return <GenericOverview data={data} />;
  }
}

function ConfidenceOverview({ data, nodeId }: { data: Record<string, unknown>; nodeId: string }) {
  const confidence = typeof data.confidence === "number" ? Math.max(0, Math.min(1, data.confidence)) : undefined;
  const mode = typeof data.mode === "string" ? data.mode : "—";
  const history = useDriftStore((s) => s.histories.get(nodeId));
  const lastTs = useDriftStore((s) => s.lastEventTs.get(nodeId));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-3xl font-bold font-mono" style={{ color: confidence !== undefined ? gaugeColor(confidence) : "#666" }}>
          {confidence !== undefined ? `${(confidence * 100).toFixed(1)}%` : "—"}
        </span>
        <div className="text-right text-[10px] text-neutral-500">
          <div>Mode: {mode}</div>
          {lastTs && <div>Updated: {new Date(lastTs).toLocaleTimeString()}</div>}
        </div>
      </div>
      <div className="text-[10px] text-neutral-400">{history?.length ?? 0} samples collected</div>
    </div>
  );
}

function FeatureBarsOverview({ data }: { data: Record<string, unknown> }) {
  const features = (data.features ?? {}) as Record<string, number>;
  const entries = Object.entries(features).sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));
  if (entries.length === 0) return <EmptyState text="No feature data" />;

  return (
    <div className="flex flex-col gap-1">
      <div className="mb-1 text-[10px] text-neutral-400">{entries.length} features</div>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-neutral-500">
            <th className="text-left font-normal pb-1">Feature</th>
            <th className="text-right font-normal pb-1">Value</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, val]) => (
            <tr key={name} className="text-neutral-300">
              <td className="py-0.5 truncate max-w-[200px]" title={name}>{name.replace(/_/g, " ")}</td>
              <td className="py-0.5 text-right font-mono">{val.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BridgeOverview({ data }: { data: Record<string, unknown> }) {
  const healthy = data.healthy as boolean | undefined;
  const crystallization = data.crystallization as number | undefined;
  const anomalyReason = data.anomaly_reason as string | null | undefined;
  const bridgeAtPos0 = (data.bridge_at_pos0 ?? {}) as Record<string, boolean>;
  const silByLayer = (data.silhouette_by_layer ?? {}) as Record<string, number>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={`h-4 w-4 rounded-full ${healthy ? "bg-emerald-500" : healthy === false ? "bg-red-500" : "bg-neutral-600"}`} />
        <span className="text-sm font-medium text-neutral-200">{healthy ? "HEALTHY" : healthy === false ? "ANOMALY" : "—"}</span>
        {crystallization !== undefined && (
          <span className="ml-auto text-[10px] text-neutral-400">Cryst: {crystallization.toFixed(3)}</span>
        )}
      </div>
      {anomalyReason && <div className="text-[10px] text-red-400">{anomalyReason}</div>}
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-neutral-500">
            <th className="text-left font-normal">Layer</th>
            <th className="text-left font-normal">Role</th>
            <th className="text-right font-normal">Silhouette</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(bridgeAtPos0).sort(([a], [b]) => Number(a) - Number(b)).map(([layer, isBridge]) => (
            <tr key={layer} className="text-neutral-300">
              <td className="py-0.5">L{layer}</td>
              <td className="py-0.5">{isBridge ? "bridge" : "core"}</td>
              <td className="py-0.5 text-right font-mono">{(silByLayer[layer] ?? 0).toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExplainOverview({ data }: { data: Record<string, unknown> }) {
  const features = (data.features ?? {}) as Record<string, { contribution: number; raw_value: number; scaled_value: number; coefficient: number }>;
  const confidence = data.confidence as number | undefined;
  const topContributor = data.top_contributor as string | undefined;
  const entries = Object.entries(features).sort(([, a], [, b]) => Math.abs(b.contribution) - Math.abs(a.contribution));

  if (entries.length === 0) return <EmptyState text="Requires calibration" />;

  return (
    <div className="flex flex-col gap-2">
      {confidence !== undefined && (
        <div className="text-[10px] text-neutral-400">Confidence: <span className="font-mono text-neutral-200">{(confidence * 100).toFixed(1)}%</span></div>
      )}
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-neutral-500">
            <th className="text-left font-normal pb-1">Feature</th>
            <th className="text-right font-normal pb-1">Raw</th>
            <th className="text-right font-normal pb-1">Scaled</th>
            <th className="text-right font-normal pb-1">Coeff</th>
            <th className="text-right font-normal pb-1">Contrib</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, feat]) => (
            <tr key={name} className={name === topContributor ? "text-amber-300" : "text-neutral-300"}>
              <td className="py-0.5 truncate max-w-[100px]" title={name}>{name.replace(/_/g, " ")}</td>
              <td className="py-0.5 text-right font-mono">{feat.raw_value?.toFixed(2)}</td>
              <td className="py-0.5 text-right font-mono">{feat.scaled_value?.toFixed(2)}</td>
              <td className="py-0.5 text-right font-mono">{feat.coefficient?.toFixed(3)}</td>
              <td className="py-0.5 text-right font-mono">{feat.contribution >= 0 ? "+" : ""}{feat.contribution.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CloudOverview({ data }: { data: Record<string, unknown> }) {
  const umap = data.umap_3d as number[][] | undefined;
  const clusters = data.clusters as number[] | undefined;
  const bridgeSil = data.bridge_silhouette as number | undefined;
  const pointCount = umap?.length ?? 0;
  const clusterCount = clusters ? new Set(clusters).size : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded bg-neutral-900 p-2">
          <div className="text-lg font-mono font-bold text-neutral-200">{pointCount}</div>
          <div className="text-[9px] text-neutral-500">Points</div>
        </div>
        <div className="rounded bg-neutral-900 p-2">
          <div className="text-lg font-mono font-bold text-neutral-200">{clusterCount}</div>
          <div className="text-[9px] text-neutral-500">Clusters</div>
        </div>
        <div className="rounded bg-neutral-900 p-2">
          <div className="text-lg font-mono font-bold text-neutral-200">{bridgeSil?.toFixed(3) ?? "—"}</div>
          <div className="text-[9px] text-neutral-500">Bridge Sil</div>
        </div>
      </div>
      {!umap && <EmptyState text="Waiting for hidden states" />}
    </div>
  );
}

function PersistenceOverview({ data }: { data: Record<string, unknown> }) {
  const h0 = (data.H0 ?? []) as number[][];
  const h1 = (data.H1 ?? []) as number[][];
  const h2 = (data.H2 ?? []) as number[][];
  const total = h0.length + h1.length + h2.length;

  const maxLifetime = useMemo(() => {
    let max = 0;
    for (const pairs of [h0, h1, h2]) {
      for (const [b, d] of pairs) {
        if (isFinite(d - b)) max = Math.max(max, d - b);
      }
    }
    return max;
  }, [h0, h1, h2]);

  if (total === 0) return <EmptyState text="Waiting for PH data" />;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded bg-neutral-900 p-2">
          <div className="text-sm font-mono font-bold text-blue-400">{h0.length}</div>
          <div className="text-[9px] text-neutral-500">H0</div>
        </div>
        <div className="rounded bg-neutral-900 p-2">
          <div className="text-sm font-mono font-bold text-cyan-400">{h1.length}</div>
          <div className="text-[9px] text-neutral-500">H1</div>
        </div>
        <div className="rounded bg-neutral-900 p-2">
          <div className="text-sm font-mono font-bold text-purple-400">{h2.length}</div>
          <div className="text-[9px] text-neutral-500">H2</div>
        </div>
        <div className="rounded bg-neutral-900 p-2">
          <div className="text-sm font-mono font-bold text-neutral-200">{maxLifetime.toFixed(3)}</div>
          <div className="text-[9px] text-neutral-500">Max Life</div>
        </div>
      </div>
    </div>
  );
}

function PromptOverview({ data }: { data: Record<string, unknown> }) {
  const prompt = typeof data.prompt === "string" ? data.prompt : "";
  const status = typeof data.status === "string" ? data.status : "idle";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${status === "computing" ? "bg-amber-400 animate-pulse" : status === "error" ? "bg-red-500" : "bg-emerald-500"}`} />
        <span className="text-[10px] text-neutral-400">{status}</span>
      </div>
      {prompt ? (
        <div className="rounded bg-neutral-900 p-2 text-xs text-neutral-300 whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto">
          {prompt}
        </div>
      ) : (
        <EmptyState text="No prompt set" />
      )}
    </div>
  );
}

function GenericOverview({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([k]) => k !== "status");
  if (entries.length === 0) return <EmptyState text="No data" />;

  return (
    <div className="flex flex-col gap-1 text-[10px]">
      {entries.slice(0, 20).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2">
          <span className="text-neutral-500 truncate">{k}</span>
          <span className="text-neutral-300 font-mono truncate max-w-[200px]">
            {typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 60)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── TIME SERIES TAB ─────────────────────────────────────────────────────────

function TimeSeriesTab({ nodeId, nodeType }: { nodeId: string; nodeType: string }) {
  const fields = useNodeHistoryFields(nodeId);
  const [selectedField, setSelectedField] = useState<string | null>(null);

  const snapshotTypes = ["explain_waterfall", "persistence_diagram"];
  if (snapshotTypes.includes(nodeType)) {
    return <EmptyState text="No continuous history — snapshot data" />;
  }
  if (nodeType === "prompt_input") {
    return <EmptyState text="No time-series data for input nodes" />;
  }

  if (fields.length === 0) {
    return <EmptyState text="Collecting samples..." />;
  }

  const primaryField = selectedField ?? getPrimaryField(nodeType, fields);

  return (
    <div className="flex flex-col gap-3">
      {/* Field selector */}
      <div className="flex flex-wrap gap-1">
        {fields.map((f) => (
          <button
            key={f}
            onClick={() => setSelectedField(f)}
            className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
              f === primaryField ? "bg-blue-900/50 text-blue-400" : "bg-neutral-800 text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {f.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      <FieldChart nodeId={nodeId} field={primaryField} nodeType={nodeType} />
    </div>
  );
}

function FieldChart({ nodeId, field, nodeType }: { nodeId: string; field: string; nodeType: string }) {
  const data = useNodeHistory(nodeId, field);
  const values = useMemo(() => data.map((d) => d.value), [data]);
  const stats = useNodeStats(values);

  const thresholds = useMemo(() => {
    if (nodeType === "confidence_gauge" && field === "confidence") {
      return [
        { value: 0.7, color: "#10b981", label: "high" },
        { value: 0.4, color: "#f59e0b", label: "low" },
      ];
    }
    return undefined;
  }, [nodeType, field]);

  const yDomain = useMemo((): [number, number] | undefined => {
    if (nodeType === "confidence_gauge" && field === "confidence") return [0, 1];
    return undefined;
  }, [nodeType, field]);

  return (
    <div className="flex flex-col gap-2">
      <TimeSeriesChart data={data} color="#3b82f6" thresholds={thresholds} yDomain={yDomain} />
      {stats && <StatsSummary stats={stats} label={field.replace(/_/g, " ")} />}
    </div>
  );
}

function getPrimaryField(nodeType: string, fields: string[]): string {
  const preferred: Record<string, string> = {
    confidence_gauge: "confidence",
    bridge_monitor: "bridge_silhouette",
    hidden_state_cloud: "bridge_silhouette",
    feature_bars: "H0_persistence_entropy",
  };
  const pref = preferred[nodeType];
  if (pref && fields.includes(pref)) return pref;
  return fields[0];
}

// ─── CONFIG TAB ──────────────────────────────────────────────────────────────

function ConfigTab({ nodeId, nodeType }: { nodeId: string; nodeType: string }) {
  const def = NODE_REGISTRY[nodeType];
  const fields = def?.configFields ?? [];
  const nodeData = useNodesData(nodeId);
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;
  const batchUpdate = useCanvasStore((s) => s.batchUpdateNodeData);

  if (fields.length === 0) {
    return <EmptyState text="No configurable fields" />;
  }

  const updateField = (key: string, value: unknown) => {
    batchUpdate([[nodeId, { [key]: value }]]);
  };

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => (
        <ConfigFieldEditor key={field.key} field={field} value={data[field.key] ?? field.default} onChange={(v) => updateField(field.key, v)} />
      ))}
    </div>
  );
}

function ConfigFieldEditor({ field, value, onChange }: { field: ConfigField; value: unknown; onChange: (v: unknown) => void }) {
  switch (field.type) {
    case "boolean":
      return (
        <label className="flex items-center justify-between">
          <span className="text-xs text-neutral-300">{field.label}</span>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-blue-500"
          />
        </label>
      );
    case "slider":
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-300">{field.label}</span>
            <span className="font-mono text-[10px] text-neutral-400">{Number(value ?? field.default ?? 0).toFixed(field.step && field.step < 1 ? 2 : 0)}</span>
          </div>
          <input
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 1}
            step={field.step ?? 0.01}
            value={Number(value ?? field.default ?? 0)}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-neutral-700 accent-blue-500"
          />
        </div>
      );
    case "select":
      return (
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-300">{field.label}</span>
          <select
            value={String(value ?? field.default ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      );
    case "text":
      return (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-300">{field.label}</span>
          <textarea
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-xs text-neutral-200 resize-none"
          />
        </div>
      );
    case "number":
      return (
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-300">{field.label}</span>
          <input
            type="number"
            value={Number(value ?? field.default ?? 0)}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right text-xs text-neutral-200"
          />
        </div>
      );
    default:
      return null;
  }
}

// ─── DRIFT TAB ───────────────────────────────────────────────────────────────

function DriftTab({ nodeId, nodeType }: { nodeId: string; nodeType: string }) {
  const drift = useNodeDrift(nodeId);
  const history = useDriftStore((s) => s.histories.get(nodeId));
  const baseline = useDriftStore((s) => s.baselines.get(nodeId));
  const baselineMode = useDriftStore((s) => s.baselineMode);
  const [expandedField, setExpandedField] = useState<string | null>(null);

  const noApplicable = ["explain_waterfall", "persistence_diagram", "prompt_input"];
  if (noApplicable.includes(nodeType)) {
    return <EmptyState text="Drift detection not applicable for this node type" />;
  }

  if (!drift) {
    const sampleCount = history?.length ?? 0;
    return <EmptyState text={`Collecting samples (${sampleCount}/20 minimum)`} />;
  }

  const entries = Object.entries(drift.fields).sort(([, a], [, b]) => b.psi - a.psi);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-neutral-400">Mode: <span className="text-neutral-200">{baselineMode}</span></span>
        <span className={`rounded px-1.5 py-0.5 ${drift.worst === "alert" ? "bg-red-900/50 text-red-400" : drift.worst === "warning" ? "bg-amber-900/50 text-amber-400" : "bg-emerald-900/50 text-emerald-400"}`}>
          {drift.worst.toUpperCase()}
        </span>
      </div>
      {entries.map(([field, info]) => (
        <div key={field}>
          <button
            onClick={() => setExpandedField(expandedField === field ? null : field)}
            className="flex w-full items-center justify-between rounded bg-neutral-900 px-2 py-1.5 text-[10px] hover:bg-neutral-800"
          >
            <span className="text-neutral-300">{field.replace(/_/g, " ")}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-neutral-400">{info.psi.toFixed(4)}</span>
              <span className={`h-2 w-2 rounded-full ${info.severity === "alert" ? "bg-red-500" : info.severity === "warning" ? "bg-amber-500" : "bg-emerald-500"}`} />
            </div>
          </button>
          {expandedField === field && (
            <div className="mt-1 pl-2">
              <DriftFieldDetail nodeId={nodeId} field={field} history={history ?? []} baseline={baseline} baselineMode={baselineMode} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DriftFieldDetail({
  nodeId: _nodeId,
  field,
  history,
  baseline,
  baselineMode,
}: {
  nodeId: string;
  field: string;
  history: { ts: number; values: Record<string, number> }[];
  baseline?: { samples: { ts: number; values: Record<string, number> }[] };
  baselineMode: string;
}) {
  const { baseVals, currVals } = useMemo(() => {
    let baseRecords: typeof history;
    let currRecords: typeof history;
    if (baselineMode === "snapshot" && baseline) {
      baseRecords = baseline.samples;
      currRecords = history;
    } else {
      const mid = Math.floor(history.length / 2);
      baseRecords = history.slice(0, mid);
      currRecords = history.slice(mid);
    }
    return {
      baseVals: baseRecords.map((r) => r.values[field]).filter((v): v is number => v !== undefined),
      currVals: currRecords.map((r) => r.values[field]).filter((v): v is number => v !== undefined),
    };
  }, [history, baseline, baselineMode, field]);

  if (baseVals.length < 5 || currVals.length < 5) {
    return <div className="text-[10px] text-neutral-500 py-1">Insufficient samples for distribution</div>;
  }

  return <DistributionChart baseline={baseVals} current={currVals} />;
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

function EmptyState({ text }: { text: string }) {
  return <div className="py-8 text-center text-xs text-neutral-500">{text}</div>;
}

function gaugeColor(v: number): string {
  if (v >= 0.7) return "#10b981";
  if (v >= 0.4) return "#f59e0b";
  return "#ef4444";
}
