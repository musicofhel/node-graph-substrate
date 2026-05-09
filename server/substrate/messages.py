from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field


# --- Client → Server ---


class ComputeRequest(BaseModel):
    type: Literal["compute_request"] = "compute_request"
    request_id: str
    node_id: str
    inputs: dict[str, Any] = Field(default_factory=dict)


class ConfigUpdateMsg(BaseModel):
    type: Literal["config_update"] = "config_update"
    node_id: str
    config: dict[str, Any]


class Resubscribe(BaseModel):
    type: Literal["resubscribe"] = "resubscribe"
    subscriptions: list[dict[str, str]]


ClientMessage = Annotated[
    Union[ComputeRequest, ConfigUpdateMsg, Resubscribe],
    Field(discriminator="type"),
]


# --- Server → Client ---


class GraphLoaded(BaseModel):
    type: Literal["graph_loaded"] = "graph_loaded"
    graph_id: str
    version: int
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    manifests: list[dict[str, Any]]


class NodeStateUpdated(BaseModel):
    type: Literal["node_state_updated"] = "node_state_updated"
    node_id: str
    data_patch: dict[str, Any]


class StreamEvent(BaseModel):
    type: Literal["stream_event"] = "stream_event"
    node_id: str
    stream: str
    cursor: str
    payload: dict[str, Any]
    ts: float


class ComputationResult(BaseModel):
    type: Literal["computation_result"] = "computation_result"
    request_id: str
    node_id: str
    ok: bool
    outputs: dict[str, Any] | None = None
    error: str | None = None


class ErrorMsg(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str
    node_id: str | None = None


class ReplayGap(BaseModel):
    type: Literal["replay_gap"] = "replay_gap"
    node_id: str
    stream: str
    requested_from: str
    earliest_available: str
