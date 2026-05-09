from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class BridgeMonitorComponent(Component):
    type_id = "bridge_monitor"
    kind = NodeKind.SUBSCRIBER
    label = "Bridge Monitor"
    category = "scoring"
    inputs = []
    outputs = []
    subscribed_streams = ["topoconf:scoring:bridge_health"]
    config_fields = []
