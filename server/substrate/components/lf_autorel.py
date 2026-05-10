from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class LfAutoRelComponent(Component):
    type_id = "lf_autorel"
    kind = NodeKind.SUBSCRIBER
    label = "AutoRel Status"
    category = "scoring"
    inputs = []
    outputs = []
    subscribed_streams = ["linkforge:autorel:sweep_completed"]
    config_fields = []
