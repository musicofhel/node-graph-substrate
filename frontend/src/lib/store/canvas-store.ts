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
import { API_BASE } from "../api";
import { packManifests } from "../pack-registry";

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
  autoLayout: () => Promise<void>;
}

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
          }) => {
            const base = {
              id: n.id,
              type: n.type_id,
              position: { x: n.position_x, y: n.position_y },
              ...(n.width ? { width: n.width } : {}),
              ...(n.height ? { height: n.height } : {}),
              data: { config: n.config || {} },
            };
            if (n.type_id === "row_label") {
              return {
                ...base,
                selectable: false,
                draggable: false,
                connectable: false,
                style: { width: n.width, height: n.height },
              };
            }
            return {
              ...base,
              ...(n.width ? { style: { width: n.width } } : {}),
            };
          },
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
        });

        for (const pack of packManifests) {
          pack.onCanvasLoad?.();
        }
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
