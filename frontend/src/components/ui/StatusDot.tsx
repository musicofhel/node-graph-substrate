export type WsStatus = "connected" | "reconnecting" | "disconnected";

const STATUS_STYLES: Record<WsStatus, { className: string; title: string }> = {
  connected: { className: "bg-green-500", title: "Connected" },
  reconnecting: {
    className: "bg-amber-500 animate-pulse",
    title: "Reconnecting...",
  },
  disconnected: { className: "bg-neutral-600", title: "No active connection" },
};

export function StatusDot({ status }: { status: WsStatus }) {
  const { className, title } = STATUS_STYLES[status];
  return <div className={`ml-3 h-2 w-2 rounded-full ${className}`} title={title} />;
}
