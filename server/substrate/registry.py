from __future__ import annotations

import logging
from typing import Any

from substrate.sdk import Component, ComponentManifest

logger = logging.getLogger(__name__)


class ComponentRegistry:
    def __init__(self):
        self._registry: dict[str, type[Component]] = {}

    def register(self, cls: type[Component]) -> type[Component]:
        self._registry[cls.type_id] = cls
        logger.info("Registered component: %s", cls.type_id)
        return cls

    def get(self, type_id: str) -> type[Component] | None:
        return self._registry.get(type_id)

    def manifests(self) -> list[dict[str, Any]]:
        results = []
        for cls in self._registry.values():
            m = cls.manifest()
            results.append({
                "type_id": m.type_id,
                "kind": m.kind.value,
                "label": m.label,
                "category": m.category,
                "inputs": [{"id": s.id, "type": s.type.value, "label": s.label} for s in m.inputs],
                "outputs": [{"id": s.id, "type": s.type.value, "label": s.label} for s in m.outputs],
                "subscribed_streams": m.subscribed_streams,
                "config_fields": m.config_fields,
            })
        return results

    def create_instance(self, type_id: str, node_id: str, config: dict | None = None) -> Component | None:
        cls = self.get(type_id)
        if cls is None:
            return None
        return cls(node_id, config)


registry = ComponentRegistry()
