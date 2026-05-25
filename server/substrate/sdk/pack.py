from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

from substrate.sdk.ports import PortDef, PortRef


class StreamDef(BaseModel):
    name: str
    tier: Literal["realtime", "interactive", "background"]
    coalesce: str | dict[str, Any]
    retention_max_len: int = 10_000
    throttle_ms_override: int | None = None


class CanvasKindDef(BaseModel):
    id: str
    label: str
    default_seed: list[dict[str, Any]] = []
    palette_node_ids: list[str] = []
    has_runs: bool = False
    run_schema: dict[str, Any] | None = None


class NodeDef(BaseModel):
    type_id: str
    label: str
    category: str
    kind: Literal["computed", "subscriber", "state"]
    inputs: list[PortRef] = []
    outputs: list[PortRef] = []
    subscribed_streams: list[str] = []
    config_schema: dict[str, Any] | None = None
    persist_history: bool = False
    min_width: int = 200
    min_height: int = 80


class RestEndpointDef(BaseModel):
    id: str
    path: str
    method: Literal["GET", "POST"]
    cache_key: str


class DaemonDef(BaseModel):
    id: str
    heartbeat_stream: str
    heartbeat_interval_sec: int
    degraded_after_sec: int
    down_after_sec: int


class PackManifest(BaseModel):
    id: str
    version: str
    label: str
    description: str = ""
    accepts_runtime_range: str | None = None
    canvas_kinds: list[CanvasKindDef] = []
    nodes: list[NodeDef] = []
    ports: list[PortDef] = []
    streams: list[StreamDef] = []
    rest_endpoints: list[RestEndpointDef] = []
    daemon: DaemonDef | None = None
