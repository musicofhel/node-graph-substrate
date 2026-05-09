type MessageHandler = (msg: Record<string, unknown>) => void;
type BatchUpdateFn = (updates: [string, Record<string, unknown>][]) => void;

export class SubstrateWS {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectDelay = 1000;
  private maxDelay = 10000;
  private shouldReconnect = true;

  private pending = new Map<string, Record<string, unknown>>();
  private rafScheduled = false;
  private batchFn: BatchUpdateFn | null = null;

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
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

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

          if (!this.rafScheduled) {
            this.rafScheduled = true;
            requestAnimationFrame(() => {
              const updates = Array.from(this.pending.entries());
              this.pending.clear();
              this.rafScheduled = false;
              this.batchFn!(updates);
            });
          }
          return;
        }

        this.handlers.forEach((h) => h(msg));
      } catch {
        console.warn("[WS] bad message", event.data);
      }
    };

    this.ws.onclose = () => {
      if (!this.shouldReconnect) return;
      console.log(`[WS] reconnecting in ${this.reconnectDelay}ms`);
      setTimeout(() => this.attemptConnect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
    };

    this.ws.onerror = (err) => {
      console.error("[WS] error", err);
      this.ws?.close();
    };
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
  }
}
