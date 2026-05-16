import {
  type Edge,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import { create } from "zustand";
import { temporal } from "zundo";
import { shallow } from "zustand/shallow";
import { getLayoutedElements } from "../layout/elk-layout";

export interface CanvasState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;

  projectId: string | null;
  graphId: string | null;
  graphName: string | null;
  graphVersion: number;
  dirty: boolean;
  _serverNodeIds: Set<string>;
  _serverEdgeIds: Set<string>;

  starredPapers: Set<string>;
  flushCounter: number;

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  setSelectedNodeId: (id: string | null) => void;
  addNode: (node: Node) => void;
  removeNode: (id: string) => void;
  batchUpdateNodeData: (updates: [string, Record<string, unknown>][]) => void;
  loadGraph: (graphId: string) => Promise<void>;
  saveGraph: () => Promise<void>;
  setGraphMeta: (graphId: string, version: number, projectId?: string, graphName?: string) => void;
  toggleStar: (paperId: string) => void;
  flushUnstarred: () => void;
  autoLayout: () => Promise<void>;
}

const API_BASE = `http://${window.location.hostname}:8080`;

export const useCanvasStore = create<CanvasState>()(
  temporal(
    (set, get) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      projectId: null,
      graphId: null,
      graphName: null,
      graphVersion: 0,
      dirty: false,
      _serverNodeIds: new Set<string>(),
      _serverEdgeIds: new Set<string>(),
      starredPapers: new Set<string>(),
      flushCounter: 0,

      onNodesChange: (changes) => {
        set({
          nodes: applyNodeChanges(changes, get().nodes),
          dirty: true,
        });
      },

      onEdgesChange: (changes) => {
        set({
          edges: applyEdgeChanges(changes, get().edges),
          dirty: true,
        });
      },

      onConnect: (connection) => {
        set({
          edges: addEdge({ ...connection, type: "stale" }, get().edges),
          dirty: true,
        });
      },

      setSelectedNodeId: (id) => set({ selectedNodeId: id }),

      toggleStar: (paperId: string) => {
        const starred = new Set(get().starredPapers);
        if (starred.has(paperId)) starred.delete(paperId);
        else starred.add(paperId);
        set({ starredPapers: starred, dirty: true });
        const stateNode = get().nodes.find((n) => n.type === "r2_state");
        if (stateNode) {
          set({
            nodes: get().nodes.map((n) =>
              n.id === stateNode.id
                ? { ...n, data: { ...n.data, config: { starred_papers: [...starred] } } }
                : n,
            ),
          });
        }
      },

      flushUnstarred: () => {
        set({ flushCounter: get().flushCounter + 1 });
      },

      autoLayout: async () => {
        const graphIdBefore = get().graphId;
        const { nodes, edges } = get();
        const { nodes: laid } = await getLayoutedElements(nodes, edges);
        if (get().graphId !== graphIdBefore) return;
        set({ nodes: laid, dirty: true });
      },

      addNode: (node) => {
        set({ nodes: [...get().nodes, node], dirty: true });
      },

      removeNode: (id) => {
        set({
          nodes: get().nodes.filter((n) => n.id !== id),
          edges: get().edges.filter(
            (e) => e.source !== id && e.target !== id,
          ),
          dirty: true,
        });
      },

      batchUpdateNodeData: (updates) => {
        const map = new Map(updates);
        set({
          nodes: get().nodes.map((node) => {
            const patch = map.get(node.id);
            if (!patch) return node;
            return { ...node, data: { ...node.data, ...patch } };
          }),
        });
      },

      setGraphMeta: (graphId, version, projectId, graphName?) => {
        set({
          graphId,
          graphVersion: version,
          dirty: false,
          ...(projectId != null ? { projectId } : {}),
          ...(graphName != null ? { graphName } : {}),
        });
      },

      loadGraph: async (graphId: string) => {
        const resp = await fetch(`${API_BASE}/api/graphs/${graphId}`);
        if (!resp.ok) throw new Error(`Failed to load graph: ${resp.status}`);
        const data = await resp.json();

        const nodes: Node[] = data.nodes.map(
          (n: {
            id: string;
            type_id: string;
            position_x: number;
            position_y: number;
            width?: number;
            height?: number;
            config?: Record<string, unknown>;
          }) => ({
            id: n.id,
            type: n.type_id,
            position: { x: n.position_x, y: n.position_y },
            ...(n.width && n.height
              ? { width: n.width, height: n.height }
              : {}),
            data: { config: n.config || {} },
          }),
        );

        const edges: Edge[] = data.edges.map(
          (e: {
            id: string;
            source: string;
            target: string;
            source_handle?: string;
            target_handle?: string;
          }) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.source_handle,
            targetHandle: e.target_handle,
            type: "stale",
          }),
        );

        const stateNode = nodes.find((n: Node) => n.type === "r2_state");
        const cfg = stateNode?.data?.config as Record<string, unknown> | undefined;
        const savedStars = cfg?.starred_papers;
        const starredPapers = Array.isArray(savedStars) ? new Set<string>(savedStars as string[]) : new Set<string>();

        set({
          nodes,
          edges,
          projectId: data.project_id ?? get().projectId,
          graphId: data.id,
          graphName: data.name ?? null,
          graphVersion: data.current_version,
          dirty: false,
          _serverNodeIds: new Set(nodes.map((n: Node) => n.id)),
          _serverEdgeIds: new Set(edges.map((e: Edge) => e.id)),
          starredPapers,
          flushCounter: 0,
        });
      },

      saveGraph: async () => {
        const { graphId, graphVersion, nodes, edges, _serverNodeIds, _serverEdgeIds } = get();
        if (!graphId) return;

        const currentNodeIds = new Set(nodes.map((n) => n.id));
        const currentEdgeIds = new Set(edges.map((e) => e.id));

        const ops = [
          ...[..._serverNodeIds]
            .filter((id) => !currentNodeIds.has(id))
            .map((id) => ({ op: "remove_node", data: { id } })),
          ...[..._serverEdgeIds]
            .filter((id) => !currentEdgeIds.has(id))
            .map((id) => ({ op: "remove_edge", data: { id } })),
          ...nodes.map((n) => ({
            op: "upsert_node",
            data: {
              id: n.id,
              type_id: n.type || "unknown",
              position_x: n.position?.x ?? 0,
              position_y: n.position?.y ?? 0,
              width: n.width,
              height: n.height,
              config: n.data?.config || {},
            },
          })),
          ...edges.map((e) => ({
            op: "upsert_edge",
            data: {
              id: e.id,
              source: e.source,
              target: e.target,
              source_handle: e.sourceHandle,
              target_handle: e.targetHandle,
              data: {},
            },
          })),
        ];

        const resp = await fetch(`${API_BASE}/api/graphs/${graphId}/ops`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expected_version: graphVersion,
            ops,
            message: "Canvas save",
          }),
        });

        if (resp.status === 409) {
          const conflict = await resp.json();
          console.warn("Version conflict, reloading from server");
          await get().loadGraph(graphId);
          throw new Error(
            `Version conflict: server at v${conflict.detail.current_version}`,
          );
        }

        if (!resp.ok) throw new Error(`Save failed: ${resp.status}`);

        const result = await resp.json();
        set({
          graphVersion: result.version,
          dirty: false,
          _serverNodeIds: new Set(nodes.map((n) => n.id)),
          _serverEdgeIds: new Set(edges.map((e) => e.id)),
        });
      },
    }),
    {
      limit: 50,
      partialize: (state) => ({ nodes: state.nodes, edges: state.edges }),
      equality: (pastState, currentState) =>
        shallow(pastState, currentState),
    },
  ),
);
