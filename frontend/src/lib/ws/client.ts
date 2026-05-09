type MessageHandler = (msg: Record<string, unknown>) => void;

export class SubstrateWS {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectDelay = 1000;
  private maxDelay = 10000;
  private shouldReconnect = true;

  constructor(canvasId: string) {
    const wsBase =
      (import.meta.env?.VITE_WS_URL as string | undefined) ??
      `ws://${window.location.hostname}:8080`;
    this.url = `${wsBase}/ws/canvas/${canvasId}`;
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
