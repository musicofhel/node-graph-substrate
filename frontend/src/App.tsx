import { useCallback, useEffect, useRef, useState } from "react";
import type { Edge } from "@xyflow/react";
import { useCanvasStore } from "./lib/store/canvas-store";
import { useUIStore } from "./lib/store/ui-store";
import { SubstrateCanvas } from "./components/canvas/SubstrateCanvas";
import { TabBar } from "./components/canvas/TabBar";
import { SplitPane } from "./components/canvas/SplitPane";
import { PaperPool } from "./components/linkforge/PaperPool";
import type { PaperSummary } from "./components/linkforge/PaperCard";
import { SubstrateWS } from "./lib/ws/client";
import { NODE_REGISTRY, canvasTypeFromName } from "./lib/nodes/registry";
import { NodeDetailModal } from "./components/canvas/NodeDetailModal";

const API_BASE = `http://${window.location.hostname}:8080`;

const STREAM_TO_STAGE: Record<string, string> = {
  "linkforge:ingested": "ingested",
  "linkforge:extracted": "extracted",
  "linkforge:categorized": "categorized",
  "linkforge:embedded": "embedded",
  "linkforge:stored": "stored",
  "linkforge:chunked": "chunked",
  "linkforge:auto_related": "auto_related",
  "linkforge:research_bridged": "research_bridged",
  "linkforge:url_discovered": "url_discovered",
  "linkforge:completed": "completed",
};

const STAGE_ORDER = [
  "ingested", "extracted", "categorized", "embedded", "stored",
  "chunked", "auto_related", "research_bridged", "url_discovered", "completed",
];

const STAGE_HEIGHT = 62;
const GROUP_PAD_X = 16;
const GROUP_PAD_TOP = 40;
const GROUP_WIDTH = 250;
const GROUP_HEIGHT = GROUP_PAD_TOP + STAGE_ORDER.length * STAGE_HEIGHT + 16;
const GROUP_SPACING = 280;

function stageGridPos(stageIdx: number): { x: number; y: number } {
  return { x: GROUP_PAD_X, y: GROUP_PAD_TOP + stageIdx * STAGE_HEIGHT };
}

interface PaperTracker {
  queueId: string;
  columnIndex: number;
  stageNodes: Map<string, string>;
}

export default function App() {
  const batchUpdateNodeData = useCanvasStore((s) => s.batchUpdateNodeData);
  const setGraphMeta = useCanvasStore((s) => s.setGraphMeta);
  const addNode = useCanvasStore((s) => s.addNode);
  const projectId = useCanvasStore((s) => s.projectId);
  const graphId = useCanvasStore((s) => s.graphId);
  const graphName = useCanvasStore((s) => s.graphName);
  const currentCanvasType = canvasTypeFromName(graphName);
  const canvasSplitRatio = useUIStore((s) => s.canvasSplitRatio);
  const setCanvasSplitRatio = useUIStore((s) => s.setCanvasSplitRatio);
  const wsRef = useRef<SubstrateWS | null>(null);
  const paperTrackerRef = useRef(new Map<string, PaperTracker>());
  const columnCounterRef = useRef(0);
  const [showPool, setShowPool] = useState(false);
  const [livePapers, setLivePapers] = useState<PaperSummary[]>([]);

  const handleLinkforgeEvent = useCallback(
    (stream: string, payload: Record<string, unknown>) => {
      const stage = STREAM_TO_STAGE[stream];
      if (!stage) return;
      const queueId = String(payload.queue_id ?? "");
      if (!queueId) return;

      const groupId = `lf-group-${queueId}`;
      let tracker = paperTrackerRef.current.get(queueId);
      let isNewPaper = false;

      if (!tracker) {
        columnCounterRef.current++;
        tracker = { queueId, columnIndex: columnCounterRef.current, stageNodes: new Map() };
        paperTrackerRef.current.set(queueId, tracker);
        isNewPaper = true;
      }

      if (stage === "extracted" && typeof payload.title === "string") {
        batchUpdateNodeData([[groupId, { title: payload.title, queueId }]]);
      }

      if (tracker.stageNodes.has(stage)) {
        batchUpdateNodeData([[tracker.stageNodes.get(stage)!, { ...payload, _stage: stage }]]);
        return;
      }

      const nodeId = `lf-${queueId}-${stage}`;
      const stageIdx = STAGE_ORDER.indexOf(stage);
      const pos = stageGridPos(stageIdx);
      const edgeStyle = { stroke: "#525252", strokeWidth: 1 };
      const newEdges: Edge[] = [];

      if (stageIdx > 0) {
        const prevStage = STAGE_ORDER[stageIdx - 1];
        const prevNodeId = tracker.stageNodes.get(prevStage);
        if (prevNodeId) {
          newEdges.push({
            id: `lf-edge-${queueId}-${prevStage}-${stage}`,
            source: prevNodeId,
            target: nodeId,
            sourceHandle: "source-bottom",
            targetHandle: "target-top",
            type: "smoothstep",
            style: edgeStyle,
          });
        }
      }
      if (stageIdx < STAGE_ORDER.length - 1) {
        const nextStage = STAGE_ORDER[stageIdx + 1];
        const nextNodeId = tracker.stageNodes.get(nextStage);
        if (nextNodeId) {
          newEdges.push({
            id: `lf-edge-${queueId}-${stage}-${nextStage}`,
            source: nodeId,
            target: nextNodeId,
            sourceHandle: "source-bottom",
            targetHandle: "target-top",
            type: "smoothstep",
            style: edgeStyle,
          });
        }
      }

      const newNode = {
        id: nodeId,
        type: "lf_stage" as const,
        position: pos,
        parentId: groupId,
        extent: "parent" as const,
        data: { ...payload, _stage: stage },
      };

      useCanvasStore.setState((s) => {
        let nodes = s.nodes;
        if (isNewPaper) {
          nodes = nodes.map((n) =>
            n.type === "lf_pipeline_group"
              ? { ...n, position: { ...n.position, x: n.position.x + GROUP_SPACING } }
              : n
          );
          nodes = [...nodes, {
            id: groupId,
            type: "lf_pipeline_group",
            position: { x: 0, y: 0 },
            data: { title: `Paper #${queueId}`, queueId },
            style: { width: GROUP_WIDTH, height: GROUP_HEIGHT },
          } as unknown as typeof s.nodes[0]];
        }
        return {
          nodes: [...nodes, newNode],
          edges: newEdges.length > 0 ? [...s.edges, ...newEdges] : s.edges,
        };
      });
      tracker.stageNodes.set(stage, nodeId);

      if (paperTrackerRef.current.size > 30) {
        const oldest = paperTrackerRef.current.keys().next().value;
        const oldTracker = oldest != null ? paperTrackerRef.current.get(oldest) : undefined;
        if (oldest != null && oldTracker) {
          paperTrackerRef.current.delete(oldest);
          const removeIds = new Set(oldTracker.stageNodes.values());
          const oldGroupId = `lf-group-${oldest}`;
          removeIds.add(oldGroupId);
          useCanvasStore.setState((s) => ({
            nodes: s.nodes.filter((n) => !removeIds.has(n.id)),
            edges: s.edges.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target)),
          }));
        }
      }
    },
    [batchUpdateNodeData],
  );

  const connectGraph = useCallback(
    (gId: string) => {
      wsRef.current?.disconnect();
      const ws = new SubstrateWS(gId);
      wsRef.current = ws;
      ws.enableRAFCoalescing(batchUpdateNodeData);
      ws.onMessage(handleMessageRef.current);

      const subs = buildSubscriptions();
      ws.setSubscriptions(subs);
      ws.connect();
    },
    [batchUpdateNodeData],
  );

  const switchingRef = useRef<string | null>(null);

  const handleSwitchGraph = useCallback(
    async (newGraphId: string) => {
      if (newGraphId === useCanvasStore.getState().graphId) return;

      wsRef.current?.disconnect();
      wsRef.current = null;
      paperTrackerRef.current.clear();
      columnCounterRef.current = 0;
      switchingRef.current = newGraphId;

      localStorage.setItem("substrate:lastGraphId", newGraphId);
      await useCanvasStore.getState().loadGraph(newGraphId);

      if (switchingRef.current !== newGraphId) return;
      switchingRef.current = null;

      const state = useCanvasStore.getState();
      if (state.nodes.length === 0) {
        const cType = canvasTypeFromName(state.graphName);
        const R2_SEED = [
          { id: "r2-bridge-1", type: "r2_bridge", position: { x: 50, y: 50 }, data: {} },
          { id: "r2-coord-1", type: "r2_coordinator", position: { x: 550, y: 50 }, data: {} },
          { id: "r2-stats-1", type: "r2_stats", position: { x: 50, y: 500 }, data: {} },
          { id: "r2-autorel-1", type: "r2_autorel", position: { x: 550, y: 500 }, data: {} },
          { id: "r2-state-1", type: "r2_state", position: { x: -1000, y: -1000 }, data: { config: { starred_papers: [] } } },
        ];
        const RESEARCH_SEED = [
          { id: "research-bridge-1", type: "research_bridge", position: { x: 50, y: 50 }, data: {} },
          { id: "research-coord-1", type: "research_coordinator", position: { x: 50, y: 300 }, data: {} },
          { id: "lf-autorel-1", type: "lf_autorel", position: { x: 400, y: 50 }, data: {} },
          { id: "lf-stats-1", type: "lf_stats", position: { x: 400, y: 300 }, data: {} },
        ];
        const seeds = cType === "research2" ? R2_SEED : cType === "research" ? RESEARCH_SEED : null;
        if (seeds) {
          for (const n of seeds) addNode(n);
          try { await useCanvasStore.getState().saveGraph(); } catch {}
        }
      }

      connectGraph(newGraphId);
    },
    [connectGraph, addNode],
  );

  const handleMessage = useCallback(
    (msg: Record<string, unknown>) => {
      if (msg.type === "stream_event" && typeof msg.stream === "string") {
        const nodeId = msg.node_id as string;
        const payload = msg.payload as Record<string, unknown>;
        const stream = msg.stream;

        if (nodeId && nodeId !== "__linkforge__") {
          batchUpdateNodeData([[nodeId, payload]]);
        }

        if (stream.startsWith("linkforge:") && !stream.startsWith("linkforge:autorel:")) {
          const cType = canvasTypeFromName(useCanvasStore.getState().graphName);
          if (cType !== "research2") handleLinkforgeEvent(stream, payload);
          if (stream === "linkforge:completed") {
            setShowPool(true);
            const qid = String(payload.queue_id ?? "");
            setLivePapers((prev) => [{
              queue_id: qid,
              success: String(payload.success ?? ""),
              processing_time_ms: String(payload.processing_time_ms ?? ""),
              completed_at: String(payload.completed_at ?? ""),
              title: typeof payload.title === "string" ? payload.title : undefined,
              category: typeof payload.category === "string" ? payload.category : undefined,
              forge_score: typeof payload.forge_score === "string" ? payload.forge_score : undefined,
            }, ...prev].slice(0, 200));
          }
        }
        return;
      }
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
        const gId = msg.graph_id as string;
        useCanvasStore.getState().setGraphMeta(gId, version);
      }
    },
    [batchUpdateNodeData, handleLinkforgeEvent],
  );

  const handleMessageRef = useRef(handleMessage);
  handleMessageRef.current = handleMessage;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      let gId = params.get("graph");
      let projId: string | null = null;

      if (!gId) {
        const cached = localStorage.getItem("substrate:lastGraphId");
        if (cached) {
          gId = cached;
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
            projId = proj.id;
            if (cancelled) return;

            const graphResp = await fetch(`${API_BASE}/api/graphs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                project_id: proj.id,
                name: "Pipeline",
              }),
            });
            if (cancelled) return;
            const graph = await graphResp.json();
            gId = graph.id;
          } catch (e) {
            console.error("Failed to create default graph:", e);
          }
        }
      }

      if (cancelled) return;

      if (gId) {
        localStorage.setItem("substrate:lastGraphId", gId);
        let needsDefaults = false;
        try {
          await useCanvasStore.getState().loadGraph(gId);
          if (cancelled) return;
          if (!projId) projId = useCanvasStore.getState().projectId;
          needsDefaults = useCanvasStore.getState().nodes.length === 0;
        } catch {
          needsDefaults = true;
        }

        try {
          const histResp = await fetch(`${API_BASE}/api/linkforge/history?limit=1`);
          if (!cancelled && histResp.ok) {
            const hist = await histResp.json();
            if (hist.length > 0) setShowPool(true);
          }
        } catch {}

        if (cancelled) return;

        if (projId) {
          useCanvasStore.getState().setGraphMeta(
            gId,
            useCanvasStore.getState().graphVersion,
            projId,
          );
        }

        if (needsDefaults) {
          setGraphMeta(gId, useCanvasStore.getState().graphVersion || 1, projId ?? undefined);
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
          const edges: { source: string; target: string; sourceHandle: string | null; targetHandle: string | null }[] = [
            { source: "prompt-1", target: "cloud-1", sourceHandle: "features_out", targetHandle: "features_in" },
            { source: "prompt-1", target: "features-1", sourceHandle: "features_out", targetHandle: "features_in" },
            { source: "prompt-1", target: "diagram-1", sourceHandle: "features_out", targetHandle: "features_in" },
            { source: "prompt-1", target: "gauge-1", sourceHandle: "features_out", targetHandle: "features_in" },
            { source: "prompt-1", target: "monitor-1", sourceHandle: "features_out", targetHandle: "features_in" },
            { source: "prompt-1", target: "explain-1", sourceHandle: "features_out", targetHandle: "features_in" },
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

        connectGraph(gId);

        if (projId && !cancelled) {
          try {
            const graphsResp = await fetch(`${API_BASE}/api/projects/${projId}/graphs`);
            if (graphsResp.ok) {
              const allGraphs = await graphsResp.json();
              const RENAME_MAP: Record<string, string> = {
                "Main Canvas": "Pipeline",
                "Canvas 2": "Research",
              };
              for (const g of allGraphs) {
                const newName = RENAME_MAP[g.name];
                if (newName) {
                  try {
                    await fetch(`${API_BASE}/api/graphs/${g.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: newName }),
                    });
                    g.name = newName;
                  } catch {}
                }
              }

              const SEED_MAP: Record<string, { op: string; data: { id: string; type_id: string; position_x: number; position_y: number } }[]> = {
                research: [
                  { op: "upsert_node", data: { id: "research-bridge-1", type_id: "research_bridge", position_x: 50, position_y: 50 } },
                  { op: "upsert_node", data: { id: "research-coord-1", type_id: "research_coordinator", position_x: 50, position_y: 300 } },
                  { op: "upsert_node", data: { id: "lf-autorel-1", type_id: "lf_autorel", position_x: 400, position_y: 50 } },
                  { op: "upsert_node", data: { id: "lf-stats-1", type_id: "lf_stats", position_x: 400, position_y: 300 } },
                ],
                research2: [
                  { op: "upsert_node", data: { id: "r2-bridge-1", type_id: "r2_bridge", position_x: 50, position_y: 50 } },
                  { op: "upsert_node", data: { id: "r2-coord-1", type_id: "r2_coordinator", position_x: 550, position_y: 50 } },
                  { op: "upsert_node", data: { id: "r2-stats-1", type_id: "r2_stats", position_x: 50, position_y: 500 } },
                  { op: "upsert_node", data: { id: "r2-autorel-1", type_id: "r2_autorel", position_x: 550, position_y: 500 } },
                  { op: "upsert_node", data: { id: "r2-state-1", type_id: "r2_state", position_x: -1000, position_y: -1000 } },
                ],
              };

              for (const g of allGraphs) {
                if (g.id === gId) continue;
                const cType = canvasTypeFromName(g.name);
                const seedNodes = SEED_MAP[cType];
                if (!seedNodes) continue;

                const detail = await fetch(`${API_BASE}/api/graphs/${g.id}`);
                if (!detail.ok) continue;
                const gData = await detail.json();
                const existingNodeIds = new Set(
                  (gData.nodes ?? []).map((n: { id: string }) => n.id),
                );
                const missingOps = seedNodes.filter(
                  (op) => !existingNodeIds.has(op.data.id),
                );
                if (missingOps.length > 0) {
                  await fetch(`${API_BASE}/api/graphs/${g.id}/ops`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      expected_version: gData.current_version,
                      message: `Seed ${cType} nodes`,
                      ops: missingOps,
                    }),
                  });
                }
              }
            }
          } catch {}
        }
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
  }, [setGraphMeta, addNode, batchUpdateNodeData, connectGraph]);

  return (
    <div className="flex h-screen w-screen flex-col">
      <NodeDetailModal />
      <TabBar projectId={projectId} activeGraphId={graphId} onSelectGraph={handleSwitchGraph} />
      {showPool && currentCanvasType !== "research2" ? (
        <SplitPane
          ratio={canvasSplitRatio}
          onRatioChange={setCanvasSplitRatio}
          top={<SubstrateCanvas />}
          bottom={<PaperPool livePapers={livePapers} />}
        />
      ) : (
        <div className="relative min-h-0 flex-1">
          <SubstrateCanvas />
        </div>
      )}
    </div>
  );
}

const LINKFORGE_STREAMS = Object.keys(STREAM_TO_STAGE);

function buildSubscriptions(): { stream: string; node_id: string }[] {
  const nodes = useCanvasStore.getState().nodes;
  const subs: { stream: string; node_id: string }[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    const def = NODE_REGISTRY[node.type ?? ""];
    if (def?.subscribesTo) {
      for (const stream of def.subscribesTo) {
        subs.push({ stream, node_id: node.id });
        seen.add(stream);
      }
    }
  }
  for (const stream of LINKFORGE_STREAMS) {
    if (!seen.has(stream)) {
      subs.push({ stream, node_id: "__linkforge__" });
    }
  }
  return subs;
}
