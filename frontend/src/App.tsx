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
              body: JSON.stringify({ slug: "default", display_name: "Default Project" }),
            });
            const proj = projResp.ok
              ? await projResp.json()
              : { id: (await (await fetch(`${API_BASE}/api/projects`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ slug: `proj-${Date.now()}`, display_name: "Default Project" }),
                })).json()).id };

            const graphResp = await fetch(`${API_BASE}/api/graphs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ project_id: proj.id, name: "Main Canvas" }),
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
            id: "n1",
            type: "counter",
            position: { x: 250, y: 200 },
            data: { counter: 0 },
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
    return () => ws.disconnect();
  }, [handleMessage]);

  return (
    <div className="h-screen w-screen">
      <SubstrateCanvas />
    </div>
  );
}
