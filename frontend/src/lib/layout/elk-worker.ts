import ELK from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

interface WorkerNode {
  id: string;
  width: number;
  height: number;
}

interface WorkerEdge {
  id: string;
  sources: string[];
  targets: string[];
}

interface LayoutRequest {
  id: number;
  nodes: WorkerNode[];
  edges: WorkerEdge[];
  options: Record<string, string>;
}

self.onmessage = async (event: MessageEvent<LayoutRequest>) => {
  const { id, nodes, edges, options } = event.data;

  try {
    const graph = {
      id: "root",
      layoutOptions: options,
      children: nodes,
      edges,
    };

    const layoutedGraph = await elk.layout(graph);

    const layoutedNodes = (layoutedGraph.children ?? []).map((child) => ({
      id: child.id,
      x: child.x ?? 0,
      y: child.y ?? 0,
    }));

    self.postMessage({ id, nodes: layoutedNodes });
  } catch (err) {
    self.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
