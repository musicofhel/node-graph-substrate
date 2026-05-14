import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNodesData } from "@xyflow/react";
import { useCanvasStore } from "../../lib/store/canvas-store";
import { useUIStore } from "../../lib/store/ui-store";
import { NODE_REGISTRY } from "../../lib/nodes/registry";
import type { ConfigField } from "../../types/nodes";

const API_BASE = `http://${window.location.hostname}:8080`;

function FieldText({ field, value, onChange }: { field: ConfigField; value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocal(value); }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), 300);
  }, [onChange]);

  const handleBlur = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onChange(local);
  }, [local, onChange]);

  return (
    <input
      type="text"
      value={local}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={field.label}
      className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-blue-700"
    />
  );
}

function FieldNumber({ field, value, onChange }: { field: ConfigField; value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      min={field.min}
      max={field.max}
      step={field.step}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-blue-700"
    />
  );
}

function FieldBoolean({ value, onChange }: { field: ConfigField; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative h-5 w-9 rounded-full transition-colors ${value ? "bg-blue-700" : "bg-neutral-700"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${value ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}

function FieldSelect({ field, value, onChange }: { field: ConfigField; value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-blue-700"
    >
      {(field.options ?? []).map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function FieldSlider({ field, value, onChange }: { field: ConfigField; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={field.min ?? 0}
        max={field.max ?? 100}
        step={field.step ?? 1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1"
      />
      <span className="w-10 text-right text-[11px] font-mono text-neutral-400">{value}</span>
    </div>
  );
}

const ConfigFieldRow = memo(function ConfigFieldRow({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const handleChange = useCallback((v: unknown) => onChange(field.key, v), [field.key, onChange]);

  let input: React.ReactNode;
  switch (field.type) {
    case "text":
      input = <FieldText field={field} value={String(value ?? field.default ?? "")} onChange={handleChange as (v: string) => void} />;
      break;
    case "number":
      input = <FieldNumber field={field} value={Number(value ?? field.default ?? 0)} onChange={handleChange as (v: number) => void} />;
      break;
    case "boolean":
      input = <FieldBoolean field={field} value={Boolean(value ?? field.default ?? false)} onChange={handleChange as (v: boolean) => void} />;
      break;
    case "select":
      input = <FieldSelect field={field} value={String(value ?? field.default ?? "")} onChange={handleChange as (v: string) => void} />;
      break;
    case "slider":
      input = <FieldSlider field={field} value={Number(value ?? field.default ?? 0)} onChange={handleChange as (v: number) => void} />;
      break;
  }

  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-neutral-400">{field.label}</label>
      {input}
    </div>
  );
});

export function ConfigPanel() {
  const nodeId = useUIStore((s) => s.configPanelNodeId);
  const closeConfigPanel = useUIStore((s) => s.closeConfigPanel);
  const batchUpdateNodeData = useCanvasStore((s) => s.batchUpdateNodeData);
  const nodeData = useNodesData(nodeId ?? "");

  useEffect(() => {
    if (!nodeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeConfigPanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nodeId, closeConfigPanel]);

  // Auto-close if node is deleted
  useEffect(() => {
    if (nodeId && !nodeData) closeConfigPanel();
  }, [nodeId, nodeData, closeConfigPanel]);

  if (!nodeId || !nodeData) return null;

  const nodeType = nodeData.type ?? "";
  const def = NODE_REGISTRY[nodeType];
  const configFields = def?.configFields ?? [];
  const config = ((nodeData.data as Record<string, unknown>)?.config ?? {}) as Record<string, unknown>;

  const handleFieldChange = (key: string, value: unknown) => {
    const newConfig = { ...config, [key]: value };
    batchUpdateNodeData([[nodeId, { config: newConfig }]]);

    fetch(`${API_BASE}/api/nodes/${nodeId}/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: newConfig }),
    }).catch(() => {
      // Rollback on error — restore previous config
      batchUpdateNodeData([[nodeId, { config }]]);
    });
  };

  return (
    <div className="h-full bg-neutral-900 border-l border-neutral-800 flex flex-col">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <span className="text-xs font-semibold text-neutral-200">
          {def?.label ?? nodeType}
        </span>
        <button
          onClick={closeConfigPanel}
          className="text-neutral-500 hover:text-neutral-300 text-lg leading-none px-1"
        >
          &times;
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {configFields.length === 0 ? (
          <div className="text-[11px] text-neutral-600 text-center py-8">
            No configurable fields
          </div>
        ) : (
          configFields.map((field) => (
            <ConfigFieldRow
              key={field.key}
              field={field}
              value={config[field.key]}
              onChange={handleFieldChange}
            />
          ))
        )}
      </div>
    </div>
  );
}
