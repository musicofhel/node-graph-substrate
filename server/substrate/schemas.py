from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    slug: str
    display_name: str


class ProjectResponse(BaseModel):
    id: str
    slug: str
    display_name: str
    created_at: str


class GraphCreate(BaseModel):
    project_id: str
    name: str
    kind: str = "pipeline"
    pack_id: str = "topo-confidence"


class NodeData(BaseModel):
    id: str
    type_id: str
    position_x: float
    position_y: float
    width: float | None = None
    height: float | None = None
    config: dict[str, Any] = Field(default_factory=dict)


class EdgeData(BaseModel):
    id: str
    source: str
    target: str
    source_handle: str | None = None
    target_handle: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class NodeOp(BaseModel):
    op: Literal["upsert_node", "remove_node", "upsert_edge", "remove_edge"]
    data: dict[str, Any] = Field(default_factory=dict)


class GraphOps(BaseModel):
    expected_version: int
    ops: list[NodeOp]
    message: str | None = None


class ConfigUpdate(BaseModel):
    config: dict[str, Any]


class GraphRename(BaseModel):
    name: str


class PackUpgrade(BaseModel):
    pack_versions: dict[str, str]
