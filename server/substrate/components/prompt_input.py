from __future__ import annotations

import random
from typing import Any

from substrate.registry import registry
from substrate.sdk import Component, NodeKind, Socket, SocketType

FEATURE_NAMES = [
    "H0_persistence_entropy",
    "H1_max_lifetime",
    "H0_total_persistence",
    "H0_n_features",
    "H1_persistence_entropy",
    "H1_n_features",
    "H2_n_features",
    "H2_total_persistence",
    "H2_persistence_entropy",
    "bridge_silhouette",
    "H0_ph_significance",
    "H1_ph_significance",
    "topological_sensitivity",
]


@registry.register
class PromptInputComponent(Component):
    type_id = "prompt_input"
    kind = NodeKind.COMPUTED
    label = "Prompt Input"
    category = "input"
    inputs = []
    outputs = [
        Socket("features_out", SocketType.FEATURES, "Features"),
    ]
    config_fields = [
        {"key": "prompt", "label": "Prompt", "type": "text", "default": ""},
    ]

    async def build(self, **inputs: Any) -> dict[str, Any]:
        prompt = self.config.get("prompt", "")
        features = {name: round(random.uniform(-2, 5), 4) for name in FEATURE_NAMES}
        return {
            "features": features,
            "prompt": prompt,
            "status": "stub",
        }
