let mockInstance: MockWebSocket | null = null;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  url: string;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    mockInstance = this;
    setTimeout(() => {
      if (this.onopen) this.onopen(new Event("open"));
    }, 0);
  }

  send(_data: string): void {}
  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  _injectMessage(data: Record<string, unknown>): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent("message", { data: JSON.stringify(data) }));
    }
  }
}

export function installWsMock(win: Cypress.AUTWindow): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (win as any).WebSocket = MockWebSocket;
}

export function sendWsMessage(data: Record<string, unknown>): boolean {
  if (mockInstance && mockInstance.onmessage) {
    mockInstance._injectMessage(data);
    return true;
  }
  return false;
}
