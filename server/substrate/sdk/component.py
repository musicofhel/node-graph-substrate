from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from substrate.sdk.ports import NodeKind, Socket, SocketType


@dataclass
class ComponentManifest:
    type_id: str
    kind: NodeKind
    label: str
    category: str
    inputs: list[Socket]
    outputs: list[Socket]
    subscribed_streams: list[str]
    config_fields: list[dict[str, Any]]


class Component:
    type_id: str = ""
    kind: NodeKind = NodeKind.COMPUTED
    label: str = ""
    category: str = "input"
    inputs: list[Socket] = []
    outputs: list[Socket] = []
    subscribed_streams: list[str] = []
    config_fields: list[dict[str, Any]] = []

    def __init__(self, node_id: str, config: dict[str, Any] | None = None):
        self.node_id = node_id
        self.config = config or {}

    @classmethod
    def manifest(cls) -> ComponentManifest:
        return ComponentManifest(
            type_id=cls.type_id,
            kind=cls.kind,
            label=cls.label,
            category=cls.category,
            inputs=cls.inputs,
            outputs=cls.outputs,
            subscribed_streams=cls.subscribed_streams,
            config_fields=cls.config_fields,
        )

    async def on_init(self) -> None:
        pass

    async def build(self, **inputs: Any) -> dict[str, Any]:
        raise NotImplementedError

    async def on_event(self, stream: str, event: dict[str, Any]) -> None:
        pass

    async def on_config_change(self, config: dict[str, Any]) -> None:
        self.config = config

    async def on_destroy(self) -> None:
        pass
