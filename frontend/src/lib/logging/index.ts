interface LogPayload {
  event: string;
  [key: string]: unknown;
}

const isEnabled =
  import.meta.env.DEV ||
  (typeof localStorage !== "undefined" &&
    localStorage.getItem("NGS_DEBUG") === "true");

function emit(
  level: "debug" | "info" | "warn" | "error",
  payload: LogPayload,
) {
  if (!isEnabled && level !== "error") return;
  const entry = { ts: new Date().toISOString(), level, ...payload };
  console[level]("[NGS]", entry);
}

export const log = {
  debug: (p: LogPayload) => emit("debug", p),
  info: (p: LogPayload) => emit("info", p),
  warn: (p: LogPayload) => emit("warn", p),
  error: (p: LogPayload) => emit("error", p),
};
