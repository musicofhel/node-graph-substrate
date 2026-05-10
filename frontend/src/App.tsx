import { useCallback, useEffect, useRef } from "react";
import { useCanvasStore } from "./lib/store/canvas-store";
import { SubstrateCanvas } from "./components/canvas/SubstrateCanvas";
import { SubstrateWS } from "./lib/ws/client";
import { NODE_REGISTRY } from "./lib/nodes/registry";

const API_BASE = `http://${window.location.hostname}:8080`;

export default function App() {
  const batchUpdateNodeData = useCanvasStore((s) => s.batchUpdateNodeData);
  const setGraphMeta = useCanvasStore((s) => s.setGraphMeta);
  const addNode = useCanvasStore((s) => s.addNode);
  const wsRef = useRef<SubstrateWS | null>(null);

  const handleMessage = useCallback(
    (msg: Record<string, unknown>) => {
      if (msg.type === "computation_result") {
        const nodeId = msg.node_id as string;
        const ok = msg.ok as boolean;
        if (ok) {
          batchUpdateNodeData([
            [nodeId, { status: "idle", outputs: msg.outputs }],
          ]);
          const outputs = msg.outputs as Record<string, unknown> | undefined;
          if (outputs?.features) {
            const nodes = useCanvasStore.getState().nodes;
            const featureNodes = nodes.filter(
              (n) => n.type === "feature_bars",
            );
            const updates: [string, Record<string, unknown>][] =
              featureNodes.map((n) => [
                n.id,
                { features: outputs.features },
              ]);
            if (updates.length > 0) {
              batchUpdateNodeData(updates);
            }
          }
        } else {
          batchUpdateNodeData([[nodeId, { status: "error" }]]);
        }
      } else if (msg.type === "graph_loaded") {
        const version = msg.version as number;
        const graphId = msg.graph_id as string;
        useCanvasStore.getState().setGraphMeta(graphId, version);
      }
    },
    [batchUpdateNodeData],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      let graphId = params.get("graph");

      if (!graphId) {
        const cached = localStorage.getItem("substrate:lastGraphId");
        if (cached) {
          graphId = cached;
        } else {
          try {
            const projResp = await fetch(`${API_BASE}/api/projects`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                slug: "default",
                display_name: "Default Project",
              }),
            });
            if (cancelled) return;
            const proj = await projResp.json();
            if (cancelled) return;

            const graphResp = await fetch(`${API_BASE}/api/graphs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                project_id: proj.id,
                name: "Main Canvas",
              }),
            });
            if (cancelled) return;
            const graph = await graphResp.json();
            graphId = graph.id;
          } catch (e) {
            console.error("Failed to create default graph:", e);
          }
        }
      }

      if (cancelled) return;

      if (graphId) {
        localStorage.setItem("substrate:lastGraphId", graphId);
        let needsDefaults = false;
        try {
          await useCanvasStore.getState().loadGraph(graphId);
          if (cancelled) return;
          needsDefaults = useCanvasStore.getState().nodes.length === 0;
        } catch {
          needsDefaults = true;
        }

        if (cancelled) return;

        if (needsDefaults) {
          setGraphMeta(graphId, useCanvasStore.getState().graphVersion || 1);
          const defaultNodes = [
            { id: "prompt-1", type: "prompt_input", position: { x: 50, y: 150 }, data: { config: { prompt: "" } } },
            { id: "cloud-1", type: "hidden_state_cloud", position: { x: 350, y: 20 }, data: {} },
            { id: "features-1", type: "feature_bars", position: { x: 350, y: 350 }, data: {} },
            { id: "diagram-1", type: "persistence_diagram", position: { x: 700, y: 20 }, data: {} },
            { id: "gauge-1", type: "confidence_gauge", position: { x: 700, y: 350 }, data: {} },
            { id: "monitor-1", type: "bridge_monitor", position: { x: 1050, y: 20 }, data: {} },
            { id: "explain-1", type: "explain_waterfall", position: { x: 1050, y: 300 }, data: {} },
          ];
          for (const n of defaultNodes) addNode(n);

          const { onConnect } = useCanvasStore.getState();
          const edges = [
            { source: "prompt-1", target: "cloud-1", sourceHandle: "features_out", targetHandle: null },
            { source: "prompt-1", target: "features-1", sourceHandle: "features_out", targetHandle: "features_in" },
            { source: "prompt-1", target: "diagram-1", sourceHandle: "features_out", targetHandle: null },
            { source: "prompt-1", target: "gauge-1", sourceHandle: "features_out", targetHandle: null },
            { source: "prompt-1", target: "monitor-1", sourceHandle: "features_out", targetHandle: null },
            { source: "prompt-1", target: "explain-1", sourceHandle: "features_out", targetHandle: null },
          ];
          for (const e of edges) {
            onConnect({ ...e, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle });
          }

          try {
            await useCanvasStore.getState().saveGraph();
          } catch (e) {
            console.warn("Failed to persist default canvas:", e);
          }
        }

        wsRef.current?.disconnect();
        const ws = new SubstrateWS(graphId);
        wsRef.current = ws;
        ws.enableRAFCoalescing(batchUpdateNodeData);
        ws.onMessage(handleMessage);

        const subs = buildSubscriptions();
        ws.setSubscriptions(subs);

        ws.connect();
      }
    })();

    const handleComputeRequest = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!wsRef.current) {
        batchUpdateNodeData([[detail.node_id, { status: "error" }]]);
        return;
      }
      batchUpdateNodeData([[detail.node_id, { status: "computing" }]]);
      if (!wsRef.current.send(detail)) {
        batchUpdateNodeData([[detail.node_id, { status: "error" }]]);
      }
    };
    window.addEventListener("substrate:compute_request", handleComputeRequest);

    return () => {
      cancelled = true;
      window.removeEventListener("substrate:compute_request", handleComputeRequest);
      wsRef.current?.disconnect();
      wsRef.current = null;
    };
  }, [setGraphMeta, addNode, handleMessage, batchUpdateNodeData]);

  return (
    <div className="h-screen w-screen">
      <SubstrateCanvas />
    </div>
  );
}

function buildSubscriptions(): { stream: string; node_id: string }[] {
  const nodes = useCanvasStore.getState().nodes;
  const subs: { stream: string; node_id: string }[] = [];
  for (const node of nodes) {
    const def = NODE_REGISTRY[node.type ?? ""];
    if (def?.subscribesTo) {
      for (const stream of def.subscribesTo) {
        subs.push({ stream, node_id: node.id });
      }
    }
  }
  return subs;
}
