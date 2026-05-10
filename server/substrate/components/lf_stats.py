from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class LfStatsComponent(Component):
    type_id = "lf_stats"
    kind = NodeKind.SUBSCRIBER
    label = "Pipeline Stats"
    category = "scoring"
    inputs = []
    outputs = []
    subscribed_streams = ["linkforge:completed"]
    config_fields = []
