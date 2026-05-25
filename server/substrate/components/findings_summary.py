from substrate.registry import registry
from substrate.sdk import Component, NodeKind


@registry.register
class FindingsSummaryComponent(Component):
    type_id = "findings_summary"
    kind = NodeKind.SUBSCRIBER
    label = "Findings Summary"
    category = "experiment"
    inputs = []
    outputs = []
    subscribed_streams = []
    config_fields = []
