import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { Edge } from "@xyflow/react";
import { ReactFlowProvider } from "@xyflow/react";
import { useCanvasStore } from "../../lib/store/canvas-store";
import { useUIStore } from "../../lib/store/ui-store";
import { SubstrateCanvas } from "../../components/canvas/SubstrateCanvas";
import { TabBar } from "../../components/canvas/TabBar";
import { SplitPane } from "../../components/canvas/SplitPane";
import { PaperPool } from "../../components/linkforge/PaperPool";
import type { PaperSummary } from "../../components/linkforge/PaperCard";
import { SubstrateWS } from "../../lib/ws/client";
import { NODE_REGISTRY, canvasTypeFromName } from "../../lib/pack-registry";
import { API_BASE } from "../../lib/api";
import { useSessionStore } from "../../features/workspace/useProjectSession";
import { computeEdgeStyleForStage } from "../../packs/link-forge/edge-styles";

if (import.meta.env.DEV) {
  (window as any).__canvasStore = useCanvasStore;
}

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

function CanvasPageInner() {
  const { projectId: urlProjectId, canvasId } = useParams();
  const navigate = useNavigate();

  const batchUpdateNodeData = useCanvasStore((s) => s.batchUpdateNodeData);
  const setGraphMeta = useCanvasStore((s) => s.setGraphMeta);
  const addNode = useCanvasStore((s) => s.addNode);
  const projectId = useCanvasStore((s) => s.projectId);
  const graphId = useCanvasStore((s) => s.graphId);
  const graphName = useCanvasStore((s) => s.graphName);
  const currentCanvasType = canvasTypeFromName(graphName);
  const nodeCount = useCanvasStore((s) => s.nodes.length);
  const wsStatus = useUIStore((s) => s.wsStatus);
  const canvasSplitRatio = useUIStore((s) => s.canvasSplitRatio);
  const setCanvasSplitRatio = useUIStore((s) => s.setCanvasSplitRatio);
  const wsRef = useRef<SubstrateWS | null>(null);
  const paperTrackerRef = useRef(new Map<string, PaperTracker>());
  const columnCounterRef = useRef(0);
  const [poolAvailable, setPoolAvailable] = useState(false);
  const [poolExpanded, setPoolExpanded] = useState(false);
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
      const edgeStyle = computeEdgeStyleForStage(stage, payload);
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
            type: "default",
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
            type: "default",
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
          nodes = [...nodes, {
            id: groupId,
            type: "lf_pipeline_group",
            position: { x: (tracker!.columnIndex - 1) * GROUP_SPACING, y: 0 },
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
      ws.onStatusChange((s) => useUIStore.getState().setWsStatus(s));

      const subs = buildSubscriptions();
      ws.setSubscriptions(subs);
      ws.connect();
    },
    [batchUpdateNodeData],
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
          if (cType === "ingestion") handleLinkforgeEvent(stream, payload);
          if (stream === "linkforge:completed") {
            setPoolAvailable(true);
            const qid = String(payload.queue_id ?? "");
            const stub = {
              queue_id: qid,
              success: String(payload.success ?? ""),
              processing_time_ms: String(payload.processing_time_ms ?? ""),
              completed_at: String(payload.completed_at ?? ""),
              title: typeof payload.title === "string" ? payload.title : undefined,
              category: typeof payload.category === "string" ? payload.category : undefined,
              forge_score: typeof payload.forge_score === "string" ? payload.forge_score : undefined,
            };
            setLivePapers((prev) => [stub, ...prev].slice(0, 200));
            if (!stub.title && qid) {
              fetch(`${API_BASE}/api/linkforge/paper/${qid}`)
                .then((r) => r.ok ? r.json() : null)
                .then((full) => {
                  if (!full) return;
                  setLivePapers((prev) =>
                    prev.map((p) => p.queue_id === qid ? { ...p, ...full, queue_id: qid } : p),
                  );
                })
                .catch(() => {});
            }
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

  // Main canvas load effect — fires on canvasId change (navigation)
  useEffect(() => {
    if (!canvasId) return;
    let cancelled = false;

    wsRef.current?.disconnect();
    wsRef.current = null;
    paperTrackerRef.current.clear();
    columnCounterRef.current = 0;

    (async () => {
      useSessionStore.getState().setActiveCanvas(canvasId);

      let needsDefaults = false;
      try {
        await useCanvasStore.getState().loadGraph(canvasId);
        if (cancelled) return;
        needsDefaults = useCanvasStore.getState().nodes.length === 0;
      } catch {
        needsDefaults = true;
      }

      try {
        const histResp = await fetch(`${API_BASE}/api/linkforge/history?limit=1`);
        if (!cancelled && histResp.ok) {
          const hist = await histResp.json();
          if (hist.length > 0) setPoolAvailable(true);
        }
      } catch {}

      if (cancelled) return;

      const state = useCanvasStore.getState();
      if (urlProjectId && state.graphId) {
        state.setGraphMeta(
          state.graphId,
          state.graphVersion,
          urlProjectId,
        );
      }

      if (needsDefaults) {
        const cType = canvasTypeFromName(state.graphName);
        const RESEARCH_SEED = [
          { id: "research-bridge-1", type: "research_bridge", position: { x: 50, y: 50 }, data: {} },
          { id: "research-coord-1", type: "research_coordinator", position: { x: 50, y: 300 }, data: {} },
          { id: "lf-autorel-1", type: "lf_autorel", position: { x: 400, y: 50 }, data: {} },
          { id: "lf-stats-1", type: "lf_stats", position: { x: 400, y: 300 }, data: {} },
        ];
        const EXPERIMENTS_SEED = [
          { id: "algo-sel-1", type: "algorithm_selector", position: { x: 50, y: 50 }, data: {} },
          { id: "exp-cloud-1", type: "experiment_cloud", position: { x: 350, y: 50 }, data: {} },
          { id: "findings-1", type: "findings_summary", position: { x: 50, y: 500 }, data: {} },
          { id: "exp-roi-1", type: "experiment_roi", position: { x: 400, y: 500 }, data: {} },
        ];

        if (cType === "scoring") {
          setGraphMeta(canvasId, state.graphVersion || 1, urlProjectId ?? undefined);
          const defaultNodes = [
            // Row group backgrounds (rendered first = behind content nodes)
            { id: "row-input", type: "row_label", position: { x: -20, y: -20 }, data: { label: "Input & Summary", color: "blue" }, style: { width: 1360, height: 360 }, selectable: false, draggable: false, connectable: false },
            { id: "row-topo", type: "row_label", position: { x: -20, y: 360 }, data: { label: "Topology & Health", color: "cyan" }, style: { width: 1360, height: 340 }, selectable: false, draggable: false, connectable: false },
            { id: "row-complex", type: "row_label", position: { x: -20, y: 700 }, data: { label: "Complex Visualizations", color: "purple" }, style: { width: 1360, height: 440 }, selectable: false, draggable: false, connectable: false },
            // Row 0 — Input & Summary
            { id: "prompt-1", type: "prompt_input", position: { x: 0, y: 0 }, data: { config: { prompt: "" } }, style: { width: 300 } },
            { id: "gauge-1", type: "confidence_gauge", position: { x: 320, y: 0 }, data: {}, style: { width: 300 } },
            { id: "features-1", type: "feature_bars", position: { x: 640, y: 0 }, data: {}, style: { width: 300 } },
            { id: "explain-1", type: "explain_waterfall", position: { x: 980, y: 0 }, data: {}, style: { width: 340 } },
            // Row 1 — Topology & Health
            { id: "cloud-1", type: "hidden_state_cloud", position: { x: 0, y: 380 }, data: {}, style: { width: 300 } },
            { id: "diagram-1", type: "persistence_diagram", position: { x: 320, y: 380 }, data: {}, style: { width: 300 } },
            { id: "monitor-1", type: "bridge_monitor", position: { x: 640, y: 380 }, data: {}, style: { width: 300 } },
            { id: "drift-1", type: "drift_matrix", position: { x: 980, y: 380 }, data: {}, style: { width: 300 } },
            // Row 2 — Complex Visualizations
            { id: "breathing-1", type: "breathing_heatmap", position: { x: 0, y: 720 }, data: {}, style: { width: 560 } },
            { id: "h1loop-1", type: "h1_loop", position: { x: 580, y: 720 }, data: {}, style: { width: 760 } },
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
            { source: "prompt-1", target: "breathing-1", sourceHandle: "features_out", targetHandle: "features_in" },
            { source: "prompt-1", target: "h1loop-1", sourceHandle: "features_out", targetHandle: "features_in" },
          ];
          for (const e of edges) {
            onConnect({ ...e, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle });
          }

          try { await useCanvasStore.getState().saveGraph(); } catch (e) {
            console.warn("Failed to persist default canvas:", e);
          }
        } else {
          const seeds = cType === "experiments" ? EXPERIMENTS_SEED : cType === "research-bridge" ? RESEARCH_SEED : null;
          if (seeds) {
            for (const n of seeds) addNode(n);
            try { await useCanvasStore.getState().saveGraph(); } catch {}
          }
        }
      }

      if (cancelled) return;
      connectGraph(canvasId);
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
      useUIStore.getState().setWsStatus("disconnected");
    };
  }, [canvasId, urlProjectId, setGraphMeta, addNode, batchUpdateNodeData, connectGraph]);

  // Seed other graphs in the project (runs once per projectId)
  const hasSeededProject = useRef<string | null>(null);
  useEffect(() => {
    const pid = projectId ?? urlProjectId;
    if (!pid || hasSeededProject.current === pid) return;
    hasSeededProject.current = pid;
    let cancelled = false;

    (async () => {
      try {
        const graphsResp = await fetch(`${API_BASE}/api/projects/${pid}/graphs`);
        if (!graphsResp.ok || cancelled) return;
        const allGraphs = await graphsResp.json();
        const RENAME_MAP: Record<string, string> = {
          "Main Canvas": "Scoring",
          "Pipeline": "Scoring",
          "Canvas 2": "Research Bridge",
          "Research": "Research Bridge",
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

        const hasIngestion = allGraphs.some((g: { name: string }) => canvasTypeFromName(g.name) === "ingestion");
        if (!hasIngestion) {
          try {
            const resp = await fetch(`${API_BASE}/api/graphs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ project_id: pid, name: "Ingestion" }),
            });
            if (resp.ok && !cancelled) {
              const graph = await resp.json();
              allGraphs.push(graph);
            }
          } catch {}
        }

        const SEED_MAP: Record<string, { op: string; data: { id: string; type_id: string; position_x: number; position_y: number } }[]> = {
          ingestion: [],
          "research-bridge": [
            { op: "upsert_node", data: { id: "research-bridge-1", type_id: "research_bridge", position_x: 50, position_y: 50 } },
            { op: "upsert_node", data: { id: "research-coord-1", type_id: "research_coordinator", position_x: 50, position_y: 300 } },
            { op: "upsert_node", data: { id: "lf-autorel-1", type_id: "lf_autorel", position_x: 400, position_y: 50 } },
            { op: "upsert_node", data: { id: "lf-stats-1", type_id: "lf_stats", position_x: 400, position_y: 300 } },
          ],
          experiments: [
            { op: "upsert_node", data: { id: "algo-sel-1", type_id: "algorithm_selector", position_x: 50, position_y: 50 } },
            { op: "upsert_node", data: { id: "exp-cloud-1", type_id: "experiment_cloud", position_x: 350, position_y: 50 } },
            { op: "upsert_node", data: { id: "findings-1", type_id: "findings_summary", position_x: 50, position_y: 500 } },
            { op: "upsert_node", data: { id: "exp-roi-1", type_id: "experiment_roi", position_x: 400, position_y: 500 } },
          ],
        };

        for (const g of allGraphs) {
          if (g.id === canvasId) continue;
          const cType = canvasTypeFromName(g.name);
          const seedNodes = SEED_MAP[cType];
          if (!seedNodes) continue;

          const detail = await fetch(`${API_BASE}/api/graphs/${g.id}`);
          if (!detail.ok || cancelled) continue;
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
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [projectId, urlProjectId, canvasId]);

  const handleNavigateToCanvas = useCallback(
    (newCanvasId: string) => {
      const pid = projectId ?? urlProjectId;
      if (pid) {
        navigate(`/p/${pid}/c/${newCanvasId}`);
      }
    },
    [navigate, projectId, urlProjectId],
  );

  return (
    <div className="flex h-full w-full flex-col">
      <TabBar projectId={projectId ?? urlProjectId ?? null} activeGraphId={canvasId ?? graphId} onSelectGraph={handleNavigateToCanvas} />
      {currentCanvasType === "ingestion" && nodeCount === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="text-center">
            <div className={`mx-auto mb-3 h-2 w-2 rounded-full ${wsStatus === "connected" ? "bg-emerald-500" : wsStatus === "reconnecting" ? "bg-amber-500 animate-pulse" : "bg-neutral-600"}`} />
            <p className="text-sm text-neutral-500">Waiting for papers.</p>
            <p className="mt-1 text-xs text-neutral-600">Ingestion daemon is idle.</p>
          </div>
        </div>
      ) : poolExpanded && currentCanvasType === "research-bridge" ? (
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
      {poolAvailable && currentCanvasType === "research-bridge" && (
        <button
          onClick={() => setPoolExpanded((v) => !v)}
          className="absolute bottom-2 right-2 z-50 rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 border border-neutral-700"
        >
          {poolExpanded ? "Hide Papers" : `Papers ▲`}
        </button>
      )}
    </div>
  );
}

export default function CanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasPageInner />
    </ReactFlowProvider>
  );
}
