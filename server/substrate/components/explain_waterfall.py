from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class ExplainWaterfallComponent(Component):
    type_id = "explain_waterfall"
    kind = NodeKind.SUBSCRIBER
    label = "Explain Waterfall"
    category = "scoring"
    inputs = []
    outputs = []
    subscribed_streams = ["topoconf:scoring:explain_result"]
    config_fields = []
