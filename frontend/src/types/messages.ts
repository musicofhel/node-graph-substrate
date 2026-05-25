export interface ComputeRequest {
  type: "compute_request";
  request_id: string;
  node_id: string;
  inputs: Record<string, unknown>;
}


export interface Resubscribe {
  type: "resubscribe";
  subscriptions: { node_id: string; stream: string }[];
}

export interface SubscribeWithResume {
  type: "subscribe_with_resume";
  subscriptions: { node_id: string; stream: string }[];
  last_ids: Record<string, string>;
}

export type ClientMessage = ComputeRequest | Resubscribe | SubscribeWithResume;

export interface GraphLoaded {
  type: "graph_loaded";
  graph_id: string;
  version: number;
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  manifests: Record<string, unknown>[];
}

export interface NodeStateUpdated {
  type: "node_state_updated";
  node_id: string;
  data_patch: Record<string, unknown>;
}

export interface StreamEvent {
  type: "stream_event";
  node_id: string;
  stream: string;
  cursor: string;
  payload: Record<string, unknown>;
  ts: number;
}

export interface ComputationResult {
  type: "computation_result";
  request_id: string;
  node_id: string;
  ok: boolean;
  outputs?: Record<string, unknown>;
  error?: string;
}

export interface ErrorMsg {
  type: "error";
  code: string;
  message: string;
  node_id?: string;
}

export interface ReplayGap {
  type: "replay_gap";
  stream: string;
  from_cursor: string;
  to_cursor: string;
  dropped: number;
}

export interface Resumed {
  type: "resumed";
  missed_count: number;
}

export type ServerMessage =
  | GraphLoaded
  | NodeStateUpdated
  | StreamEvent
  | ComputationResult
  | ErrorMsg
  | ReplayGap
  | Resumed;
