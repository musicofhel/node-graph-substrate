from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class ConfidenceGaugeComponent(Component):
    type_id = "confidence_gauge"
    kind = NodeKind.SUBSCRIBER
    label = "Confidence Gauge"
    category = "scoring"
    inputs = []
    outputs = []
    subscribed_streams = ["topoconf:scoring:confidence_scored"]
    config_fields = []
