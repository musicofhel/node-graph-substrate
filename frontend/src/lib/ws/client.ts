import { useEventLogStore } from "../store/event-log-store";
import { useDriftStore } from "../store/drift-store";

export type WsStatus = "connected" | "reconnecting" | "disconnected";
type StatusHandler = (status: WsStatus) => void;
type MessageHandler = (msg: Record<string, unknown>) => void;
type BatchUpdateFn = (updates: [string, Record<string, unknown>][]) => void;

function extractNumericValues(payload: Record<string, unknown>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(payload)) {
    if (typeof val === "number" && key !== "prompt_id") {
      result[key] = val;
    } else if (key === "features" && typeof val === "object" && val !== null) {
      for (const [fk, fv] of Object.entries(val as Record<string, unknown>)) {
        if (typeof fv === "number") result[fk] = fv;
      }
    }
  }
  return result;
}

export class SubstrateWS {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Set<MessageHandler> = new Set();
  private statusListeners: Set<StatusHandler> = new Set();
  private _status: WsStatus = "disconnected";
  private reconnectDelay = 1000;
  private maxDelay = 10000;
  private shouldReconnect = true;

  private pending = new Map<string, Record<string, unknown>>();
  private rafScheduled = false;
  private rafId: number | null = null;
  private batchFn: BatchUpdateFn | null = null;
  private activeSubscriptions: { stream: string; node_id: string }[] = [];
  private lastIdByStream = new Map<string, string>();
  private lastFlushTs = 0;
  private throttleMs = 500;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(canvasId: string) {
    const wsBase =
      (import.meta.env?.VITE_WS_URL as string | undefined) ??
      `ws://${window.location.hostname}:8080`;
    this.url = `${wsBase}/ws/canvas/${canvasId}`;
  }

  enableRAFCoalescing(batchFn: BatchUpdateFn): void {
    this.batchFn = batchFn;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.attemptConnect();
  }

  private attemptConnect(): void {
    if (!this.shouldReconnect) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[WS] connected to", this.url);
      this.reconnectDelay = 1000;
      this.notifyStatus("connected");

      if (this.pending.size > 0) {
        if (this.rafId !== null) cancelAnimationFrame(this.rafId);
        const updates = Array.from(this.pending.entries());
        this.pending.clear();
        this.rafScheduled = false;
        this.rafId = null;
        if (updates.length > 0 && this.batchFn) {
          this.batchFn(updates);
        }
      }

      if (this.activeSubscriptions.length > 0) {
        const lastIds: Record<string, string> = {};
        for (const sub of this.activeSubscriptions) {
          const cursor = this.lastIdByStream.get(sub.stream);
          if (cursor) lastIds[sub.stream] = cursor;
        }
        if (Object.keys(lastIds).length > 0) {
          this.send({
            type: "subscribe_with_resume",
            subscriptions: this.activeSubscriptions,
            last_ids: lastIds,
          });
        } else {
          this.send({
            type: "resubscribe",
            subscriptions: this.activeSubscriptions,
          });
        }
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        useEventLogStore.getState().push({
          ts: Date.now(),
          type: (msg.type as string) ?? "unknown",
          stream: msg.stream as string | undefined,
          nodeId: msg.node_id as string | undefined,
          raw: msg,
        });

        if (msg.type === "stream_event" && typeof msg.cursor === "string" && typeof msg.stream === "string") {
          this.lastIdByStream.set(msg.stream, msg.cursor);
        }

        if (msg.type === "resumed") {
          console.log(`[WS] resumed: replayed ${msg.missed_count} missed events`);
          this.handlers.forEach((h) => h(msg));
          return;
        }

        // Drift store — MUST be before the linkforge/research bypass (early return below)
        const driftNodeId = msg.node_id as string | undefined;
        if (driftNodeId && (msg.type === "stream_event" || msg.type === "node_state_updated")) {
          const driftPayload = msg.type === "stream_event"
            ? (msg.payload as Record<string, unknown> | undefined)
            : (msg.data_patch as Record<string, unknown> | undefined);
          if (driftPayload) {
            const numericValues = extractNumericValues(driftPayload);
            if (Object.keys(numericValues).length > 0) {
              useDriftStore.getState().pushSample(driftNodeId, Date.now(), numericValues);
            }
          }
        }

        if (
          msg.type === "stream_event" &&
          typeof msg.stream === "string" &&
          (msg.stream.startsWith("linkforge:") || msg.stream.startsWith("topoconf:research:"))
        ) {
          this.handlers.forEach((h) => h(msg));
          return;
        }

        if (
          this.batchFn &&
          (msg.type === "stream_event" || msg.type === "node_state_updated")
        ) {
          const nodeId = msg.node_id as string;
          const payload =
            msg.type === "stream_event"
              ? (msg.payload as Record<string, unknown>)
              : (msg.data_patch as Record<string, unknown>);
          const existing = this.pending.get(nodeId) ?? {};
          this.pending.set(nodeId, { ...existing, ...payload });

          this.scheduleFlush();
          return;
        }

        this.handlers.forEach((h) => h(msg));
      } catch {
        console.warn("[WS] bad message", event.data);
      }
    };

    this.ws.onclose = () => {
      if (!this.shouldReconnect) return;
      this.notifyStatus("reconnecting");
      console.log(`[WS] reconnecting in ${this.reconnectDelay}ms`);
      setTimeout(() => this.attemptConnect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
    };

    this.ws.onerror = (err) => {
      console.error("[WS] error", err);
      this.ws?.close();
    };
  }

  private scheduleFlush(): void {
    if (this.throttleTimer !== null) return;
    const elapsed = Date.now() - this.lastFlushTs;
    if (elapsed >= this.throttleMs) {
      this.flushPending();
    } else {
      this.throttleTimer = setTimeout(() => {
        this.throttleTimer = null;
        this.flushPending();
      }, this.throttleMs - elapsed);
    }
  }

  private flushPending(): void {
    if (this.pending.size === 0) return;
    this.lastFlushTs = Date.now();
    const updates = Array.from(this.pending.entries());
    this.pending.clear();
    if (this.batchFn) {
      requestAnimationFrame(() => this.batchFn!(updates));
    }
  }

  get status(): WsStatus {
    return this._status;
  }

  private notifyStatus(s: WsStatus): void {
    this._status = s;
    this.statusListeners.forEach((h) => h(s));
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusListeners.add(handler);
    return () => this.statusListeners.delete(handler);
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  setSubscriptions(subs: { stream: string; node_id: string }[]): void {
    this.activeSubscriptions = subs;
  }

  send(data: Record<string, unknown>): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.notifyStatus("disconnected");
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.throttleTimer !== null) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.rafScheduled = false;
    this.pending.clear();
    this.ws?.close();
    this.ws = null;
  }
}
