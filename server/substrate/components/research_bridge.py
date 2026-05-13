from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class ResearchBridgeComponent(Component):
    type_id = "research_bridge"
    kind = NodeKind.SUBSCRIBER
    label = "Research Bridge"
    category = "input"
    inputs = []
    outputs = []
    subscribed_streams = ["linkforge:research_bridged"]
    config_fields = []
