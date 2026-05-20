from __future__ import annotations

import json
import random
import uuid
from typing import Any

from substrate.registry import registry
from substrate.sdk import Component, NodeKind, Socket, SocketType

FEATURE_NAMES = [
    "H0_persistence_entropy", "H1_max_lifetime", "H0_total_persistence",
    "H0_n_features", "H1_persistence_entropy", "H1_n_features",
    "H2_n_features", "H2_total_persistence", "H2_persistence_entropy",
    "bridge_silhouette", "H0_ph_significance", "H1_ph_significance",
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
        prompt = inputs.get("config", {}).get("prompt", "") or self.config.get("prompt", "")
        math_idx = inputs.get("config", {}).get("math_idx")
        run_id = uuid.uuid4().hex[:8]
        features = {name: round(random.uniform(-2, 5), 4) for name in FEATURE_NAMES}

        try:
            from substrate.main import redis_client
            if redis_client:
                payload: dict[str, Any] = {"command": "score", "prompt": prompt, "run_id": run_id}
                if math_idx is not None:
                    payload["math_idx"] = math_idx
                await redis_client.xadd(
                    "topoconf:control",
                    {"data": json.dumps(payload)},
                    maxlen=10000,
                    approximate=True,
                )
        except Exception:
            pass

        return {"features": features, "prompt": prompt, "run_id": run_id, "status": "stub"}
