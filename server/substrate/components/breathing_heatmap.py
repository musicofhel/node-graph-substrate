from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class BreathingHeatmapComponent(Component):
    type_id = "breathing_heatmap"
    kind = NodeKind.SUBSCRIBER
    label = "Layer Breathing Heatmap"
    category = "topology"
    inputs = []
    outputs = []
    subscribed_streams = ["topoconf:scoring:breathing_profile"]
    config_fields = []
