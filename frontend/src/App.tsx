import { useCallback, useEffect, useRef } from "react";
import { useCanvasStore } from "./lib/store/canvas-store";
import { SubstrateCanvas } from "./components/canvas/SubstrateCanvas";
import { SubstrateWS } from "./lib/ws/client";

const API_BASE = `http://${window.location.hostname}:8080`;

export default function App() {
  const batchUpdateNodeData = useCanvasStore((s) => s.batchUpdateNodeData);
  const setGraphMeta = useCanvasStore((s) => s.setGraphMeta);
  const addNode = useCanvasStore((s) => s.addNode);
  const wsRef = useRef<SubstrateWS | null>(null);
  const initRef = useRef(false);

  const handleMessage = useCallback(
    (msg: Record<string, unknown>) => {
      if (msg.type === "stream_event") {
        const nodeId = msg.node_id as string;
        const payload = msg.payload as Record<string, unknown>;
        batchUpdateNodeData([[nodeId, payload]]);
      } else if (msg.type === "computation_result") {
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
      } else if (msg.type === "node_state_updated") {
        const nodeId = msg.node_id as string;
        const patch = msg.data_patch as Record<string, unknown>;
        batchUpdateNodeData([[nodeId, patch]]);
      }
    },
    [batchUpdateNodeData],
  );

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

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
            const proj = projResp.ok
              ? await projResp.json()
              : await (
                  await fetch(`${API_BASE}/api/projects`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      slug: `proj-${Date.now()}`,
                      display_name: "Default Project",
                    }),
                  })
                ).json();

            const graphResp = await fetch(`${API_BASE}/api/graphs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                project_id: proj.id,
                name: "Main Canvas",
              }),
            });
            const graph = await graphResp.json();
            graphId = graph.id;
          } catch (e) {
            console.error("Failed to create default graph:", e);
          }
        }
      }

      if (graphId) {
        localStorage.setItem("substrate:lastGraphId", graphId);
        try {
          await useCanvasStore.getState().loadGraph(graphId);
        } catch {
          setGraphMeta(graphId, 1);
          addNode({
            id: "prompt-1",
            type: "prompt_input",
            position: { x: 150, y: 100 },
            data: { config: { prompt: "" } },
          });
          addNode({
            id: "features-1",
            type: "feature_bars",
            position: { x: 150, y: 350 },
            data: {},
          });
        }
      }
    })();
  }, [setGraphMeta, addNode]);

  useEffect(() => {
    const ws = new SubstrateWS("demo");
    wsRef.current = ws;
    ws.onMessage(handleMessage);
    ws.connect();

    const handleComputeRequest = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      batchUpdateNodeData([[detail.node_id, { status: "computing" }]]);
      ws.send(detail);
    };
    window.addEventListener(
      "substrate:compute_request",
      handleComputeRequest,
    );

    return () => {
      window.removeEventListener(
        "substrate:compute_request",
        handleComputeRequest,
      );
      ws.disconnect();
    };
  }, [handleMessage, batchUpdateNodeData]);

  return (
    <div className="h-screen w-screen">
      <SubstrateCanvas />
    </div>
  );
}
